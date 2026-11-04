# Áreas protegidas y glaciares de Aysén y Magallanes desde OpenStreetMap (Overpass), simplificados.
#   datos/areas-protegidas.geojson   parques, reservas y monumentos nacionales (SNASPE y otros)
#   datos/glaciares.geojson          glaciares y campos de hielo (natural=glacier)
# Fuente: © colaboradores de OpenStreetMap (ODbL). Se cachea la respuesta cruda en scripts/cache/.
import json, os, sys, time, urllib.request, urllib.parse
import shapely
from shapely.geometry import LineString, Polygon, MultiPolygon, mapping
from shapely.ops import polygonize, unary_union
from pyproj import Geod

AQUI = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(AQUI, '..', 'datos')
CACHE = os.path.join(AQUI, 'cache'); os.makedirs(CACHE, exist_ok=True)
GEOD = Geod(ellps='WGS84')
BBOX = '-56.6,-76.5,-43.6,-66.3'   # s,w,n,e : Aysén + Magallanes continental
SERVIDORES = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']
UA = 'patagoniachilena-visor/0.1 (preparacion de capas)'

CONSULTAS = {
    'protegidas': f'''[out:json][timeout:300];
(
  relation["boundary"="protected_area"]({BBOX});
  way["boundary"="protected_area"]({BBOX});
  relation["boundary"="national_park"]({BBOX});
  way["boundary"="national_park"]({BBOX});
  relation["leisure"="nature_reserve"]({BBOX});
);
out geom;''',
    'glaciares': f'''[out:json][timeout:600][maxsize:1073741824];
(
  way["natural"="glacier"]({BBOX});
  relation["natural"="glacier"]({BBOX});
);
out geom;''',
}

def bajar(nombre):
    ruta = os.path.join(CACHE, nombre + '.json')
    if os.path.exists(ruta) and os.path.getsize(ruta) > 1000:
        return json.load(open(ruta, encoding='utf8'))
    datos = urllib.parse.urlencode({'data': CONSULTAS[nombre]}).encode()
    for intento in range(6):
        url = SERVIDORES[intento % len(SERVIDORES)]
        try:
            req = urllib.request.Request(url, data=datos, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=900) as r:
                crudo = r.read()
            open(ruta, 'wb').write(crudo)
            print(nombre, 'descargado', len(crudo) // 1024, 'KB de', url)
            return json.loads(crudo)
        except Exception as e:
            print(nombre, 'intento', intento + 1, url, e); time.sleep(20 * (intento + 1))
    sys.exit('no se pudo descargar ' + nombre)

def poligono(el):
    if el['type'] == 'way':
        g = el.get('geometry') or []
        if len(g) < 4: return None
        return Polygon([(p['lon'], p['lat']) for p in g])
    ext, inn = [], []
    for m in el.get('members', []):
        if m.get('type') != 'way' or not m.get('geometry'): continue
        ls = LineString([(p['lon'], p['lat']) for p in m['geometry']])
        (inn if m.get('role') == 'inner' else ext).append(ls)
    if not ext: return None
    pe = unary_union(list(polygonize(unary_union(ext))))
    if inn:
        pi = unary_union(list(polygonize(unary_union(inn))))
        pe = pe.difference(pi)
    return pe if not pe.is_empty else None

def km2(g):
    return abs(GEOD.geometry_area_perimeter(g)[0]) / 1e6

def limpiar(g, tol, amin):
    g = shapely.make_valid(g).simplify(tol, preserve_topology=True)
    ps = [p for p in (g.geoms if hasattr(g, 'geoms') else [g]) if p.geom_type == 'Polygon' and p.area >= amin]
    if not ps: return None
    g = MultiPolygon(ps) if len(ps) > 1 else ps[0]
    return shapely.set_precision(g, 1e-4)

def tipo_area(t):
    n = (t.get('name') or '').lower(); pc = str(t.get('protect_class', ''))
    if 'parque nacional' in n or t.get('boundary') == 'national_park' or pc == '2': return 'Parque nacional'
    if 'reserva nacional' in n or 'reserva forestal' in n: return 'Reserva nacional'
    if 'monumento natural' in n: return 'Monumento natural'
    if 'marin' in n or pc in ('4',) and 'mar' in n: return 'Área marina'
    if 'privad' in n or 'santuario' in n: return 'Santuario / privada'
    return 'Otra área protegida'

# ---- áreas protegidas
J = bajar('protegidas'); feats = []; vistos = set()
for el in J['elements']:
    t = el.get('tags', {}); nombre = t.get('name')
    if not nombre or (el['type'], el['id']) in vistos: continue
    vistos.add((el['type'], el['id']))
    g = poligono(el)
    if g is None: continue
    area = km2(shapely.make_valid(g))
    if area < 5: continue
    gs = limpiar(g, .003, 1e-5)
    if gs is None: continue
    feats.append({'type': 'Feature', 'properties': {'nombre': nombre, 'tipo': tipo_area(t), 'km2': round(area),
                  'osm': f"{el['type']}/{el['id']}"}, 'geometry': mapping(gs)})
feats.sort(key=lambda f: -f['properties']['km2'])
json.dump({'type': 'FeatureCollection', 'features': feats}, open(os.path.join(OUT, 'areas-protegidas.geojson'), 'w', encoding='utf8'),
          ensure_ascii=False, separators=(',', ':'))
print('áreas protegidas', len(feats))
for f in feats[:25]: print('  ', f['properties']['tipo'], '·', f['properties']['nombre'], f['properties']['km2'])

# ---- glaciares (se funden en una sola capa para aliviar el peso)
J = bajar('glaciares'); polys = []; total = 0; nombres = []
for el in J['elements']:
    g = poligono(el)
    if g is None: continue
    g = shapely.make_valid(g)
    a = km2(g)
    if a < .5: continue
    total += a
    polys.append(g.simplify(.002, preserve_topology=True))
    if el.get('tags', {}).get('name') and a > 50: nombres.append((round(a), el['tags']['name']))
u = unary_union(polys)
gs = limpiar(u, .002, 2e-5)
json.dump({'type': 'FeatureCollection', 'features': [{'type': 'Feature', 'properties': {'km2': round(km2(u))}, 'geometry': mapping(gs)}]},
          open(os.path.join(OUT, 'glaciares.geojson'), 'w', encoding='utf8'), separators=(',', ':'))
print('glaciares', len(polys), 'polígonos, total', round(km2(u)), 'km²')
for a, n in sorted(nombres, reverse=True)[:15]: print('  ', n, a)
