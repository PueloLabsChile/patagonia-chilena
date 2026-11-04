<?php
// Patagonia Chilena · utilidades comunes de la API (PHP 7.4+ con pdo_sqlite)
declare(strict_types=1);

$CFG = require __DIR__ . '/config.php';

function cfg(string $k) { global $CFG; return $CFG[$k]; }

function db(): PDO {
    static $pdo = null;
    if ($pdo) return $pdo;
    $ruta = cfg('db');
    if (!is_dir(dirname($ruta))) mkdir(dirname($ruta), 0750, true);
    $pdo = new PDO('sqlite:' . $ruta, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
    $pdo->exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
    $pdo->exec('CREATE TABLE IF NOT EXISTS socios (
        id INTEGER PRIMARY KEY,
        nombre TEXT NOT NULL,
        correo TEXT NOT NULL UNIQUE,
        comuna INTEGER NOT NULL,
        fundador INTEGER NOT NULL DEFAULT 1,
        token TEXT NOT NULL UNIQUE,
        codigo TEXT NOT NULL UNIQUE,
        ref TEXT,
        numero INTEGER UNIQUE,
        creado TEXT NOT NULL,
        confirmado TEXT,
        ip TEXT,
        envios INTEGER NOT NULL DEFAULT 0,
        ultimo_envio TEXT
    )');
    $pdo->exec('CREATE INDEX IF NOT EXISTS i_ref ON socios(ref)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS i_ip ON socios(ip, creado)');
    return $pdo;
}

function responder($datos, int $estado = 200): void {
    http_response_code($estado);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($datos, JSON_UNESCAPED_UNICODE);
    exit;
}

function ahora(): string { return gmdate('Y-m-d H:i:s'); }
function aleatorio(int $bytes): string { return rtrim(strtr(base64_encode(random_bytes($bytes)), '+/', '-_'), '='); }
function codigo_invitacion(): string {
    $abc = 'abcdefghjkmnpqrstuvwxyz23456789'; $s = '';
    for ($i = 0; $i < 7; $i++) $s .= $abc[random_int(0, strlen($abc) - 1)];
    return $s;
}
function ip_hash(): string { return substr(hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? '') . cfg('sal')), 0, 24); }

function enviar_correo(string $para, string $asunto, string $html): bool {
    $de = cfg('correo_de');
    $cab = [
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
        'From: Patagonia Chilena <' . $de . '>',
        'Reply-To: ' . cfg('correo_contacto'),
        'X-Mailer: patagoniachilena',
    ];
    $asunto = '=?UTF-8?B?' . base64_encode($asunto) . '?=';
    return @mail($para, $asunto, $html, implode("\r\n", $cab), '-f' . $de);
}

function plantilla_correo(string $nombre, string $enlace, string $baja, bool $yaConfirmado): string {
    $n = htmlspecialchars(explode(' ', trim($nombre))[0], ENT_QUOTES, 'UTF-8');
    $titulo = $yaConfirmado ? 'Aquí está tu acceso' : 'Confirma tu inscripción';
    $texto = $yaConfirmado
        ? 'Ya eras parte de Patagonia Chilena. Con este botón vuelves a ver tu número de socio fundador y tu enlace para invitar.'
        : 'Gracias por sumarte. Falta un paso: confirma tu correo y recibirás tu número de socio fundador.';
    $boton = $yaConfirmado ? 'Ver mi número' : 'Confirmar mi inscripción';
    return '<!doctype html><html><body style="margin:0;background:#06111b;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#06111b;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:520px;background:#0f2c40;border-radius:18px;padding:36px 30px;color:#e9f2f5">
<tr><td style="font:600 13px Arial;letter-spacing:2px;color:#a9dbe8;text-transform:uppercase">Patagonia Chilena</td></tr>
<tr><td style="padding:18px 0 8px;font:400 30px Georgia,serif;color:#ffffff">' . $titulo . ', ' . $n . '</td></tr>
<tr><td style="font:16px/1.6 Arial;color:#cfe0e7;padding-bottom:26px">' . $texto . '</td></tr>
<tr><td><a href="' . $enlace . '" style="display:inline-block;background:#d8261c;color:#ffffff;text-decoration:none;font:700 16px Arial;padding:15px 28px;border-radius:30px">' . $boton . '</a></td></tr>
<tr><td style="font:13px/1.6 Arial;color:#8aa4b3;padding-top:28px">Recuperemos la Patagonia, entre todos. Hoy no pedimos dinero: solo que te sumes y que invites a otros.<br><br>Si no fuiste tú, ignora este correo. <a href="' . $baja . '" style="color:#8aa4b3">Darme de baja y borrar mis datos</a>.</td></tr>
</table></td></tr></table></body></html>';
}
