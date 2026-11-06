// Panel interno de gestión de socios fundadores: mapa de Chile por comuna + lista editable.
import { NOMBRE_REGION, COLOR_REGION } from './hemiciclo.js?v=1793989779';

const $ = s => document.querySelector(s);
// el enlace ?g= se guarda en este equipo y se quita de la barra de direcciones
const enlaceG = new URLSearchParams(location.search).get('g');
if (enlaceG) { try { localStorage.setItem('pc_gestion', enlaceG); } catch { } history.replaceState(null, '', location.pathname); }
let g = enlaceG || (() => { try { return localStorage.getItem('pc_gestion') || ''; } catch { return ''; } })();
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => Number(n || 0).toLocaleString('es-CL');
const sinTilde = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const fecha = s => s ? new Date(s.replace(' ', 'T') + 'Z').toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const iniciales = n => String(n || '?').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
const region = cut => Math.floor(cut / 1000);

let SOCIOS = [], ACT = {}, COMUNAS = new Map(), PORLABEL = new Map();
const filtro = { q: '', estado: 'todos', act: '', orden: 'numero', comuna: null, region: null };
let actual = null;   // persona abierta en la ficha (null = nueva)

/* ------------------------------------------------------------------ datos */
async function api(cuerpo) {
  const r = await fetch('api/gestion.php' + (cuerpo ? '' : '?g=' + encodeURIComponent(g)), cuerpo
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ g, ...cuerpo }) }
    : { cache: 'no-store' });
  let d; try { d = await r.json(); } catch { d = { ok: false, error: 'El servidor no respondió bien. Intenta de nuevo.' }; }
  return d;
}
async function cargar() {
  const d = await api();
  if (!d.ok) { try { localStorage.removeItem('pc_gestion'); } catch { } $('#bloqueo').hidden = false; $('#bloqueo-txt').textContent = 'Tu enlace ya no es válido. Escribe tu correo y te enviamos uno nuevo.'; return false; }
  SOCIOS = d.socios; ACT = d.actividades;
  $('#app').hidden = false; $('#quien').hidden = false;
  $('#quien-nombre').textContent = 'Hola, ' + d.yo.nombre.split(' ')[0]; $('#quien-ini').textContent = iniciales(d.yo.nombre);
  $('#actualizado').textContent = 'Actualizado ' + new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) + ' · los cambios quedan registrados en la bitácora';
  return true;
}

/* ------------------------------------------------------------------ indicadores */
function pintarKpis() {
  const conf = SOCIOS.filter(s => s.numero), fund = conf.filter(s => s.fundador);
  const comunas = new Set(conf.map(s => s.comuna)), regiones = new Set(conf.map(s => region(s.comuna)));
  const mes = SOCIOS.reduce((a, s) => a + (s.compromiso || 0), 0);
  const k = [[fmt(conf.length), 'Confirmados', '#7fe0d4'], [fmt(SOCIOS.length - conf.length), 'Por confirmar', '#f5c98a'], [fmt(fund.length), 'Socios fundadores', '#cbb8ff'],
             [fmt(comunas.size), 'Comunas', '#ff7a6b'], [`${regiones.size}<small style="font-size:.5em;color:var(--niebla)">/16</small>`, 'Regiones', '#5d92b8'], ['$' + fmt(mes), 'Comprometido al mes', '#ff5f8f']];
  const pend = SOCIOS.length - conf.length;
  $('#b-recordar span').textContent = pend ? `Recordar a pendientes (${fmt(pend)})` : 'Sin pendientes';
  $('#b-recordar').disabled = !pend;
  $('#kpis').innerHTML = k.map(([v, t, c], i) => `<div class="kpi" style="--c:${c};animation-delay:${i * 60}ms"><b>${v}</b><span>${t}</span></div>`).join('');
}

