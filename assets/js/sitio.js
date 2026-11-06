// Patagonia Chilena · relato con mapa, historia, contador, mapa de inscritos, anticipo de la Asamblea e inscripción
import { iniciarViento } from './viento.js?v=1793989779';
import { iniciarRelieve } from './relieve.js?v=1793989779';
import { iniciarParalaje } from './paralaje.js?v=1793989779';
import { iniciarHistoria } from './historia.js?v=1793989779';
import { trazar, ocupar, porRegionDesde, ORDEN_REGIONES, NOMBRE_REGION, COLOR_REGION, regionDeComuna } from './hemiciclo.js?v=1793989779';
// siempre partir desde la portada (salvo que el enlace apunte a una sección)
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
if (!location.hash) { scrollTo(0, 0); addEventListener('load', () => scrollTo(0, 0)); }
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const fmt = n => Number(n || 0).toLocaleString('es-CL');
const esCelular = () => matchMedia('(max-width:760px)').matches;
const sinMovimiento = matchMedia('(prefers-reduced-motion: reduce)').matches;
const API = 'api/';

const datos = {};
async function json(url) { const r = await fetch(url, { cache: 'no-cache' }); if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); }
const pDatos = Promise.allSettled([
  json('datos/cifras.json').then(d => datos.cifras = d),
  json('datos/comunas.json').then(d => { datos.comunas = d; datos.porCut = new Map(d.map(c => [c.c, c])); }),
]);

/* ------------------------------------------------------------------ barra */
const barra = $('#barra');
addEventListener('scroll', () => barra.classList.toggle('solida', scrollY > 40), { passive: true });

/* ------------------------------------------------------------------ cifras */
function animarNumero(el, hasta, ms = 1800) {
  if (sinMovimiento) { el.textContent = fmt(hasta); return; }
  const desde = Number(el.dataset.v || 0), t0 = performance.now();
  el.dataset.v = hasta;
  const paso = t => {
    const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 4);
    el.textContent = fmt(Math.round(desde + (hasta - desde) * e));
    if (k < 1) requestAnimationFrame(paso);
  };
  requestAnimationFrame(paso);
}
function pintarCifra(clave, valor, animar) {
  $$(`[data-cifra="${clave}"]`).forEach(el => {
    if (animar && typeof valor === 'number') animarNumero(el, valor); else el.textContent = typeof valor === 'number' ? fmt(valor) : valor;
  });
}

pDatos.then(() => {
  const c = datos.cifras; if (!c) return;
  for (const k of ['km2_total', 'km2_aysen', 'km2_magallanes', 'n_comunas', 'km2_glaciar']) if (c[k] != null) pintarCifra(k, c[k]);
  if (c.pct_chile != null) pintarCifra('pct_chile', `un ${Math.round(c.pct_chile)} %`);
  if (c.pct_protegido != null) pintarCifra('pct_protegido', `el ${Math.round(c.pct_protegido)} %`);
});

/* ------------------------------------------------------------------ estadísticas en vivo */
let estad = { total: 0, meta: 100000, comunas: [] };
let inicioAsamblea = Date.parse('2026-12-05T19:00:00-03:00');
function cuentaMini() {
  const f = Math.max(0, inicioAsamblea - Date.now());
  const pon = (k, v) => { const el = document.querySelector(`[data-cm="${k}"]`); if (el) el.textContent = String(v).padStart(2, '0'); };
  pon('d', Math.floor(f / 864e5)); pon('h', Math.floor(f / 36e5) % 24); pon('m', Math.floor(f / 6e4) % 60);
}
setInterval(cuentaMini, 20000); cuentaMini();
async function cargarEstadisticas() {
  try { estad = await json(API + 'estadisticas.php'); } catch (e) { console.warn('estadísticas', e); }
  const { total, meta } = estad;
  // Mientras haya menos de 100 socios confirmados, la cifra grande es la comunidad de Instagram (rotulada como tal);
  // la barra de la meta y el resto del sitio siempre usan solo inscritos reales.
  await pDatos;
  const ig = datos.cifras?.comunidad_instagram || 0, primeros = ig && total < 100;
  pintarCifra('total', primeros ? ig : total, true);
  const rot = $('[data-cifra-rotulo]'); if (rot) rot.textContent = primeros ? 'personas en nuestra comunidad de Instagram' : 'chilenos ya se sumaron';
  const com = $('[data-comunidad]');
  if (com && ig) {
    com.hidden = false;
    com.innerHTML = primeros
      ? (total === 0 ? 'Inscripciones abiertas · sé de los primeros 1.000 socios fundadores'
        : `<b>${fmt(total)}</b> ${total === 1 ? 'socio fundador inscrito' : 'socios fundadores inscritos'} aquí · sé de los primeros 1.000`)
      : `y <b>${fmt(ig)}</b> en nuestra comunidad de Instagram`;
  }
  pintarCifra('meta', meta);
  pintarCifra('falta', total >= meta ? '¡Meta cumplida!' : `faltan ${fmt(meta - total)}`);
  $('[data-barra]').style.width = Math.min(100, total / meta * 100) + '%';
  if (estad.asamblea) inicioAsamblea = estad.asamblea.inicio_ts * 1000;
  if (estad.fondo) pintarFondo(estad.fondo);
  $$('.desb').forEach(d => {
    const u = Number(d.dataset.umbral), k = Math.min(1, total / u);
    d.querySelector('.desb-barra i').style.width = (k * 100) + '%';
    d.classList.toggle('abierto', total >= u);
  });
  await pDatos;
  pintarRanking();
  pintarMapaChile();
  if (miniOcup) pintarMini();
}
cargarEstadisticas();
setInterval(cargarEstadisticas, 60000);

