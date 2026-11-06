<?php
// Galería de fotos de terreno del Observatorio Patagonia (observatorio/galeria.html).
// Cualquiera puede aportar fotos ubicadas en Aysén o Magallanes, con licencia CC BY 4.0.
// El equipo de gestión (Jeny) puede suprimirlas; tres reportes ocultan una foto hasta que gestión la revise.
//
// GET                       → {fotos: [...]}         (con ?g=TOKEN de gestión: también las ocultas y los reportes)
// GET  ?geojson=1           → FeatureCollection para la capa «Fotos de terreno» del visor
// POST application/octet-stream → subir: paquete PCF1 con {lat, lon, rumbo, altitud, tomada, titulo, descripcion, autor, tema, origen, acepto}, foto (JPEG ≤ 2400 px) y mini (≤ 640 px)
// POST {accion: reportar, id, motivo}
// POST {accion: suprimir, id, g | token}             (gestión o quien la subió, con su token)
// POST {accion: restaurar, id, g}                    (gestión)
require __DIR__ . '/_comun.php';

const TEMAS = ['paisaje' => 'Paisaje', 'hielo' => 'Glaciares y hielo', 'agua' => 'Ríos, lagos y mar', 'fauna' => 'Fauna', 'flora' => 'Flora y bosque',
               'fuego' => 'Incendios', 'obras' => 'Obras y actividad humana', 'predios' => 'Predios y límites', 'comunidad' => 'Comunidad y patrimonio', 'otro' => 'Otro'];
// Aysén y Magallanes (con margen para islas y fiordos)
const CAJA = ['lat_n' => -43.3, 'lat_s' => -56.7, 'lon_o' => -76.6, 'lon_e' => -66.0];

$db = db();
$dir = rtrim(cfg('fotos_dir', dirname(__DIR__) . '/fotos'), '/\\');
$urlBase = 'fotos/';   // relativa a la raíz del sitio

function gestor(string $g): ?string {
    if (!token_valido($g)) return null;
    $q = db()->prepare('SELECT nombre FROM gestores WHERE token = ?'); $q->execute([$g]); $n = $q->fetchColumn();
    if ($n === false) { $q = db()->prepare('SELECT nombre FROM moderadores WHERE token = ? AND admin = 1'); $q->execute([$g]); $n = $q->fetchColumn(); }
    return $n === false ? null : (string)$n;
}
function foto_publica(array $f, bool $gestion): array {
    $o = ['id' => (int)$f['id'], 'archivo' => 'fotos/' . $f['archivo'] . '.jpg', 'mini' => 'fotos/' . $f['archivo'] . '_m.jpg', 'w' => (int)$f['w'], 'h' => (int)$f['h'],
          'lat' => (float)$f['lat'], 'lon' => (float)$f['lon'], 'rumbo' => $f['rumbo'] === null ? null : (float)$f['rumbo'], 'altitud' => $f['altitud'] === null ? null : (float)$f['altitud'],
          'tomada' => $f['tomada'], 'titulo' => $f['titulo'], 'descripcion' => $f['descripcion'], 'autor' => $f['autor'], 'tema' => $f['tema'], 'origen' => $f['origen'],
          'licencia' => $f['licencia'], 'creado' => $f['creado']];
    if ($gestion) { $o['reportes'] = (int)$f['reportes']; $o['oculta'] = (int)$f['oculta']; }
    return $o;
}
function borrar_archivos(string $dir, string $archivo): void { @unlink("$dir/$archivo.jpg"); @unlink("$dir/{$archivo}_m.jpg"); }
/** Guarda un JPEG subido volviéndolo a codificar (borra metadatos y cualquier contenido extra del archivo). */
function guardar_jpeg(string $bytes, string $destino, int $maxLado, int $maxBytes, int $calidad): array {
    if ($bytes === '') error('No llegó la imagen. Intenta de nuevo.', 422);
    if (strlen($bytes) > $maxBytes) error('La imagen es demasiado pesada.', 413);
    $i = @getimagesizefromstring($bytes);
    if (!$i || $i[2] !== IMAGETYPE_JPEG) error('La imagen debe llegar en formato JPEG.', 422);
    [$w, $h] = $i;
    if ($w < 64 || $h < 64 || max($w, $h) > $maxLado) error('La imagen tiene un tamaño fuera de lo permitido.', 422);
    if (function_exists('imagecreatefromstring')) {
        $im = @imagecreatefromstring($bytes);
        if (!$im) error('No se pudo leer la imagen.', 422);
        imageinterlace($im, true);
        $ok = imagejpeg($im, $destino, $calidad); imagedestroy($im);
        if (!$ok) error('No se pudo guardar la imagen en el servidor.', 500);
    } elseif (file_put_contents($destino, $bytes) === false) error('No se pudo guardar la imagen en el servidor.', 500);
    @chmod($destino, 0644);
    return [$w, $h];
}
/** Paquete de subida (application/octet-stream, así no lo bloquea el cortafuegos del hosting con las subidas multipart):
 *  "PCF1" · u32 largo del JSON · JSON con los datos · u32 largo de la foto · foto JPEG · u32 largo de la miniatura · miniatura JPEG */
