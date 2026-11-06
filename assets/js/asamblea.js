// La Asamblea: hemiciclo 3D + participación en vivo (presencia, chat, palabra, votación consultiva, aplausos).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { iniciarParalaje } from './paralaje.js?v=1793981683';
import { trazar, ocupar, porRegionDesde, ORDEN_REGIONES, NOMBRE_REGION, COLOR_REGION } from './hemiciclo.js?v=1793981683';

const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const fmt = n => Number(n || 0).toLocaleString('es-CL');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sinMovimiento = matchMedia('(prefers-reduced-motion: reduce)').matches;
const R = 10, ALTURA_FILA = .018;
const COLOR_VOTO = ['#5fae8b', '#e0483d', '#a3b3d1', '#e9c46a', '#7fb6d2', '#b58ad6'];

const params = new URLSearchParams(location.search);
let token = params.get('s');
try { if (token) localStorage.setItem('pc_token', token); else token = localStorage.getItem('pc_token'); } catch { }

/* ================================================================ escena 3D */
const canvas = $('#sala');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
const escena = new THREE.Scene();
escena.fog = new THREE.FogExp2(0x040507, .024);
const camara = new THREE.PerspectiveCamera(42, 1, .1, 200);
const controles = new OrbitControls(camara, canvas);
Object.assign(controles, { enableDamping: true, dampingFactor: .06, minDistance: 2.2, maxDistance: 34, maxPolarAngle: 1.25, enablePan: true, panSpeed: .6, rotateSpeed: .55 });

const suelo = new THREE.Mesh(new THREE.CircleGeometry(R * 1.35, 96, 0, Math.PI), new THREE.MeshBasicMaterial({ color: 0x0a0b12, transparent: true, opacity: .55 }));
suelo.rotation.x = -Math.PI / 2; suelo.position.y = -.02; escena.add(suelo);
const matMesa = new THREE.MeshBasicMaterial({ color: 0xd8261c, transparent: true, opacity: .9, side: THREE.DoubleSide });
const anilloMesa = new THREE.Mesh(new THREE.RingGeometry(R * .14, R * .155, 64, 1, 0, Math.PI), matMesa); anilloMesa.rotation.x = -Math.PI / 2;
const luzMesa = new THREE.Mesh(new THREE.CircleGeometry(R * .14, 64, 0, Math.PI), new THREE.MeshBasicMaterial({ color: 0xd8261c, transparent: true, opacity: .16, side: THREE.DoubleSide })); luzMesa.rotation.x = -Math.PI / 2;
const tribuna = new THREE.Mesh(new THREE.BoxGeometry(R * .09, R * .02, R * .03), new THREE.MeshBasicMaterial({ color: 0xe9f2f5 })); tribuna.position.set(0, R * .01, -R * .05);
escena.add(anilloMesa, luzMesa, tribuna);
for (const rr of [.26, .45, .64, .83, 1.0]) {
  const a = new THREE.Mesh(new THREE.RingGeometry(R * rr - .012, R * rr + .012, 160, 1, 0, Math.PI), new THREE.MeshBasicMaterial({ color: 0xa9dbe8, transparent: true, opacity: .07, side: THREE.DoubleSide }));
  a.rotation.x = -Math.PI / 2; a.position.y = rr * 195 * ALTURA_FILA * .5 - .01; escena.add(a);
}

