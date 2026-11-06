# Capas públicas del Observatorio Patagonia (Aysén + Magallanes) → observatorio/datos/*.json
# Descarga desde servicios oficiales (ArcGIS REST del MMA/SIMBIO, Subpesca y MOP) y archivos del Ministerio de Bienes Nacionales,
# recorta a las regiones XI y XII, simplifica y deja atributos legibles. Las respuestas crudas se guardan en scripts/cache/obs/.
#   python scripts/preparar_observatorio.py            (usa la caché si existe)
#   python scripts/preparar_observatorio.py --fresco   (vuelve a descargar todo)
import json, os, sys, time, urllib.request, urllib.parse, glob, datetime
import shapely, geopandas as gpd
from shapely.geometry import shape, mapping
from shapely.ops import unary_union
from pyproj import Geod

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
OUT = os.path.join(RAIZ, 'observatorio', 'datos'); os.makedirs(OUT, exist_ok=True)
CACHE = os.path.join(AQUI, 'cache', 'obs'); os.makedirs(CACHE, exist_ok=True)
FRESCO = '--fresco' in sys.argv
GEOD = Geod(ellps='WGS84')
UA = 'Mozilla/5.0 (ObservatorioPatagonia; preparacion de capas publicas)'
BBOX = (-76.5, -56.6, -66.3, -43.6)
MMA = 'https://arcgis.mma.gob.cl/server/rest/services/SIMBIO'
SSP = 'https://geoportal.subpesca.cl/server/rest/services/IDE_PUBLICO'
MOP = 'https://rest-sit.mop.gob.cl/arcgis/rest/services'

# zona de recorte: comunas de Aysén y Magallanes con un margen de mar (fiordos, canales, concesiones)
com = json.load(open(os.path.join(RAIZ, 'datos', 'patagonia-comunas.geojson'), encoding='utf8'))
TIERRA = unary_union([shapely.make_valid(shape(f['geometry'])) for f in com['features']])
ZONA = TIERRA.simplify(.01).buffer(.35, quad_segs=2).simplify(.02)
shapely.prepare(ZONA)
COMUNAS = [(f['properties']['comuna'], f['properties']['region'], shapely.make_valid(shape(f['geometry']))) for f in com['features']]
for c in COMUNAS: shapely.prepare(c[2])

def comuna_de(g):
    p = g.representative_point()
    for n, r, cg in COMUNAS:
        if cg.contains(p): return n, r
    best = min(COMUNAS, key=lambda c: c[2].distance(p))
    return best[0], best[1]

def km2(g): return abs(GEOD.geometry_area_perimeter(g)[0]) / 1e6

def http(url, datos=None, intentos=5):
    for i in range(intentos):
        try:
            req = urllib.request.Request(url, data=datos, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=180) as r: return r.read()
        except Exception as e:
            print('   reintento', i + 1, e); time.sleep(5 * (i + 1))
    raise SystemExit('no se pudo descargar ' + url)

def arcgis(nombre, capa, campos='*', donde='1=1', offset=None, pagina=1000, geojson=True, paginar=True):
    """Descarga paginada de una capa ArcGIS REST dentro del bbox, en WGS84. Devuelve lista de features GeoJSON."""
    ruta = os.path.join(CACHE, nombre + '.json')
    if os.path.exists(ruta) and not FRESCO: return json.load(open(ruta, encoding='utf8'))
    feats, salto = [], 0
    while True:
        q = {'where': donde, 'geometry': ','.join(map(str, BBOX)), 'geometryType': 'esriGeometryEnvelope', 'inSR': 4326,
             'spatialRel': 'esriSpatialRelIntersects', 'outFields': campos, 'outSR': 4326, 'returnGeometry': 'true',
             'f': 'geojson' if geojson else 'json'}
        if paginar: q.update(resultOffset=salto, resultRecordCount=pagina)
        if offset: q['maxAllowableOffset'] = offset
        d = json.loads(http(capa + '/query', urllib.parse.urlencode(q).encode()))
        if 'error' in d: raise SystemExit(f"{nombre}: {d['error']}")
        lote = d.get('features', [])
        if not geojson: lote = [esri_a_geojson(f) for f in lote]
        feats += [f for f in lote if f and f.get('geometry')]
        print(f'   {nombre}: {len(feats)}')
        if not paginar or len(lote) < pagina and not d.get('exceededTransferLimit') and not d.get('properties', {}).get('exceededTransferLimit'): break
        salto += len(lote)
        if not lote: break
    json.dump(feats, open(ruta, 'w', encoding='utf8'))
    return feats

