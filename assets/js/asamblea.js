// La Asamblea: hemiciclo 3D visto desde arriba. Cada punto es un asiento; se encienden los ocupados, por región.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { trazar, ocupar, asientoDe, porRegionDesde, ORDEN_REGIONES, NOMBRE_REGION, COLOR_REGION } from './hemiciclo.js';

const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const fmt = n => Number(n || 0).toLocaleString('es-CL');
const sinMovimiento = matchMedia('(prefers-reduced-motion: reduce)').matches;
const R = 10;                     // radio exterior de la sala (unidades de escena)
const ALTURA_FILA = .018;         // gradas: cada fila sube un poco

const params = new URLSearchParams(location.search);
let token = params.get('s');
try { if (token) localStorage.setItem('pc_token', token); else token = localStorage.getItem('pc_token'); } catch { }

/* ---------------- escena */
const canvas = $('#sala');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
const escena = new THREE.Scene();
escena.fog = new THREE.FogExp2(0x040b12, .028);
const camara = new THREE.PerspectiveCamera(42, 1, .1, 200);
const controles = new OrbitControls(camara, canvas);
Object.assign(controles, { enableDamping: true, dampingFactor: .06, minDistance: 2.2, maxDistance: 34, maxPolarAngle: 1.25, enablePan: true, panSpeed: .6, rotateSpeed: .55 });
controles.target.set(0, 0, -R * .42);

let sala = null, ocup = null, puntos = null, miIndice = -1, capacidad = 100000;

// suelo y mesa
const suelo = new THREE.Mesh(new THREE.CircleGeometry(R * 1.35, 96, 0, Math.PI), new THREE.MeshBasicMaterial({ color: 0x07151f, transparent: true, opacity: .9 }));
suelo.rotation.x = -Math.PI / 2; suelo.rotation.z = 0; suelo.position.y = -.02; escena.add(suelo);
const mesa = new THREE.Group();
const anilloMesa = new THREE.Mesh(new THREE.RingGeometry(R * .14, R * .155, 64, 1, 0, Math.PI), new THREE.MeshBasicMaterial({ color: 0xd8261c, transparent: true, opacity: .9, side: THREE.DoubleSide }));
anilloMesa.rotation.x = -Math.PI / 2;
const luzMesa = new THREE.Mesh(new THREE.CircleGeometry(R * .14, 64, 0, Math.PI), new THREE.MeshBasicMaterial({ color: 0xd8261c, transparent: true, opacity: .16, side: THREE.DoubleSide }));
luzMesa.rotation.x = -Math.PI / 2;
const tribuna = new THREE.Mesh(new THREE.BoxGeometry(R * .09, R * .02, R * .03), new THREE.MeshBasicMaterial({ color: 0xe9f2f5 }));
tribuna.position.set(0, R * .01, -R * .05);
mesa.add(anilloMesa, luzMesa, tribuna); escena.add(mesa);
// pasillos de referencia: arcos tenues
for (const rr of [.26, .45, .64, .83, 1.0]) {
  const a = new THREE.Mesh(new THREE.RingGeometry(R * rr - .012, R * rr + .012, 160, 1, 0, Math.PI), new THREE.MeshBasicMaterial({ color: 0xa9dbe8, transparent: true, opacity: .07, side: THREE.DoubleSide }));
  a.rotation.x = -Math.PI / 2; a.position.y = rr * 195 * ALTURA_FILA * .5 - .01; escena.add(a);
}

// asientos: puntos con shader (círculo suave, brillo si está ocupado, aparición en ola desde adelante)
const material = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { uTiempo: { value: 0 }, uEscala: { value: 1 }, uMio: { value: -1 } },
  vertexShader: `
    attribute vec3 color; attribute float lleno; attribute float retraso; attribute float indice;
    uniform float uTiempo; uniform float uEscala; uniform float uMio;
    varying vec3 vColor; varying float vLleno; varying float vAlfa; varying float vMio;
    void main(){
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mv;
      float ap = clamp((uTiempo - retraso) * 1.6, 0.0, 1.0);
      vMio = abs(indice - uMio) < .5 ? 1.0 : 0.0;
      float tam = lleno > .5 ? 1.25 : .85;
      tam *= mix(1.8, 1.0, ap) * (1.0 + vMio * (3.0 + sin(uTiempo * 4.0) * .8));
      gl_PointSize = tam * uEscala * (60.0 / -mv.z);
      vColor = color; vLleno = lleno; vAlfa = lleno > .5 ? ap : .9;
    }`,
  fragmentShader: `
    varying vec3 vColor; varying float vLleno; varying float vAlfa; varying float vMio;
    void main(){
      vec2 c = gl_PointCoord - .5; float d = length(c);
      if (d > .5) discard;
      float nucleo = smoothstep(.5, .15, d);
      vec3 col = vLleno > .5 ? vColor * (0.55 + nucleo * 0.9) : vec3(.10, .17, .22) * nucleo;
      if (vMio > .5) col = mix(col, vec3(1.0, .95, .82), .65);
      gl_FragColor = vec4(col, nucleo * vAlfa);
    }`,
});

