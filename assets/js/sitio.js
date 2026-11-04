// Patagonia Chilena · relato con mapa, contador, mapa de inscritos e inscripción
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
async function cargarEstadisticas() {
  try { estad = await json(API + 'estadisticas.php'); } catch (e) { console.warn('estadísticas', e); }
  const { total, meta } = estad;
  pintarCifra('total', total, true);
  pintarCifra('meta', meta);
  pintarCifra('falta', total >= meta ? '¡Meta cumplida!' : `faltan ${fmt(meta - total)}`);
  $('[data-barra]').style.width = Math.min(100, total / meta * 100) + '%';
  $$('.desb').forEach(d => {
    const u = Number(d.dataset.umbral), k = Math.min(1, total / u);
    d.querySelector('.desb-barra i').style.width = (k * 100) + '%';
    d.classList.toggle('abierto', total >= u);
  });
  await pDatos;
  pintarRanking();
  pintarMapaChile();
}
cargarEstadisticas();
setInterval(cargarEstadisticas, 60000);

function pintarRanking() {
  const lista = (estad.comunas || []).filter(([cut]) => datos.porCut?.has(cut)).sort((a, b) => b[1] - a[1]);
  pintarCifra('n_comunas_con', `${fmt(lista.length)} de 346 comunas`);
  const ol = $('#ranking');
  if (!lista.length) { ol.innerHTML = '<li class="vacio">Aún no hay inscritos confirmados. Sé el primero de tu comuna.</li>'; }
  else {
    const max = lista[0][1];
    ol.innerHTML = lista.slice(0, 8).map(([cut, n]) => {
      const c = datos.porCut.get(cut);
      return `<li><span>${c.n}</span><span class="n">${fmt(n)}</span><span class="barrita"><i style="width:${n / max * 100}%"></i></span></li>`;
    }).join('');
  }
  // barras por región, de norte a sur
  const orden = [15, 1, 2, 3, 4, 5, 13, 6, 7, 16, 8, 9, 14, 10, 11, 12];
  const porReg = new Map(orden.map(r => [r, 0]));
  for (const [cut, n] of estad.comunas || []) { const c = datos.porCut?.get(cut); if (c) porReg.set(c.r, porReg.get(c.r) + n); }
  const maxR = Math.max(1, ...porReg.values());
  $('#regiones-barras').innerHTML = orden.map(r => `<div class="${r >= 11 && r <= 12 ? 'sur' : ''}" style="height:${Math.max(4, porReg.get(r) / maxR * 100)}%" title="${fmt(porReg.get(r))} inscritos"></div>`).join('');
}

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
  sky: { 'sky-color': '#0d2a40', 'horizon-color': '#9cc4d3', 'fog-color': '#0a1c2b', 'sky-horizon-blend': .55, 'horizon-fog-blend': .65, 'fog-ground-blend': .55, 'atmosphere-blend': .8 },
  layers: [
    { id: 'fondo', type: 'background', paint: { 'background-color': '#06111b' } },
    { id: 'satelite', type: 'raster', source: 'satelite', paint: { 'raster-saturation': -.25, 'raster-contrast': .08, 'raster-brightness-max': .92 } },
  ],
};

let mapa, capActual = null, marcadores = [], pinVenta;
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
    mapa.addLayer({ id: 'regiones-tinte', type: 'fill', source: 'regiones', paint: { 'fill-color': ['match', ['get', 'cod'], 11, '#a9dbe8', '#e3c690'], 'fill-opacity': 0, 'fill-opacity-transition': T } });
    mapa.addLayer({ id: 'glaciares-relleno', type: 'fill', source: 'glaciares', paint: { 'fill-color': '#dff6ff', 'fill-opacity': 0, 'fill-opacity-transition': T } });
    mapa.addLayer({ id: 'glaciares-borde', type: 'line', source: 'glaciares', paint: { 'line-color': '#a9dbe8', 'line-width': 1, 'line-opacity': 0, 'line-opacity-transition': T } });
    const colorArea = ['match', ['get', 'tipo'], 'Parque nacional', '#5fae8b', '#c9a467'];
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
  const fuera = finRelato.getBoundingClientRect().top < 0;
  if (fuera !== document.body.classList.contains('fuera-relato')) document.body.classList.toggle('fuera-relato', fuera);
}, { passive: true });
addEventListener('resize', () => capActual && irA(capActual, true));

