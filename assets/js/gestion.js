// Panel interno de gestión de socios fundadores: mapa de Chile por comuna + lista editable.
import { NOMBRE_REGION, COLOR_REGION } from './hemiciclo.js?v=1793991830';

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

let SOCIOS = [], ACT = {}, CAMPOS = {}, COMUNAS = new Map(), PORLABEL = new Map();
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
  SOCIOS = d.socios; ACT = d.actividades; CAMPOS = d.campos_datos || {};
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
      <span class="e">${s.solicitud ? `<span class="estado ${s.respondido ? 'ok' : 'pe'} dat" title="${s.respondido ? 'Respondió los datos pedidos el ' + fecha(s.respondido) : 'Se le pidieron datos el ' + fecha(s.solicitud.fecha)}">${s.respondido ? 'datos ✓' : 'datos…'}</span>` : ''}${s.numero ? `<span class="estado ok">n.º ${s.numero}</span>` : `<span class="estado pe">pendiente${s.recordatorios ? `<span class="rec" title="${s.recordatorios} recordatorio(s), último ${fecha(s.recordado)}">· ✉${s.recordatorios}</span>` : ''}</span>`}</span>
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
  const extra = s ? { ...(s.telefono ? { telefono: s.telefono } : {}), ...(s.extra || {}) } : {};
  const filasExtra = Object.entries(extra).filter(([k]) => CAMPOS[k]).map(([k, v]) => `<dt>${esc(CAMPOS[k][0])}</dt><dd>${esc(v)}</dd>`).join('');
  const sol = s?.solicitud;
  $('#ficha-extra').innerHTML = !s || (!filasExtra && !sol) ? '' : `<div class="datos-extra"><h4>Datos adicionales</h4>${sol ? `<p style="margin:0 0 8px;font-size:12.5px;color:var(--niebla)">Pedidos el ${fecha(sol.fecha)}${sol.por ? ' por ' + esc(sol.por) : ''} · ${s.respondido ? 'respondió el ' + fecha(s.respondido) : 'aún no responde'}</p>` : ''}${filasExtra ? `<dl>${filasExtra}</dl>` : ''}</div>`;
  $('#b-eliminar').hidden = nuevo; $('#b-eliminar').classList.remove('seguro'); $('#b-eliminar').textContent = 'Eliminar';
  $('#b-confirmar').hidden = nuevo || !!s.numero;
  $('#b-correo-uno').hidden = nuevo;
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
/* ------------------------------------------------------------------ redactor de correos */
let redPersona = null;   // si se abrió desde la ficha de una persona
const R = () => $('#form-correo');
function destinatarios() {
  const tipo = R().tipo.value, dest = R().destino?.value || 'lista';
  let l = dest === 'persona' && redPersona ? [redPersona] : dest === 'pendientes' ? SOCIOS.filter(s => !s.numero) : dest === 'confirmados' ? SOCIOS.filter(s => s.numero) : dest === 'todos' ? SOCIOS : visibles();
  let omit = 0;
  if (tipo === 'recordatorio') {
    const ahora = Date.now(), uno = l.length === 1 && dest === 'persona';
    const n0 = l.length;
    l = l.filter(s => !s.numero && !(s.recordado && ahora - Date.parse(s.recordado.replace(' ', 'T') + 'Z') < (uno ? 600e3 : 48 * 3600e3)) && (uno || (s.recordatorios || 0) < 3));
    omit = n0 - l.length;
  } else if ($('#sw-omitir').checked) {
    const campos = camposElegidos(), n0 = l.length;
    l = l.filter(s => !(s.respondido && s.solicitud && campos.every(c => s.solicitud.campos.includes(c))));
    omit = n0 - l.length;
  }
  return { l, omit, tipo, dest };
}
const camposElegidos = () => [...document.querySelectorAll('#campos-datos input:checked')].map(i => i.value);
function pintarRedactor() {
  const tipo = R().tipo.value, datos = tipo === 'datos';
  $('#red-datos').hidden = !datos; $('#sw-omitir-caja').hidden = !datos;
  $('#paso-quien').textContent = (datos ? '3' : '2') + ' · ¿A quién?';
  const nVis = visibles().length, nPen = SOCIOS.filter(s => !s.numero).length, nConf = SOCIOS.length - nPen;
  const filtrada = nVis !== SOCIOS.length;
  const prev = R().destino?.value;
  const ops = [
    ...(redPersona ? [['persona', `Solo a ${redPersona.nombre}`, redPersona.correo]] : []),
    ['pendientes', `Todos los pendientes (${fmt(nPen)})`, 'Quienes no han confirmado su correo'],
    ...(datos ? [['confirmados', `Todos los confirmados (${fmt(nConf)})`, 'Socios con número'], ['todos', `Todos (${fmt(SOCIOS.length)})`, 'Confirmados y pendientes']] : []),
    ...(filtrada ? [['lista', `La lista que estás viendo (${fmt(nVis)})`, 'Con los filtros, la búsqueda o la comuna elegidos']] : []),
  ];
  const sel = ops.some(o => o[0] === prev) ? prev : ops[0][0];
  $('#destinos').innerHTML = ops.map(([v, b, sm]) => `<label class="tipo"><input type="radio" name="destino" value="${v}" ${v === sel ? 'checked' : ''}><span><b>${esc(b)}</b><small>${esc(sm)}</small></span></label>`).join('');
  resumir();
}
function resumir() {
  const { l, omit, tipo } = destinatarios();
  const b = $('#b-enviar'); b.classList.remove('seguro');
  if (tipo === 'datos' && !camposElegidos().length) { $('#resumen-envio').innerHTML = 'Elige al menos un dato para pedir.'; b.disabled = true; b.textContent = 'Enviar'; return; }
  $('#resumen-envio').innerHTML = l.length
    ? `Se enviará a <b>${fmt(l.length)} ${l.length === 1 ? 'persona' : 'personas'}</b>${omit ? ` · ${fmt(omit)} se omiten (${tipo === 'datos' ? 'ya respondieron' : 'ya confirmaron, se les escribió hace poco o ya tienen 3 recordatorios'})` : ''}.`
    : `No hay a quién enviar${omit ? ` (${fmt(omit)} se omiten: ${tipo === 'datos' ? 'ya respondieron' : 'ya confirmaron o se les escribió hace poco'})` : ''}.`;
  b.disabled = !l.length; b.textContent = l.length ? `Enviar a ${fmt(l.length)}` : 'Enviar';
  $('#vista').hidden = true;
}
function abrirRedactor(persona = null) {
  redPersona = persona;
  if (!$('#campos-datos').children.length) $('#campos-datos').innerHTML = Object.entries(CAMPOS).map(([k, [txt]]) => `<label><input type="checkbox" value="${k}"><span>${esc(txt)}</span></label>`).join('');
  R().tipo.value = persona && persona.numero ? 'datos' : 'recordatorio';
  R().querySelector('[value=recordatorio]').disabled = !!(persona && persona.numero);
  $('#red-sub').textContent = persona ? `Para ${persona.nombre}` : 'Recordatorios y pedidos de datos';
  $('#red-err').textContent = ''; $('#vista').hidden = true;
  if (persona) R().destino && (R().destino.value = 'persona');
  pintarRedactor();
  if (persona) { const p = R().querySelector('[name=destino][value=persona]'); if (p) { p.checked = true; resumir(); } }
  $('#velo').hidden = false; $('#redactor').classList.add('abierta'); $('#redactor').setAttribute('aria-hidden', 'false');
}
function cerrarRedactor() { $('#redactor').classList.remove('abierta'); $('#redactor').setAttribute('aria-hidden', 'true'); if (!$('#ficha').classList.contains('abierta')) $('#velo').hidden = true; }
$('#b-correo').onclick = () => abrirRedactor(null);
$('#b-correo-uno').onclick = () => { const p = actual; cerrarFicha(); abrirRedactor(p); };
$('#red-cerrar').onclick = cerrarRedactor;
$('#velo').addEventListener('click', cerrarRedactor);
addEventListener('keydown', e => { if (e.key === 'Escape' && $('#redactor').classList.contains('abierta')) cerrarRedactor(); });
R().addEventListener('change', e => { if (e.target.name === 'tipo') pintarRedactor(); else resumir(); });
$('#b-vista').onclick = async () => {
  const { l, tipo } = destinatarios();
  if (tipo === 'datos' && !camposElegidos().length) { $('#red-err').textContent = 'Elige al menos un dato para ver el correo.'; return; }
  const d = await api({ accion: 'vista_previa', tipo, id: l[0]?.id, campos: camposElegidos(), mensaje: R().mensaje.value });
  if (!d.ok) { $('#red-err').textContent = d.error || 'No se pudo armar la vista previa.'; return; }
  $('#red-err').textContent = '';
  $('#vista-asunto').textContent = 'Asunto: ' + d.asunto + (l[0] ? ` · ejemplo con ${l[0].nombre}` : '');
  $('#vista-marco').srcdoc = d.html; $('#vista').hidden = false;
};
R().addEventListener('submit', async e => {
  e.preventDefault();
  const { l, tipo, dest } = destinatarios(), b = $('#b-enviar');
  if (!l.length) return;
  if (!b.classList.contains('seguro')) { b.classList.add('seguro'); b.textContent = `¿Seguro? Sí, enviar a ${fmt(l.length)}`; clearTimeout(b.t); b.t = setTimeout(resumir, 5000); return; }
  clearTimeout(b.t); b.classList.remove('seguro'); b.disabled = true; $('#red-err').textContent = '';
  let ids = l.map(s => s.id), total = { enviados: 0, omitidos: 0, errores: 0 }, primero = true;
  while (ids.length) {
    b.textContent = `Enviando… ${fmt(total.enviados)} de ${fmt(l.length)}`;
    const d = await api({ accion: 'enviar', tipo, ids, campos: camposElegidos(), mensaje: R().mensaje.value, lote: !(dest === 'persona') || !primero ? 1 : 0 });
    primero = false;
    if (!d.ok) { $('#red-err').textContent = d.error || 'Se interrumpió el envío.'; break; }
    total.enviados += d.enviados; total.omitidos += d.omitidos; total.errores += d.errores; ids = d.resto || [];
  }
  b.disabled = false;
  await cargar(); pintarTodo();
  if (!$('#red-err').textContent) { cerrarRedactor(); }
  aviso(`${tipo === 'datos' ? 'Pedido de datos' : 'Recordatorio'} enviado a ${fmt(total.enviados)} ${total.enviados === 1 ? 'persona' : 'personas'}${total.omitidos ? ` · ${fmt(total.omitidos)} omitidos` : ''}${total.errores ? ` · ${fmt(total.errores)} con error` : ''}`);
});

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
  const cols = ['N.º', 'Nombre', 'Correo', 'Comuna', 'Región', 'Actividad', 'Detalle', 'Socio fundador', 'Compromiso mensual', 'Inscripción', 'Confirmó', 'Invitados', 'Notas', 'Teléfono', ...Object.keys(CAMPOS).filter(k => !['telefono', 'actividad', 'comuna'].includes(k)).map(k => CAMPOS[k][0]), 'Respondió datos'];
  const q = v => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const filas = visibles().map(s => [s.numero ?? 'pendiente', s.nombre, s.correo, COMUNAS.get(s.comuna)?.n, NOMBRE_REGION[region(s.comuna)], ACT[s.actividad] || '', s.actividad_detalle,
    s.fundador ? 'sí' : 'no', s.compromiso || 0, s.creado, s.confirmado, s.invitados, s.notas, s.telefono, ...Object.keys(CAMPOS).filter(k => !['telefono', 'actividad', 'comuna'].includes(k)).map(k => s.extra?.[k]), s.respondido].map(q).join(';'));
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