function construir(total) {
  capacidad = Math.max(100000, Math.ceil(total / 10000) * 10000 + 10000);
  sala = trazar(capacidad);
  const pos = new Float32Array(sala.n * 3), ret = new Float32Array(sala.n), idx = new Float32Array(sala.n);
  for (let i = 0; i < sala.n; i++) {
    pos[i * 3] = sala.x[i] * R; pos[i * 3 + 1] = sala.fila[i] * ALTURA_FILA; pos[i * 3 + 2] = -sala.y[i] * R;
    ret[i] = .3 + sala.fila[i] * .035 + Math.random() * .25; idx[i] = i;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(sala.n * 3), 3));
  geo.setAttribute('lleno', new THREE.BufferAttribute(new Float32Array(sala.n), 1));
  geo.setAttribute('retraso', new THREE.BufferAttribute(ret, 1));
  geo.setAttribute('indice', new THREE.BufferAttribute(idx, 1));
  if (puntos) { escena.remove(puntos); puntos.geometry.dispose(); }
  puntos = new THREE.Points(geo, material); escena.add(puntos);
  $('[data-a="capacidad"]').textContent = fmt(capacidad);
}

const colores = Object.fromEntries(ORDEN_REGIONES.map(r => [r, new THREE.Color(COLOR_REGION[r])]));
let sectores = new Map();
function llenar(porRegion) {
  ocup = ocupar(sala, porRegion);
  const col = puntos.geometry.attributes.color, ll = puntos.geometry.attributes.lleno;
  sectores = new Map();
  for (let i = 0; i < sala.n; i++) {
    const r = ocup[i];
    ll.array[i] = r ? 1 : 0;
    if (r) {
      const c = colores[r]; col.array[i * 3] = c.r; col.array[i * 3 + 1] = c.g; col.array[i * 3 + 2] = c.b;
      const s = sectores.get(r) || { min: 9, max: -9, n: 0 }; s.min = Math.min(s.min, sala.ang[i]); s.max = Math.max(s.max, sala.ang[i]); s.n++; sectores.set(r, s);
    }
  }
  col.needsUpdate = ll.needsUpdate = true;
}

/* ---------------- tamaño y cámara */
function medir() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false); camara.aspect = w / h; camara.updateProjectionMatrix();
  material.uniforms.uEscala.value = renderer.getPixelRatio() * Math.min(1.4, Math.max(.7, h / 900));
}
addEventListener('resize', medir);

const VISTAS = {
  cenital: () => innerWidth < 760
    ? { pos: new THREE.Vector3(0, R * 3.1, -R * .44), obj: new THREE.Vector3(0, 0, -R * .5) }
    : { pos: new THREE.Vector3(-R * .35, R * 2.05, -R * .38), obj: new THREE.Vector3(-R * .35, 0, -R * .42) },
  tribuna: () => ({ pos: new THREE.Vector3(0, R * .55, R * .55), obj: new THREE.Vector3(0, 0, -R * .5) }),
};
let vuelo = null, girando = false;
function volar(destino, ms = 2200) {
  vuelo = { t0: performance.now(), ms, p0: camara.position.clone(), o0: controles.target.clone(), p1: destino.pos, o1: destino.obj };
}
$$('.sala-vistas button').forEach(b => b.addEventListener('click', () => {
  $$('.sala-vistas button').forEach(x => x.setAttribute('aria-pressed', x === b));
  girando = b.dataset.vista === 'giro'; controles.autoRotate = girando; controles.autoRotateSpeed = .5;
  if (!girando) volar(VISTAS[b.dataset.vista]());
}));
controles.addEventListener('start', () => { vuelo = null; });

/* ---------------- mi asiento */
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

/* ---------------- sectores al pasar el cursor */
const tip = $('#tip'), ray = new THREE.Raycaster(), plano = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1), punto = new THREE.Vector3();
canvas.addEventListener('pointermove', e => {
  if (!sala || e.pointerType === 'touch') return;
  const r = canvas.getBoundingClientRect();
  ray.setFromCamera({ x: (e.clientX - r.left) / r.width * 2 - 1, y: -(e.clientY - r.top) / r.height * 2 + 1 }, camara);
  if (!ray.ray.intersectPlane(plano, punto)) { tip.hidden = true; return; }
  const rad = Math.hypot(punto.x, punto.z) / R, ang = Math.atan2(-punto.z, punto.x);
  if (rad < .24 || rad > 1.03 || ang < 0) { tip.hidden = true; return; }
  let hallada = null; for (const [reg, s] of sectores) if (ang >= s.min - .004 && ang <= s.max + .004) { hallada = [reg, s]; break; }
  if (!hallada) { tip.hidden = false; tip.innerHTML = '<b>Asientos libres</b>Esperan a quienes se sumen'; }
  else { tip.hidden = false; tip.innerHTML = `<b>${NOMBRE_REGION[hallada[0]]}</b>${fmt(hallada[1].n)} socios sentados`; }
  tip.style.left = (e.clientX - r.left) + 'px'; tip.style.top = (e.clientY - r.top) + 'px';
});
canvas.addEventListener('pointerleave', () => { tip.hidden = true; });

