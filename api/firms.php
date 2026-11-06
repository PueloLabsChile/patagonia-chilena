<?php
// Focos de calor activos (NASA FIRMS · VIIRS NOAA-20, NOAA-21 y Suomi-NPP, últimos 7 días) recortados a Aysén y Magallanes.
// Los archivos públicos de FIRMS no permiten CORS: este script los baja, filtra y guarda en caché por 3 horas.
// GET → GeoJSON {features:[{brillo, frp, confianza, fecha, hora, satelite, dia_noche}]}
header('Content-Type: application/geo+json; charset=utf-8');
header('Cache-Control: public, max-age=1800');
$cache = sys_get_temp_dir() . '/pc_firms_patagonia.json';
if (is_file($cache) && filemtime($cache) > time() - 3 * 3600) { readfile($cache); exit; }

$fuentes = [
    'NOAA-20' => 'https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-20-viirs-c2/csv/J1_VIIRS_C2_South_America_7d.csv',
    'NOAA-21' => 'https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-21-viirs-c2/csv/J2_VIIRS_C2_South_America_7d.csv',
    'Suomi-NPP' => 'https://firms.modaps.eosdis.nasa.gov/data/active_fire/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_South_America_7d.csv',
];
// Aysén + Magallanes continental (con margen marino); la zona argentina se descarta con un límite aproximado por longitud
$S = -56.6; $N = -43.6; $O = -76.5; $E = -66.3;
$feats = []; $ok = 0;
$ctx = stream_context_create(['http' => ['timeout' => 40, 'header' => "User-Agent: ObservatorioPatagonia/1.0\r\n"]]);
foreach ($fuentes as $sat => $url) {
    $fh = @fopen($url, 'r', false, $ctx);
    if (!$fh) continue;
    $cab = fgetcsv($fh); if (!$cab) { fclose($fh); continue; }
    $i = array_flip($cab); $ok++;
    while (($r = fgetcsv($fh)) !== false) {
        $lat = (float)($r[$i['latitude']] ?? 0); $lon = (float)($r[$i['longitude']] ?? 0);
        if ($lat < $S || $lat > $N || $lon < $O || $lon > $E) continue;
        if ($lon > frontera($lat)) continue;   // lado argentino
        $h = str_pad((string)($r[$i['acq_time']] ?? ''), 4, '0', STR_PAD_LEFT);
        $feats[] = ['type' => 'Feature', 'geometry' => ['type' => 'Point', 'coordinates' => [round($lon, 4), round($lat, 4)]],
                    'properties' => ['satelite' => $sat, 'fecha' => $r[$i['acq_date']] ?? '', 'hora_utc' => substr($h, 0, 2) . ':' . substr($h, 2),
                                     'brillo_k' => (float)($r[$i['bright_ti4']] ?? 0), 'frp_mw' => (float)($r[$i['frp']] ?? 0),
                                     'confianza' => ['l' => 'baja', 'n' => 'nominal', 'h' => 'alta'][$r[$i['confidence']] ?? ''] ?? ($r[$i['confidence']] ?? ''),
                                     'dia_noche' => ($r[$i['daynight']] ?? '') === 'D' ? 'día' : 'noche']];
    }
    fclose($fh);
}
/** Longitud aproximada de la frontera Chile–Argentina según la latitud (suficiente para descartar focos argentinos). */
function frontera(float $lat): float {
    $p = [[-43.6, -71.7], [-44.5, -71.6], [-45.5, -71.4], [-46.5, -71.7], [-47.5, -72.3], [-48.5, -72.6], [-49.5, -73.2], [-50.5, -73.0],
          [-51.0, -72.3], [-51.6, -72.2], [-52.0, -71.5], [-52.2, -69.5], [-52.4, -68.5], [-53.5, -68.6], [-54.9, -68.6], [-56.6, -66.3]];
    for ($k = 1; $k < count($p); $k++) if ($lat >= $p[$k][0]) { [$a, $b] = [$p[$k - 1], $p[$k]]; return $a[1] + ($lat - $a[0]) / ($b[0] - $a[0]) * ($b[1] - $a[1]); }
    return -66.3;
}
$json = json_encode(['type' => 'FeatureCollection', 'generado' => gmdate('c'), 'fuentes_ok' => $ok, 'features' => $feats], JSON_UNESCAPED_UNICODE);
if ($ok) @file_put_contents($cache, $json, LOCK_EX);
echo $json;