def esri_a_geojson(f):
    g = f.get('geometry') or {}
    if 'x' in g: geom = {'type': 'Point', 'coordinates': [g['x'], g['y']]}
    elif 'paths' in g: geom = {'type': 'MultiLineString', 'coordinates': g['paths']}
    else: return None
    return {'type': 'Feature', 'properties': f.get('attributes', {}), 'geometry': geom}

def guardar(nombre, feats, prec=5):
    for f in feats:
        f['geometry'] = mapping(shapely.set_precision(f['geometry'], 10 ** -prec)) if not isinstance(f['geometry'], dict) else f['geometry']
    fc = {'type': 'FeatureCollection', 'features': feats}
    ruta = os.path.join(OUT, nombre + '.json')
    json.dump(fc, open(ruta, 'w', encoding='utf8'), ensure_ascii=False, separators=(',', ':'))
    print(f'→ {nombre}.json  {len(feats)} elementos  {os.path.getsize(ruta) // 1024} KB')
    return len(feats)

def poligonos(feats, props_fn, tol, amin_km2=0.0, en_zona=True):
    out = []
    for f in feats:
        g = shapely.make_valid(shape(f['geometry']))
        if en_zona and not ZONA.intersects(g): continue
        a = km2(g)
        if a < amin_km2: continue
        t_ = tol * (3 if a > 2000 else 2 if a > 300 else 1) if tol and tol >= .001 else tol
        gs = g.simplify(t_, preserve_topology=True) if tol else g
        ps = [p for p in getattr(gs, 'geoms', [gs]) if p.geom_type in ('Polygon', 'MultiPolygon') and not p.is_empty]
        if not ps: continue
        pl = [q for p_ in ps for q in getattr(p_, 'geoms', [p_]) if q.geom_type == 'Polygon']
        if a > 2000: pl = sorted(pl, key=lambda q: -q.area)[:1] + [q for q in sorted(pl, key=lambda q: -q.area)[1:] if q.area > 3e-5]
        gs = shapely.make_valid(pl[0] if len(pl) == 1 else shapely.MultiPolygon(pl))
        p = props_fn(f.get('properties') or {}, g)
        if p is None: continue
        p.setdefault('km2', round(a, 3 if a < 10 else 1))
        out.append({'type': 'Feature', 'properties': p, 'geometry': gs})
    return out

def puntos(feats, props_fn):
    out = []
    for f in feats:
        g = shape(f['geometry'])
        if g.geom_type == 'MultiPoint': g = g.geoms[0]
        if not ZONA.contains(g): continue
        p = props_fn(f.get('properties') or {}, g)
        if p is not None: out.append({'type': 'Feature', 'properties': p, 'geometry': g})
    return out

def txt(v):
    if v is None: return None
    v = str(v).strip()
    return v or None

def fecha(ms):
    try: return datetime.datetime.utcfromtimestamp(int(ms) / 1000).strftime('%Y-%m-%d') if ms not in (None, '') else None
    except Exception: return txt(ms)

def limpio(d): return {k: v for k, v in d.items() if v not in (None, '', 'Null', 'NULL')}

resumen = {}

# ---------------- 1. Predios fiscales administrados (Bienes Nacionales) ----------------
print('1 · propiedad fiscal (MBN)')
def leer_shp(carpeta):
    f = glob.glob(os.path.join(CACHE, carpeta, '*.shp'))[0]
    g = gpd.read_file(f, encoding='latin1')
    return g.to_crs(4326) if g.crs and g.crs.to_epsg() != 4326 else g
