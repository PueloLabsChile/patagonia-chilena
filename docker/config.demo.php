<?php
// Configuración del DEMO (Render). Datos de prueba, sin envío de correos: el enlace de confirmación se muestra en pantalla.
$sitio = rtrim(getenv('RENDER_EXTERNAL_URL') ?: 'http://localhost:10000', '/') . '/';
return [
    'db'              => '/var/www/datos/demo.sqlite',
    'sitio'           => $sitio,
    'correo_de'       => 'no-responder@patagoniachilena.cl',
    'correo_contacto' => 'contacto@patagoniachilena.cl',
    'meta'            => 100000,
    'sal'             => getenv('DEMO_CLAVE') ?: 'demo',
    'max_por_ip_hora' => 200,
    'dev'             => true,
    'asamblea'        => ['titulo' => 'Primera Asamblea Ciudadana', 'inicio' => '2026-12-05T19:00:00-03:00', 'duracion_min' => 150,
                          'video' => getenv('DEMO_VIDEO') ?: '', 'forzar_estado' => getenv('DEMO_ESTADO') ?: ''],
    'pausa_plaza'     => 20,
    'pausa_sesion'    => 8,
];
