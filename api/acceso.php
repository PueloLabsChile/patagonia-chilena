<?php
// Botón «Socios»: POST {correo} → acceso rápido.
//  · confirmado: devuelve su tarjeta (número, comuna, asiento, enlace para invitar) al instante, sin correo.
//    No entrega su token: para hablar o votar en la Asamblea se usa el enlace personal que llega por correo.
//  · pendiente: se le reenvía el correo para confirmar.
//  · no inscrito: se le invita a inscribirse.
require __DIR__ . '/_comun.php';
solo_post();
$d = entrada();
if (!empty($d['sitio'])) responder(['ok' => true, 'estado' => 'no_inscrito']);   // trampa para robots
$correo = strtolower(trim((string)($d['correo'] ?? '')));
if (!filter_var($correo, FILTER_VALIDATE_EMAIL) || strlen($correo) > 120) error('Ese correo no parece válido.', 422);
limite_ip('acceso', 15);
$db = db();
$q = $db->prepare('SELECT * FROM socios WHERE correo = ?'); $q->execute([$correo]);
$s = $q->fetch();
if (!$s) responder(['ok' => true, 'estado' => 'no_inscrito']);

if ($s['numero']) {
    $q = $db->prepare('SELECT COUNT(*) FROM socios WHERE ref = ? AND numero IS NOT NULL'); $q->execute([$s['codigo']]);
    responder(['ok' => true, 'estado' => 'socio', 'socio' => ['ok' => true, 'numero' => (int)$s['numero'], 'nombre' => $s['nombre'], 'comuna' => (int)$s['comuna'],
        'codigo' => $s['codigo'], 'invitados' => (int)$q->fetchColumn(), 'region' => (int)$s['region'], 'puesto' => (int)$s['puesto'],
        'apodo' => $s['apodo'], 'compromiso' => (int)$s['compromiso']]]);
}

// pendiente de confirmar: reenviamos el correo (máximo uno por minuto)
$extra = [];
if (!($s['ultimo_envio'] && strtotime($s['ultimo_envio'] . ' UTC') > time() - 60)) {
    [$enlace, $baja] = enlaces_socio($s);
    if (enviar_correo($correo, 'Confirma tu inscripción en Patagonia Chilena', plantilla_correo($s['nombre'], $enlace, $baja, false))) {
        $db->prepare('UPDATE socios SET ultimo_envio = ? WHERE id = ?')->execute([ahora(), $s['id']]);
    }
    if (cfg('dev')) $extra['dev_enlace'] = $enlace;
}
responder(['ok' => true, 'estado' => 'pendiente'] + $extra);