function leer_paquete(): array {
    $b = file_get_contents('php://input', false, null, 0, 6 * 1024 * 1024);
    if ($b === false || strlen($b) < 16 || substr($b, 0, 4) !== 'PCF1') error('El envío llegó incompleto. Intenta de nuevo.', 422);
    $pos = 4; $partes = [];
    for ($k = 0; $k < 3; $k++) {
        if ($pos + 4 > strlen($b)) error('El envío llegó incompleto. Intenta de nuevo.', 422);
        $n = unpack('N', substr($b, $pos, 4))[1]; $pos += 4;
        if ($n > strlen($b) - $pos) error('El envío llegó incompleto. Intenta de nuevo.', 422);
        $partes[] = substr($b, $pos, $n); $pos += $n;
    }
    $datos = json_decode($partes[0], true);
    if (!is_array($datos)) error('Los datos de la foto llegaron mal.', 422);
    return [$datos, $partes[1], $partes[2]];
}

// ------------------------------------------------------------------ lectura
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $gestion = isset($_GET['g']) && gestor((string)$_GET['g']) !== null;
    $filas = $db->query('SELECT * FROM fotos ' . ($gestion ? '' : 'WHERE oculta = 0 ') . 'ORDER BY id DESC')->fetchAll();
    header('Cache-Control: no-cache');
    if (isset($_GET['geojson'])) {
        $sitio = rtrim(cfg('sitio'), '/');
        responder(['type' => 'FeatureCollection', 'features' => array_map(fn($f) => ['type' => 'Feature',
            'geometry' => ['type' => 'Point', 'coordinates' => [(float)$f['lon'], (float)$f['lat']]],
            'properties' => ['titulo' => $f['titulo'] ?: 'Foto de terreno', 'autor' => $f['autor'], 'tomada' => $f['tomada'], 'tema' => TEMAS[$f['tema']] ?? null,
                             'rumbo' => $f['rumbo'] === null ? null : round((float)$f['rumbo']), 'licencia' => $f['licencia'],
                             'foto' => '../fotos/' . $f['archivo'] . '_m.jpg', 'galeria' => $sitio . '/observatorio/galeria.html#f=' . $f['id']]], $filas)]);
    }
    responder(['ok' => true, 'temas' => TEMAS, 'gestion' => $gestion, 'fotos' => array_map(fn($f) => foto_publica($f, $gestion), $filas)]);
}

solo_post();

