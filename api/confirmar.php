<?php
// GET ?t=token → confirma, asigna número de socio fundador y vuelve al sitio
require __DIR__ . '/_comun.php';

$t = (string)($_GET['t'] ?? '');
$sitio = rtrim(cfg('sitio'), '/') . '/';
if (!preg_match('/^[A-Za-z0-9_-]{20,64}$/', $t)) { header('Location: ' . $sitio . '?error=enlace#sumate'); exit; }

$db = db();
$db->exec('BEGIN IMMEDIATE');
$q = $db->prepare('SELECT id, numero, comuna FROM socios WHERE token = ?'); $q->execute([$t]);
$s = $q->fetch();
if (!$s) { $db->exec('ROLLBACK'); header('Location: ' . $sitio . '?error=enlace#sumate'); exit; }
if (!$s['numero']) {
    $n = (int)$db->query('SELECT COALESCE(MAX(numero), 0) + 1 FROM socios')->fetchColumn();
    $region = intdiv((int)$s['comuna'], 1000);
    $q = $db->prepare('SELECT COALESCE(MAX(puesto), 0) + 1 FROM socios WHERE region = ? AND numero IS NOT NULL'); $q->execute([$region]);
    $db->prepare('UPDATE socios SET numero = ?, confirmado = ?, region = ?, puesto = ? WHERE id = ?')->execute([$n, ahora(), $region, (int)$q->fetchColumn(), $s['id']]);
    invalidar_cache();
}
$db->exec('COMMIT');
header('Location: ' . $sitio . '?s=' . urlencode($t));
