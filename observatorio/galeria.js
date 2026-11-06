// Galería de terreno del Observatorio Patagonia: mosaico + mapa, visor de fotos y subida con ubicación (GPS, recorrido GPX o clic en el mapa).
import { TEMAS, COLOR_TEMA, leerFoto, achicar, leerGPX, ubicarEnRecorrido, rumboEntre, iconoCono, comunaDe, rumboTexto, dentroCaja, CAJA } from './obs-fotos.js?v=1794005392';
import * as C from './obs-coords.js?v=1794005392';

const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sinTilde = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const fmtN = (n, d = 0) => Number(n).toLocaleString('es-CL', { maximumFractionDigits: d, minimumFractionDigits: d });
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fechaCorta = t => { if (!t) return ''; const [a, m, d] = t.slice(0, 10).split('-'); return `${+d} ${MESES[+m - 1]} ${a}`; };
const fechaLarga = t => t ? fechaCorta(t) + (t.length > 10 ? ' · ' + t.slice(11, 16) : '') : '';
const API = '../api/fotos.php';
const leerLS = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const guardarLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } };
const G = (() => { try { return localStorage.getItem('pc_gestion') || ''; } catch { return ''; } })();
const MIAS = leerLS('pc_fotos_mias', {});
const REPORTADAS = new Set(leerLS('pc_fotos_reportadas', []));

let FOTOS = [], COMUNAS = null, GESTION = false;
const filtro = { q: '', region: '', comuna: '', anio: '', orden: 'recientes', temas: new Set(), vista: false, reportadas: false };

function aviso(t, mal = false) {
  const a = $('#aviso'); a.innerHTML = t; a.classList.toggle('mal', mal); a.classList.add('ver');
  clearTimeout(aviso.t); aviso.t = setTimeout(() => a.classList.remove('ver'), mal ? 6000 : 3200);
}
async function post(cuerpo) {
  try { const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) }); return await r.json(); }
  catch { return { ok: false, error: 'Sin conexión con el servidor. Intenta de nuevo.' }; }
}

// ------------------------------------------------------------------ fondos y mapas
const FONDOS = {
  papel: { tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}'], max: 16, atrib: 'Base © Esri, HERE, Garmin, © colaboradores de OpenStreetMap' },
  satelite: { tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], max: 19, atrib: 'Imágenes © Esri, Maxar, Earthstar Geographics' },
  etiquetas: { tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}'], max: 16, atrib: '' },
};
const estilo = (fondo = 'papel') => ({
  version: 8, glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
  sources: Object.fromEntries(Object.entries(FONDOS).map(([k, f]) => ['f-' + k, { type: 'raster', tiles: f.tiles, tileSize: 256, maxzoom: f.max, attribution: f.atrib }])),
  layers: [
    { id: 'f-papel', type: 'raster', source: 'f-papel', layout: { visibility: fondo === 'papel' ? 'visible' : 'none' } },
    { id: 'f-satelite', type: 'raster', source: 'f-satelite', layout: { visibility: fondo === 'satelite' ? 'visible' : 'none' } },
    { id: 'f-etiquetas', type: 'raster', source: 'f-etiquetas', layout: { visibility: fondo === 'papel' ? 'visible' : 'none' }, paint: { 'raster-opacity': .9 } },
  ],
});
const LIMITES = [[CAJA.lonO, CAJA.latS], [CAJA.lonE, CAJA.latN]];
function nuevoMapa(contenedor, fondo = 'papel', extra = {}) {
  const m = new maplibregl.Map({ container: contenedor, style: estilo(fondo), bounds: LIMITES, fitBoundsOptions: { padding: 20 }, attributionControl: { compact: true }, dragRotate: false, ...extra });
  m.touchZoomRotate.disableRotation();
  return m;
}
const vacia = () => ({ type: 'FeatureCollection', features: [] });

