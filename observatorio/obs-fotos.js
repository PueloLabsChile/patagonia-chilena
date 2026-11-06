// Fotos de terreno: lectura de EXIF (GPS, dirección, altitud, hora), reducción en el navegador
// y ubicación por recorrido GPX (cruce de la hora de la foto con la hora del GPS).
// Requiere window.exifr (exifr lite).

export const TEMAS = { paisaje: 'Paisaje', hielo: 'Glaciares y hielo', agua: 'Ríos, lagos y mar', fauna: 'Fauna', flora: 'Flora y bosque',
  fuego: 'Incendios', obras: 'Obras y actividad humana', predios: 'Predios y límites', comunidad: 'Comunidad y patrimonio', otro: 'Otro' };
export const COLOR_TEMA = { paisaje: '#4f6d7a', hielo: '#3d8fb8', agua: '#2f6f8f', fauna: '#a0662a', flora: '#3f7a4a', fuego: '#b8392c',
  obras: '#6b4c9a', predios: '#c0782f', comunidad: '#8a5a44', otro: '#6d716c' };
export const CAJA = { latN: -43.3, latS: -56.7, lonO: -76.6, lonE: -66.0 };
export const dentroCaja = (lon, lat) => lat <= CAJA.latN && lat >= CAJA.latS && lon >= CAJA.lonO && lon <= CAJA.lonE;

const dos = n => String(n).padStart(2, '0');
/** Date «ingenua» (hora de la cámara) → 'AAAA-MM-DD HH:MM' */
export const fechaTexto = d => d instanceof Date && !isNaN(d) ? `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())} ${dos(d.getHours())}:${dos(d.getMinutes())}` : null;

const PUNTOS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
export const rumboTexto = r => r == null ? null : `${PUNTOS[Math.round(r / 22.5) % 16]} · ${Math.round(r)}°`;

/** Lee los datos de una foto. No lanza error si no trae GPS. */
export async function leerFoto(file) {
  let m = {};
  try { m = await window.exifr.parse(file, { tiff: true, exif: true, gps: true, ifd1: false, interop: false, translateValues: true, reviveValues: true }) || {}; } catch { }
  const lat = Number.isFinite(m.latitude) ? m.latitude : null, lon = Number.isFinite(m.longitude) ? m.longitude : null;
  const fecha = m.DateTimeOriginal instanceof Date ? m.DateTimeOriginal : m.CreateDate instanceof Date ? m.CreateDate : null;
  // hora UTC real de la foto: con la zona que trae la cámara (OffsetTimeOriginal) o, si no, la del navegador
  let utc = null;
  if (fecha) {
    const off = String(m.OffsetTimeOriginal || m.OffsetTime || '').match(/^([+-])(\d\d):?(\d\d)$/);
    utc = off ? Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate(), fecha.getHours(), fecha.getMinutes(), fecha.getSeconds()) - (off[1] === '-' ? -1 : 1) * (+off[2] * 60 + +off[3]) * 60000
              : fecha.getTime();
  }
  const rumbo = Number.isFinite(m.GPSImgDirection) ? ((m.GPSImgDirection % 360) + 360) % 360 : null;
  const alt = Number.isFinite(m.GPSAltitude) ? (m.GPSAltitudeRef === 1 || m.GPSAltitudeRef === 'Below sea level' ? -m.GPSAltitude : m.GPSAltitude) : null;
  return {
    lat, lon, rumbo, altitud: alt == null ? null : Math.round(alt * 10) / 10, fecha, utc,
    tomada: fechaTexto(fecha), camara: [m.Make, m.Model].filter(Boolean).join(' ') || null,
    origen: lat != null && lon != null && !(lat === 0 && lon === 0) ? 'gps' : null,
  };
}

/** Reduce la foto a JPEG (borra todos los metadatos: solo viajan los datos que la persona decide publicar). */
export async function achicar(file, max, calidad = .84) {
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { throw new Error('Este navegador no puede abrir esa imagen. Usa JPG o PNG (las fotos HEIC de iPhone se pueden exportar como JPG).'); }
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h);
  cx.imageSmoothingQuality = 'high'; cx.drawImage(bmp, 0, 0, w, h); bmp.close?.();
  const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', calidad));
  return { blob, w, h };
}

/** Recorrido GPX → puntos ordenados por hora [{t, lon, lat, ele}] */
export function leerGPX(texto) {
  const doc = new DOMParser().parseFromString(texto, 'application/xml');
  const pts = [...doc.querySelectorAll('trkpt, rtept, wpt')].map(p => ({
    lat: +p.getAttribute('lat'), lon: +p.getAttribute('lon'),
    t: Date.parse(p.querySelector('time')?.textContent || ''), ele: parseFloat(p.querySelector('ele')?.textContent),
  })).filter(p => Number.isFinite(p.t) && Number.isFinite(p.lat) && Number.isFinite(p.lon)).sort((a, b) => a.t - b.t);
  if (!pts.length) throw new Error('El archivo GPX no trae puntos con hora. Necesita un recorrido grabado (track), no solo una ruta planificada.');
  return pts;
}