// estado por asiento: 0 normal · 1 presente · 2 pide la palabra · 3+k votó la opción k
const material = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { uTiempo: { value: 0 }, uEscala: { value: 1 }, uMio: { value: -1 }, uOla: { value: -99 }, uVotando: { value: 0 }, uColVoto: { value: COLOR_VOTO.map(c => new THREE.Color(c)) } },
  vertexShader: `
    attribute vec3 color; attribute float lleno; attribute float retraso; attribute float indice; attribute float estado; attribute float destello; attribute float dorado;
    uniform float uTiempo; uniform float uEscala; uniform float uMio; uniform float uOla; uniform float uVotando; uniform vec3 uColVoto[6];
    varying vec3 vColor; varying float vAlfa; varying float vNucleo;
    void main(){
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mv;
      float ap = clamp((uTiempo - retraso) * 1.6, 0.0, 1.0);
      bool mio = abs(indice - uMio) < .5;
      float fl = destello > 0.0 ? exp(-(uTiempo - destello) * 1.8) : 0.0;
      float ang = atan(-position.z, position.x);
      float ola = uOla > 0.0 ? exp(-pow((3.1416 - ang) - (uTiempo - uOla) * 2.4, 2.0) * 18.0) : 0.0;
      vec3 c = color;
      float brillo = .55;
      if (dorado > .5 && lleno > .5) { c = mix(c, vec3(.95, .77, .35), .7); brillo = .8; }
      float tam = lleno > .5 ? 1.2 : .8;
      if (estado > .5 && estado < 1.5) { brillo = 1.15; tam *= 1.35; c = mix(c, vec3(1.0), .25); }
      if (estado > 1.5 && estado < 2.5) { c = vec3(1.0, .68, .2); brillo = 1.5 + sin(uTiempo * 6.0) * .3; tam *= 1.9; }
      if (estado > 2.5) { int k = int(estado - 3.0 + .5); c = uColVoto[k]; brillo = 1.2; tam *= 1.3; }
      else if (uVotando > .5 && lleno > .5) { brillo *= .45; }
      brillo += fl * 2.2 + ola * 1.4 * lleno;
      tam *= 1.0 + fl * 2.5 + ola * .8 * lleno;
      if (mio) { tam *= 3.0 + sin(uTiempo * 4.0) * .8; c = mix(c, vec3(1.0, .95, .82), .65); brillo = 1.4; }
      tam *= mix(1.8, 1.0, ap);
      gl_PointSize = tam * uEscala * (60.0 / -mv.z);
      // asientos vacíos: lila tenue que respira en ondas desde la mesa hacia atrás
      float onda = .5 + .5 * sin(uTiempo * .8 - length(position.xz) * .55 + ang * 2.0);
      vColor = lleno > .5 ? c * brillo : mix(vec3(.16, .14, .26), vec3(.34, .28, .52), onda);
      vAlfa = lleno > .5 ? ap : .55 + onda * .35;
      vNucleo = lleno;
    }`,
  fragmentShader: `
    varying vec3 vColor; varying float vAlfa; varying float vNucleo;
    void main(){
      float d = length(gl_PointCoord - .5);
      if (d > .5) discard;
      float n = smoothstep(.5, .12, d);
      gl_FragColor = vec4(vColor * (vNucleo > .5 ? (.6 + n * .9) : n), n * vAlfa);
    }`,
});

let sala = null, ocup = null, puntos = null, capacidad = 100000, asientosRegion = new Map(), sectores = new Map();
function construir(total) {
  capacidad = Math.max(100000, Math.ceil(total / 10000) * 10000 + 10000);
  sala = trazar(capacidad);
  const n = sala.n, pos = new Float32Array(n * 3), ret = new Float32Array(n), idx = new Float32Array(n);
  for (let i = 0; i < n; i++) { pos[i * 3] = sala.x[i] * R; pos[i * 3 + 1] = sala.fila[i] * ALTURA_FILA; pos[i * 3 + 2] = -sala.y[i] * R; ret[i] = .3 + sala.fila[i] * .035 + Math.random() * .25; idx[i] = i; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  for (const [k, d] of [['color', 3], ['lleno', 1], ['estado', 1], ['destello', 1], ['dorado', 1]]) geo.setAttribute(k, new THREE.BufferAttribute(new Float32Array(n * d), d));
  geo.setAttribute('retraso', new THREE.BufferAttribute(ret, 1)); geo.setAttribute('indice', new THREE.BufferAttribute(idx, 1));
  if (puntos) { escena.remove(puntos); puntos.geometry.dispose(); }
  puntos = new THREE.Points(geo, material); escena.add(puntos);
}
const colores = Object.fromEntries(ORDEN_REGIONES.map(r => [r, new THREE.Color(COLOR_REGION[r])]));
function llenar(porRegion) {
  ocup = ocupar(sala, porRegion);
  const col = puntos.geometry.attributes.color, ll = puntos.geometry.attributes.lleno;
  sectores = new Map(); asientosRegion = new Map(ORDEN_REGIONES.map(r => [r, []]));
  for (let i = 0; i < sala.n; i++) {
    const r = ocup[i]; ll.array[i] = r ? 1 : 0;
    if (!r) continue;
    const c = colores[r]; col.array[i * 3] = c.r; col.array[i * 3 + 1] = c.g; col.array[i * 3 + 2] = c.b;
    asientosRegion.get(r).push(i);
    const s = sectores.get(r) || { min: 9, max: -9, n: 0 }; s.min = Math.min(s.min, sala.ang[i]); s.max = Math.max(s.max, sala.ang[i]); s.n++; sectores.set(r, s);
  }
  col.needsUpdate = ll.needsUpdate = true;
}
const asiento = (r, p) => { const a = asientosRegion.get(r); return a && a.length ? a[Math.min(a.length, Math.max(1, p)) - 1] : -1; };

function medir() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false); camara.aspect = w / h; camara.updateProjectionMatrix();
  material.uniforms.uEscala.value = renderer.getPixelRatio() * Math.min(1.4, Math.max(.7, h / 820));
}
addEventListener('resize', medir);

