<?php
// Patagonia Chilena · utilidades comunes de la API (PHP 8.1+ con pdo_sqlite)
declare(strict_types=1);
ini_set('serialize_precision', '-1');   // JSON con decimales cortos (-45.5712, no -45.57119999999999)

$CFG = require __DIR__ . '/config.php';

function cfg(string $k, $defecto = null) { global $CFG; return $CFG[$k] ?? $defecto; }

function db(): PDO {
    static $pdo = null;
    if ($pdo) return $pdo;
    $ruta = cfg('db');
    // la base de inscritos jamás debe quedar dentro de una carpeta pública
    if (!cfg('dev') && preg_match('~/(public_html|www|htdocs)(/|$)~', str_replace(chr(92), '/', $ruta))) {
        http_response_code(500); header('Content-Type: text/plain; charset=utf-8');
        exit('Configuración insegura: la base de datos quedaría dentro de una carpeta pública. Ajusta «db» en api/config.php.');
    }
    if (!is_dir(dirname($ruta))) mkdir(dirname($ruta), 0750, true);
    $pdo = new PDO('sqlite:' . $ruta, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
    $pdo->exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA synchronous=NORMAL;');
    migrar($pdo);
    return $pdo;
}

function migrar(PDO $db): void {
    $db->exec('CREATE TABLE IF NOT EXISTS socios (
        id INTEGER PRIMARY KEY, nombre TEXT NOT NULL, correo TEXT NOT NULL UNIQUE, comuna INTEGER NOT NULL,
        fundador INTEGER NOT NULL DEFAULT 1, token TEXT NOT NULL UNIQUE, codigo TEXT NOT NULL UNIQUE, ref TEXT,
        numero INTEGER UNIQUE, creado TEXT NOT NULL, confirmado TEXT, ip TEXT, envios INTEGER NOT NULL DEFAULT 0, ultimo_envio TEXT)');
    $cols = array_column($db->query('PRAGMA table_info(socios)')->fetchAll(), 'name');
    foreach (['apodo TEXT', 'region INTEGER', 'puesto INTEGER', 'acreditado TEXT', 'visto INTEGER', 'palabra INTEGER',
              'suspendido INTEGER NOT NULL DEFAULT 0', 'ultimo_mensaje INTEGER', 'ultimo_aplauso INTEGER', 'compromiso INTEGER', 'compromiso_fecha TEXT', 'actividad TEXT', 'actividad_detalle TEXT', 'notas TEXT', 'recordatorios INTEGER NOT NULL DEFAULT 0', 'recordado TEXT', 'telefono TEXT', 'extra TEXT', 'solicitud TEXT', 'respondido TEXT'] as $c) {
        if (!in_array(explode(' ', $c)[0], $cols, true)) $db->exec("ALTER TABLE socios ADD COLUMN $c");
    }
    $db->exec('CREATE UNIQUE INDEX IF NOT EXISTS u_apodo ON socios(apodo COLLATE NOCASE) WHERE apodo IS NOT NULL');
    $db->exec('CREATE INDEX IF NOT EXISTS i_ref ON socios(ref)');
    $db->exec('CREATE INDEX IF NOT EXISTS i_visto ON socios(visto)');
    // puesto y región para quienes ya estaban confirmados
    if ((int)$db->query('SELECT COUNT(*) FROM socios WHERE numero IS NOT NULL AND puesto IS NULL')->fetchColumn() > 0) {
        $db->exec('UPDATE socios SET region = comuna / 1000 WHERE region IS NULL');
        $db->exec('UPDATE socios SET puesto = (SELECT COUNT(*) FROM socios s2 WHERE s2.numero IS NOT NULL AND s2.region = socios.region AND s2.numero <= socios.numero) WHERE numero IS NOT NULL AND puesto IS NULL');
    }
    $db->exec('CREATE TABLE IF NOT EXISTS mensajes (
        id INTEGER PRIMARY KEY, socio_id INTEGER NOT NULL, sala TEXT NOT NULL, texto TEXT NOT NULL, creado INTEGER NOT NULL,
        oculto INTEGER NOT NULL DEFAULT 0, denuncias INTEGER NOT NULL DEFAULT 0, moderador TEXT)');
    $db->exec('CREATE INDEX IF NOT EXISTS i_msj ON mensajes(sala, id)');
    $db->exec('CREATE TABLE IF NOT EXISTS denuncias (mensaje_id INTEGER, socio_id INTEGER, creado INTEGER, PRIMARY KEY (mensaje_id, socio_id))');
    $db->exec('CREATE TABLE IF NOT EXISTS aplausos (id INTEGER PRIMARY KEY, region INTEGER, puesto INTEGER, creado INTEGER)');
    $db->exec('CREATE TABLE IF NOT EXISTS votaciones (id INTEGER PRIMARY KEY, pregunta TEXT NOT NULL, opciones TEXT NOT NULL, abierta INTEGER NOT NULL DEFAULT 1, creado INTEGER, cerrada INTEGER)');
    $db->exec('CREATE TABLE IF NOT EXISTS votos (votacion_id INTEGER, socio_id INTEGER, opcion INTEGER, creado INTEGER, PRIMARY KEY (votacion_id, socio_id))');
    $db->exec('CREATE TABLE IF NOT EXISTS moderadores (id INTEGER PRIMARY KEY, nombre TEXT NOT NULL, token TEXT NOT NULL UNIQUE, correo TEXT, creado TEXT)');
    $db->exec('CREATE TABLE IF NOT EXISTS bitacora (id INTEGER PRIMARY KEY, moderador TEXT, accion TEXT, detalle TEXT, creado INTEGER)');
    $db->exec('CREATE TABLE IF NOT EXISTS gestores (id INTEGER PRIMARY KEY, nombre TEXT NOT NULL, token TEXT NOT NULL UNIQUE, creado TEXT, visto TEXT)');
    if (!in_array('correo', array_column($db->query('PRAGMA table_info(gestores)')->fetchAll(), 'name'), true)) $db->exec('ALTER TABLE gestores ADD COLUMN correo TEXT');
    $db->exec('CREATE TABLE IF NOT EXISTS accesos (ip TEXT, tipo TEXT, creado INTEGER)');
    // galería de fotos de terreno del Observatorio (aportes abiertos, licencia CC BY 4.0)
    $db->exec('CREATE TABLE IF NOT EXISTS fotos (
        id INTEGER PRIMARY KEY, archivo TEXT NOT NULL, w INTEGER, h INTEGER, lat REAL NOT NULL, lon REAL NOT NULL, rumbo REAL, altitud REAL,
        tomada TEXT, titulo TEXT, descripcion TEXT, autor TEXT NOT NULL, tema TEXT, origen TEXT, licencia TEXT NOT NULL DEFAULT \'CC BY 4.0\',
        creado TEXT NOT NULL, ip TEXT, token TEXT NOT NULL, reportes INTEGER NOT NULL DEFAULT 0, oculta INTEGER NOT NULL DEFAULT 0)');
    $db->exec('CREATE TABLE IF NOT EXISTS fotos_reportes (foto_id INTEGER, ip TEXT, motivo TEXT, creado TEXT, PRIMARY KEY (foto_id, ip))');
    // administrador: el único que ve la lista de socios con nombre y correo (por defecto, Gonzalo)
    if (!in_array('admin', array_column($db->query('PRAGMA table_info(moderadores)')->fetchAll(), 'name'), true)) {
        $db->exec('ALTER TABLE moderadores ADD COLUMN admin INTEGER NOT NULL DEFAULT 0');
        $db->exec("UPDATE moderadores SET admin = 1 WHERE nombre = 'Gonzalo'");
    }
}

function responder($datos, int $estado = 200): void {
    http_response_code($estado);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($datos, JSON_UNESCAPED_UNICODE);
    exit;
}
function error(string $msg, int $estado = 400): void { responder(['ok' => false, 'error' => $msg], $estado); }

function entrada(): array {
    static $d = null;
    if ($d === null) $d = json_decode(file_get_contents('php://input') ?: '{}', true) ?: [];
    return $d;
}
function solo_post(): void { if ($_SERVER['REQUEST_METHOD'] !== 'POST') error('Método no permitido', 405); }

function ahora(): string { return gmdate('Y-m-d H:i:s'); }
function aleatorio(int $bytes): string { return rtrim(strtr(base64_encode(random_bytes($bytes)), '+/', '-_'), '='); }
function codigo_invitacion(): string {
    $abc = 'abcdefghjkmnpqrstuvwxyz23456789'; $s = '';
    for ($i = 0; $i < 7; $i++) $s .= $abc[random_int(0, strlen($abc) - 1)];
    return $s;
}
function ip_hash(): string { return substr(hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? '') . cfg('sal')), 0, 24); }
function token_valido(string $t): bool { return (bool)preg_match('/^[A-Za-z0-9_-]{20,64}$/', $t); }

