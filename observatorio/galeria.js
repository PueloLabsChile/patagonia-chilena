// Galería de terreno del Observatorio Patagonia.
// Portada con foto destacada, galería justificada, mapa, desafío por comunas, «Mis fotos», visor a pantalla completa
// y asistente de 3 pasos para subir (cámara + ubicación del teléfono, GPS de la foto, búsqueda de lugar, pin, recorrido GPX).
// Las fotos se guardan primero en el teléfono (IndexedDB) y se suben cuando hay señal.
import { TEMAS, COLOR_TEMA, EMOJI_TEMA, leerFoto, achicar, leerGPX, ubicarEnRecorrido, iconoCono, comunaDe, cercana, rumboTexto, dentroCaja, fechaTexto, ubicacionTelefono, CAJA } from './obs-fotos.js?v=1794007281';
import * as C from './obs-coords.js?v=1794007281';

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
const clave = () => Array.from(crypto.getRandomValues(new Uint8Array(18)), b => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'[b & 63]).join('');

let FOTOS = [], COMUNAS = null, LOCALIDADES = null, GESTION = false;
const POR_ID = new Map();
const filtro = { q: '', region: '', comuna: '', anio: '', orden: 'recientes', temas: new Set(), reportadas: false };
let vista = 'galeria';

function aviso(t, mal = false) {
  const a = $('#aviso'); a.innerHTML = t; a.classList.toggle('mal', mal); a.classList.add('ver');
  clearTimeout(aviso.t); aviso.t = setTimeout(() => a.classList.remove('ver'), mal ? 6000 : 3200);
}
async function post(cuerpo) {
  try { const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) }); return await r.json(); }
  catch { return { ok: false, error: 'Sin conexión con el servidor. Intenta de nuevo.' }; }
}
async function copiar(t, ok) { try { await navigator.clipboard.writeText(t); aviso(ok); } catch { aviso(esc(t)); } }
async function compartir(titulo, texto, url) {
  if (navigator.share) { try { await navigator.share({ title: titulo, text: texto, url }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  copiar(url, 'Enlace copiado: pégalo donde quieras compartirlo');
}

// ------------------------------------------------------------------ mapas base
const FONDOS = {
  papel: { tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}'], max: 16, atrib: 'Base © Esri, HERE, Garmin, © colaboradores de OpenStreetMap' },
  etiquetas: { tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}'], max: 16, atrib: '' },
  satelite: { tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], max: 19, atrib: 'Imágenes © Esri, Maxar, Earthstar Geographics' },
  lugares: { tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'], max: 19, atrib: '' },
};
function estilo(fondo) {
  const capas = fondo === 'satelite' ? ['satelite', 'lugares'] : ['papel', 'etiquetas'];
  return { version: 8, glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
    sources: Object.fromEntries(Object.entries(FONDOS).map(([k, f]) => ['f-' + k, { type: 'raster', tiles: f.tiles, tileSize: 256, maxzoom: f.max, attribution: f.atrib }])),
    layers: Object.keys(FONDOS).map(k => ({ id: 'f-' + k, type: 'raster', source: 'f-' + k, layout: { visibility: capas.includes(k) ? 'visible' : 'none' } })) };
}
function cambiarFondo(m, fondo) {
  const capas = fondo === 'satelite' ? ['satelite', 'lugares'] : ['papel', 'etiquetas'];
  Object.keys(FONDOS).forEach(k => m.setLayoutProperty('f-' + k, 'visibility', capas.includes(k) ? 'visible' : 'none'));
}
const LIMITES = [[CAJA.lonO, CAJA.latS], [CAJA.lonE, CAJA.latN]];
function nuevoMapa(contenedor, fondo = 'papel', extra = {}) {
  const m = new maplibregl.Map({ container: contenedor, style: estilo(fondo), bounds: LIMITES, fitBoundsOptions: { padding: 20 }, attributionControl: { compact: true }, dragRotate: false, ...extra });
  m.touchZoomRotate?.disableRotation();
  return m;
}
const vacia = () => ({ type: 'FeatureCollection', features: [] });

// ------------------------------------------------------------------ datos
function enriquecer(f) {
  const c = COMUNAS ? comunaDe(COMUNAS, f.lon, f.lat) : null;
  f.comuna = c?.comuna || null;
  f.region = c?.region ? (sinTilde(c.region).startsWith('ays') ? 'Aysén' : 'Magallanes') : (f.lat > -49 ? 'Aysén' : 'Magallanes');
  f.lugar = f.comuna || (LOCALIDADES ? 'cerca de ' + (cercana(LOCALIDADES, f.lon, f.lat)?.nombre || f.region) : f.region);
  f.anio = f.tomada ? f.tomada.slice(0, 4) : null;
  f.color = COLOR_TEMA[f.tema] || COLOR_TEMA.otro;
  f.texto = sinTilde([f.titulo, f.descripcion, f.autor, f.comuna, f.region, f.lugar, TEMAS[f.tema]].join(' '));
  POR_ID.set(f.id, f);
  return f;
}
async function cargar() {
  const [r, c, l] = await Promise.all([
    fetch(API + (G ? '?g=' + encodeURIComponent(G) : ''), { cache: 'no-store' }).then(r => r.json()).catch(() => null),
    COMUNAS || fetch('datos/comunas.json').then(r => r.json()).catch(() => null),
    LOCALIDADES || fetch('datos/localidades.json').then(r => r.json()).catch(() => null),
  ]);
  COMUNAS = c; LOCALIDADES = l;
  if (!r?.ok) { $('#g-cuenta').textContent = 'No se pudo cargar la galería. Revisa tu conexión y recarga la página.'; return false; }
  GESTION = !!r.gestion;
  POR_ID.clear(); FOTOS = r.fotos.map(enriquecer);
  return true;
}
const publicas = () => FOTOS.filter(f => GESTION || !f.oculta);
function pasaFiltros(f, conTema = true) {
  if (f.oculta && !GESTION) return false;
  if (GESTION && filtro.reportadas && !f.reportes && !f.oculta) return false;
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
const filtradas = () => FOTOS.filter(f => pasaFiltros(f)).sort(ORDEN[filtro.orden]);

// ------------------------------------------------------------------ portada
let heroLista = [], heroIdx = 0, heroTimer = null, heroMapa = null;
function pintarHero() {
  const pub = publicas().filter(f => !f.oculta);
  const comunasCon = new Set(pub.map(f => f.comuna).filter(Boolean)).size, total = COMUNAS?.features.length || 20;
  const autores = new Set(pub.map(f => sinTilde(f.autor))).size;
  $('#hero-cifras').innerHTML = `<div><dt>fotos</dt><dd>${fmtN(pub.length)}</dd></div><div><dt>comunas</dt><dd>${comunasCon}/${total}</dd></div><div><dt>${autores === 1 ? 'autor' : 'autores'}</dt><dd>${fmtN(autores)}</dd></div>`;
  const faltan = total - comunasCon;
  $('#hero-desafio').textContent = faltan ? `Faltan fotos de ${faltan} comunas` : '¡Las 20 comunas tienen fotos!';
  $('#n-faltan').textContent = faltan || '';
  heroLista = pub.filter(f => f.w >= f.h * 1.15).slice(0, 6);
  if (!heroLista.length) heroLista = pub.slice(0, 6);
  clearInterval(heroTimer);
  if (!heroLista.length) {   // sin fotos aún: el Campo de Hielo Sur desde el satélite
    $('#hero-ver').hidden = true;
    if (!heroMapa) {
      heroMapa = nuevoMapa('hero-fondo', 'satelite', { interactive: false, bounds: undefined, center: [-73.45, -49.1], zoom: 7.4, attributionControl: false });
      heroMapa.on('load', () => { let a = true; const ir = () => heroMapa.easeTo({ center: a ? [-73.1, -50.6] : [-73.45, -48.9], duration: 45000, easing: t => t }); ir(); heroMapa.on('moveend', () => { a = !a; ir(); }); });
    }
    $('#hero-titulo').textContent = 'La Patagonia, foto a foto';
    $('#hero-meta').innerHTML = 'El archivo abierto de fotos de Aysén y Magallanes <b>empieza contigo</b>. Cada foto queda ubicada en el mapa, con su fecha y tu nombre.';
    return;
  }
  if (heroMapa) { heroMapa.remove(); heroMapa = null; $('#hero-fondo').innerHTML = ''; }
  heroIdx = 0; mostrarHero();
  if (heroLista.length > 1) heroTimer = setInterval(() => { heroIdx = (heroIdx + 1) % heroLista.length; mostrarHero(); }, 8000);
}
function mostrarHero() {
  const f = heroLista[heroIdx]; if (!f) return;
  const img = new Image(); img.alt = '';
  img.onload = () => {
    $('#hero-fondo').appendChild(img); requestAnimationFrame(() => requestAnimationFrame(() => img.classList.add('ver')));
    const viejas = $$('#hero-fondo img').slice(0, -1); setTimeout(() => viejas.forEach(v => v.remove()), 1600);
    $('#hero-titulo').textContent = f.titulo || TEMAS[f.tema] || 'Foto de terreno';
    $('#hero-meta').innerHTML = `Foto de <b>${esc(f.autor)}</b> · ${esc(f.lugar)}${f.tomada ? ' · ' + fechaCorta(f.tomada) : ''}`;
    $('#hero-ver').hidden = false; $('#hero-ver').onclick = () => abrirVisor(f.id, publicas().filter(x => !x.oculta));
  };
  img.src = '../' + f.archivo;
}

// ------------------------------------------------------------------ vistas y filtros
function irVista(v) {
  vista = v;
  $$('.vistas-g button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.vista === v)));
  $$('main .vista').forEach(s => s.hidden = s.dataset.vista !== v);
  $('#barra').classList.toggle('solo-vistas', v === 'desafio' || v === 'mias');
  $('#g-gestion').hidden = !GESTION || v !== 'galeria';
  if (v === 'mapa') iniciarMapa(); else if (v === 'desafio') iniciarDesafio(); else if (v === 'mias') pintarMias(); else pintarGaleria();
}
$$('.vistas-g button').forEach(b => b.onclick = () => irVista(b.dataset.vista));
document.addEventListener('click', e => {
  const iv = e.target.closest('[data-ir-vista]'); if (iv) { irVista(iv.dataset.irVista); $('#barra').scrollIntoView({ behavior: 'smooth' }); return; }
  if (e.target.closest('[data-abrir-subida]')) { abrirSubida(); return; }
  const t = e.target.closest('[data-tema]'); if (t) { const k = t.dataset.tema; filtro.temas.has(k) ? filtro.temas.delete(k) : filtro.temas.add(k); pintarTodo(); return; }
  const f = e.target.closest('.foto-j[data-id]'); if (f) { abrirVisor(+f.dataset.id, f.closest('#mosaico-mias') ? misFotos() : filtradas()); return; }
  if (e.target.closest('#g-ver-rep')) { filtro.reportadas = !filtro.reportadas; pintarTodo(); }
});
function pintarFiltros() {
  const comunas = [...new Set((COMUNAS?.features || []).filter(f => !filtro.region || (sinTilde(f.properties.region).startsWith('ays') ? 'Aysén' : 'Magallanes') === filtro.region).map(f => f.properties.comuna))].sort((a, b) => a.localeCompare(b, 'es'));
  $('#g-comuna').innerHTML = '<option value="">Todas las comunas</option>' + comunas.map(c => `<option${c === filtro.comuna ? ' selected' : ''}>${esc(c)}</option>`).join('');
  const anios = [...new Set(FOTOS.map(f => f.anio).filter(Boolean))].sort().reverse();
  $('#g-anio').innerHTML = '<option value="">Todos los años</option>' + anios.map(a => `<option${a === filtro.anio ? ' selected' : ''}>${a}</option>`).join('');
}
function pintarTemas() {
  const n = {}; FOTOS.filter(f => pasaFiltros(f, false)).forEach(f => n[f.tema] = (n[f.tema] || 0) + 1);
  $('#g-temas').innerHTML = Object.entries(TEMAS).map(([k, t]) => `<button type="button" data-tema="${k}" aria-pressed="${filtro.temas.has(k)}" style="--c:${COLOR_TEMA[k]}"><span aria-hidden="true">${EMOJI_TEMA[k]}</span>${esc(t)}<small>${n[k] || 0}</small></button>`).join('');
}
function pintarTodo() { pintarTemas(); pintarGaleria(); pintarMapa(); if (desafioListo) pintarDesafio(); }
let tq; $('#g-q').oninput = e => { clearTimeout(tq); tq = setTimeout(() => { filtro.q = e.target.value.trim(); pintarTodo(); }, 180); };
$('#g-region').onchange = e => { filtro.region = e.target.value; filtro.comuna = ''; pintarFiltros(); pintarTodo(); };
$('#g-comuna').onchange = e => { filtro.comuna = e.target.value; pintarTodo(); };
$('#g-anio').onchange = e => { filtro.anio = e.target.value; pintarTodo(); };
$('#g-orden').onchange = e => { filtro.orden = e.target.value; pintarGaleria(); };

// ------------------------------------------------------------------ galería justificada
const flecha = r => `<svg viewBox="0 0 24 24" style="transform:rotate(${r}deg)" aria-hidden="true"><path d="M12 2 18.5 21 12 16.6 5.5 21Z"/></svg>`;
function tarjeta(f, estilo) {
  return `<button class="foto-j${f.oculta ? ' oculta' : ''}" type="button" role="listitem" ${f.id ? `data-id="${f.id}"` : ''} style="${estilo}" aria-label="${esc((f.titulo || 'Foto') + ' · ' + f.autor)}">
    <img src="${f.local || '../' + esc(f.mini)}" alt="" loading="lazy" decoding="async" onload="this.classList.add('cargada')">
    <span class="tema-j" title="${esc(TEMAS[f.tema] || '')}">${EMOJI_TEMA[f.tema] || '✨'}</span>
    ${f.rumbo != null ? `<span class="rumbo-j" title="Mira hacia el ${esc(rumboTexto(f.rumbo))}">${flecha(f.rumbo)}</span>` : ''}
    ${GESTION && f.reportes ? `<span class="rep-j">${f.reportes} reporte${f.reportes > 1 ? 's' : ''}${f.oculta ? ' · oculta' : ''}</span>` : ''}
    ${f.espera ? `<span class="espera-j">${f.error ? 'no se pudo publicar' : 'esperando señal'}</span>` : ''}
    <span class="info-j"><b>${esc(f.titulo || 'Sin título')}</b><small>${esc(f.autor)}${f.lugar ? ' · ' + esc(f.lugar) : ''}${f.tomada ? ' · ' + fechaCorta(f.tomada) : ''}</small></span></button>`;
}
function justificar(cont, lista) {
  const ancho = cont.clientWidth; if (!ancho) return;
  const alto = ancho < 520 ? 150 : ancho < 1000 ? 210 : 270, gap = 6, filas = [];
  let fila = [], suma = 0;
  for (const f of lista) {
    const r = Math.min(Math.max(f.w / f.h || 1.5, .5), 3);
    fila.push([f, r]); suma += r;
    const h = (ancho - gap * (fila.length - 1)) / suma;
    if (h <= alto) { filas.push({ fila, h, llena: true }); fila = []; suma = 0; }
  }
  if (fila.length) filas.push({ fila, h: alto, llena: false });
  cont.innerHTML = filas.map(({ fila, h, llena }) => `<div class="fila-j" style="height:${h.toFixed(1)}px">${fila.map(([f, r]) =>
    tarjeta(f, llena ? `flex:${r} 1 0;min-width:0` : `width:${(r * h).toFixed(1)}px`)).join('')}</div>`).join('');
}
function pintarGaleria() {
  if (vista !== 'galeria') return;
  const l = filtradas(), total = publicas().length;
  $('#g-cuenta').innerHTML = total ? `<b>${fmtN(l.length)}</b> de ${fmtN(total)} fotos · toca una para verla en grande` : '';
  if (!l.length) {
    $('#mosaico').innerHTML = total ? '<div class="vacio-g">Ninguna foto coincide con estos filtros.</div>'
      : '<div class="vacio-g"><b>Sé la primera persona en aportar</b>La galería espera sus primeras fotos de Aysén y Magallanes.<button class="boton-grande" type="button" data-abrir-subida>📷 Subir mis fotos</button></div>';
  } else justificar($('#mosaico'), l);
  const ocultas = FOTOS.filter(f => f.oculta).length, rep = FOTOS.filter(f => f.reportes).length;
  $('#g-gestion').hidden = !GESTION || vista !== 'galeria';
  if (GESTION) $('#g-gestion').innerHTML = `Modo gestión: puedes <b>corregir textos</b> o <b>suprimir</b> cualquier foto desde su ficha. ${rep ? `${rep} con reportes${ocultas ? `, ${ocultas} oculta${ocultas > 1 ? 's' : ''} hasta que la revises` : ''} · <button class="h-btn" type="button" id="g-ver-rep" aria-pressed="${filtro.reportadas}">${filtro.reportadas ? 'Ver todas' : 'Ver solo reportadas'}</button>` : 'No hay fotos reportadas.'}`;
}
let anchoPrevio = 0;
new ResizeObserver(() => { const a = $('main').clientWidth; if (Math.abs(a - anchoPrevio) > 8) { anchoPrevio = a; vista === 'mias' ? pintarMias() : pintarGaleria(); } }).observe($('main'));

// ------------------------------------------------------------------ mapa
let mapa = null, mapaListo = false;
const popup = () => (popup.p ||= new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12, maxWidth: '230px' }));
function iniciarMapa() {
  if (mapa) { mapa.resize(); return; }
  mapa = nuevoMapa('g-mapa');
  mapa.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  mapa.on('load', () => {
    mapa.addImage('cono', iconoCono('#b8392c'));
    mapa.addSource('fotos', { type: 'geojson', data: vacia(), cluster: true, clusterRadius: 40, clusterMaxZoom: 13 });
    mapa.addLayer({ id: 'cl', type: 'circle', source: 'fotos', filter: ['has', 'point_count'],
      paint: { 'circle-color': '#1c2326', 'circle-opacity': .88, 'circle-stroke-color': '#f7f5f0', 'circle-stroke-width': 2, 'circle-radius': ['step', ['get', 'point_count'], 14, 10, 18, 50, 23, 200, 29] } });
    mapa.addLayer({ id: 'cl-n', type: 'symbol', source: 'fotos', filter: ['has', 'point_count'],
      layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Open Sans Bold'], 'text-size': 12, 'text-allow-overlap': true }, paint: { 'text-color': '#f7f5f0' } });
    mapa.addLayer({ id: 'cono', type: 'symbol', source: 'fotos', filter: ['all', ['!', ['has', 'point_count']], ['has', 'rumbo']],
      layout: { 'icon-image': 'cono', 'icon-rotate': ['get', 'rumbo'], 'icon-rotation-alignment': 'map', 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-size': ['interpolate', ['linear'], ['zoom'], 6, .55, 12, .9, 16, 1.4] } });
    mapa.addLayer({ id: 'pt', type: 'circle', source: 'fotos', filter: ['!', ['has', 'point_count']],
      paint: { 'circle-color': ['get', 'color'], 'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 5, 12, 7, 16, 9], 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
    mapaListo = true; pintarMapa(true);
  });
  mapa.on('click', 'cl', async e => { const f = e.features[0]; const z = await mapa.getSource('fotos').getClusterExpansionZoom(f.properties.cluster_id); mapa.easeTo({ center: f.geometry.coordinates, zoom: Math.min(z + .3, 16) }); });
  mapa.on('click', 'pt', e => abrirVisor(+e.features[0].properties.id, filtradas()));
  for (const l of ['cl', 'pt']) { mapa.on('mouseenter', l, () => mapa.getCanvas().style.cursor = 'pointer'); mapa.on('mouseleave', l, () => { mapa.getCanvas().style.cursor = ''; popup().remove(); }); }
  mapa.on('mousemove', 'pt', e => {
    const f = POR_ID.get(+e.features[0].properties.id); if (!f) return;
    popup().setLngLat(e.features[0].geometry.coordinates).setHTML(`<div class="pop-foto"><img src="../${esc(f.mini)}" alt=""><span>${esc(f.titulo || 'Sin título')}<small>${esc(f.autor)}${f.tomada ? ' · ' + fechaCorta(f.tomada) : ''}</small></span></div>`).addTo(mapa);
  });
  $$('[data-fondo]').forEach(b => b.onclick = () => { $$('[data-fondo]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); cambiarFondo(mapa, b.dataset.fondo); });
}
function pintarMapa(encuadrar = false) {
  if (!mapaListo) return;
  const l = filtradas();
  mapa.getSource('fotos').setData({ type: 'FeatureCollection', features: l.map(f => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [f.lon, f.lat] }, properties: { id: f.id, color: f.color, ...(f.rumbo != null ? { rumbo: f.rumbo } : {}) } })) });
  if (encuadrar && l.length) { const b = l.reduce((b, f) => b.extend([f.lon, f.lat]), new maplibregl.LngLatBounds([l[0].lon, l[0].lat], [l[0].lon, l[0].lat])); mapa.fitBounds(b, { padding: 60, maxZoom: 11, duration: 0 }); }
}

// ------------------------------------------------------------------ desafío por comunas
let dMapa = null, desafioListo = false;
function conteoComunas() {
  const n = new Map(); publicas().filter(f => !f.oculta).forEach(f => f.comuna && n.set(f.comuna, (n.get(f.comuna) || 0) + 1));
  return (COMUNAS?.features || []).map(f => ({ comuna: f.properties.comuna, region: sinTilde(f.properties.region).startsWith('ays') ? 'Aysén' : 'Magallanes', n: n.get(f.properties.comuna) || 0, f }));
}
const colorConteo = n => n === 0 ? '#d9826f' : n < 5 ? '#a9cf8f' : n < 15 ? '#5e9b55' : '#2f6b3a';
function iniciarDesafio() {
  pintarDesafio();
  if (dMapa) { dMapa.resize(); return; }
  dMapa = nuevoMapa('d-mapa');
  dMapa.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  dMapa.on('load', () => {
    dMapa.addSource('com', { type: 'geojson', data: vacia() });
    dMapa.addSource('com-pt', { type: 'geojson', data: vacia() });
    dMapa.addLayer({ id: 'com-f', type: 'fill', source: 'com', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': .62 } });
    dMapa.addLayer({ id: 'com-l', type: 'line', source: 'com', paint: { 'line-color': '#1c2326', 'line-width': .8, 'line-opacity': .6 } });
    dMapa.addLayer({ id: 'com-t', type: 'symbol', source: 'com-pt',
      layout: { 'text-field': ['concat', ['get', 'comuna'], '\n', ['get', 'etq']], 'text-font': ['Open Sans Bold'], 'text-size': ['interpolate', ['linear'], ['zoom'], 5, 9.5, 8, 13], 'text-max-width': 9 },
      paint: { 'text-color': '#1c2326', 'text-halo-color': 'rgba(255,255,255,.9)', 'text-halo-width': 1.4 } });
    desafioListo = true; pintarDesafio();
  });
  dMapa.on('click', 'com-f', e => elegirComuna(e.features[0].properties.comuna));
  dMapa.on('mouseenter', 'com-f', () => dMapa.getCanvas().style.cursor = 'pointer');
  dMapa.on('mouseleave', 'com-f', () => dMapa.getCanvas().style.cursor = '');
}
function centroComuna(f) { const b = C.bbox(f); return b ? [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] : null; }
function pintarDesafio() {
  const l = conteoComunas(), con = l.filter(c => c.n).length, total = l.length || 20;
  $('#des-titulo').textContent = con === total ? '¡Las 20 comunas ya tienen fotos!' : `${con} de ${total} comunas ya tienen fotos`;
  $('#des-avance').style.width = (100 * con / total) + '%';
  const faltan = l.filter(c => !c.n).sort((a, b) => a.comuna.localeCompare(b.comuna, 'es')), hay = l.filter(c => c.n).sort((a, b) => b.n - a.n);
  $('#des-lista').innerHTML = (faltan.length ? `<li class="des-tit">Faltan fotos (${faltan.length})</li>` + faltan.map(c => `<li data-comuna="${esc(c.comuna)}" style="--c:${colorConteo(0)}"><i></i><span><b>${esc(c.comuna)}</b><small>${c.region}</small></span><button class="des-sub" type="button" data-subir-comuna="${esc(c.comuna)}">Subir</button></li>`).join('') : '')
    + (hay.length ? `<li class="des-tit">Con fotos (${hay.length})</li>` + hay.map(c => `<li data-comuna="${esc(c.comuna)}" style="--c:${colorConteo(c.n)}"><i></i><span><b>${esc(c.comuna)}</b><small>${c.region}</small></span><span class="des-n">${c.n}</span></li>`).join('') : '');
  if (desafioListo) {
    dMapa.getSource('com').setData({ type: 'FeatureCollection', features: l.map((c, i) => ({ ...c.f, id: i, properties: { comuna: c.comuna, color: colorConteo(c.n) } })) });
    dMapa.getSource('com-pt').setData({ type: 'FeatureCollection', features: l.map(c => ({ type: 'Feature', geometry: { type: 'Point', coordinates: centroComuna(c.f) || [0, 0] }, properties: { comuna: c.comuna, etq: c.n ? `${c.n} foto${c.n > 1 ? 's' : ''}` : 'faltan fotos' } })) });
  }
}
function elegirComuna(nombre) {
  const c = conteoComunas().find(x => x.comuna === nombre); if (!c) return;
  if (c.n) { filtro.comuna = nombre; filtro.region = ''; $('#g-region').value = ''; pintarFiltros(); irVista('galeria'); pintarTodo(); $('#barra').scrollIntoView({ behavior: 'smooth' }); }
  else abrirSubida({ centro: centroComuna(c.f), comuna: nombre });
}
$('#des-lista').addEventListener('click', e => {
  const s = e.target.closest('[data-subir-comuna]'); if (s) { e.stopPropagation(); elegirComuna(s.dataset.subirComuna); return; }
  const li = e.target.closest('[data-comuna]'); if (!li) return;
  const c = conteoComunas().find(x => x.comuna === li.dataset.comuna);
  if (dMapa && c && !c.n) { const b = C.bbox(c.f); if (b) dMapa.fitBounds(b, { padding: 40, maxZoom: 9 }); }
  elegirComuna(li.dataset.comuna);
});

// ------------------------------------------------------------------ mis fotos (publicadas + en espera)
let COLA_VISTA = [];
const misFotos = () => FOTOS.filter(f => MIAS[f.id]).sort((a, b) => b.id - a.id);
function pintarMias() {
  const pub = misFotos(), esp = COLA_VISTA;
  $('#n-mias').textContent = (pub.length + esp.length) || '';
  if (vista !== 'mias') return;
  $('#mias-cuenta').innerHTML = pub.length || esp.length ? `<b>${pub.length}</b> publicada${pub.length === 1 ? '' : 's'}${esp.length ? ` · <b>${esp.length}</b> esperando señal en este teléfono` : ''} · las ves aquí porque las subiste desde este navegador` : '';
  const l = [...esp, ...pub];
  if (!l.length) { $('#mosaico-mias').innerHTML = '<div class="vacio-g"><b>Aún no has subido fotos desde este teléfono</b>Las que subas aparecerán aquí, y podrás borrarlas si te arrepientes.<button class="boton-grande" type="button" data-abrir-subida>📷 Subir mis fotos</button></div>'; return; }
  justificar($('#mosaico-mias'), l);
}

// ------------------------------------------------------------------ visor
let vLista = [], vIdx = 0, miniMapa = null, miniMarca = null;
function abrirVisor(id, lista) {
  vLista = (lista || filtradas()).filter(f => f.id); vIdx = vLista.findIndex(f => f.id === id);
  if (vIdx < 0) { const f = POR_ID.get(id); if (!f) return; vLista = [f]; vIdx = 0; }
  $('#visor').hidden = false; document.body.style.overflow = 'hidden';
  if (matchMedia('(max-width:980px)').matches) { $('#visor').classList.remove('sin-info'); $('#v-info').setAttribute('aria-pressed', 'true'); }
  pintarVisor();
}
function cerrarVisor() { $('#visor').hidden = true; document.body.style.overflow = ''; history.replaceState(null, '', location.pathname + location.search); }
$('#v-info').onclick = () => { const v = $('#visor'); v.classList.toggle('sin-info'); $('#v-info').setAttribute('aria-pressed', String(!v.classList.contains('sin-info'))); if (!v.classList.contains('sin-info')) miniMapa?.resize(); };
function pintarVisor() {
  const f = vLista[vIdx]; if (!f) return cerrarVisor();
  history.replaceState(null, '', '#f=' + f.id);
  const img = $('#v-foto'); img.classList.add('cambiando'); img.src = '../' + f.mini; img.alt = f.titulo || 'Foto de terreno';
  img.onload = () => img.classList.remove('cambiando');
  const grande = new Image(); grande.onload = () => { if (vLista[vIdx] === f) img.src = grande.src; }; grande.src = '../' + f.archivo;
  [vLista[vIdx + 1], vLista[vIdx - 1]].forEach(x => { if (x) new Image().src = '../' + x.mini; });
  $('#v-ant').hidden = vIdx <= 0; $('#v-sig').hidden = vIdx >= vLista.length - 1;
  $('#v-cuenta').textContent = `${vIdx + 1} / ${vLista.length}`;
  const u = C.aUTM(f.lon, f.lat), enlace = location.origin + location.pathname + '#f=' + f.id;
  const cita = `Foto: ${f.autor} · Galería de terreno, Observatorio Patagonia · CC BY 4.0`;
  const propia = MIAS[f.id];
  const origen = { gps: 'GPS de la cámara', telefono: 'GPS del teléfono al tomarla', recorrido: 'Recorrido GPS (.gpx)', mapa: 'Marcada en el mapa' }[f.origen] || '—';
  $('#v-a').innerHTML = `
    ${f.oculta ? `<p class="v-oculta">Oculta por ${f.reportes} reporte${f.reportes === 1 ? '' : 's'}: el público no la ve. Restáurala o suprímela.</p>` : ''}
    <span class="etq" style="--c:${f.color}"><i></i>${EMOJI_TEMA[f.tema] || ''} ${esc(TEMAS[f.tema] || 'Otro')}</span>
    <h2 id="v-titulo">${esc(f.titulo || 'Sin título')}</h2>
    <p class="v-autor">Foto: <b>${esc(f.autor)}</b>${f.tomada ? ' · ' + fechaLarga(f.tomada) : ''}</p>
    ${f.descripcion ? `<p class="v-descr">${esc(f.descripcion)}</p>` : ''}`;
  $('#v-b').innerHTML = `
    <table class="t-ficha">
      <tr><th>Lugar</th><td>${esc(f.comuna ? f.comuna + ' · ' + f.region : f.lugar)}</td></tr>
      <tr><th>Coordenadas</th><td>${f.lat.toFixed(6)}, ${f.lon.toFixed(6)}<br><small>${C.aGMS(f.lat, 'lat')} ${C.aGMS(f.lon, 'lon')}</small></td></tr>
      <tr><th>UTM</th><td>${u.huso}${u.hemisferio} · ${fmtN(u.este)} E · ${fmtN(u.norte)} N</td></tr>
      <tr><th>Dirección</th><td>${f.rumbo != null ? 'Mira hacia el ' + esc(rumboTexto(f.rumbo)) : 'Sin dato'}</td></tr>
      ${f.altitud != null ? `<tr><th>Altitud</th><td>${fmtN(f.altitud)} m</td></tr>` : ''}
      <tr><th>Ubicación</th><td>${origen}</td></tr>
      <tr><th>Publicada</th><td>${fechaCorta(f.creado)}</td></tr>
    </table>
    <div class="v-cita">${esc(cita)}<br><a href="https://creativecommons.org/licenses/by/4.0/deed.es" target="_blank" rel="noopener">Qué permite la licencia CC BY 4.0 ↗</a></div>
    <div class="v-acc">
      <a class="h-btn h-pri" href="./#@${f.lat.toFixed(5)},${f.lon.toFixed(5)},14z&c=comunas,localidades,fotos">Ver en el visor</a>
      <a class="h-btn" href="../${esc(f.archivo)}" download="${esc(sinTilde(f.titulo || 'foto').replace(/[^a-z0-9]+/g, '-').slice(0, 50))}-${f.id}.jpg">Descargar</a>
      <button class="h-btn" type="button" id="v-copiar-cita">Copiar cita</button>
    </div>
    ${GESTION ? `<details class="v-editar"><summary>Corregir textos (gestión)</summary>
      <label>Firma<input id="e-autor" maxlength="60" value="${esc(f.autor)}"></label>
      <label>Título<input id="e-titulo" maxlength="90" value="${esc(f.titulo || '')}"></label>
      <label>Descripción<textarea id="e-descr" rows="3" maxlength="600">${esc(f.descripcion || '')}</textarea></label>
      <label>Tema<select id="e-tema">${Object.entries(TEMAS).map(([k, t]) => `<option value="${k}"${k === f.tema ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
      <button class="h-btn h-pri" type="button" id="e-guardar">Guardar corrección</button></details>` : ''}
    <div class="v-acc">
      ${GESTION && f.oculta ? '<button class="h-btn" type="button" id="v-restaurar">Restaurar</button>' : ''}
      ${GESTION || propia ? `<button class="h-btn peligro" type="button" id="v-suprimir">${GESTION ? 'Suprimir foto' : 'Borrar mi foto'}</button>` : ''}
      ${!GESTION && !propia ? `<span id="v-rep-caja">${REPORTADAS.has(f.id) ? '<small class="nota">Ya reportaste esta foto. Gracias.</small>' : '<button class="h-btn" type="button" id="v-reportar">Reportar</button>'}</span>` : ''}
    </div>
    ${cercanas(f)}`;
  if (!miniMapa) {
    miniMapa = nuevoMapa('v-mini', 'satelite', { bounds: undefined, center: [f.lon, f.lat], zoom: 13 });
    const el = document.createElement('div'); el.innerHTML = '<svg width="64" height="64" viewBox="0 0 64 64"><path d="M32 32 15 4 A32 32 0 0 1 49 4Z" fill="rgba(255,90,60,.6)" class="cono"/><circle cx="32" cy="32" r="6" fill="#b8392c" stroke="#fff" stroke-width="2.5"/></svg>';
    miniMarca = new maplibregl.Marker({ element: el, rotationAlignment: 'map' }).setLngLat([f.lon, f.lat]).addTo(miniMapa);
  }
  miniMarca.setLngLat([f.lon, f.lat]).setRotation(f.rumbo ?? 0);
  miniMarca.getElement().querySelector('.cono').style.display = f.rumbo == null ? 'none' : '';
  miniMapa.resize(); miniMapa.jumpTo({ center: [f.lon, f.lat], zoom: 13 });
  $('#visor').scrollTop = 0; $('#v-ficha').scrollTop = 0;
  $('#v-copiar-cita').onclick = () => copiar(cita + ' · ' + enlace, 'Cita copiada');
  $('#v-compartir').onclick = () => compartir(f.titulo || 'Foto de la Patagonia', `${f.titulo || 'Foto de terreno'} · ${f.lugar} · foto de ${f.autor}`, enlace);
  const sup = $('#v-suprimir');
  if (sup) sup.onclick = async () => {
    if (!sup.classList.contains('seguro')) { sup.classList.add('seguro'); sup.textContent = 'Toca otra vez para confirmar'; return; }
    sup.disabled = true;
    const d = await post({ accion: 'suprimir', id: f.id, ...(GESTION ? { g: G } : { token: propia }) });
    if (!d.ok) { sup.disabled = false; return aviso(esc(d.error), true); }
    delete MIAS[f.id]; guardarLS('pc_fotos_mias', MIAS);
    FOTOS = FOTOS.filter(x => x.id !== f.id); POR_ID.delete(f.id);
    vLista.splice(vIdx, 1); if (vIdx >= vLista.length) vIdx = vLista.length - 1;
    refrescarTodo(); aviso('Foto suprimida de la galería');
    vLista.length ? pintarVisor() : cerrarVisor();
  };
  const res = $('#v-restaurar');
  if (res) res.onclick = async () => { const d = await post({ accion: 'restaurar', id: f.id, g: G }); if (!d.ok) return aviso(esc(d.error), true); f.oculta = 0; f.reportes = 0; refrescarTodo(); pintarVisor(); aviso('Foto restaurada: vuelve a ser pública'); };
  const eg = $('#e-guardar');
  if (eg) eg.onclick = async () => {
    const d = await post({ accion: 'editar', id: f.id, g: G, autor: $('#e-autor').value, titulo: $('#e-titulo').value, descripcion: $('#e-descr').value, tema: $('#e-tema').value });
    if (!d.ok) return aviso(esc(d.error), true);
    Object.assign(f, d.foto); enriquecer(f); refrescarTodo(); pintarVisor(); aviso('Textos corregidos');
  };
  const rep = $('#v-reportar');
  if (rep) rep.onclick = () => {
    $('#v-rep-caja').innerHTML = `<select id="v-motivo" class="h-btn"><option>Contenido o nombre ofensivo</option><option>Se reconoce a personas sin permiso</option><option>Ubicación equivocada</option><option>No es de Aysén o Magallanes</option><option>Infringe derechos de autor</option><option>Otro motivo</option></select> <button class="h-btn peligro" type="button" id="v-rep-env">Enviar reporte</button>`;
    $('#v-rep-env').onclick = async () => {
      const d = await post({ accion: 'reportar', id: f.id, motivo: $('#v-motivo').value });
      if (!d.ok) return aviso(esc(d.error), true);
      REPORTADAS.add(f.id); guardarLS('pc_fotos_reportadas', [...REPORTADAS]);
      $('#v-rep-caja').innerHTML = '<small class="nota">Reporte enviado. El equipo lo revisará.</small>';
    };
  };
  $$('[data-cerca]').forEach(b => b.onclick = () => { const id = +b.dataset.cerca; const i = vLista.findIndex(x => x.id === id); if (i >= 0) vIdx = i; else { vLista = [POR_ID.get(id)]; vIdx = 0; } pintarVisor(); });
}
function cercanas(f) {
  const l = publicas().filter(x => x.id !== f.id).map(x => ({ x, d: C.distancia([f.lon, f.lat], [x.lon, x.lat]) })).filter(o => o.d < 3000)
    .sort((a, b) => (a.x.tomada || '').localeCompare(b.x.tomada || '')).slice(0, 9);
  if (!l.length) return '';
  return `<div class="v-cerca"><h3>El mismo lugar, otras fotos · a menos de 3 km</h3><div>${l.map(({ x, d }) => `<button type="button" data-cerca="${x.id}" title="${esc(x.titulo || '')} · a ${fmtN(d)} m"><img src="../${esc(x.mini)}" alt="" loading="lazy"><small>${x.tomada ? fechaCorta(x.tomada) : 'sin fecha'}</small></button>`).join('')}</div></div>`;
}
$('#v-cerrar').onclick = cerrarVisor;
$('#v-ant').onclick = () => { if (vIdx > 0) { vIdx--; pintarVisor(); } };
$('#v-sig').onclick = () => { if (vIdx < vLista.length - 1) { vIdx++; pintarVisor(); } };
// deslizar con el dedo
let toque = null;
$('#v-escena').addEventListener('pointerdown', e => { toque = { x: e.clientX, y: e.clientY }; });
$('#v-escena').addEventListener('pointerup', e => {
  if (!toque) return; const dx = e.clientX - toque.x, dy = e.clientY - toque.y; toque = null;
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4) (dx < 0 ? $('#v-sig') : $('#v-ant')).click();
});
document.addEventListener('keydown', e => {
  if (!$('#visor').hidden && !e.target.closest('input,select,textarea')) {
    if (e.key === 'Escape') cerrarVisor(); else if (e.key === 'ArrowLeft') $('#v-ant').click(); else if (e.key === 'ArrowRight') $('#v-sig').click();
  } else if (!$('#subida').hidden && e.key === 'Escape' && A.paso !== 4) cerrarSubida();
});
function refrescarTodo() { pintarFiltros(); pintarHero(); pintarTodo(); pintarMias(); }

// ------------------------------------------------------------------ cola de subida (sin señal)
const memoria = new Map();   // respaldo si el navegador no deja usar IndexedDB
function abrirDB() {
  return new Promise((ok, mal) => {
    try { const r = indexedDB.open('galeria-patagonia', 1); r.onupgradeneeded = () => r.result.createObjectStore('cola', { keyPath: 'clave' }); r.onsuccess = () => ok(r.result); r.onerror = () => mal(r.error); }
    catch (e) { mal(e); }
  });
}
async function colaOp(modo, fn) {
  try {
    const db = await abrirDB();
    return await new Promise((ok, mal) => { const tx = db.transaction('cola', modo); let res = true; const r = fn(tx.objectStore('cola')); if (r) r.onsuccess = () => res = r.result; tx.oncomplete = () => ok(res); tx.onerror = () => mal(tx.error); });
  } catch { return null; }
}
async function colaPoner(x) { if (await colaOp('readwrite', s => s.put(x)) === null) memoria.set(x.clave, x); }
async function colaQuitar(k) { memoria.delete(k); await colaOp('readwrite', s => s.delete(k)); }
async function colaTodo() { const l = (await colaOp('readonly', s => s.getAll())) || []; const arr = Array.isArray(l) ? l : []; return [...arr, ...[...memoria.values()].filter(m => !arr.some(x => x.clave === m.clave))].sort((a, b) => a.creado - b.creado); }
function paquete(datos, foto, mini) {
  const largo = n => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n); return b; };
  const json = new TextEncoder().encode(JSON.stringify(datos));
  return new Blob([new TextEncoder().encode('PCF1'), largo(json.length), json, largo(foto.size), foto, largo(mini.size), mini], { type: 'application/octet-stream' });
}
let procesando = false;
async function procesarCola(progreso) {
  if (procesando) return { pub: [], err: [], espera: 0 };
  procesando = true; const pub = [], err = [];
  try {
    const l = await colaTodo();
    for (const [i, x] of l.entries()) {
      if (x.error) { err.push(x); continue; }
      progreso?.(i, l.length);
      let r, d = null;
      try { r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: paquete(x.datos, x.grande, x.mini) }); }
      catch { break; }   // sin señal: se reintenta después
      try { d = await r.json(); } catch { }
      if (d?.ok) {
        await colaQuitar(x.clave);
        MIAS[d.foto.id] = d.token; guardarLS('pc_fotos_mias', MIAS);
        if (!POR_ID.has(d.foto.id)) FOTOS.unshift(enriquecer(d.foto));
        pub.push({ foto: POR_ID.get(d.foto.id), numero: d.numero, local: x });
      } else if (!d || r.status === 429 || r.status >= 500) break;
      else { x.error = d.error || 'No se pudo publicar.'; await colaPoner(x); err.push(x); }
    }
  } finally { procesando = false; }
  if (pub.length) refrescarTodo();
  await pintarCola();
  return { pub, err, espera: COLA_VISTA.filter(x => !x.error).length };
}
async function pintarCola() {
  const l = await colaTodo();
  COLA_VISTA.forEach(x => x.local && URL.revokeObjectURL(x.local));
  COLA_VISTA = l.map(x => ({ espera: true, error: x.error, clave: x.clave, local: URL.createObjectURL(x.mini), w: x.w, h: x.h, titulo: x.datos.titulo, autor: x.datos.autor, tema: x.datos.tema, tomada: x.datos.tomada, rumbo: x.datos.rumbo, lugar: x.lugar || '' }));
  const esp = l.filter(x => !x.error).length, mal = l.filter(x => x.error);
  const a = $('#cola-aviso');
  a.hidden = !l.length;
  a.innerHTML = (esp ? `<span>📶 ${esp} foto${esp > 1 ? 's' : ''} esperando señal en este teléfono: se subirán solas.</span><button type="button" id="cola-reintentar">Reintentar ahora</button>` : '')
    + (mal.length ? `<span>${mal.length} foto${mal.length > 1 ? 's' : ''} no se pudo publicar: ${esc(mal[0].error)}</span><button type="button" id="cola-descartar">Descartar</button>` : '');
  $('#cola-reintentar')?.addEventListener('click', () => procesarCola().then(r => { if (r.pub.length) aviso(`${r.pub.length} foto${r.pub.length > 1 ? 's' : ''} publicada${r.pub.length > 1 ? 's' : ''}`); else if (r.espera) aviso('Todavía no hay conexión con el servidor.', true); }));
  $('#cola-descartar')?.addEventListener('click', async () => { for (const x of mal) await colaQuitar(x.clave); pintarCola(); });
  pintarMias();
}
window.addEventListener('online', () => procesarCola().then(r => r.pub.length && aviso(`Volvió la señal: ${r.pub.length} foto${r.pub.length > 1 ? 's' : ''} publicada${r.pub.length > 1 ? 's' : ''}`)));
setInterval(() => { if (COLA_VISTA.some(x => !x.error) && navigator.onLine) procesarCola(); }, 60000);

// ------------------------------------------------------------------ asistente para subir
const A = { paso: 1, items: [], idx: 0, tema: 'paisaje', traza: null, mapa: null, marca: null, listo: false, pos: null, n: 0, centro: null, publicando: false };
$('#a-temas').innerHTML = Object.entries(TEMAS).map(([k, t]) => `<button type="button" role="radio" data-atema="${k}" aria-checked="${k === A.tema}"><span aria-hidden="true">${EMOJI_TEMA[k]}</span>${esc(t)}</button>`).join('');
$('#a-temas').onclick = e => { const b = e.target.closest('[data-atema]'); if (!b) return; A.tema = b.dataset.atema; $$('[data-atema]').forEach(x => x.setAttribute('aria-checked', String(x === b))); };
$('#a-desf').innerHTML = Array.from({ length: 25 }, (_, i) => i - 12).map(h => `<option value="${h}"${h === 0 ? ' selected' : ''}>${h === 0 ? 'en hora' : h > 0 ? `adelantado ${h} h` : `atrasado ${-h} h`}</option>`).join('');
$('#a-autor').value = leerLS('pc_fotos_autor', '') || '';

function abrirSubida(opc = {}) {
  if (A.paso === 4) reiniciar();
  A.centro = opc.centro || null;
  $('#subida').hidden = false; document.body.style.overflow = 'hidden';
  irPaso(A.items.length && A.paso < 4 ? A.paso : 1);
  if (opc.comuna) aviso(`Sube una foto de ${esc(opc.comuna)}: el mapa te esperará allí.`);
}
function cerrarSubida() {
  if (A.publicando) return aviso('Espera un momento: estamos guardando tus fotos.');
  $('#subida').hidden = true; document.body.style.overflow = '';
  if (A.paso === 4) reiniciar();
}
function reiniciar() { A.items.forEach(it => URL.revokeObjectURL(it.url)); Object.assign(A, { items: [], idx: 0, paso: 1, traza: null }); pintarFotosA(); }
$('#a-cerrar').onclick = cerrarSubida;

function irPaso(p) {
  A.paso = p;
  $$('.paso').forEach(s => s.hidden = +s.dataset.p !== p);
  $$('#pasos li').forEach(li => { const n = +li.dataset.p; li.classList.toggle('activo', n === p); li.classList.toggle('hecho', n < p); });
  $('#pasos').hidden = p === 4; $('.asis-pie').hidden = p === 4;
  $('#a-atras').style.visibility = p === 1 ? 'hidden' : 'visible';
  if (p === 2) { iniciarMapaA(); const i = A.items.findIndex(it => !valida(it)); A.idx = i >= 0 ? i : Math.min(A.idx, A.items.length - 1); pintarDonde(true); }
  if (p === 3) pintarQuien();
  actualizarPie();
  $(`.paso[data-p="${p}"]`).scrollTop = 0;
}
const ubicada = it => it.lat != null && it.lon != null;
const valida = it => ubicada(it) && dentroCaja(it.lon, it.lat);
function actualizarPie() {
  const sig = $('#a-sig'), est = $('#a-estado'), n = A.items.length;
  if (A.paso === 1) { sig.textContent = 'Siguiente'; sig.disabled = !n; est.textContent = n ? `${n} foto${n > 1 ? 's' : ''} lista${n > 1 ? 's' : ''}` : 'Elige al menos una foto'; }
  if (A.paso === 2) {
    const faltan = A.items.filter(it => !valida(it)).length;
    sig.textContent = 'Siguiente'; sig.disabled = !!faltan;
    est.textContent = faltan ? `Falta ubicar ${faltan} foto${faltan > 1 ? 's' : ''}` : `✓ ${n === 1 ? 'La foto tiene' : `Las ${n} fotos tienen`} su lugar`;
  }
  if (A.paso === 3) { sig.textContent = A.publicando ? 'Publicando…' : `Publicar ${n} foto${n > 1 ? 's' : ''}`; sig.disabled = A.publicando; if (!A.publicando) est.textContent = ''; }
}
$('#a-atras').onclick = () => irPaso(Math.max(1, A.paso - 1));
$('#a-sig').onclick = () => { if (A.paso < 3) irPaso(A.paso + 1); else publicar(); };

// paso 1: fotos
$('#a-camara').closest('label').addEventListener('click', () => { ubicacionTelefono(20000).then(p => { if (p) A.pos = p; }); });
$('#a-camara').onchange = e => { agregar([...e.target.files], true); e.target.value = ''; };
$('#a-galeria').onchange = e => { agregar([...e.target.files], false); e.target.value = ''; };
async function agregar(files, deCamara) {
  const imgs = files.filter(f => /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic)$/i.test(f.name));
  if (!imgs.length) return;
  for (const file of imgs) {
    if (A.items.length >= 30) { aviso('Puedes subir hasta 30 fotos por vez.', true); break; }
    const info = await leerFoto(file);
    const it = { k: ++A.n, file, url: URL.createObjectURL(file), info, lat: null, lon: null, rumbo: info.rumbo, altitud: info.altitud, tomada: info.tomada, origen: null, titulo: null, deCamara };
    if (info.origen === 'gps') Object.assign(it, { lat: info.lat, lon: info.lon, origen: 'gps' });
    else if (deCamara) {
      const p = A.pos && Date.now() - A.pos.t < 180000 ? A.pos : await ubicacionTelefono(15000);
      if (p) Object.assign(it, { lat: p.lat, lon: p.lon, altitud: p.alt != null ? Math.round(p.alt) : it.altitud, origen: 'telefono' });
      if (!it.tomada) it.tomada = fechaTexto(new Date());
    }
    A.items.push(it);
  }
  aplicarTraza(); pintarFotosA(); actualizarPie();
}
function pintarFotosA() {
  $('#a-fotos').innerHTML = A.items.map(it => `<div class="a-foto"><img src="${it.url}" alt="" onerror="this.style.opacity=.2"><button type="button" class="a-q" data-quitar="${it.k}" aria-label="Quitar">×</button><span class="a-ok${ubicada(it) ? '' : ' falta'}">${ubicada(it) ? '📍 con lugar' : 'falta lugar'}</span></div>`).join('');
  $('#a-tema-caja').hidden = !A.items.length;
}
$('#a-fotos').onclick = e => { const q = e.target.closest('[data-quitar]'); if (q) quitarItem(+q.dataset.quitar); };
function quitarItem(k) {
  const it = A.items.find(x => x.k === k); if (!it) return;
  URL.revokeObjectURL(it.url); A.items = A.items.filter(x => x !== it);
  pintarFotosA();
  if (!A.items.length) irPaso(1); else if (A.paso === 2) { A.idx = Math.min(A.idx, A.items.length - 1); pintarDonde(true); }
  actualizarPie();
}

// paso 2: ¿dónde?
function iniciarMapaA() {
  if (A.mapa) { setTimeout(() => A.mapa.resize(), 30); return; }
  A.mapa = nuevoMapa('a-mapa', 'satelite');
  A.mapa.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  const el = document.createElement('div'); el.className = 'pin-foto';
  el.innerHTML = '<svg viewBox="0 0 80 80"><g class="pin-cono"><path d="M40 40 19 4 A42 42 0 0 1 61 4Z" fill="rgba(255,207,90,.7)" stroke="#fff" stroke-width="1.5"/></g><circle cx="40" cy="40" r="9" fill="#b8392c" stroke="#fff" stroke-width="3"/></svg>';
  A.marca = new maplibregl.Marker({ element: el, draggable: true, rotationAlignment: 'map' }).setLngLat([0, 0]);
  A.marca.on('dragend', () => { const ll = A.marca.getLngLat(); ponerLugar(ll.lng, ll.lat, 'mapa', false); });
  A.mapa.on('load', () => {
    A.mapa.addSource('traza', { type: 'geojson', data: vacia() });
    A.mapa.addSource('otras', { type: 'geojson', data: vacia() });
    A.mapa.addLayer({ id: 'traza', type: 'line', source: 'traza', paint: { 'line-color': '#ffcf5a', 'line-width': 2.5, 'line-dasharray': [2, 1.2] } });
    A.mapa.addLayer({ id: 'otras', type: 'circle', source: 'otras', paint: { 'circle-color': '#fff', 'circle-radius': 5, 'circle-stroke-color': '#1c2326', 'circle-stroke-width': 2 } });
    A.listo = true; pintarDonde(true);
  });
  A.mapa.on('click', e => ponerLugar(e.lngLat.lng, e.lngLat.lat, 'mapa', false));
}
function ponerLugar(lon, lat, origen, volar = true) {
  const it = A.items[A.idx]; if (!it) return;
  Object.assign(it, { lon, lat, origen, titulo: it.tituloEditado ? it.titulo : null });
  if (!dentroCaja(lon, lat)) aviso('Ese lugar queda fuera de Aysén y Magallanes: la galería solo recibe fotos de esas regiones.', true);
  pintarDonde(volar); pintarFotosA(); actualizarPie();
}
function pintarDonde(volar) {
  const it = A.items[A.idx]; if (!it) return;
  const n = A.items.length;
  $('#d-n').textContent = n > 1 ? `Foto ${A.idx + 1} de ${n}` : 'Tu foto';
  $('#d-img').src = it.url;
  const est = $('#d-est');
  if (!ubicada(it)) { est.className = 'donde-est falta'; est.textContent = 'Esta foto no trae su ubicación. Márcala en el mapa, busca el lugar o toca «Estoy aquí».'; }
  else if (!dentroCaja(it.lon, it.lat)) { est.className = 'donde-est falta'; est.textContent = 'El lugar queda fuera de Aysén y Magallanes. Muévelo o quita la foto.'; }
  else { est.className = 'donde-est ok'; est.textContent = { gps: '✓ Tu foto ya sabe dónde fue tomada', telefono: '✓ Ubicada con el GPS de tu teléfono', recorrido: '✓ Ubicada con tu recorrido', mapa: '✓ Lugar marcado' }[it.origen] || '✓ Lugar marcado'; }
  $('#d-igual').hidden = !(A.idx > 0 && ubicada(A.items[A.idx - 1]));
  $('#d-prev').disabled = A.idx === 0; $('#d-next').disabled = A.idx >= n - 1;
  $('#d-prev').parentElement.hidden = n < 2;
  pintarDial(it.rumbo);
  if (!A.listo) return;
  if (ubicada(it)) { A.marca.setLngLat([it.lon, it.lat]).addTo(A.mapa); if (volar) A.mapa.flyTo({ center: [it.lon, it.lat], zoom: Math.max(A.mapa.getZoom(), 14), duration: 900 }); }
  else {
    A.marca.remove();
    if (volar) { const prev = A.items.slice(0, A.idx).reverse().find(ubicada); if (prev) A.mapa.flyTo({ center: [prev.lon, prev.lat], zoom: 12 }); else if (A.centro) A.mapa.flyTo({ center: A.centro, zoom: 9 }); }
  }
  A.marca.getElement().querySelector('.pin-cono').style.display = it.rumbo == null ? 'none' : '';
  A.marca.setRotation(it.rumbo ?? 0);
  A.mapa.getSource('otras').setData({ type: 'FeatureCollection', features: A.items.filter((x, i) => i !== A.idx && ubicada(x)).map(x => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [x.lon, x.lat] }, properties: {} })) });
  A.mapa.getSource('traza').setData(A.traza ? { type: 'Feature', geometry: { type: 'LineString', coordinates: A.traza.map(p => [p.lon, p.lat]) }, properties: {} } : vacia());
}
$('#d-prev').onclick = () => { if (A.idx > 0) { A.idx--; pintarDonde(true); } };
$('#d-next').onclick = () => { if (A.idx < A.items.length - 1) { A.idx++; pintarDonde(true); } };
$('#d-quitar').onclick = () => quitarItem(A.items[A.idx]?.k);
$('#d-igual').onclick = () => { const p = A.items[A.idx - 1]; if (p) ponerLugar(p.lon, p.lat, 'mapa'); };
$('#d-aqui').onclick = async () => {
  const b = $('#d-aqui'); b.disabled = true; b.textContent = 'Buscando tu ubicación…';
  const p = await ubicacionTelefono(20000); b.disabled = false; b.textContent = '📍 Estoy aquí';
  if (!p) return aviso('No pudimos obtener tu ubicación. Revisa que el navegador tenga permiso, o marca el lugar en el mapa.', true);
  const it = A.items[A.idx]; if (it && p.alt != null) it.altitud = Math.round(p.alt);
  ponerLugar(p.lon, p.lat, 'telefono');
};
// dirección con el dial
function pintarDial(r) {
  $('#d-dial').classList.toggle('sin', r == null);
  $('#d-aguja').setAttribute('transform', `rotate(${r ?? 0} 60 60)`);
  $('#d-rumbo').textContent = r == null ? 'Opcional. Gira el abanico con el dedo.' : `Mira hacia el ${rumboTexto(r)}`;
  $('#d-dial').setAttribute('aria-valuenow', String(Math.round(r ?? 0)));
}
function fijarRumbo(r) {
  const it = A.items[A.idx]; if (!it) return;
  it.rumbo = r == null ? null : Math.round(((r % 360) + 360) % 360);
  pintarDial(it.rumbo);
  if (A.marca) { A.marca.setRotation(it.rumbo ?? 0); A.marca.getElement().querySelector('.pin-cono').style.display = it.rumbo == null ? 'none' : ''; }
}
const dial = $('#d-dial');
const anguloDial = e => { const b = dial.getBoundingClientRect(); return Math.atan2(e.clientX - b.left - b.width / 2, -(e.clientY - b.top - b.height / 2)) * 180 / Math.PI; };
dial.addEventListener('pointerdown', e => { dial.setPointerCapture(e.pointerId); fijarRumbo(anguloDial(e)); });
dial.addEventListener('pointermove', e => { if (dial.hasPointerCapture(e.pointerId)) fijarRumbo(anguloDial(e)); });
dial.addEventListener('keydown', e => { const it = A.items[A.idx]; if (!it) return; if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { fijarRumbo((it.rumbo ?? 0) + 10); e.preventDefault(); } if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { fijarRumbo((it.rumbo ?? 0) - 10); e.preventDefault(); } });
$('#d-sinrumbo').onclick = () => fijarRumbo(null);
// buscar un lugar: primero las localidades del Observatorio, luego OpenStreetMap
let tb, ctrlBusca, RES = [];
$('#d-buscar').oninput = e => {
  const q = e.target.value.trim(); clearTimeout(tb); ctrlBusca?.abort();
  if (q.length < 2) { $('#d-res').hidden = true; return; }
  const loc = (LOCALIDADES?.features || []).filter(f => sinTilde(f.properties.nombre).includes(sinTilde(q))).slice(0, 5)
    .map(f => ({ nombre: f.properties.nombre, sub: [f.properties.clase, f.properties.comuna].filter(Boolean).join(' · '), lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }));
  pintarResultados(loc, true);
  if (q.length < 3) return;
  tb = setTimeout(async () => {
    ctrlBusca = new AbortController();
    try {
      const u = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&accept-language=es&countrycodes=cl&bounded=1&viewbox=${CAJA.lonO},${CAJA.latN},${CAJA.lonE},${CAJA.latS}&q=${encodeURIComponent(q)}`;
      const r = await (await fetch(u, { signal: ctrlBusca.signal })).json();
      const osm = r.map(x => ({ nombre: x.name || x.display_name.split(',')[0], sub: x.display_name.split(',').slice(1, 3).join(',').trim(), lon: +x.lon, lat: +x.lat }))
        .filter(x => !loc.some(l => Math.abs(l.lat - x.lat) < .01 && Math.abs(l.lon - x.lon) < .01));
      pintarResultados([...loc, ...osm], false);
    } catch { }
  }, 450);
};
function pintarResultados(l, buscando) {
  RES = l;
  $('#d-res').innerHTML = l.map((x, i) => `<li data-res="${i}">${esc(x.nombre)}<small>${esc(x.sub || '')}</small></li>`).join('') || (buscando ? '' : '<li style="cursor:default">Sin resultados. Prueba con otro nombre o marca el lugar en el mapa.</li>');
  $('#d-res').hidden = !$('#d-res').innerHTML;
}
$('#d-res').onclick = e => { const li = e.target.closest('[data-res]'); if (!li) return; const x = RES[+li.dataset.res]; $('#d-res').hidden = true; $('#d-buscar').value = x.nombre; ponerLugar(x.lon, x.lat, 'mapa'); aviso('Ajusta el pin al punto exacto donde estabas, si puedes.'); };
document.addEventListener('click', e => { if (!e.target.closest('.buscar-lugar')) $('#d-res').hidden = true; });
// recorrido GPX (opciones para investigadores)
$('#a-gpx').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    A.traza = leerGPX(await f.text());
    const t0 = new Date(A.traza[0].t), t1 = new Date(A.traza[A.traza.length - 1].t);
    $('#a-gpx-txt').textContent = `${f.name}: ${fmtN(A.traza.length)} puntos, ${t0.toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })} a ${t1.toLocaleTimeString('es-CL', { timeStyle: 'short' })}`;
    $('#a-desfase').hidden = false; aplicarTraza(true); pintarDonde(true); pintarFotosA(); actualizarPie();
  } catch (err) { aviso(esc(err.message), true); }
};
$('#a-desf').onchange = $('#a-desf-min').oninput = () => { aplicarTraza(true); pintarDonde(false); pintarFotosA(); actualizarPie(); };
function aplicarTraza(avisar = false) {
  if (!A.traza) return;
  const desf = (+$('#a-desf').value * 60 + (+$('#a-desf-min').value || 0)) * 60000;
  let n = 0;
  for (const it of A.items) {
    if (['gps', 'telefono', 'mapa'].includes(it.origen)) continue;
    const p = it.info.utc != null ? ubicarEnRecorrido(A.traza, it.info.utc - desf) : null;
    if (p) { Object.assign(it, { lat: p.lat, lon: p.lon, altitud: p.ele != null ? Math.round(p.ele) : it.altitud, origen: 'recorrido' }); n++; }
    else if (it.origen === 'recorrido') Object.assign(it, { lat: null, lon: null, origen: null });
  }
  if (avisar) aviso(n ? `${n} foto${n > 1 ? 's' : ''} ubicada${n > 1 ? 's' : ''} con tu recorrido` : 'Ninguna foto coincide con la hora del recorrido. Revisa la hora de la cámara.', !n);
}

// paso 3: ¿quién?
function sugerencia(it) {
  const c = cercana(LOCALIDADES, it.lon, it.lat), com = comunaDe(COMUNAS, it.lon, it.lat)?.comuna;
  if (c && c.km < 3) return c.nombre;
  if (c && c.km < 25) return `Cerca de ${c.nombre}`;
  return com ? `Comuna de ${com}` : '';
}
function pintarQuien() {
  A.items.forEach(it => { if (it.titulo == null) it.titulo = sugerencia(it); });
  $('#a-titulos').innerHTML = `<p>${A.items.length > 1 ? 'Títulos' : 'Título'} <small style="font:500 12px var(--mono);color:var(--tinta-3)">(sugerimos uno según el lugar; cámbialo si quieres)</small></p>` + A.items.map(it => `<div class="titulo-foto"><img src="${it.url}" alt=""><input data-titulo="${it.k}" maxlength="90" value="${esc(it.titulo)}" placeholder="¿Qué se ve?"></div>`).join('');
  pintarPrevia();
}
$('#a-titulos').addEventListener('input', e => { const k = +e.target.dataset.titulo; const it = A.items.find(x => x.k === k); if (it) { it.titulo = e.target.value; it.tituloEditado = true; if (it === A.items[0]) pintarPrevia(); } });
$('#a-autor').oninput = () => pintarPrevia();
function pintarPrevia() {
  const it = A.items[0]; if (!it) return;
  const com = comunaDe(COMUNAS, it.lon, it.lat)?.comuna;
  $('#a-prev').innerHTML = `<div class="tarjeta-prev"><img src="${it.url}" alt=""><div><b>${esc(it.titulo || 'Sin título')}</b><small>${esc($('#a-autor').value.trim() || 'Tu nombre')} · ${esc(com || 'Patagonia')}${it.tomada ? ' · ' + fechaCorta(it.tomada) : ''}</small><em>${EMOJI_TEMA[A.tema]} ${esc(TEMAS[A.tema])}</em></div></div>${A.items.length > 1 ? `<p class="nota-g" style="margin-top:8px">y ${A.items.length - 1} foto${A.items.length > 2 ? 's' : ''} más</p>` : ''}`;
}

// publicar: primero se guardan en el teléfono, luego se suben
async function publicar() {
  const autor = $('#a-autor').value.trim();
  if (autor.length < 2) { aviso('Escribe tu nombre o un seudónimo: aparecerá junto a tus fotos.', true); $('#a-autor').focus(); return; }
  if (!$('#a-acepto').checked) { aviso('Marca la casilla para confirmar que puedes compartir estas fotos.', true); $('#a-acepto').closest('label').scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
  guardarLS('pc_fotos_autor', autor);
  A.publicando = true; actualizarPie();
  const est = $('#a-estado'), propias = [];
  try {
    for (const [i, it] of A.items.entries()) {
      est.textContent = `Preparando ${i + 1} de ${A.items.length}…`;
      const g = await achicar(it.file, 2048, .84), m = await achicar(it.file, 720, .8);
      const x = { clave: clave(), creado: Date.now() + i, grande: g.blob, mini: m.blob, w: g.w, h: g.h, lugar: comunaDe(COMUNAS, it.lon, it.lat)?.comuna || '',
        datos: { lat: +it.lat.toFixed(6), lon: +it.lon.toFixed(6), rumbo: it.rumbo ?? null, altitud: it.altitud ?? null, tomada: it.tomada || null, titulo: (it.titulo || '').trim(),
                 descripcion: $('#a-descr').value.trim(), autor, tema: A.tema, origen: it.origen || 'mapa', acepto: 1, web: $('#a-web').value } };
      x.datos.clave = x.clave;
      await colaPoner(x); propias.push(x.clave);
    }
  } catch (e) { A.publicando = false; actualizarPie(); return aviso(esc(e.message || 'No se pudo preparar una foto.'), true); }
  const r = await procesarCola((i, n) => { est.textContent = `Subiendo ${Math.min(i + 1, n)} de ${n}…`; });
  A.publicando = false;
  const mias = r.pub.filter(p => propias.includes(p.local.clave)), errores = r.err.filter(x => propias.includes(x.clave));
  pintarFin(autor, mias, propias.length - mias.length - errores.length, errores);
  irPaso(4);
}
function pintarFin(autor, pub, espera, errores) {
  const primero = A.items[0], nums = pub.map(p => p.numero).filter(Boolean).sort((a, b) => a - b);
  const enlace = pub[0] ? location.origin + location.pathname + '#f=' + pub[0].foto.id : location.origin + location.pathname;
  const texto = pub.length === 1 ? `Subí una foto de ${pub[0].foto.lugar} al archivo abierto de la Patagonia 📸` : `Subí ${pub.length} fotos al archivo abierto de la Patagonia 📸`;
  const nombre = esc(autor.split(' ')[0]);
  $('#a-fin').innerHTML = `<div class="fin-caja">
    <div class="fin-foto"><img src="${primero?.url || ''}" alt=""><i></i></div>
    ${pub.length ? `<h2>¡Gracias, ${nombre}!</h2>
      <p>${pub.length === 1 ? `Tu foto es la <b>n.º ${nums[0]}</b> del archivo abierto de la Patagonia.` : `Tus ${pub.length} fotos ya están en el archivo abierto de la Patagonia${nums.length ? ` (<b>n.º ${nums[0]} a ${nums[nums.length - 1]}</b>)` : ''}.`}</p>`
      : espera ? `<h2>Tus fotos quedaron guardadas</h2>` : `<h2>No se pudieron publicar</h2>`}
    ${espera ? `<p>📶 No hay señal ahora: ${espera === 1 ? 'tu foto quedó guardada' : `${espera} fotos quedaron guardadas`} en este teléfono y se ${espera === 1 ? 'subirá sola' : 'subirán solas'} cuando vuelva la conexión. Puedes cerrar esta página.</p>` : ''}
    ${errores.length ? `<p style="color:var(--acento)">${errores.length} no se pudo publicar: ${esc(errores[0].error)}</p>` : ''}
    <div class="fin-acc">
      ${pub.length ? `<a class="boton-grande wsp" href="https://wa.me/?text=${encodeURIComponent(texto + ' ' + enlace)}" target="_blank" rel="noopener">Compartir por WhatsApp</a>
      <button class="boton-sec" type="button" id="f-compartir">Compartir</button>
      <button class="boton-sec" type="button" id="f-ver">Ver mi foto</button>` : ''}
      <button class="boton-sec" type="button" id="f-mas">Subir más fotos</button>
      <button class="boton-sec" type="button" id="f-cerrar">Volver a la galería</button>
    </div></div>`;
  $('#f-compartir')?.addEventListener('click', () => compartir('Galería de la Patagonia', texto, enlace));
  $('#f-ver')?.addEventListener('click', () => { const id = pub[0].foto.id; cerrarSubida(); abrirVisor(id, misFotos()); });
  $('#f-mas').onclick = () => { reiniciar(); irPaso(1); };
  $('#f-cerrar').onclick = () => { cerrarSubida(); irVista(pub.length ? 'galeria' : 'mias'); };
}

// arrastrar fotos sobre la página (computador)
window.addEventListener('dragover', e => { if ([...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault(); });
window.addEventListener('drop', e => {
  if (e.target.closest?.('input[type=file]')) return;
  const fs = [...(e.dataTransfer?.files || [])]; if (!fs.length) return;
  e.preventDefault();
  const gpx = fs.find(f => /\.gpx$/i.test(f.name)), imgs = fs.filter(f => /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic)$/i.test(f.name));
  if (imgs.length) { if ($('#subida').hidden) abrirSubida(); if (A.paso !== 1) irPaso(1); agregar(imgs, false); }
  if (gpx) { const dt = new DataTransfer(); dt.items.add(gpx); $('#a-gpx').files = dt.files; $('#a-gpx').dispatchEvent(new Event('change')); }
});

// ------------------------------------------------------------------ arranque
const ajustarBarra = () => { $('#barra').style.top = $('#cabeza').offsetHeight + 'px'; };
ajustarBarra(); window.addEventListener('resize', ajustarBarra);
if (await cargar()) { pintarFiltros(); pintarHero(); pintarTemas(); pintarGaleria(); }
await pintarCola();
procesarCola();
const fH = +(location.hash.match(/^#f=(\d+)/) || [])[1];
if (fH && POR_ID.get(fH)) abrirVisor(fH, publicas());
if (/#subir/.test(location.hash)) abrirSubida();
