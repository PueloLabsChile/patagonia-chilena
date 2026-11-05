<?php
// Moderación. GET ?m=token → panel (mensajes recientes, denunciados, palabra, votaciones).
// POST {m, accion, …}: ocultar|mostrar {mensaje} · suspender|reactivar {numero} · quitar_palabra {numero} · limpiar_palabra
//                     abrir_votacion {pregunta, opciones[]} · cerrar_votacion {votacion}
require __DIR__ . '/_comun.php';
$mod = moderador_actual();
if (!$mod) error('Enlace de moderación no válido.', 401);
$db = db();
$ahora = time();
function anotar(string $accion, string $detalle): void {
    global $mod; db()->prepare('INSERT INTO bitacora (moderador, accion, detalle, creado) VALUES (?,?,?,?)')->execute([$mod['nombre'], $accion, $detalle, time()]);
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $msj = $db->query('SELECT m.id, m.sala, m.texto, m.creado, m.oculto, m.denuncias, m.moderador, s.apodo, s.numero, s.comuna, s.suspendido
                       FROM mensajes m JOIN socios s ON s.id = m.socio_id ORDER BY m.denuncias > 0 DESC, m.id DESC LIMIT 200')->fetchAll();
    $palabra = $db->query('SELECT numero, apodo, comuna, palabra FROM socios WHERE palabra IS NOT NULL ORDER BY palabra')->fetchAll();
    $vot = $db->query('SELECT * FROM votaciones ORDER BY id DESC LIMIT 10')->fetchAll();
    foreach ($vot as &$v) {
        $v['opciones'] = json_decode($v['opciones'], true);
        $q = $db->prepare('SELECT opcion, COUNT(*) n FROM votos WHERE votacion_id = ? GROUP BY opcion'); $q->execute([$v['id']]);
        $v['conteo'] = array_fill(0, count($v['opciones']), 0); foreach ($q as $r) $v['conteo'][(int)$r['opcion']] = (int)$r['n'];
    }
    $bit = $db->query('SELECT * FROM bitacora ORDER BY id DESC LIMIT 40')->fetchAll();
    $suspendidos = $db->query('SELECT numero, apodo, comuna FROM socios WHERE suspendido = 1')->fetchAll();
    responder(['ok' => true, 'moderador' => $mod['nombre'], 'admin' => (int)($mod['admin'] ?? 0) === 1, 'asamblea' => asamblea(), 'mensajes' => $msj, 'palabra' => $palabra,
               'votaciones' => $vot, 'bitacora' => $bit, 'suspendidos' => $suspendidos,
               'presentes' => (int)$db->query('SELECT COUNT(*) FROM socios WHERE visto > ' . ($ahora - 45))->fetchColumn()]);
}

solo_post();
$d = entrada();
switch ((string)($d['accion'] ?? '')) {
    case 'ocultar': case 'mostrar':
        $oc = $d['accion'] === 'ocultar' ? 1 : 0;
        $db->prepare('UPDATE mensajes SET oculto = ?, moderador = ? WHERE id = ?')->execute([$oc, $mod['nombre'], (int)$d['mensaje']]);
        anotar($d['accion'], 'mensaje ' . (int)$d['mensaje']); break;
    case 'suspender': case 'reactivar':
        $su = $d['accion'] === 'suspender' ? 1 : 0;
        $db->prepare('UPDATE socios SET suspendido = ?, palabra = CASE WHEN ? = 1 THEN NULL ELSE palabra END WHERE numero = ?')->execute([$su, $su, (int)$d['numero']]);
        if ($su && !empty($d['ocultar_todo'])) $db->prepare('UPDATE mensajes SET oculto = 1, moderador = ? WHERE socio_id = (SELECT id FROM socios WHERE numero = ?)')->execute([$mod['nombre'], (int)$d['numero']]);
        anotar($d['accion'], 'socio ' . (int)$d['numero']); break;
    case 'quitar_palabra':
        $db->prepare('UPDATE socios SET palabra = NULL WHERE numero = ?')->execute([(int)$d['numero']]);
        anotar('dar o quitar la palabra', 'socio ' . (int)$d['numero']); break;
    case 'limpiar_palabra':
        $db->exec('UPDATE socios SET palabra = NULL'); anotar('limpiar la fila de palabra', ''); break;
    case 'abrir_votacion':
        $preg = limpiar_texto((string)($d['pregunta'] ?? ''), 200);
        $ops = array_values(array_filter(array_map(fn($o) => limpiar_texto((string)$o, 60), (array)($d['opciones'] ?? [])), fn($o) => $o !== ''));
        if (mb_strlen($preg) < 5 || count($ops) < 2 || count($ops) > 6) error('La votación necesita una pregunta y entre 2 y 6 opciones.');
        $db->exec('UPDATE votaciones SET abierta = 0, cerrada = ' . $ahora . ' WHERE abierta = 1');
        $db->prepare('INSERT INTO votaciones (pregunta, opciones, abierta, creado) VALUES (?,?,1,?)')->execute([$preg, json_encode($ops, JSON_UNESCAPED_UNICODE), $ahora]);
        anotar('abrir votación', $preg); break;
    case 'cerrar_votacion':
        $db->prepare('UPDATE votaciones SET abierta = 0, cerrada = ? WHERE id = ?')->execute([$ahora, (int)$d['votacion']]);
        anotar('cerrar votación', 'votación ' . (int)$d['votacion']); break;
    default: error('Acción desconocida.');
}
invalidar_cache();
responder(['ok' => true]);
