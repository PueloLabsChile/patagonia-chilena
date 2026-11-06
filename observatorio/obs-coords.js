// Coordenadas: UTM (WGS84) ida y vuelta, grados-minutos-segundos, lectura de lo que escribe el usuario y medidas geodésicas.
const a = 6378137, f = 1 / 298.257223563, k0 = 0.9996;
const e2 = f * (2 - f), ep2 = e2 / (1 - e2);
const R = Math.PI / 180;

export const husoDe = lon => Math.min(60, Math.max(1, Math.floor((lon + 180) / 6) + 1));

/** lon/lat → {huso, este, norte, hemisferio} (para Patagonia: husos 18 y 19, hemisferio sur). */
export function aUTM(lon, lat, huso = husoDe(lon)) {
  const φ = lat * R, λ = lon * R, λ0 = ((huso - 1) * 6 - 180 + 3) * R;
  const N = a / Math.sqrt(1 - e2 * Math.sin(φ) ** 2), T = Math.tan(φ) ** 2, C = ep2 * Math.cos(φ) ** 2, A = Math.cos(φ) * (λ - λ0);
  const M = a * ((1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * φ - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * φ)
    + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * φ) - (35 * e2 ** 3 / 3072) * Math.sin(6 * φ));
  const este = k0 * N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T ** 2 + 72 * C - 58 * ep2) * A ** 5 / 120) + 500000;
  let norte = k0 * (M + N * Math.tan(φ) * (A ** 2 / 2 + (5 - T + 9 * C + 4 * C ** 2) * A ** 4 / 24 + (61 - 58 * T + T ** 2 + 600 * C - 330 * ep2) * A ** 6 / 720));
  if (lat < 0) norte += 10000000;
  return { huso, este, norte, hemisferio: lat < 0 ? 'S' : 'N' };
}

/** UTM → [lon, lat]. */
export function deUTM(huso, este, norte, sur = true) {
  const x = este - 500000, y = sur ? norte - 10000000 : norte, λ0 = ((huso - 1) * 6 - 180 + 3) * R;
  const M = y / k0, μ = M / (a * (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const φ1 = μ + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * μ) + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * μ)
    + (151 * e1 ** 3 / 96) * Math.sin(6 * μ) + (1097 * e1 ** 4 / 512) * Math.sin(8 * μ);
  const N1 = a / Math.sqrt(1 - e2 * Math.sin(φ1) ** 2), T1 = Math.tan(φ1) ** 2, C1 = ep2 * Math.cos(φ1) ** 2;
  const R1 = a * (1 - e2) / (1 - e2 * Math.sin(φ1) ** 2) ** 1.5, D = x / (N1 * k0);
  const φ = φ1 - (N1 * Math.tan(φ1) / R1) * (D ** 2 / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 ** 2 - 9 * ep2) * D ** 4 / 24
    + (61 + 90 * T1 + 298 * C1 + 45 * T1 ** 2 - 252 * ep2 - 3 * C1 ** 2) * D ** 6 / 720);
  const λ = λ0 + (D - (1 + 2 * T1 + C1) * D ** 3 / 6 + (5 - 2 * C1 + 28 * T1 - 3 * C1 ** 2 + 8 * ep2 + 24 * T1 ** 2) * D ** 5 / 120) / Math.cos(φ1);
  return [λ / R, φ / R];
}

/** -45.5712 → 45°34'16,3"S */
export function aGMS(v, eje) {
  const s = v < 0 ? (eje === 'lat' ? 'S' : 'O') : (eje === 'lat' ? 'N' : 'E');
  let x = Math.abs(v), g = Math.floor(x), m = Math.floor((x - g) * 60), sg = ((x - g) * 60 - m) * 60;
  if (sg >= 59.95) { sg = 0; m++; } if (m === 60) { m = 0; g++; }
  return `${g}°${String(m).padStart(2, '0')}'${sg.toFixed(1).padStart(4, '0').replace('.', ',')}"${s}`;
}

const num = s => Number(String(s).replace(',', '.'));

/** Interpreta lo que escribe el usuario. Devuelve {lon, lat, como} o null.
    Acepta: «-45.57, -72.07» · «45°34'12"S 72°4'W» · «45 34 12 S 72 4 0 O» · «18S 700123 4950123» · «19G 600000 4800000» */