g = leer_shp('fiscal')
g = g[g['REGION'].str.contains('AYS|MAGALL', case=False, na=False)]
feats = []
for _, r in g.iterrows():
    if r.geometry is None: continue
    geo = shapely.make_valid(r.geometry)
    a = km2(geo)
    feats.append({'type': 'Feature', 'geometry': geo.simplify(.00005, preserve_topology=True),
                  'properties': limpio({'rol': txt(r['ROL']), 'comuna': txt(r['COMUNA']).title() if txt(r['COMUNA']) else None,
                                        'condicion': txt(r['CONDICION']).capitalize() if txt(r['CONDICION']) else None,
                                        'id_catastro': int(r['IDUC']) if r['IDUC'] == r['IDUC'] else None,
                                        'ha': round(a * 100, 2)})})
resumen['predios_fiscales'] = guardar('predios-fiscales', feats, 6)

# ---------------- 2. Bienes Nacionales Protegidos ----------------
print('2 · bienes nacionales protegidos (MBN)')
g = leer_shp('bnp'); g = g[g['REGION'].str.contains('AYS|MAGALL', case=False, na=False)]
feats = [{'type': 'Feature', 'geometry': shapely.make_valid(r.geometry).simplify(.0005, preserve_topology=True),
          'properties': limpio({'nombre': txt(r['NOMBRE_UNI']).title() if txt(r['NOMBRE_UNI']) else None, 'categoria': 'Bien Nacional Protegido',
                                'comuna': txt(r['COMUNA']).title() if txt(r['COMUNA']) else None, 'decreto': txt(r['DECRETO']),
                                'plano': txt(r['NUM_PLANO']), 'ha': round(float(r['_SUPERFICI']), 1) if r['_SUPERFICI'] == r['_SUPERFICI'] else None})}
         for _, r in g.iterrows() if r.geometry is not None]
resumen['bnp'] = guardar('bienes-protegidos', feats)

# ---------------- 3. Áreas protegidas oficiales (MMA · Registro Nacional de Áreas Protegidas) ----------------
print('3 · áreas protegidas (MMA)')
def ap_props(tipo):
    def fn(p, g):
        return limpio({'nombre': txt(p.get('NombreOriginal')), 'designacion': txt(p.get('designacion')), 'grupo': tipo,
                       'tipo': txt(p.get('TipoDesignacion')), 'desde': txt(p.get('AnoInicioProteccion')), 'autoridad': txt(p.get('Autoridad')),
                       'ha_decreto': p.get('SuperficieDecreto'), 'ficha': txt(p.get('URL_SIMBIO'))})
    return fn
ap = poligonos(arcgis('mma_ap', MMA + '/SIMBIO_AP/MapServer/0', offset=.001), ap_props('Área protegida'), .001)
ap += poligonos(arcgis('mma_privada', MMA + '/SIMBIO_AP/MapServer/3', offset=.0005), ap_props('Conservación privada'), .0005)
ap += poligonos(arcgis('mma_otras', MMA + '/SIMBIO_AP/MapServer/1', offset=.001), ap_props('Otra designación'), .001)
ap.sort(key=lambda f: -f['properties']['km2'])
resumen['areas_protegidas'] = guardar('areas-protegidas', ap)
sp = poligonos(arcgis('mma_sitios', MMA + '/SIMBIO_AP/MapServer/2', offset=.001), ap_props('Sitio prioritario'), .001)
resumen['sitios_prioritarios'] = guardar('sitios-prioritarios', sp)

# ---------------- 4. Áreas marinas protegidas (Subpesca) ----------------
print('4 · áreas marinas protegidas (Subpesca)')
P = 'REP_SUBPESCA2.ADM_UCB.CONS_SSP_T_AMP.'
amp = poligonos(arcgis('ssp_amp', SSP + '/SRMPUB_AMARINAS_PROT/MapServer/0', offset=.001, paginar=False),
                lambda p, g: limpio({'nombre': txt(p.get(P + 'NOMBRE')), 'tipo': txt(p.get(P + 'C_TIPOAMP')), 'decreto': txt(p.get(P + 'N_DCTOAPRUEBA')),
                                     'institucion': txt(p.get(P + 'INSTITUCION'))}), .001)
