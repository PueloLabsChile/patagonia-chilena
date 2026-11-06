<?php
// Gestión de socios fundadores (panel interno gestion.html?g=TOKEN).
// Acceso: token de la tabla «gestores», o el enlace de un moderador administrador.
// GET  ?g=…                         → socios + datos del gestor
// POST {g, accion: guardar|agregar|confirmar|eliminar, …}
// POST {g, accion: crear_gestor|quitar_gestor|gestores, …}   (solo administrador)
require __DIR__ . '/_comun.php';

$g = (string)(entrada()['g'] ?? $_GET['g'] ?? '');
if (!token_valido($g)) error('Enlace de gestión no válido.', 401);
$db = db();
$q = $db->prepare('SELECT id, nombre, 0 admin FROM gestores WHERE token = ?'); $q->execute([$g]);
$yo = $q->fetch();
if (!$yo) { $q = $db->prepare('SELECT id, nombre, 1 admin FROM moderadores WHERE token = ? AND admin = 1'); $q->execute([$g]); $yo = $q->fetch(); }
if (!$yo) error('Enlace de gestión no válido.', 401);
$db->prepare('UPDATE gestores SET visto = ? WHERE token = ?')->execute([ahora(), $g]);

function anotar(string $accion, string $detalle): void {
    global $yo; db()->prepare('INSERT INTO bitacora (moderador, accion, detalle, creado) VALUES (?,?,?,?)')->execute(['gestión · ' . $yo['nombre'], $accion, $detalle, time()]);
}
function socio_por_id(int $id): array {
    $q = db()->prepare('SELECT * FROM socios WHERE id = ?'); $q->execute([$id]);
    $s = $q->fetch(); if (!$s) error('Esa persona ya no está en la lista.', 404); return $s;
}
/** Valida y normaliza los campos editables. */
function campos(array $d): array {
    $nombre = limpiar_texto((string)($d['nombre'] ?? ''), 80);
    $correo = strtolower(trim((string)($d['correo'] ?? '')));
    $comuna = (int)($d['comuna'] ?? 0);
    if (mb_strlen($nombre) < 3) error('El nombre debe tener al menos 3 letras.', 422);
    if (!filter_var($correo, FILTER_VALIDATE_EMAIL) || strlen($correo) > 120) error('Ese correo no parece válido.', 422);
    if ($comuna < 1101 || $comuna > 16305) error('Elige una comuna de la lista.', 422);
    $comp = monto_compromiso($d['compromiso'] ?? 0); if ($comp === null) error('El compromiso mínimo es de $1.000 al mes.', 422);
    $act = actividad_valida($d['actividad'] ?? '');
    return ['nombre' => $nombre, 'correo' => $correo, 'comuna' => $comuna, 'fundador' => !empty($d['fundador']) ? 1 : 0,
            'compromiso' => $comp ?: null, 'actividad' => $act, 'actividad_detalle' => $act ? (limpiar_texto((string)($d['actividad_detalle'] ?? ''), 80) ?: null) : null,
            'notas' => limpiar_texto((string)($d['notas'] ?? ''), 600) ?: null];
}
function siguiente_puesto(int $region): int {
    $q = db()->prepare('SELECT COALESCE(MAX(puesto), 0) + 1 FROM socios WHERE region = ? AND numero IS NOT NULL'); $q->execute([$region]);
    return (int)$q->fetchColumn();
}
/** Campos válidos pedidos desde el panel (en el orden del catálogo). */
function campos_pedidos(array $d): array {
    $c = array_values(array_intersect(array_keys(CAMPOS_DATOS), (array)($d['campos'] ?? [])));
    if (!$c) error('Elige al menos un dato para pedir.', 422);
    return $c;
}
/** Envía el recordatorio de confirmación y lo registra en la persona. */
function recordar(array $s): bool {
    [$enlace, $baja] = enlaces_socio($s);
    $ok = enviar_correo($s['correo'], 'Te falta confirmar tu inscripción en Patagonia Chilena', plantilla_correo($s['nombre'], $enlace, $baja, false, true));
    if ($ok) db()->prepare('UPDATE socios SET recordatorios = COALESCE(recordatorios, 0) + 1, recordado = ? WHERE id = ?')->execute([ahora(), $s['id']]);
    return $ok;
}
function correo_repetido(PDOException $e): void { if (str_contains($e->getMessage(), 'UNIQUE')) error('Ese correo ya está en la lista.', 409); throw $e; }

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $filas = $db->query('SELECT id, numero, nombre, correo, comuna, region, fundador, apodo, actividad, actividad_detalle, compromiso, notas, recordatorios, recordado, telefono, extra, solicitud, respondido,
                         creado, confirmado, suspendido, (SELECT COUNT(*) FROM socios s2 WHERE s2.ref = socios.codigo AND s2.numero IS NOT NULL) invitados
                         FROM socios ORDER BY numero IS NULL, numero, id')->fetchAll();
    foreach ($filas as &$f) foreach (['id', 'numero', 'comuna', 'region', 'fundador', 'compromiso', 'suspendido', 'invitados', 'recordatorios'] as $k) $f[$k] = $f[$k] === null ? null : (int)$f[$k];
    foreach ($filas as &$f) { $f['extra'] = $f['extra'] ? json_decode($f['extra'], true) : null; $f['solicitud'] = $f['solicitud'] ? json_decode($f['solicitud'], true) : null; }
    unset($f);
    responder(['ok' => true, 'yo' => ['nombre' => $yo['nombre'], 'admin' => (bool)$yo['admin']], 'socios' => $filas, 'actividades' => ACTIVIDADES, 'campos_datos' => CAMPOS_DATOS]);
}

