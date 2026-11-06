<?php
// Acceso de gestión sin enlace guardado: POST {correo} → si corresponde a una persona de gestión, se le envía su enlace.
// Responde siempre lo mismo para no revelar qué correos tienen acceso.
require __DIR__ . '/_comun.php';
solo_post();
$d = entrada();
$correo = strtolower(trim((string)($d['correo'] ?? '')));
if (!filter_var($correo, FILTER_VALIDATE_EMAIL)) error('Ese correo no parece válido.', 422);
limite_ip('gestion', 6);
$db = db();
$q = $db->prepare('SELECT nombre, token FROM gestores WHERE lower(correo) = ?'); $q->execute([$correo]);
$p = $q->fetch();
if (!$p) { $q = $db->prepare('SELECT nombre, token FROM moderadores WHERE admin = 1 AND lower(correo) = ?'); $q->execute([$correo]); $p = $q->fetch(); }
$extra = [];
if ($p) {
    $enlace = rtrim(cfg('sitio'), '/') . '/gestion.html?g=' . $p['token'];
    $n = htmlspecialchars(explode(' ', trim($p['nombre']))[0], ENT_QUOTES, 'UTF-8');
    $html = '<!doctype html><html><body style="margin:0;background:#0b0a12;font-family:Arial,Helvetica,sans-serif"><table role="presentation" width="100%" style="padding:32px 12px"><tr><td align="center">'
          . '<table role="presentation" width="100%" style="max-width:500px;background:#17142a;border-radius:18px;padding:34px 30px;color:#f3efe6">'
          . '<tr><td style="font:600 12px Arial;letter-spacing:2px;color:#cbb8ff;text-transform:uppercase">Patagonia Chilena · Gestión interna</td></tr>'
          . '<tr><td style="padding:16px 0 8px;font:400 28px Georgia,serif">Hola, ' . $n . '</td></tr>'
          . '<tr><td style="font:15px/1.6 Arial;color:#cfc8de;padding-bottom:24px">Este es tu acceso al panel de gestión de socios. No lo reenvíes: funciona como una contraseña.</td></tr>'
          . '<tr><td><a href="' . $enlace . '" style="display:inline-block;background:#cbb8ff;color:#14101f;text-decoration:none;font:700 15px Arial;padding:14px 26px;border-radius:30px">Entrar al panel</a></td></tr>'
          . '<tr><td style="font:12px/1.6 Arial;color:#8f88a3;padding-top:24px">Si no pediste este correo, ignóralo.</td></tr></table></td></tr></table></body></html>';
    enviar_correo($correo, 'Tu acceso al panel de gestión', $html);
    $db->prepare('INSERT INTO bitacora (moderador, accion, detalle, creado) VALUES (?,?,?,?)')->execute(['gestión · ' . $p['nombre'], 'pidió su enlace por correo', '', time()]);
    if (cfg('dev')) $extra['dev_enlace'] = $enlace;
}
responder(['ok' => true] + $extra);
