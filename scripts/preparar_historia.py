# Piezas del territorio para la historia de los límites.
# Fronteras internacionales: CShapes 2.0 (ETH Zürich / PRIO, CC BY-NC-SA 4.0), versiones de Chile 1886, 1899 y 1902.
# Antes de 1886 y los cortes internos (paralelo 24, Loa, Biobío, Toltén, etc.) son esquemáticos, según los tratados.
#   datos/historia-piezas.geojson : un polígono por pieza (propiedad «id»)
#   datos/historia-bordes.geojson : contornos de cada pieza como líneas (para «dibujar» las fronteras)
import json, os
import shapely
from shapely.geometry import shape, mapping, box, Polygon
from shapely.ops import unary_union

AQUI = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(AQUI, '..', 'datos')
J = json.load(open(os.path.join(AQUI, 'cache', 'cshapes', 'cshapes2.geojson'), encoding='utf8'))

def version(pais, desde):
    for f in J['features']:
        p = f['properties']
        if p['cntry_name'] == pais and p['gwsdate'].startswith(desde): return shapely.make_valid(shape(f['geometry']))
    raise SystemExit(f'no está {pais} {desde}')

CH1886, CH1899, CH1902 = version('Chile', '31.12.1885'), version('Chile', '23.03.1899'), version('Chile', '19.11.1902')
AR1902 = version('Argentina', '19.11.1902')
PE1886 = version('Peru', '31.12.1885')

CONT = CH1902.intersection(box(-80, -60, -60, -15))          # continente + islas cercanas (sin Rapa Nui ni Sala y Gómez)
banda = lambda g, sur, norte: g.intersection(box(-80, sur, -60, norte))

piezas = {
    # norte
    'arica':      banda(CONT, -19.22, -17.0),                # Arica y Parinacota (aprox. río Camarones)
    'tarapaca':   banda(CONT, -21.45, -19.22),               # hasta el río Loa
    'litoral':    banda(CONT, -24.0, -21.45),                # litoral boliviano hasta el paralelo 24
    'centro':     banda(CONT, -37.6, -24.0),                 # del paralelo 24 al Biobío
    'araucania':  banda(CONT, -39.3, -37.6),                 # entre el Biobío y el Toltén (aprox.)
    'valdivia':   banda(CONT, -41.45, -39.3),                # Valdivia y Osorno
    'chiloe':     banda(CONT, -43.8, -41.45),                # Chiloé, Llanquihue y Palena
    'aysen':      banda(CH1899, -49.0, -43.8),               # Aysén según la línea de 1899 (sin los valles en disputa)
    'magallanes': banda(CONT, -60, -49.0),
    'valles':     CH1902.difference(CH1899),                 # valles que el laudo de 1902 reconoció a Chile
    'puna':       CH1886.difference(CH1899),                 # Puna de Atacama, entregada a Argentina en 1899
    'rapanui':    CH1902.intersection(box(-110, -28, -104, -26)),
    'tacna':      PE1886.intersection(Polygon([(-71.6, -17.75), (-70.25, -17.25), (-69.45, -17.2), (-69.45, -18.4), (-71.6, -18.4)])),
    'patagonia_ar': AR1902.intersection(box(-75, -56, -60, -39.0)),   # Patagonia oriental reclamada por Chile hasta 1881 (aprox.)
    'antartica':  Polygon([(-90, -60), (-53, -60), (-53, -66.5), (-90, -66.5)]),
}
# la pieza «aysen» no debe incluir los valles; magallanes no debe pisar los valles
piezas['magallanes'] = piezas['magallanes'].difference(piezas['valles'])

def limpiar(g, tol, amin):
    g = shapely.make_valid(g).simplify(tol, preserve_topology=True)
    ps = [p for p in (g.geoms if hasattr(g, 'geoms') else [g]) if p.geom_type == 'Polygon' and p.area >= amin]
    if not ps: return None
    return shapely.set_precision(shapely.MultiPolygon(ps) if len(ps) > 1 else ps[0], 5e-4)

fs, bordes = [], []
for k, g in piezas.items():
    gl = limpiar(g, .004 if k != 'rapanui' else .002, 6e-5 if k not in ('rapanui',) else 1e-6)
    if gl is None: print('vacía', k); continue
    fs.append({'type': 'Feature', 'properties': {'id': k}, 'geometry': mapping(gl)})
    # contorno sin islotes pequeños para el efecto de trazo
    grandes = [p for p in (gl.geoms if hasattr(gl, 'geoms') else [gl]) if p.area > .02 or k == 'rapanui']
    lineas = [list(p.exterior.coords) for p in grandes]
    if lineas: bordes.append({'type': 'Feature', 'properties': {'id': k}, 'geometry': {'type': 'MultiLineString', 'coordinates': lineas}})
    print(f'{k:13s} {len(shapely.get_coordinates(gl)):6d} vértices')
json.dump({'type': 'FeatureCollection', 'features': fs}, open(os.path.join(OUT, 'historia-piezas.geojson'), 'w', encoding='utf8'), separators=(',', ':'))
json.dump({'type': 'FeatureCollection', 'features': bordes}, open(os.path.join(OUT, 'historia-bordes.geojson'), 'w', encoding='utf8'), separators=(',', ':'))
print('listo', os.path.getsize(os.path.join(OUT, 'historia-piezas.geojson')) // 1024, 'KB')