/* ------------------------------------------------------------------ mapa de inscritos */
let mapaChile, chileListo = false;
function crearMapaChile() {
  if (!window.maplibregl) return;
  mapaChile = new maplibregl.Map({
    container: 'mapa-chile', attributionControl: false, dragRotate: false, pitchWithRotate: false, scrollZoom: false, touchPitch: false,
    style: { version: 8, sources: {}, layers: [{ id: 'f', type: 'background', paint: { 'background-color': 'rgba(0,0,0,0)' } }] },
    bounds: [[-76.5, -56.2], [-66, -17.4]], fitBoundsOptions: { padding: 20 },
  });
  mapaChile.touchZoomRotate.disableRotation();
  mapaChile.on('load', () => {
    mapaChile.addSource('regiones', { type: 'geojson', data: 'datos/chile-regiones.geojson' });
    mapaChile.addSource('puntos', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    mapaChile.addLayer({ id: 'reg', type: 'fill', source: 'regiones', paint: { 'fill-color': ['case', ['in', ['get', 'cod'], ['literal', [11, 12]]], '#2a4a52', '#173246'], 'fill-opacity': .9 } });
    mapaChile.addLayer({ id: 'reg-b', type: 'line', source: 'regiones', paint: { 'line-color': '#a9dbe8', 'line-opacity': .25, 'line-width': .7 } });
    mapaChile.addLayer({ id: 'halo', type: 'circle', source: 'puntos', paint: { 'circle-radius': ['*', 2.4, ['get', 'r']], 'circle-color': '#e3c690', 'circle-opacity': .16, 'circle-blur': .6 } });
    mapaChile.addLayer({ id: 'pt', type: 'circle', source: 'puntos', paint: { 'circle-radius': ['get', 'r'], 'circle-color': '#e3c690', 'circle-opacity': .9, 'circle-stroke-color': '#fff', 'circle-stroke-width': .6 } });
    const pop = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'pop-chile' });
    mapaChile.on('mousemove', 'pt', e => { const p = e.features[0].properties; pop.setLngLat(e.lngLat).setHTML(`<b>${p.n}</b><br>${fmt(p.k)} inscritos`).addTo(mapaChile); mapaChile.getCanvas().style.cursor = 'pointer'; });
    mapaChile.on('mouseleave', 'pt', () => { pop.remove(); mapaChile.getCanvas().style.cursor = ''; });
    chileListo = true; pintarMapaChile();
  });
}
function pintarMapaChile() {
  if (!chileListo || !datos.porCut) return;
  const max = Math.max(1, ...(estad.comunas || []).map(x => x[1]));
  const feats = (estad.comunas || []).map(([cut, k]) => {
    const c = datos.porCut.get(cut); if (!c) return null;
    return { type: 'Feature', properties: { n: c.n, k, r: 2.5 + 11 * Math.sqrt(k / max) }, geometry: { type: 'Point', coordinates: [c.x, c.y] } };
  }).filter(Boolean);
  mapaChile.getSource('puntos').setData({ type: 'FeatureCollection', features: feats });
}
// se crea al acercarse para no competir con el mapa principal
new IntersectionObserver(([e], o) => { if (e.isIntersecting) { crearMapaChile(); o.disconnect(); } }, { rootMargin: '400px' }).observe($('#mapa-chile'));

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
  ultimoEnvio = { nombre: form.nombre.value.trim(), correo: form.correo.value.trim().toLowerCase(), comuna: Number(inCut.value), fundador: form.fundador.checked ? 1 : 0, acepto: 1, sitio: form.sitio.value, ref: ref() };
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
  await dibujarTarjeta(canvas, { numero: s.numero, comuna, nombre: s.nombre.split(' ')[0] });
  $('#c-compartir').onclick = () => canvas.toBlob(async b => {
    const archivo = new File([b], `patagonia-chilena-${s.numero}.png`, { type: 'image/png' });
    if (navigator.canShare?.({ files: [archivo] })) { try { await navigator.share({ files: [archivo], text: texto }); return; } catch { } }
    const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = archivo.name; a.click();
  }, 'image/png');
  cargarEstadisticas();
}