/** Socio confirmado a partir del token de la petición (o null). */
function socio_actual(?string $t = null): ?array {
    $t = $t ?? (string)(entrada()['t'] ?? $_GET['t'] ?? '');
    if (!token_valido($t)) return null;
    $q = db()->prepare('SELECT * FROM socios WHERE token = ? AND numero IS NOT NULL'); $q->execute([$t]);
    return $q->fetch() ?: null;
}
function exigir_socio(): array {
    $s = socio_actual();
    if (!$s) error('Necesitas tu enlace de socio para participar. Inscríbete o revisa tu correo.', 401);
    if ((int)$s['suspendido']) error('Tu participación en el chat está suspendida por la moderación.', 403);
    return $s;
}
function moderador_actual(): ?array {
    $m = (string)(entrada()['m'] ?? $_GET['m'] ?? '');
    if (!token_valido($m)) return null;
    $q = db()->prepare('SELECT * FROM moderadores WHERE token = ?'); $q->execute([$m]);
    return $q->fetch() ?: null;
}

/** Estado de la Asamblea según la fecha de config. */
function asamblea(): array {
    $a = cfg('asamblea', []);
    $ini = strtotime($a['inicio'] ?? '2026-12-05T19:00:00-03:00');
    $dur = (int)($a['duracion_min'] ?? 150) * 60;
    $t = time();
    $estado = $t < $ini ? 'antes' : ($t < $ini + $dur ? 'en_vivo' : 'despues');
    if (!empty($a['forzar_estado'])) $estado = $a['forzar_estado'];
    return ['titulo' => $a['titulo'] ?? 'Primera Asamblea Ciudadana', 'inicio' => gmdate('c', $ini), 'inicio_ts' => $ini,
            'estado' => $estado, 'video' => $a['video'] ?? '', 'caracter' => 'consultiva'];
}