let ordenRanking = 'habitante', miRegion = null;
function poblacionRegiones() {
  if (datos.pobReg) return datos.pobReg;
  const m = new Map(); for (const c of datos.comunas || []) m.set(c.r, (m.get(c.r) || 0) + (c.p || 0));
  return (datos.pobReg = m);
}
function filasRegiones() {
  const ins = porRegionDesde(estad.comunas), pob = poblacionRegiones();
  return ORDEN_REGIONES.map(r => ({ r, n: ins.get(r) || 0, tasa: pob.get(r) ? (ins.get(r) || 0) / pob.get(r) * 1e4 : 0 }));
}
function pintarRanking() {
  const ol = $('#ranking');
  if (!estad.total) { ol.innerHTML = '<li class="vacio">Aún no hay inscritos confirmados. Sé el primero de tu región.</li>'; return; }
  let filas;
  if (ordenRanking === 'comunas') {
    filas = (estad.comunas || []).filter(([cut]) => datos.porCut?.has(cut)).sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([cut, n]) => ({ nombre: datos.porCut.get(cut).n, sub: NOMBRE_REGION[datos.porCut.get(cut).r], v: n, txt: fmt(n) }));
  } else {
    const fr = filasRegiones().filter(f => f.n > 0);
    fr.sort((a, b) => ordenRanking === 'total' ? b.n - a.n : b.tasa - a.tasa);
    filas = fr.slice(0, 8).map(f => ({ nombre: NOMBRE_REGION[f.r], sub: ordenRanking === 'total' ? '' : fmt(f.n) + ' inscritos', v: ordenRanking === 'total' ? f.n : f.tasa,
      txt: ordenRanking === 'total' ? fmt(f.n) : f.tasa.toLocaleString('es-CL', { maximumFractionDigits: 1 }) + ' ‱', r: f.r }));
  }
  const max = Math.max(...filas.map(f => f.v), 1e-9);
  ol.innerHTML = filas.map(f => `<li${f.r && f.r === miRegion ? ' class="mia"' : ''}><span>${f.nombre}${f.sub ? `<span class="r-sub">${f.sub}</span>` : ''}</span><span class="n">${f.txt}</span><span class="barrita"><i style="width:${f.v / max * 100}%"></i></span></li>`).join('');
  pintarMiLugar();
}
function pintarMiLugar() {
  const el = $('#mi-lugar'); if (!miRegion) { el.hidden = true; return; }
  const fr = filasRegiones().sort((a, b) => b.tasa - a.tasa), k = fr.findIndex(f => f.r === miRegion);
  el.hidden = false;
  el.innerHTML = k === 0 ? `Tu región, <b>${NOMBRE_REGION[miRegion]}</b>, va <b>primera</b> por habitante. ¡Que no la alcancen!`
    : `Tu región, <b>${NOMBRE_REGION[miRegion]}</b>, va en el <b>lugar ${k + 1}</b> por habitante. Invita a tu gente para pasar a ${NOMBRE_REGION[fr[k - 1].r]}.`;
}
$$('.pestanas button').forEach(b => b.addEventListener('click', () => {
  ordenRanking = b.dataset.orden; $$('.pestanas button').forEach(x => x.setAttribute('aria-selected', x === b)); pintarRanking();
}));

/* ------------------------------------------------------------------ mapa del relato */
const LUGARES = [
  { n: 'Coyhaique', p: [-72.07, -45.57], en: ['territorio', 'nosotros'] },
  { n: 'Punta Arenas', p: [-70.91, -53.16], en: ['territorio', 'nosotros'] },
  { n: 'Puerto Natales', p: [-72.50, -51.73], en: ['territorio'] },
  { n: 'Cabo de Hornos', p: [-67.27, -55.98], en: ['territorio', 'protegido'] },
  { n: 'Campo de Hielo Norte', p: [-73.50, -46.90], en: ['hielo', 'protegido'] },
  { n: 'Campo de Hielo Sur', p: [-73.40, -49.60], en: ['hielo', 'protegido', 'portada'] },
  { n: 'Torres del Paine', p: [-72.98, -50.94], en: ['protegido', 'portada'] },
  { n: 'Laguna San Rafael', p: [-73.85, -46.68], en: ['hielo'], a: 'right' },
];
const CAMARAS = {
  portada: { center: [-73.25, -49.85], zoom: 7.7, pitch: 72, bearing: 28 },
  territorio: { center: [-71.6, -49.4], zoom: 4.75, pitch: 25, bearing: 0, cel: { zoom: 3.75 } },
  hielo: { center: [-73.45, -48.4], zoom: 6.15, pitch: 62, bearing: -18, cel: { zoom: 5.3 } },
  protegido: { center: [-72.4, -49.6], zoom: 5.05, pitch: 38, bearing: 8, cel: { zoom: 4.2 } },
  venta: { center: [-72.40, -41.84], zoom: 9.6, pitch: 66, bearing: 24, cel: { zoom: 8.8 } },
  nosotros: { center: [-71.8, -48.6], zoom: 5.3, pitch: 55, bearing: -10, cel: { zoom: 4.5 } },
};
// opacidad de cada capa según el capítulo
const CAPAS = {
  'regiones-tinte': { prop: 'fill-opacity', v: { territorio: .22, nosotros: .12 } },
  'comunas-borde': { prop: 'line-opacity', v: { territorio: .9, protegido: .35, nosotros: .5 } },
  'glaciares-relleno': { prop: 'fill-opacity', v: { hielo: .55, protegido: .3 } },
  'glaciares-borde': { prop: 'line-opacity', v: { hielo: .9, protegido: .4 } },
  'areas-relleno': { prop: 'fill-opacity', v: { protegido: .42 } },
  'areas-borde': { prop: 'line-opacity', v: { protegido: .95 } },
};
const ESTILO = {
  version: 8,
  sources: {
    satelite: { type: 'raster', tileSize: 256, maxzoom: 17, tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], attribution: 'Imagen © Esri, Maxar, Earthstar Geographics' },
    relieve: { type: 'raster-dem', encoding: 'terrarium', tileSize: 256, maxzoom: 13, tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'], attribution: 'Relieve: Terrain Tiles (AWS, Mapzen)' },
  },
  sky: { 'sky-color': '#121218', 'horizon-color': '#d0c8e6', 'fog-color': '#060608', 'sky-horizon-blend': .55, 'horizon-fog-blend': .65, 'fog-ground-blend': .55, 'atmosphere-blend': .8 },
  layers: [
    { id: 'fondo', type: 'background', paint: { 'background-color': '#07080c' } },
    { id: 'satelite', type: 'raster', source: 'satelite', paint: { 'raster-saturation': -.7, 'raster-contrast': .08, 'raster-brightness-max': .62, 'raster-hue-rotate': 18 } },
  ],
};

