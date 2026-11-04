<?php
// GET ?t=token → número, nombre, comuna, código para invitar y cuántos se sumaron con él
require __DIR__ . '/_comun.php';

$t = (string)($_GET['t'] ?? '');
if (!preg_match('/^[A-Za-z0-9_-]{20,64}$/', $t)) responder(['ok' => false], 404);
$q = db()->prepare('SELECT nombre, comuna, numero, codigo FROM socios WHERE token = ? AND numero IS NOT NULL');
$q->execute([$t]);
$s = $q->fetch();
if (!$s) responder(['ok' => false], 404);
$q = db()->prepare('SELECT COUNT(*) FROM socios WHERE ref = ? AND numero IS NOT NULL'); $q->execute([$s['codigo']]);
responder(['ok' => true, 'numero' => (int)$s['numero'], 'nombre' => $s['nombre'], 'comuna' => (int)$s['comuna'],
           'codigo' => $s['codigo'], 'invitados' => (int)$q->fetchColumn()]);