const angosto = () => canvas.clientWidth < 760;
const VISTAS = {
  cenital: () => angosto()
    ? { pos: new THREE.Vector3(0, R * 2.9, -R * .44), obj: new THREE.Vector3(0, 0, -R * .5) }
    : { pos: new THREE.Vector3(-R * .3, R * 1.95, -R * .3), obj: new THREE.Vector3(-R * .3, 0, -R * .36) },
  tribuna: () => ({ pos: new THREE.Vector3(0, R * .55, R * .55), obj: new THREE.Vector3(0, 0, -R * .5) }),
};
let vuelo = null;
function volar(d, ms = 2200) { vuelo = { t0: performance.now(), ms, p0: camara.position.clone(), o0: controles.target.clone(), p1: d.pos, o1: d.obj }; }
$$('.sala-vistas button').forEach(b => b.addEventListener('click', () => {
  $$('.sala-vistas button').forEach(x => x.setAttribute('aria-pressed', x === b));
  controles.autoRotate = b.dataset.vista === 'giro'; controles.autoRotateSpeed = .5;
  if (!controles.autoRotate) volar(VISTAS[b.dataset.vista]());
}));
controles.addEventListener('start', () => { vuelo = null; });

/* ondas en el piso cuando alguien escribe o aplaude */
const ondas = [];
function onda(i, color = 0xffffff) {
  if (i < 0 || !puntos) return;
  const p = puntos.geometry.attributes.position.array;
  const m = new THREE.Mesh(new THREE.RingGeometry(.05, .09, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .9, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  m.rotation.x = -Math.PI / 2; m.position.set(p[i * 3], p[i * 3 + 1] + .02, p[i * 3 + 2]); m.userData.t0 = reloj.getElapsedTime();
  escena.add(m); ondas.push(m);
  if (ondas.length > 40) { const v = ondas.shift(); escena.remove(v); v.geometry.dispose(); }
}
function destellar(i, color) {
  if (i < 0) return;
  const d = puntos.geometry.attributes.destello; d.array[i] = reloj.getElapsedTime(); d.needsUpdate = true;
  onda(i, color);
}

/* mi asiento */
let miIndice = -1;
function posAsiento(i) { const p = puntos.geometry.attributes.position.array; return new THREE.Vector3(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]); }
$('#ir-asiento').addEventListener('click', () => {
  if (miIndice < 0) return;
  const p = posAsiento(miIndice), dir = new THREE.Vector3(p.x, 0, p.z).normalize();
  volar({ pos: p.clone().add(new THREE.Vector3(dir.x * 1.6, 2.4, dir.z * 1.6 + 1.2)), obj: p });
});
const etiqueta = $('#mi-asiento');
function moverEtiqueta() {
  if (miIndice < 0) return;
  const v = posAsiento(miIndice).project(camara);
  const visible = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05;
  etiqueta.hidden = !visible;
  if (visible) { etiqueta.style.left = (canvas.offsetLeft + (v.x + 1) / 2 * canvas.clientWidth) + 'px'; etiqueta.style.top = (canvas.offsetTop + (1 - v.y) / 2 * canvas.clientHeight) + 'px'; }
}

/* sector bajo el cursor */
const tip = $('#tip'), ray = new THREE.Raycaster(), plano = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1), punto = new THREE.Vector3();
canvas.addEventListener('pointermove', e => {
  if (!sala || e.pointerType === 'touch') return;
  const r = canvas.getBoundingClientRect();
  ray.setFromCamera({ x: (e.clientX - r.left) / r.width * 2 - 1, y: -(e.clientY - r.top) / r.height * 2 + 1 }, camara);
  if (!ray.ray.intersectPlane(plano, punto)) { tip.hidden = true; return; }
  const rad = Math.hypot(punto.x, punto.z) / R, ang = Math.atan2(-punto.z, punto.x);
  if (rad < .24 || rad > 1.03 || ang < 0) { tip.hidden = true; return; }
  let h = null; for (const [reg, s] of sectores) if (ang >= s.min - .004 && ang <= s.max + .004) { h = [reg, s]; break; }
  tip.hidden = false;
  tip.innerHTML = h ? `<b>${NOMBRE_REGION[h[0]]}</b>${fmt(h[1].n)} socios · ${fmt(presentesPorRegion.get(h[0]) || 0)} conectados` : '<b>Asientos libres</b>Esperan a quienes se sumen';
  tip.style.left = (e.clientX - r.left) + 'px'; tip.style.top = (e.clientY - r.top) + 'px';
});
canvas.addEventListener('pointerleave', () => { tip.hidden = true; });