let mapa, capActual = null, marcadores = [], pinVenta;
const viento = iniciarViento($('#viento'));
function crearMapa() {
  if (!window.maplibregl) return;
  try {
    mapa = new maplibregl.Map({
      container: 'mapa', style: ESTILO, interactive: false, attributionControl: { compact: true },
      ...CAMARAS.portada, center: [-73.6, -49.9], zoom: 6.6, pitch: 60, bearing: 0, maxPitch: 80, fadeDuration: 0,
    });
  } catch (e) { console.warn('sin WebGL', e); document.body.classList.add('sin-mapa'); return; }
  mapa.on('load', async () => {
    mapa.setTerrain({ source: 'relieve', exaggeration: 1.35 });
    const capas = [
      ['regiones', 'datos/patagonia-comunas.geojson'], ['glaciares', 'datos/glaciares.geojson'], ['areas', 'datos/areas-protegidas.geojson'],
    ];
    for (const [id, url] of capas) mapa.addSource(id, { type: 'geojson', data: url });
    const T = { duration: 900 };
    mapa.addLayer({ id: 'regiones-tinte', type: 'fill', source: 'regiones', paint: { 'fill-color': ['match', ['get', 'cod'], 11, '#d9d3ec', '#e9c46a'], 'fill-opacity': 0, 'fill-opacity-transition': T } });
    mapa.addLayer({ id: 'glaciares-relleno', type: 'fill', source: 'glaciares', paint: { 'fill-color': '#dff6ff', 'fill-opacity': 0, 'fill-opacity-transition': T } });
    mapa.addLayer({ id: 'glaciares-borde', type: 'line', source: 'glaciares', paint: { 'line-color': '#d9d3ec', 'line-width': 1, 'line-opacity': 0, 'line-opacity-transition': T } });
    const colorArea = ['match', ['get', 'tipo'], 'Parque nacional', '#5fae8b', '#d4a943'];
    mapa.addLayer({ id: 'areas-relleno', type: 'fill', source: 'areas', paint: { 'fill-color': colorArea, 'fill-opacity': 0, 'fill-opacity-transition': T } });
    mapa.addLayer({ id: 'areas-borde', type: 'line', source: 'areas', paint: { 'line-color': colorArea, 'line-width': 1.4, 'line-opacity': 0, 'line-opacity-transition': T } });
    mapa.addLayer({ id: 'comunas-borde', type: 'line', source: 'regiones', paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 4, .5, 8, 1.4], 'line-opacity': 0, 'line-opacity-transition': T } });

    for (const l of LUGARES) {
      // MapLibre maneja la opacidad del elemento del marcador (relieve): se oculta un hijo interno
      const caja = document.createElement('div'), el = document.createElement('div');
      el.className = 'rotulo' + (l.a === 'right' ? ' rotulo-izq' : ''); el.textContent = l.n; el.style.opacity = 0; caja.append(el);
      marcadores.push({ l, el, m: new maplibregl.Marker({ element: caja, anchor: l.a || 'left' }).setLngLat(l.p).addTo(mapa) });
    }
    const cajaPv = document.createElement('div'), pv = document.createElement('div');
    pv.innerHTML = '<div class="pin-venta"></div><div class="pin-venta-txt">En venta · 25.468 ha<br><small>lago Cabrera y volcán Yate</small></div>';
    pv.style.cssText = 'display:flex;flex-direction:column;align-items:center;opacity:0;transition:opacity .8s'; cajaPv.append(pv);
    pinVenta = { el: pv, m: new maplibregl.Marker({ element: cajaPv, anchor: 'top' }).setLngLat([-72.40, -41.84]).addTo(mapa) };
    document.querySelector('#mapa .maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
    irA(capActual || 'portada', true);
  });
}

function relleno() {
  const w = innerWidth, h = innerHeight;
  return esCelular() ? { top: 60, bottom: Math.round(h * .42), left: 10, right: 10 } : { top: 70, bottom: 40, left: Math.round(Math.min(w * .42, 640)), right: 40 };
}

function irA(cap, inmediato) {
  capActual = cap;
  document.body.classList.toggle('cap-portada', cap === 'portada');
  const conViento = cap !== 'portada'; document.body.classList.toggle('con-viento', conViento); viento.activar(conViento);
  if (!mapa || !mapa.isStyleLoaded()) return;
  const c = { ...CAMARAS[cap], ...(esCelular() ? CAMARAS[cap].cel : {}) }; delete c.cel;
  mapa.stop();
  const opts = { ...c, padding: relleno(), essential: true };
  if (inmediato || sinMovimiento) mapa.jumpTo(opts); else mapa.flyTo({ ...opts, duration: 3600, curve: 1.3 });
  for (const [id, { prop, v }] of Object.entries(CAPAS)) if (mapa.getLayer(id)) mapa.setPaintProperty(id, prop, v[cap] ?? 0);
  for (const { l, el } of marcadores) el.style.opacity = l.en.includes(cap) ? 1 : 0;
  if (pinVenta) pinVenta.el.style.opacity = cap === 'venta' ? 1 : 0;
  if (cap === 'portada') setTimeout(orbitar, inmediato ? 50 : 3700);
}
function orbitar() {
  if (capActual !== 'portada' || sinMovimiento || !mapa) return;
  mapa.easeTo({ bearing: mapa.getBearing() + 40, duration: 40000, easing: t => t });
}
crearMapa();
iniciarHistoria().catch(e => console.warn('historia', e));
mapa?.on('moveend', () => { if (capActual === 'portada') orbitar(); });

// capítulos: el que cruza el centro de la pantalla manda
const obs = new IntersectionObserver(es => {
  for (const e of es) {
    e.target.classList.toggle('visible', e.isIntersecting);
    if (e.isIntersecting && e.target.dataset.camara !== capActual) irA(e.target.dataset.camara);
  }
}, { rootMargin: '-45% 0px -45% 0px' });
$$('.capitulo').forEach(c => obs.observe(c));
// ocultar el mapa fijo cuando ya no se ve (ahorra batería)
const finRelato = $('#como');
addEventListener('scroll', () => {
  const fuera = finRelato.getBoundingClientRect().top < innerHeight * .2;
  viento.activar(!fuera && capActual !== 'portada');
  if (fuera !== document.body.classList.contains('fuera-relato')) document.body.classList.toggle('fuera-relato', fuera);
}, { passive: true });
addEventListener('resize', () => capActual && irA(capActual, true));

