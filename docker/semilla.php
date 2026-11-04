<?php
// Datos de prueba del demo: 1.800 inscritos repartidos por Chile, apodos, mensajes en La Plaza y moderadores.
// Los enlaces de moderación dependen de la variable DEMO_CLAVE (no se publican en el repositorio).
if (PHP_SAPI !== 'cli') exit;
require __DIR__ . '/../api/_comun.php';
$db = db();
if ((int)$db->query('SELECT COUNT(*) FROM socios')->fetchColumn() === 0) {
    $comunas = json_decode(file_get_contents(__DIR__ . '/../datos/comunas.json'), true);
    $bolsa = [];
    foreach ($comunas as $c) { $peso = $c['r'] == 13 ? 6 : (in_array($c['r'], [11, 12]) ? 5 : (in_array($c['r'], [5, 8]) ? 3 : 1)); for ($i = 0; $i < $peso; $i++) $bolsa[] = $c['c']; }
    $db->beginTransaction();
    $puestos = [];
    $ins = $db->prepare('INSERT INTO socios (nombre, correo, comuna, fundador, token, codigo, creado, confirmado, numero, ip, region, puesto) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
    for ($n = 1; $n <= 1800; $n++) {
        $cut = $bolsa[array_rand($bolsa)]; $r = intdiv($cut, 1000); $puestos[$r] = ($puestos[$r] ?? 0) + 1;
        $ins->execute(["Prueba $n", "prueba$n@ejemplo.cl", $cut, 1, aleatorio(24), codigo_invitacion(), ahora(), ahora(), $n, 'semilla', $r, $puestos[$r]]);
    }
    $db->commit();
    $apodos = ['Cóndor del Baker', 'Huemul Austral', 'Viento de Aysén', 'Lenga Roja', 'Calafate', 'Ñirre Sur', 'Glaciar Grey', 'Fitz Roy', 'Río Simpson', 'Puerto Edén'];
    $frases = ['¡Saludos desde Coyhaique! Qué emoción ver la sala llenándose.', 'Mi abuelo llegó a Aysén en 1935. Esto es para él.', '¿Cuándo se abre la votación de zonas?',
               'Hay que proteger el lago Cabrera antes de que se venda.', 'Desde Antofagasta mirando al sur.', 'Invité a toda mi familia, ya somos 6.',
               'La cooperativa debe tener cuentas abiertas siempre.', 'Propongo estudiar el valle del Cochamó.', 'Saludos a la gente de Magallanes.', '¿Quién más está conectado desde Valparaíso?'];
    $ids = $db->query("SELECT id FROM socios ORDER BY RANDOM() LIMIT 10")->fetchAll(PDO::FETCH_COLUMN);
    foreach ($ids as $k => $id) {
        $db->prepare('UPDATE socios SET apodo = ? WHERE id = ?')->execute([$apodos[$k], $id]);
        $db->prepare('INSERT INTO mensajes (socio_id, sala, texto, creado) VALUES (?,?,?,?)')->execute([$id, 'plaza', $frases[$k], time() - (10 - $k) * 300]);
    }
}
$clave = getenv('DEMO_CLAVE') ?: '';
if ($clave !== '') {
    foreach (array_filter(array_map('trim', explode(',', getenv('DEMO_MODERADORES') ?: 'Moderación'))) as $nombre) {
        $t = rtrim(strtr(base64_encode(hash('sha256', $clave . '|' . $nombre, true)), '+/', '-_'), '=');
        $db->prepare('INSERT OR IGNORE INTO moderadores (nombre, token, creado) VALUES (?,?,?)')->execute([$nombre, $t, ahora()]);
        echo 'Moderación · ' . $nombre . ': ' . cfg('sitio') . 'moderacion.html?m=' . $t . PHP_EOL;
    }
}
// compromisos mensuales de prueba (≈ 30 % de los inscritos de prueba), solo la primera vez
if ((int)$db->query('SELECT COUNT(*) FROM socios WHERE compromiso > 0')->fetchColumn() === 0) {
    $db->exec("UPDATE socios SET compromiso = CASE abs(random()) % 4 WHEN 0 THEN 1000 WHEN 1 THEN 2000 WHEN 2 THEN 1000 ELSE 5000 END WHERE ip = 'semilla' AND abs(random()) % 10 < 3");
}
invalidar_cache();
echo "semilla lista\n";