/** Ubica una hora (ms UTC) sobre el recorrido. Acepta hasta `tolerancia` minutos fuera de los extremos o entre puntos. */
export function ubicarEnRecorrido(pts, t, tolerancia = 10) {
  if (!pts?.length || !Number.isFinite(t)) return null;
  const tol = tolerancia * 60000;
  if (t < pts[0].t - tol || t > pts[pts.length - 1].t + tol) return null;
  if (t <= pts[0].t) return { ...pts[0], dif: pts[0].t - t };
  if (t >= pts[pts.length - 1].t) { const p = pts[pts.length - 1]; return { ...p, dif: t - p.t }; }
  let lo = 0, hi = pts.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (pts[m].t <= t) lo = m; else hi = m; }
  const a = pts[lo], b = pts[hi], k = (t - a.t) / ((b.t - a.t) || 1);
  if (b.t - a.t > tol * 3) return null;   // hueco largo en el recorrido: mejor no adivinar
  return { lat: a.lat + (b.lat - a.lat) * k, lon: a.lon + (b.lon - a.lon) * k, ele: Number.isFinite(a.ele) && Number.isFinite(b.ele) ? a.ele + (b.ele - a.ele) * k : null, dif: Math.min(t - a.t, b.t - t) };
}

/** Rumbo (0–360, desde el norte) entre dos puntos */
export function rumboEntre([lon1, lat1], [lon2, lat2]) {
  const r = Math.PI / 180, y = Math.sin((lon2 - lon1) * r) * Math.cos(lat2 * r);
  const x = Math.cos(lat1 * r) * Math.sin(lat2 * r) - Math.sin(lat1 * r) * Math.cos(lat2 * r) * Math.cos((lon2 - lon1) * r);
  return ((Math.atan2(y, x) / r) + 360) % 360;
}

/** Ícono de cono de visión (para symbol layers con icon-rotate) */
export function iconoCono(color = '#b8392c', px = 64) {
  const cv = document.createElement('canvas'); cv.width = cv.height = px;
  const c = cv.getContext('2d'), m = px / 2, r = px * .47;
  const g = c.createRadialGradient(m, m, 2, m, m, r); g.addColorStop(0, color + 'e6'); g.addColorStop(1, color + '00');
  c.fillStyle = g; c.beginPath(); c.moveTo(m, m); c.arc(m, m, r, -Math.PI / 2 - .52, -Math.PI / 2 + .52); c.closePath(); c.fill();
  return { width: px, height: px, data: c.getImageData(0, 0, px, px).data };
}

/** Punto en polígono (comunas): devuelve las propiedades de la comuna que contiene el punto */
export function comunaDe(fc, lon, lat) {
  const dentroAnillo = (an) => { let d = false; for (let i = 0, j = an.length - 1; i < an.length; j = i++) { const [xi, yi] = an[i], [xj, yj] = an[j]; if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) d = !d; } return d; };
  const dentroPol = pol => dentroAnillo(pol[0]) && !pol.slice(1).some(dentroAnillo);
  for (const f of fc?.features || []) {
    const g = f.geometry; if (!g) continue;
    if (g.type === 'Polygon' ? dentroPol(g.coordinates) : g.type === 'MultiPolygon' && g.coordinates.some(dentroPol)) return f.properties;
  }
  return null;
}

export const EMOJI_TEMA = { paisaje: '🏞', hielo: '🧊', agua: '🌊', fauna: '🦊', flora: '🌲', fuego: '🔥', obras: '🚧', predios: '📍', comunidad: '🏘', otro: '✨' };

/** Localidad más cercana (para sugerir «Cerca de Cochrane») */
export function cercana(fc, lon, lat) {
  let mejor = null, dmin = Infinity;
  const k = Math.cos(lat * Math.PI / 180);
  for (const f of fc?.features || []) {
    const [x, y] = f.geometry?.coordinates || []; if (x == null) continue;
    const d = ((x - lon) * k) ** 2 + (y - lat) ** 2;
    if (d < dmin) { dmin = d; mejor = f.properties; }
  }
  return mejor ? { ...mejor, km: Math.sqrt(dmin) * 111.2 } : null;
}

/** Ubicación del teléfono (promesa; null si la persona no da permiso o no hay señal GPS) */
export function ubicacionTelefono(timeout = 15000) {
  return new Promise(ok => {
    if (!navigator.geolocation) return ok(null);
    navigator.geolocation.getCurrentPosition(p => ok({ lat: p.coords.latitude, lon: p.coords.longitude, alt: p.coords.altitude, precision: p.coords.accuracy, t: Date.now() }),
      () => ok(null), { enableHighAccuracy: true, timeout, maximumAge: 60000 });
  });
}