/* ------------------------------------------------------------------ mapa de inscritos: regiones que se encienden y arcos hacia el sur */
let mapaChile, chileListo = false, pasoArco = 0;
const DESTINO = [-73.2, -49.2];
const ESCALA = ['#141625', '#272b52', '#4b53a8', '#b89cff', '#7fe0d4', '#fff1d6'];
function centroRegion(r) {
  let sx = 0, sy = 0, sp = 0;
  for (const c of datos.comunas || []) if (c.r === r && c.p) { sx += c.x * c.p; sy += c.y * c.p; sp += c.p; }
  return sp ? [sx / sp, sy / sp] : null;
}
function arco(a, b, n = 48) {
  const m = [(a[0] + b[0]) / 2 - 7 - Math.abs(a[1] - b[1]) * .12, (a[1] + b[1]) / 2];   // se curva sobre el Pacífico
  return Array.from({ length: n + 1 }, (_, i) => { const t = i / n, u = 1 - t; return [u * u * a[0] + 2 * u * t * m[0] + t * t * b[0], u * u * a[1] + 2 * u * t * m[1] + t * t * b[1]]; });
}
const SECUENCIA = [[0, 4, 3], [.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5], [2, 4, 1], [2.5, 4, .5], [3, 4, 0], [0, .5, 3, 3.5], [0, 1, 3, 3], [0, 1.5, 3, 2.5], [0, 2, 3, 2], [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, .5]];
function crearMapaChile() {
  if (!window.maplibregl) return;
  mapaChile = new maplibregl.Map({
    container: 'mapa-chile', attributionControl: false, dragRotate: false, pitchWithRotate: false, scrollZoom: false, touchPitch: false, dragPan: false, doubleClickZoom: false,
    style: { version: 8, sources: {}, layers: [{ id: 'f', type: 'background', paint: { 'background-color': 'rgba(0,0,0,0)' } }] },
    bounds: [[-84, -56.2], [-64, -17.4]], fitBoundsOptions: { padding: 16 },
  });
  mapaChile.touchZoomRotate.disable();
  mapaChile.on('load', () => {
    mapaChile.addSource('regiones', { type: 'geojson', data: 'datos/chile-regiones.geojson', promoteId: 'cod' });
    mapaChile.addSource('arcos', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    mapaChile.addSource('focos', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    const k = ['coalesce', ['feature-state', 'k'], 0];
    mapaChile.addLayer({ id: 'reg', type: 'fill', source: 'regiones', paint: { 'fill-color': ['interpolate', ['linear'], k, 0, ESCALA[0], .15, ESCALA[1], .35, ESCALA[2], .6, ESCALA[3], .85, ESCALA[4], 1, ESCALA[5]], 'fill-opacity': .92 } });
    mapaChile.addLayer({ id: 'reg-halo', type: 'line', source: 'regiones', paint: { 'line-color': ['interpolate', ['linear'], k, 0, 'rgba(217,211,236,0)', 1, 'rgba(255,241,204,.7)'], 'line-width': 6, 'line-blur': 6 } });
    mapaChile.addLayer({ id: 'reg-b', type: 'line', source: 'regiones', paint: { 'line-color': '#07080c', 'line-width': .8 } });
    mapaChile.addLayer({ id: 'arcos-base', type: 'line', source: 'arcos', layout: { 'line-cap': 'round' }, paint: { 'line-color': '#e9c46a', 'line-opacity': .18, 'line-width': ['get', 'w'] } });
    mapaChile.addLayer({ id: 'arcos-flujo', type: 'line', source: 'arcos', layout: { 'line-cap': 'round' }, paint: { 'line-color': '#fff1cc', 'line-opacity': .85, 'line-width': ['get', 'w'], 'line-dasharray': SECUENCIA[0] } });
    mapaChile.addLayer({ id: 'focos', type: 'circle', source: 'focos', paint: { 'circle-radius': ['get', 'r'], 'circle-color': '#fff1cc', 'circle-blur': .8, 'circle-opacity': .55 } });
    mapaChile.addLayer({ id: 'destino', type: 'circle', source: { type: 'geojson', data: { type: 'Point', coordinates: DESTINO } }, paint: { 'circle-radius': 14, 'circle-color': '#d9d3ec', 'circle-blur': 1, 'circle-opacity': .8 } });
    const pop = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'pop-chile' });
    mapaChile.on('mousemove', 'reg', e => {
      const r = e.features[0].properties.cod, f = filasRegiones().find(x => x.r === r);
      pop.setLngLat(e.lngLat).setHTML(`<b>${NOMBRE_REGION[r]}</b><br>${fmt(f?.n || 0)} inscritos · ${(f?.tasa || 0).toLocaleString('es-CL', { maximumFractionDigits: 1 })} por 10 mil hab.`).addTo(mapaChile);
    });
    mapaChile.on('mouseleave', 'reg', () => pop.remove());
    chileListo = true; pintarMapaChile();
    if (!sinMovimiento) setInterval(() => { pasoArco = (pasoArco + 1) % SECUENCIA.length; mapaChile.setPaintProperty('arcos-flujo', 'line-dasharray', SECUENCIA[pasoArco]); }, 70);
  });
}
function pintarMapaChile() {
  if (!chileListo || !datos.comunas) return;
  const fr = filasRegiones(), maxT = Math.max(...fr.map(f => f.tasa), 1e-9), maxN = Math.max(...fr.map(f => f.n), 1);
  for (const f of fr) mapaChile.setFeatureState({ source: 'regiones', id: f.r }, { k: Math.sqrt(f.tasa / maxT) });
  const arcos = [], focos = [];
  for (const f of fr) {
    const c = centroRegion(f.r); if (!c || !f.n) continue;
    focos.push({ type: 'Feature', properties: { r: 4 + 10 * Math.sqrt(f.n / maxN) }, geometry: { type: 'Point', coordinates: c } });
    if (f.r === 11 || f.r === 12) continue;
    arcos.push({ type: 'Feature', properties: { w: .6 + 2.6 * Math.sqrt(f.n / maxN) }, geometry: { type: 'LineString', coordinates: arco(c, DESTINO) } });
  }
  mapaChile.getSource('arcos').setData({ type: 'FeatureCollection', features: arcos });
  mapaChile.getSource('focos').setData({ type: 'FeatureCollection', features: focos });
}
new IntersectionObserver(([e], o) => { if (e.isIntersecting) { crearMapaChile(); o.disconnect(); } }, { rootMargin: '400px' }).observe($('#mapa-chile'));