// ------------------------------------------------------------------ mapa principal
const mapa = nuevoMapa('g-mapa');
mapa.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
let mapaListo = false;
const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12, maxWidth: '220px' });
mapa.on('load', () => {
  mapa.addImage('cono', iconoCono('#b8392c'));
  mapa.addSource('fotos', { type: 'geojson', data: vacia(), cluster: true, clusterRadius: 40, clusterMaxZoom: 13 });
  mapa.addSource('sel', { type: 'geojson', data: vacia() });
  mapa.addLayer({ id: 'cl', type: 'circle', source: 'fotos', filter: ['has', 'point_count'],
    paint: { 'circle-color': '#1c2326', 'circle-opacity': .88, 'circle-stroke-color': '#f7f5f0', 'circle-stroke-width': 2,
             'circle-radius': ['step', ['get', 'point_count'], 13, 10, 17, 50, 22, 200, 28] } });
  mapa.addLayer({ id: 'cl-n', type: 'symbol', source: 'fotos', filter: ['has', 'point_count'],
    layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Open Sans Bold'], 'text-size': 12, 'text-allow-overlap': true },
    paint: { 'text-color': '#f7f5f0' } });
  mapa.addLayer({ id: 'cono', type: 'symbol', source: 'fotos', filter: ['all', ['!', ['has', 'point_count']], ['has', 'rumbo']],
    layout: { 'icon-image': 'cono', 'icon-rotate': ['get', 'rumbo'], 'icon-rotation-alignment': 'map', 'icon-allow-overlap': true, 'icon-ignore-placement': true,
              'icon-size': ['interpolate', ['linear'], ['zoom'], 6, .55, 12, .9, 16, 1.4] } });
  mapa.addLayer({ id: 'pt', type: 'circle', source: 'fotos', filter: ['!', ['has', 'point_count']],
    paint: { 'circle-color': ['get', 'color'], 'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 4.5, 12, 6.5, 16, 8], 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.6 } });
  mapa.addLayer({ id: 'sel', type: 'circle', source: 'sel',
    paint: { 'circle-color': 'rgba(0,0,0,0)', 'circle-radius': 13, 'circle-stroke-color': '#b8392c', 'circle-stroke-width': 3 } });
  mapaListo = true; pintarMapa();
});
mapa.on('click', 'cl', async e => {
  const f = e.features[0];
  const z = await mapa.getSource('fotos').getClusterExpansionZoom(f.properties.cluster_id);
  mapa.easeTo({ center: f.geometry.coordinates, zoom: Math.min(z + .3, 16) });
});
mapa.on('click', 'pt', e => abrirVisor(+e.features[0].properties.id));
for (const l of ['cl', 'pt']) { mapa.on('mouseenter', l, () => mapa.getCanvas().style.cursor = 'pointer'); mapa.on('mouseleave', l, () => { mapa.getCanvas().style.cursor = ''; popup.remove(); }); }
mapa.on('mousemove', 'pt', e => {
  const p = e.features[0].properties, f = POR_ID.get(+p.id); if (!f) return;
  popup.setLngLat(e.features[0].geometry.coordinates).setHTML(`<div class="pop-foto"><img src="../${esc(f.mini)}" alt=""><span>${esc(f.titulo || 'Sin título')}<small>${esc(f.autor)}${f.tomada ? ' · ' + fechaCorta(f.tomada) : ''}</small></span></div>`).addTo(mapa);
});
mapa.on('moveend', () => { if (filtro.vista) pintarMosaico(); });
$$('[data-fondo]').forEach(b => b.onclick = () => {
  $$('[data-fondo]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  const sat = b.dataset.fondo === 'satelite';
  mapa.setLayoutProperty('f-papel', 'visibility', sat ? 'none' : 'visible'); mapa.setLayoutProperty('f-etiquetas', 'visibility', sat ? 'none' : 'visible');
  mapa.setLayoutProperty('f-satelite', 'visibility', sat ? 'visible' : 'none');
});
function marcar(f) { if (mapaListo) mapa.getSource('sel').setData(f ? { type: 'Feature', geometry: { type: 'Point', coordinates: [f.lon, f.lat] }, properties: {} } : vacia()); }

// ------------------------------------------------------------------ datos
const POR_ID = new Map();
function enriquecer(f) {
  const c = COMUNAS ? comunaDe(COMUNAS, f.lon, f.lat) : null;
  f.comuna = c?.comuna || null;
  f.region = c?.region ? (sinTilde(c.region).startsWith('ays') ? 'Aysén' : 'Magallanes') : (f.lat > -49 ? 'Aysén' : 'Magallanes');
  f.anio = f.tomada ? f.tomada.slice(0, 4) : null;
  f.color = COLOR_TEMA[f.tema] || COLOR_TEMA.otro;
  f.texto = sinTilde([f.titulo, f.descripcion, f.autor, f.comuna, f.region, TEMAS[f.tema]].join(' '));
  POR_ID.set(f.id, f);
  return f;
}
async function cargar() {
  const [r, c] = await Promise.all([
    fetch(API + (G ? '?g=' + encodeURIComponent(G) : ''), { cache: 'no-store' }).then(r => r.json()).catch(() => null),
    COMUNAS ? COMUNAS : fetch('datos/comunas.json').then(r => r.json()).catch(() => null),
  ]);
  COMUNAS = c;
  if (!r?.ok) { $('#g-cuenta').textContent = 'No se pudo cargar la galería. Intenta recargar la página.'; return; }
  GESTION = !!r.gestion;
  POR_ID.clear(); FOTOS = r.fotos.map(enriquecer);
  pintarFiltros(); pintarTodo();
}

function pasaFiltros(f, conTema = true) {
  if (!GESTION || !filtro.reportadas) { if (f.oculta && !GESTION) return false; } else if (!f.reportes && !f.oculta) return false;
  if (filtro.region && f.region !== filtro.region) return false;
  if (filtro.comuna && f.comuna !== filtro.comuna) return false;
  if (filtro.anio && f.anio !== filtro.anio) return false;
  if (conTema && filtro.temas.size && !filtro.temas.has(f.tema)) return false;
  if (filtro.q && !sinTilde(filtro.q).split(/\s+/).every(p => f.texto.includes(p))) return false;
  return true;
}
const ORDEN = {
  recientes: (a, b) => b.id - a.id,
  tomada: (a, b) => (b.tomada || '').localeCompare(a.tomada || '') || b.id - a.id,
  antiguas: (a, b) => (a.tomada || '9999').localeCompare(b.tomada || '9999') || a.id - b.id,
};
function filtradas() { return FOTOS.filter(f => pasaFiltros(f)).sort(ORDEN[filtro.orden]); }
function visibles() {
  let l = filtradas();
  if (filtro.vista && mapaListo) { const b = mapa.getBounds(); l = l.filter(f => b.contains([f.lon, f.lat])); }
  return l;
}

// ------------------------------------------------------------------ pintar
function pintarFiltros() {
  const comunas = [...new Set((COMUNAS?.features || []).filter(f => !filtro.region || (sinTilde(f.properties.region).startsWith('ays') ? 'Aysén' : 'Magallanes') === filtro.region).map(f => f.properties.comuna))].sort((a, b) => a.localeCompare(b, 'es'));
  $('#g-comuna').innerHTML = '<option value="">Todas las comunas</option>' + comunas.map(c => `<option${c === filtro.comuna ? ' selected' : ''}>${esc(c)}</option>`).join('');
  const anios = [...new Set(FOTOS.map(f => f.anio).filter(Boolean))].sort().reverse();
  $('#g-anio').innerHTML = '<option value="">Todos los años</option>' + anios.map(a => `<option${a === filtro.anio ? ' selected' : ''}>${a}</option>`).join('');
}
function pintarTemas() {
  const base = FOTOS.filter(f => pasaFiltros(f, false)), n = {};
  base.forEach(f => n[f.tema] = (n[f.tema] || 0) + 1);
  $('#g-temas').innerHTML = Object.entries(TEMAS).map(([k, t]) => `<button type="button" data-tema="${k}" aria-pressed="${filtro.temas.has(k)}" style="--c:${COLOR_TEMA[k]}"><i></i>${esc(t)}<small>${n[k] || 0}</small></button>`).join('');
}
const flecha = r => `<svg viewBox="0 0 24 24" style="transform:rotate(${r}deg)" aria-hidden="true"><path d="M12 2 18.5 21 12 16.6 5.5 21Z"/></svg>`;
function pintarMosaico() {
  const l = visibles(), total = FOTOS.filter(f => GESTION || !f.oculta).length;
  $('#g-cuenta').innerHTML = total ? `<b>${fmtN(l.length)}</b> de ${fmtN(total)} fotos${filtro.vista ? ' en la zona visible del mapa' : ''} · licencia CC BY 4.0` : '';
  $('#mosaico').innerHTML = l.map(f => `<button class="tarjeta${f.oculta ? ' oculta' : ''}" type="button" role="listitem" data-id="${f.id}" style="--c:${f.color}">
      <img src="../${esc(f.mini)}" alt="${esc(f.titulo || 'Foto de terreno')}" loading="lazy" width="320" height="${Math.round(320 * f.h / f.w)}">
      <span class="t-tema">${esc(TEMAS[f.tema] || 'Otro')}</span>
      ${f.rumbo != null ? `<span class="t-rumbo" title="Mira hacia el ${esc(rumboTexto(f.rumbo))}">${flecha(f.rumbo)}</span>` : ''}
      ${GESTION && f.reportes ? `<span class="t-rep">${f.reportes} reporte${f.reportes > 1 ? 's' : ''}${f.oculta ? ' · oculta' : ''}</span>` : ''}
      <span class="t-info"><span class="t-tit">${esc(f.titulo || 'Sin título')}</span><span class="t-meta">${esc(f.autor)} · ${esc(f.comuna || f.region)}${f.tomada ? ' · ' + fechaCorta(f.tomada) : ''}</span></span></button>`).join('')
    || (FOTOS.length ? '<p class="vacio">Ninguna foto coincide con estos filtros.</p>'
                     : '<div class="vacio"><b>La galería está esperando sus primeras fotos.</b><br>Sube fotos de terreno de Aysén o Magallanes: quedan ubicadas en el mapa para que cualquiera las use citando tu nombre.<br><button class="h-btn h-pri" type="button" data-abrir-subida>Subir las primeras fotos</button></div>');
  const ocultas = FOTOS.filter(f => f.oculta).length, rep = FOTOS.filter(f => f.reportes).length;
  $('#g-gestion').hidden = !GESTION;
  if (GESTION) $('#g-gestion').innerHTML = `Modo gestión: puedes <b>suprimir</b> cualquier foto desde su ficha. ${rep ? `${rep} con reportes${ocultas ? `, ${ocultas} oculta${ocultas > 1 ? 's' : ''} hasta que la revises` : ''} · <button class="h-btn" type="button" id="g-ver-rep" aria-pressed="${filtro.reportadas}">${filtro.reportadas ? 'Ver todas' : 'Ver solo reportadas'}</button>` : 'No hay fotos reportadas.'}`;
}
function pintarMapa() {
  if (!mapaListo) return;
  mapa.getSource('fotos').setData({ type: 'FeatureCollection', features: filtradas().map(f => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [f.lon, f.lat] },
    properties: { id: f.id, color: f.color, ...(f.rumbo != null ? { rumbo: f.rumbo } : {}) } })) });
}
function pintarTodo() { pintarTemas(); pintarMosaico(); pintarMapa(); }

// filtros
let tq; $('#g-q').oninput = e => { clearTimeout(tq); tq = setTimeout(() => { filtro.q = e.target.value.trim(); pintarTodo(); }, 160); };
$('#g-region').onchange = e => { filtro.region = e.target.value; filtro.comuna = ''; pintarFiltros(); pintarTodo(); };
$('#g-comuna').onchange = e => { filtro.comuna = e.target.value; pintarTodo(); };
$('#g-anio').onchange = e => { filtro.anio = e.target.value; pintarTodo(); };
$('#g-orden').onchange = e => { filtro.orden = e.target.value; pintarMosaico(); };
$('#g-vista').onchange = e => { filtro.vista = e.target.checked; pintarMosaico(); };
document.addEventListener('click', e => {
  const t = e.target.closest('[data-tema]'); if (t) { const k = t.dataset.tema; filtro.temas.has(k) ? filtro.temas.delete(k) : filtro.temas.add(k); pintarTodo(); return; }
  const c = e.target.closest('.tarjeta'); if (c) { abrirVisor(+c.dataset.id); return; }
  if (e.target.closest('[data-abrir-subida]')) abrirSubida();
  if (e.target.closest('#g-ver-rep')) { filtro.reportadas = !filtro.reportadas; pintarTodo(); }
});
$('#mosaico').addEventListener('mouseover', e => { const c = e.target.closest('.tarjeta'); if (c) marcar(POR_ID.get(+c.dataset.id)); });
$('#mosaico').addEventListener('mouseleave', () => marcar(null));
// pestañas en celular
$$('[data-gp]').forEach(b => { if (b.tagName === 'BUTTON') b.onclick = () => {
  $$('.g-pestanas button').forEach(x => x.setAttribute('aria-selected', String(x === b)));
  $$('#g-cuerpo>[data-gp]').forEach(p => p.classList.toggle('fuera', p.dataset.gp !== b.dataset.gp));
  if (b.dataset.gp === 'mapa') setTimeout(() => mapa.resize(), 30);
}; });
if (matchMedia('(max-width:980px)').matches) $('#g-der').classList.add('fuera');

// ------------------------------------------------------------------ visor de una foto
let vLista = [], vIdx = 0, miniMapa = null, miniMarca = null;
$('#v-ficha').innerHTML = '<div id="v-a"></div><div class="v-mini" id="v-mini"></div><div id="v-b"></div>';
function abrirVisor(id) {
  vLista = visibles(); vIdx = vLista.findIndex(f => f.id === id);
  if (vIdx < 0) { const f = POR_ID.get(id); if (!f) return; vLista = [f]; vIdx = 0; }
  $('#visor').hidden = false; document.body.style.overflow = 'hidden';
  pintarVisor();
}
function cerrarVisor() { $('#visor').hidden = true; history.replaceState(null, '', location.pathname + location.search); marcar(null); }
function pintarVisor() {
  const f = vLista[vIdx]; if (!f) return cerrarVisor();
  history.replaceState(null, '', '#f=' + f.id);
  $('#v-foto').src = '../' + f.mini; $('#v-foto').alt = f.titulo || 'Foto de terreno';
  const grande = new Image(); grande.onload = () => { if (vLista[vIdx] === f) $('#v-foto').src = grande.src; }; grande.src = '../' + f.archivo;
  $('#v-ant').hidden = vIdx <= 0; $('#v-sig').hidden = vIdx >= vLista.length - 1;
  const u = C.aUTM(f.lon, f.lat), enlace = location.origin + location.pathname + '#f=' + f.id;
  const cita = `Foto: ${f.autor} · Galería de terreno, Observatorio Patagonia · CC BY 4.0`;
  const propia = MIAS[f.id];
  const origen = { gps: 'GPS de la cámara', recorrido: 'Recorrido GPX', mapa: 'Marcada en el mapa' }[f.origen] || '—';
  $('#v-a').innerHTML = `
    ${f.oculta ? `<p class="v-oculta">Oculta por ${f.reportes} reporte${f.reportes === 1 ? '' : 's'}: el público no la ve. Restáurala o suprímela.</p>` : ''}
    <span class="etq" style="--c:${f.color}"><i></i>${esc(TEMAS[f.tema] || 'Otro')} · ${vIdx + 1} de ${vLista.length}</span>
    <h2 id="v-titulo">${esc(f.titulo || 'Sin título')}</h2>
    <p class="v-autor">Foto: <b>${esc(f.autor)}</b>${f.tomada ? ' · ' + fechaLarga(f.tomada) : ''}</p>
    ${f.descripcion ? `<p class="v-descr">${esc(f.descripcion)}</p>` : ''}`;
  $('#v-b').innerHTML = `
    <table class="t-ficha">
      <tr><th>Lugar</th><td>${esc(f.comuna ? f.comuna + ' · ' + f.region : f.region + ' (fuera de los límites comunales)')}</td></tr>
      <tr><th>Coordenadas</th><td>${f.lat.toFixed(6)}, ${f.lon.toFixed(6)}<br><small>${C.aGMS(f.lat, 'lat')} ${C.aGMS(f.lon, 'lon')}</small></td></tr>
      <tr><th>UTM</th><td>${u.huso}${u.hemisferio} · ${fmtN(u.este)} E · ${fmtN(u.norte)} N</td></tr>
      <tr><th>Dirección</th><td>${f.rumbo != null ? 'Mira hacia el ' + esc(rumboTexto(f.rumbo)) : 'Sin dato'}</td></tr>
      ${f.altitud != null ? `<tr><th>Altitud</th><td>${fmtN(f.altitud)} m (GPS)</td></tr>` : ''}
      <tr><th>Ubicación</th><td>${origen}</td></tr>
      <tr><th>Tamaño</th><td>${f.w} × ${f.h} px</td></tr>
      <tr><th>Publicada</th><td>${fechaCorta(f.creado)}</td></tr>
    </table>
    <div class="v-cita">${esc(cita)}<br><a href="https://creativecommons.org/licenses/by/4.0/deed.es" target="_blank" rel="noopener">Qué permite la licencia CC BY 4.0 ↗</a></div>
    <div class="v-acc">
      <a class="h-btn h-pri" href="./#@${f.lat.toFixed(5)},${f.lon.toFixed(5)},14z&c=comunas,localidades,fotos">Ver en el visor</a>
      <a class="h-btn" href="../${esc(f.archivo)}" download="${esc(sinTilde(f.titulo || 'foto').replace(/[^a-z0-9]+/g, '-').slice(0, 50))}-${f.id}.jpg">Descargar</a>
      <button class="h-btn" type="button" id="v-copiar-cita">Copiar cita</button>
      <button class="h-btn" type="button" id="v-copiar">Copiar enlace</button>
    </div>
    <div class="v-acc">
      ${GESTION && f.oculta ? '<button class="h-btn" type="button" id="v-restaurar">Restaurar</button>' : ''}
      ${GESTION || propia ? `<button class="h-btn peligro" type="button" id="v-suprimir">${GESTION ? 'Suprimir foto' : 'Borrar mi foto'}</button>` : ''}
      ${!GESTION && !propia ? `<span id="v-rep-caja">${REPORTADAS.has(f.id) ? '<small class="nota">Ya reportaste esta foto. Gracias.</small>' : '<button class="h-btn" type="button" id="v-reportar">Reportar</button>'}</span>` : ''}
    </div>
    ${cercanas(f)}`;
  // minimapa
  if (!miniMapa) {
    miniMapa = nuevoMapa('v-mini', 'satelite', { interactive: true, center: [f.lon, f.lat], zoom: 12, bounds: undefined });
    const el = document.createElement('div'); el.innerHTML = '<svg width="64" height="64" viewBox="0 0 64 64"><path d="M32 32 15 4 A32 32 0 0 1 49 4Z" fill="rgba(255,90,60,.55)" class="cono"/><circle cx="32" cy="32" r="6" fill="#b8392c" stroke="#fff" stroke-width="2.5"/></svg>';
    miniMarca = new maplibregl.Marker({ element: el, rotationAlignment: 'map' }).setLngLat([f.lon, f.lat]).addTo(miniMapa);
  }
  miniMarca.setLngLat([f.lon, f.lat]).setRotation(f.rumbo ?? 0);
  miniMarca.getElement().querySelector('.cono').style.display = f.rumbo == null ? 'none' : '';
  miniMapa.resize(); miniMapa.jumpTo({ center: [f.lon, f.lat], zoom: 13 });
  $('#visor').scrollTop = 0; $('#v-ficha').scrollTop = 0; requestAnimationFrame(() => { $('#visor').scrollTop = 0; });
  marcar(f);
  $('#v-copiar').onclick = () => copiar(enlace, 'Enlace copiado');
  $('#v-copiar-cita').onclick = () => copiar(cita + ' · ' + enlace, 'Cita copiada');
  const sup = $('#v-suprimir');
  if (sup) sup.onclick = async () => {
    if (!sup.classList.contains('seguro')) { sup.classList.add('seguro'); sup.textContent = 'Toca otra vez para suprimirla'; return; }
    sup.disabled = true;
    const d = await post({ accion: 'suprimir', id: f.id, ...(GESTION ? { g: G } : { token: propia }) });
    if (!d.ok) { sup.disabled = false; return aviso(esc(d.error), true); }
    delete MIAS[f.id]; guardarLS('pc_fotos_mias', MIAS);
    FOTOS = FOTOS.filter(x => x.id !== f.id); POR_ID.delete(f.id);
    vLista.splice(vIdx, 1); if (vIdx >= vLista.length) vIdx = vLista.length - 1;
    pintarFiltros(); pintarTodo(); aviso('Foto suprimida de la galería');
    vLista.length ? pintarVisor() : cerrarVisor();
  };
  const res = $('#v-restaurar');
  if (res) res.onclick = async () => { const d = await post({ accion: 'restaurar', id: f.id, g: G }); if (!d.ok) return aviso(esc(d.error), true); f.oculta = 0; f.reportes = 0; pintarTodo(); pintarVisor(); aviso('Foto restaurada: vuelve a ser pública'); };
  const rep = $('#v-reportar');
  if (rep) rep.onclick = () => {
    $('#v-rep-caja').innerHTML = `<select id="v-motivo" class="h-btn"><option>Contenido inapropiado</option><option>Se reconoce a personas sin permiso</option><option>Ubicación equivocada</option><option>No es de Aysén o Magallanes</option><option>Infringe derechos de autor</option><option>Otro motivo</option></select> <button class="h-btn peligro" type="button" id="v-rep-env">Enviar reporte</button>`;
    $('#v-rep-env').onclick = async () => {
      const d = await post({ accion: 'reportar', id: f.id, motivo: $('#v-motivo').value });
      if (!d.ok) return aviso(esc(d.error), true);
      REPORTADAS.add(f.id); guardarLS('pc_fotos_reportadas', [...REPORTADAS]);
      $('#v-rep-caja').innerHTML = '<small class="nota">Reporte enviado. El equipo lo revisará.</small>';
    };
  };
  $$('[data-cerca]').forEach(b => b.onclick = () => { const id = +b.dataset.cerca; const i = vLista.findIndex(x => x.id === id); if (i >= 0) vIdx = i; else { vLista = [POR_ID.get(id)]; vIdx = 0; } pintarVisor(); $('#v-ficha').scrollTop = 0; });
}
function cercanas(f) {
  const l = FOTOS.filter(x => x.id !== f.id && (GESTION || !x.oculta)).map(x => ({ x, d: C.distancia([f.lon, f.lat], [x.lon, x.lat]) })).filter(o => o.d < 3000)
    .sort((a, b) => (a.x.tomada || '').localeCompare(b.x.tomada || '')).slice(0, 9);
  if (!l.length) return '';
  return `<div class="v-cerca"><h3>El mismo lugar, otras fotos · a menos de 3 km</h3><div>${l.map(({ x, d }) => `<button type="button" data-cerca="${x.id}" title="${esc(x.titulo || '')} · a ${fmtN(d)} m"><img src="../${esc(x.mini)}" alt="" loading="lazy"><small>${x.tomada ? fechaCorta(x.tomada) : 'sin fecha'}</small></button>`).join('')}</div></div>`;
}
async function copiar(t, ok) { try { await navigator.clipboard.writeText(t); aviso(ok); } catch { aviso(esc(t)); } }
$('#v-cerrar').onclick = cerrarVisor;
$('#v-ant').onclick = () => { if (vIdx > 0) { vIdx--; pintarVisor(); } };
$('#v-sig').onclick = () => { if (vIdx < vLista.length - 1) { vIdx++; pintarVisor(); } };
document.addEventListener('keydown', e => {
  if (!$('#visor').hidden && !e.target.closest('input,select,textarea')) {
    if (e.key === 'Escape') cerrarVisor(); else if (e.key === 'ArrowLeft') $('#v-ant').click(); else if (e.key === 'ArrowRight') $('#v-sig').click();
  } else if (!$('#subida').hidden && e.key === 'Escape') { if (S.modo) terminarModo(); }
});

// ------------------------------------------------------------------ subir fotos
const S = { items: [], traza: null, sel: null, modo: null, mapa: null, listo: false, n: 0, subiendo: false };
$('#s-tema').innerHTML = Object.entries(TEMAS).map(([k, t]) => `<option value="${k}"${k === 'paisaje' ? ' selected' : ''}>${esc(t)}</option>`).join('');
$('#s-autor').value = leerLS('pc_fotos_autor', '') || '';
$('#s-desf').innerHTML = Array.from({ length: 25 }, (_, i) => i - 12).map(h => `<option value="${h}"${h === 0 ? ' selected' : ''}>${h === 0 ? 'estaba en hora' : h > 0 ? `adelantada ${h} h` : `atrasada ${-h} h`}</option>`).join('');
$('#s-desfase').insertAdjacentHTML('beforeend', '<label for="s-desf-min" style="font:500 11px var(--mono)">y minutos <input id="s-desf-min" type="number" min="-59" max="59" value="0" style="width:64px;min-height:28px;font:500 12px var(--mono);border:1px solid var(--tinta-3);border-radius:0;padding:0 4px"></label>');

function abrirSubida(archivos) {
  $('#subida').hidden = false; document.body.style.overflow = 'hidden';
  if (!S.mapa) iniciarMapaS(); else S.mapa.resize();
  if (archivos?.length) agregarArchivos(archivos);
}
function cerrarSubida() {
  if (S.subiendo) return aviso('Espera a que terminen de subir las fotos.');
  $('#subida').hidden = true; terminarModo();
}
$('#b-subir').onclick = () => abrirSubida();
$('#s-cerrar').onclick = cerrarSubida;
$('#s-archivos').onchange = e => { agregarArchivos([...e.target.files]); e.target.value = ''; };
$('#s-gpx').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    S.traza = leerGPX(await f.text());
    const t0 = new Date(S.traza[0].t), t1 = new Date(S.traza[S.traza.length - 1].t);
    $('#s-gpx-txt').textContent = `${f.name}: ${fmtN(S.traza.length)} puntos, del ${t0.toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })} al ${t1.toLocaleString('es-CL', { timeStyle: 'short' })}.`;
    $('#s-gpx').closest('.subir').classList.add('cargado'); $('#s-desfase').hidden = false;
    ubicarPorTraza(); pintarMapaS(true);
  } catch (err) { aviso(esc(err.message), true); }
};
$('#s-desf').onchange = $('#s-desfase').oninput = () => { ubicarPorTraza(); pintarMapaS(); };
// arrastrar fotos sobre la página
let arrastre = 0;
window.addEventListener('dragenter', e => { if ([...e.dataTransfer.types].includes('Files')) { arrastre++; e.preventDefault(); } });
window.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
window.addEventListener('dragleave', () => { arrastre = Math.max(0, arrastre - 1); });
window.addEventListener('drop', e => {
  arrastre = 0; if (e.target.closest?.('input[type=file]')) return;
  e.preventDefault();
  const fs = [...e.dataTransfer.files], gpx = fs.find(f => /\.gpx$/i.test(f.name)), imgs = fs.filter(f => /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic)$/i.test(f.name));
  if (imgs.length || gpx) abrirSubida(imgs);
  if (gpx) { const dt = new DataTransfer(); dt.items.add(gpx); $('#s-gpx').files = dt.files; $('#s-gpx').dispatchEvent(new Event('change')); }
});

