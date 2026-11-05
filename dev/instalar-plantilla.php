<?php
// Instalador de un solo uso para cPanel. Lo genera dev/empaquetar.py con una clave aleatoria.
// Abre https://TU-DOMINIO/__NOMBRE__?clave=__CLAVE__ : revisa requisitos, crea la base y los moderadores,
// prueba el correo y luego se borra a sí mismo.
declare(strict_types=1);
const CLAVE = '__CLAVE__';
const MODERADORES = __MODERADORES__;
if (!hash_equals(CLAVE, (string)($_GET['clave'] ?? ''))) { http_response_code(404); exit('404'); }
header('Content-Type: text/html; charset=utf-8');
$ok = fn($b) => $b ? '<b style="color:#5fae8b">✓</b>' : '<b style="color:#e8402f">✗</b>';
$checks = [
    'PHP 8.0 o superior (' . PHP_VERSION . ')' => version_compare(PHP_VERSION, '8.0', '>='),
    'Extensión pdo_sqlite' => extension_loaded('pdo_sqlite'),
    'Extensión mbstring' => extension_loaded('mbstring'),
    'Función mail()' => function_exists('mail'),
    'api/config.php presente' => is_file(__DIR__ . '/api/config.php'),
];
?><!doctype html><html lang="es-CL"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>Instalación · Patagonia Chilena</title>
<style>body{font:16px/1.6 system-ui,sans-serif;background:#071a45;color:#f8f6f0;max-width:760px;margin:40px auto;padding:0 16px}code,input{font:14px ui-monospace,monospace}a{color:#e9c46a}li{margin:4px 0}.caja{background:#0b2257;border-radius:12px;padding:16px 20px;margin:16px 0}</style></head><body>
<h1>Instalación de Patagonia Chilena</h1>
<div class="caja"><h2>1. Requisitos</h2><ul>
<?php foreach ($checks as $k => $v) echo "<li>{$ok($v)} " . htmlspecialchars($k) . '</li>'; ?>
</ul></div>
<?php
if (in_array(false, $checks, true)) { echo '<p>Hay requisitos sin cumplir. Revisa en cPanel → «Select PHP Version» que esté PHP 8.1 o superior con pdo_sqlite y mbstring, y vuelve a cargar esta página.</p></body></html>'; exit; }
require __DIR__ . '/api/_comun.php';
$db = db();
echo '<div class="caja"><h2>2. Base de datos</h2><p>' . $ok(true) . ' Creada en <code>' . htmlspecialchars(cfg('db')) . '</code> (fuera de la carpeta pública).</p></div>';
echo '<div class="caja"><h2>3. Moderadores</h2><p>Envía a cada persona <b>solo su enlace</b>, por un canal privado. Guárdalos: dejarán de mostrarse cuando borres este instalador.</p><ul>';
foreach (MODERADORES as $nombre) {
    $q = $db->prepare('SELECT token FROM moderadores WHERE nombre = ?'); $q->execute([$nombre]);
    $t = $q->fetchColumn();
    if (!$t) { $t = aleatorio(24); $db->prepare('INSERT INTO moderadores (nombre, token, creado) VALUES (?,?,?)')->execute([$nombre, $t, ahora()]); }
    $u = rtrim(cfg('sitio'), '/') . '/moderacion.html?m=' . $t;
    echo '<li><b>' . htmlspecialchars($nombre) . '</b>: <code>' . htmlspecialchars($u) . '</code></li>';
}
echo '</ul></div>';
if (!empty($_GET['correo']) && filter_var($_GET['correo'], FILTER_VALIDATE_EMAIL)) {
    $env = enviar_correo($_GET['correo'], 'Prueba de correo · Patagonia Chilena', '<p>Si lees esto, el correo del sitio funciona. Revisa que no haya llegado a spam.</p>');
    echo '<div class="caja"><h2>4. Correo</h2><p>' . $ok($env) . ' ' . ($env ? 'Enviado a ' . htmlspecialchars($_GET['correo']) . '. Revisa la bandeja y la carpeta de spam.' : 'mail() falló: revisa que exista la casilla ' . htmlspecialchars(cfg('correo_de')) . ' en cPanel.') . '</p></div>';
} else {
    echo '<div class="caja"><h2>4. Correo</h2><form><input type="hidden" name="clave" value="' . htmlspecialchars(CLAVE) . '"><input name="correo" type="email" placeholder="tu correo para la prueba" required> <button>Enviar prueba</button></form><p>Antes, crea en cPanel → Cuentas de correo la casilla <code>' . htmlspecialchars(cfg('correo_de')) . '</code>.</p></div>';
}
if (!empty($_GET['terminar'])) {
    @unlink(__FILE__);
    echo '<div class="caja"><h2>Listo</h2><p>El instalador se borró. <a href="./">Ir al sitio</a></p></div>';
} else {
    echo '<p><a href="?clave=' . htmlspecialchars(CLAVE) . '&terminar=1">Terminar y borrar este instalador</a> (hazlo después de copiar los enlaces de moderación y probar el correo).</p>';
}
?></body></html>