/* ------------------------------------------------------------------ anticipo de la Asamblea (hemiciclo 2D) */
const SALA = trazar(100000);
const mini = $('#mini-hemiciclo');
let miniOcup = null;
function pintarMini() {
  if (!mini || !datos.comunas) return;
  const g = mini.getContext('2d'), dpr = Math.min(2, devicePixelRatio || 1), W = mini.clientWidth, H = mini.clientHeight;
  if (!W) return;
  mini.width = W * dpr; mini.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cel = W < 760, R = cel ? W * .62 : Math.min(W * .5, H * .95), cx = cel ? W / 2 : W * .7, cy = cel ? H * .52 : H * .93;
  miniOcup = ocupar(SALA, porRegionDesde(estad.comunas));
  const t = Math.max(1.1, SALA.paso * R * .62);
  g.fillStyle = 'rgba(217,211,236,.13)';
  for (let i = 0; i < SALA.n; i++) if (!miniOcup[i]) g.fillRect(cx + SALA.x[i] * R - t / 2, cy - SALA.y[i] * R - t / 2, t, t);
  g.shadowBlur = 6;
  for (const r of ORDEN_REGIONES) {
    g.fillStyle = g.shadowColor = COLOR_REGION[r];
    for (let i = 0; i < SALA.n; i++) if (miniOcup[i] === r) g.fillRect(cx + SALA.x[i] * R - t / 2, cy - SALA.y[i] * R - t / 2, t * 1.3, t * 1.3);
  }
  g.shadowBlur = 0;
  // mesa central
  const gr = g.createRadialGradient(cx, cy, 0, cx, cy, R * .22);
  gr.addColorStop(0, 'rgba(213,43,30,.55)'); gr.addColorStop(1, 'rgba(213,43,30,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, R * .22, Math.PI, 0); g.fill();
}
new IntersectionObserver(([e]) => { if (e.isIntersecting) pDatos.then(pintarMini); }, { rootMargin: '300px' }).observe(mini);
addEventListener('resize', () => { clearTimeout(pintarMini.t); pintarMini.t = setTimeout(pintarMini, 200); });

/* ------------------------------------------------------------------ títulos que se revelan */
function partirPalabras(el) {
  let i = 0;
  const recorrer = n => {
    for (const h of [...n.childNodes]) {
      if (h.nodeType === 3 && h.textContent.trim()) {
        const frag = document.createDocumentFragment();
        h.textContent.split(/(\s+)/).forEach(w => {
          if (!w.trim()) { frag.append(w); return; }
          const s = document.createElement('span'); s.className = 'palabra'; s.style.setProperty('--i', i++); s.textContent = w; frag.append(s);
        });
        h.replaceWith(frag);
      } else if (h.nodeType === 1 && !h.dataset.cifra && h.tagName !== 'BR') recorrer(h);
      else if (h.nodeType === 1 && h.dataset.cifra) { h.classList.add('palabra'); h.style.setProperty('--i', i++); }
    }
  };
  recorrer(el); el.classList.add('revela');
}
if (!sinMovimiento) {
  const obsT = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visto'); obsT.unobserve(e.target); } }), { threshold: .3 });
  $$('.titulo-bloque, .tarjeta h2').forEach(h => { partirPalabras(h); obsT.observe(h); });
}

/* ------------------------------------------------------------------ autocompletar comuna */
const sinTildes = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const REGIONES = { 15: 'Arica y Parinacota', 1: 'Tarapacá', 2: 'Antofagasta', 3: 'Atacama', 4: 'Coquimbo', 5: 'Valparaíso', 13: 'Metropolitana', 6: "O'Higgins", 7: 'Maule', 16: 'Ñuble', 8: 'Biobío', 9: 'Araucanía', 14: 'Los Ríos', 10: 'Los Lagos', 11: 'Aysén', 12: 'Magallanes' };
const inCom = $('#f-comuna'), inCut = $('#f-comuna-cut'), lista = $('#f-comuna-lista');
let opciones = [], sel = -1;
function mostrarSugerencias() {
  const q = sinTildes(inCom.value.trim());
  inCut.value = '';
  if (!q || !datos.comunas) { lista.hidden = true; inCom.setAttribute('aria-expanded', 'false'); return; }
  opciones = datos.comunas.filter(c => sinTildes(c.n).includes(q))
    .sort((a, b) => sinTildes(a.n).indexOf(q) - sinTildes(b.n).indexOf(q) || a.n.localeCompare(b.n)).slice(0, 8);
  // coincidencia exacta: se acepta sin elegir
  const exacta = opciones.find(c => sinTildes(c.n) === q); if (exacta) inCut.value = exacta.c;
  sel = -1;
  lista.innerHTML = opciones.map((c, i) => `<li role="option" id="op-${i}" data-i="${i}">${c.n}<small>${REGIONES[c.r] || ''}</small></li>`).join('') || '<li aria-disabled="true">Sin coincidencias</li>';
  lista.hidden = false; inCom.setAttribute('aria-expanded', 'true');
}
function elegir(i) {
  const c = opciones[i]; if (!c) return;
  inCom.value = c.n; inCut.value = c.c; lista.hidden = true; inCom.setAttribute('aria-expanded', 'false'); inCom.removeAttribute('aria-invalid');
}
inCom.addEventListener('input', mostrarSugerencias);
inCom.addEventListener('keydown', e => {
  if (lista.hidden) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault(); sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + opciones.length) % opciones.length;
    $$('li', lista).forEach((li, i) => li.setAttribute('aria-selected', i === sel)); inCom.setAttribute('aria-activedescendant', 'op-' + sel);
  } else if (e.key === 'Enter' && sel >= 0) { e.preventDefault(); elegir(sel); }
  else if (e.key === 'Escape') lista.hidden = true;
});
lista.addEventListener('mousedown', e => { const li = e.target.closest('li[data-i]'); if (li) { e.preventDefault(); elegir(+li.dataset.i); } });
inCom.addEventListener('blur', () => setTimeout(() => { lista.hidden = true; if (!inCut.value && opciones.length === 1) elegir(0); }, 150));

/* ------------------------------------------------------------------ inscripción */
const form = $('#formulario'), msg = $('#form-msg');
form.actividad.addEventListener('change', () => { const d = form.actividad_detalle; d.hidden = !form.actividad.value; if (!d.hidden) d.focus(); });
const params = new URLSearchParams(location.search);
try { if (params.get('r')) localStorage.setItem('pc_ref', params.get('r').slice(0, 12)); } catch { }
const ref = () => { try { return localStorage.getItem('pc_ref') || ''; } catch { return ''; } };
let ultimoEnvio = null;