/* ================================================================ datos y participación */
async function json(u, opts) {
  const r = await fetch(u, { cache: 'no-cache', ...opts });
  const j = await r.json().catch(() => ({ ok: false, error: 'Error de conexión' }));
  if (!r.ok && j.ok !== false) j.ok = false;
  return j;
}
const post = (accion, datos = {}) => json('api/participar.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ t: token, accion, ...datos }) });

let est = null, yo = null, vivo = null, salaChat = 'plaza', ultimoId = 0, ultimoAplauso = 0, presentesPorRegion = new Map(), pausaHasta = 0;
const comunas = new Map();
fetch('datos/comunas.json').then(r => r.json()).then(L => L.forEach(c => comunas.set(c.c, c.n))).catch(() => { });

async function cargarFondo() {
  if (!puntos) return;
  const f = await json('api/fondo.php'); if (!f.ok) return;
  const d = puntos.geometry.attributes.dorado; d.array.fill(0);
  for (const [r, p] of f.asientos) { const i = asiento(r, p); if (i >= 0) d.array[i] = 1; }
  d.needsUpdate = true;
  $('[data-a="comprometidos"]').textContent = fmt(f.asientos.length);
}
async function cargarEstadisticas() {
  est = await json('api/estadisticas.php');
  if (!est || est.total == null) est = { total: 0, comunas: [] };
  if (!sala || est.total > capacidad) construir(est.total);
  const porRegion = porRegionDesde(est.comunas);
  llenar(porRegion);
  $('[data-a="total"]').textContent = fmt(est.total);
  $('#leyenda').innerHTML = ORDEN_REGIONES.map(r => `<div class="${porRegion.get(r) ? 'con' : ''}" style="--c:${COLOR_REGION[r]}" title="${NOMBRE_REGION[r]}: ${fmt(porRegion.get(r))} socios"><i></i><span>${NOMBRE_REGION[r].replace('Arica y Parinacota', 'Arica').replace('Metropolitana', 'RM').replace('La Araucanía', 'Araucanía')}</span></div>`).join('');
  $$('.etapa').forEach(el => {
    const u = +el.dataset.umbral, ok = est.total >= u;
    el.classList.toggle('abierta', ok);
    el.querySelector('.etapa-estado').textContent = ok ? 'Cifra alcanzada' : `Con ${fmt(u)}`;
    el.querySelector('.etapa-barra i').style.width = Math.min(100, est.total / u * 100) + '%';
    el.querySelector('.etapa-falta').textContent = ok ? 'Se abrirá en una sesión de la Asamblea.' : `Faltan ${fmt(u - est.total)} personas`;
  });
}

function aplicarVivo(v) {
  vivo = v; yo = v.yo;
  const a = v.asamblea, enVivo = a.estado === 'en_vivo';
  // aviso y cuenta regresiva
  $('#aviso').classList.toggle('vivo', enVivo);
  $('#aviso-txt').textContent = enVivo ? 'En vivo · Primera Asamblea Ciudadana' : a.estado === 'despues' ? 'La primera sesión terminó · pronto publicaremos el acta' : 'Primera Asamblea · sábado 5 de diciembre · 19:00';
  $('#cuenta').classList.toggle('en-vivo', a.estado !== 'antes');
  $('#sesion-estado').textContent = enVivo ? 'en vivo' : 'cerrada';
  $('#acciones-sesion').hidden = !(enVivo && yo);
  // video
  const vid = $('#video');
  if (enVivo && a.video && !vid.dataset.src) {
    const id = (a.video.match(/(?:v=|youtu\.be\/|live\/)([\w-]{11})/) || [])[1];
    if (id) { vid.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1" title="Transmisión de la mesa" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`; vid.dataset.src = id; vid.hidden = false; }
  }
  // cifras
  $('[data-a="presentes"]').textContent = fmt(v.presentes.length);
  $('[data-a="acreditados"]').textContent = fmt(v.acreditados);
  // estados de asientos
  if (puntos) {
    const e = puntos.geometry.attributes.estado; e.array.fill(0);
    presentesPorRegion = new Map();
    for (const [r, p] of v.presentes) { const i = asiento(r, p); if (i >= 0) e.array[i] = 1; presentesPorRegion.set(r, (presentesPorRegion.get(r) || 0) + 1); }
    for (const [r, p] of v.palabra) { const i = asiento(r, p); if (i >= 0) e.array[i] = 2; }
    const vt = v.votacion;
    material.uniforms.uVotando.value = vt && vt.abierta ? 1 : 0;
    if (vt) for (const [r, p, op] of vt.asientos) { const i = asiento(r, p); if (i >= 0) e.array[i] = 3 + Math.min(5, op); }
    e.needsUpdate = true;
  }
  // aplausos: ola + destellos
  const nuevosAp = v.aplausos.filter(x => x[0] > ultimoAplauso);
  if (ultimoAplauso && nuevosAp.length) { material.uniforms.uOla.value = reloj.getElapsedTime(); nuevosAp.slice(-25).forEach(([, r, p]) => destellar(asiento(r, p), 0xe3c690)); }
  if (v.aplausos.length) ultimoAplauso = Math.max(ultimoAplauso, ...v.aplausos.map(x => x[0]));
  pintarVotacion(v.votacion);
  pintarPalabra(v.palabra);
  pintarMensajes(v);
  pintarYo();
}

/* chat */
const lista = $('#mensajes');
const visibles = new Map();
function pintarMensajes(v) {
  for (const id of v.ocultos) { visibles.get(id)?.remove(); visibles.delete(id); }
  const nuevos = v.mensajes.filter(m => m.id > ultimoId);
  for (const m of nuevos) {
    if (ultimoId) destellar(asiento(m.r, m.p), 0xa9dbe8);
    if (m.s !== salaChat) continue;
    agregar(m);
  }
  if (v.mensajes.length) ultimoId = Math.max(ultimoId, ...v.mensajes.map(m => m.id));
  if (!lista.children.length) lista.innerHTML = `<li class="vacio">${salaChat === 'plaza' ? 'La Plaza está tranquila. Saluda y preséntate.' : 'El chat de la sesión se abre el sábado 5 de diciembre a las 19:00.'}</li>`;
}
function agregar(m) {
  lista.querySelector('.vacio')?.remove();
  const abajo = lista.scrollHeight - lista.scrollTop - lista.clientHeight < 80;
  const li = document.createElement('li');
  if (yo && m.n === yo.numero) li.className = 'mio';
  const hora = new Date(m.t * 1000).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  li.innerHTML = `<div class="m-cab"><span class="m-apodo" style="--c:${COLOR_REGION[m.r] || '#d9d3ec'}">${esc(m.a || 'Socio')}</span><span class="m-meta">n.º ${fmt(m.n)} · ${esc(comunas.get(m.c) || '')} · ${hora}</span></div><p class="m-txt">${esc(m.x)}</p>${yo && m.n !== yo.numero ? `<button class="m-denunciar" data-id="${m.id}" title="Denunciar este mensaje">denunciar</button>` : ''}`;
  lista.append(li); visibles.set(m.id, li);
  while (lista.children.length > 150) { const f = lista.firstElementChild; f.remove(); }
  if (abajo) lista.scrollTop = lista.scrollHeight;
}
lista.addEventListener('click', async e => {
  const b = e.target.closest('.m-denunciar'); if (!b) return;
  if (!confirmarSuave(b)) return;
  await post('denunciar', { mensaje: +b.dataset.id }); b.textContent = 'denunciado'; b.disabled = true;
});
function confirmarSuave(b) { if (b.dataset.ok) return true; b.dataset.ok = 1; b.textContent = '¿seguro? toca otra vez'; setTimeout(() => { if (!b.disabled) { delete b.dataset.ok; b.textContent = 'denunciar'; } }, 3000); return false; }
$$('.chat-pestanas button').forEach(b => b.addEventListener('click', () => {
  salaChat = b.dataset.sala;
  $$('.chat-pestanas button').forEach(x => x.setAttribute('aria-selected', x === b));
  $('#chat-sub').textContent = salaChat === 'plaza' ? 'Conversación abierta de los socios. Sé respetuoso: hay moderación.' : 'Chat de la sesión en vivo: comenta lo que se discute en la mesa.';
  lista.innerHTML = ''; visibles.clear();
  if (vivo) vivo.mensajes.filter(m => m.s === salaChat).forEach(agregar);
  if (!lista.children.length && vivo) pintarMensajes({ ...vivo, mensajes: [], ocultos: [] });
  lista.scrollTop = lista.scrollHeight;
  pintarRedactar();
}));

/* redactar */
const caja = $('#redactar');
function pintarRedactar() {
  if (!yo) { caja.innerHTML = `<div class="r-invitacion">Para escribir necesitas tu asiento.<br><a class="boton boton-rojo boton-chico" href="./#sumate">Inscribirme gratis</a></div>`; return; }
  if (yo.suspendido) { caja.innerHTML = `<div class="r-invitacion r-error">Tu participación en el chat está suspendida por la moderación.</div>`; return; }
  if (!yo.apodo) { caja.innerHTML = `<div class="r-invitacion">Elige un apodo para empezar a conversar.<br><button class="boton boton-rojo boton-chico" type="button" id="b-apodo">Elegir apodo</button></div>`; $('#b-apodo').onclick = abrirApodo; return; }
  if (salaChat === 'sesion' && vivo?.asamblea.estado !== 'en_vivo') { caja.innerHTML = `<div class="r-invitacion">El chat de la sesión se abre el sábado 5 de diciembre a las 19:00. Mientras tanto, conversa en La Plaza.</div>`; return; }
  if (caja.querySelector('form')) return;
  caja.innerHTML = `<form id="f-msj"><textarea id="t-msj" maxlength="280" rows="1" placeholder="Escribe como ${esc(yo.apodo)}…" aria-label="Mensaje"></textarea><button class="boton boton-rojo" type="submit">Enviar</button></form><p class="r-info"><span id="r-estado">Tu asiento destellará en la sala</span><span id="r-cuenta">0/280</span></p>`;
  const t = $('#t-msj');
  t.addEventListener('input', () => { $('#r-cuenta').textContent = t.value.length + '/280'; t.style.height = 'auto'; t.style.height = Math.min(120, t.scrollHeight) + 'px'; });
  t.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#f-msj').requestSubmit(); } });
  $('#f-msj').addEventListener('submit', async e => {
    e.preventDefault();
    const texto = t.value.trim(); if (!texto) return;
    if (Date.now() < pausaHasta) return;
    const r = await post('mensaje', { texto, sala: salaChat });
    const est = $('#r-estado');
    if (!r.ok) { est.textContent = r.error; est.className = 'r-error'; return; }
    t.value = ''; t.dispatchEvent(new Event('input')); est.className = '';
    destellar(miIndice, 0xffe7b0);
    const pausa = salaChat === 'plaza' ? 20 : 8; pausaHasta = Date.now() + pausa * 1000;
    const tick = () => { const s = Math.ceil((pausaHasta - Date.now()) / 1000); est.textContent = s > 0 ? `Modo lento: puedes volver a escribir en ${s} s` : 'Tu asiento destellará en la sala'; if (s > 0) setTimeout(tick, 1000); };
    tick(); refrescar();
  });
}

/* apodo */
const modalApodo = $('#modal-apodo');
function abrirApodo() { modalApodo.hidden = false; $('#ap-input').value = yo?.apodo || ''; $('#ap-input').focus(); }
modalApodo.addEventListener('click', e => { if (e.target === modalApodo || e.target.closest('[data-cerrar]')) modalApodo.hidden = true; });
$('#form-apodo').addEventListener('submit', async e => {
  e.preventDefault();
  const r = await post('apodo', { apodo: $('#ap-input').value });
  if (!r.ok) { $('#ap-msg').textContent = r.error; return; }
  yo.apodo = r.apodo; modalApodo.hidden = true; caja.innerHTML = ''; pintarRedactar(); pintarYo();
});

/* palabra, aplauso, acreditación, votación */
$('#b-palabra').addEventListener('click', async () => { const r = await post('palabra', { pedir: !yo?.palabra }); if (r.ok) { yo.palabra = r.palabra; pintarYo(); refrescar(); } });
$('#b-aplauso').addEventListener('click', async () => { material.uniforms.uOla.value = reloj.getElapsedTime(); destellar(miIndice, 0xe3c690); await post('aplauso'); });
$('#acreditar').addEventListener('click', async () => { const r = await post('acreditar'); if (r.ok) { yo.acreditado = true; pintarYo(); refrescar(); } });
function pintarPalabra(pal) {
  $('#palabra-fila').textContent = pal.length ? `Piden la palabra: ${pal.slice(0, 4).map(p => p[2] || 'socio').join(', ')}${pal.length > 4 ? ` y ${pal.length - 4} más` : ''}` : '';
}
function pintarVotacion(vt) {
  const box = $('#votacion');
  if (!vt) { box.hidden = true; return; }
  box.hidden = false;
  const total = vt.conteo.reduce((a, b) => a + b, 0) || 1;
  $('#v-estado').textContent = vt.abierta ? '· abierta' : '· cerrada';
  $('#v-pregunta').textContent = vt.pregunta;
  $('#v-opciones').innerHTML = vt.opciones.map((o, k) => `<button class="v-op" type="button" data-k="${k}" style="--c:${COLOR_VOTO[k]}" aria-pressed="${yo?.voto === k}" ${!vt.abierta || !yo ? 'disabled' : ''}><i style="width:${vt.conteo[k] / total * 100}%"></i><span>${esc(o)}</span><b>${fmt(vt.conteo[k])} · ${Math.round(vt.conteo[k] / total * 100)} %</b></button>`).join('');
  $('#v-nota').textContent = !yo ? 'Inscríbete para votar.' : vt.abierta ? (yo.voto != null ? 'Tu voto quedó registrado; puedes cambiarlo mientras esté abierta.' : 'Elige una opción: tu asiento tomará su color.') : 'Votación cerrada. Resultado consultivo.';
}
$('#v-opciones').addEventListener('click', async e => {
  const b = e.target.closest('.v-op'); if (!b || b.disabled) return;
  const r = await post('votar', { votacion: vivo.votacion.id, opcion: +b.dataset.k });
  if (r.ok) { yo.voto = r.voto; destellar(miIndice, new THREE.Color(COLOR_VOTO[r.voto]).getHex()); refrescar(); }
});

function pintarYo() {
  const conYo = !!yo;
  $('#reservar').hidden = conYo;
  $('#ir-asiento').hidden = !conYo || miIndice < 0;
  $('#acreditar').hidden = !conYo || yo.acreditado || vivo?.asamblea.estado === 'despues';
  if (conYo) {
    $('#cta-barra').textContent = 'Mi asiento'; $('#cta-barra').href = '#';
    $('#cta-convocatoria').textContent = yo.acreditado ? 'Asistencia confirmada ✓' : 'Confirmo mi asistencia';
    $('#cta-convocatoria').onclick = e => { e.preventDefault(); if (!yo.acreditado) $('#acreditar').click(); };
    $('#b-palabra').setAttribute('aria-pressed', !!yo.palabra); $('#b-palabra').textContent = yo.palabra ? '✋ Bajar la mano' : '✋ Pedir la palabra';
    miIndice = asiento(yo.region, yo.puesto);
    material.uniforms.uMio.value = miIndice;
    $('[data-a="numero"]').textContent = fmt(yo.numero);
    $('[data-a="lugar"]').textContent = `${yo.apodo ? yo.apodo + ' · ' : ''}${NOMBRE_REGION[yo.region]} · fila ${miIndice >= 0 ? sala.fila[miIndice] + 1 : '—'}${yo.acreditado ? ' · acreditado' : ''}`;
  }
  pintarRedactar();
}
$('#cta-barra').addEventListener('click', e => { if (yo) { e.preventDefault(); scrollTo({ top: 0, behavior: 'smooth' }); $('#ir-asiento').click(); } });

/* cuenta regresiva */
function cuenta() {
  if (!vivo) return;
  const falta = Math.max(0, vivo.asamblea.inicio_ts * 1000 - Date.now());
  const d = Math.floor(falta / 864e5), h = Math.floor(falta / 36e5) % 24, m = Math.floor(falta / 6e4) % 60, s = Math.floor(falta / 1e3) % 60;
  const p = (k, v) => { $(`[data-c="${k}"]`).textContent = String(v).padStart(2, '0'); };
  p('d', d); p('h', h); p('m', m); p('s', s);
}
setInterval(cuenta, 1000);

/* sondeo: cada 3 s con la pestaña visible, cada 20 s si no */
let sondeo = 0;
async function refrescar() {
  clearTimeout(sondeo);
  try { const v = await json('api/sala.php' + (token ? '?t=' + encodeURIComponent(token) : '')); if (v.asamblea) aplicarVivo(v); } catch { }
  sondeo = setTimeout(refrescar, document.hidden ? 20000 : 3000);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) refrescar(); });

