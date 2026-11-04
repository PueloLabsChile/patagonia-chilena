# Genera los límites del visor desde la cartografía oficial del INE (Censo 2024).
#   datos/chile-regiones.geojson     16 regiones, ~1,5 km (mapa de inscritos)
#   datos/patagonia-comunas.geojson  comunas de Aysén (11) y Magallanes (12), ~150 m, con superficie
#   datos/comunas.json               346 comunas con región y centroide (autocompletar + mapa de inscritos)
import sqlite3, json, os, shapely
from shapely.geometry import box, mapping
from pyproj import Geod

GPKG = r'C:/Users/piali/Desktop/propiedades/data/Cartografia_censo2024_Pais.gpkg'
OUT = os.path.join(os.path.dirname(__file__), '..', 'datos')
GEOD = Geod(ellps='GRS80')
# Corte sur: sin territorio antártico (la comuna Antártica se mide aparte en el texto)
CONTINENTE = box(-110, -56.6, -66, -17)

def geom(b):
    b = bytes(b); env = {0: 0, 1: 32, 2: 48, 3: 48, 4: 64}[(b[3] >> 1) & 7]
    return shapely.from_wkb(bytes(b[8 + env:]))

def redondear(g, d):
    return shapely.set_precision(g, 10 ** -d)

def km2(g):
    return abs(GEOD.geometry_area_perimeter(g)[0]) / 1e6

def sin_islotes(g, amin):
    if g.geom_type == 'MultiPolygon':
        ps = [p for p in g.geoms if p.area >= amin]
        return shapely.MultiPolygon(ps) if ps else g
    return g

c = sqlite3.connect('file:' + GPKG + '?mode=ro&immutable=1', uri=True)

# --- regiones
feats = []
for sh, cod, reg in c.execute('select SHAPE, COD_REGION, REGION from Regional_CPV24'):
    g = geom(sh).intersection(CONTINENTE)
    if g.is_empty: continue
    g = sin_islotes(g.simplify(.015, preserve_topology=True), .0004)
    feats.append({'type': 'Feature', 'properties': {'cod': int(cod), 'region': reg.title()},
                  'geometry': mapping(redondear(g, 3))})
json.dump({'type': 'FeatureCollection', 'features': feats},
          open(os.path.join(OUT, 'chile-regiones.geojson'), 'w', encoding='utf8'), ensure_ascii=False, separators=(',', ':'))
print('regiones', len(feats))

# --- comunas (todas, como puntos) + Patagonia (polígonos)
lista, pata = [], []
for sh, cut, cod, reg, prov, com in c.execute(
        'select SHAPE, CUT, COD_REGION, REGION, PROVINCIA, COMUNA from Comunal_CPV24 order by CUT'):
    g = geom(sh)
    gc = g.intersection(CONTINENTE)
    if gc.is_empty: gc = g
    p = gc.representative_point()
    lista.append({'c': int(cut), 'n': com.title().replace(' De ', ' de ').replace(' Del ', ' del ').replace(' La ', ' la ').replace(' Los ', ' los '),
                  'r': int(cod), 'x': round(p.x, 3), 'y': round(p.y, 3)})
    if int(cod) in (11, 12):
        area = km2(gc)
        gs = sin_islotes(gc.simplify(.0015, preserve_topology=True), 2e-6)
        pata.append({'type': 'Feature', 'properties': {
            'cut': int(cut), 'comuna': lista[-1]['n'], 'provincia': prov.title(), 'region': reg.title(),
            'cod': int(cod), 'km2': round(area)}, 'geometry': mapping(redondear(gs, 4))})
json.dump(lista, open(os.path.join(OUT, 'comunas.json'), 'w', encoding='utf8'), ensure_ascii=False, separators=(',', ':'))
json.dump({'type': 'FeatureCollection', 'features': pata},
          open(os.path.join(OUT, 'patagonia-comunas.geojson'), 'w', encoding='utf8'), ensure_ascii=False, separators=(',', ':'))
tot = {}
for f in pata: tot[f['properties']['region']] = tot.get(f['properties']['region'], 0) + f['properties']['km2']
print('comunas', len(lista), '· patagonia', len(pata), tot)
for f in pata: print('  ', f['properties']['comuna'], f['properties']['km2'])