function validar(f) {
  const errores = [];
  const marcar = (el, malo) => { el.setAttribute('aria-invalid', malo); if (malo) errores.push(el); };
  marcar(f.nombre, f.nombre.value.trim().length < 3);
  marcar(f.correo, !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.correo.value.trim()));
  marcar(inCom, !inCut.value);
  if (!f.acepto.checked) errores.push(f.acepto);
  return errores;
}
async function enviar(datosForm) {
  const r = await fetch(API + 'inscribir.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datosForm) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) throw new Error(j.error || 'No pudimos registrar tu inscripción. Intenta de nuevo en un momento.');
  return j;
}
form.addEventListener('submit', async e => {
  e.preventDefault(); msg.textContent = ''; msg.className = 'form-msg';
  const errores = validar(form);
  if (errores.length) {
    msg.textContent = !inCut.value && inCom.value ? 'Elige tu comuna de la lista.' : !form.acepto.checked && errores.length === 1 ? 'Debes aceptar la política de privacidad.' : 'Revisa los campos marcados.';
    errores[0].focus(); return;
  }
  const btn = form.querySelector('button[type=submit]');
  btn.disabled = true; $('.btn-txt', btn).hidden = true; $('.btn-cargando', btn).hidden = false;
  ultimoEnvio = { nombre: form.nombre.value.trim(), correo: form.correo.value.trim().toLowerCase(), comuna: Number(inCut.value), fundador: form.fundador.checked ? 1 : 0, acepto: 1, sitio: form.sitio.value, ref: ref(), compromiso: Number(form.compromiso.value || 0), actividad: form.actividad.value, actividad_detalle: form.actividad_detalle.value.trim() };
  try {
    const j = await enviar(ultimoEnvio);
    form.hidden = true; $('#revisa').hidden = false; $('[data-correo]').textContent = ultimoEnvio.correo;
    if (j.dev_enlace) { const d = $('#dev-enlace'); d.hidden = false; d.innerHTML = `Modo desarrollo (no se envían correos): <a href="${j.dev_enlace}">${j.dev_enlace}</a>`; }
    $('#revisa').scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (err) { msg.textContent = err.message; }
  finally { btn.disabled = false; $('.btn-txt', btn).hidden = false; $('.btn-cargando', btn).hidden = true; }
});
$('#reintentar').addEventListener('click', async e => {
  if (!ultimoEnvio) return; e.target.disabled = true;
  try { await enviar(ultimoEnvio); e.target.textContent = 'Enviado de nuevo ✓'; } catch (err) { e.target.textContent = err.message; }
});

/* ------------------------------------------------------------------ bienvenida + tarjeta */
const modal = $('#bienvenida');
document.body.append(modal); // fuera de <main> para quedar sobre la barra
modal.addEventListener('click', e => { if (e.target === modal || e.target.closest('[data-cerrar]')) cerrarModal(); });
addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) cerrarModal(); });
function cerrarModal() { modal.hidden = true; document.body.style.overflow = ''; history.replaceState(null, '', location.pathname); }

async function bienvenida(token) {
  let s;
  try { s = await json(API + 'socio.php?t=' + encodeURIComponent(token)); } catch { return; }
  if (!s.ok) return;
  await pDatos;
  const comuna = datos.porCut?.get(s.comuna)?.n || '';
  try { localStorage.setItem('pc_token', token); } catch { }
  miSocio = s;
  let pendiente = 0; try { pendiente = Number(localStorage.getItem('pc_compromiso') || 0); localStorage.removeItem('pc_compromiso'); } catch { }
  if (pendiente >= 1000 && !s.compromiso) { const rc = await comprometer(pendiente); if (rc.ok) s.compromiso = pendiente; }
  $('#bv-compromiso').hidden = !!s.compromiso;
  $$('[data-bv]').forEach(b => b.onclick = async () => {
    const rc = await comprometer(+b.dataset.bv);
    if (rc.ok) { s.compromiso = +b.dataset.bv; $('#bv-compromiso').innerHTML = `<p>Gracias. Quedó tu compromiso de <b>$${fmt(s.compromiso)} al mes</b> (aún no se cobra).</p>`; await dibujarTarjeta($('#tarjeta'), { numero: s.numero, comuna: datos.porCut?.get(s.comuna)?.n || '', nombre: s.nombre.split(' ')[0], compromiso: s.compromiso }); }
  });
  miRegion = s.region || regionDeComuna(s.comuna); pintarRanking();
  $('#c-asiento').href = 'asamblea.html?s=' + encodeURIComponent(token);
  $('[data-socio-n]').textContent = fmt(s.numero);
  $('[data-socio-nombre]').textContent = s.nombre.split(' ')[0];
  $('[data-socio-invitados]').textContent = fmt(s.invitados || 0);
  const enlace = `${location.origin}${location.pathname}?r=${s.codigo}`;
  $('#c-enlace').textContent = enlace;
  const texto = `Me sumé a Patagonia Chilena: soy el chileno n.º ${fmt(s.numero)} que quiere recuperar la Patagonia formando una cooperativa ciudadana. Es gratis, súmate tú también 👉 ${enlace}`;
  $('#c-whatsapp').href = 'https://wa.me/?text=' + encodeURIComponent(texto);
  $('#c-copiar').onclick = async () => { try { await navigator.clipboard.writeText(enlace); $('#c-copiar').textContent = '¡Enlace copiado!'; } catch { prompt('Copia tu enlace:', enlace); } };
  modal.hidden = false; document.body.style.overflow = 'hidden';
  const canvas = $('#tarjeta');
  await dibujarTarjeta(canvas, { numero: s.numero, comuna, nombre: s.nombre.split(' ')[0], compromiso: s.compromiso });
  $('#c-compartir').onclick = () => canvas.toBlob(async b => {
    const archivo = new File([b], `patagonia-chilena-${s.numero}.png`, { type: 'image/png' });
    if (navigator.canShare?.({ files: [archivo] })) { try { await navigator.share({ files: [archivo], text: texto }); return; } catch { } }
    const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = archivo.name; a.click();
  }, 'image/png');
  cargarEstadisticas();
}

