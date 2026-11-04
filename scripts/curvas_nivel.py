# Curvas de nivel reales del macizo del Paine (Terrain Tiles, AWS/Mapzen) como textura SVG del sitio.
import io, urllib.request
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter
import contourpy

Z, X0, Y0 = 10, 304, 681          # teselas que cubren Torres del Paine
img = np.zeros((512, 512))
for dx in (0, 1):
    for dy in (0, 1):
        u = f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{Z}/{X0 + dx}/{Y0 + dy}.png'
        a = np.asarray(Image.open(io.BytesIO(urllib.request.urlopen(u, timeout=60).read())).convert('RGB')).astype(float)
        img[dy * 256:(dy + 1) * 256, dx * 256:(dx + 1) * 256] = a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768
img = gaussian_filter(np.clip(img, 0, None), 2.2)
gen = contourpy.contour_generator(z=img)
paths = []
for lev in range(150, 3100, 150):
    for seg in gen.lines(lev):
        if len(seg) < 24: continue
        seg = seg[::3]
        d = 'M' + ' L'.join(f'{x:.0f},{y:.0f}' for x, y in seg)
        paths.append(f'<path d="{d}" stroke-width="{.9 if lev % 600 == 0 else .45}"/>')
svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none" stroke="#c6d6ee" stroke-linejoin="round">{"".join(paths)}</svg>'
open('assets/img/curvas-paine.svg', 'w', encoding='utf8').write(svg)
print(len(paths), 'curvas,', len(svg) // 1024, 'KB')