// ------------------------------------------------------------------ subir (paquete binario)
if (str_starts_with(strtolower($_SERVER['CONTENT_TYPE'] ?? ''), 'application/octet-stream')) {
    [$P, $fotoB, $miniB] = leer_paquete();
    if (empty($P['acepto'])) error('Debes confirmar que puedes publicar la foto con licencia CC BY 4.0.', 422);
    if (!empty($P['web'])) error('No se pudo publicar.', 422);   // trampa para robots
    $lat = (float)($P['lat'] ?? 0); $lon = (float)($P['lon'] ?? 0);
    if (!is_numeric($P['lat'] ?? null) || !is_numeric($P['lon'] ?? null)) error('La foto necesita una ubicación en el mapa.', 422);
    if ($lat > CAJA['lat_n'] || $lat < CAJA['lat_s'] || $lon < CAJA['lon_o'] || $lon > CAJA['lon_e']) error('La galería recibe fotos tomadas en Aysén o Magallanes: esta ubicación queda fuera.', 422);
    $autor = filtrar(limpiar_texto((string)($P['autor'] ?? ''), 60));
    if (mb_strlen($autor) < 2) error('Escribe tu nombre para firmar la foto (la licencia CC BY exige citar a quien la tomó).', 422);
    $titulo = filtrar(limpiar_texto((string)($P['titulo'] ?? ''), 90)) ?: null;
    $descr = filtrar(limpiar_texto((string)($P['descripcion'] ?? ''), 600)) ?: null;
    $tema = isset(TEMAS[$P['tema'] ?? '']) ? $P['tema'] : 'otro';
    $rumbo = is_numeric($P['rumbo'] ?? null) ? fmod(fmod((float)$P['rumbo'], 360) + 360, 360) : null;
    $alt = is_numeric($P['altitud'] ?? null) && abs((float)$P['altitud']) < 9000 ? round((float)$P['altitud'], 1) : null;
    $tomada = preg_match('/^(19[3-9]\d|20\d\d)-\d\d-\d\d( \d\d:\d\d(:\d\d)?)?$/', (string)($P['tomada'] ?? '')) ? substr((string)$P['tomada'], 0, 16) : null;
    $origen = in_array($P['origen'] ?? '', ['gps', 'recorrido', 'mapa'], true) ? $P['origen'] : 'mapa';
    if ((int)$db->query("SELECT COUNT(*) FROM fotos WHERE creado > datetime('now', '-1 day')")->fetchColumn() >= (int)cfg('fotos_dia', 800)) error('La galería recibió muchas fotos hoy. Intenta mañana.', 429);
    limite_ip('foto', (int)cfg('fotos_ip_hora', 80));

    if (!is_dir($dir) && !mkdir($dir, 0755, true)) error('No se pudo preparar la carpeta de fotos.', 500);
    $archivo = gmdate('Ym') . '/' . aleatorio(9);
    if (!is_dir("$dir/" . gmdate('Ym'))) mkdir("$dir/" . gmdate('Ym'), 0755, true);
    $listo = false;   // si algo falla a medio camino (error() termina el script), no quedan archivos sueltos
    register_shutdown_function(function () use (&$listo, $dir, $archivo) { if (!$listo) borrar_archivos($dir, $archivo); });
    [$w, $h] = guardar_jpeg($fotoB, "$dir/$archivo.jpg", 2400, 4 * 1024 * 1024, 86);
    guardar_jpeg($miniB, "$dir/{$archivo}_m.jpg", 640, 400 * 1024, 80);
    $token = aleatorio(18);
    $db->prepare('INSERT INTO fotos (archivo, w, h, lat, lon, rumbo, altitud, tomada, titulo, descripcion, autor, tema, origen, creado, ip, token) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
       ->execute([$archivo, $w, $h, round($lat, 6), round($lon, 6), $rumbo === null ? null : round($rumbo, 1), $alt, $tomada, $titulo, $descr, $autor, $tema, $origen, ahora(), ip_hash(), $token]);
    $id = (int)$db->lastInsertId();
    $listo = true;
    $q = $db->prepare('SELECT * FROM fotos WHERE id = ?'); $q->execute([$id]);
    responder(['ok' => true, 'foto' => foto_publica($q->fetch(), false), 'token' => $token]);
}

// ------------------------------------------------------------------ acciones (JSON)
$d = entrada();
$id = (int)($d['id'] ?? 0);
$q = $db->prepare('SELECT * FROM fotos WHERE id = ?'); $q->execute([$id]); $f = $q->fetch();
if (!$f) error('Esa foto ya no está en la galería.', 404);
$quien = gestor((string)($d['g'] ?? ''));
$anotar = fn(string $acc) => $db->prepare('INSERT INTO bitacora (moderador, accion, detalle, creado) VALUES (?,?,?,?)')
    ->execute(['galería · ' . ($quien ?? 'autor'), $acc, 'foto ' . $f['id'] . ' · ' . ($f['titulo'] ?: 'sin título') . ' · ' . $f['autor'], time()]);

switch ((string)($d['accion'] ?? '')) {
    case 'reportar':
        limite_ip('reporte_foto', 20);
        $motivo = limpiar_texto((string)($d['motivo'] ?? ''), 200) ?: null;
        $ins = $db->prepare('INSERT OR IGNORE INTO fotos_reportes (foto_id, ip, motivo, creado) VALUES (?,?,?,?)'); $ins->execute([$id, ip_hash(), $motivo, ahora()]);
        if ($ins->rowCount()) $db->prepare('UPDATE fotos SET reportes = reportes + 1, oculta = CASE WHEN reportes + 1 >= 3 THEN 1 ELSE oculta END WHERE id = ?')->execute([$id]);
        responder(['ok' => true]);
    case 'suprimir':
        $propio = token_valido((string)($d['token'] ?? '')) && hash_equals($f['token'], (string)$d['token']);
        if (!$quien && !$propio) error('Solo el equipo de gestión o quien subió la foto puede suprimirla.', 403);
        $db->prepare('DELETE FROM fotos WHERE id = ?')->execute([$id]);
        $db->prepare('DELETE FROM fotos_reportes WHERE foto_id = ?')->execute([$id]);
        borrar_archivos($dir, $f['archivo']);
        $anotar('suprimir foto');
        responder(['ok' => true]);
    case 'restaurar':
        if (!$quien) error('Solo el equipo de gestión puede restaurar fotos.', 403);
        $db->prepare('UPDATE fotos SET oculta = 0, reportes = 0 WHERE id = ?')->execute([$id]);
        $db->prepare('DELETE FROM fotos_reportes WHERE foto_id = ?')->execute([$id]);
        $anotar('restaurar foto');
        responder(['ok' => true]);
}
error('Acción no reconocida.');
