// Imágenes georreferenciadas: el investigador sube un plano, una foto aérea o un mapa antiguo y lo ubica sobre el mapa,
// arrastrando las 4 esquinas o con puntos de control (ajuste afín con 3+ puntos, o perspectiva con 4+). Todo en el navegador.
// Exporta KMZ (Google Earth, gx:LatLonQuad) y la imagen con su world file (QGIS/ArcGIS, WGS84).

const MERC = 40075016.686;   // circunferencia ecuatorial (m)
const fmt = (n, d = 0) => Number(n).toLocaleString('es-CL', { maximumFractionDigits: d });
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- álgebra: homografía cuadrado unitario → cuadrilátero, ajustes por mínimos cuadrados
function resolver(A, b) {   // Gauss con pivoteo parcial
  const n = b.length, M = A.map((f, i) => [...f, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-14) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((f, i) => f[n] / f[i]);
}
/** Mínimos cuadrados: filas de A (m×n) y b (m) → x (n), vía ecuaciones normales. */
function mc(A, b) {
  const n = A[0].length, N = Array.from({ length: n }, () => Array(n).fill(0)), y = Array(n).fill(0);
  A.forEach((f, i) => { for (let r = 0; r < n; r++) { y[r] += f[r] * b[i]; for (let c = 0; c < n; c++) N[r][c] += f[r] * f[c]; } });
  return resolver(N, y);
}
/** Homografía (8 parámetros, h33=1) desde pares (u,v)→(x,y). */
function homografia(pares) {
  const A = [], b = [];
  for (const [[u, v], [x, y]] of pares) {
    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]); b.push(x);
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y]); b.push(y);
  }
  const h = pares.length === 4 ? resolver(A, b) : mc(A, b);
  return h && (([u, v]) => { const w = h[6] * u + h[7] * v + 1; return [(h[0] * u + h[1] * v + h[2]) / w, (h[3] * u + h[4] * v + h[5]) / w]; });
}
function afin(pares) {
  const A = [], bx = [], by = [];
  for (const [[u, v], [x, y]] of pares) { A.push([u, v, 1]); bx.push(x); by.push(y); }
  const px = mc(A, bx), py = mc(A, by);
  return px && py && (([u, v]) => [px[0] * u + px[1] * v + px[2], py[0] * u + py[1] * v + py[2]]);
}
const ESQ_UV = [[0, 0], [1, 0], [1, 1], [0, 1]];   // sup-izq, sup-der, inf-der, inf-izq

