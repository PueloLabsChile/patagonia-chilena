<?php
// Datos adicionales que pidió gestión (página completar.html?t=TOKEN).
// GET ?t=… → nombre, preguntas pedidas (con opciones) y lo que ya respondió
// POST {t, valores:{clave: valor}} → guarda solo las respuestas pedidas
require __DIR__ . '/_comun.php';

$t = (string)(entrada()['t'] ?? $_GET['t'] ?? '');
if (!token_valido($t)) error('Este enlace no es válido.', 404);
$db = db();
$q = $db->prepare('SELECT * FROM socios WHERE token = ?'); $q->execute([$t]);
$s = $q->fetch();
if (!$s) error('Este enlace no es válido o tus datos fueron borrados.', 404);
$sol = $s['solicitud'] ? json_decode($s['solicitud'], true) : null;
$campos = $sol['campos'] ?? [];
$extra = $s['extra'] ? (json_decode($s['extra'], true) ?: []) : [];

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $actual = ['telefono' => $s['telefono'], 'actividad' => $s['actividad'], 'actividad_detalle' => $s['actividad_detalle'], 'comuna' => (int)$s['comuna']] + $extra;
    responder(['ok' => true, 'nombre' => explode(' ', trim($s['nombre']))[0], 'mensaje' => $sol['mensaje'] ?? '', 'respondido' => $s['respondido'],
               'preguntas' => array_map(fn($k) => ['clave' => $k, 'texto' => CAMPOS_DATOS[$k][0], 'tipo' => is_array(CAMPOS_DATOS[$k][1]) ? 'opciones' : CAMPOS_DATOS[$k][1],
                                                   'opciones' => is_array(CAMPOS_DATOS[$k][1]) ? CAMPOS_DATOS[$k][1] : null], array_values(array_filter($campos, fn($k) => isset(CAMPOS_DATOS[$k])))),
               'actividades' => ACTIVIDADES, 'actual' => $actual]);
}

solo_post();
if (!$campos) error('No hay datos pendientes para este enlace.');
$v = (array)(entrada()['valores'] ?? []);
$sets = []; $args = [];
foreach ($campos as $k) {
    if (!isset(CAMPOS_DATOS[$k])) continue;
    $tipo = CAMPOS_DATOS[$k][1];
    $x = trim((string)($v[$k] ?? ''));
    if ($k === 'telefono') {
        if ($x !== '' && !preg_match('/^\+?[\d\s()\-]{8,20}$/', $x)) error('Revisa el teléfono: usa solo números, por ejemplo +56 9 1234 5678.', 422);
        $sets[] = 'telefono = ?'; $args[] = $x ?: null;
    } elseif ($k === 'actividad') {
        $a = actividad_valida($x);
        $sets[] = 'actividad = ?'; $args[] = $a;
        $sets[] = 'actividad_detalle = ?'; $args[] = $a ? (limpiar_texto((string)($v['actividad_detalle'] ?? ''), 80) ?: null) : null;
    } elseif ($k === 'comuna') {
        $c = (int)$x;
        if ($c) {
            if ($c < 1101 || $c > 16305) error('Elige tu comuna de la lista.', 422);
            $region = intdiv($c, 1000);
            $sets[] = 'comuna = ?'; $args[] = $c;
            if ($s['numero'] && (int)$s['region'] !== $region) {
                $p = $db->prepare('SELECT COALESCE(MAX(puesto), 0) + 1 FROM socios WHERE region = ? AND numero IS NOT NULL'); $p->execute([$region]);
                $sets[] = 'region = ?'; $args[] = $region; $sets[] = 'puesto = ?'; $args[] = (int)$p->fetchColumn();
            }
        }
    } elseif ($tipo === 'anio') {
        if ($x !== '' && (!ctype_digit($x) || (int)$x < 1910 || (int)$x > (int)date('Y') - 12)) error('Revisa el año de nacimiento.', 422);
        if ($x === '') unset($extra[$k]); else $extra[$k] = (int)$x;
    } elseif (is_array($tipo)) {
        if ($x !== '' && !in_array($x, $tipo, true)) error('Elige una de las opciones.', 422);
        if ($x === '') unset($extra[$k]); else $extra[$k] = $x;
    } else {
        $x = limpiar_texto($x, 600);
        if ($x === '') unset($extra[$k]); else $extra[$k] = $x;
    }
}
$sets[] = 'extra = ?'; $args[] = $extra ? json_encode($extra, JSON_UNESCAPED_UNICODE) : null;
$sets[] = 'respondido = ?'; $args[] = ahora();
$args[] = $s['id'];
$db->prepare('UPDATE socios SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($args);
$db->prepare('INSERT INTO bitacora (moderador, accion, detalle, creado) VALUES (?,?,?,?)')->execute(['socio', 'respondió datos', ($s['numero'] ? 'n.º ' . $s['numero'] : 'pendiente') . ' · ' . $s['nombre'], time()]);
invalidar_cache();
responder(['ok' => true]);
