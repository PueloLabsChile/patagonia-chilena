<?php
// Lista de socios (solo administrador). GET ?m=token → JSON · GET ?m=token&csv=1 → planilla CSV (Excel)
require __DIR__ . '/_comun.php';
$mod = moderador_actual();
if (!$mod) error('Enlace de moderación no válido.', 401);
if ((int)($mod['admin'] ?? 0) !== 1) error('Solo el administrador puede ver la lista de socios.', 403);
$nombres = [];
foreach (json_decode((string)file_get_contents(dirname(__DIR__) . '/datos/comunas.json'), true) ?: [] as $c) $nombres[(int)$c['c']] = $c['n'];
$filas = db()->query('SELECT numero, nombre, correo, comuna, region, apodo, actividad, actividad_detalle, creado, confirmado, compromiso, suspendido, ref, codigo,
                      (SELECT COUNT(*) FROM socios s2 WHERE s2.ref = socios.codigo AND s2.numero IS NOT NULL) invitados
                      FROM socios ORDER BY numero IS NULL, numero, id')->fetchAll();
foreach ($filas as &$f) { $f['comuna_nombre'] = $nombres[(int)$f['comuna']] ?? (string)$f['comuna']; $f['actividad_nombre'] = ACTIVIDADES[$f['actividad'] ?? ''] ?? ''; unset($f['codigo'], $f['ref']); }
unset($f);
db()->prepare('INSERT INTO bitacora (moderador, accion, detalle, creado) VALUES (?,?,?,?)')
    ->execute([$mod['nombre'], isset($_GET['csv']) ? 'descargar lista de socios' : 'ver lista de socios', count($filas) . ' registros', time()]);
if (isset($_GET['csv'])) {
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="socios-patagonia-' . date('Y-m-d') . '.csv"');
    header('Cache-Control: no-store');
    $o = fopen('php://output', 'w'); fwrite($o, "\xEF\xBB\xBF");
    fputcsv($o, ['N.º', 'Nombre', 'Correo', 'Comuna', 'Región', 'Actividad', 'Detalle actividad', 'Apodo', 'Inscrito', 'Confirmado', 'Compromiso mensual', 'Invitados', 'Suspendido'], ';');
    foreach ($filas as $f) fputcsv($o, [$f['numero'] ?? 'pendiente', $f['nombre'], $f['correo'], $f['comuna_nombre'], $f['region'], $f['actividad_nombre'], $f['actividad_detalle'], $f['apodo'],
        $f['creado'], $f['confirmado'], (int)$f['compromiso'], (int)$f['invitados'], (int)$f['suspendido'] ? 'sí' : ''], ';');
    exit;
}
responder(['ok' => true, 'socios' => $filas]);
