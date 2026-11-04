<?php
// GET ?t=token → pide confirmación · POST → borra la inscripción y todos sus datos
require __DIR__ . '/_comun.php';

$t = (string)($_REQUEST['t'] ?? '');
$valido = preg_match('/^[A-Za-z0-9_-]{20,64}$/', $t);
$hecho = false;
if ($valido && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $q = db()->prepare('SELECT id FROM socios WHERE token = ?'); $q->execute([$t]); $id = $q->fetchColumn();
    if ($id) { db()->prepare('DELETE FROM mensajes WHERE socio_id = ?')->execute([$id]); db()->prepare('DELETE FROM votos WHERE socio_id = ?')->execute([$id]); }
    $q = db()->prepare('DELETE FROM socios WHERE token = ?'); $q->execute([$t]);
    $hecho = $q->rowCount() > 0;
    invalidar_cache();
}
$tt = htmlspecialchars($t, ENT_QUOTES, 'UTF-8');
header('Content-Type: text/html; charset=utf-8');
?><!doctype html><html lang="es-CL"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Darse de baja · Patagonia Chilena</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#071a45;color:#f8f6f0;font:17px/1.6 system-ui,sans-serif;padding:16px}div{max-width:460px;background:#0d2c6e;border-radius:18px;padding:34px}h1{font:400 28px Georgia,serif;margin:0 0 12px}button{background:#d52b1e;color:#fff;border:0;border-radius:30px;padding:14px 24px;font:700 16px system-ui;cursor:pointer}a{color:#c6d6ee}</style></head><body><div>
<?php if ($hecho): ?>
<h1>Listo, borramos tus datos</h1><p>Ya no eres parte de la lista y no te escribiremos más. Si cambias de opinión, puedes volver a inscribirte cuando quieras.</p><p><a href="<?= htmlspecialchars(cfg('sitio')) ?>">Volver al sitio</a></p>
<?php elseif ($valido): ?>
<h1>¿Quieres darte de baja?</h1><p>Borraremos tu nombre, correo y comuna. Tu número de socio fundador quedará libre y no se puede recuperar.</p>
<form method="post"><input type="hidden" name="t" value="<?= $tt ?>"><button>Sí, borrar mis datos</button></form>
<?php else: ?>
<h1>Enlace no válido</h1><p>Escríbenos a <a href="mailto:<?= htmlspecialchars(cfg('correo_contacto')) ?>"><?= htmlspecialchars(cfg('correo_contacto')) ?></a> y te damos de baja a mano.</p>
<?php endif; ?>
</div></body></html>
