<?php
// GET → asientos de quienes tienen compromiso mensual ([[región, puesto], …]) para marcarlos en la Asamblea; caché de 60 s
require __DIR__ . '/_comun.php';
$cache = sys_get_temp_dir() . '/pc_fondo_' . md5(cfg('db')) . '.json';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=60');
if (is_file($cache) && filemtime($cache) > time() - 60) { readfile($cache); exit; }
$a = [];
foreach (db()->query('SELECT region, puesto FROM socios WHERE numero IS NOT NULL AND compromiso > 0') as $r) $a[] = [(int)$r['region'], (int)$r['puesto']];
$json = json_encode(['ok' => true, 'asientos' => $a]);
@file_put_contents($cache, $json, LOCK_EX);
echo $json;
