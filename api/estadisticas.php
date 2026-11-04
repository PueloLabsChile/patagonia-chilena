<?php
// GET → {total, meta, comunas:[[cut, n], …]} solo con inscritos confirmados; caché de 60 s
require __DIR__ . '/_comun.php';

$cache = sys_get_temp_dir() . '/pc_estadisticas.json';
if (is_file($cache) && filemtime($cache) > time() - 30) {
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: public, max-age=30');
    readfile($cache); exit;
}
$db = db();
$total = (int)$db->query('SELECT COUNT(*) FROM socios WHERE numero IS NOT NULL')->fetchColumn();
$comunas = [];
foreach ($db->query('SELECT comuna, COUNT(*) n FROM socios WHERE numero IS NOT NULL GROUP BY comuna ORDER BY n DESC') as $r)
    $comunas[] = [(int)$r['comuna'], (int)$r['n']];
$f = $db->query('SELECT COUNT(*) n, COALESCE(SUM(compromiso), 0) m FROM socios WHERE numero IS NOT NULL AND compromiso > 0')->fetch();
$fondo = ['personas' => (int)$f['n'], 'mensual' => (int)$f['m'], 'clp_por_ha' => (int)cfg('clp_por_ha', 280000)];
$json = json_encode(['total' => $total, 'meta' => cfg('meta'), 'comunas' => $comunas, 'fondo' => $fondo, 'asamblea' => asamblea(), 'al' => gmdate('c')]);
@file_put_contents($cache, $json, LOCK_EX);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=30');
echo $json;