/* bucle */
const reloj = new THREE.Clock();
function cuadro() {
  const t = reloj.getElapsedTime();
  material.uniforms.uTiempo.value = sinMovimiento ? 99 + t : t;
  luzMesa.material.opacity = .12 + Math.sin(t * 1.5) * .05;
  for (const o of ondas) { const k = t - o.userData.t0; o.scale.setScalar(1 + k * 14); o.material.opacity = Math.max(0, .9 - k * .8); }
  if (vuelo) {
    const k = Math.min(1, (performance.now() - vuelo.t0) / vuelo.ms), e = k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    camara.position.lerpVectors(vuelo.p0, vuelo.p1, e); controles.target.lerpVectors(vuelo.o0, vuelo.o1, e);
    if (k >= 1) vuelo = null;
  }
  controles.update(); renderer.render(escena, camara); moverEtiqueta();
  requestAnimationFrame(cuadro);
}

iniciarParalaje({ paralaje: [['.participar .titulo-bloque', .06], ['.reglas', .03]], revelar: ['.reglas div', '.etapa', '.convocatoria'] });
medir();
camara.position.set(0, R * 4.2, -R * .4); controles.target.set(0, 0, -R * .42); camara.lookAt(controles.target);
await cargarEstadisticas();
await cargarFondo();
await refrescar(); cuenta();
volar(VISTAS.cenital(), sinMovimiento ? 1 : 3200);
requestAnimationFrame(cuadro);
setInterval(async () => { await cargarEstadisticas(); cargarFondo(); }, 60000);
if (location.hash === '#participar') setTimeout(() => $('#participar').scrollIntoView(), 300);
