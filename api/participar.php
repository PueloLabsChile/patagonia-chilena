<?php
// POST {t, accion, …} → acciones de un socio en la Asamblea:
//   apodo {apodo} · mensaje {texto, sala: plaza|sesion} · palabra {pedir: bool} · votar {votacion, opcion}
//   aplauso · denunciar {mensaje} · acreditar
require __DIR__ . '/_comun.php';
solo_post();
$d = entrada();
$accion = (string)($d['accion'] ?? '');
$db = db();
$ahora = time();

if ($accion === 'apodo') {
    $s = socio_actual(); if (!$s) error('Necesitas tu enlace de socio.', 401);
    $apodo = limpiar_texto((string)($d['apodo'] ?? ''), 24);
    if (!preg_match('/^[\p{L}\p{N} ._\-]{3,24}$/u', $apodo)) error('El apodo debe tener entre 3 y 24 letras, números, espacios, puntos o guiones.');
    if (filtrar($apodo) !== $apodo) error('Ese apodo no está permitido.');
    if (preg_match('/moderador|admin|patagonia\s*chilena|oficial/iu', $apodo)) error('Ese apodo está reservado.');
    $q = $db->prepare('SELECT 1 FROM socios WHERE apodo = ? COLLATE NOCASE AND id <> ?'); $q->execute([$apodo, $s['id']]);
    if ($q->fetchColumn()) error('Ese apodo ya lo eligió otra persona. Prueba con otro.');
    $db->prepare('UPDATE socios SET apodo = ? WHERE id = ?')->execute([$apodo, $s['id']]);
    invalidar_cache();
    responder(['ok' => true, 'apodo' => $apodo]);
}

$s = exigir_socio();

switch ($accion) {
    case 'mensaje':
        if (!$s['apodo']) error('Elige un apodo antes de escribir.');
        $sala = ($d['sala'] ?? '') === 'sesion' ? 'sesion' : 'plaza';
        if ($sala === 'sesion' && asamblea()['estado'] !== 'en_vivo') error('El chat de la sesión se abre cuando comienza la Asamblea. Mientras tanto, conversa en La Plaza.');
        $pausa = (int)cfg($sala === 'sesion' ? 'pausa_sesion' : 'pausa_plaza', 15);
        if ($s['ultimo_mensaje'] && $ahora - (int)$s['ultimo_mensaje'] < $pausa) error('Modo lento: espera ' . ($pausa - ($ahora - (int)$s['ultimo_mensaje'])) . ' segundos para volver a escribir.', 429);
        $texto = filtrar(limpiar_texto((string)($d['texto'] ?? ''), 280));
        if (mb_strlen($texto) < 2) error('Escribe un mensaje.');
        if (preg_match('~https?://|www\.~i', $texto)) error('Por seguridad, en el chat no se permiten enlaces.');
        $db->prepare('INSERT INTO mensajes (socio_id, sala, texto, creado) VALUES (?,?,?,?)')->execute([$s['id'], $sala, $texto, $ahora]);
        $db->prepare('UPDATE socios SET ultimo_mensaje = ?, visto = ? WHERE id = ?')->execute([$ahora, $ahora, $s['id']]);
        invalidar_cache();
        responder(['ok' => true, 'id' => (int)$db->lastInsertId()]);

    case 'palabra':
        if (asamblea()['estado'] !== 'en_vivo') error('Podrás pedir la palabra durante la sesión.');
        $pedir = !empty($d['pedir']);
        $db->prepare('UPDATE socios SET palabra = ? WHERE id = ?')->execute([$pedir ? $ahora : null, $s['id']]);
        invalidar_cache();
        responder(['ok' => true, 'palabra' => $pedir]);

    case 'votar':
        $q = $db->prepare('SELECT * FROM votaciones WHERE id = ? AND abierta = 1'); $q->execute([(int)($d['votacion'] ?? 0)]);
        $v = $q->fetch(); if (!$v) error('Esa votación no está abierta.');
        $op = (int)($d['opcion'] ?? -1);
        if ($op < 0 || $op >= count(json_decode($v['opciones'], true))) error('Opción no válida.');
        $db->prepare('INSERT INTO votos (votacion_id, socio_id, opcion, creado) VALUES (?,?,?,?) ON CONFLICT(votacion_id, socio_id) DO UPDATE SET opcion = excluded.opcion, creado = excluded.creado')
           ->execute([$v['id'], $s['id'], $op, $ahora]);
        invalidar_cache();
        responder(['ok' => true, 'voto' => $op]);

    case 'aplauso':
        if ($s['ultimo_aplauso'] && $ahora - (int)$s['ultimo_aplauso'] < 4) responder(['ok' => true]);
        $db->prepare('INSERT INTO aplausos (region, puesto, creado) VALUES (?,?,?)')->execute([$s['region'], $s['puesto'], $ahora]);
        $db->prepare('UPDATE socios SET ultimo_aplauso = ? WHERE id = ?')->execute([$ahora, $s['id']]);
        $db->prepare('DELETE FROM aplausos WHERE creado < ?')->execute([$ahora - 120]);
        invalidar_cache();
        responder(['ok' => true]);

    case 'denunciar':
        $mid = (int)($d['mensaje'] ?? 0);
        $q = $db->prepare('INSERT OR IGNORE INTO denuncias (mensaje_id, socio_id, creado) VALUES (?,?,?)'); $q->execute([$mid, $s['id'], $ahora]);
        if ($q->rowCount()) {
            $db->prepare('UPDATE mensajes SET denuncias = denuncias + 1 WHERE id = ?')->execute([$mid]);
            // con 5 denuncias se oculta solo, a la espera de un moderador
            $db->prepare("UPDATE mensajes SET oculto = 1, moderador = 'automático (5 denuncias)' WHERE id = ? AND denuncias >= 5")->execute([$mid]);
            invalidar_cache();
        }
        responder(['ok' => true]);

    case 'acreditar':
        $db->prepare('UPDATE socios SET acreditado = COALESCE(acreditado, ?) WHERE id = ?')->execute([ahora(), $s['id']]);
        invalidar_cache();
        responder(['ok' => true]);
}
error('Acción desconocida.');
