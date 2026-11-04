// Historia del territorio: línea de tiempo con mapa esquemático (regiones actuales del INE como referencia).
const $ = s => document.querySelector(s);
const COLOR = { frontera: '#a9dbe8', tierra: '#e3c690' };
const ANTARTICA = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[-90, -60], [-53, -60], [-53, -66.5], [-90, -66.5], [-90, -60]]] } };

export async function iniciarHistoria() {
  const sec = $('#historia'); if (!sec || !window.maplibregl) return;
  const H = await (await fetch('datos/historia.json')).json();
  const pasos = H.pasos;
  let i = 0, mapa, listo = false, reloj = 0, reproduciendo = true, visible = false, marcador = null;

  // línea de tiempo
  const linea = $('#h-linea');
  linea.innerHTML = pasos.map((p, k) => `<li><button type="button" data-k="${k}" style="--c:${COLOR[p.tipo]}" aria-label="${p.anio}: ${p.titulo}">${p.anio.replace('Antes de ', '< ')}</button></li>`).join('');
  linea.addEventListener('click', e => { const b = e.target.closest('button[data-k]'); if (b) { pausar(); ir(+b.dataset.k); } });
  $('#h-ant').onclick = () => { pausar(); ir((i - 1 + pasos.length) % pasos.length); };
  $('#h-sig').onclick = () => { pausar(); ir((i + 1) % pasos.length); };
  $('#h-play').onclick = () => (reproduciendo ? pausar() : reanudar());
  sec.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight') { pausar(); ir(Math.min(pasos.length - 1, i + 1)); }
    if (e.key === 'ArrowLeft') { pausar(); ir(Math.max(0, i - 1)); }
  });

  function pausar() { reproduciendo = false; $('#h-play').textContent = 'Reproducir'; clearTimeout(reloj); }
  function reanudar() { reproduciendo = true; $('#h-play').textContent = 'Pausar'; programar(); }
  function programar() { clearTimeout(reloj); if (reproduciendo && visible) reloj = setTimeout(() => ir((i + 1) % pasos.length), 6500); }

  function ir(k) {
    i = k; const p = pasos[k];
    const tipo = $('#h-tipo'); tipo.textContent = p.tipo === 'tierra' ? 'Propiedad de la tierra · ' + p.anio : 'Fronteras · ' + p.anio; tipo.className = 'h-tipo ' + p.tipo;
    $('#h-titulo').textContent = p.titulo; $('#h-texto').textContent = p.texto; $('#h-fuente').textContent = 'Fuente: ' + p.fuente;
    $('#h-anio-grande').textContent = p.anio; $('#h-anio-grande').classList.toggle('largo', p.anio.length > 6);
    const art = $('.historia-texto'); art.classList.remove('cambia'); void art.offsetWidth; art.classList.add('cambia');
    $('#h-rapanui').hidden = !p.rapanui;
    linea.querySelectorAll('button').forEach((b, j) => b.setAttribute('aria-current', j === k));
    linea.querySelector(`button[data-k="${k}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    pintar(); programar();
  }

  function pintar() {
    if (!listo) return;
    const p = pasos[i], dentro = new Set(p.regiones), luz = new Set(p.destacar);
    for (let r = 1; r <= 16; r++) mapa.setFeatureState({ source: 'reg', id: r }, { e: luz.has(r) ? 2 : dentro.has(r) ? 1 : 0 });
    mapa.setPaintProperty('reg-luz', 'line-color', COLOR[p.tipo]);
    mapa.setPaintProperty('reg-fill', 'fill-color', ['match', ['feature-state', 'e'], 2, p.tipo === 'tierra' ? '#7a6a45' : '#3f7d95', 1, '#1b4258', '#0a1822']);
    mapa.setPaintProperty('ant-fill', 'fill-opacity', p.antartica ? .55 : 0);
    mapa.setPaintProperty('ant-line', 'line-opacity', p.antartica ? .9 : 0);
    marcador?.remove(); marcador = null;
    if (p.punto) {
      const el = document.createElement('div'); el.className = 'rotulo-h'; el.textContent = '● ' + p.rotulo; el.style.borderColor = COLOR[p.tipo];
      marcador = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat(p.punto).addTo(mapa);
    }
    const sur = p.antartica ? -67.5 : -56.5;
    mapa.fitBounds([[-82, sur], [-62, -17.2]], { padding: 24, duration: 1400 });
  }

  // el mapa se crea al acercarse
  new IntersectionObserver(([e], o) => {
    if (!e.isIntersecting) return; o.disconnect();
    mapa = new maplibregl.Map({
      container: 'mapa-historia', interactive: false, attributionControl: false,
      style: { version: 8, sources: {}, layers: [{ id: 'f', type: 'background', paint: { 'background-color': 'rgba(0,0,0,0)' } }] },
      bounds: [[-82, -56.5], [-62, -17.2]], fitBoundsOptions: { padding: 24 },
    });
    mapa.on('load', () => {
      mapa.addSource('reg', { type: 'geojson', data: 'datos/chile-regiones.geojson', promoteId: 'cod' });
      mapa.addSource('ant', { type: 'geojson', data: ANTARTICA });
      mapa.addLayer({ id: 'ant-fill', type: 'fill', source: 'ant', paint: { 'fill-color': '#dff6ff', 'fill-opacity': 0, 'fill-opacity-transition': { duration: 900 } } });
      mapa.addLayer({ id: 'ant-line', type: 'line', source: 'ant', paint: { 'line-color': '#a9dbe8', 'line-width': 1, 'line-dasharray': [2, 2], 'line-opacity': 0 } });
      mapa.addLayer({ id: 'reg-fill', type: 'fill', source: 'reg', paint: { 'fill-color': '#0a1822', 'fill-color-transition': { duration: 900 } } });
      mapa.addLayer({ id: 'reg-borde', type: 'line', source: 'reg', paint: { 'line-color': ['case', ['>', ['coalesce', ['feature-state', 'e'], 0], 0], 'rgba(233,242,245,.35)', 'rgba(233,242,245,.12)'], 'line-width': .8, 'line-dasharray': [1, 0] } });
      mapa.addLayer({ id: 'reg-luz', type: 'line', source: 'reg', paint: { 'line-color': '#a9dbe8', 'line-width': 2.2, 'line-blur': 1.5, 'line-opacity': ['case', ['==', ['coalesce', ['feature-state', 'e'], 0], 2], 1, 0] } });
      listo = true; pintar();
    });
  }, { rootMargin: '300px' }).observe($('#mapa-historia'));

  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) programar(); else clearTimeout(reloj); }, { threshold: .35 }).observe(sec);
  ir(0);
}
