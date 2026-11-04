<?php
// GET → {total, meta, comunas:[[cut, n], …]} solo con inscritos confirmados; caché de 60 s
require __DIR__ . '/_comun.php';

$cache = sys_get_temp_dir() . '/pc_estadisticas.json';
if (is_file($cache) && filemtime($cache) > time() - 60) {
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: public, max-age=30');
    readfile($cache); exit;
}
$db = db();
$total = (int)$db->query('SELECT COUNT(*) FROM socios WHERE numero IS NOT NULL')->fetchColumn();
$comunas = [];
foreach ($db->query('SELECT comuna, COUNT(*) n FROM socios WHERE numero IS NOT NULL GROUP BY comuna ORDER BY n DESC') as $r)
    $comunas[] = [(int)$r['comuna'], (int)$r['n']];
$json = json_encode(['total' => $total, 'meta' => cfg('meta'), 'comunas' => $comunas, 'al' => gmdate('c')]);
@file_put_contents($cache, $json, LOCK_EX);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=30');
echo $json;