async function dibujarTarjeta(cv, { numero, comuna, nombre, compromiso }) {
  try { await Promise.all(['400 120px "Instrument Serif"', 'italic 400 80px "Instrument Serif"', '600 30px Geist', '500 26px "Geist Mono"'].map(f => document.fonts.load(f))); } catch { }
  const g = cv.getContext('2d'), W = cv.width, H = cv.height, AZUL = '#6f5bd6', ROJO = '#d52b1e', NIEVE = '#f8f6f0', ORO = '#f5c98a';
  // fondo azul turquí
  g.fillStyle = '#050609'; g.fillRect(0, 0, W, H);
  for (const [x, y, r, c] of [[W * .1, H * .12, 620, '123,134,255'], [W * .95, H * .45, 560, '79,216,198'], [W * .35, H * 1.02, 600, '255,107,107'], [W * .7, H * .05, 380, '255,255,255']]) {
    const rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, `rgba(${c},${c === '255,255,255' ? .10 : .42})`); rg.addColorStop(1, `rgba(${c},0)`);
    g.fillStyle = rg; g.fillRect(0, 0, W, H);
  }
  // trama de seguridad tipo billete (guilloché)
  g.save(); g.globalAlpha = .13; g.strokeStyle = '#d9d3ec'; g.lineWidth = 1;
  for (let k = 0; k < 46; k++) {
    g.beginPath();
    for (let x = 0; x <= W; x += 6) { const y = 230 + k * 24 + Math.sin(x / 70 + k * .35) * 14 + Math.sin(x / 23 + k) * 4; x ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
  }
  // roseta simétrica alrededor del sello
  const cxR = W - 190, cyR = H - 250;
  g.globalAlpha = .22;
  for (let k = 0; k < 14; k++) {
    g.beginPath();
    for (let t = 0; t <= Math.PI * 2 + .005; t += .005) { const rr = 150 + 22 * Math.sin(12 * t) * Math.cos(k * .22) + k * 4; const x = cxR + rr * Math.cos(t + k * .045), y = cyR + rr * Math.sin(t + k * .045); t ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
  }
  g.restore();
  // silueta de la Patagonia
  try {
    const geo = datos.patagonia || (datos.patagonia = await json('datos/patagonia-comunas.geojson'));
    const bb = [-76, -56.2, -66.3, -43.6], k = Math.cos(50 * Math.PI / 180), alto = H * .62, esc = alto / (bb[3] - bb[1]);
    const x0 = W - (bb[2] - bb[0]) * k * esc - 40, y0 = H * .3;
    const P = ([x, y]) => [x0 + (x - bb[0]) * k * esc, y0 + (bb[3] - y) * esc];
    g.save(); g.globalAlpha = .55;
    for (const ft of geo.features) {
      const polys = ft.geometry.type === 'Polygon' ? [ft.geometry.coordinates] : ft.geometry.coordinates;
      g.beginPath();
      for (const pol of polys) for (const an of pol) an.forEach((c, i) => { const [x, y] = P(c); i ? g.lineTo(x, y) : g.moveTo(x, y); });
      g.fillStyle = 'rgba(217,211,236,.10)'; g.fill('evenodd'); g.strokeStyle = 'rgba(248,246,240,.35)'; g.lineWidth = 1.1; g.stroke();
    }
    g.restore();
  } catch { }
  const vel = g.createLinearGradient(0, 0, W * .8, 0); vel.addColorStop(0, 'rgba(5,6,9,.75)'); vel.addColorStop(1, 'rgba(5,6,9,0)');
  g.fillStyle = vel; g.fillRect(0, 0, W, H);
  // bandera arriba
  const franja = g.createLinearGradient(0, 0, W, 0); franja.addColorStop(0, 'rgba(203,184,255,.9)'); franja.addColorStop(.5, 'rgba(238,243,255,.9)'); franja.addColorStop(1, 'rgba(255,122,107,.9)');
  g.fillStyle = franja; g.fillRect(0, 0, W, 10);
  g.save(); g.shadowColor = '#fff'; g.shadowBlur = 30; estrella(g, W - 110, 120, 26, '#ffffff'); g.restore();
  // encabezado
  const M = 86;
  g.fillStyle = '#cbb8ff'; g.font = '500 25px "Geist Mono"'; g.fillText('MOVIMIENTO CIUDADANO · PATAGONIA CHILENA', M, 150);
  g.fillStyle = NIEVE; g.font = '400 64px "Instrument Serif"'; g.fillText('Socio fundador', M, 236);
  g.fillStyle = ORO; g.font = '500 24px "Geist Mono"'; g.fillText('N.º DE SERIE  PAT-2026-' + String(numero).padStart(6, '0'), M, 286);
  // número
  g.fillStyle = NIEVE; g.font = '400 60px "Instrument Serif"'; g.fillText('Soy el chileno', M, 470);
  g.font = '400 60px "Instrument Serif"'; g.fillText('n.º', M, 690);
  g.fillStyle = ORO; g.font = `italic 400 ${numero > 99999 ? 170 : 210}px "Instrument Serif"`; g.fillText(fmt(numero), M + 96, 690);
  g.fillStyle = NIEVE; g.font = '400 60px "Instrument Serif"';
  ['que recupera la Patagonia', 'para todos los chilenos.'].forEach((t, i) => g.fillText(t, M, 800 + i * 68));
  g.fillStyle = 'rgba(248,246,240,.75)'; g.font = '600 30px Geist';
  if (comuna) g.fillText(`${nombre} · ${comuna}`, M, 975);
  if (compromiso) { g.fillStyle = ORO; g.font = '500 25px "Geist Mono"'; g.fillText(`★ FONDO PATAGONIA · $${fmt(compromiso)} AL MES`, M, 1025); }
  // sello con estrella
  sello(g, W - 190, H - 250, 110);
  const bt = g.createLinearGradient(M, 0, M + 560, 0); bt.addColorStop(0, '#ff7a6b'); bt.addColorStop(.6, '#ff5f8f'); bt.addColorStop(1, '#c47bff'); g.fillStyle = bt; roundRect(g, M, 1110, 560, 96, 48); g.fill();
  g.fillStyle = '#fff'; g.font = '700 36px Geist'; g.fillText('patagoniadechile.cl', M + 52, 1171);
  g.fillStyle = 'rgba(248,246,240,.55)'; g.font = '500 23px "Geist Mono"'; g.fillText('Súmate gratis · cooperativa ciudadana', M, 1268);
}
function estrella(g, cx, cy, r, color) {
  g.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * .4 : r; g.lineTo(cx + rr * Math.cos(a), cy + rr * Math.sin(a)); }
  g.closePath(); g.fillStyle = color; g.fill();
}
function sello(g, cx, cy, r) {
  g.save();
  g.strokeStyle = 'rgba(233,196,106,.85)'; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.stroke();
  g.lineWidth = 1.2; g.beginPath(); g.arc(cx, cy, r - 12, 0, 7); g.stroke();
  g.beginPath(); g.arc(cx, cy, r - 44, 0, 7); g.stroke();
  estrella(g, cx, cy, r - 56, '#e9c46a');
  const txt = 'COOPERATIVA CIUDADANA · PATAGONIA CHILENA · ';
  g.fillStyle = '#e9c46a'; g.font = '600 17px Geist'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let i = 0; i < txt.length; i++) {
    const a = -Math.PI / 2 + i / txt.length * Math.PI * 2;
    g.save(); g.translate(cx + (r - 28) * Math.cos(a), cy + (r - 28) * Math.sin(a)); g.rotate(a + Math.PI / 2); g.fillText(txt[i], 0, 0); g.restore();
  }
  g.restore();
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