resumen['areas_marinas'] = guardar('areas-marinas', amp)

# ---------------- 5. Glaciares (Inventario Público de Glaciares, DGA) ----------------
print('5 · glaciares (DGA)')
def gla(p, g):
    return limpio({'nombre': txt(p.get('NOMBRE')), 'codigo': txt(p.get('COD_GLA')), 'clase': txt(p.get('CLASIFICA')),
                   'area_km2': round(p['AREA_Km2'], 3) if p.get('AREA_Km2') else None, 'cuenca': txt(p.get('NOMB_CUEN')),
                   'h_max': p.get('HMAX'), 'h_min': p.get('HMINTOTAL'), 'vol_km3': round(p['VOL_M3'] / 1e9, 4) if p.get('VOL_M3') else None,
                   'fuente': txt(p.get('FUENTE_DIG')), 'fecha_fuente': txt(p.get('FUENTE_FEC'))})
gl = poligonos(arcgis('dga_glaciares_05', MMA + '/SIMBIO_INVENTARIOS_MOP/MapServer/1', offset=.0005, pagina=1000,
                      campos='NOMBRE,COD_GLA,CLASIFICA,AREA_Km2,NOMB_CUEN,HMAX,HMINTOTAL,VOL_M3,FUENTE_DIG,FUENTE_FEC'), gla, .0005, .05)
resumen['glaciares'] = guardar('glaciares', gl, 4)

# ---------------- 6. Lagos (inventario DGA) ----------------
print('6 · lagos (DGA)')
lg = poligonos(arcgis('dga_lagos', MMA + '/SIMBIO_INVENTARIOS_MOP/MapServer/2', offset=.0008),
               lambda p, g: limpio({'nombre': txt(p.get('NOMBRE')), 'tipo': txt(p.get('TIPO')), 'altitud': p.get('ALTITUD'),
                                    'uso': txt(p.get('USO')), 'clasificacion': txt(p.get('CLASIFICAC'))}), .0008)
resumen['lagos'] = guardar('lagos', lg, 4)

# ---------------- 7. Acuicultura (Subpesca) ----------------
print('7 · concesiones de acuicultura (Subpesca)')
A = 'REP_SUBPESCA2.ADM_UOT.PULLINQUE4_T_ACUICULTURA.'
def acui(estado_fijo=None):
    def fn(p, g):
        return limpio({'titular': txt(p.get(A + 'TITULAR')), 'centro': txt(p.get(A + 'N_CODIGOCENTRO')), 'especies': txt(p.get(A + 'ESPECIES')),
                       'grupo': txt(p.get(A + 'T_GRUPOESPECIE')), 'lugar': txt(p.get(A + 'TOPONIMIO')),
                       'estado': estado_fijo or txt(p.get(A + 'T_ESTADOTRAMITE')), 'comuna': txt(p.get(A + 'COMUNA')),
                       'ha': p.get(A + 'SUPERFICIEPOLIGONO'), 'resolucion': txt(p.get(A + 'N_RESOLSSFFAA')), 'documento': txt(p.get(A + 'LINK_DOC'))})
    return fn
ac = poligonos(arcgis('ssp_acuicultura', SSP + '/SRMPUB_ACUICULTURA/MapServer/0', paginar=False), acui(), .00005)
for f in ac: f['properties']['tramite'] = 'Concesión'
so = poligonos(arcgis('ssp_solicitudes', SSP + '/SRMPUB_ACUICULTURA/MapServer/2', paginar=False), acui(), .00005)
for f in so: f['properties']['tramite'] = 'Solicitud'
resumen['acuicultura'] = guardar('acuicultura', ac + so, 6)

