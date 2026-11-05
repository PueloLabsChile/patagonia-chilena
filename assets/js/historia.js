// Historia de los límites: recorrido con scroll sobre un mapa 3D fijo.
// Cada hito cambia el estado de piezas del territorio (CShapes 2.0 + esquemas de los tratados).
// Las fronteras ganadas se «dibujan» con un trazo de luz; las perdidas se apagan con un destello.
const $ = s => document.querySelector(s);
const COLOR_TIPO = { frontera: '#d9d3ec', tierra: '#e9c46a' };
const sinMovimiento = matchMedia('(prefers-reduced-motion: reduce)').matches;
const esCel = () => innerWidth < 760;

// tramas (patrones) dibujadas en canvas
function trama(color, fondo, ancho = 2, paso = 9) {
  const n = 32, c = document.createElement('canvas'); c.width = c.height = n;
  const g = c.getContext('2d');
  if (fondo) { g.fillStyle = fondo; g.fillRect(0, 0, n, n); }
  g.strokeStyle = color; g.lineWidth = ancho;
  for (let i = -n; i < n * 2; i += paso) { g.beginPath(); g.moveTo(i, n); g.lineTo(i + n, 0); g.stroke(); }
  return g.getImageData(0, 0, n, n);
}

export async function iniciarHistoria() {
  const sec = $('#historia'); if (!sec || !window.maplibregl) return;
  const H = await (await fetch('datos/historia.json')).json();
  const pasos = H.pasos;

  // estados acumulados por hito
  const estados = []; let act = {};
  for (const p of pasos) { act = p.reiniciar ? {} : { ...act }; for (const [k, v] of Object.entries(p.estados || {})) { if (v) act[k] = v; else delete act[k]; } estados.push(act); }

  // tarjetas y línea de tiempo
  const cont = $('#h-pasos');
  cont.innerHTML = pasos.map((p, i) => `
    <article class="h-paso" data-i="${i}">
      <div class="h-tarjeta" style="--c:${COLOR_TIPO[p.tipo]}">
        <p class="h-tipo ${p.tipo}">${p.tipo === 'tierra' ? 'Propiedad de la tierra' : 'Fronteras'} · ${p.anio}</p>
        <h3>${p.titulo}</h3>
        <p>${p.texto}</p>
        <p class="fuente">Fuente: ${p.fuente}</p>
      </div>
    </article>`).join('');
  const linea = $('#h-linea');
  linea.innerHTML = pasos.map((p, k) => `<li><button type="button" data-k="${k}" style="--c:${COLOR_TIPO[p.tipo]}" aria-label="${p.anio}: ${p.titulo}"><span>${p.anio.replace('Antes de ', '< ').replace('–', '–​')}</span></button></li>`).join('');
  linea.addEventListener('click', e => {
    const b = e.target.closest('button[data-k]'); if (!b) return;
    const art = cont.querySelector(`[data-i="${b.dataset.k}"]`);
    scrollTo({ top: art.getBoundingClientRect().top + scrollY - innerHeight * .25, behavior: sinMovimiento ? 'auto' : 'smooth' });
  });

  let mapa, listo = false, actual = -1, anim = 0, marcador = null, rotulos = [];

  function crear() {
    mapa = new maplibregl.Map({
      container: 'mapa-historia', interactive: false, attributionControl: false, fadeDuration: 0, maxPitch: 75,
      center: [-70, -38], zoom: 3.2, pitch: 20,
      style: {
        version: 8,
        sources: {
          sat: { type: 'raster', tileSize: 256, maxzoom: 15, tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'] },
          relieve: { type: 'raster-dem', encoding: 'terrarium', tileSize: 256, maxzoom: 12, tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'] },
        },
        sky: { 'sky-color': '#07080c', 'horizon-color': '#6a5a8a', 'fog-color': '#060709', 'sky-horizon-blend': .5, 'horizon-fog-blend': .7, 'fog-ground-blend': .6, 'atmosphere-blend': .7 },
        layers: [
          { id: 'fondo', type: 'background', paint: { 'background-color': '#060709' } },
          { id: 'sat', type: 'raster', source: 'sat', paint: { 'raster-saturation': -.9, 'raster-brightness-max': .36, 'raster-contrast': .12 } },
        ],
      },
    });
    mapa.on('load', () => {
      if (!esCel()) mapa.setTerrain({ source: 'relieve', exaggeration: 1.6 });
      mapa.addImage('t-admin', trama('rgba(217,211,236,.55)', 'rgba(138,116,216,.18)', 2, 8));
      mapa.addImage('t-reclamo', trama('rgba(248,246,240,.35)', null, 1.4, 7));
      mapa.addImage('t-mapuche', trama('rgba(233,196,106,.6)', 'rgba(212,169,67,.12)', 2.2, 9));
      mapa.addImage('t-realista', trama('rgba(239,120,110,.55)', 'rgba(213,43,30,.1)', 2, 8));
      mapa.addSource('piezas', { type: 'geojson', data: 'datos/historia-piezas.geojson', promoteId: 'id' });
      mapa.addSource('bordes', { type: 'geojson', data: 'datos/historia-bordes.geojson', lineMetrics: true });
      const est = ['coalesce', ['feature-state', 'e'], 'no'];
      const T = { duration: 1100 };
      mapa.addLayer({ id: 'p-solido', type: 'fill', source: 'piezas', paint: { 'fill-color': '#b89cff', 'fill-opacity': ['match', est, 'solido', .42, 'originario', 0, 0], 'fill-opacity-transition': T } });
      mapa.addLayer({ id: 'p-origen', type: 'fill', source: 'piezas', paint: { 'fill-color': '#d4a943', 'fill-opacity': ['match', est, 'originario', .38, 0], 'fill-opacity-transition': T } });
      mapa.addLayer({ id: 'p-admin', type: 'fill', source: 'piezas', filter: ['==', ['get', 'id'], '__'], paint: { 'fill-pattern': 't-admin', 'fill-opacity': .95 } });
      mapa.addLayer({ id: 'p-reclamo', type: 'fill', source: 'piezas', filter: ['==', ['get', 'id'], '__'], paint: { 'fill-pattern': 't-reclamo', 'fill-opacity': .8 } });
      mapa.addLayer({ id: 'p-mapuche', type: 'fill', source: 'piezas', filter: ['==', ['get', 'id'], '__'], paint: { 'fill-pattern': 't-mapuche', 'fill-opacity': .95 } });
      mapa.addLayer({ id: 'p-realista', type: 'fill', source: 'piezas', filter: ['==', ['get', 'id'], '__'], paint: { 'fill-pattern': 't-realista', 'fill-opacity': .95 } });
      mapa.addLayer({ id: 'p-destello', type: 'fill', source: 'piezas', paint: { 'fill-color': ['match', ['coalesce', ['feature-state', 'f'], 'no'], 'perdido', '#ff5a4a', 'tierra', '#e9c46a', '#ffffff'], 'fill-opacity': ['match', ['coalesce', ['feature-state', 'f'], 'no'], 'no', 0, .55], 'fill-opacity-transition': { duration: 1600 } } });
      // bordes: halo + línea fina, según estado
      const colBorde = ['match', est, 'solido', '#dfe8f7', 'administrado', '#d9d3ec', 'reclamado', 'rgba(248,246,240,.6)', 'mapuche', '#e9c46a', 'originario', '#e9c46a', 'realista', '#ef786e', 'ajeno', 'rgba(248,246,240,.45)', 'rgba(0,0,0,0)'];
      mapa.addLayer({ id: 'b-halo', type: 'line', source: 'piezas', paint: { 'line-color': colBorde, 'line-width': ['match', est, 'solido', 7, 0], 'line-blur': 6, 'line-opacity': .45 } });
      mapa.addLayer({ id: 'b-linea', type: 'line', source: 'piezas', paint: { 'line-color': colBorde, 'line-width': ['match', est, 'solido', 1.4, 'ajeno', 1, 1.1], 'line-dasharray': [1, 0] } });
      mapa.addLayer({ id: 'b-ajeno', type: 'line', source: 'piezas', filter: ['==', ['get', 'id'], '__'], paint: { 'line-color': 'rgba(248,246,240,.55)', 'line-width': 1.2, 'line-dasharray': [2, 2] } });
      // trazo de luz que dibuja las fronteras nuevas
      mapa.addLayer({ id: 'trazo', type: 'line', source: 'bordes', filter: ['==', ['get', 'id'], '__'], layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-width': 3.2, 'line-blur': .6, 'line-gradient': ['interpolate', ['linear'], ['line-progress'], 0, 'rgba(255,255,255,0)', 1, 'rgba(255,255,255,0)'] } });
      listo = true; if (actual >= 0) pintar(actual, true);
    });
  }

  // paradas estrictamente crecientes entre 0 y 1
  function gradiente(paradas) {
    const exp = ['interpolate', ['linear'], ['line-progress']]; let ult = -1;
    for (let [x, c] of paradas) { x = Math.min(1, Math.max(0, x)); if (x <= ult) { if (ult >= 1) continue; x = Math.min(1, ult + 1e-5); } exp.push(x, c); ult = x; }
    return exp;
  }
  function filtroIds(ids) { return ids.length ? ['in', ['get', 'id'], ['literal', ids]] : ['==', ['get', 'id'], '__']; }

  function pintar(i, inmediato) {
    if (!listo) return;
    const p = pasos[i], e = estados[i];
    for (const f of ['arica', 'tarapaca', 'litoral', 'centro', 'araucania', 'valdivia', 'chiloe', 'aysen', 'magallanes', 'valles', 'puna', 'rapanui', 'tacna', 'patagonia_ar', 'antartica'])
      mapa.setFeatureState({ source: 'piezas', id: f }, { e: e[f] || 'no', f: 'no' });
    const ids = v => Object.keys(e).filter(k => e[k] === v);
    mapa.setFilter('p-admin', filtroIds(ids('administrado')));
    mapa.setFilter('p-reclamo', filtroIds(ids('reclamado')));
    mapa.setFilter('p-mapuche', filtroIds(ids('mapuche')));
    mapa.setFilter('p-realista', filtroIds(ids('realista')));
    mapa.setFilter('b-ajeno', filtroIds(ids('ajeno')));
    // destellos
    const destello = [...(p.ganado || []).map(k => [k, 'ganado']), ...(p.perdido || []).map(k => [k, 'perdido']), ...(p.destacar || []).map(k => [k, 'tierra'])];
    for (const [k, tipo] of destello) mapa.setFeatureState({ source: 'piezas', id: k }, { e: e[k] || (tipo === 'perdido' ? 'no' : 'no'), f: tipo });
    if (destello.length && !sinMovimiento) setTimeout(() => { for (const [k, tipo] of destello) if (tipo !== 'tierra') mapa.setFeatureState({ source: 'piezas', id: k }, { f: 'no' }); }, 900);
    // trazo de las fronteras ganadas
    cancelAnimationFrame(anim);
    const nuevas = p.ganado || [];
    mapa.setFilter('trazo', filtroIds(nuevas));
    if (nuevas.length && !sinMovimiento) {
      const t0 = performance.now(), dur = 2400;
      const paso = t => {
        const k = Math.min(1, (t - t0) / dur), cab = Math.max(.001, k), cola = Math.max(0, k - .35);
        const fin = k >= 1;
        mapa.setPaintProperty('trazo', 'line-gradient', fin
          ? ['interpolate', ['linear'], ['line-progress'], 0, 'rgba(255,255,255,0)', 1, 'rgba(255,255,255,0)']
          : gradiente([[0, 'rgba(223,232,247,0)'], [cola, 'rgba(223,232,247,0)'], [cola + (cab - cola) * .7, 'rgba(223,232,247,.9)'], [cab, '#ffffff'], [cab + .004, 'rgba(255,255,255,0)'], [1, 'rgba(255,255,255,0)']]));
        if (!fin) anim = requestAnimationFrame(paso);
      };
      anim = requestAnimationFrame(paso);
    }
    // rótulos de piezas y punto del hito
    rotulos.forEach(m => m.remove()); rotulos = [];
    for (const [k, v] of Object.entries(e)) {
      const r = H.rotulos[k]; if (!r || v === 'solido' || v === 'originario') continue;
      const el = document.createElement('div'); el.className = 'h-rotulo h-rotulo-' + v; el.textContent = r[1];
      rotulos.push(new maplibregl.Marker({ element: el }).setLngLat(r[0]).addTo(mapa));
    }
    marcador?.remove(); marcador = null;
    if (p.punto) {
      const el = document.createElement('div'); el.className = 'h-punto'; el.style.setProperty('--c', COLOR_TIPO[p.tipo]);
      el.innerHTML = `<i></i><span>${p.rotulo}</span>`;
      marcador = new maplibregl.Marker({ element: el, anchor: 'left' }).setLngLat(p.punto).addTo(mapa);
    }
    // cámara
    const c = { ...p.camara }; if (esCel()) { c.zoom -= .7; c.pitch = Math.min(c.pitch, 45); }
    const relleno = esCel() ? { top: 40, bottom: Math.round(innerHeight * .45), left: 10, right: 10 } : { top: 40, bottom: 90, left: Math.round(Math.min(innerWidth * .42, 600)), right: 40 };
    mapa.stop();
    if (inmediato || sinMovimiento) mapa.jumpTo({ ...c, padding: relleno });
    else mapa.flyTo({ ...c, padding: relleno, duration: 3000, curve: 1.45, essential: true });
  }

  function ir(i) {
    if (i === actual) return;
    const antes = actual; actual = i;
    const dial = $('#h-dial'), p = pasos[i];
    dial.classList.remove('gira'); void dial.offsetWidth; dial.classList.add('gira');
    dial.textContent = p.anio; dial.classList.toggle('largo', p.anio.length > 6);
    dial.style.setProperty('--c', COLOR_TIPO[p.tipo]);
    linea.querySelectorAll('button').forEach((b, j) => { b.setAttribute('aria-current', j === i); b.classList.toggle('pasado', j < i); });
    linea.querySelector(`button[data-k="${i}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    cont.querySelectorAll('.h-paso').forEach((a, j) => a.classList.toggle('activo', j === i));
    pintar(i, antes < 0);
    chispas(p.ganado?.length ? 'ganado' : p.perdido?.length ? 'perdido' : null);
  }

  // chispas de luz al ganar o perder territorio
  const cv = $('#h-chispas'), g = cv.getContext('2d'); let parts = [], rafC = 0;
  function chispas(tipo) {
    if (!tipo || sinMovimiento) return;
    const W = cv.width = cv.clientWidth, Hh = cv.height = cv.clientHeight;
    const cx = esCel() ? W / 2 : W * .66, cy = esCel() ? Hh * .3 : Hh * .5;
    const col = tipo === 'perdido' ? '255,110,95' : '220,245,255';
    for (let k = 0; k < 90; k++) { const a = Math.random() * 6.28, v = 1 + Math.random() * 4; parts.push({ x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, v: 1, col }); }
    if (!rafC) rafC = requestAnimationFrame(animar);
  }
  function animar() {
    g.clearRect(0, 0, cv.width, cv.height);
    parts = parts.filter(p => (p.v -= .018) > 0);
    for (const p of parts) { p.x += p.vx; p.y += p.vy; p.vx *= .97; p.vy *= .97; g.fillStyle = `rgba(${p.col},${p.v})`; g.fillRect(p.x, p.y, 2, 2); }
    rafC = parts.length ? requestAnimationFrame(animar) : 0;
  }

  // el mapa se crea al acercarse; el hito activo es la tarjeta que cruza el centro
  new IntersectionObserver(([e], o) => { if (e.isIntersecting) { crear(); o.disconnect(); } }, { rootMargin: '600px' }).observe(sec);
  const obs = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) ir(+e.target.dataset.i); }), { rootMargin: '-48% 0px -48% 0px' });
  cont.querySelectorAll('.h-paso').forEach(a => obs.observe(a));
  addEventListener('resize', () => actual >= 0 && pintar(actual, true));
  ir(0);
}
