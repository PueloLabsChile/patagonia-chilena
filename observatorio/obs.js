// Observatorio Patagonia · visor geoespacial de Aysén y Magallanes (etapa 1)
import { FONDOS, GRUPOS, CAPAS, VISTAS, colorDe } from './obs-capas.js?v=1794005164';
import * as C from './obs-coords.js?v=1794005164';
import { crearImagenes } from './obs-imagen.js?v=1794005164';
import * as A from './obs-archivos.js?v=1794005164';

const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sinTilde = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const fmtN = (n, d = 0) => Number(n).toLocaleString('es-CL', { maximumFractionDigits: d });
const LIMITES = [[-76.2, -56.1], [-66.3, -43.5]];
const PALETA = ['#d4572a', '#2a7f9e', '#8a4f9e', '#4f8a2a', '#c99a1e', '#1c2326', '#b8392c', '#2f6f8f'];
const CAPA = Object.fromEntries(CAPAS.map(c => [c.id, c]));
const DATOS = {};              // id de capa oficial → FeatureCollection completa
const MIS = new Map();         // capas del investigador
let fondo = 'papel', tresD = false;

// ------------------------------------------------------------------ estado desde el enlace (#@lat,lon,zoomz&f=fondo&c=capa,capa)
const H = new URLSearchParams(location.hash.replace(/^#@?[^&]*&?/, ''));
const vistaH = (location.hash.match(/^#@(-?[\d.]+),(-?[\d.]+),([\d.]+)z/) || []).slice(1).map(Number);
if (H.get('f') && FONDOS.some(f => f.id === H.get('f'))) fondo = H.get('f');
const activasIni = new Set(H.has('c') ? H.get('c').split(',').filter(id => CAPA[id]) : CAPAS.filter(c => c.activa).map(c => c.id));

// ------------------------------------------------------------------ mapa
const fuentes = { vacio: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } } };
for (const f of FONDOS) fuentes['f-' + f.id] = { type: 'raster', tiles: f.tiles, tileSize: 256, maxzoom: f.max, attribution: f.atrib };
const DEM = { type: 'raster-dem', tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'], encoding: 'terrarium', tileSize: 256, maxzoom: 14,
  attribution: 'Elevación: Mapzen Terrain Tiles (SRTM, GMTED, ETOPO1)' };
fuentes.dem = DEM; fuentes.demsombra = { ...DEM };
const ancla = id => ({ id, type: 'symbol', source: 'vacio' });
const mapa = new maplibregl.Map({
  container: 'mapa',
  style: {
    version: 8, glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf', sources: fuentes,
    layers: [
      { id: 'fondo-base', type: 'background', paint: { 'background-color': '#ece9e2' } },
      ...FONDOS.map(f => ({ id: 'f-' + f.id, type: 'raster', source: 'f-' + f.id, layout: { visibility: f.id === fondo ? 'visible' : 'none' },
        paint: f.id === 'papel' ? { 'raster-opacity': .7, 'raster-saturation': -1, 'raster-contrast': .1 } : f.id === 'satelite' || f.id === 's2' ? { 'raster-saturation': -.12, 'raster-contrast': .06 } : {} })),
      { id: 'sombra', type: 'hillshade', source: 'demsombra', paint: { 'hillshade-exaggeration': .3, 'hillshade-shadow-color': '#05070a', 'hillshade-highlight-color': '#ffffff', 'hillshade-accent-color': '#1b232c' } },
      ancla('z-raster'), ancla('z-pol'), ancla('z-lin'), ancla('z-pun'), ancla('z-eti'), ancla('z-usr'), ancla('z-sel'), ancla('z-dib'),
    ],
  },
  ...(vistaH.length === 3 ? { center: [vistaH[1], vistaH[0]], zoom: vistaH[2] } : { bounds: LIMITES, fitBoundsOptions: { padding: { top: 30, bottom: 30, left: 30, right: 30 } } }),
  maxPitch: 78, attributionControl: { compact: true }, cooperativeGestures: false,
});
mapa.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
mapa.addControl(new maplibregl.ScaleControl({ unit: 'metric', maxWidth: 120 }), 'bottom-right');

// ------------------------------------------------------------------ avisos
let tAviso;
function aviso(t, mal = false, ms = 4200) {
  const a = $('#aviso'); a.innerHTML = t; a.classList.toggle('mal', mal); a.classList.add('ver');
  clearTimeout(tAviso); tAviso = setTimeout(() => a.classList.remove('ver'), ms);
}
let nCargando = 0;
const cargando = (si, txt = 'Cargando capa…') => { nCargando += si ? 1 : -1; $('#cargando').hidden = nCargando <= 0; $('#cargando span').textContent = txt; };

// ------------------------------------------------------------------ fondos y relieve
function pintarFondos() {
  $('#fondos').innerHTML = FONDOS.map(f => `<button class="fondo" type="button" data-fondo="${f.id}" aria-pressed="${f.id === fondo}" title="${esc(f.nota)}"
    style="background-image:url('${f.tiles[0].replace('{z}', 6).replace('{x}', 19).replace('{y}', 41)}')"><span>${esc(f.nombre)}</span></button>`).join('');
}
const SOMBRA = { claro: { 'hillshade-shadow-color': '#5a4a38', 'hillshade-highlight-color': '#fffaf0', 'hillshade-accent-color': '#7d6e5c' }, oscuro: { 'hillshade-shadow-color': '#05070a', 'hillshade-highlight-color': '#ffffff', 'hillshade-accent-color': '#1b232c' } };
const esClaro = id => !!FONDOS.find(f => f.id === id)?.claro;
/** Rótulos legibles según el fondo: tinta con halo de papel, o blanco con halo oscuro sobre imagen. */
function estiloTextos() {
  const claro = esClaro(fondo);
  for (const l of mapa.getStyle().layers) {
    if (!/^(c|u)-.*-t$/.test(l.id)) continue;
    mapa.setPaintProperty(l.id, 'text-color', claro ? '#1c2326' : '#ffffff');
    mapa.setPaintProperty(l.id, 'text-halo-color', claro ? 'rgba(236,233,226,.92)' : 'rgba(0,0,0,.8)');
  }
}
const sombraDe = id => id === 'papel' ? ['interpolate', ['linear'], ['zoom'], 4, .55, 9, .45, 13, .25] : id === 'oscuro' ? ['interpolate', ['linear'], ['zoom'], 5, .55, 12, .4] : id === 'topo' ? .12 : ['interpolate', ['linear'], ['zoom'], 5, .3, 9, .2, 12, .06, 14, 0];
function ponerFondo(id) {
  fondo = id;
  for (const f of FONDOS) mapa.setLayoutProperty('f-' + f.id, 'visibility', f.id === id ? 'visible' : 'none');
  mapa.setPaintProperty('sombra', 'hillshade-exaggeration', sombraDe(id));
  for (const [k, v] of Object.entries(SOMBRA[esClaro(id) ? 'claro' : 'oscuro'])) mapa.setPaintProperty('sombra', k, v);
  estiloTextos();
  $$('.fondo').forEach(b => b.setAttribute('aria-pressed', b.dataset.fondo === id));
  guardarVista();
}
$('#fondos').addEventListener('click', e => { const b = e.target.closest('.fondo'); if (b) ponerFondo(b.dataset.fondo); });
$('#sw-relieve').addEventListener('change', e => mapa.setLayoutProperty('sombra', 'visibility', e.target.checked ? 'visible' : 'none'));

// ------------------------------------------------------------------ catálogo de capas (panel)
function pintarCatalogo() {
  $('#grupos').innerHTML = GRUPOS.map(g => `<div class="grupo"><h3>${esc(g.nombre)}</h3>${CAPAS.filter(c => c.grupo === g.id).map(filaCapa).join('')}</div>`).join('');
}
const svgI = 'i';
function filaCapa(c) {
  const ley = c.cats ? `<div class="leyenda-capa">${Object.entries(c.cats).map(([k, v]) => `<span style="--c:${v}"><i></i>${esc(k)}</span>`).join('')}</div>` : '';
  const desc = c.archivo && !c.archivo.startsWith('..') ? `<button class="h-btn" data-bajar="${c.id}" data-fmt="geojson">GeoJSON</button><button class="h-btn" data-bajar="${c.id}" data-fmt="csv">CSV</button><button class="h-btn" data-bajar="${c.id}" data-fmt="kml">KML</button>` : '';
  return `<div class="capa" data-capa="${c.id}" style="--c:${c.color}">
    <div class="capa-fila">
      <label class="capa-chk"><input type="checkbox" data-act="${c.id}" ${activasIni.has(c.id) ? 'checked' : ''}><span class="caja"></span>
        <span class="capa-nom">${esc(c.nombre)}${c.vivo ? '<span class="vivo">vivo</span>' : ''}</span></label>
      <span class="capa-n" id="n-${c.id}"></span>
      <button class="capa-i" type="button" data-info="${c.id}" aria-expanded="false" aria-label="Información de ${esc(c.nombre)}">${svgI}</button>
    </div>
    <div class="capa-det" id="det-${c.id}" hidden>
      <p>${esc(c.descr || '')}</p>${ley}
      <label class="op">Opacidad <input type="range" min="10" max="100" value="100" data-op="${c.id}"></label>
      <p class="fte">Fuente: ${c.enlace ? `<a href="${esc(c.enlace)}" target="_blank" rel="noopener">${esc(c.fuente)} ↗</a>` : esc(c.fuente)}${c.fecha ? ' · ' + esc(c.fecha) : ''}</p>
      <div class="acc"><button class="h-btn" data-zoom="${c.id}">Acercar</button>${desc}</div>
    </div></div>`;
}
$('#grupos').addEventListener('change', e => {
  const id = e.target.dataset.act; if (id) { e.target.checked ? activar(CAPA[id]) : desactivar(CAPA[id]); guardarVista(); marcarVista(null); pintarLeyenda(); }
});
$('#grupos').addEventListener('input', e => { const id = e.target.dataset.op; if (id) opacidad(CAPA[id], e.target.value / 100); });
$('#grupos').addEventListener('click', async e => {
  const i = e.target.closest('[data-info]');
  if (i) { const d = $('#det-' + i.dataset.info); d.hidden = !d.hidden; i.setAttribute('aria-expanded', !d.hidden); return; }
  const z = e.target.closest('[data-zoom]');
  if (z) { const c = CAPA[z.dataset.zoom]; const fc = DATOS[c.id] || (c.archivo ? await cargarDatos(c) : null); const b = fc && C.bbox(fc); mapa.fitBounds(b || LIMITES.flat(), { padding: 60, maxZoom: 12 }); return; }
  const b = e.target.closest('[data-bajar]');
  if (b) {
    const c = CAPA[b.dataset.bajar], fc = DATOS[c.id] || await cargarDatos(c), nom = 'observatorio-' + c.id;
    if (b.dataset.fmt === 'geojson') A.descargar(nom + '.geojson', A.aGeoJSON(sinId(fc)), 'application/geo+json');
    if (b.dataset.fmt === 'csv') A.descargar(nom + '.csv', A.aCSV(fc, centro), 'text/csv;charset=utf-8');
    if (b.dataset.fmt === 'kml') A.descargar(nom + '.kml', A.aKML(fc, c.nombre), 'application/vnd.google-earth.kml+xml');
  }
});
const sinId = fc => ({ type: 'FeatureCollection', features: fc.features.map(({ id, ...f }) => f) });

async function cargarDatos(c, silencio = false) {
  if (DATOS[c.id]) return DATOS[c.id];
  if (!silencio) cargando(true, `Cargando ${c.nombre.toLowerCase()}…`);
  try {
    const r = await fetch(c.archivo.startsWith('..') ? c.archivo : 'datos/' + c.archivo);
    if (!r.ok) throw new Error(r.status);
    const fc = await r.json();
    fc.features.forEach((f, i) => { f.id = i; });
    DATOS[c.id] = fc;
    const n = $('#n-' + c.id); if (n) n.textContent = fmtN(fc.features.length);
    indexar(c, fc);
    return fc;
  } catch (e) { if (!silencio) aviso(`No se pudo cargar «${esc(c.nombre)}». Intenta de nuevo en un rato.`, true); throw e; }
  finally { if (!silencio) cargando(false); }
}

const capasDe = c => ({
  poligono: ['-f', '-l'], 'poligono-trazo': ['-f', '-l'], linea: ['-l'], 'linea-limite': ['-l', '-t'], punto: ['-p'], 'punto-etiqueta': ['-p', '-t'], foco: ['-h', '-p'], raster: ['-r'],
}[c.tipo]).map(s => 'c-' + c.id + s);

async function activar(c) {
  const src = 'c-' + c.id;
  if (mapa.getSource(src)) { capasDe(c).forEach(l => mapa.setLayoutProperty(l, 'visibility', 'visible')); return; }
  if (c.tipo === 'raster') {
    mapa.addSource(src, { type: 'raster', tileSize: 512, minzoom: 5, attribution: c.fuente,
      tiles: [`${c.servicio}/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=512,512&format=png32&transparent=true&dpi=96&f=image&layers=${c.capasServicio}`] });
    mapa.addLayer({ id: src + '-r', type: 'raster', source: src, paint: { 'raster-opacity': .62, 'raster-fade-duration': 200 } }, 'z-raster');
    $('#n-' + c.id).textContent = 'en vivo';
    if (mapa.getZoom() < 5) aviso(`«${esc(c.nombre)}» se dibuja desde el zoom regional: acércate un poco.`);
    return;
  }
  let fc; try { fc = await cargarDatos(c); } catch { const x = $(`[data-act="${c.id}"]`); if (x) x.checked = false; return; }
  if (mapa.getSource(src)) return;   // otra llamada la agregó mientras cargaba
  mapa.addSource(src, { type: 'geojson', data: fc, attribution: c.fuente, tolerance: .45 });
  const col = colorDe(c);
  const rel = { glaciares: .7, lagos: .75, predios: .45, acuicultura: .6, bnp: .35, marinas: .22, protegidas: .3 }[c.id] ?? .26;
  if (c.tipo === 'poligono' || c.tipo === 'poligono-trazo') {
    mapa.addLayer({ id: src + '-f', type: 'fill', source: src, metadata: { rel: c.tipo === 'poligono' ? rel : .07, zoomFade: true },
      paint: { 'fill-color': col, 'fill-opacity': opZoom(c.tipo === 'poligono' ? rel : .07) } }, 'z-pol');
    mapa.addLayer({ id: src + '-l', type: 'line', source: src, metadata: { rel: .9 },
      paint: { 'line-color': c.trazo || col, 'line-opacity': .9, 'line-width': ['interpolate', ['linear'], ['zoom'], 5, c.tipo === 'poligono-trazo' ? 1.2 : .6, 11, 1.8],
               ...(c.tipo === 'poligono-trazo' ? { 'line-dasharray': [3, 2] } : {}) } }, 'z-lin');
  } else if (c.tipo === 'linea') {
    mapa.addLayer({ id: src + '-l', type: 'line', source: src, metadata: { rel: .85 }, layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': col, 'line-opacity': .85, 'line-width': ['interpolate', ['linear'], ['zoom'], 5, .7, 10, 2.2, 14, 4] } }, 'z-lin');
  } else if (c.tipo === 'linea-limite') {
    mapa.addLayer({ id: src + '-l', type: 'line', source: src, metadata: { rel: .55 },
      paint: { 'line-color': col, 'line-opacity': .55, 'line-width': ['interpolate', ['linear'], ['zoom'], 5, .5, 10, 1.4], 'line-dasharray': [4, 2] } }, 'z-lin');
    mapa.addSource(src + '-pt', { type: 'geojson', data: { type: 'FeatureCollection', features: fc.features.map(f => ({ type: 'Feature', properties: f.properties, geometry: { type: 'Point', coordinates: centro(f.geometry) } })) } });
    mapa.addLayer({ id: src + '-t', type: 'symbol', source: src + '-pt', minzoom: 6.3, metadata: { rel: .7 },
      layout: { 'text-field': ['upcase', ['get', 'comuna']], 'text-font': ['Open Sans Semibold'], 'text-size': ['interpolate', ['linear'], ['zoom'], 6, 9.5, 10, 12],
                'text-letter-spacing': .18, 'symbol-placement': 'point', 'text-max-width': 8 },
      paint: { 'text-color': '#f3efe6', 'text-opacity': .7, 'text-halo-color': 'rgba(0,0,0,.75)', 'text-halo-width': 1.2 } }, 'z-eti');
  } else if (c.tipo === 'punto' || c.tipo === 'punto-etiqueta') {
    const et = c.tipo === 'punto-etiqueta';
    mapa.addLayer({ id: src + '-p', type: 'circle', source: src, metadata: { rel: 1 }, ...(et ? { minzoom: 5.5 } : {}),
      paint: { 'circle-color': col, 'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, et ? 2.2 : 2.6, 9, et ? 3.6 : 4.6, 13, 7],
               'circle-stroke-color': 'rgba(247,245,240,.95)', 'circle-stroke-width': 1.2, 'circle-opacity': 1, 'circle-stroke-opacity': 1 } }, 'z-pun');
    if (et) mapa.addLayer({ id: src + '-t', type: 'symbol', source: src, metadata: { rel: 1 },
      layout: { 'text-field': ['get', 'nombre'], 'text-font': ['Open Sans Semibold'], 'text-size': ['interpolate', ['linear'], ['zoom'], 5, ['case', ['==', ['get', 'clase'], 'Capital'], 11.5, 0], 7, ['case', ['==', ['get', 'clase'], 'Capital'], 12.5, 10.5], 11, 13],
                'text-variable-anchor': ['left', 'right', 'top', 'bottom'], 'text-radial-offset': .55, 'text-justify': 'auto', 'symbol-sort-key': ['case', ['==', ['get', 'clase'], 'Capital'], 0, 1] },
      paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(0,0,0,.85)', 'text-halo-width': 1.3 } }, 'z-eti');
  } else if (c.tipo === 'foco') {
    mapa.addLayer({ id: src + '-h', type: 'circle', source: src, metadata: { rel: .35 },
      paint: { 'circle-color': '#ff4d1a', 'circle-blur': 1, 'circle-opacity': .35, 'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 6, 10, 18] } }, 'z-pun');
    mapa.addLayer({ id: src + '-p', type: 'circle', source: src, metadata: { rel: 1 },
      paint: { 'circle-color': ['interpolate', ['linear'], ['get', 'frp_mw'], 0, '#e9a23b', 10, '#e2733a', 50, '#b8392c'], 'circle-opacity': 1, 'circle-stroke-opacity': 1,
               'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 2.5, 10, 6], 'circle-stroke-color': '#fff7ea', 'circle-stroke-width': 1 } }, 'z-pun');
    $('#n-' + c.id).textContent = fc.features.length ? fmtN(fc.features.length) : 'sin focos';
  }
  const op = $(`[data-op="${c.id}"]`); if (op && op.value < 100) opacidad(c, op.value / 100);
  estiloTextos(); pintarLeyenda();
}
/** Opacidad de relleno que baja al acercarse, para que se vea la imagen debajo. */
function opZoom(x) { return ['interpolate', ['linear'], ['zoom'], 6, x, 11, x * .55, 14, x * .35]; }
function desactivar(c) { capasDe(c).forEach(l => mapa.getLayer(l) && mapa.setLayoutProperty(l, 'visibility', 'none')); }
function opacidad(c, v) {
  for (const l of capasDe(c)) {
    const L = mapa.getLayer(l); if (!L) continue;
    const rel = L.metadata?.rel ?? 1;
    const props = { fill: ['fill-opacity'], line: ['line-opacity'], circle: ['circle-opacity', 'circle-stroke-opacity'], symbol: ['text-opacity'], raster: ['raster-opacity'] }[L.type] || [];
    props.forEach(p => mapa.setPaintProperty(l, p, L.metadata?.zoomFade ? opZoom(rel * v) : (L.type === 'raster' ? .62 : rel) * v));
  }
}
const activas = () => CAPAS.filter(c => $(`[data-act="${c.id}"]`)?.checked);

// focos de calor: se refrescan cada 30 min si están activos
setInterval(async () => {
  if (!$('[data-act="focos"]')?.checked) return;
  delete DATOS.focos; const fc = await cargarDatos(CAPA.focos).catch(() => null);
  if (fc && mapa.getSource('c-focos')) mapa.getSource('c-focos').setData(fc);
}, 30 * 60 * 1000);

// ------------------------------------------------------------------ geometría auxiliar
function centro(g) {
  if (!g) return [NaN, NaN];
  if (g.type === 'Point') return g.coordinates;
  if (g.type === 'Polygon' || g.type === 'MultiPolygon') {
    // centroide del anillo exterior más grande
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    const r = polys.map(p => p[0]).sort((a, b) => C.areaAnillo(b) - C.areaAnillo(a))[0];
    let x = 0, y = 0, s = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const f = r[j][0] * r[i][1] - r[i][0] * r[j][1]; x += (r[j][0] + r[i][0]) * f; y += (r[j][1] + r[i][1]) * f; s += f; }
    if (Math.abs(s) > 1e-12) { const p = [x / (3 * s), y / (3 * s)]; if (enGeom(p, g)) return p; }
  }
  if (g.type === 'LineString' || g.type === 'MultiLineString') {
    const l = g.type === 'LineString' ? g.coordinates : [...g.coordinates].sort((a, b) => C.largo(b) - C.largo(a))[0];
    return l[Math.floor(l.length / 2)];
  }
  const b = C.bbox({ geometry: g }); return b ? [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] : [NaN, NaN];
}
function enAnillo([x, y], r) {
  let d = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) d = !d;
  }
  return d;
}
function enGeom(p, g) {
  if (g.type === 'Polygon') return enAnillo(p, g.coordinates[0]) && !g.coordinates.slice(1).some(r => enAnillo(p, r));
  if (g.type === 'MultiPolygon') return g.coordinates.some(c => enGeom(p, { type: 'Polygon', coordinates: c }));
  return false;
}
const cajas = new WeakMap();
function cajaDe(f) { let b = cajas.get(f); if (!b) { b = C.bbox({ geometry: f.geometry }); cajas.set(f, b); } return b; }
/** Polígonos de las capas cargadas que contienen el punto. */
function dentroDe([x, y]) {
  const out = [];
  for (const c of CAPAS) {
    const fc = DATOS[c.id]; if (!fc || !/^poligono|linea-limite/.test(c.tipo)) continue;
    for (const f of fc.features) {
      const b = cajaDe(f); if (!b || x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue;
      if (enGeom([x, y], f.geometry)) out.push({ c, f });
    }
  }
  return out;
}

// ------------------------------------------------------------------ altitud (decodifica teselas Terrarium)
const dem = new Map();
function teselaDEM(z, x, y) {
  const k = `${z}/${x}/${y}`;
  if (!dem.has(k)) {
    if (dem.size > 80) dem.delete(dem.keys().next().value);
    dem.set(k, fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${k}.png`).then(r => r.ok ? r.blob() : null).then(b => b && createImageBitmap(b)).then(bmp => {
      if (!bmp) return null;
      const cv = new OffscreenCanvas(256, 256), cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(bmp, 0, 0);
      return cx.getImageData(0, 0, 256, 256).data;
    }).catch(() => null));
  }
  return dem.get(k);
}
async function altitud(lon, lat, z = 12) {
  const n = 2 ** z, xf = (lon + 180) / 360 * n, lr = lat * Math.PI / 180;
  const yf = (1 - Math.log(Math.tan(lr) + 1 / Math.cos(lr)) / Math.PI) / 2 * n;
  const x = Math.floor(xf), y = Math.floor(yf), d = await teselaDEM(z, x, y);
  if (!d) return null;
  const i = (Math.min(255, Math.floor((yf - y) * 256)) * 256 + Math.min(255, Math.floor((xf - x) * 256))) * 4;
  return d[i] * 256 + d[i + 1] + d[i + 2] / 256 - 32768;
}
const fmtAlt = h => h == null ? '—' : h <= 0 ? (h < -5 ? `${fmtN(-h)} m bajo el mar` : 'nivel del mar') : `${fmtN(h)} m s.n.m.`;

// ------------------------------------------------------------------ barra de estado
let tMov = 0, ultimo;
mapa.on('mousemove', e => {
  ultimo = e.lngLat;
  const { lng, lat } = e.lngLat, u = C.aUTM(lng, lat);
  $('#e-dd').textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  $('#e-gms').textContent = `${C.aGMS(lat, 'lat')} ${C.aGMS(lng, 'lon')}`;
  $('#e-utm').textContent = `UTM ${u.huso}${u.hemisferio} ${fmtN(u.este)} E ${fmtN(u.norte)} N`;
  const t = performance.now();
  if (t - tMov > 140) {
    tMov = t;
    const z = Math.max(6, Math.min(12, Math.round(mapa.getZoom()) + 1));
    altitud(lng, lat, z).then(h => { if (ultimo === e.lngLat) $('#e-alt').textContent = fmtAlt(h); });
  }
  if (herr) { herr.cursor = [lng, lat]; pintarDibujo(); }
});
const pintarZoom = () => { $('#e-zoom').textContent = `zoom ${mapa.getZoom().toFixed(1)}${mapa.getPitch() > 1 ? ` · ${Math.round(mapa.getPitch())}°` : ''}`; };
mapa.on('move', pintarZoom);

// ------------------------------------------------------------------ ficha
const selFuente = () => mapa.getSource('sel');
function resaltar(f) { selFuente()?.setData({ type: 'FeatureCollection', features: f ? [{ type: 'Feature', properties: {}, geometry: f.geometry }] : [] }); }
function cerrarFicha() { $('#ficha').hidden = true; resaltar(null); }
$('#ficha-cerrar').addEventListener('click', cerrarFicha);

const esURL = v => typeof v === 'string' && /^https?:\/\//i.test(v);
const fmtValor = (k, v) => {
  if (esURL(v)) return `<a href="${esc(v)}" target="_blank" rel="noopener">Abrir ↗</a>`;
  if (typeof v === 'number') return fmtN(v, Math.abs(v) < 10 ? 3 : 2);
  if (typeof v === 'object' && v !== null) return esc(JSON.stringify(v));
  return esc(v);
};
let fichaLista = [], fichaIdx = 0;

/** items: [{f, capa:{nombre,color,campos,titulo,fuente,enlace,fecha}, usr}] */
function abrirFicha(items, idx = 0) {
  fichaLista = items; fichaIdx = idx;
  const { f, capa, usr } = items[idx], p = f.properties || {}, g = f.geometry;
  const titulo = (capa.titulo ? capa.titulo(p) : null) || p.nombre || p.name || p.Name || capa.nombre;
  const area = C.areaGeom(g), lg = C.largoGeom(g);
  const med = [];
  if (area) { med.push(['Superficie', C.fmtArea(area)]); med.push(['Perímetro', C.fmtLargo((g.type === 'Polygon' ? [g.coordinates] : g.coordinates).reduce((s, pl) => s + C.largo(pl[0]), 0))]); }
  if (lg) med.push(['Largo', C.fmtLargo(lg)]);
  const [lon, lat] = centro(g), u = C.aUTM(lon, lat);
  const campos = capa.campos || Object.fromEntries(Object.keys(p).filter(k => !['foto', 'nombre_ficha'].includes(k)).map(k => [k, k]));
  const filas = Object.entries(campos).filter(([k]) => p[k] !== undefined && p[k] !== null && p[k] !== '').map(([k, n]) => `<tr><th>${esc(n)}</th><td>${fmtValor(k, p[k])}</td></tr>`).join('');
  const otros = items.length > 1 ? `<p class="f-varios">${idx + 1} de ${items.length} elementos aquí · ${items.map((it, i) => i === idx ? '' : `<button data-fi="${i}">${esc(it.capa.nombre)}</button>`).filter(Boolean).slice(0, 6).join(' · ')}</p>` : '';
  $('#ficha-cuerpo').innerHTML = `
    <div class="f-cab"><span class="etq" style="--c:${capa.color}"><i></i>${esc(capa.nombre)}</span>
    ${usr && usr.editable ? `<input class="f-nombre" id="f-nombre" value="${esc(p.nombre || '')}" maxlength="80" aria-label="Nombre">` : `<h2>${esc(titulo)}</h2>`}</div>
    ${otros}
    ${p.foto ? `<img class="f-foto" src="${p.foto}" alt="Foto de terreno">` : ''}
    ${med.length ? `<div class="f-medidas">${med.map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`).join('')}</div>` : ''}
    ${filas ? `<table class="t-ficha">${filas}</table>` : ''}
    <div class="f-ubic">${g.type === 'Point' ? 'Ubicación' : 'Centro'} <b>${lat.toFixed(5)}, ${lon.toFixed(5)}</b><br>${C.aGMS(lat, 'lat')} ${C.aGMS(lon, 'lon')}<br>UTM ${u.huso}${u.hemisferio} · ${fmtN(u.este)} E · ${fmtN(u.norte)} N<br>Altitud <b id="f-alt">…</b></div>
    <div class="f-acc">
      <button class="h-btn" id="fa-zoom">Acercar</button>
      <button class="h-btn" id="fa-copiar">Copiar coordenadas</button>
      <button class="h-btn" id="fa-bajar">Descargar</button>
      ${usr ? '<button class="h-btn peligro" id="fa-borrar">Quitar</button>' : ''}
    </div>
    <p class="f-fte">${capa.fuente ? `Fuente: ${capa.enlace ? `<a href="${esc(capa.enlace)}" target="_blank" rel="noopener">${esc(capa.fuente)}</a>` : esc(capa.fuente)}${capa.fecha ? ' · ' + esc(capa.fecha) : ''}` : ''}</p>`;
  $('#ficha').hidden = false; $('#ficha').scrollTop = 0;
  resaltar(f);
  altitud(lon, lat).then(h => { const el = $('#f-alt'); if (el) el.textContent = fmtAlt(h); });
  $('#fa-zoom').onclick = () => { const b = C.bbox({ geometry: g }); if (g.type === 'Point') mapa.flyTo({ center: g.coordinates, zoom: Math.max(mapa.getZoom(), 13) }); else mapa.fitBounds(b, { padding: 80, maxZoom: 15 }); };
  $('#fa-copiar').onclick = () => copiar(`${lat.toFixed(6)}, ${lon.toFixed(6)}`);
  $('#fa-bajar').onclick = () => { const { id, ...sinid } = f; A.descargar(sinTilde(titulo).replace(/[^a-z0-9]+/g, '-').slice(0, 60) + '.geojson', A.aGeoJSON({ type: 'FeatureCollection', features: [sinid] }), 'application/geo+json'); };
  $$('[data-fi]').forEach(b => b.onclick = () => abrirFicha(fichaLista, +b.dataset.fi));
  if (usr) {
    $('#fa-borrar').onclick = () => { quitarElemento(usr.capa, f); cerrarFicha(); };
    const n = $('#f-nombre'); if (n) n.onchange = () => { f.properties.nombre = n.value.trim() || f.properties.nombre; actualizarMia(usr.capa); };
  }
}
async function copiar(t) { try { await navigator.clipboard.writeText(t); aviso('Copiado: ' + esc(t)); } catch { aviso(esc(t)); } }

/** Ficha de un punto cualquiera: coordenadas, altitud, comuna y en qué capas cae. */
function fichaPunto([lon, lat], titulo = 'Punto en el mapa', extra = '') {
  const u = C.aUTM(lon, lat), dentro = dentroDe([lon, lat]);
  const comuna = dentro.find(d => d.c.id === 'comunas')?.f.properties;
  const resto = dentro.filter(d => d.c.id !== 'comunas');
  fichaLista = []; resaltar({ geometry: { type: 'Point', coordinates: [lon, lat] } });
  $('#ficha-cuerpo').innerHTML = `
    <div class="f-cab"><span class="etq" style="--c:#b8392c"><i></i>Ubicación</span><h2>${esc(titulo)}</h2></div>
    ${extra}
    <div class="f-ubic"><b>${lat.toFixed(6)}, ${lon.toFixed(6)}</b><br>${C.aGMS(lat, 'lat')} ${C.aGMS(lon, 'lon')}<br>UTM ${u.huso}${u.hemisferio} · ${fmtN(u.este, 1)} E · ${fmtN(u.norte, 1)} N<br>Altitud <b id="f-alt">…</b></div>
    <table class="t-ficha"><tr><th>Comuna</th><td>${comuna ? esc(comuna.comuna + ' · ' + comuna.region) : 'Fuera de las comunas de Aysén y Magallanes (o en el mar)'}</td></tr>
      ${resto.length ? `<tr><th>Dentro de</th><td>${resto.map(d => `<button class="f-dentro" data-c="${d.c.id}" data-i="${d.f.id}" >${esc((d.c.titulo?.(d.f.properties)) || d.c.nombre)}</button> <small>(${esc(d.f.properties.designacion || d.c.nombre)})</small>`).join('<br>')}</td></tr>` : ''}
    </table>
    <div class="f-acc"><button class="h-btn" id="fa-copiar">Copiar coordenadas</button><button class="h-btn" id="fa-guardar">Guardar como punto</button></div>
    <p class="f-fte">Altitud: modelo de elevación Terrarium (SRTM/GMTED), precisión de decenas de metros. «Dentro de» considera solo las capas ya cargadas.</p>`;
  $('#ficha').hidden = false;
  altitud(lon, lat, 13).then(h => { const el = $('#f-alt'); if (el) el.textContent = fmtAlt(h); });
  $('#fa-copiar').onclick = () => copiar(`${lat.toFixed(6)}, ${lon.toFixed(6)}`);
  $('#fa-guardar').onclick = () => guardarDibujo({ type: 'Point', coordinates: [lon, lat] });
  $$('.f-dentro').forEach(b => b.onclick = () => { const c = CAPA[b.dataset.c]; abrirFicha([{ f: DATOS[c.id].features[+b.dataset.i], capa: c }]); });
}

// ------------------------------------------------------------------ clic en el mapa: identificar
const idsInteractivos = () => mapa.getStyle().layers.filter(l => (/^c-.*-(f|l|p)$/.test(l.id) || /^u-.*-(f|l|p)$/.test(l.id)) && l.layout?.visibility !== 'none').map(l => l.id);
mapa.on('click', async e => {
  if (imagenes?.capturaClic(e)) return;
  if (herr) return clicDibujo(e);
  const p = e.point, caja = [[p.x - 4, p.y - 4], [p.x + 4, p.y + 4]];
  const hits = mapa.queryRenderedFeatures(caja, { layers: idsInteractivos() });
  const items = [], vistos = new Set();
  for (const h of hits) {
    const k = h.source + ':' + h.id; if (vistos.has(k)) continue; vistos.add(k);
    if (h.source.startsWith('c-')) { const c = CAPA[h.source.slice(2)], f = DATOS[c.id]?.features[h.id]; if (f) items.push({ f, capa: c }); }
    else if (h.source.startsWith('u-')) { const m = MIS.get(h.source.slice(2)), f = m?.fc.features[h.id]; if (f) items.push({ f, capa: { nombre: m.nombre, color: m.color, fuente: m.nota ? 'Tu archivo · ' + m.nota : 'Tus datos' }, usr: { capa: m, editable: m.id === 'dibujos' } }); }
  }
  // prioridad: puntos, luego líneas, luego polígonos chicos
  const rango = it => it.f.geometry.type.includes('Point') ? 0 : it.f.geometry.type.includes('Line') ? 1 : 2 + Math.log10(1 + C.areaGeom(it.f.geometry));
  items.sort((a, b) => rango(a) - rango(b));
  if (items.length) return abrirFicha(items);
  for (const c of activas().filter(c => c.tipo === 'raster').reverse()) {
    const r = await consultaVivo(c, e.lngLat); if (r) return abrirFicha([{ f: r, capa: c }]);
  }
  fichaPunto([e.lngLat.lng, e.lngLat.lat]);
});
mapa.on('mousemove', e => {
  if (herr || imagenes?.editando()) return;
  const n = mapa.queryRenderedFeatures([[e.point.x - 3, e.point.y - 3], [e.point.x + 3, e.point.y + 3]], { layers: idsInteractivos() }).length;
  mapa.getCanvas().style.cursor = n ? 'pointer' : '';
});
async function consultaVivo(c, { lng, lat }) {
  const q = new URLSearchParams({ geometry: `${lng},${lat}`, geometryType: 'esriGeometryPoint', inSR: 4326, spatialRel: 'esriSpatialRelIntersects', outFields: '*', returnGeometry: true, outSR: 4326, f: 'geojson', maxAllowableOffset: 0.0001 });
  try { const d = await (await fetch(`${c.consulta}/query?${q}`)).json(); return d.features?.[0] || null; } catch { return null; }
}

// ------------------------------------------------------------------ dibujo y medición
let herr = null;
const NOMBRE_HERR = { distancia: 'Medir distancia', area: 'Medir área', punto: 'Dibujar punto', linea: 'Dibujar línea', poligono: 'Dibujar polígono' };
function empezar(modo) {
  cerrarMenus(); cancelar(true);
  herr = { modo, pts: [], cursor: null };
  mapa.doubleClickZoom.disable();
  mapa.getCanvasContainer().classList.add('dibujando');
  $('#hud').hidden = false; pintarDibujo();
}
function cancelar(silencio) {
  herr = null; mapa.doubleClickZoom.enable(); mapa.getCanvasContainer().classList.remove('dibujando');
  $('#hud').hidden = true; mapa.getSource('dib')?.setData({ type: 'FeatureCollection', features: [] });
  if (!silencio) mapa.getSource('medida')?.setData({ type: 'FeatureCollection', features: [] });
}
function clicDibujo(e) {
  const p = [e.lngLat.lng, e.lngLat.lat];
  const ult = herr.pts.at(-1);
  if (ult) { const a = mapa.project(ult), b = e.point; if (Math.hypot(a.x - b.x, a.y - b.y) < 4) return; }
  // cerrar polígono al tocar el primer vértice
  if ((herr.modo === 'area' || herr.modo === 'poligono') && herr.pts.length >= 3) { const a = mapa.project(herr.pts[0]); if (Math.hypot(a.x - e.point.x, a.y - e.point.y) < 9) return terminar(); }
  herr.pts.push(p);
  if (herr.modo === 'punto') return terminar();
  pintarDibujo();
}
mapa.on('dblclick', e => { if (herr) { e.preventDefault(); terminar(); } });
function geomDibujo(pts, modo) {
  if (modo === 'punto') return pts[0] ? { type: 'Point', coordinates: pts[0] } : null;
  if (modo === 'distancia' || modo === 'linea') return pts.length >= 2 ? { type: 'LineString', coordinates: pts } : null;
  return pts.length >= 3 ? { type: 'Polygon', coordinates: [[...pts, pts[0]]] } : null;
}
function pintarDibujo() {
  if (!herr) return;
  const pts = herr.cursor ? [...herr.pts, herr.cursor] : herr.pts, poly = herr.modo === 'area' || herr.modo === 'poligono';
  const fs = herr.pts.map(c => ({ type: 'Feature', properties: { v: 1 }, geometry: { type: 'Point', coordinates: c } }));
  if (pts.length >= 2) fs.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: poly && pts.length >= 3 ? [...pts, pts[0]] : pts } });
  if (poly && pts.length >= 3) fs.push({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[...pts, pts[0]]] } });
  mapa.getSource('dib').setData({ type: 'FeatureCollection', features: fs });
  let txt = NOMBRE_HERR[herr.modo];
  if (herr.modo === 'distancia' || herr.modo === 'linea') txt += pts.length >= 2 ? ` · <b>${C.fmtLargo(C.largo(pts))}</b>` : ' · haz clic en el mapa para empezar';
  else if (poly) txt += pts.length >= 3 ? ` · <b>${C.fmtArea(C.areaAnillo([...pts, pts[0]]))}</b>` : ' · marca al menos 3 vértices';
  else txt += ' · haz clic donde quieras el punto';
  $('#hud-txt').innerHTML = txt;
  $('#hud-fin').hidden = herr.modo === 'punto';
}
function terminar() {
  if (!herr) return;
  const { modo, pts } = herr, g = geomDibujo(pts, modo);
  cancelar(true);
  if (!g) return aviso('Faltan puntos para terminar el dibujo.');
  if (modo === 'distancia' || modo === 'area') {
    mapa.getSource('medida').setData({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: g }] });
    const f = { type: 'Feature', properties: { nombre: modo === 'area' ? 'Área medida' : 'Distancia medida' }, geometry: g };
    abrirFicha([{ f, capa: { nombre: 'Medición', color: '#b8392c', campos: {}, titulo: () => modo === 'area' ? 'Área medida' : 'Distancia medida', fuente: 'Cálculo geodésico sobre el elipsoide WGS84 (esfera media)' } }]);
    const b = document.createElement('button'); b.className = 'btn btn-chico'; b.textContent = 'Guardar en Mis datos';
    b.onclick = () => { mapa.getSource('medida').setData({ type: 'FeatureCollection', features: [] }); guardarDibujo(g); };
    $('.f-acc').prepend(b);
  } else guardarDibujo(g);
}
function guardarDibujo(g) {
  let d = MIS.get('dibujos');
  if (!d) { d = { id: 'dibujos', nombre: 'Mis dibujos', color: '#b8392c', fc: { type: 'FeatureCollection', features: [] }, visible: true, nota: 'dibujados en el visor', creado: Date.now() }; }
  const tipo = { Point: 'Punto', LineString: 'Línea', Polygon: 'Polígono' }[g.type];
  const n = d.fc.features.filter(f => f.geometry.type === g.type).length + 1;
  const p = { nombre: `${tipo} ${n}`, creado: new Date().toLocaleString('es-CL') };
  if (g.type === 'Polygon') p.area_ha = +(C.areaGeom(g) / 1e4).toFixed(3);
  if (g.type === 'LineString') p.largo_km = +(C.largoGeom(g) / 1e3).toFixed(3);
  const f = { type: 'Feature', properties: p, geometry: g };
  d.fc.features.push(f);
  MIS.has('dibujos') ? actualizarMia(d) : agregarMia(d, false);
  abrirFicha([{ f, capa: { nombre: 'Mis dibujos', color: d.color, fuente: 'Tus datos (guardados en este navegador)' }, usr: { capa: d, editable: true } }]);
  setTimeout(() => $('#f-nombre')?.select(), 50);
}
$('#hud-fin').addEventListener('click', terminar);
$('#hud-cancelar').addEventListener('click', () => cancelar());
$('#m-herr').addEventListener('click', e => { const b = e.target.closest('[data-herr]'); if (b) empezar(b.dataset.herr); });

// ------------------------------------------------------------------ capas del investigador
function idsMia(m) { return ['-f', '-l', '-p', '-t'].map(s => 'u-' + m.id + s); }
function agregarMia(m, zoom = true) {
  m.fc.features.forEach((f, i) => { f.id = i; });
  MIS.set(m.id, m);
  const src = 'u-' + m.id;
  mapa.addSource(src, { type: 'geojson', data: m.fc });
  const esPol = ['match', ['geometry-type'], ['Polygon', 'MultiPolygon'], true, false];
  const esLin = ['match', ['geometry-type'], ['LineString', 'MultiLineString', 'Polygon', 'MultiPolygon'], true, false];
  const esPun = ['match', ['geometry-type'], ['Point', 'MultiPoint'], true, false];
  const vis = { visibility: m.visible ? 'visible' : 'none' };
  mapa.addLayer({ id: src + '-f', type: 'fill', source: src, filter: esPol, layout: vis, paint: { 'fill-color': m.color, 'fill-opacity': .22 } }, 'z-usr');
  mapa.addLayer({ id: src + '-l', type: 'line', source: src, filter: esLin, layout: { ...vis, 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': m.color, 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 1.4, 12, 2.6] } }, 'z-usr');
  mapa.addLayer({ id: src + '-p', type: 'circle', source: src, filter: esPun, layout: vis,
    paint: { 'circle-color': m.color, 'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, m.fotos ? 5 : 3.5, 12, m.fotos ? 8 : 6.5], 'circle-stroke-color': m.fotos ? '#fff' : 'rgba(247,245,240,.95)', 'circle-stroke-width': m.fotos ? 2 : 1.2 } }, 'z-usr');
  mapa.addLayer({ id: src + '-t', type: 'symbol', source: src, filter: esPun, minzoom: 9, layout: { ...vis, 'text-field': ['coalesce', ['get', 'nombre'], ['get', 'name'], ['get', 'Name'], ''], 'text-font': ['Open Sans Semibold'], 'text-size': 11.5, 'text-offset': [0, 1.1], 'text-anchor': 'top', 'text-optional': true },
    paint: { 'text-color': '#1c2326', 'text-halo-color': 'rgba(236,233,226,.92)', 'text-halo-width': 1.2 } }, 'z-usr');
  estiloTextos();
  A.guardarCapa(serial(m));
  pintarMis();
  if (zoom) { const b = C.bbox(m.fc); if (b) mapa.fitBounds(b, { padding: 80, maxZoom: 14, duration: 900 }); }
}
function actualizarMia(m) { m.fc.features.forEach((f, i) => { f.id = i; }); mapa.getSource('u-' + m.id)?.setData(m.fc); A.guardarCapa(serial(m)); pintarMis(); }
function quitarElemento(m, f) {
  m.fc.features = m.fc.features.filter(x => x !== f);
  if (!m.fc.features.length) return quitarMia(m);
  actualizarMia(m);
}
function quitarMia(m) {
  idsMia(m).forEach(l => mapa.getLayer(l) && mapa.removeLayer(l)); mapa.getSource('u-' + m.id) && mapa.removeSource('u-' + m.id);
  MIS.delete(m.id); A.borrarCapa(m.id); pintarMis();
}
const serial = m => ({ id: m.id, nombre: m.nombre, color: m.color, visible: m.visible, nota: m.nota, creado: m.creado, fotos: !!m.fotos, fc: m.fc });
function pintarMis() {
  queueMicrotask(() => imagenes?.pintarLista());
  const l = [...MIS.values()];
  $('#n-mis').textContent = l.length;
  $('#mis-vacio').hidden = l.length > 0;
  $('#mis-capas').innerHTML = l.map(m => {
    const n = m.fc.features.length, tipos = [...new Set(m.fc.features.map(f => f.geometry.type.replace('Multi', '')))].map(t => ({ Point: 'puntos', LineString: 'líneas', Polygon: 'polígonos' }[t] || t)).join(', ');
    return `<div class="mi" style="--c:${m.color}">
      <label class="capa-chk"><input type="checkbox" data-mia="${esc(m.id)}" ${m.visible ? 'checked' : ''}><span class="caja"></span>
        <span class="capa-nom">${esc(m.nombre)}<small>${fmtN(n)} ${n === 1 ? 'elemento' : 'elementos'} · ${esc(tipos)}${m.nota ? ' · ' + esc(m.nota) : ''}</small></span></label>
      <div class="mi-acc">
        <button data-mzoom="${esc(m.id)}" title="Acercar" aria-label="Acercar">⌕</button>
        <button data-mbajar="${esc(m.id)}" title="Descargar GeoJSON" aria-label="Descargar">↓</button>
        <button data-mquitar="${esc(m.id)}" title="Quitar" aria-label="Quitar">×</button>
      </div></div>`;
  }).join('');
}
$('#mis-capas').addEventListener('change', e => {
  const m = MIS.get(e.target.dataset.mia); if (!m) return;
  m.visible = e.target.checked; idsMia(m).forEach(l => mapa.setLayoutProperty(l, 'visibility', m.visible ? 'visible' : 'none')); A.guardarCapa(serial(m));
});
$('#mis-capas').addEventListener('click', e => {
  const z = e.target.closest('[data-mzoom]'), b = e.target.closest('[data-mbajar]'), q = e.target.closest('[data-mquitar]');
  if (z) { const bb = C.bbox(MIS.get(z.dataset.mzoom).fc); if (bb) mapa.fitBounds(bb, { padding: 80, maxZoom: 14 }); }
  if (b) { const m = MIS.get(b.dataset.mbajar); A.descargar(sinTilde(m.nombre).replace(/[^a-z0-9]+/g, '-') + '.geojson', A.aGeoJSON(sinId(m.fc)), 'application/geo+json'); }
  if (q) {
    if (q.dataset.confirmar) { quitarMia(MIS.get(q.dataset.mquitar)); cerrarFicha(); }
    else { q.dataset.confirmar = 1; q.style.color = 'var(--acento)'; q.title = 'Toca de nuevo para quitar'; aviso('Toca de nuevo el basurero para quitar la capa.'); setTimeout(() => { delete q.dataset.confirmar; q.style.color = ''; }, 3500); }
  }
});

let nColor = 0;
async function procesar(files) {
  files = [...files]; if (!files.length) return;
  verPestana('mis'); abrirPanelMovil();
  cargando(true, files.length > 1 ? `Leyendo ${files.length} archivos…` : `Leyendo ${files[0].name}…`);
  const ok = [], mal = [];
  for (const file of files) {
    try {
      const r = await A.leerArchivo(file);
      if (r.esFoto) {
        let m = MIS.get('fotos');
        if (m) { m.fc.features.push(...r.fc.features); actualizarMia(m); }
        else agregarMia({ id: 'fotos', nombre: 'Fotos de terreno', color: '#1c2326', fotos: true, fc: r.fc, visible: true, nota: 'con GPS', creado: Date.now() }, false);
        ok.push(file.name);
        continue;
      }
      const m = { id: 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), nombre: r.nombre, color: PALETA[nColor++ % PALETA.length], fc: r.fc, visible: true, nota: r.nota || '', creado: Date.now() };
      agregarMia(m, files.length === 1);
      ok.push(`${file.name} (${fmtN(r.fc.features.length)})`);
    } catch (e) {
      if (/GPS/.test(e.message) && /\.(jpe?g|png|webp|gif)$/i.test(file.name)) { await imagenes.subir(file); ok.push(file.name + ' (para georreferenciar)'); continue; }
      mal.push(`<b>${esc(file.name)}</b>: ${esc(e.message)}`);
    }
  }
  cargando(false);
  if (MIS.has('fotos') && files.some(f => /\.(jpe?g|png|heic|tiff?)$/i.test(f.name)) && ok.length) { const b = C.bbox(MIS.get('fotos').fc); if (b && files.length > 1) mapa.fitBounds(b, { padding: 80, maxZoom: 14 }); }
  if (files.length > 1 && ok.length) { const all = { type: 'FeatureCollection', features: [...MIS.values()].flatMap(m => m.fc.features) }; const b = C.bbox(all); if (b) mapa.fitBounds(b, { padding: 80, maxZoom: 14 }); }
  if (mal.length) aviso((ok.length ? `Cargados: ${ok.length}. ` : '') + mal.join('<br>'), true, 8000);
  else aviso(`Listo: ${esc(ok.join(', '))}`);
}
$('#archivo').addEventListener('change', e => { procesar(e.target.files); e.target.value = ''; });
$('#b-subir').addEventListener('click', () => $('#archivo').click());
let nArr = 0;
addEventListener('dragenter', e => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { nArr++; $('#soltar').hidden = false; } });
addEventListener('dragleave', () => { if (--nArr <= 0) { nArr = 0; $('#soltar').hidden = true; } });
addEventListener('dragover', e => e.preventDefault());
addEventListener('drop', e => { e.preventDefault(); nArr = 0; $('#soltar').hidden = true; if (e.dataTransfer?.files?.length) procesar(e.dataTransfer.files); });

// ------------------------------------------------------------------ exportar
$('#m-exp').addEventListener('click', async e => {
  const b = e.target.closest('[data-exp]'); if (!b) return; cerrarMenus();
  const fmt = b.dataset.exp;
  if (fmt === 'png') return exportarPNG();
  if (fmt === 'enlace') { guardarVista(); return copiar(location.href); }
  const fs = [...MIS.values()].filter(m => m.visible).flatMap(m => m.fc.features.map(({ id, ...f }) => ({ ...f, properties: { capa: m.nombre, ...f.properties } })));
  if (!fs.length) return aviso('Aún no tienes capas visibles en «Mis datos». Sube un archivo o dibuja algo primero.');
  const fc = { type: 'FeatureCollection', features: fs }, nom = 'observatorio-mis-datos-' + new Date().toISOString().slice(0, 10);
  if (fmt === 'geojson') A.descargar(nom + '.geojson', A.aGeoJSON(fc), 'application/geo+json');
  if (fmt === 'kml') A.descargar(nom + '.kml', A.aKML(fc, 'Mis datos · Observatorio Patagonia'), 'application/vnd.google-earth.kml+xml');
  if (fmt === 'csv') A.descargar(nom + '.csv', A.aCSV(fc, centro), 'text/csv;charset=utf-8');
});
function exportarPNG() {
  aviso('Preparando la imagen…');
  mapa.once('render', () => {
    const src = mapa.getCanvas(), w = src.width, h = src.height, pie = Math.round(46 * devicePixelRatio);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h + pie;
    const cx = cv.getContext('2d'); cx.drawImage(src, 0, 0);
    cx.fillStyle = '#ece9e2'; cx.fillRect(0, h, w, pie); cx.fillStyle = '#b8392c'; cx.fillRect(0, h, w, 2 * devicePixelRatio);
    const s = devicePixelRatio, c = mapa.getCenter();
    cx.fillStyle = '#1c2326'; cx.font = `600 ${16 * s}px Archivo, Arial, sans-serif`; cx.fillText('Observatorio Patagonia · Aysén y Magallanes', 14 * s, h + 20 * s);
    cx.font = `500 ${10 * s}px "IBM Plex Mono", monospace`; cx.fillStyle = '#4f5655';
    cx.fillText(`${new Date().toLocaleDateString('es-CL')} · centro ${c.lat.toFixed(4)}, ${c.lng.toFixed(4)} · zoom ${mapa.getZoom().toFixed(1)} · capas: ${activas().map(x => x.nombre).join(', ') || '—'}`.slice(0, 180), 14 * s, h + 36 * s);
    const fondoN = FONDOS.find(f => f.id === fondo); cx.textAlign = 'right';
    cx.fillStyle = '#b8392c'; cx.font = `700 ${12 * s}px Archivo, Arial, sans-serif`; cx.fillText('GEOGES ANALYTICS', w - 14 * s, h + 20 * s);
    cx.fillStyle = '#4f5655'; cx.font = `500 ${10 * s}px "IBM Plex Mono", monospace`; cx.fillText(('Fondo: ' + fondoN.nombre + ' · patagoniadechile.cl/observatorio').slice(0, 90), w - 14 * s, h + 36 * s);
    cv.toBlob(b => A.descargar(`observatorio-mapa-${new Date().toISOString().slice(0, 10)}.png`, b), 'image/png');
  });
  mapa.triggerRepaint();
}

// ------------------------------------------------------------------ búsqueda
const INDICE = [];
function indexar(c, fc) {
  const tipos = { localidades: 'localidad', comunas: 'comuna', protegidas: 'área protegida', glaciares: 'glaciar', lagos: 'lago', marinas: 'área marina', bnp: 'bien protegido', sitios: 'sitio prioritario', estaciones: 'estación DGA' };
  if (!tipos[c.id]) return;
  for (const f of fc.features) {
    const p = f.properties, n = c.id === 'comunas' ? p.comuna : p.nombre;
    if (!n) continue;
    INDICE.push({ n, k: sinTilde(n), tipo: c.id === 'protegidas' ? (p.designacion || tipos[c.id]) : tipos[c.id], c, f, peso: { localidades: 0, comunas: 1, protegidas: 2, lagos: 3, glaciares: 4 }[c.id] ?? 5 });
  }
}
let resSel = -1, resActual = [];
function buscar(q) {
  const t = sinTilde(q.trim()); const out = [];
  const co = C.leerCoordenadas(q);
  if (co) out.push({ coord: co, n: `${co.lat.toFixed(5)}, ${co.lon.toFixed(5)}`, tipo: 'ir a · ' + co.como });
  if (t.length >= 2) {
    const m = INDICE.filter(x => x.k.includes(t)).map(x => ({ ...x, s: (x.k.startsWith(t) ? 0 : x.k.includes(' ' + t) ? 1 : 2) * 10 + x.peso }));
    m.sort((a, b) => a.s - b.s || a.n.length - b.n.length);
    const vistos = new Set();
    for (const x of m) { const k = x.k + x.tipo; if (vistos.has(k)) continue; vistos.add(k); out.push(x); if (out.length >= 9) break; }
  }
  return out;
}
function pintarResultados(lista, nada = '') {
  resActual = lista; resSel = lista.length ? 0 : -1;
  const ul = $('#resultados');
  if (!lista.length && !nada) { ul.hidden = true; return; }
  ul.innerHTML = lista.length ? lista.map((r, i) => `<li role="option" data-r="${i}" aria-selected="${i === 0}"><span class="r-pt" style="background:${r.coord ? 'var(--hielo)' : r.c?.color || '#fff'}"></span><span>${esc(r.n)}</span><span class="r-tipo">${esc(r.tipo)}</span></li>`).join('')
    : `<li class="r-nada">${nada}</li>`;
  ul.hidden = false;
}
let tBus;
$('#q').addEventListener('input', e => { clearTimeout(tBus); tBus = setTimeout(() => pintarResultados(buscar(e.target.value)), 80); });
$('#q').addEventListener('keydown', e => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault(); if (!resActual.length) return;
    resSel = (resSel + (e.key === 'ArrowDown' ? 1 : -1) + resActual.length) % resActual.length;
    $$('#resultados li').forEach((li, i) => li.setAttribute('aria-selected', i === resSel));
  }
  if (e.key === 'Escape') { $('#resultados').hidden = true; e.target.blur(); }
});
$('#buscador').addEventListener('submit', async e => {
  e.preventDefault();
  if (resActual[resSel]) return elegir(resActual[resSel]);
  const q = $('#q').value.trim(); if (q.length < 3) return;
  // sin resultados locales: Nominatim (OpenStreetMap), solo al presionar Enter
  pintarResultados([], 'Buscando en OpenStreetMap…');
  try {
    const u = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=7&accept-language=es&countrycodes=cl&bounded=1&viewbox=-76.6,-43.4,-66,-56.3&q=${encodeURIComponent(q)}`;
    const d = await (await fetch(u)).json();
    const l = d.map(x => ({ coord: { lat: +x.lat, lon: +x.lon, como: 'OpenStreetMap' }, n: x.display_name.split(',').slice(0, 3).join(','), tipo: x.type?.replace(/_/g, ' ') || 'lugar', bbox: x.boundingbox?.map(Number) }));
    pintarResultados(l, `No encontré «${esc(q)}» en Aysén ni Magallanes.`);
  } catch { pintarResultados([], 'No se pudo consultar OpenStreetMap.'); }
});
$('#resultados').addEventListener('click', e => { const li = e.target.closest('[data-r]'); if (li) elegir(resActual[+li.dataset.r]); });
document.addEventListener('click', e => { if (!e.target.closest('.buscador')) $('#resultados').hidden = true; });
function elegir(r) {
  $('#resultados').hidden = true;
  if (r.coord) {
    const { lon, lat } = r.coord;
    if (r.bbox) mapa.fitBounds([[r.bbox[2], r.bbox[0]], [r.bbox[3], r.bbox[1]]], { padding: 80, maxZoom: 13 }); else mapa.flyTo({ center: [lon, lat], zoom: Math.max(mapa.getZoom(), 12) });
    mapa.getSource('pin').setData({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] } });
    return fichaPunto([lon, lat], r.tipo.startsWith('ir a') ? 'Coordenadas' : r.n);
  }
  const g = r.f.geometry;
  if (g.type === 'Point') mapa.flyTo({ center: g.coordinates, zoom: 12 }); else mapa.fitBounds(C.bbox({ geometry: g }), { padding: 90, maxZoom: 13 });
  const chk = $(`[data-act="${r.c.id}"]`); if (chk && !chk.checked) { chk.checked = true; activar(r.c); }
  abrirFicha([{ f: r.f, capa: r.c }]);
}

// ------------------------------------------------------------------ 3D, GPS, menús, pestañas, ayuda, teclado
$('#b-3d').addEventListener('click', () => {
  tresD = !tresD; $('#b-3d').setAttribute('aria-pressed', tresD);
  if (tresD) {
    mapa.setTerrain({ source: 'dem', exaggeration: 1.35 });
    try { mapa.setSky({ 'sky-color': '#0d1726', 'horizon-color': '#2a3a4d', 'fog-color': '#0a0f16', 'sky-horizon-blend': .6, 'horizon-fog-blend': .5, 'fog-ground-blend': .15 }); } catch {}
    mapa.easeTo({ pitch: 62, duration: 1200 });
    aviso('Relieve 3D activo: inclina con clic derecho o <kbd>Ctrl</kbd> + arrastrar.');
  } else { mapa.setTerrain(null); mapa.easeTo({ pitch: 0, bearing: 0, duration: 900 }); }
});
$('#b-gps').addEventListener('click', () => {
  cerrarMenus();
  if (!navigator.geolocation) return aviso('Este navegador no permite ubicar por GPS.', true);
  aviso('Buscando tu ubicación…');
  navigator.geolocation.getCurrentPosition(p => {
    const { longitude: lon, latitude: lat, accuracy } = p.coords;
    mapa.flyTo({ center: [lon, lat], zoom: 14 });
    mapa.getSource('pin').setData({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] } });
    fichaPunto([lon, lat], 'Tu ubicación', `<p class="f-varios">Precisión del GPS: ±${fmtN(accuracy)} m</p>`);
  }, err => aviso('No se pudo obtener tu ubicación: ' + esc(err.message), true), { enableHighAccuracy: true, timeout: 15000 });
});
function cerrarMenus() { $$('.menu').forEach(m => m.hidden = true); $$('[aria-haspopup]').forEach(b => b.setAttribute('aria-expanded', false)); }
for (const [b, m] of [['#b-herr', '#m-herr'], ['#b-exp', '#m-exp']]) {
  $(b).addEventListener('click', e => { e.stopPropagation(); const abrir = $(m).hidden; cerrarMenus(); $(m).hidden = !abrir; $(b).setAttribute('aria-expanded', abrir); });
}
document.addEventListener('click', e => { if (!e.target.closest('.menu-caja')) cerrarMenus(); });
function verPestana(id) {
  $$('.pestanas button').forEach(b => b.setAttribute('aria-selected', b.dataset.pes === id));
  $$('.pes').forEach(s => s.hidden = s.dataset.pes !== id);
}
$('.pestanas').addEventListener('click', e => { const b = e.target.closest('[data-pes]'); if (b) verPestana(b.dataset.pes); });
$('[data-pes="tele"]').addEventListener('click', e => {
  const f = e.target.closest('[data-ir-fondo]'), c = e.target.closest('[data-ir-capa]');
  if (f) ponerFondo(f.dataset.irFondo);
  if (c) { const chk = $(`[data-act="${c.dataset.irCapa}"]`); if (!chk.checked) { chk.checked = true; activar(CAPA[c.dataset.irCapa]); guardarVista(); } verPestana('capas'); chk.closest('.capa').scrollIntoView({ block: 'center', behavior: 'smooth' }); }
});
function abrirPanelMovil() { if (matchMedia('(max-width:820px)').matches) $('#panel').classList.add('abierto'); }
$('#b-panel').addEventListener('click', () => $('#panel').classList.toggle('abierto'));
mapa.on('mousedown', () => $('#panel').classList.remove('abierto'));
mapa.on('touchstart', () => $('#panel').classList.remove('abierto'));
$('#b-ayuda').addEventListener('click', () => { $('#ayuda').hidden = false; $('#ayuda [data-cerrar]').focus(); });
$('#ayuda').addEventListener('click', e => { if (e.target === e.currentTarget || e.target.closest('[data-cerrar]')) $('#ayuda').hidden = true; });
$('#lista-fuentes').innerHTML = CAPAS.map(c => `<li style="--c:${c.color}"><i></i><span><b>${esc(c.nombre)}</b> · ${c.enlace ? `<a href="${esc(c.enlace)}" target="_blank" rel="noopener">${esc(c.fuente)}</a>` : esc(c.fuente)}${c.fecha ? ' · ' + esc(c.fecha) : ''}</span></li>`).join('')
  + FONDOS.map(f => `<li style="--c:#666"><i></i><span><b>Fondo ${esc(f.nombre)}</b> · ${f.atrib}</span></li>`).join('');

addEventListener('keydown', e => {
  const escribiendo = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
  if (e.key === 'Escape') { if (herr) cancelar(); else if (!$('#ayuda').hidden) $('#ayuda').hidden = true; else if (!$('#ficha').hidden) cerrarFicha(); cerrarMenus(); return; }
  if (herr && e.key === 'Enter') { e.preventDefault(); return terminar(); }
  if (herr && e.key === 'Backspace' && !escribiendo) { herr.pts.pop(); pintarDibujo(); return; }
  if (escribiendo || e.ctrlKey || e.metaKey || e.altKey) return;
  const m = { d: 'distancia', a: 'area', p: 'punto', l: 'linea', g: 'poligono' }[e.key.toLowerCase()];
  if (m) empezar(m);
  if (e.key === '/') { e.preventDefault(); $('#q').focus(); }
});

// ------------------------------------------------------------------ enlace a la vista
let tVista;
function guardarVista() {
  clearTimeout(tVista);
  tVista = setTimeout(() => {
    const c = mapa.getCenter();
    history.replaceState(null, '', `#@${c.lat.toFixed(4)},${c.lng.toFixed(4)},${mapa.getZoom().toFixed(2)}z&f=${fondo}&c=${activas().map(x => x.id).join(',')}`);
  }, 250);
}
mapa.on('moveend', guardarVista);

// ------------------------------------------------------------------ «Qué ver», leyenda, resumen y norte
function pintarVistas() {
  $('#vistas').innerHTML = VISTAS.map(v => `<button type="button" data-vista="${v.id}" aria-pressed="false" style="--c:${v.color}">${esc(v.nombre)}<small>${esc(v.sub)}</small></button>`).join('');
}
function marcarVista(id) { $$('#vistas [data-vista]').forEach(b => b.setAttribute('aria-pressed', b.dataset.vista === id)); }
$('#vistas').addEventListener('click', e => {
  const b = e.target.closest('[data-vista]'); if (!b) return;
  const v = VISTAS.find(x => x.id === b.dataset.vista);
  for (const c of CAPAS) {
    const chk = $(`[data-act="${c.id}"]`), on = v.capas.includes(c.id);
    if (chk.checked !== on) { chk.checked = on; on ? activar(c) : desactivar(c); }
  }
  marcarVista(v.id); guardarVista(); pintarLeyenda();
  mapa.fitBounds(LIMITES, { padding: 30, duration: 900 });
});
function pintarLeyenda() {
  const l = activas().filter(c => !['comunas', 'localidades'].includes(c.id));
  const sim = (c, col) => c.tipo.startsWith('poligono') && c.tipo !== 'poligono-trazo' || c.tipo === 'raster' ? `<i style="--c:${col}"></i>` : c.tipo.startsWith('linea') || c.tipo === 'poligono-trazo' ? `<i class="l" style="--c:${col}"></i>` : `<i class="p" style="--c:${col}"></i>`;
  $('#leyenda').innerHTML = l.length ? l.flatMap(c => c.cats ? Object.entries(c.cats).map(([k, v]) => `<span class="clave">${sim(c, v)}${esc(c.nombre)}: ${esc(k)}</span>`) : [`<span class="clave">${sim(c, c.color)}${esc(c.nombre)}</span>`]).join('')
    : '<span class="clave">Elige capas en «Qué ver» o en la lista de capas</span>';
}
const fmtKm = n => fmtN(n) + ' km²';
async function pintarResumen() {
  let r; try { r = await (await fetch('datos/resumen.json?v=1')).json(); } catch { return; }
  const A = r.regiones['Aysén'], M = r.regiones['Magallanes'], T = r.total;
  $('#resumen').innerHTML = `<span>Superficie <b>${fmtKm(T.superficie_km2)}</b></span><span>Protegida <b>${fmtN(T.protegida_pct, 1)} %</b></span><span>Glaciares <b>${fmtN(T.n_glaciares)}</b></span><span>Predios fiscales <b>${fmtN(T.n_predios_fiscales)}</b></span><span>Concesiones acuícolas <b>${fmtN(T.n_concesiones)}</b></span><span id="r-focos"></span>`;
  const fila = (t, k, f = fmtN, alto) => `<tr><td>${t}</td><td${alto === 'A' ? ' class="alto"' : ''}>${f(A[k] || 0)}</td><td${alto === 'M' ? ' class="alto"' : ''}>${f(M[k] || 0)}</td><td>${f(T[k] || 0)}</td></tr>`;
  const pct = v => fmtN(v, 1) + ' %';
  $('#resumen-der').innerHTML = `
    <div><span class="etq">Territorio · datos públicos oficiales</span><h2>Aysén y Magallanes</h2><p>Monitoreo abierto de la Patagonia chilena. Cifras calculadas sobre las capas del visor · ${esc(r.generado)}.</p></div>
    <div class="cifra"><b>${fmtN(T.protegida_pct, 1)} %</b><span>de la superficie terrestre está bajo protección oficial: ${fmtKm(T.protegida_km2)} de ${fmtKm(T.superficie_km2)}</span></div>
    <table class="reg-tabla"><thead><tr><th></th><th>Aysén</th><th>Magallanes</th><th>Total</th></tr></thead><tbody>
      ${fila('Superficie (km²)', 'superficie_km2')}
      ${fila('Protegida (oficial)', 'protegida_pct', pct)}
      ${fila('Conservación privada (km²)', 'privada_km2')}
      ${fila('Glaciares', 'n_glaciares')}
      ${fila('Hielo (km²)', 'glaciares_km2')}
      ${fila('Predios fiscales', 'n_predios_fiscales')}
      ${fila('Concesiones acuícolas', 'n_concesiones', fmtN, A.n_concesiones > M.n_concesiones ? 'A' : 'M')}
      ${fila('Solicitudes en trámite', 'n_solicitudes', fmtN, M.n_solicitudes > A.n_solicitudes ? 'M' : 'A')}
      ${fila('Proyectos SEIA', 'n_seia')}
      ${fila('· en evaluación', 'n_seia_en_evaluacion')}
      ${fila('Estaciones DGA', 'n_estaciones')}
    </tbody></table>
    <p class="nota">Protegida: SNASPE y otras áreas oficiales del Registro Nacional, solo la parte terrestre y sin contar dos veces las superposiciones. Glaciares: inventario DGA 2022 (mayores a 0,05 km²).</p>
    <div id="r-focos-caja"></div>
    <div class="aviso-caja">Haz clic en cualquier elemento del mapa para ver su ficha, o en un punto vacío para saber en qué comuna y áreas cae.</div>`;
  // focos de calor de 7 días (se consulta aparte, en segundo plano)
  const fc = await cargarDatos(CAPA.focos, true).catch(() => null);
  if (fc) {
    $('#r-focos').innerHTML = `Focos 7 días <b>${fmtN(fc.features.length)}</b>`;
    $('#r-focos-caja').innerHTML = `<h3>Focos de calor · últimos 7 días</h3><p><b style="color:var(--acento);font:700 20px var(--titulo)">${fmtN(fc.features.length)}</b> ${fc.features.length === 1 ? 'detección' : 'detecciones'} VIIRS en Aysén y Magallanes${fc.features.length ? ' · <button class="volver" id="ver-focos" type="button">verlas en el mapa</button>' : ''}.</p>`;
    $('#ver-focos')?.addEventListener('click', () => { const chk = $('[data-act="focos"]'); if (!chk.checked) { chk.checked = true; activar(CAPA.focos); } const b = C.bbox(fc); if (b) mapa.fitBounds(b, { padding: 80, maxZoom: 9 }); });
  }
}
mapa.on('rotate', () => { $('#norte .aguja').style.transform = `rotate(${-mapa.getBearing()}deg)`; });

// ------------------------------------------------------------------ imágenes georreferenciadas
const imagenes = crearImagenes({ mapa, aviso, A, C, verPestana });
const subirImg = () => $('#archivo-img').click();
$('#b-img').addEventListener('click', subirImg);
$('#zona-img').addEventListener('click', subirImg);
$('#archivo-img').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  try { cargando(true, 'Preparando la imagen…'); await imagenes.subir(f); } catch { aviso('No se pudo abrir esa imagen. Usa JPG o PNG.', true); } finally { cargando(false); }
});

// ------------------------------------------------------------------ arranque
pintarFondos(); pintarCatalogo(); pintarMis(); pintarVistas(); pintarLeyenda(); pintarResumen();
mapa.on('load', async () => {
  // fuentes de trabajo: selección, chincheta, dibujo y medición
  const vacia = { type: 'geojson', data: { type: 'FeatureCollection', features: [] } };
  for (const s of ['sel', 'pin', 'dib', 'medida']) mapa.addSource(s, structuredClone(vacia));
  mapa.addLayer({ id: 'sel-f', type: 'fill', source: 'sel', filter: ['match', ['geometry-type'], ['Polygon', 'MultiPolygon'], true, false], paint: { 'fill-color': '#b8392c', 'fill-opacity': .1 } }, 'z-sel');
  mapa.addLayer({ id: 'sel-halo', type: 'line', source: 'sel', paint: { 'line-color': '#fff7ea', 'line-width': 6, 'line-opacity': .85 } }, 'z-sel');
  mapa.addLayer({ id: 'sel-l', type: 'line', source: 'sel', paint: { 'line-color': '#b8392c', 'line-width': 2.2 } }, 'z-sel');
  mapa.addLayer({ id: 'sel-p', type: 'circle', source: 'sel', filter: ['match', ['geometry-type'], ['Point', 'MultiPoint'], true, false], paint: { 'circle-radius': 9, 'circle-color': 'rgba(184,57,44,.15)', 'circle-stroke-color': '#b8392c', 'circle-stroke-width': 2.2 } }, 'z-sel');
  mapa.addLayer({ id: 'pin', type: 'circle', source: 'pin', paint: { 'circle-radius': 6, 'circle-color': '#b8392c', 'circle-stroke-color': '#fff7ea', 'circle-stroke-width': 2.5 } }, 'z-sel');
  mapa.addLayer({ id: 'medida-f', type: 'fill', source: 'medida', paint: { 'fill-color': '#b8392c', 'fill-opacity': .12 } }, 'z-dib');
  mapa.addLayer({ id: 'medida-l', type: 'line', source: 'medida', paint: { 'line-color': '#b8392c', 'line-width': 2.4, 'line-dasharray': [2, 1.5] } }, 'z-dib');
  mapa.addLayer({ id: 'dib-f', type: 'fill', source: 'dib', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': '#b8392c', 'fill-opacity': .12 } }, 'z-dib');
  mapa.addLayer({ id: 'dib-l', type: 'line', source: 'dib', filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': '#b8392c', 'line-width': 2.2, 'line-dasharray': [2, 1.2] } }, 'z-dib');
  mapa.addLayer({ id: 'dib-v', type: 'circle', source: 'dib', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 4.5, 'circle-color': '#fff7ea', 'circle-stroke-color': '#b8392c', 'circle-stroke-width': 2 } }, 'z-dib');
  pintarZoom(); ponerFondo(fondo);
  $('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');

  // capas activas al abrir (las más livianas primero)
  for (const c of CAPAS.filter(c => activasIni.has(c.id))) activar(c);
  // capas del investigador guardadas en este navegador
  for (const m of await A.leerCapas()) { if (m.tipo === 'imagen') { try { imagenes.restaurar(m); } catch {} continue; } try { if (m.id?.startsWith('a')) nColor++; agregarMia(m, false); } catch {} }
  // índice de búsqueda: carga en segundo plano las capas con nombres que no están activas
  setTimeout(() => { for (const id of ['lagos', 'marinas', 'bnp', 'sitios', 'estaciones']) if (!DATOS[id]) cargarDatos(CAPA[id], true).catch(() => {}); }, 2500);
});
mapa.on('error', e => { if (e?.error?.message && !/tile|Failed to fetch|NetworkError|AJAXError/i.test(e.error.message)) console.warn('[obs]', e.error.message); });
