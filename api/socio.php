<?php
// GET ?t=token → número, nombre, comuna, apodo, región y puesto (para su asiento), código para invitar y cuántos se sumaron con él
require __DIR__ . '/_comun.php';

$s = socio_actual((string)($_GET['t'] ?? ''));
if (!$s) responder(['ok' => false], 404);
$q = db()->prepare('SELECT COUNT(*) FROM socios WHERE ref = ? AND numero IS NOT NULL'); $q->execute([$s['codigo']]);
responder(['ok' => true, 'numero' => (int)$s['numero'], 'nombre' => $s['nombre'], 'comuna' => (int)$s['comuna'],
           'codigo' => $s['codigo'], 'invitados' => (int)$q->fetchColumn(), 'region' => (int)$s['region'], 'puesto' => (int)$s['puesto'],
           'apodo' => $s['apodo'], 'acreditado' => (bool)$s['acreditado'], 'suspendido' => (bool)$s['suspendido']]);