# ---------------- 8. Proyectos en el SEIA (MMA/SEA) ----------------
print('8 · proyectos SEIA')
def seia(tipo):
    def fn(p, g):
        return limpio({'nombre': txt(p.get('NOMBRE_PROYECTO')), 'via': tipo, 'tipologia': txt(p.get('NOMBRE_TIPOLOGIA')),
                       'estado': txt(p.get('ESTADO_EVALUACION')), 'titular': txt(p.get('TITULAR')), 'presentado': fecha(p.get('FECHA_PRESENTACION')),
                       'calificado': fecha(p.get('FECHA_CALIFICACION')), 'expediente': txt(p.get('URL_EXPEDIENTE'))})
    return fn
sx = puntos(arcgis('seia_dia', MMA + '/SIMBIO_SPPC/MapServer/1'), seia('DIA')) + puntos(arcgis('seia_eia', MMA + '/SIMBIO_SPPC/MapServer/2'), seia('EIA'))
resumen['seia'] = guardar('proyectos-seia', sx)

# ---------------- 9. Estaciones hidrométricas DGA ----------------
print('9 · estaciones DGA')
es = puntos(arcgis('dga_estaciones', MOP + '/DGA/Red_Hidrometrica/MapServer/0', geojson=False),
            lambda p, g: limpio({'nombre': txt(p.get('NOM_ESTACION')), 'tipo': txt(p.get('TIPO_ESTACION')), 'vigencia': txt(p.get('VIGENCIA')),
                                 'cuenca': txt(p.get('NOM_CUEN')), 'codigo_bna': txt(p.get('COD_BNA')), 'altitud': p.get('ALTITUD'),
                                 'comuna': txt(p.get('COMUNA')), 'institucion': txt(p.get('INSTITUCION'))}))
resumen['estaciones'] = guardar('estaciones-dga', es)

# ---------------- 10. Red vial (Vialidad MOP) ----------------
print('10 · red vial')
rv = []
for f in arcgis('mop_red_vial', MOP + '/VIALIDAD/Red_Vial_Chile/MapServer/2', geojson=False, offset=.001):
    g = shape(f['geometry'])
    if not ZONA.intersects(g): continue
    p = f['properties']
    rv.append({'type': 'Feature', 'geometry': g.simplify(.0008),
               'properties': limpio({'nombre': txt(p.get('NOMBRE_CAMINO')), 'rol': txt(p.get('ROL_LABEL')) or txt(p.get('ROL')),
                                     'clase': txt(p.get('CLASIFICACION')), 'carpeta': txt(p.get('CARPETA')), 'km': p.get('KM_TRAMO')})})
resumen['red_vial'] = guardar('red-vial', rv, 4)

# ---------------- 11. Localidades (MOP) ----------------
print('11 · localidades')
lo = puntos(arcgis('mop_capitales', MOP + '/MAPA_BASE/ASENTAMIENTOS/MapServer/19', geojson=False),
            lambda p, g: limpio({'nombre': txt(p.get('NOMBRE')), 'clase': 'Capital', 'comuna': txt(p.get('COMUNA'))}))
lo += puntos(arcgis('mop_poblados', MOP + '/MAPA_BASE/ASENTAMIENTOS/MapServer/20', geojson=False),
             lambda p, g: limpio({'nombre': txt(p.get('NOMBRE')), 'clase': 'Poblado', 'comuna': txt(p.get('COMUNA')), 'pob_2002': p.get('POBL_2002')}))
vistos, lo2 = set(), []
for f in lo:
    k = (f['properties'].get('nombre') or '').lower()
    if k and k not in vistos: vistos.add(k); lo2.append(f)
resumen['localidades'] = guardar('localidades', lo2)

# ---------------- 12. Comunas (límites) ----------------
print('12 · comunas')
cm = [{'type': 'Feature', 'geometry': cg.simplify(.002, preserve_topology=True), 'properties': {'comuna': n, 'region': r}} for n, r, cg in COMUNAS]
resumen['comunas'] = guardar('comunas', cm, 4)

json.dump({'generado': datetime.date.today().isoformat(), 'capas': resumen}, open(os.path.join(OUT, 'indice.json'), 'w', encoding='utf8'), ensure_ascii=False, indent=1)
print('listo', resumen)
