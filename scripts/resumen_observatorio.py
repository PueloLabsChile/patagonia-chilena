# Cifras del panel derecho del Observatorio (por región y total) → observatorio/datos/resumen.json
#   python scripts/resumen_observatorio.py   (después de preparar_observatorio.py)
import json, os, datetime
import shapely
from shapely.geometry import shape
from shapely.ops import unary_union
from pyproj import Geod

R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = os.path.join(R, 'observatorio', 'datos')
G = Geod(ellps='WGS84')
km2 = lambda g: abs(G.geometry_area_perimeter(g)[0]) / 1e6
def leer(n): return json.load(open(os.path.join(D, n + '.json'), encoding='utf8'))['features']

com = json.load(open(os.path.join(R, 'datos', 'patagonia-comunas.geojson'), encoding='utf8'))['features']
REG = {}
for f in com:
    r = f['properties']['region']; REG.setdefault(r, []).append(shapely.make_valid(shape(f['geometry'])))
TIERRA = {r: unary_union(gs) for r, gs in REG.items()}
for g in TIERRA.values(): shapely.prepare(g)
COMUNAS = [(f['properties']['region'], shapely.make_valid(shape(f['geometry']))) for f in com]
for _, g in COMUNAS: shapely.prepare(g)

def region_de(g):
    p = g.representative_point() if g.geom_type != 'Point' else g
    for r, cg in COMUNAS:
        if cg.contains(p): return r
    return min(COMUNAS, key=lambda c: c[1].distance(p))[0]

res = {r: {'superficie_km2': round(km2(g))} for r, g in TIERRA.items()}
def suma(r, k, v=1):
    res[r][k] = round(res[r].get(k, 0) + v, 2)

# áreas protegidas oficiales (solo la parte terrestre, sin doble conteo)
ap = [shapely.make_valid(shape(f['geometry'])) for f in leer('areas-protegidas') if f['properties'].get('grupo') == 'Área protegida']
priv = [shapely.make_valid(shape(f['geometry'])) for f in leer('areas-protegidas') if f['properties'].get('grupo') == 'Conservación privada']
U = unary_union([g.buffer(0) for g in ap]); UP = unary_union([g.buffer(0) for g in priv]) if priv else None
for r, t in TIERRA.items():
    res[r]['protegida_km2'] = round(km2(U.intersection(t)))
    res[r]['privada_km2'] = round(km2(UP.intersection(t))) if UP else 0
    res[r]['protegida_pct'] = round(100 * res[r]['protegida_km2'] / res[r]['superficie_km2'], 1)
for f in leer('areas-protegidas'):
    if f['properties'].get('grupo') == 'Área protegida': suma(region_de(shape(f['geometry'])), 'n_protegidas')
for f in leer('glaciares'):
    g = shape(f['geometry']); r = region_de(g); suma(r, 'n_glaciares'); suma(r, 'glaciares_km2', f['properties'].get('area_km2') or f['properties'].get('km2') or 0)
for f in leer('predios-fiscales'):
    r = region_de(shape(f['geometry'])); suma(r, 'n_predios_fiscales'); suma(r, 'predios_fiscales_ha', f['properties'].get('ha') or 0)
for f in leer('acuicultura'):
    p = f['properties']; r = region_de(shape(f['geometry']))
    suma(r, 'n_concesiones' if p.get('tramite') == 'Concesión' else 'n_solicitudes'); suma(r, 'acuicultura_ha', p.get('ha') or 0)
for f in leer('proyectos-seia'):
    p = f['properties']; r = region_de(shape(f['geometry']))
    suma(r, 'n_seia');
    if p.get('via') == 'EIA': suma(r, 'n_eia')
    if (p.get('estado') or '').lower().startswith('en calificaci'): suma(r, 'n_seia_en_evaluacion')
for f in leer('estaciones-dga'):
    suma(region_de(shape(f['geometry'])), 'n_estaciones')

tot = {}
for v in res.values():
    for k, x in v.items():
        if not k.endswith('_pct'): tot[k] = round(tot.get(k, 0) + x, 2)
tot['protegida_pct'] = round(100 * tot['protegida_km2'] / tot['superficie_km2'], 1)
out = {'generado': datetime.date.today().isoformat(), 'regiones': res, 'total': tot}
json.dump(out, open(os.path.join(D, 'resumen.json'), 'w', encoding='utf8'), ensure_ascii=False, indent=1)
print(json.dumps(out, ensure_ascii=False, indent=1))