/** Filtro básico de lenguaje: devuelve el texto con las palabras ofensivas tapadas. */
function filtrar(string $s): string {
    static $malas = ['weon', 'weón', 'hueon', 'huevón', 'conchetumare', 'ctm', 'csm', 'chucha', 'puta', 'puto', 'maricon', 'maricón',
                     'culiao', 'culiado', 'aweonao', 'aweonado', 'pico', 'raja', 'mierda', 'imbecil', 'imbécil', 'idiota', 'zorra', 'perra'];
    foreach ($malas as $m) $s = preg_replace('/\b' . preg_quote($m, '/') . '\b/iu', str_repeat('•', mb_strlen($m)), $s);
    return $s;
}
function limpiar_texto(string $s, int $max): string {
    $s = trim(preg_replace('/\s+/u', ' ', strip_tags($s)));
    return mb_substr($s, 0, $max);
}

/** Actividades que se pueden elegir al inscribirse (la clave se guarda; el texto se muestra). */
const ACTIVIDADES = [
    'oficio' => 'Oficio o técnico', 'profesional' => 'Profesional', 'especialista' => 'Especialista o investigador',
    'empresario' => 'Empresario o emprendedor', 'comercio' => 'Comercio', 'campo_mar' => 'Agricultura, ganadería o pesca',
    'publico' => 'Funcionario público', 'docente' => 'Docente o educador', 'salud' => 'Salud', 'arte' => 'Arte, cultura o comunicación',
    'estudiante' => 'Estudiante', 'cuidados' => 'Dueño/a de casa o cuidados', 'jubilado' => 'Jubilado/a', 'otro' => 'Otra actividad',
];
function actividad_valida($v): ?string { $v = (string)$v; return isset(ACTIVIDADES[$v]) ? $v : null; }