if (params.get('s')) bienvenida(params.get('s'));
else { try { const t = localStorage.getItem('pc_token'); if (t) json(API + 'socio.php?t=' + encodeURIComponent(t)).then(x => { if (x.ok) { miRegion = x.region; pDatos.then(pintarRanking); } }).catch(() => { }); } catch { } }
if (params.get('error') === 'enlace') { msg.textContent = 'Ese enlace ya no es válido. Inscríbete de nuevo y te enviamos otro.'; $('#sumate').scrollIntoView(); }

/* ------------------------------------------------------------------ Fondo Patagonia: compromiso mensual (aún no se cobra) */
let miSocio = null, montoElegido = 0;
const CLP_HA_DEF = 280000;
function m2Anuales(monto, clpHa) { return monto * 12 / clpHa * 10000; }
function pintarFondo(fd) {
  const clpHa = fd.clp_por_ha || CLP_HA_DEF;
  const pon = (k, v) => $$(`[data-fondo="${k}"]`).forEach(el => el.textContent = v);
  pon('mensual', '$' + fmt(fd.mensual)); pon('personas', fmt(fd.personas));
  pon('ha_anio', fmt(Math.round(fd.mensual * 12 / clpHa))); pon('m2', fmt(Math.round(m2Anuales(1000, clpHa))));
  fondoClpHa = clpHa;
}
let fondoClpHa = CLP_HA_DEF;
async function comprometer(monto) {
  let t = null; try { t = localStorage.getItem('pc_token'); } catch { }
  if (!t) return { ok: false, sinToken: true };
  const r = await fetch(API + 'participar.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ t, accion: 'compromiso', monto }) });
  const j = await r.json().catch(() => ({ ok: false, error: 'Error de conexión' }));
  if (j.ok) cargarEstadisticas();
  return j;
}
function elegirMonto(m) {
  montoElegido = m >= 1000 ? Math.round(m) : 0;
  $$('#fondo .monto[data-monto]').forEach(b => b.setAttribute('aria-pressed', +b.dataset.monto === montoElegido));
  const eq = $('#fondo-equivale'), btn = $('#b-comprometer');
  btn.disabled = !montoElegido;
  if (!montoElegido) { eq.textContent = m ? 'El mínimo es $1.000 al mes.' : 'Elige un monto para ver cuánta Patagonia significa.'; return; }
  const m2 = Math.round(m2Anuales(montoElegido, fondoClpHa));
  eq.innerHTML = `Con <b>$${fmt(montoElegido)} al mes</b> aportas cerca de <b>${fmt(m2)} m² de Patagonia al año</b>. Si 100.000 chilenos hacen lo mismo, son <b>${fmt(Math.round(montoElegido * 1e5 * 12 / fondoClpHa))} hectáreas al año</b>.`;
}
$$('#fondo .monto[data-monto]').forEach(b => b.addEventListener('click', () => { $('#monto-otro').value = ''; elegirMonto(+b.dataset.monto); }));
$('#monto-otro').addEventListener('input', e => elegirMonto(+e.target.value));
$('#b-comprometer').addEventListener('click', async () => {
  const msg = $('#fondo-msg'); msg.className = 'form-msg'; msg.textContent = '';
  const r = await comprometer(montoElegido);
  if (r.ok) { msg.className = 'form-msg ok'; msg.textContent = `¡Gracias! Quedó tu compromiso de $${fmt(montoElegido)} al mes. Aún no se cobra.`; return; }
  if (r.sinToken) {
    try { localStorage.setItem('pc_compromiso', montoElegido); } catch { }
    const sel = $('#f-compromiso');
    if (![...sel.options].some(o => +o.value === montoElegido)) sel.add(new Option(`$${fmt(montoElegido)} al mes`, montoElegido));
    sel.value = montoElegido;
    msg.className = 'form-msg ok'; msg.textContent = 'Inscríbete abajo: tu compromiso quedará registrado al confirmar tu correo.';
    setTimeout(() => $('#sumate').scrollIntoView({ behavior: sinMovimiento ? 'auto' : 'smooth' }), 600);
    return;
  }
  msg.textContent = r.error || 'No se pudo registrar.';
});
iniciarRelieve('.tarjeta-in, .paso, .desb, .principios li, .fondo-panel, .formulario');
iniciarParalaje({
  paralaje: [['.titulo-bloque', .07], ['.antetitulo', .12], ['.lead', .04], ['.pasos', .03], ['.desbloqueos', .035], ['.principios', .05],
             ['.fondo-montos', .03], ['.portada-txt', .05], ['.condor', -.25], ['.cuenta-mini', .08], ['.mapa-chile-marco', .025]],
  revelar: ['.paso', '.desb', '.principios li', '.faq details', '.fondo-panel', '.monto', '.check li', '.formulario'],
});

/* ------------------------------------------------------------------ botón «Socios»: si ya entró en este equipo, va directo; si no, pide su acceso por correo */
{
  const modal = document.getElementById('modal-socios'), f = document.getElementById('f-socios'), msg = document.getElementById('ms-msg');
  const abrir = () => { modal.hidden = false; msg.textContent = ''; msg.classList.remove('mal'); setTimeout(() => f.correo.focus(), 50); };
  const cerrar = () => { modal.hidden = true; };
  document.getElementById('b-socios').addEventListener('click', async () => {
    let t = null; try { t = localStorage.getItem('pc_token'); } catch { }
    if (t) {
      try { const s = await json(API + 'socio.php?t=' + encodeURIComponent(t)); if (s.ok) { bienvenida(t); return; } } catch { }
      try { localStorage.removeItem('pc_token'); } catch { }
    }
    abrir();
  });
  modal.addEventListener('click', e => { if (e.target === modal || e.target.closest('[data-cerrar]')) cerrar(); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) cerrar(); });
  f.addEventListener('submit', async e => {
    e.preventDefault(); msg.classList.remove('mal');
    if (!f.correo.checkValidity()) { msg.classList.add('mal'); msg.textContent = 'Escribe un correo válido.'; return; }
    const b = f.querySelector('button'); b.disabled = true; msg.textContent = 'Enviando…';
    let d; try { d = await (await fetch(API + 'acceso.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ correo: f.correo.value, sitio: f.sitio.value }) })).json(); } catch { d = { ok: false }; }
    b.disabled = false;
    if (!d.ok) { msg.classList.add('mal'); msg.textContent = d.error || 'No se pudo enviar. Intenta en un rato.'; return; }
    msg.textContent = 'Listo. Si ese correo está inscrito, te llegará tu enlace en unos minutos (revisa también spam). Si no te llega, puede que aún no te hayas inscrito.';
    if (d.dev_enlace) msg.innerHTML += ' <a href="' + d.dev_enlace + '" style="color:inherit">(desarrollo) abrir</a>';
  });
}