export function crearImagenes({ mapa, aviso, A, C, verPestana, antesDe = 'z-pol' }) {
  const IMGS = new Map();
  let ed = null;        // edición en curso: { img, marcadores, modo, paso, uvPendiente }
  const merc = ([lon, lat]) => { const m = maplibregl.MercatorCoordinate.fromLngLat({ lng: lon, lat }); return [m.x, m.y]; };
  const geo = ([x, y]) => { const l = new maplibregl.MercatorCoordinate(x, y).toLngLat(); return [l.lng, l.lat]; };
  const metros = (a, b) => { const lat = geo(a)[1] * Math.PI / 180; return Math.hypot(a[0] - b[0], a[1] - b[1]) * MERC * Math.cos(lat); };
  const transf = img => homografia(ESQ_UV.map((uv, i) => [uv, merc(img.esquinas[i])]));

  // ---------- lectura y reducción de la imagen (máx. 4096 px por lado)
  async function leer(file) {
    const bmp = await createImageBitmap(file);
    const s = Math.min(1, 4096 / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * s), h = Math.round(bmp.height * s);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    cv.getContext('2d').drawImage(bmp, 0, 0, w, h);
    const png = /png|webp|gif/i.test(file.type);
    return { url: cv.toDataURL(png ? 'image/png' : 'image/jpeg', .9), w, h, ext: png ? 'png' : 'jpg' };
  }
  /** Ubica la imagen centrada en la vista, conservando su proporción. */
  function esquinasEnVista(w, h) {
    const cont = mapa.getContainer(), W = cont.clientWidth, H = cont.clientHeight;
    const k = Math.min(W * .62 / w, H * .62 / h), ww = w * k, hh = h * k, x0 = (W - ww) / 2, y0 = (H - hh) / 2;
    return [[x0, y0], [x0 + ww, y0], [x0 + ww, y0 + hh], [x0, y0 + hh]].map(p => { const l = mapa.unproject(p); return [l.lng, l.lat]; });
  }

  // ---------- capa en el mapa
  function dibujar(img) {
    const src = 'img-' + img.id;
    if (mapa.getSource(src)) { mapa.getSource(src).setCoordinates(img.esquinas); }
    else {
      mapa.addSource(src, { type: 'image', url: img.url, coordinates: img.esquinas });
      mapa.addLayer({ id: src + '-r', type: 'raster', source: src, layout: { visibility: img.visible ? 'visible' : 'none' }, paint: { 'raster-opacity': img.opacidad, 'raster-fade-duration': 0 } }, antesDe);
    }
  }
  function guardar(img) { A.guardarCapa({ ...img, tipo: 'imagen' }); }
  function quitar(img) {
    if (ed?.img === img) terminar();
    const src = 'img-' + img.id;
    if (mapa.getLayer(src + '-r')) mapa.removeLayer(src + '-r');
    if (mapa.getSource(src)) mapa.removeSource(src);
    IMGS.delete(img.id); A.borrarCapa(img.id); pintarLista();
  }

  // ---------- marcadores de edición
  function marcador(clase, txt = '') { const el = document.createElement('div'); el.className = 'mk-img ' + clase; el.textContent = txt; return el; }
  function ponerMarcadores() {
    quitarMarcadores();
    const img = ed.img, m = [];
    img.esquinas.forEach((c, i) => {
      const mk = new maplibregl.Marker({ element: marcador('mk-esq', ''), draggable: true }).setLngLat(c).addTo(mapa);
      mk.on('drag', () => { const l = mk.getLngLat(); img.esquinas[i] = [l.lng, l.lat]; dibujar(img); moverCentro(); pintarPuntos(); });
      mk.on('dragend', () => { img.ajuste = 'manual'; guardar(img); pintarEditor(); });
      m.push(mk);
    });
    const cen = new maplibregl.Marker({ element: marcador('mk-centro', '✥'), draggable: true }).setLngLat(centro(img)).addTo(mapa);
    let previo;
    cen.on('dragstart', () => { previo = merc(cen.getLngLat().toArray()); });
    cen.on('drag', () => {
      const ahora = merc(cen.getLngLat().toArray()), dx = ahora[0] - previo[0], dy = ahora[1] - previo[1]; previo = ahora;
      img.esquinas = img.esquinas.map(c => { const p = merc(c); return geo([p[0] + dx, p[1] + dy]); });
      img.puntos.forEach(p => { if (p.mapa) { /* el punto del terreno no se mueve: es la verdad */ } });
      dibujar(img); m.forEach((mk, i) => mk.setLngLat(img.esquinas[i])); pintarPuntos();
    });
    cen.on('dragend', () => { guardar(img); pintarEditor(); });
    ed.marcadores = m; ed.centro = cen;
  }
  const centro = img => { const s = img.esquinas.map(merc).reduce((a, p) => [a[0] + p[0] / 4, a[1] + p[1] / 4], [0, 0]); return geo(s); };
  function moverCentro() { ed?.centro?.setLngLat(centro(ed.img)); }
  function quitarMarcadores() { ed?.marcadores?.forEach(m => m.remove()); ed?.centro?.remove(); if (ed) { ed.marcadores = []; ed.centro = null; } }

  // ---------- puntos de control (en el mapa: línea de la imagen al terreno)
  function pintarPuntos() {
    const s = mapa.getSource('gcp'); if (!s) return;
    const fs = [];
    if (ed) {
      const T = transf(ed.img);
      ed.img.puntos.forEach((p, i) => {
        const enImg = geo(T(p.uv));
        fs.push({ type: 'Feature', properties: { n: i + 1, t: 'img' }, geometry: { type: 'Point', coordinates: enImg } });
        if (p.mapa) {
          fs.push({ type: 'Feature', properties: { n: i + 1, t: 'mapa' }, geometry: { type: 'Point', coordinates: p.mapa } });
          fs.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [enImg, p.mapa] } });
        }
      });
      if (ed.uvPendiente) fs.push({ type: 'Feature', properties: { n: ed.img.puntos.length + 1, t: 'img' }, geometry: { type: 'Point', coordinates: geo(T(ed.uvPendiente)) } });
    }
    s.setData({ type: 'FeatureCollection', features: fs });
  }
  /** Recalcula las esquinas con los puntos de control. */
  function ajustar() {
    const img = ed.img, ok = img.puntos.filter(p => p.mapa);
    const persp = img.perspectiva && ok.length >= 4;
    if (ok.length < 3) return;
    const pares = ok.map(p => [p.uv, merc(p.mapa)]);
    const T = persp ? homografia(pares) : afin(pares);
    if (!T) { aviso('Los puntos de control están alineados o repetidos: agrega puntos más separados.', true); return; }
    img.esquinas = ESQ_UV.map(uv => geo(T(uv)));
    img.ajuste = persp ? 'perspectiva' : 'afín';
    // error de cada punto (m) y error medio cuadrático
    ok.forEach(p => { p.error = metros(T(p.uv), merc(p.mapa)); });
    img.rms = Math.sqrt(ok.reduce((s, p) => s + p.error ** 2, 0) / ok.length);
    dibujar(img); ed.marcadores?.forEach((mk, i) => mk.setLngLat(img.esquinas[i])); moverCentro(); pintarPuntos(); guardar(img);
  }

  // ---------- editor (en la columna derecha)
  function editar(img) {
    if (ed && ed.img !== img) terminar(true);
    ed = { img, modo: ed?.img === img ? ed.modo : 'esquinas', uvPendiente: null };
    if (!mapa.getSource('gcp')) {
      mapa.addSource('gcp', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      mapa.addLayer({ id: 'gcp-l', type: 'line', source: 'gcp', filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': '#b8392c', 'line-width': 1.6, 'line-dasharray': [2, 1.5] } });
      mapa.addLayer({ id: 'gcp-p', type: 'circle', source: 'gcp', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 7, 'circle-color': ['case', ['==', ['get', 't'], 'mapa'], '#b8392c', 'rgba(255,255,255,.9)'], 'circle-stroke-color': '#b8392c', 'circle-stroke-width': 2 } });
      mapa.addLayer({ id: 'gcp-t', type: 'symbol', source: 'gcp', filter: ['==', ['geometry-type'], 'Point'], layout: { 'text-field': ['to-string', ['get', 'n']], 'text-font': ['Open Sans Bold'], 'text-size': 10, 'text-allow-overlap': true }, paint: { 'text-color': ['case', ['==', ['get', 't'], 'mapa'], '#ffffff', '#b8392c'] } });
    }
    ponerMarcadores(); pintarPuntos(); pintarEditor();
    document.getElementById('ficha').hidden = false;
    mapa.getCanvasContainer().classList.toggle('dibujando', ed.modo === 'puntos');
  }
  function terminar(silencio) {
    if (!ed) return;
    quitarMarcadores(); mapa.getCanvasContainer().classList.remove('dibujando');
    const img = ed.img; ed = null; pintarPuntos();
    if (!silencio) { guardar(img); pintarLista(); }
  }
  function pintarEditor() {
    if (!ed) return;
    const img = ed.img, ok = img.puntos.filter(p => p.mapa), cuerpo = document.getElementById('ficha-cuerpo');
    const paso = ed.modo !== 'puntos' ? '' : ed.uvPendiente
      ? `<div class="aviso-caja"><b>Punto ${img.puntos.length + 1} · paso 2 de 2.</b> Haz clic donde está ese lugar <b>en el mapa real</b>, o escribe sus coordenadas:
          <form id="gcp-coord" class="gcp-coord"><input name="c" placeholder="-45.5712, -72.0662 · 18S 728917 4949406" aria-label="Coordenadas del punto"><button class="h-btn">Usar</button></form></div>`
      : `<div class="aviso-caja"><b>Punto ${img.puntos.length + 1} · paso 1 de 2.</b> Haz clic <b>sobre la imagen</b> en un lugar que reconozcas (un cruce de caminos, una desembocadura, una esquina de la grilla).</div>`;
    cuerpo.innerHTML = `
      <div class="f-cab"><span class="etq" style="--c:#b8392c"><i></i>Imagen georreferenciada</span>
        <input class="f-nombre" id="img-nombre" value="${esc(img.nombre)}" maxlength="80" aria-label="Nombre de la imagen"></div>
      <p class="f-varios">${fmt(img.w)} × ${fmt(img.h)} px · ajuste: <b>${esc(img.ajuste || 'sin ajustar')}</b>${img.rms != null && ok.length >= 3 ? ` · error medio <b>${fmt(img.rms, 1)} m</b>` : ''}</p>
      <label class="op">Transparencia <input type="range" id="img-op" min="10" max="100" value="${Math.round(img.opacidad * 100)}"></label>
      <div class="vistas">
        <button type="button" data-modo="esquinas" aria-pressed="${ed.modo === 'esquinas'}" style="--c:#1c2326">Mover y estirar<small>Arrastra las 4 esquinas rojas y la cruz del centro</small></button>
        <button type="button" data-modo="puntos" aria-pressed="${ed.modo === 'puntos'}" style="--c:#b8392c">Puntos de control<small>Precisión: 3 o más pares imagen ↔ terreno</small></button>
      </div>
      ${paso}
      ${ed.modo === 'puntos' || img.puntos.length ? `
      <table class="t-ficha"><tr><th>Punto</th><td><b>Terreno · error</b></td></tr>
        ${img.puntos.map((p, i) => `<tr><th>${i + 1}</th><td>${p.mapa ? `${p.mapa[1].toFixed(5)}, ${p.mapa[0].toFixed(5)}${p.error != null ? ` · <b${p.error > 3 * (img.rms || 1) && p.error > 50 ? ' style="color:var(--acento)"' : ''}>${fmt(p.error, 1)} m</b>` : ''}` : 'falta ubicar en el mapa'} <button class="f-varios" data-borrar-pt="${i}" type="button" style="border:0;background:none;color:var(--acento);text-decoration:underline;cursor:pointer">quitar</button></td></tr>`).join('') || '<tr><td colspan="2">Aún no hay puntos.</td></tr>'}
      </table>
      <label class="marca"><input type="checkbox" id="img-persp" ${img.perspectiva ? 'checked' : ''}> Permitir perspectiva (fotos inclinadas, 4 o más puntos)</label>
      <p class="nota">Con 3 puntos se calcula un ajuste afín (escala, giro y traslado). Si un punto tiene un error mucho mayor que el resto, probablemente está mal ubicado: quítalo.</p>` : ''}
      <div class="f-acc">
        <button class="h-btn h-pri" id="img-listo" type="button">Listo</button>
        <button class="h-btn" id="img-vista" type="button">Traer a la vista</button>
        <button class="h-btn" id="img-kmz" type="button">KMZ · Google Earth</button>
        <button class="h-btn" id="img-wf" type="button">Imagen + world file</button>
        <button class="h-btn peligro" id="img-quitar" type="button">Quitar</button>
      </div>
      <p class="nota">La imagen queda guardada solo en este navegador. Esquinas (sup-izq → inf-izq): ${img.esquinas.map(c => `${c[1].toFixed(4)}, ${c[0].toFixed(4)}`).join(' · ')}</p>`;
    const q = s => document.getElementById(s);
    q('img-nombre').onchange = e => { img.nombre = e.target.value.trim() || img.nombre; guardar(img); pintarLista(); };
    q('img-op').oninput = e => { img.opacidad = e.target.value / 100; mapa.setPaintProperty('img-' + img.id + '-r', 'raster-opacity', img.opacidad); };
    q('img-op').onchange = () => guardar(img);
    cuerpo.querySelectorAll('[data-modo]').forEach(b => b.onclick = () => { ed.modo = b.dataset.modo; ed.uvPendiente = null; mapa.getCanvasContainer().classList.toggle('dibujando', ed.modo === 'puntos'); pintarPuntos(); pintarEditor(); });
    cuerpo.querySelectorAll('[data-borrar-pt]').forEach(b => b.onclick = () => { img.puntos.splice(+b.dataset.borrarPt, 1); ajustar(); pintarPuntos(); guardar(img); pintarEditor(); });
    const persp = q('img-persp'); if (persp) persp.onchange = e => { img.perspectiva = e.target.checked; ajustar(); pintarEditor(); };
    const fc = q('gcp-coord');
    if (fc) fc.onsubmit = e => { e.preventDefault(); const c = C.leerCoordenadas(fc.c.value); if (!c) return aviso('No entendí esas coordenadas. Ejemplos: -45.57, -72.06 · 18S 728917 4949406', true); fijarTerreno([c.lon, c.lat]); };
    q('img-listo').onclick = () => { terminar(); document.getElementById('ficha').hidden = true; aviso(`«${esc(img.nombre)}» quedó ubicada. Puedes editarla desde Mis datos.`); };
    q('img-vista').onclick = () => { img.esquinas = esquinasEnVista(img.w, img.h); img.puntos.forEach(p => { p.error = null; }); img.ajuste = 'manual'; dibujar(img); ponerMarcadores(); pintarPuntos(); guardar(img); pintarEditor(); };
    q('img-kmz').onclick = () => exportarKMZ(img);
    q('img-wf').onclick = () => exportarWorld(img);
    q('img-quitar').onclick = e => { if (e.target.dataset.seguro) { quitar(img); document.getElementById('ficha').hidden = true; } else { e.target.dataset.seguro = 1; e.target.textContent = '¿Seguro? Quitar'; setTimeout(() => { if (e.target.isConnected) { delete e.target.dataset.seguro; e.target.textContent = 'Quitar'; } }, 3500); } };
  }
  function fijarTerreno(lonlat) {
    ed.img.puntos.push({ uv: ed.uvPendiente, mapa: lonlat });
    ed.uvPendiente = null;
    ajustar(); pintarPuntos(); guardar(ed.img); pintarEditor();
    const n = ed.img.puntos.filter(p => p.mapa).length;
    if (n < 3) aviso(`Punto ${n} listo. Faltan ${3 - n} para calcular el ajuste.`);
    else aviso(`Ajuste ${ed.img.ajuste} con ${n} puntos · error medio ${fmt(ed.img.rms, 1)} m.`);
  }
  /** Clics en el mapa durante los puntos de control. Devuelve true si los consume. */
  function capturaClic(e) {
    if (!ed || ed.modo !== 'puntos') return false;
    const p = merc([e.lngLat.lng, e.lngLat.lat]);
    if (!ed.uvPendiente) {
      const T = transf(ed.img), inv = homografia(ESQ_UV.map(uv => [T(uv), uv]));
      const uv = inv(p);
      if (uv[0] < -.02 || uv[0] > 1.02 || uv[1] < -.02 || uv[1] > 1.02) { aviso('Ese clic quedó fuera de la imagen. Haz clic sobre la imagen.', true); return true; }
      ed.uvPendiente = [Math.min(1, Math.max(0, uv[0])), Math.min(1, Math.max(0, uv[1]))];
      pintarPuntos(); pintarEditor();
    } else fijarTerreno([e.lngLat.lng, e.lngLat.lat]);
    return true;
  }

  // ---------- exportar
  const base = img => img.nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'imagen';
  const blobDe = url => fetch(url).then(r => r.blob());
  function bajar(nombre, blob) { const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: nombre }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
  async function exportarKMZ(img) {
    const [tl, tr, br, bl] = img.esquinas, n = base(img), alfa = Math.round(img.opacidad * 255).toString(16).padStart(2, '0');
    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2"><Document><name>${esc(img.nombre)}</name>
<GroundOverlay><name>${esc(img.nombre)}</name><description>Georreferenciada en Observatorio Patagonia · ajuste ${esc(img.ajuste || 'manual')}${img.rms != null ? ` · error medio ${img.rms.toFixed(1)} m` : ''}</description>
<color>${alfa}ffffff</color><Icon><href>files/${n}.${img.ext}</href></Icon>
<gx:LatLonQuad><coordinates>${[bl, br, tr, tl].map(c => `${c[0]},${c[1]},0`).join(' ')}</coordinates></gx:LatLonQuad></GroundOverlay></Document></kml>`;
    const zip = new JSZip(); zip.file('doc.kml', kml); zip.file(`files/${n}.${img.ext}`, await blobDe(img.url));
    bajar(n + '.kmz', await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.google-earth.kmz' }));
  }
  async function exportarWorld(img) {
    // afín desde las esquinas (si hay perspectiva, es una aproximación)
    const [tl, tr, , bl] = img.esquinas, W = img.w, H = img.h;
    const Ax = (tr[0] - tl[0]) / W, Bx = (bl[0] - tl[0]) / H, Dy = (tr[1] - tl[1]) / W, Ey = (bl[1] - tl[1]) / H;
    const wf = [Ax, Dy, Bx, Ey, tl[0] + Ax / 2 + Bx / 2, tl[1] + Dy / 2 + Ey / 2].map(v => v.toFixed(12)).join('\n') + '\n';
    const prj = 'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]';
    const n = base(img), zip = new JSZip();
    zip.file(`${n}.${img.ext}`, await blobDe(img.url));
    zip.file(`${n}.${img.ext === 'png' ? 'pgw' : 'jgw'}`, wf);
    zip.file(`${n}.prj`, prj);
    zip.file('LEEME.txt', `Imagen georreferenciada en el Observatorio Patagonia (patagoniadechile.cl/observatorio).\nSistema: WGS 84 geográficas (EPSG:4326). Ábrela en QGIS o ArcGIS: el archivo .${img.ext === 'png' ? 'pgw' : 'jgw'} trae la ubicación.\nAjuste: ${img.ajuste || 'manual'}${img.rms != null ? ` · error medio ${img.rms.toFixed(1)} m` : ''}${img.ajuste === 'perspectiva' ? '\nOjo: el world file solo admite ajuste afín; para la perspectiva exacta usa el KMZ.' : ''}\n`);
    bajar(n + '-georreferenciada.zip', await zip.generateAsync({ type: 'blob' }));
  }

  // ---------- lista en «Mis datos»
  function pintarLista() {
    const caja = document.getElementById('mis-imagenes'); if (!caja) return;
    const l = [...IMGS.values()];
    caja.innerHTML = l.length ? `<h3 class="etq" style="margin:4px 0 2px">Imágenes georreferenciadas</h3>` + l.map(img => `
      <div class="mi" style="--c:#b8392c">
        <label class="capa-chk"><input type="checkbox" data-img-vis="${img.id}" ${img.visible ? 'checked' : ''}><span class="caja" style="background:url('${img.url}') center/cover"></span>
          <span class="capa-nom">${esc(img.nombre)}<small>${esc(img.ajuste || 'sin ajustar')}${img.rms != null ? ` · ±${fmt(img.rms, 0)} m` : ''}</small></span></label>
        <div class="mi-acc"><button data-img-ed="${img.id}" title="Editar ubicación" aria-label="Editar ubicación">✎</button><button data-img-ir="${img.id}" title="Acercar" aria-label="Acercar">⌕</button><button data-img-kmz="${img.id}" title="Descargar KMZ" aria-label="Descargar KMZ">↓</button></div>
      </div>`).join('') : '';
    document.getElementById('mis-vacio').hidden = l.length > 0 || document.querySelectorAll('#mis-capas .mi').length > 0;
    const n = document.getElementById('n-mis'); if (n) n.textContent = document.querySelectorAll('#mis-capas .mi').length + l.length;
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-img-ed],[data-img-ir],[data-img-kmz]'); if (!b) return;
    const img = IMGS.get(b.dataset.imgEd || b.dataset.imgIr || b.dataset.imgKmz);
    if (b.dataset.imgEd) editar(img);
    if (b.dataset.imgIr) { const xs = img.esquinas.map(c => c[0]), ys = img.esquinas.map(c => c[1]); mapa.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding: 60 }); }
    if (b.dataset.imgKmz) exportarKMZ(img);
  });
  document.addEventListener('change', e => {
    const id = e.target.dataset?.imgVis; if (!id) return;
    const img = IMGS.get(id); img.visible = e.target.checked;
    mapa.setLayoutProperty('img-' + id + '-r', 'visibility', img.visible ? 'visible' : 'none'); guardar(img);
  });
  document.getElementById('ficha-cerrar')?.addEventListener('click', () => terminar());
  addEventListener('keydown', e => { if (e.key === 'Escape' && ed?.uvPendiente) { ed.uvPendiente = null; pintarPuntos(); pintarEditor(); } });

  return {
    capturaClic,
    editando: () => !!ed,
    /** Nueva imagen desde un archivo: la ubica en la vista y abre el editor. */
    async subir(file) {
      const r = await leer(file);
      const img = { id: 'img' + Date.now().toString(36), nombre: file.name.replace(/\.[^.]+$/, ''), url: r.url, w: r.w, h: r.h, ext: r.ext,
                    esquinas: esquinasEnVista(r.w, r.h), opacidad: .75, visible: true, puntos: [], perspectiva: false, ajuste: 'sin ajustar', rms: null, creado: Date.now() };
      IMGS.set(img.id, img); dibujar(img); guardar(img); verPestana?.('mis'); pintarLista(); editar(img);
      aviso('Imagen cargada en el centro del mapa. Arrastra sus esquinas o usa «Puntos de control» para ubicarla con precisión.', false, 7000);
    },
    restaurar(m) { const img = { ...m }; delete img.tipo; IMGS.set(img.id, img); dibujar(img); pintarLista(); },
    pintarLista,
  };
}