/* ------------------------------------------------------------------ lista */
function visibles() {
  const q = sinTilde(filtro.q);
  const out = SOCIOS.filter(s => {
    if (filtro.estado === 'confirmados' && !s.numero) return false;
    if (filtro.estado === 'pendientes' && s.numero) return false;
    if (filtro.act && s.actividad !== filtro.act) return false;
    if (filtro.comuna && s.comuna !== filtro.comuna) return false;
    if (filtro.region && region(s.comuna) !== filtro.region) return false;
    if (q) {
      const c = COMUNAS.get(s.comuna);
      if (!sinTilde([s.nombre, s.correo, c?.n, NOMBRE_REGION[region(s.comuna)], ACT[s.actividad], s.actividad_detalle, s.apodo, s.notas, s.numero].join(' ')).includes(q)) return false;
    }
    return true;
  });
  const nom = s => COMUNAS.get(s.comuna)?.n || '';
  const ord = { numero: (a, b) => (a.numero ?? 1e9) - (b.numero ?? 1e9) || a.id - b.id, reciente: (a, b) => b.id - a.id,
                nombre: (a, b) => a.nombre.localeCompare(b.nombre, 'es'), comuna: (a, b) => nom(a).localeCompare(nom(b), 'es') || a.nombre.localeCompare(b.nombre, 'es') };
  return out.sort(ord[filtro.orden]);
}
function pintarLista() {
  const v = visibles();
  $('#filas').innerHTML = v.map((s, i) => {
    const c = COMUNAS.get(s.comuna), r = region(s.comuna);
    return `<button class="fila ${s.numero ? '' : 'pend'}" role="listitem" data-id="${s.id}" style="animation-delay:${Math.min(i, 20) * 18}ms">
      <b class="avatar" style="--c:${COLOR_REGION[r] || '#cbb8ff'}">${esc(iniciales(s.nombre))}</b>
      <span class="p"><b>${esc(s.nombre)}${s.fundador ? '<span class="estrella" title="Socio fundador">★</span>' : ''}</b><small>${esc(s.correo)}</small></span>
      <span class="c">${esc(c?.n || s.comuna)}<small>${esc(NOMBRE_REGION[r] || '')}</small></span>
      <span class="a">${s.actividad ? esc(ACT[s.actividad]) + (s.actividad_detalle ? ` <small>· ${esc(s.actividad_detalle)}</small>` : '') : '<small>—</small>'}</span>
      <span class="e">${s.numero ? `<span class="estado ok">n.º ${s.numero}</span>` : `<span class="estado pe">pendiente${s.recordatorios ? `<span class="rec" title="${s.recordatorios} recordatorio(s), último ${fecha(s.recordado)}">· ✉${s.recordatorios}</span>` : ''}</span>`}</span>
      <span class="m">${s.compromiso ? '$' + fmt(s.compromiso) : ''}</span></button>`;
  }).join('') || `<p class="vacio">${SOCIOS.length ? 'Nadie coincide con estos filtros.' : 'Aún no hay inscritos.'}</p>`;
  $('#pie-lista').textContent = `${fmt(v.length)} de ${fmt(SOCIOS.length)} personas · toca una fila para editarla`;
  const chips = [];
  if (filtro.comuna) chips.push(['comuna', 'Comuna: ' + (COMUNAS.get(filtro.comuna)?.n || filtro.comuna)]);
  if (filtro.region) chips.push(['region', 'Región: ' + NOMBRE_REGION[filtro.region]]);
  $('#chips').innerHTML = chips.map(([k, t]) => `<span class="chip">${esc(t)}<button data-quitar="${k}" aria-label="Quitar filtro">×</button></span>`).join('');
}
function pintarTodo() { pintarKpis(); pintarLista(); pintarMapa(); }

