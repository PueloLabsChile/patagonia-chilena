<?php
// Copiar como config.php en el hosting y completar. config.php NO se sube al repositorio.
return [
    // La base queda FUERA de public_html para que no se pueda descargar.
    'db'              => dirname(__DIR__, 2) . '/patagonia_datos/patagonia.sqlite',
    'sitio'           => 'https://patagoniachilena.cl/',
    'correo_de'       => 'no-responder@patagoniachilena.cl',   // crear esta casilla en cPanel
    'correo_contacto' => 'contacto@patagoniachilena.cl',
    'meta'            => 100000,
    'sal'             => 'CAMBIAR-POR-UNA-FRASE-LARGA-Y-SECRETA',
    // Límites anti-abuso
    'max_por_ip_hora' => 12,
];
