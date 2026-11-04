<?php
// GET ?t=token → confirma, asigna número de socio fundador y vuelve al sitio
require __DIR__ . '/_comun.php';

$t = (string)($_GET['t'] ?? '');
$sitio = rtrim(cfg('sitio'), '/') . '/';
if (!preg_match('/^[A-Za-z0-9_-]{20,64}$/', $t)) { header('Location: ' . $sitio . '?error=enlace#sumate'); exit; }

$db = db();
$db->exec('BEGIN IMMEDIATE');
$q = $db->prepare('SELECT id, numero FROM socios WHERE token = ?'); $q->execute([$t]);
$s = $q->fetch();
if (!$s) { $db->exec('ROLLBACK'); header('Location: ' . $sitio . '?error=enlace#sumate'); exit; }
if (!$s['numero']) {
    $n = (int)$db->query('SELECT COALESCE(MAX(numero), 0) + 1 FROM socios')->fetchColumn();
    $db->prepare('UPDATE socios SET numero = ?, confirmado = ? WHERE id = ?')->execute([$n, ahora(), $s['id']]);
    @unlink(sys_get_temp_dir() . '/pc_estadisticas.json');
}
$db->exec('COMMIT');
header('Location: ' . $sitio . '?s=' . urlencode($t));