/* ------------------------------------------------------------------ mapa */
let mapa = null, vista = 'comunas', mapaListo = false;
function datosMapa() {
  const porComuna = new Map(), porRegion = {};
  for (const s of SOCIOS) {
    if (!s.numero) continue;
    porComuna.set(s.comuna, (porComuna.get(s.comuna) || 0) + 1);
    porRegion[region(s.comuna)] = (porRegion[region(s.comuna)] || 0) + 1;
  }
  return { porComuna, porRegion };
}
function pintarMapa() {
  const { porComuna, porRegion } = datosMapa();
  const max = Math.max(1, ...porComuna.values());
  const top = [...porComuna].sort((a, b) => b[1] - a[1]).slice(0, 8);
  $('#top').innerHTML = top.map(([c, n]) => `<li data-comuna="${c}"><span>${esc(COMUNAS.get(c)?.n || c)}</span><b>${n}</b></li>`).join('');
  $('#mapa-ley').innerHTML = vista === 'comunas'
    ? `<i style="width:8px;height:8px"></i>1 <i style="width:16px;height:16px"></i>${Math.max(2, Math.round(max / 2))} <i style="width:24px;height:24px"></i>${max} socios por comuna`
    : `<span>0</span><span class="grad"></span><span>${Math.max(1, ...Object.values(porRegion))} socios</span>`;
  if (!mapaListo) return;
  const maxR = Math.max(1, ...Object.values(porRegion));
  for (let r = 1; r <= 16; r++) mapa.setFeatureState({ source: 'regiones', id: r }, { n: porRegion[r] || 0, k: (porRegion[r] || 0) / maxR });
  mapa.getSource('puntos').setData({ type: 'FeatureCollection', features: [...porComuna].map(([c, n]) => {
    const co = COMUNAS.get(c); if (!co) return null;
    return { type: 'Feature', properties: { c, n, k: n / max, nombre: co.n }, geometry: { type: 'Point', coordinates: [co.x, co.y] } };
  }).filter(Boolean) });
  const sel = filtro.comuna || -1;
  mapa.setPaintProperty('puntos', 'circle-stroke-width', ['case', ['==', ['get', 'c'], sel], 3, 1]);
  const ver = vista === 'comunas';
  for (const id of ['puntos', 'puntos-halo']) mapa.setLayoutProperty(id, 'visibility', ver ? 'visible' : 'none');
  mapa.setPaintProperty('reg-relleno', 'fill-opacity', ver ? .18 : .78);
}
function crearMapa() {
  if (!window.maplibregl) return;
  try {
    mapa = new maplibregl.Map({
      container: 'mapa', attributionControl: { compact: true }, dragRotate: false, pitchWithRotate: false, touchPitch: false, fadeDuration: 0,
      bounds: [[-76.2, -56.1], [-66.2, -17.4]], fitBoundsOptions: { padding: 16 }, maxBounds: [[-95, -60], [-50, -12]],
      style: { version: 8, sources: {
        sat: { type: 'raster', tileSize: 256, maxzoom: 17, tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], attribution: 'Imagen © Esri, Maxar' } },
        layers: [{ id: 'fondo', type: 'background', paint: { 'background-color': '#05060a' } },
                 { id: 'sat', type: 'raster', source: 'sat', paint: { 'raster-saturation': -.55, 'raster-brightness-max': .42, 'raster-contrast': .1, 'raster-opacity': .9 } }] },
    });
  } catch (e) { $('#mapa').innerHTML = '<p class="vacio">Este navegador no puede mostrar el mapa.</p>'; return; }
  mapa.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  mapa.on('load', () => {
    mapa.addSource('regiones', { type: 'geojson', data: 'datos/chile-regiones.geojson', promoteId: 'cod' });
    mapa.addSource('puntos', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    const k = ['coalesce', ['feature-state', 'k'], 0];
    mapa.addLayer({ id: 'reg-relleno', type: 'fill', source: 'regiones', paint: {
      'fill-color': ['case', ['==', ['coalesce', ['feature-state', 'n'], 0], 0], '#15172a', ['interpolate', ['linear'], k, 0, '#272b52', .3, '#4b53a8', .65, '#b89cff', 1, '#7fe0d4']],
      'fill-opacity': .18, 'fill-opacity-transition': { duration: 500 } } });
    mapa.addLayer({ id: 'reg-borde', type: 'line', source: 'regiones', paint: { 'line-color': '#e7e2ff', 'line-opacity': .35, 'line-width': ['interpolate', ['linear'], ['zoom'], 3, .6, 8, 1.6] } });
    mapa.addLayer({ id: 'reg-hover', type: 'line', source: 'regiones', paint: { 'line-color': '#ffffff', 'line-width': 2.2, 'line-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], .9, 0] } });
    const radio = ['interpolate', ['linear'], ['zoom'], 3, ['+', 3, ['*', 9, ['sqrt', ['get', 'k']]]], 9, ['+', 7, ['*', 22, ['sqrt', ['get', 'k']]]]];
    mapa.addLayer({ id: 'puntos-halo', type: 'circle', source: 'puntos', paint: { 'circle-radius': ['*', radio, 2.4], 'circle-color': '#ff7a6b', 'circle-opacity': .22, 'circle-blur': 1 } });
    mapa.addLayer({ id: 'puntos', type: 'circle', source: 'puntos', paint: {
      'circle-radius': radio, 'circle-color': ['interpolate', ['linear'], ['get', 'k'], 0, '#ffb199', .5, '#ff7a6b', 1, '#ff5f8f'],
      'circle-stroke-color': '#fff6ef', 'circle-stroke-width': 1, 'circle-opacity': .95 } });
    mapaListo = true; pintarMapa();

    const pop = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12 });
    let hov = null;
    mapa.on('mousemove', 'puntos', e => {
      mapa.getCanvas().style.cursor = 'pointer';
      const p = e.features[0].properties;
      pop.setLngLat(e.features[0].geometry.coordinates).setHTML(`<b>${esc(p.nombre)}</b><br>${p.n} ${p.n == 1 ? 'socio' : 'socios'} · toca para filtrar`).addTo(mapa);
    });
    mapa.on('mouseleave', 'puntos', () => { mapa.getCanvas().style.cursor = ''; pop.remove(); });
    mapa.on('mousemove', 'reg-relleno', e => {
      const id = e.features[0].id;
      if (hov !== id) { if (hov) mapa.setFeatureState({ source: 'regiones', id: hov }, { hover: false }); hov = id; mapa.setFeatureState({ source: 'regiones', id }, { hover: true }); }
      if (vista === 'regiones') {
        mapa.getCanvas().style.cursor = 'pointer';
        const n = e.features[0].state.n || 0;
        pop.setLngLat(e.lngLat).setHTML(`<b>${esc(NOMBRE_REGION[id])}</b><br>${n} ${n == 1 ? 'socio' : 'socios'}`).addTo(mapa);
      }
    });
    mapa.on('mouseleave', 'reg-relleno', () => { if (hov) mapa.setFeatureState({ source: 'regiones', id: hov }, { hover: false }); hov = null; if (vista === 'regiones') { pop.remove(); mapa.getCanvas().style.cursor = ''; } });
    mapa.on('click', e => {
      const p = vista === 'comunas' && mapa.queryRenderedFeatures(e.point, { layers: ['puntos'] })[0];
      if (p) { filtro.comuna = p.properties.c; filtro.region = null; }
      else { const r = mapa.queryRenderedFeatures(e.point, { layers: ['reg-relleno'] })[0]; if (!r) return; filtro.region = r.id; filtro.comuna = null; }
      pintarLista(); pintarMapa();
    });
  });
}

/* ------------------------------------------------------------------ ficha */
function abrirFicha(s) {
  actual = s; const f = $('#form-ficha');
  f.reset(); $('#ficha-err').textContent = '';
  const nuevo = !s;
  const r = s ? region(s.comuna) : 0;
  $('#ficha-av').textContent = nuevo ? '+' : iniciales(s.nombre);
  $('#ficha-av').style.setProperty('--c', COLOR_REGION[r] || '#cbb8ff');
  $('#ficha-titulo').textContent = nuevo ? 'Agregar persona' : s.nombre;
  $('#ficha-sub').textContent = nuevo ? 'Queda confirmada con su número de socio' : (s.numero ? `Socio n.º ${s.numero}` : 'Inscripción pendiente de confirmar');
  f.nombre.value = s?.nombre || ''; f.correo.value = s?.correo || '';
  const c = s && COMUNAS.get(s.comuna); f.comuna_txt.value = c ? c.label : '';
  f.actividad.value = s?.actividad || ''; f.actividad_detalle.value = s?.actividad_detalle || '';
  const comp = String(s?.compromiso || 0);
  if (![...f.compromiso.options].some(o => o.value === comp)) f.compromiso.add(new Option('$' + fmt(comp), comp));
  f.compromiso.value = comp; f.fundador.checked = nuevo ? true : !!s.fundador; f.notas.value = s?.notas || '';
  $('#ficha-meta').innerHTML = nuevo ? '' : [['Inscripción', fecha(s.creado)], ['Confirmó', s.confirmado ? fecha(s.confirmado) : 'aún no'], ['Apodo en la Asamblea', s.apodo || '—'],
    ...(s.numero ? [] : [['Recordatorios', s.recordatorios ? `${s.recordatorios} · último ${fecha(s.recordado)}` : 'ninguno']]),
    ['Personas que invitó', s.invitados || 0], ...(s.suspendido ? [['Chat', 'suspendido por moderación']] : [])].map(([a, b]) => `<dt>${a}</dt><dd>${esc(b)}</dd>`).join('');
  $('#ficha-meta').hidden = nuevo;
  $('#b-eliminar').hidden = nuevo; $('#b-eliminar').classList.remove('seguro'); $('#b-eliminar').textContent = 'Eliminar';
  $('#b-confirmar').hidden = nuevo || !!s.numero;
  $('#b-recordar-uno').hidden = nuevo || !!s.numero;
  $('#b-guardar').textContent = nuevo ? 'Agregar a la lista' : 'Guardar cambios';
  $('#velo').hidden = false; $('#ficha').classList.add('abierta'); $('#ficha').setAttribute('aria-hidden', 'false');
  setTimeout(() => (nuevo ? f.nombre : $('#cerrar')).focus(), 60);
}
function cerrarFicha() {
  $('#ficha').classList.remove('abierta'); $('#ficha').setAttribute('aria-hidden', 'true'); $('#velo').hidden = true;
  const fila = actual && document.querySelector(`.fila[data-id="${actual.id}"]`); actual = null; fila?.focus();
}
function aviso(t) { const a = $('#aviso'); a.textContent = t; a.classList.add('ver'); clearTimeout(aviso.t); aviso.t = setTimeout(() => a.classList.remove('ver'), 2600); }
async function ejecutar(boton, cuerpo, ok) {
  boton.disabled = true; $('#ficha-err').textContent = '';
  const d = await api(cuerpo); boton.disabled = false;
  if (!d.ok) { $('#ficha-err').textContent = d.error || 'No se pudo guardar.'; return; }
  await cargar(); pintarTodo(); cerrarFicha(); aviso(ok(d));
}
$('#form-ficha').addEventListener('submit', e => {
  e.preventDefault(); const f = e.target;
  const cut = PORLABEL.get(sinTilde(f.comuna_txt.value.trim()));
  if (!cut) { $('#ficha-err').textContent = 'Elige la comuna desde la lista que aparece al escribir.'; f.comuna_txt.focus(); return; }
  const datos = { nombre: f.nombre.value, correo: f.correo.value, comuna: cut, actividad: f.actividad.value, actividad_detalle: f.actividad_detalle.value,
                  compromiso: Number(f.compromiso.value), fundador: f.fundador.checked ? 1 : 0, notas: f.notas.value };
  if (actual) ejecutar($('#b-guardar'), { accion: 'guardar', id: actual.id, ...datos }, () => 'Cambios guardados');
  else ejecutar($('#b-guardar'), { accion: 'agregar', ...datos }, d => `Agregada como socio n.º ${d.numero}`);
});
$('#b-confirmar').onclick = () => ejecutar($('#b-confirmar'), { accion: 'confirmar', id: actual.id }, d => `Confirmada como socio n.º ${d.numero}`);
$('#b-recordar-uno').onclick = () => ejecutar($('#b-recordar-uno'), { accion: 'recordar', id: actual.id }, () => 'Recordatorio enviado a ' + actual.correo);
$('#b-recordar').onclick = async () => {
  const b = $('#b-recordar'), pend = SOCIOS.filter(s => !s.numero).length;
  if (!b.classList.contains('seguro')) {
    b.classList.add('seguro'); b.querySelector('span').textContent = `¿Enviar a ${fmt(pend)}? Sí, enviar`;
    clearTimeout(b.t); b.t = setTimeout(() => { b.classList.remove('seguro'); pintarKpis(); }, 5000); return;
  }
  clearTimeout(b.t); b.classList.remove('seguro'); b.disabled = true; b.querySelector('span').textContent = 'Enviando…';
  const d = await api({ accion: 'recordar_todos' });
  b.disabled = false;
  if (!d.ok) { pintarKpis(); return aviso(d.error || 'No se pudieron enviar los recordatorios.'); }
  await cargar(); pintarTodo();
  aviso(d.enviados ? `Recordatorio enviado a ${fmt(d.enviados)} ${d.enviados === 1 ? 'persona' : 'personas'}${d.errores ? ` (${d.errores} con error)` : ''}`
    : 'Nadie para recordar ahora: ya se les escribió en las últimas 48 horas o ya tienen 3 recordatorios.');
};
$('#b-salir').onclick = () => { try { localStorage.removeItem('pc_gestion'); } catch { } location.href = 'gestion.html'; };
$('#f-acceso').addEventListener('submit', async e => {
  e.preventDefault(); const f = e.target, m = $('#acceso-msg'), b = f.querySelector('button');
  m.classList.remove('mal');
  if (!f.correo.checkValidity()) { m.classList.add('mal'); m.textContent = 'Escribe un correo válido.'; return; }
  b.disabled = true; m.textContent = 'Enviando…';
  let d; try { d = await (await fetch('api/gestion_acceso.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ correo: f.correo.value }) })).json(); } catch { d = { ok: false }; }
  b.disabled = false;
  if (!d.ok) { m.classList.add('mal'); m.textContent = d.error || 'No se pudo enviar. Intenta en un rato.'; return; }
  m.textContent = 'Si ese correo tiene acceso de gestión, te llegará el enlace en unos minutos. Revisa también spam.';
  if (d.dev_enlace) m.innerHTML += `<br><a href="${esc(d.dev_enlace)}" style="color:var(--lavanda)">(desarrollo) abrir enlace</a>`;
});
$('#b-eliminar').onclick = () => {
  const b = $('#b-eliminar');
  if (!b.classList.contains('seguro')) { b.classList.add('seguro'); b.textContent = '¿Seguro? Sí, eliminar'; setTimeout(() => { b.classList.remove('seguro'); b.textContent = 'Eliminar'; }, 4000); return; }
  ejecutar(b, { accion: 'eliminar', id: actual.id }, () => 'Persona eliminada de la lista');
};
$('#cerrar').onclick = cerrarFicha; $('#velo').onclick = cerrarFicha;
addEventListener('keydown', e => { if (e.key === 'Escape' && $('#ficha').classList.contains('abierta')) cerrarFicha(); });

/* ------------------------------------------------------------------ controles */
$('#filas').addEventListener('click', e => { const f = e.target.closest('.fila'); if (f) abrirFicha(SOCIOS.find(s => s.id === +f.dataset.id)); });
$('#chips').addEventListener('click', e => { const k = e.target.dataset.quitar; if (k) { filtro[k] = null; pintarLista(); pintarMapa(); } });
$('#top').addEventListener('click', e => { const li = e.target.closest('li'); if (li) { filtro.comuna = +li.dataset.comuna; filtro.region = null; pintarLista(); pintarMapa(); } });
$('#q').addEventListener('input', e => { filtro.q = e.target.value; pintarLista(); });
$('#f-act').onchange = e => { filtro.act = e.target.value; pintarLista(); };
$('#orden').onchange = e => { filtro.orden = e.target.value; pintarLista(); };
document.querySelectorAll('[data-estado]').forEach(b => b.onclick = () => {
  document.querySelectorAll('[data-estado]').forEach(x => x.setAttribute('aria-selected', x === b)); filtro.estado = b.dataset.estado; pintarLista();
});
document.querySelectorAll('[data-vista]').forEach(b => b.onclick = () => {
  document.querySelectorAll('[data-vista]').forEach(x => x.setAttribute('aria-selected', x === b)); vista = b.dataset.vista; pintarMapa();
});
$('#b-agregar').onclick = () => abrirFicha(null);
$('#b-csv').onclick = () => {
  const cols = ['N.º', 'Nombre', 'Correo', 'Comuna', 'Región', 'Actividad', 'Detalle', 'Socio fundador', 'Compromiso mensual', 'Inscripción', 'Confirmó', 'Invitados', 'Notas'];
  const q = v => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const filas = visibles().map(s => [s.numero ?? 'pendiente', s.nombre, s.correo, COMUNAS.get(s.comuna)?.n, NOMBRE_REGION[region(s.comuna)], ACT[s.actividad] || '', s.actividad_detalle,
    s.fundador ? 'sí' : 'no', s.compromiso || 0, s.creado, s.confirmado, s.invitados, s.notas].map(q).join(';'));
  const blob = new Blob(['﻿' + [cols.join(';'), ...filas].join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `socios-fundadores-${new Date().toISOString().slice(0, 10)}.csv` });
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};

/* ------------------------------------------------------------------ inicio */
(async () => {
  if (!g) { $('#bloqueo').hidden = false; $('#f-acceso input').focus(); return; }
  const [ok, comunas] = await Promise.all([cargar(), fetch('datos/comunas.json').then(r => r.json())]);
  for (const c of comunas) {
    c.label = `${c.n} · ${NOMBRE_REGION[c.r] || ''}`;
    COMUNAS.set(c.c, c); PORLABEL.set(sinTilde(c.label), c.c);
    if (!PORLABEL.has(sinTilde(c.n))) PORLABEL.set(sinTilde(c.n), c.c);
  }
  $('#lista-comunas').innerHTML = comunas.map(c => `<option value="${esc(c.label)}">`).join('');
  if (!ok) return;
  const opts = Object.entries(ACT).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');
  $('#f-act').insertAdjacentHTML('beforeend', opts); $('#c-actividad').insertAdjacentHTML('beforeend', opts);
  pintarTodo(); crearMapa();
  setInterval(async () => { if (!actual && !$('#ficha').classList.contains('abierta') && await cargar()) pintarTodo(); }, 60000);
})();