/** Monto mensual válido (0 = sin compromiso; mínimo $1.000, máximo $1.000.000) o null si no es válido. */
function monto_compromiso($v): ?int {
    $m = (int)$v;
    if ($m === 0) return 0;
    return ($m >= 1000 && $m <= 1000000) ? $m : null;
}
/** Datos adicionales que gestión puede pedir a los socios: clave → [pregunta, tipo u opciones]. */
const CAMPOS_DATOS = [
    'telefono'       => ['Teléfono o WhatsApp', 'telefono'],
    'actividad'      => ['Oficio, profesión o actividad', 'actividad'],
    'comuna'         => ['Comuna donde vives', 'comuna'],
    'nacimiento'     => ['Año de nacimiento', 'anio'],
    'comision'       => ['Comisión en la que te gustaría participar', ['Comunicaciones y difusión', 'Territorio y medio ambiente', 'Finanzas y aportes', 'Asuntos legales', 'Organización y eventos', 'Tecnología y datos', 'Educación', 'Aún no sé']],
    'disponibilidad' => ['Tiempo que podrías aportar al mes', ['1 a 2 horas', '3 a 5 horas', '6 a 10 horas', 'Más de 10 horas', 'Por ahora, ninguno']],
    'patagonia'      => ['Tu vínculo con la Patagonia', ['Vivo allí', 'Nací allí', 'Tengo familia allí', 'La he visitado', 'Aún no la conozco']],
    'habilidades'    => ['Conocimientos o habilidades que puedes aportar', 'largo'],
    'comentario'     => ['Un mensaje para el equipo', 'largo'],
];
/** Correo para pedir datos adicionales. */
function plantilla_datos(string $nombre, string $enlace, string $baja, string $mensaje, array $preguntas): string {
    $h = fn($s) => htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
    $n = $h(explode(' ', trim($nombre))[0]);
    $lista = implode('', array_map(fn($p) => '<li style="margin:0 0 6px">' . $h($p) . '</li>', $preguntas));
    $msg = $mensaje !== '' ? '<tr><td style="font:16px/1.6 Arial;color:#ffffff;padding:0 0 18px;border-left:3px solid #d52b1e;padding-left:14px">' . nl2br($h($mensaje)) . '</td></tr>' : '';
    return '<!doctype html><html><body style="margin:0;background:#071a45;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#071a45;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:520px;background:#0d2c6e;border-radius:18px;padding:36px 30px;color:#f8f6f0">
<tr><td style="font:600 13px Arial;letter-spacing:2px;color:#c6d6ee;text-transform:uppercase">Patagonia Chilena</td></tr>
<tr><td style="padding:18px 0 8px;font:400 30px Georgia,serif;color:#ffffff">' . $n . ', ¿nos ayudas con unos datos?</td></tr>
<tr><td style="font:16px/1.6 Arial;color:#cfe0e7;padding-bottom:18px">Estamos organizando la cooperativa y nos sirve conocerte un poco más. Toma menos de un minuto:</td></tr>
' . $msg . '
<tr><td style="font:15px/1.5 Arial;color:#e6eef8;padding-bottom:24px"><ul style="margin:0;padding-left:20px">' . $lista . '</ul></td></tr>
<tr><td><a href="' . $enlace . '" style="display:inline-block;background:#d52b1e;color:#ffffff;text-decoration:none;font:700 16px Arial;padding:15px 28px;border-radius:30px">Completar mis datos</a></td></tr>
<tr><td style="font:13px/1.6 Arial;color:#a3b3d1;padding-top:28px">Responder es voluntario. Tus datos solo los ve el equipo de gestión y nunca se publican de forma individual. <a href="' . $baja . '" style="color:#a3b3d1">Darme de baja y borrar mis datos</a>.</td></tr>
</table></td></tr></table></body></html>';
}

