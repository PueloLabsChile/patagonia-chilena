# Arma el paquete para subir a un hosting cPanel: dist/patagoniadechile-cpanel.zip
# Incluye config.php de producción (con sal aleatoria) y un instalador de un solo uso con nombre y clave aleatorios.
# Los secretos quedan solo en dist/ (ignorado por git).
#   python dev/empaquetar.py [dominio] [moderadores separados por coma]
import json, os, secrets, sys, time, zipfile, pathlib

RAIZ = pathlib.Path(__file__).resolve().parent.parent
DOMINIO = sys.argv[1] if len(sys.argv) > 1 else 'patagoniadechile.cl'
MODS = [m.strip() for m in (sys.argv[2] if len(sys.argv) > 2 else 'Moderación').split(',') if m.strip()]
DIST = RAIZ / 'dist'; DIST.mkdir(exist_ok=True)

INCLUIR = ['index.html', 'asamblea.html', 'moderacion.html', 'privacidad.html', '.htaccess', 'assets', 'datos', 'api']
EXCLUIR = {'api/config.php'}

sal = secrets.token_urlsafe(32)
clave = secrets.token_urlsafe(24)
nombre_inst = f'instalar-{secrets.token_hex(4)}.php'

config = f"""<?php
// Configuración de PRODUCCIÓN para {DOMINIO}. No subir a GitHub.
return [
    'db'              => dirname(__DIR__, 2) . '/patagonia_datos/patagonia.sqlite',   // fuera de la carpeta pública
    'sitio'           => 'https://{DOMINIO}/',
    'correo_de'       => 'no-responder@{DOMINIO}',
    'correo_contacto' => 'contacto@{DOMINIO}',
    'meta'            => 100000,
    'clp_por_ha'      => 280000,
    'sal'             => '{sal}',
    'max_por_ip_hora' => 12,
    'dev'             => false,
    'asamblea'        => [
        'titulo'        => 'Primera Asamblea Ciudadana',
        'inicio'        => '2026-12-05T19:00:00-03:00',
        'duracion_min'  => 150,
        'video'         => '',
        'forzar_estado' => '',
    ],
    'pausa_plaza'     => 20,
    'pausa_sesion'    => 8,
];
"""
inst = (RAIZ / 'dev' / 'instalar-plantilla.php').read_text(encoding='utf8')
inst = inst.replace('__CLAVE__', clave).replace('__NOMBRE__', nombre_inst).replace('__MODERADORES__', json.dumps(MODS, ensure_ascii=False))

def meter(z, nombre, datos):
    # permisos 644 y fecha actual: sin fecha, cPanel deja mtime 1980 y el servidor responde 304 con versiones viejas
    zi = zipfile.ZipInfo(nombre, date_time=time.localtime()[:6]); zi.external_attr = 0o644 << 16; zi.compress_type = zipfile.ZIP_DEFLATED
    z.writestr(zi, datos)

zip_ruta = DIST / f'{DOMINIO.split(".")[0]}-cpanel.zip'
n = 0
with zipfile.ZipFile(zip_ruta, 'w', zipfile.ZIP_DEFLATED) as z:
    for item in INCLUIR:
        p = RAIZ / item
        archivos = [p] if p.is_file() else [f for f in p.rglob('*') if f.is_file()]
        for f in archivos:
            rel = f.relative_to(RAIZ).as_posix()
            if rel in EXCLUIR or '__pycache__' in rel: continue
            meter(z, rel, f.read_bytes()); n += 1
    meter(z, 'api/config.php', config.encode('utf8')); meter(z, nombre_inst, inst.encode('utf8')); n += 2

url = f'https://{DOMINIO}/{nombre_inst}?clave={clave}'
(DIST / 'SECRETO-instalacion.txt').write_text(
    f'Instalador de un solo uso (no compartir):\n{url}\n\nSal de producción: {sal}\n', encoding='utf8')
print(f'{zip_ruta.name}: {n} archivos, {zip_ruta.stat().st_size // 1024} KB')
print('Instalador:', url)
