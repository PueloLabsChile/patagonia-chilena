<?php
// Copiar como config.php en el hosting y completar. config.php NO se sube al repositorio.
return [
    // La base queda FUERA de public_html para que no se pueda descargar.
    'db'              => dirname(__DIR__, 2) . '/patagonia_datos/patagonia.sqlite',
    'sitio'           => 'https://patagoniachilena.cl/',
    'correo_de'       => 'no-responder@patagoniachilena.cl',   // crear esta casilla en cPanel
    'correo_contacto' => 'contacto@patagoniachilena.cl',
    'meta'            => 100000,
    'clp_por_ha'      => 280000,   // referencia: US$ 294/ha (predio de Cochamó) × dólar ~950
    'sal'             => 'CAMBIAR-POR-UNA-FRASE-LARGA-Y-SECRETA',
    'max_por_ip_hora' => 12,
    'dev'             => false,   // true solo en el computador de desarrollo: no envía correos y devuelve el enlace
    'asamblea'        => [
        'titulo'        => 'Primera Asamblea Ciudadana',
        'inicio'        => '2026-12-05T19:00:00-03:00',   // sábado 5 de diciembre, 19:00 de Chile continental
        'duracion_min'  => 150,
        'video'         => '',            // enlace de YouTube en vivo (https://www.youtube.com/watch?v=…) cuando exista
        'forzar_estado' => '',            // '', 'antes', 'en_vivo' o 'despues' (para ensayos)
    ],
    // segundos entre mensajes por persona
    'pausa_plaza'     => 20,
    'pausa_sesion'    => 8,
];