/** Límite de solicitudes por conexión y por hora (accesos por correo, etc.). */
function limite_ip(string $tipo, int $max): void {
    $db = db(); $ip = ip_hash();
    $db->prepare('DELETE FROM accesos WHERE creado < ?')->execute([time() - 86400]);
    $q = $db->prepare('SELECT COUNT(*) FROM accesos WHERE ip = ? AND tipo = ? AND creado > ?'); $q->execute([$ip, $tipo, time() - 3600]);
    if ((int)$q->fetchColumn() >= $max) error('Demasiados intentos desde esta conexión. Prueba en una hora.', 429);
    $db->prepare('INSERT INTO accesos (ip, tipo, creado) VALUES (?,?,?)')->execute([$ip, $tipo, time()]);
}
/** Enlaces del correo de un socio: [botón, darse de baja]. */
function enlaces_socio(array $s): array {
    $sitio = rtrim(cfg('sitio'), '/');
    return [$s['confirmado'] ? $sitio . '/?s=' . $s['token'] : $sitio . '/api/confirmar.php?t=' . $s['token'], $sitio . '/api/baja.php?t=' . $s['token']];
}
function invalidar_cache(): void { @unlink(sys_get_temp_dir() . '/pc_fondo_' . md5(cfg('db')) . '.json'); @unlink(sys_get_temp_dir() . '/pc_sala_' . md5(cfg('db')) . '.json'); @unlink(sys_get_temp_dir() . '/pc_estadisticas.json'); }

function enviar_correo(string $para, string $asunto, string $html): bool {
    if (cfg('dev')) {   // en desarrollo no se envían: se guardan en dev/correos/ para revisarlos
        $dir = __DIR__ . '/../dev/correos'; @mkdir($dir, 0775, true);
        @file_put_contents($dir . '/' . date('Ymd-His') . '-' . substr(md5($para . microtime()), 0, 6) . '.html', '<!-- Para: ' . htmlspecialchars($para) . ' | Asunto: ' . htmlspecialchars($asunto) . " -->\n" . $html);
        return true;
    }
    $de = cfg('correo_de');
    $cab = ['MIME-Version: 1.0', 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: 8bit',
            'From: Patagonia Chilena <' . $de . '>', 'Reply-To: ' . cfg('correo_contacto'), 'X-Mailer: patagoniachilena'];
    return @mail($para, '=?UTF-8?B?' . base64_encode($asunto) . '?=', $html, implode("\r\n", $cab), '-f' . $de);
}

function plantilla_correo(string $nombre, string $enlace, string $baja, bool $yaConfirmado, bool $recordatorio = false): string {
    $n = htmlspecialchars(explode(' ', trim($nombre))[0], ENT_QUOTES, 'UTF-8');
    $titulo = $yaConfirmado ? 'Aquí está tu acceso' : ($recordatorio ? 'Te falta un paso' : 'Confirma tu inscripción');
    $texto = $yaConfirmado
        ? 'Ya eras parte de Patagonia Chilena. Con este botón vuelves a ver tu número de socio fundador, tu asiento en la Asamblea y tu enlace para invitar.'
        : ($recordatorio
            ? 'Te inscribiste en Patagonia Chilena, pero tu correo aún no está confirmado. Confírmalo con un clic y recibirás tu número de socio fundador y tu asiento en la Asamblea.'
            : 'Gracias por sumarte. Falta un paso: confirma tu correo y recibirás tu número de socio fundador y tu asiento en la Asamblea.');
    $boton = $yaConfirmado ? 'Ver mi número' : 'Confirmar mi inscripción';
    return '<!doctype html><html><body style="margin:0;background:#071a45;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#071a45;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:520px;background:#0d2c6e;border-radius:18px;padding:36px 30px;color:#f8f6f0">
<tr><td style="font:600 13px Arial;letter-spacing:2px;color:#c6d6ee;text-transform:uppercase">Patagonia Chilena</td></tr>
<tr><td style="padding:18px 0 8px;font:400 30px Georgia,serif;color:#ffffff">' . $titulo . ', ' . $n . '</td></tr>
<tr><td style="font:16px/1.6 Arial;color:#cfe0e7;padding-bottom:26px">' . $texto . '</td></tr>
<tr><td><a href="' . $enlace . '" style="display:inline-block;background:#d52b1e;color:#ffffff;text-decoration:none;font:700 16px Arial;padding:15px 28px;border-radius:30px">' . $boton . '</a></td></tr>
<tr><td style="font:13px/1.6 Arial;color:#a3b3d1;padding-top:28px">Primera Asamblea Ciudadana: sábado 5 de diciembre, 19:00 horas, en patagoniadechile.cl/asamblea.html<br><br>Si no fuiste tú, ignora este correo. <a href="' . $baja . '" style="color:#a3b3d1">Darme de baja y borrar mis datos</a>.</td></tr>
</table></td></tr></table></body></html>';
}