export function leerCoordenadas(t) {
  t = t.trim().replace(/[″”]/g, '"').replace(/[′’]/g, "'").replace(/\s+/g, ' ');
  // UTM: huso (+ banda opcional) este norte
  let m = t.match(/^(1[89]|[1-6]?\d)\s*([C-HJ-NP-X])?\s*[, ]\s*(\d{5,7}(?:[.,]\d+)?)\s*(?:m?\s*E)?\s*[, ]\s*(\d{6,8}(?:[.,]\d+)?)\s*(?:m?\s*[NS])?$/i);
  if (m) {
    const huso = +m[1], banda = (m[2] || 'S').toUpperCase(), sur = banda === 'S' || (banda !== 'N' && banda < 'N');
    const [lon, lat] = deUTM(huso, num(m[3]), num(m[4]), sur);
    if (Number.isFinite(lon) && Math.abs(lat) <= 90) return { lon, lat, como: `UTM ${huso}${sur ? 'S' : 'N'}` };
  }
  // GMS / grados-minutos con hemisferio
  const gms = /(\d{1,3})\s*[°º d]\s*(?:(\d{1,2}(?:[.,]\d+)?)\s*['m ]\s*)?(?:(\d{1,2}(?:[.,]\d+)?)\s*(?:"|''|s)?\s*)?([NSEOW])/gi;
  const partes = [...t.matchAll(gms)];
  if (partes.length === 2) {
    const v = p => (num(p[1]) + num(p[2] || 0) / 60 + num(p[3] || 0) / 3600) * (/[SOW]/i.test(p[4]) ? -1 : 1);
    let [x, y] = partes.map(v);
    if (/[EOW]/i.test(partes[0][4])) [x, y] = [y, x];
    return { lat: x, lon: y, como: 'GMS' };
  }
  // decimales: «lat, lon» (si el primero cae fuera de ±90 se asume «lon, lat»)
  m = t.match(/^(-?\d{1,3}(?:[.]\d+)?)\s*[,; ]\s*(-?\d{1,3}(?:[.]\d+)?)$/) || t.match(/^(-?\d{1,3}(?:,\d+)?)\s*[; ]\s*(-?\d{1,3}(?:,\d+)?)$/);
  if (m) {
    let lat = num(m[1]), lon = num(m[2]);
    if (Math.abs(lat) > 90) [lat, lon] = [lon, lat];
    // atajo para Patagonia: si escriben positivos, se entienden como sur y oeste
    if (lat > 40 && lat < 57 && lon > 65 && lon < 77) { lat = -lat; lon = -lon; }
    if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) return { lat, lon, como: 'grados decimales' };
  }
  return null;
}

// ---------- medidas geodésicas (esfera de radio medio; error < 0,5 %)
const RT = 6371008.8;
export function distancia([x1, y1], [x2, y2]) {
  const dφ = (y2 - y1) * R, dλ = (x2 - x1) * R;
  const h = Math.sin(dφ / 2) ** 2 + Math.cos(y1 * R) * Math.cos(y2 * R) * Math.sin(dλ / 2) ** 2;
  return 2 * RT * Math.asin(Math.min(1, Math.sqrt(h)));
}
export const largo = pts => pts.slice(1).reduce((s, p, i) => s + distancia(pts[i], p), 0);
/** Área de un anillo [[lon,lat],…] en m² */
export function areaAnillo(r) {
  let s = 0;
  for (let i = 0; i < r.length; i++) {
    const [x1, y1] = r[i], [x2, y2] = r[(i + 1) % r.length];
    s += (x2 - x1) * R * (2 + Math.sin(y1 * R) + Math.sin(y2 * R));
  }
  return Math.abs(s * RT * RT / 2);
}
export function areaGeom(g) {
  if (!g) return 0;
  if (g.type === 'Polygon') return areaAnillo(g.coordinates[0]) - g.coordinates.slice(1).reduce((s, r) => s + areaAnillo(r), 0);
  if (g.type === 'MultiPolygon') return g.coordinates.reduce((s, p) => s + areaGeom({ type: 'Polygon', coordinates: p }), 0);
  return 0;
}
export function largoGeom(g) {
  if (!g) return 0;
  if (g.type === 'LineString') return largo(g.coordinates);
  if (g.type === 'MultiLineString') return g.coordinates.reduce((s, l) => s + largo(l), 0);
  return 0;
}
export const fmtLargo = m => m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toLocaleString('es-CL', { maximumFractionDigits: m < 10000 ? 2 : 1 })} km`;
export const fmtArea = m2 => m2 < 10000 ? `${Math.round(m2).toLocaleString('es-CL')} m²`
  : m2 < 1e7 ? `${(m2 / 10000).toLocaleString('es-CL', { maximumFractionDigits: 2 })} ha`
  : `${(m2 / 1e6).toLocaleString('es-CL', { maximumFractionDigits: 1 })} km² · ${Math.round(m2 / 10000).toLocaleString('es-CL')} ha`;

/** Recorre todas las coordenadas de una geometría GeoJSON. */
export function cadaCoord(g, fn) {
  if (!g) return;
  if (g.type === 'GeometryCollection') return g.geometries.forEach(x => cadaCoord(x, fn));
  const rec = c => typeof c[0] === 'number' ? fn(c) : c.forEach(rec);
  rec(g.coordinates);
}
export function bbox(fc) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const f of fc.features || [fc]) cadaCoord(f.geometry, ([x, y]) => { if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y; });
  return b[0] === Infinity ? null : b;
}
