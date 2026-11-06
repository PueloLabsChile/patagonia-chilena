# Pone un número de versión nuevo a CSS/JS (en HTML y en los import de los módulos) para que los navegadores bajen lo nuevo.
import pathlib, re, time
R = pathlib.Path(__file__).resolve().parent.parent
V = str(int(time.time()))
for a in ['index.html', 'asamblea.html', 'moderacion.html', 'privacidad.html', 'gestion.html']:
    p = R / a; t = p.read_text(encoding='utf8')
    p.write_text(re.sub(r'(assets/(?:css|js)/[a-z\-]+\.(?:css|js))(\?v=\d+)?"', lambda m: f'{m.group(1)}?v={V}"', t), encoding='utf8')
# Observatorio (carpeta propia: obs.css, obs.js y módulos obs-*.js)
p = R / 'observatorio/index.html'; t = p.read_text(encoding='utf8')
p.write_text(re.sub(r'(obs[a-z\-]*\.(?:css|js))(\?v=\d+)?"', lambda m: f'{m.group(1)}?v={V}"', t), encoding='utf8')
for p in list((R / 'assets/js').glob('*.js')) + list((R / 'observatorio').glob('obs*.js')):
    t = p.read_text(encoding='utf8')
    t2 = re.sub(r"from '\./([a-z\-]+\.js)(\?v=\d+)?'", lambda m: f"from './{m.group(1)}?v={V}'", t)
    if t2 != t: p.write_text(t2, encoding='utf8')
print('versión', V)
