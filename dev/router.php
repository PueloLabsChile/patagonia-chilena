<?php
// Enrutador del servidor de desarrollo de PHP:
//   C:\Users\piali\tools\php81\php.exe -S 127.0.0.1:4410 -t . dev/router.php
$ruta = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if (preg_match('~^/(dev|scripts|\.git)(/|$)|^/api/(_comun|config|config\.ejemplo)\.php$|^/api/herramientas/~', $ruta)) { http_response_code(403); exit('403'); }
if (str_ends_with($ruta, '.geojson')) { header('Content-Type: application/geo+json'); readfile(__DIR__ . '/..' . $ruta); return true; }
return false;   // el servidor integrado sirve el archivo o ejecuta el .php
