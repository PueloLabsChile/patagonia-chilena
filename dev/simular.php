<?php
// Simula actividad en la Asamblea (solo desarrollo):
//   php dev/simular.php            → 450 conectados, apodos, mensajes en La Plaza
//   php dev/simular.php vivo       → además fuerza la sesión en vivo, manos levantadas, votación y aplausos
//   php dev/simular.php limpiar    → borra lo simulado y vuelve al estado normal
if (PHP_SAPI !== 'cli') exit;
require __DIR__ . '/../api/_comun.php';
$db = db(); $t = time(); $modo = $argv[1] ?? '';
$forzar = __DIR__ . '/forzar.txt';
if ($modo === 'limpiar') {
    $db->exec("DELETE FROM mensajes WHERE socio_id IN (SELECT id FROM socios WHERE ip = 'semilla')");
    $db->exec("UPDATE socios SET visto = NULL, palabra = NULL, apodo = NULL WHERE ip = 'semilla'");
    $db->exec('DELETE FROM votos'); $db->exec('DELETE FROM votaciones'); $db->exec('DELETE FROM aplausos');
    @unlink($forzar); invalidar_cache(); echo "limpio\n"; exit;
}
$apodos = ['Cóndor del Baker', 'Huemul Austral', 'Viento de Aysén', 'Lenga Roja', 'Calafate', 'Ñirre Sur', 'Glaciar Grey', 'Fitz Roy', 'Río Simpson', 'Puerto Edén',
           'Estepa Viva', 'Tehuelche', 'Mañío', 'Ciprés Guaitecas', 'Caleta Tortel', 'Faro Evangelistas', 'Laguna Azul', 'Coihue', 'Bandurria', 'Caiquén'];
$ids = $db->query("SELECT id FROM socios WHERE ip = 'semilla' ORDER BY RANDOM() LIMIT 450")->fetchAll(PDO::FETCH_COLUMN);
foreach ($ids as $k => $id) {
    $ap = $k < count($apodos) ? $apodos[$k] : null;
    $db->prepare('UPDATE socios SET visto = ?, apodo = COALESCE(apodo, ?) WHERE id = ?')->execute([$t, $ap, $id]);
}
$frases = ['¡Saludos desde Coyhaique! Qué emoción ver la sala llenándose.', 'Mi abuelo llegó a Aysén en 1935. Esto es para él.', '¿Cuándo se abre la votación de zonas?',
           'Hay que proteger el lago Cabrera antes de que se venda.', 'Desde Antofagasta mirando al sur 🇨🇱', 'Invité a toda mi familia, ya somos 6.',
           'La cooperativa debe tener cuentas abiertas siempre.', 'Propongo estudiar el valle del Cochamó.', 'Saludos a la gente de Magallanes.', '¿Quién más está conectado desde Valparaíso?'];
foreach (array_slice($ids, 0, 10) as $k => $id) $db->prepare('INSERT INTO mensajes (socio_id, sala, texto, creado) VALUES (?,?,?,?)')->execute([$id, 'plaza', $frases[$k], $t - (10 - $k) * 40]);
if ($modo === 'vivo') {
    file_put_contents($forzar, 'en_vivo');
    foreach (array_slice($ids, 10, 6) as $k => $id) $db->prepare('UPDATE socios SET palabra = ? WHERE id = ?')->execute([$t - $k * 30, $id]);
    foreach (array_slice($ids, 0, 6) as $k => $id) $db->prepare('INSERT INTO mensajes (socio_id, sala, texto, creado) VALUES (?,?,?,?)')->execute([$id, 'sesion', ['Se escucha perfecto', 'Bienvenidos todos', 'Apoyo la moción', '¿Se puede repetir la pregunta?', '¡Viva Chile!', 'Votando…'][$k], $t - (6 - $k) * 15]);
    $db->exec('UPDATE votaciones SET abierta = 0');
    $db->prepare('INSERT INTO votaciones (pregunta, opciones, abierta, creado) VALUES (?,?,1,?)')->execute(['¿Priorizamos estudiar predios en Aysén para la primera compra?', json_encode(['Sí', 'No', 'Abstención'], JSON_UNESCAPED_UNICODE), $t]);
    $vid = (int)$db->lastInsertId();
    foreach ($ids as $k => $id) if ($k % 3 !== 2) $db->prepare('INSERT OR REPLACE INTO votos (votacion_id, socio_id, opcion, creado) VALUES (?,?,?,?)')->execute([$vid, $id, $k % 7 === 0 ? 1 : ($k % 11 === 0 ? 2 : 0), $t]);
    foreach (array_slice($ids, 0, 40) as $id) { $s = $db->query("SELECT region, puesto FROM socios WHERE id = $id")->fetch(); $db->prepare('INSERT INTO aplausos (region, puesto, creado) VALUES (?,?,?)')->execute([$s['region'], $s['puesto'], $t]); }
}
$db->exec("UPDATE socios SET compromiso = CASE abs(random()) % 4 WHEN 0 THEN 1000 WHEN 1 THEN 2000 WHEN 2 THEN 1000 ELSE 5000 END WHERE ip = 'semilla' AND compromiso IS NULL AND abs(random()) % 10 < 4");
invalidar_cache();
echo "simulado: " . count($ids) . " conectados" . ($modo === 'vivo' ? ', sesión en vivo con votación' : '') . "\n";