/* ---------------- datos */
async function json(u) { const r = await fetch(u, { cache: 'no-cache' }); if (!r.ok) throw new Error(u); return r.json(); }
let socio = null, ultimoTotal = -1;
async function cargar() {
  let est; try { est = await json('api/estadisticas.php'); } catch { est = { total: 0, meta: 100000, comunas: [] }; }
  if (est.total === ultimoTotal) return; ultimoTotal = est.total;
  if (!sala || est.total > capacidad) construir(est.total);
  const porRegion = porRegionDesde(est.comunas);
  llenar(porRegion);
  $('[data-a="total"]').textContent = fmt(est.total);
  $('[data-a="regiones"]').textContent = [...porRegion.values()].filter(Boolean).length;
  $('#leyenda').innerHTML = ORDEN_REGIONES.map(r => `<div class="${porRegion.get(r) ? 'con' : ''}" style="--c:${COLOR_REGION[r]}" title="${NOMBRE_REGION[r]}: ${fmt(porRegion.get(r))} socios"><i></i><span>${NOMBRE_REGION[r].replace('Arica y Parinacota', 'Arica').replace('Metropolitana', 'RM').replace('La Araucanía', 'Araucanía')}</span></div>`).join('');
  $$('.etapa').forEach(el => {
    const u = +el.dataset.umbral, ok = est.total >= u;
    el.classList.toggle('abierta', ok);
    el.querySelector('.etapa-estado').textContent = ok ? 'Abierta pronto' : `Con ${fmt(u)}`;
    el.querySelector('.etapa-barra i').style.width = Math.min(100, est.total / u * 100) + '%';
    el.querySelector('.etapa-falta').textContent = ok ? 'Cifra alcanzada: se abrirá con la convocatoria.' : `Faltan ${fmt(u - est.total)} personas`;
  });
  if (socio) ubicarme();
}
function ubicarme() {
  miIndice = asientoDe(sala, ocup, socio.region, socio.puesto);
  material.uniforms.uMio.value = miIndice;
  $('[data-a="numero"]').textContent = fmt(socio.numero);
  $('[data-a="lugar"]').textContent = `${NOMBRE_REGION[socio.region]} · fila ${sala.fila[miIndice] + 1}`;
  $('#ir-asiento').hidden = miIndice < 0;
}
async function cargarSocio() {
  if (!token) return;
  try { const s = await json('api/socio.php?t=' + encodeURIComponent(token)); if (s.ok) socio = s; } catch { }
  if (!socio) return;
  $('#reservar').hidden = true; $('#cta-barra').textContent = 'Mi asiento'; $('#cta-barra').href = '#';
  $('#cta-barra').addEventListener('click', e => { e.preventDefault(); $('#ir-asiento').click(); scrollTo({ top: 0, behavior: 'smooth' }); });
  $('#cta-convocatoria').textContent = 'Ya estás inscrito: te avisaremos'; $('#cta-convocatoria').removeAttribute('href');
  if (sala) ubicarme();
}

/* ---------------- bucle */
const reloj = new THREE.Clock();
function cuadro() {
  const t = reloj.getElapsedTime();
  material.uniforms.uTiempo.value = sinMovimiento ? 99 : t;
  luzMesa.material.opacity = .12 + Math.sin(t * 1.5) * .05;
  if (vuelo) {
    const k = Math.min(1, (performance.now() - vuelo.t0) / vuelo.ms), e = k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    camara.position.lerpVectors(vuelo.p0, vuelo.p1, e); controles.target.lerpVectors(vuelo.o0, vuelo.o1, e);
    if (k >= 1) vuelo = null;
  }
  controles.update(); renderer.render(escena, camara); moverEtiqueta();
  requestAnimationFrame(cuadro);
}

// arranque: desde muy alto, baja hacia la vista cenital
medir();
camara.position.set(0, R * 4.2, -R * .4); controles.target.set(0, 0, -R * .42); camara.lookAt(controles.target);
await cargar(); await cargarSocio();
volar(VISTAS.cenital(), sinMovimiento ? 1 : 3200);
requestAnimationFrame(cuadro);
setInterval(cargar, 60000);
if (location.hash === '#participar') setTimeout(() => $('#participar').scrollIntoView(), 300);
