# Recorta áreas protegidas y glaciares al territorio chileno de Aysén y Magallanes y calcula datos/cifras.json.
# Requiere haber corrido preparar_limites.py y preparar_capas_osm.py.
import json, os, re
import shapely
from shapely.geometry import shape, mapping, MultiPolygon
from shapely.ops import unary_union
from pyproj import Geod

D = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'datos')
GEOD = Geod(ellps='WGS84')
km2 = lambda g: abs(GEOD.geometry_area_perimeter(g)[0]) / 1e6
leer = lambda n: json.load(open(os.path.join(D, n), encoding='utf8'))
def escribir(n, fc): json.dump(fc, open(os.path.join(D, n), 'w', encoding='utf8'), ensure_ascii=False, separators=(',', ':'))

def poligonal(g, amin=1e-5):
    ps = [p for p in (g.geoms if hasattr(g, 'geoms') else [g]) if p.geom_type == 'Polygon' and p.area >= amin]
    return None if not ps else (MultiPolygon(ps) if len(ps) > 1 else ps[0])

com = leer('patagonia-comunas.geojson')
# aligerar para la web conservando los bordes compartidos entre comunas (~250 m)
gs = shapely.coverage_simplify([shapely.make_valid(shape(f['geometry'])) for f in com['features']], .005)
for f, g in zip(com['features'], gs):
    g = poligonal(shapely.make_valid(g), 4e-5) or g
    f['geometry'] = mapping(shapely.set_precision(g, 1e-4))
    f['properties']['region'] = 'Aysén' if f['properties']['cod'] == 11 else 'Magallanes'
escribir('patagonia-comunas.geojson', com)
# la comuna Antártica no viene en la cartografía del INE: se agrega a la lista para inscribirse
lista = leer('comunas.json')
if not any(c['c'] == 12202 for c in lista):
    lista.append({'c': 12202, 'n': 'Antártica', 'r': 12, 'x': -58.9, 'y': -62.2})
    lista.sort(key=lambda c: c['c']); escribir('comunas.json', lista)
pata =shapely.make_valid(unary_union([shape(f['geometry']).buffer(0) for f in com['features']]))
km2_reg = {}
for f in com['features']: km2_reg[f['properties']['cod']] = km2_reg.get(f['properties']['cod'], 0) + f['properties']['km2']
km2_tot = sum(km2_reg.values())


# áreas protegidas: fuera reservas de la biósfera (no son figura legal), Argentina y solapes de mar
EXCLUIR = re.compile(r'bi[oó]sfera|provincial|tucu|meseta espinosa', re.I)
ar = leer('areas-protegidas.geojson'); nuevas = []
for f in ar['features']:
    p = f['properties']
    if EXCLUIR.search(p['nombre']): continue
    g = shapely.make_valid(shape(f['geometry'])).intersection(pata)
    g = poligonal(g)
    if g is None: continue
    a = km2(g)
    if a < 5: continue
    p['km2'] = round(a)
    gw = poligonal(shapely.make_valid(g.simplify(.004, preserve_topology=True)), 3e-5) or g
    nuevas.append({'type': 'Feature', 'properties': p, 'geometry': mapping(shapely.set_precision(gw, 5e-4))})
nuevas.sort(key=lambda f: -f['properties']['km2'])
escribir('areas-protegidas.geojson', {'type': 'FeatureCollection', 'features': nuevas})
prot = unary_union([shape(f['geometry']).buffer(0) for f in nuevas])  # sobre la versión liviana: error < 1 %
km2_prot = km2(prot.intersection(pata))
print('áreas', len(ar['features']), '->', len(nuevas), '· protegido', round(km2_prot), 'km²', round(100 * km2_prot / km2_tot, 1), '%')
for f in nuevas[:15]: print('  ', f['properties']['tipo'], f['properties']['nombre'], f['properties']['km2'])

# glaciares: solo lado chileno
gl = leer('glaciares.geojson')
g = poligonal(shapely.make_valid(shape(gl['features'][0]['geometry'])).intersection(pata), 2e-5)
km2_gl = km2(g)
escribir('glaciares.geojson', {'type': 'FeatureCollection', 'features': [{'type': 'Feature', 'properties': {'km2': round(km2_gl)}, 'geometry': mapping(shapely.set_precision(g, 1e-4))}]})
print('glaciares chilenos', round(km2_gl), 'km²')

# porcentaje de Chile (sin territorio antártico), con las regiones del INE
reg = leer('chile-regiones.geojson')
km2_chile = sum(km2(shape(f['geometry'])) for f in reg['features'])
cifras = {
    'km2_aysen': round(km2_reg.get(11, 0)), 'km2_magallanes': round(km2_reg.get(12, 0)), 'km2_total': round(km2_tot),
    'pct_chile': round(100 * km2_tot / km2_chile, 1), 'n_comunas': len(com['features']),
    'km2_glaciar': round(km2_gl), 'km2_protegido': round(km2_prot), 'pct_protegido': round(100 * km2_prot / km2_tot, 1),
    'km2_chile_sin_antartica': round(km2_chile),
}
escribir('cifras.json', cifras)
print(cifras)
