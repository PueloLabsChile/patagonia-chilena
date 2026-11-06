// Archivos del investigador: lectura (GeoJSON, KML/KMZ, GPX, Shapefile .zip, CSV/TXT, fotos con GPS), exportación y guardado local.
import { deUTM, leerCoordenadas } from './obs-coords.js?v=1794005392';

const ext = n => (n.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase() || '';
export const FORMATOS = '.geojson,.json,.kml,.kmz,.gpx,.zip,.csv,.txt,.tsv,.jpg,.jpeg,.png,.heic,.tif,.tiff';

/** Lee un archivo y devuelve {nombre, fc, nota}. Lanza Error con un mensaje claro si no se puede. */
export async function leerArchivo(file) {
  const e = ext(file.name), nombre = file.name.replace(/\.[^.]+$/, '');
  if (e === 'geojson' || e === 'json') {
    let d; try { d = JSON.parse(await file.text()); } catch { throw new Error('El archivo JSON no es válido.'); }
    return { nombre, fc: normalizar(d) };
  }
  if (e === 'kml') return { nombre, fc: normalizar(toGeoJSON.kml(xml(await file.text()))) };
  if (e === 'gpx') return { nombre, fc: normalizar(toGeoJSON.gpx(xml(await file.text()))) };
  if (e === 'kmz') {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const k = Object.values(zip.files).find(f => /\.kml$/i.test(f.name));
    if (!k) throw new Error('El KMZ no trae ningún .kml adentro.');
    return { nombre, fc: normalizar(toGeoJSON.kml(xml(await k.async('text')))) };
  }
  if (e === 'zip') {
    let r; try { r = await shp(await file.arrayBuffer()); } catch (err) { throw new Error('No se pudo leer el Shapefile: el .zip debe traer al menos .shp, .shx, .dbf y .prj.'); }
    const lista = Array.isArray(r) ? r : [r];
    const fc = { type: 'FeatureCollection', features: lista.flatMap(x => x.features || []) };
    return { nombre, fc: normalizar(fc), nota: lista.length > 1 ? `${lista.length} capas unidas` : '' };
  }
  if (e === 'csv' || e === 'txt' || e === 'tsv') return { nombre, ...leerCSV(await file.text()) };
  if (['jpg', 'jpeg', 'png', 'heic', 'tif', 'tiff'].includes(e)) {
    if ((e === 'tif' || e === 'tiff') && file.size > 3e6) throw new Error('Los GeoTIFF (imágenes satelitales y rásters) llegan en la etapa 2, junto con la teledetección.');
    const gps = await exifr.gps(file).catch(() => null);
    if (!gps || !Number.isFinite(gps.latitude)) throw new Error(`«${file.name}» no trae coordenadas GPS en sus datos (EXIF).`);
    const meta = await exifr.parse(file, ['DateTimeOriginal', 'Make', 'Model', 'GPSAltitude']).catch(() => ({})) || {};
    const foto = await miniatura(file);
    const p = { nombre: file.name, foto, fecha: meta.DateTimeOriginal ? new Date(meta.DateTimeOriginal).toLocaleString('es-CL') : undefined,
                camara: [meta.Make, meta.Model].filter(Boolean).join(' ') || undefined, altitud_m: meta.GPSAltitude ? Math.round(meta.GPSAltitude) : undefined };
    return { nombre: 'Fotos de terreno', fc: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: p, geometry: { type: 'Point', coordinates: [gps.longitude, gps.latitude] } }] }, esFoto: true };
  }
  throw new Error(`Formato .${e || '?'} no reconocido. Usa GeoJSON, KML/KMZ, GPX, Shapefile (.zip), CSV o fotos con GPS.`);
}

const xml = t => new DOMParser().parseFromString(t, 'text/xml');

