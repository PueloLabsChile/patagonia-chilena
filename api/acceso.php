<?php
// Botón «Socios»: POST {correo} → si está inscrito, le enviamos su enlace de acceso (o el de confirmación si aún no confirma).
// Siempre responde lo mismo para no revelar quién está inscrito.
require __DIR__ . '/_comun.php';
solo_post();
$d = entrada();
if (!empty($d['sitio'])) responder(['ok' => true]);   // trampa para robots
$correo = strtolower(trim((string)($d['correo'] ?? '')));
if (!filter_var($correo, FILTER_VALIDATE_EMAIL) || strlen($correo) > 120) error('Ese correo no parece válido.', 422);
limite_ip('acceso', 8);
$db = db();
$q = $db->prepare('SELECT * FROM socios WHERE correo = ?'); $q->execute([$correo]);
$s = $q->fetch();
$extra = [];
if ($s && !($s['ultimo_envio'] && strtotime($s['ultimo_envio'] . ' UTC') > time() - 60)) {
    [$enlace, $baja] = enlaces_socio($s);
    $asunto = $s['confirmado'] ? 'Tu acceso a Patagonia Chilena' : 'Confirma tu inscripción en Patagonia Chilena';
    if (enviar_correo($correo, $asunto, plantilla_correo($s['nombre'], $enlace, $baja, (bool)$s['confirmado']))) {
        $db->prepare('UPDATE socios SET ultimo_envio = ? WHERE id = ?')->execute([ahora(), $s['id']]);
    }
    if (cfg('dev')) $extra['dev_enlace'] = $enlace;
}
responder(['ok' => true] + $extra);
