<?php
// Uso por consola (SSH o terminal de cPanel), nunca por web:
//   php api/herramientas/moderadores.php crear "Nombre" [correo]
//   php api/herramientas/moderadores.php listar
//   php api/herramientas/moderadores.php quitar "Nombre"
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require dirname(__DIR__) . '/_comun.php';
[$_, $orden, $nombre, $correo] = $argv + [null, 'listar', null, null];
$db = db();
$base = rtrim(cfg('sitio'), '/') . '/moderacion.html?m=';
if ($orden === 'crear' && $nombre) {
    $q = $db->prepare('SELECT token FROM moderadores WHERE nombre = ?'); $q->execute([$nombre]);
    $t = $q->fetchColumn();
    if (!$t) { $t = aleatorio(24); $db->prepare('INSERT INTO moderadores (nombre, token, correo, creado) VALUES (?,?,?,?)')->execute([$nombre, $t, $correo, ahora()]); }
    echo $nombre . "\t" . $base . $t . PHP_EOL;
} elseif ($orden === 'quitar' && $nombre) {
    $db->prepare('DELETE FROM moderadores WHERE nombre = ?')->execute([$nombre]); echo "quitado: $nombre" . PHP_EOL;
} else {
    foreach ($db->query('SELECT nombre, token, correo FROM moderadores ORDER BY id') as $m) echo $m['nombre'] . "\t" . ($m['correo'] ?? '') . "\t" . $base . $m['token'] . PHP_EOL;
}