solo_post();
$d = entrada();
$accion = (string)($d['accion'] ?? '');
$resp = ['ok' => true];
switch ($accion) {
    case 'guardar':
        $s = socio_por_id((int)($d['id'] ?? 0)); $c = campos($d);
        $region = intdiv($c['comuna'], 1000);
        $puesto = $s['puesto'];
        if ($s['numero'] && (int)$s['region'] !== $region) $puesto = siguiente_puesto($region);
        try {
            $db->prepare('UPDATE socios SET nombre=?, correo=?, comuna=?, region=?, puesto=?, fundador=?, compromiso=?, compromiso_fecha = CASE WHEN ? IS NOT compromiso THEN ? ELSE compromiso_fecha END,
                          actividad=?, actividad_detalle=?, notas=? WHERE id=?')
               ->execute([$c['nombre'], $c['correo'], $c['comuna'], $s['numero'] ? $region : null, $puesto, $c['fundador'], $c['compromiso'], $c['compromiso'], ahora(),
                          $c['actividad'], $c['actividad_detalle'], $c['notas'], $s['id']]);
        } catch (PDOException $e) { correo_repetido($e); }
        anotar('editar socio', ($s['numero'] ? 'n.º ' . $s['numero'] : 'pendiente') . ' · ' . $c['nombre']); break;
    case 'agregar':
        // alta manual: la persona queda confirmada con su número (no se le envía correo)
        $c = campos($d); $region = intdiv($c['comuna'], 1000);
        $db->exec('BEGIN IMMEDIATE');
        try {
            $n = (int)$db->query('SELECT COALESCE(MAX(numero), 0) + 1 FROM socios')->fetchColumn();
            $db->prepare('INSERT INTO socios (nombre, correo, comuna, fundador, token, codigo, creado, confirmado, numero, region, puesto, compromiso, compromiso_fecha, actividad, actividad_detalle, notas)
                          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
               ->execute([$c['nombre'], $c['correo'], $c['comuna'], $c['fundador'], aleatorio(24), codigo_invitacion(), ahora(), ahora(), $n, $region, siguiente_puesto($region),
                          $c['compromiso'], $c['compromiso'] ? ahora() : null, $c['actividad'], $c['actividad_detalle'], $c['notas']]);
            $db->exec('COMMIT');
        } catch (PDOException $e) { $db->exec('ROLLBACK'); correo_repetido($e); }
        $resp['numero'] = $n;
        anotar('agregar socio', 'n.º ' . $n . ' · ' . $c['nombre']); break;
    case 'confirmar':
        $s = socio_por_id((int)($d['id'] ?? 0));
        if ($s['numero']) error('Esta persona ya está confirmada.');
        $db->exec('BEGIN IMMEDIATE');
        $n = (int)$db->query('SELECT COALESCE(MAX(numero), 0) + 1 FROM socios')->fetchColumn();
        $region = intdiv((int)$s['comuna'], 1000);
        $db->prepare('UPDATE socios SET numero = ?, confirmado = ?, region = ?, puesto = ? WHERE id = ?')->execute([$n, ahora(), $region, siguiente_puesto($region), $s['id']]);
        $db->exec('COMMIT');
        $resp['numero'] = $n;
        anotar('confirmar a mano', 'n.º ' . $n . ' · ' . $s['nombre']); break;
    case 'eliminar':
        $s = socio_por_id((int)($d['id'] ?? 0));
        $db->prepare('DELETE FROM mensajes WHERE socio_id = ?')->execute([$s['id']]);
        $db->prepare('DELETE FROM votos WHERE socio_id = ?')->execute([$s['id']]);
        $db->prepare('DELETE FROM socios WHERE id = ?')->execute([$s['id']]);
        anotar('eliminar socio', ($s['numero'] ? 'n.º ' . $s['numero'] : 'pendiente') . ' · ' . $s['nombre']); break;
    case 'vista_previa':
        // cómo se verá el correo, con los datos de la primera persona elegida (o un ejemplo)
        $s = !empty($d['id']) ? socio_por_id((int)$d['id']) : ['nombre' => 'Camila', 'token' => 'ejemplo', 'confirmado' => null];
        [$enlace, $baja] = enlaces_socio($s);
        if (($d['tipo'] ?? '') === 'datos') {
            $campos = campos_pedidos($d);
            $html = plantilla_datos($s['nombre'], rtrim(cfg('sitio'), '/') . '/completar.html?t=' . $s['token'], $baja, limpiar_texto((string)($d['mensaje'] ?? ''), 600), array_map(fn($k) => CAMPOS_DATOS[$k][0], $campos));
            $asunto = '¿Nos ayudas con unos datos? · Patagonia Chilena';
        } else { $html = plantilla_correo($s['nombre'], $enlace, $baja, false, true); $asunto = 'Te falta confirmar tu inscripción en Patagonia Chilena'; }
        responder(['ok' => true, 'asunto' => $asunto, 'html' => $html]);
    case 'enviar':
        // envío por lotes de 100: devuelve los ids que quedan para que el panel siga enviando
        $tipo = (string)($d['tipo'] ?? '');
        if (!in_array($tipo, ['recordatorio', 'datos'], true)) error('Elige qué tipo de correo enviar.');
        $ids = array_values(array_unique(array_filter(array_map('intval', (array)($d['ids'] ?? [])))));
        if (!$ids) error('No hay destinatarios.');
        $uno = count($ids) === 1 && empty($d['lote']);
        $lote = array_slice($ids, 0, 100);
        $campos = $tipo === 'datos' ? campos_pedidos($d) : [];
        $mensaje = limpiar_texto((string)($d['mensaje'] ?? ''), 600);
        $ok = 0; $omitidos = 0; $mal = 0;
        $q = $db->prepare('SELECT * FROM socios WHERE id = ?');
        foreach ($lote as $id) {
            $q->execute([$id]); $s = $q->fetch();
            if (!$s) { $omitidos++; continue; }
            if ($tipo === 'recordatorio') {
                $reciente = $s['recordado'] && strtotime($s['recordado'] . ' UTC') > time() - ($uno ? 600 : 48 * 3600);
                if ($s['numero'] || $reciente || (!$uno && (int)$s['recordatorios'] >= 3)) { $omitidos++; continue; }
                recordar($s) ? $ok++ : $mal++;
            } else {
                $sol = $s['solicitud'] ? json_decode($s['solicitud'], true) : null;
                if ($sol && strtotime($sol['fecha'] . ' UTC') > time() - 600) { $omitidos++; continue; }   // evita dobles envíos
                [, $baja] = enlaces_socio($s);
                $enl = rtrim(cfg('sitio'), '/') . '/completar.html?t=' . $s['token'];
                if (enviar_correo($s['correo'], '¿Nos ayudas con unos datos? · Patagonia Chilena', plantilla_datos($s['nombre'], $enl, $baja, $mensaje, array_map(fn($k) => CAMPOS_DATOS[$k][0], $campos)))) {
                    $db->prepare('UPDATE socios SET solicitud = ?, respondido = NULL WHERE id = ?')->execute([json_encode(['campos' => $campos, 'mensaje' => $mensaje, 'fecha' => ahora(), 'por' => $yo['nombre']], JSON_UNESCAPED_UNICODE), $s['id']]);
                    $ok++;
                } else $mal++;
            }
        }
        anotar($tipo === 'datos' ? 'pedir datos' : 'recordatorio', $ok . ' enviados' . ($omitidos ? ", $omitidos omitidos" : '') . ($mal ? ", $mal con error" : '') . ($tipo === 'datos' ? ' · ' . implode(', ', $campos) : ''));
        $resp += ['enviados' => $ok, 'omitidos' => $omitidos, 'errores' => $mal, 'resto' => array_slice($ids, 100)]; break;
    case 'recordar':
        // un recordatorio a una persona pendiente (máximo uno cada 10 minutos)
        $s = socio_por_id((int)($d['id'] ?? 0));
        if ($s['numero']) error('Esta persona ya confirmó su correo.');
        if ($s['recordado'] && strtotime($s['recordado'] . ' UTC') > time() - 600) error('Ya se le envió un recordatorio hace menos de 10 minutos.', 429);
        if (!recordar($s)) error('No se pudo enviar el correo. Intenta de nuevo en unos minutos.', 502);
        anotar('recordatorio', $s['nombre'] . ' · ' . $s['correo']);
        $resp['enviados'] = 1; break;
    case 'recordar_todos':
        // a todas las personas pendientes: inscritas hace más de 1 hora, sin recordatorio en las últimas 48 horas y con menos de 3 recordatorios
        $lista = $db->prepare("SELECT * FROM socios WHERE numero IS NULL AND creado < ? AND COALESCE(recordatorios, 0) < 3 AND (recordado IS NULL OR recordado < ?) ORDER BY id LIMIT 150");
        $lista->execute([gmdate('Y-m-d H:i:s', time() - 3600), gmdate('Y-m-d H:i:s', time() - 48 * 3600)]);
        $ok = 0; $mal = 0;
        foreach ($lista->fetchAll() as $s) { recordar($s) ? $ok++ : $mal++; }
        $total = (int)$db->query('SELECT COUNT(*) FROM socios WHERE numero IS NULL')->fetchColumn();
        anotar('recordatorio a pendientes', $ok . ' enviados' . ($mal ? ', ' . $mal . ' con error' : ''));
        $resp += ['enviados' => $ok, 'errores' => $mal, 'pendientes' => $total]; break;
    case 'gestores': case 'crear_gestor': case 'quitar_gestor': case 'correo_gestor':
        if (!$yo['admin']) error('Solo el administrador puede manejar los accesos.', 403);
        if ($accion === 'crear_gestor') {
            $nombre = limpiar_texto((string)($d['nombre'] ?? ''), 60);
            if (mb_strlen($nombre) < 2) error('Escribe el nombre de la persona.', 422);
            $correoG = strtolower(trim((string)($d['correo'] ?? ''))); if ($correoG !== '' && !filter_var($correoG, FILTER_VALIDATE_EMAIL)) error('Ese correo no parece válido.', 422);
            $db->prepare('INSERT INTO gestores (nombre, token, creado, correo) VALUES (?,?,?,?)')->execute([$nombre, aleatorio(24), ahora(), $correoG ?: null]);
            anotar('dar acceso de gestión', $nombre);
        } elseif ($accion === 'correo_gestor') {
            $correoG = strtolower(trim((string)($d['correo'] ?? ''))); if (!filter_var($correoG, FILTER_VALIDATE_EMAIL)) error('Ese correo no parece válido.', 422);
            $db->prepare('UPDATE gestores SET correo = ? WHERE id = ?')->execute([$correoG, (int)($d['id'] ?? 0)]);
            anotar('correo de gestión', 'id ' . (int)($d['id'] ?? 0));
        } elseif ($accion === 'quitar_gestor') {
            $db->prepare('DELETE FROM gestores WHERE id = ?')->execute([(int)($d['id'] ?? 0)]);
            anotar('quitar acceso de gestión', 'id ' . (int)($d['id'] ?? 0));
        }
        $base = rtrim(cfg('sitio'), '/') . '/gestion.html?g=';
        $resp['gestores'] = array_map(fn($r) => ['id' => (int)$r['id'], 'nombre' => $r['nombre'], 'correo' => $r['correo'], 'enlace' => $base . $r['token'], 'visto' => $r['visto']],
                                      $db->query('SELECT id, nombre, correo, token, visto FROM gestores ORDER BY id')->fetchAll());
        responder($resp);
    default: error('Acción desconocida.');
}
invalidar_cache();
responder($resp);
