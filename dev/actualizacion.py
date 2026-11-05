# Paquete de ACTUALIZACIÓN para producción: todo el sitio público SIN api/config.php (no pisa la configuración ni la base).
#   python dev/actualizacion.py  →  dist/actualizacion.zip
import pathlib, time, zipfile
R = pathlib.Path(__file__).resolve().parent.parent
INCLUIR = ['index.html', 'asamblea.html', 'moderacion.html', 'privacidad.html', '.htaccess', 'assets', 'datos', 'api']
EXCLUIR = {'api/config.php', 'api/config.ejemplo.php'}
dest = R / 'dist' / 'actualizacion.zip'; dest.parent.mkdir(exist_ok=True)
n = 0
with zipfile.ZipFile(dest, 'w', zipfile.ZIP_DEFLATED) as z:
    for item in INCLUIR:
        p = R / item
        for f in ([p] if p.is_file() else sorted(x for x in p.rglob('*') if x.is_file())):
            rel = f.relative_to(R).as_posix()
            if rel in EXCLUIR or '__pycache__' in rel: continue
            zi = zipfile.ZipInfo(rel, date_time=time.localtime()[:6]); zi.external_attr = 0o644 << 16; zi.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(zi, f.read_bytes()); n += 1
print(f'{dest.name}: {n} archivos, {dest.stat().st_size // 1024} KB (sin config.php)')