async function agregarArchivos(files) {
  const imgs = files.filter(f => /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic)$/i.test(f.name));
  if (!imgs.length) return aviso('Elige fotos en JPG, PNG o WEBP.', true);
  for (const file of imgs) {
    if (S.items.length >= 60) { aviso('Sube hasta 60 fotos por tanda.', true); break; }
    const info = await leerFoto(file);
    const it = { k: ++S.n, file, url: URL.createObjectURL(file), info, titulo: '', tema: '', lat: null, lon: null, rumbo: info.rumbo, altitud: info.altitud, tomada: info.tomada, origen: null, estado: 'listo' };
    if (info.origen === 'gps') Object.assign(it, { lat: info.lat, lon: info.lon, origen: 'gps' });
    S.items.push(it);
  }
  ubicarPorTraza(); pintarLista(); pintarMapaS(true);
}
function ubicarPorTraza() {
  if (!S.traza) return;
  const desf = (+$('#s-desf').value * 60 + (+$('#s-desf-min')?.value || 0)) * 60000;
  for (const it of S.items) {
    if (it.origen === 'gps' || it.origen === 'mapa' || it.estado === 'ok') continue;
    const p = it.info.utc != null ? ubicarEnRecorrido(S.traza, it.info.utc - desf) : null;
    if (p) Object.assign(it, { lat: p.lat, lon: p.lon, altitud: p.ele != null ? Math.round(p.ele) : it.altitud, origen: 'recorrido', dif: p.dif });
    else if (it.origen === 'recorrido') Object.assign(it, { lat: null, lon: null, origen: null });
  }
  pintarLista();
}
const ubicada = it => it.lat != null && it.lon != null;
const pendientes = () => S.items.filter(it => it.estado !== 'ok');
function chip(it) {
  if (!ubicada(it)) return '<span class="s-chip falta">Sin ubicación</span>';
  if (!dentroCaja(it.lon, it.lat)) return '<span class="s-chip fuera">Fuera de Aysén y Magallanes</span>';
  return { gps: '<span class="s-chip ok">GPS</span>', recorrido: `<span class="s-chip gpx" title="Diferencia con el punto del recorrido más cercano: ${Math.round((it.dif || 0) / 1000)} s">Recorrido</span>`, mapa: '<span class="s-chip mapa">En el mapa</span>' }[it.origen] || '';
}
function pintarLista() {
  const l = pendientes();
  $('#s-lista').innerHTML = S.items.map((it, i) => `<div class="s-item${S.sel === it.k ? ' sel' : ''}${it.estado === 'subiendo' ? ' subiendo' : ''}${it.estado === 'ok' ? ' subida-ok' : ''}${it.estado === 'mal' ? ' subida-mal' : ''}" data-k="${it.k}" style="--c:${ubicada(it) ? '#3f7a4a' : '#b8392c'}">
      <img src="${it.url}" alt="" onerror="this.style.visibility='hidden'">
      <div>
        <input data-campo="titulo" value="${esc(it.titulo)}" maxlength="90" placeholder="Título (opcional) · ${esc(it.file.name)}" ${it.estado === 'ok' ? 'disabled' : ''}>
        <div class="s-est">${it.estado === 'ok' ? '<span class="s-chip ok">Publicada</span>' : chip(it)}
          ${it.tomada ? `<span>${fechaLarga(it.tomada)}</span>` : '<span>sin fecha</span>'}
          ${it.rumbo != null ? `<span title="Dirección de la cámara">↗ ${esc(rumboTexto(it.rumbo))}</span>` : ''}
          <select data-campo="tema" aria-label="Tema de esta foto" style="width:auto;min-height:22px;font-size:11px" ${it.estado === 'ok' ? 'disabled' : ''}><option value="">tema común</option>${Object.entries(TEMAS).map(([k, t]) => `<option value="${k}"${it.tema === k ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>
        </div>
      </div>
      <div class="s-btns">${it.estado === 'ok' ? `<button type="button" data-ver="${it.id}">Ver</button>` : `
        <button type="button" data-acc="ubicar">${ubicada(it) ? 'Mover' : 'Ubicar'}</button>
        ${ubicada(it) ? '<button type="button" data-acc="rumbo">Dirección</button>' : (i > 0 && ubicada(S.items[i - 1]) ? '<button type="button" data-acc="copiar" title="Usar la ubicación de la foto anterior">Igual a la anterior</button>' : '')}
        <button type="button" class="s-quitar" data-acc="quitar" aria-label="Quitar ${esc(it.file.name)}">Quitar</button>`}</div>
      ${it.res ? `<p class="s-res${it.estado === 'ok' ? ' ok' : ''}">${esc(it.res)}</p>` : ''}
    </div>`).join('');
  $('#s-comun').hidden = !l.length;
  const listas = l.filter(it => ubicada(it) && dentroCaja(it.lon, it.lat)), faltan = l.length - listas.length;
  $('#s-resumen').textContent = !l.length ? '' : `${listas.length} lista${listas.length === 1 ? '' : 's'} para publicar${faltan ? ` · ${faltan} sin ubicación válida (no se publican)` : ''}`;
  $('#s-publicar').textContent = `Publicar ${listas.length || ''} foto${listas.length === 1 ? '' : 's'}`.replace('  ', ' ');
  $('#s-publicar').disabled = !listas.length || S.subiendo;
}
$('#s-lista').addEventListener('input', e => {
  const k = +e.target.closest('.s-item')?.dataset.k, it = S.items.find(x => x.k === k), c = e.target.dataset.campo;
  if (it && c) it[c] = e.target.value;
});
$('#s-lista').addEventListener('click', e => {
  const v = e.target.closest('[data-ver]'); if (v) { cerrarSubida(); abrirVisor(+v.dataset.ver); return; }
  const fila = e.target.closest('.s-item'); if (!fila) return;
  const it = S.items.find(x => x.k === +fila.dataset.k), acc = e.target.closest('[data-acc]')?.dataset.acc;
  if (!acc) { if (!e.target.closest('input,select')) seleccionar(it.k, true); return; }
  if (acc === 'quitar') { URL.revokeObjectURL(it.url); S.items = S.items.filter(x => x !== it); if (S.sel === it.k) terminarModo(); pintarLista(); pintarMapaS(); }
  else if (acc === 'ubicar') empezarModo(it, 'punto');
  else if (acc === 'rumbo') empezarModo(it, 'rumbo');
  else if (acc === 'copiar') { const prev = S.items[S.items.indexOf(it) - 1]; Object.assign(it, { lat: prev.lat, lon: prev.lon, origen: 'mapa' }); pintarLista(); pintarMapaS(); }
});
function seleccionar(k, volar) {
  S.sel = k; const it = S.items.find(x => x.k === k);
  $$('.s-item').forEach(el => el.classList.toggle('sel', +el.dataset.k === k));
  if (volar && it && ubicada(it) && S.mapa) S.mapa.easeTo({ center: [it.lon, it.lat], zoom: Math.max(S.mapa.getZoom(), 12) });
  pintarMapaS();
}
function empezarModo(it, modo) {
  S.modo = modo; seleccionar(it.k, modo === 'rumbo');
  $('.s-der').classList.add('ubicando'); $('#s-hud').hidden = false;
  $('#s-hud-txt').textContent = modo === 'punto' ? 'Toca en el mapa el lugar desde donde se tomó la foto' : 'Ahora toca hacia dónde mira la cámara';
  $('#s-hud-omitir').hidden = modo !== 'rumbo';
  if (matchMedia('(max-width:980px)').matches) $('.s-der').scrollIntoView({ behavior: 'smooth' });
}
function terminarModo() { S.modo = null; $('.s-der')?.classList.remove('ubicando'); $('#s-hud').hidden = true; }
$('#s-hud-cancelar').onclick = terminarModo;
$('#s-hud-omitir').onclick = () => { const it = S.items.find(x => x.k === S.sel); if (it) it.rumbo = null; terminarModo(); pintarLista(); pintarMapaS(); };

function iniciarMapaS() {
  S.mapa = nuevoMapa('s-mapa', 'satelite');
  S.mapa.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  S.mapa.on('load', () => {
    S.mapa.addImage('cono', iconoCono('#ffcf5a'));
    S.mapa.addSource('traza', { type: 'geojson', data: vacia() });
    S.mapa.addSource('pts', { type: 'geojson', data: vacia() });
    S.mapa.addLayer({ id: 'traza', type: 'line', source: 'traza', paint: { 'line-color': '#ffcf5a', 'line-width': 2.5, 'line-dasharray': [2, 1.2] } });
    S.mapa.addLayer({ id: 'cono', type: 'symbol', source: 'pts', filter: ['has', 'rumbo'],
      layout: { 'icon-image': 'cono', 'icon-rotate': ['get', 'rumbo'], 'icon-rotation-alignment': 'map', 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-size': 1.1 } });
    S.mapa.addLayer({ id: 'pts', type: 'circle', source: 'pts',
      paint: { 'circle-color': ['case', ['get', 'sel'], '#b8392c', ['get', 'fuera'], '#a0662a', '#ffffff'], 'circle-radius': ['case', ['get', 'sel'], 8, 6],
               'circle-stroke-color': ['case', ['get', 'sel'], '#ffffff', '#1c2326'], 'circle-stroke-width': 2 } });
    S.mapa.addLayer({ id: 'pts-n', type: 'symbol', source: 'pts', layout: { 'text-field': ['to-string', ['get', 'n']], 'text-font': ['Open Sans Bold'], 'text-size': 10, 'text-offset': [0, -1.5], 'text-allow-overlap': true },
      paint: { 'text-color': '#fff', 'text-halo-color': '#1c2326', 'text-halo-width': 1.5 } });
    S.listo = true; pintarMapaS(true);
  });
  S.mapa.on('click', e => {
    const it = S.items.find(x => x.k === S.sel);
    if (S.modo && it) {
      const ll = [e.lngLat.lng, e.lngLat.lat];
      if (S.modo === 'punto') {
        Object.assign(it, { lon: ll[0], lat: ll[1], origen: 'mapa' });
        if (!dentroCaja(ll[0], ll[1])) aviso('Ese punto queda fuera de Aysén y Magallanes: la galería no lo aceptará.', true);
        pintarLista(); pintarMapaS(); empezarModo(it, 'rumbo');
      } else { it.rumbo = Math.round(rumboEntre([it.lon, it.lat], ll)); terminarModo(); pintarLista(); pintarMapaS(); }
      return;
    }
    const h = S.mapa.queryRenderedFeatures([[e.point.x - 6, e.point.y - 6], [e.point.x + 6, e.point.y + 6]], { layers: ['pts'] })[0];
    if (h) { seleccionar(h.properties.k); document.querySelector(`.s-item[data-k="${h.properties.k}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  });
  S.mapa.on('mousemove', e => {
    if (S.modo !== 'rumbo') return;
    const it = S.items.find(x => x.k === S.sel); if (!it || !ubicada(it)) return;
    const r = Math.round(rumboEntre([it.lon, it.lat], [e.lngLat.lng, e.lngLat.lat]));
    $('#s-hud-txt').textContent = `Toca hacia dónde mira la cámara · ${rumboTexto(r)}`;
    const src = S.mapa.getSource('pts'); if (src) src.setData(fcPuntos({ k: it.k, rumbo: r }));
  });
}
function fcPuntos(temporal) {
  return { type: 'FeatureCollection', features: S.items.filter(ubicada).map(it => {
    const rumbo = temporal?.k === it.k ? temporal.rumbo : it.rumbo;
    return { type: 'Feature', geometry: { type: 'Point', coordinates: [it.lon, it.lat] },
      properties: { k: it.k, n: S.items.indexOf(it) + 1, sel: S.sel === it.k, fuera: !dentroCaja(it.lon, it.lat), ...(rumbo != null ? { rumbo } : {}) } };
  }) };
}
function pintarMapaS(encuadrar = false) {
  if (!S.listo) return;
  S.mapa.getSource('pts').setData(fcPuntos());
  S.mapa.getSource('traza').setData(S.traza ? { type: 'Feature', geometry: { type: 'LineString', coordinates: S.traza.map(p => [p.lon, p.lat]) }, properties: {} } : vacia());
  if (encuadrar) {
    const pts = [...S.items.filter(ubicada).map(it => [it.lon, it.lat]), ...(S.traza || []).map(p => [p.lon, p.lat])];
    if (pts.length) {
      const b = pts.reduce((b, p) => b.extend(p), new maplibregl.LngLatBounds(pts[0], pts[0]));
      S.mapa.fitBounds(b, { padding: 60, maxZoom: 14, duration: 600 });
    }
  }
}

/** Paquete binario PCF1: datos JSON + foto + miniatura (ver api/fotos.php) */
function paquete(datos, foto, mini) {
  const largo = n => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n); return b; };
  const json = new TextEncoder().encode(JSON.stringify(datos));
  return new Blob([new TextEncoder().encode('PCF1'), largo(json.length), json, largo(foto.size), foto, largo(mini.size), mini], { type: 'application/octet-stream' });
}
$('#s-publicar').onclick = async () => {
  const autor = $('#s-autor').value.trim(), err = $('#s-err');
  err.textContent = '';
  if (autor.length < 2) { err.textContent = 'Escribe tu nombre: la licencia CC BY exige citar a quien tomó la foto.'; $('#s-autor').focus(); return; }
  if (!$('#s-acepto').checked) { err.textContent = 'Confirma que puedes publicar estas fotos con licencia CC BY 4.0.'; return; }
  guardarLS('pc_fotos_autor', autor);
  const lista = pendientes().filter(it => ubicada(it) && dentroCaja(it.lon, it.lat));
  S.subiendo = true; terminarModo(); pintarLista();
  let ok = 0;
  for (const [i, it] of lista.entries()) {
    $('#s-resumen').textContent = `Subiendo ${i + 1} de ${lista.length}…`;
    it.estado = 'subiendo'; it.res = ''; pintarLista(); $('#s-publicar').disabled = true;
    try {
      const [g, m] = [await achicar(it.file, 2048, .84), await achicar(it.file, 480, .78)];
      const datos = { lat: +it.lat.toFixed(6), lon: +it.lon.toFixed(6), rumbo: it.rumbo ?? null, altitud: it.altitud ?? null, tomada: it.tomada || null, titulo: it.titulo.trim(),
        descripcion: $('#s-descr').value.trim(), autor, tema: it.tema || $('#s-tema').value, origen: it.origen, acepto: 1, web: $('#s-web').value };
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: paquete(datos, g.blob, m.blob) });
      const d = await r.json().catch(() => ({ ok: false, error: r.status === 413 ? 'La foto es demasiado pesada para el servidor.' : 'El servidor no respondió bien.' }));
      if (!d.ok) throw new Error(d.error || 'No se pudo subir.');
      MIAS[d.foto.id] = d.token; guardarLS('pc_fotos_mias', MIAS);
      FOTOS.unshift(enriquecer(d.foto));
      Object.assign(it, { estado: 'ok', id: d.foto.id, res: '' }); ok++;
    } catch (e) { Object.assign(it, { estado: 'mal', res: e.message }); }
  }
  S.subiendo = false; pintarLista(); pintarFiltros(); pintarTodo();
  const mal = lista.length - ok;
  $('#s-resumen').textContent = `${ok} publicada${ok === 1 ? '' : 's'}${mal ? ` · ${mal} con problemas (revisa el detalle)` : ''}`;
  if (ok) aviso(`${ok} foto${ok === 1 ? '' : 's'} publicada${ok === 1 ? '' : 's'} en la galería. ¡Gracias!`);
  if (ok && !mal && !pendientes().length) setTimeout(() => { if (!S.subiendo) { S.items.forEach(it => URL.revokeObjectURL(it.url)); S.items = []; pintarLista(); pintarMapaS(); cerrarSubida(); } }, 1400);
};

// ------------------------------------------------------------------ arranque
await cargar();
const fH = +(location.hash.match(/^#f=(\d+)/) || [])[1];
if (fH && POR_ID.get(fH)) abrirVisor(fH);
if (/#subir/.test(location.hash)) abrirSubida();
