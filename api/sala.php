<?php
// GET ?t=token (opcional) → estado en vivo de la Asamblea: presentes, chat, aplausos, palabra, votación.
// La parte común se arma como mucho cada 2 s y se guarda en un archivo de caché; solo «yo» se calcula por persona.
require __DIR__ . '/_comun.php';

$cache = sys_get_temp_dir() . '/pc_sala_' . md5(cfg('db')) . '.json';
$ahora = time();
$db = db();

if (is_file($cache) && filemtime($cache) >= $ahora - 2) {
    $comun = json_decode(file_get_contents($cache), true);
} else {
    $presentes = $db->prepare('SELECT region, puesto FROM socios WHERE numero IS NOT NULL AND visto > ?');
    $presentes->execute([$ahora - 45]);
    $mensajes = [];
    foreach ($db->query('SELECT m.id, m.sala, m.texto, m.creado, s.apodo, s.comuna, s.region, s.puesto, s.numero
                         FROM mensajes m JOIN socios s ON s.id = m.socio_id WHERE m.oculto = 0 ORDER BY m.id DESC LIMIT 120') as $m) {
        $mensajes[] = ['id' => (int)$m['id'], 's' => $m['sala'], 'a' => $m['apodo'], 'c' => (int)$m['comuna'], 'r' => (int)$m['region'],
                       'p' => (int)$m['puesto'], 'n' => (int)$m['numero'], 'x' => $m['texto'], 't' => (int)$m['creado']];
    }
    $ocultos = array_map('intval', $db->query('SELECT id FROM mensajes WHERE oculto = 1 ORDER BY id DESC LIMIT 300')->fetchAll(PDO::FETCH_COLUMN));
    $aplausos = $db->prepare('SELECT id, region, puesto FROM aplausos WHERE creado > ? ORDER BY id'); $aplausos->execute([$ahora - 20]);
    $palabra = [];
    foreach ($db->query('SELECT region, puesto, apodo, palabra FROM socios WHERE palabra IS NOT NULL ORDER BY palabra LIMIT 50') as $p)
        $palabra[] = [(int)$p['region'], (int)$p['puesto'], $p['apodo'], (int)$p['palabra']];
    $vot = $db->query('SELECT * FROM votaciones ORDER BY abierta DESC, id DESC LIMIT 1')->fetch();
    $votacion = null;
    if ($vot) {
        $ops = json_decode($vot['opciones'], true);
        $conteo = array_fill(0, count($ops), 0); $asientos = [];
        $q = $db->prepare('SELECT v.opcion, s.region, s.puesto FROM votos v JOIN socios s ON s.id = v.socio_id WHERE v.votacion_id = ?'); $q->execute([$vot['id']]);
        foreach ($q as $v) { $conteo[(int)$v['opcion']]++; if (count($asientos) < 30000) $asientos[] = [(int)$v['region'], (int)$v['puesto'], (int)$v['opcion']]; }
        $votacion = ['id' => (int)$vot['id'], 'pregunta' => $vot['pregunta'], 'opciones' => $ops, 'abierta' => (bool)$vot['abierta'], 'conteo' => $conteo, 'asientos' => $asientos];
    }
    $comun = [
        'ahora' => $ahora, 'asamblea' => asamblea(),
        'presentes' => array_map(fn($r) => [(int)$r['region'], (int)$r['puesto']], $presentes->fetchAll()),
        'acreditados' => (int)$db->query('SELECT COUNT(*) FROM socios WHERE acreditado IS NOT NULL')->fetchColumn(),
        'mensajes' => array_reverse($mensajes), 'ocultos' => $ocultos,
        'aplausos' => array_map(fn($r) => [(int)$r['id'], (int)$r['region'], (int)$r['puesto']], $aplausos->fetchAll()),
        'palabra' => $palabra, 'votacion' => $votacion,
    ];
    @file_put_contents($cache, json_encode($comun, JSON_UNESCAPED_UNICODE), LOCK_EX);
}

// parte personal: presencia y estado propio
$yo = null;
if ($s = socio_actual((string)($_GET['t'] ?? ''))) {
    $db->prepare('UPDATE socios SET visto = ? WHERE id = ? AND (visto IS NULL OR visto < ?)')->execute([$ahora, $s['id'], $ahora - 20]);
    $miVoto = null;
    if (!empty($comun['votacion'])) {
        $q = $db->prepare('SELECT opcion FROM votos WHERE votacion_id = ? AND socio_id = ?'); $q->execute([$comun['votacion']['id'], $s['id']]);
        $v = $q->fetchColumn(); $miVoto = $v === false ? null : (int)$v;
    }
    $yo = ['numero' => (int)$s['numero'], 'apodo' => $s['apodo'], 'region' => (int)$s['region'], 'puesto' => (int)$s['puesto'],
           'acreditado' => (bool)$s['acreditado'], 'palabra' => (bool)$s['palabra'], 'suspendido' => (bool)$s['suspendido'], 'voto' => $miVoto];
}
$comun['yo'] = $yo;
responder($comun);