async function dibujarTarjeta(cv, { numero, comuna, nombre }) {
  try { await Promise.all(['500 120px Fraunces', 'italic 300 80px Fraunces', '600 30px Manrope', '500 26px "IBM Plex Mono"'].map(f => document.fonts.load(f))); } catch { }
  const g = cv.getContext('2d'), W = cv.width, H = cv.height;
  const fondo = g.createLinearGradient(0, 0, W, H); fondo.addColorStop(0, '#163d57'); fondo.addColorStop(.55, '#0a1b29'); fondo.addColorStop(1, '#06111b');
  g.fillStyle = fondo; g.fillRect(0, 0, W, H);
  // silueta de la Patagonia a la derecha
  try {
    const geo = datos.patagonia || (datos.patagonia = await json('datos/patagonia-comunas.geojson'));
    const bb = [-76, -56.2, -66.3, -43.6], k = Math.cos(50 * Math.PI / 180);
    const alto = H * .92, esc = alto / (bb[3] - bb[1]), x0 = W - (bb[2] - bb[0]) * k * esc - 10, y0 = H * .04;
    const P = ([x, y]) => [x0 + (x - bb[0]) * k * esc, y0 + (bb[3] - y) * esc];
    g.save(); g.globalAlpha = .9;
    for (const f of geo.features) {
      const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      g.beginPath();
      for (const pol of polys) for (const anillo of pol) anillo.forEach((c, i) => { const [x, y] = P(c); i ? g.lineTo(x, y) : g.moveTo(x, y); });
      g.fillStyle = f.properties.cod === 11 ? 'rgba(169,219,232,.16)' : 'rgba(227,198,144,.14)'; g.fill('evenodd');
      g.strokeStyle = 'rgba(233,242,245,.32)'; g.lineWidth = 1.2; g.stroke();
    }
    g.restore();
  } catch { }
  const vel = g.createLinearGradient(0, 0, W * .75, 0); vel.addColorStop(0, 'rgba(6,17,27,.92)'); vel.addColorStop(1, 'rgba(6,17,27,0)');
  g.fillStyle = vel; g.fillRect(0, 0, W, H);
  // texto
  const M = 86;
  g.fillStyle = '#d8261c'; g.beginPath(); g.arc(M + 9, 128, 9, 0, 7); g.fill();
  g.fillStyle = '#a9dbe8'; g.font = '500 26px "IBM Plex Mono"'; g.fillText('SOCIO FUNDADOR · ETAPA 1', M + 34, 137);
  g.fillStyle = '#e9f2f5'; g.font = '500 54px Fraunces'; g.fillText('Soy el chileno', M, 400);
  g.font = '500 54px Fraunces'; g.fillText('n.º', M, 600);
  g.fillStyle = '#e3c690'; g.font = `italic 400 ${numero > 99999 ? 170 : 210}px Fraunces`; g.fillText(fmt(numero), M + 92, 600);
  g.fillStyle = '#e9f2f5'; g.font = '500 54px Fraunces';
  ['que quiere recuperar', 'la Patagonia para', 'todos los chilenos.'].forEach((t, i) => g.fillText(t, M, 740 + i * 70));
  g.fillStyle = 'rgba(233,242,245,.7)'; g.font = '600 30px Manrope';
  if (comuna) g.fillText(`${nombre} · ${comuna}`, M, 1010);
  g.fillStyle = '#d8261c'; roundRect(g, M, 1110, 560, 96, 48); g.fill();
  g.fillStyle = '#fff'; g.font = '700 36px Manrope'; g.fillText('patagoniachilena.cl', M + 52, 1171);
  g.fillStyle = 'rgba(233,242,245,.55)'; g.font = '500 24px "IBM Plex Mono"'; g.fillText('Súmate gratis · cooperativa ciudadana', M, 1268);
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

if (params.get('s')) bienvenida(params.get('s'));
if (params.get('error') === 'enlace') { msg.textContent = 'Ese enlace ya no es válido. Inscríbete de nuevo y te enviamos otro.'; $('#sumate').scrollIntoView(); }