function normalizar(d) {
  let fc;
  if (d?.type === 'FeatureCollection') fc = d;
  else if (d?.type === 'Feature') fc = { type: 'FeatureCollection', features: [d] };
  else if (d?.type && d.coordinates) fc = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: d }] };
  else throw new Error('No encontré geometrías en el archivo.');
  fc.features = fc.features.filter(f => f && f.geometry && f.geometry.type);
  fc.features.forEach(f => { f.properties = f.properties || {}; });
  if (!fc.features.length) throw new Error('El archivo no tiene geometrías.');
  // aviso si viene en coordenadas proyectadas (p. ej. UTM sin reproyectar)
  const c = primeraCoord(fc.features[0].geometry);
  if (c && (Math.abs(c[0]) > 180 || Math.abs(c[1]) > 90)) throw new Error('Las coordenadas parecen proyectadas (UTM u otra). Expórtalo en WGS84 (EPSG:4326) o usa un Shapefile con su .prj.');
  return fc;
}
function primeraCoord(g) { let c = g.coordinates; if (g.type === 'GeometryCollection') return primeraCoord(g.geometries[0]); while (Array.isArray(c) && Array.isArray(c[0])) c = c[0]; return c; }

/** CSV/TXT con columnas de latitud/longitud, UTM (este/norte + huso) o una columna de coordenadas en texto. */
export function leerCSV(texto) {
  texto = texto.replace(/^﻿/, '');
  const lineas = texto.split(/\r?\n/).filter(l => l.trim());
  if (lineas.length < 2) throw new Error('El CSV necesita una fila de títulos y al menos una fila de datos.');
  const sep = [';', '\t', ',', '|'].map(s => [s, (lineas[0].match(new RegExp(s === '|' ? '\\|' : s, 'g')) || []).length]).sort((a, b) => b[1] - a[1])[0][0];
  const filas = lineas.map(l => partir(l, sep));
  const cab = filas[0].map(h => h.trim());
  const n = cab.map(h => h.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, ''));
  const col = (...ops) => n.findIndex(h => ops.includes(h));
  const iLat = col('lat', 'latitud', 'latitude', 'y', 'coordy', 'lat_dd', 'latdd');
  const iLon = col('lon', 'lng', 'long', 'longitud', 'longitude', 'x', 'coordx', 'londd');
  const iE = col('este', 'utme', 'utmeste', 'easting', 'e', 'coorde', 'x_utm', 'xutm');
  const iN = col('norte', 'utmn', 'utmnorte', 'northing', 'n', 'coordn', 'y_utm', 'yutm');
  const iH = col('huso', 'zona', 'zone', 'utmzone', 'husoutm');
  const iC = col('coordenadas', 'coordenada', 'coords', 'ubicacion', 'punto');
  const nro = s => Number(String(s ?? '').trim().replace(/\s/g, '').replace(/,(?=\d+$)/, '.'));
  const feats = []; let malas = 0, como = '';
  for (const r of filas.slice(1)) {
    let lon, lat;
    if (iLat >= 0 && iLon >= 0) {
      lat = nro(r[iLat]); lon = nro(r[iLon]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) { const c = leerCoordenadas(`${r[iLat]} ${r[iLon]}`); if (c) ({ lat, lon } = c); }
      if (Math.abs(lat) > 90 && Math.abs(lon) <= 90) [lat, lon] = [lon, lat];
      como = 'latitud/longitud';
    } else if (iE >= 0 && iN >= 0) {
      const h = iH >= 0 ? parseInt(r[iH]) : (nro(r[iE]) > 0 ? 18 : 18);
      [lon, lat] = deUTM(h || 18, nro(r[iE]), nro(r[iN]), true); como = `UTM huso ${iH >= 0 ? 'según columna' : '18S (no venía columna «huso»)'}`;
    } else if (iC >= 0) {
      const c = leerCoordenadas(r[iC] || ''); if (c) ({ lat, lon } = c); como = 'columna de coordenadas';
    } else throw new Error('No encontré columnas de coordenadas. Usa «latitud» y «longitud», o «este», «norte» y «huso» (UTM).');
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) { malas++; continue; }
    const p = {}; cab.forEach((h, i) => { if (h && r[i] !== undefined && r[i] !== '') p[h] = r[i]; });
    feats.push({ type: 'Feature', properties: p, geometry: { type: 'Point', coordinates: [lon, lat] } });
  }
  if (!feats.length) throw new Error('Ninguna fila tenía coordenadas válidas.');
  return { fc: { type: 'FeatureCollection', features: feats }, nota: `${como}${malas ? ` · ${malas} filas sin coordenadas válidas` : ''}` };
}
function partir(l, sep) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < l.length; i++) {
    const ch = l[i];
    if (ch === '"') { if (q && l[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (ch === sep && !q) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur); return out;
}

async function miniatura(file) {
  try {
    const bmp = await createImageBitmap(file);
    const s = 320 / Math.max(bmp.width, bmp.height), c = document.createElement('canvas');
    c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', .72);
  } catch { return undefined; }
}

// ---------- exportación
export function descargar(nombre, contenido, tipo) {
  const url = URL.createObjectURL(contenido instanceof Blob ? contenido : new Blob([contenido], { type: tipo }));
  const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
const sinFoto = fc => ({ ...fc, features: fc.features.map(f => { const { foto, ...p } = f.properties || {}; return { ...f, properties: p }; }) });
export const aGeoJSON = fc => JSON.stringify(sinFoto(fc));

const esc = s => String(s ?? '').replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
export function aKML(fc, nombre) {
  const coords = c => c.map(p => p.slice(0, 2).join(',')).join(' ');
  const geom = g => {
    switch (g.type) {
      case 'Point': return `<Point><coordinates>${g.coordinates.slice(0, 2).join(',')}</coordinates></Point>`;
      case 'LineString': return `<LineString><coordinates>${coords(g.coordinates)}</coordinates></LineString>`;
      case 'Polygon': return `<Polygon>${g.coordinates.map((r, i) => `<${i ? 'inner' : 'outer'}BoundaryIs><LinearRing><coordinates>${coords(r)}</coordinates></LinearRing></${i ? 'inner' : 'outer'}BoundaryIs>`).join('')}</Polygon>`;
      case 'MultiPoint': return `<MultiGeometry>${g.coordinates.map(c => geom({ type: 'Point', coordinates: c })).join('')}</MultiGeometry>`;
      case 'MultiLineString': return `<MultiGeometry>${g.coordinates.map(c => geom({ type: 'LineString', coordinates: c })).join('')}</MultiGeometry>`;
      case 'MultiPolygon': return `<MultiGeometry>${g.coordinates.map(c => geom({ type: 'Polygon', coordinates: c })).join('')}</MultiGeometry>`;
      case 'GeometryCollection': return `<MultiGeometry>${g.geometries.map(geom).join('')}</MultiGeometry>`;
    }
    return '';
  };
  const pm = sinFoto(fc).features.map(f => {
    const p = f.properties || {}, n = p.nombre || p.name || p.titulo || '';
    const datos = Object.entries(p).map(([k, v]) => `<Data name="${esc(k)}"><value>${esc(typeof v === 'object' ? JSON.stringify(v) : v)}</value></Data>`).join('');
    return `<Placemark><name>${esc(n)}</name><ExtendedData>${datos}</ExtendedData>${geom(f.geometry)}</Placemark>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${esc(nombre)}</name>\n${pm}\n</Document></kml>`;
}
export function aCSV(fc, centroide) {
  const fs = sinFoto(fc).features;
  const claves = [...new Set(fs.flatMap(f => Object.keys(f.properties || {})))];
  const q = v => { const s = typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const filas = fs.map(f => { const [lon, lat] = centroide(f.geometry); return [lat?.toFixed(6), lon?.toFixed(6), f.geometry.type, ...claves.map(k => f.properties[k])].map(q).join(';'); });
  return '﻿' + ['latitud;longitud;geometria;' + claves.map(q).join(';'), ...filas].join('\r\n');
}

// ---------- guardado local (IndexedDB): las capas del investigador quedan en su navegador
const BD = 'observatorio-patagonia', ALM = 'capas';
function abrir() {
  return new Promise((ok, mal) => {
    try {
      const r = indexedDB.open(BD, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(ALM, { keyPath: 'id' });
      r.onsuccess = () => ok(r.result); r.onerror = () => mal(r.error);
    } catch (e) { mal(e); }
  });
}
async function tx(modo, fn) {
  try {
    const db = await abrir();
    return await new Promise((ok, mal) => { const t = db.transaction(ALM, modo); const r = fn(t.objectStore(ALM)); t.oncomplete = () => ok(r?.result); t.onerror = () => mal(t.error); });
  } catch { return undefined; }
}
export const guardarCapa = c => tx('readwrite', s => s.put(c));
export const borrarCapa = id => tx('readwrite', s => s.delete(id));
export const leerCapas = async () => (await tx('readonly', s => s.getAll())) || [];
