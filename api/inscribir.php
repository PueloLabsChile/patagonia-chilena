<?php
// POST {nombre, correo, comuna, fundador, acepto, sitio(trampa), ref} → envía el enlace de confirmación
require __DIR__ . '/_comun.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') responder(['ok' => false, 'error' => 'Método no permitido'], 405);
$d = json_decode(file_get_contents('php://input') ?: '{}', true) ?: [];

// trampa para bots: se responde como si todo estuviera bien
if (!empty($d['sitio'])) responder(['ok' => true]);

$nombre = trim(preg_replace('/\s+/u', ' ', strip_tags((string)($d['nombre'] ?? ''))));
$correo = strtolower(trim((string)($d['correo'] ?? '')));
$comuna = (int)($d['comuna'] ?? 0);
$fundador = !empty($d['fundador']) ? 1 : 0;
$ref = preg_replace('/[^a-z0-9]/', '', strtolower((string)($d['ref'] ?? ''))) ?: null;
$compromiso = monto_compromiso($d['compromiso'] ?? 0);
if ($compromiso === null) responder(['ok' => false, 'error' => 'El compromiso mensual mínimo es de $1.000.'], 422);

if (mb_strlen($nombre) < 3 || mb_strlen($nombre) > 80) responder(['ok' => false, 'error' => 'Escribe tu nombre (3 a 80 letras).'], 422);
if (!filter_var($correo, FILTER_VALIDATE_EMAIL) || strlen($correo) > 120) responder(['ok' => false, 'error' => 'Ese correo no parece válido.'], 422);
if ($comuna < 1101 || $comuna > 16305) responder(['ok' => false, 'error' => 'Elige tu comuna de la lista.'], 422);
if (empty($d['acepto'])) responder(['ok' => false, 'error' => 'Debes aceptar la política de privacidad.'], 422);

$db = db();
$ip = ip_hash();
$hace1h = gmdate('Y-m-d H:i:s', time() - 3600);
$q = $db->prepare('SELECT COUNT(*) FROM socios WHERE ip = ? AND creado > ?'); $q->execute([$ip, $hace1h]);
if ((int)$q->fetchColumn() >= (int)cfg('max_por_ip_hora')) responder(['ok' => false, 'error' => 'Demasiadas inscripciones desde esta conexión. Prueba en una hora.'], 429);

$q = $db->prepare('SELECT * FROM socios WHERE correo = ?'); $q->execute([$correo]);
$s = $q->fetch();

if ($s) {
    // reenvío: máximo uno por minuto y seis en total
    if ($s['ultimo_envio'] && strtotime($s['ultimo_envio'] . ' UTC') > time() - 60) responder(['ok' => false, 'error' => 'Ya te enviamos el correo hace un momento. Revisa tu bandeja y spam.'], 429);
    if ((int)$s['envios'] >= 6) responder(['ok' => false, 'error' => 'Hemos enviado demasiados correos a esta dirección. Escríbenos a ' . cfg('correo_contacto')], 429);
    if (!$s['confirmado']) {
        $db->prepare('UPDATE socios SET nombre = ?, comuna = ?, fundador = ? WHERE id = ?')->execute([$nombre, $comuna, $fundador, $s['id']]);
    }
    if ($compromiso) {
        $db->prepare('UPDATE socios SET compromiso = ?, compromiso_fecha = ? WHERE id = ?')->execute([$compromiso, ahora(), $s['id']]);
    }
    $token = $s['token']; $confirmado = (bool)$s['confirmado'];
    $db->prepare('UPDATE socios SET envios = envios + 1, ultimo_envio = ? WHERE id = ?')->execute([ahora(), $s['id']]);
} else {
    $token = aleatorio(24); $confirmado = false;
    if ($ref) { $q = $db->prepare('SELECT 1 FROM socios WHERE codigo = ?'); $q->execute([$ref]); if (!$q->fetchColumn()) $ref = null; }
    for ($i = 0; $i < 5; $i++) {
        try {
            $db->prepare('INSERT INTO socios (nombre, correo, comuna, fundador, token, codigo, ref, creado, ip, envios, ultimo_envio, compromiso, compromiso_fecha) VALUES (?,?,?,?,?,?,?,?,?,1,?,?,?)')
               ->execute([$nombre, $correo, $comuna, $fundador, $token, codigo_invitacion(), $ref, ahora(), $ip, ahora(), $compromiso ?: null, $compromiso ? ahora() : null]);
            break;
        } catch (PDOException $e) { if ($i === 4) throw $e; }
    }
}

$base = rtrim(cfg('sitio'), '/') . '/api/';
$enlace = $confirmado ? rtrim(cfg('sitio'), '/') . '/?s=' . $token : $base . 'confirmar.php?t=' . $token;
$asunto = $confirmado ? 'Tu acceso a Patagonia Chilena' : 'Confirma tu inscripción en Patagonia Chilena';
$okCorreo = enviar_correo($correo, $asunto, plantilla_correo($nombre, $enlace, $base . 'baja.php?t=' . $token, $confirmado));
if (!$okCorreo) responder(['ok' => false, 'error' => 'No pudimos enviar el correo. Intenta de nuevo en unos minutos.'], 502);

responder(cfg('dev') ? ['ok' => true, 'dev_enlace' => $enlace] : ['ok' => true]);
