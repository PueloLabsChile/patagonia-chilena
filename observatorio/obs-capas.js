// Catálogo de capas del Observatorio Patagonia: fondos, capas oficiales (estáticas, servicios en vivo) y su simbología.
const MMA = 'https://arcgis.mma.gob.cl/server/rest/services/SIMBIO';

export const FONDOS = [
  { id: 'satelite', nombre: 'Satélite', nota: 'Esri World Imagery', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
    max: 19, atrib: 'Imágenes © Esri, Maxar, Earthstar Geographics' },
  { id: 's2', nombre: 'Sentinel-2 sin nubes', nota: 'Mosaico 2023 · 10 m', tiles: ['https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2023_3857/default/g/{z}/{y}/{x}.jpg'],
    max: 15, atrib: '<a href="https://s2maps.eu" target="_blank" rel="noopener">Sentinel-2 cloudless 2023</a> © EOX IT Services (datos Copernicus modificados 2023) · CC BY-NC-SA 4.0' },
  { id: 'topo', nombre: 'Topográfico', nota: 'OpenTopoMap', tiles: ['https://a.tile.opentopomap.org/{z}/{x}/{y}.png', 'https://b.tile.opentopomap.org/{z}/{x}/{y}.png', 'https://c.tile.opentopomap.org/{z}/{x}/{y}.png'],
    max: 17, atrib: '© colaboradores de OpenStreetMap · SRTM · estilo © OpenTopoMap (CC BY-SA)' },
  { id: 'oscuro', nombre: 'Oscuro', nota: 'Para leer capas', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'],
    max: 16, atrib: 'Mapa base © Esri, HERE, Garmin, © colaboradores de OpenStreetMap' },
];

export const GRUPOS = [
  { id: 'territorio', nombre: 'Territorio y predios' },
  { id: 'conservacion', nombre: 'Conservación' },
  { id: 'agua', nombre: 'Agua y hielo' },
  { id: 'vegetacion', nombre: 'Vegetación' },
  { id: 'actividad', nombre: 'Actividad humana' },
  { id: 'vivo', nombre: 'Monitoreo en vivo' },
];

const MBN = { fuente: 'Ministerio de Bienes Nacionales', enlace: 'https://geoportal.cl/mbn/index' };
const SIMBIO = { fuente: 'Ministerio del Medio Ambiente · SIMBIO', enlace: 'https://simbio.mma.gob.cl' };

/*  tipo: poligono | linea | punto | raster (servicio ArcGIS en vivo)
    color: color base; por: propiedad para colorear por categoría; cats: {valor: color}
    campos: etiquetas legibles para la ficha (el orden manda)                                    */
export const CAPAS = [
  // ---------- territorio y predios
  { id: 'comunas', grupo: 'territorio', nombre: 'Comunas', archivo: 'comunas.json', tipo: 'linea-limite', color: '#f3efe6', activa: true,
    fuente: 'INE · cartografía censal 2024', fecha: '2024', descr: 'Límites de las 20 comunas de Aysén y Magallanes.',
    titulo: p => p.comuna, campos: { comuna: 'Comuna', region: 'Región' } },
  { id: 'localidades', grupo: 'territorio', nombre: 'Localidades', archivo: 'localidades.json', tipo: 'punto-etiqueta', color: '#ffffff', activa: true,
    fuente: 'Ministerio de Obras Públicas · IDE MOP (asentamientos)', enlace: 'https://rest-sit.mop.gob.cl/arcgis/rest/services/MAPA_BASE/ASENTAMIENTOS/MapServer',
    descr: 'Capitales comunales y poblados.', titulo: p => p.nombre, campos: { nombre: 'Nombre', clase: 'Tipo', comuna: 'Comuna', pob_2002: 'Población (Censo 2002)' } },
  { id: 'predios', grupo: 'territorio', nombre: 'Predios fiscales', archivo: 'predios-fiscales.json', tipo: 'poligono', color: '#f0b45a', ...MBN,
    fecha: 'octubre 2026', descr: 'Inmuebles fiscales administrados por Bienes Nacionales (urbanos y rurales), con su rol de avalúo. Es la división predial pública disponible: el SII no publica dueños de predios privados.',
    titulo: p => 'Predio fiscal · rol ' + (p.rol || 's/r'), campos: { rol: 'Rol', comuna: 'Comuna', condicion: 'Condición', ha: 'Superficie (ha)', id_catastro: 'ID catastro MBN' } },
  { id: 'bnp', grupo: 'territorio', nombre: 'Bienes Nacionales Protegidos', archivo: 'bienes-protegidos.json', tipo: 'poligono', color: '#e3845b', ...MBN,
    fecha: 'mayo 2026', descr: 'Terrenos fiscales destinados a conservación por decreto del Ministerio de Bienes Nacionales.',
    titulo: p => p.nombre, campos: { nombre: 'Nombre', categoria: 'Categoría', comuna: 'Comuna', decreto: 'Decreto', plano: 'Plano', ha: 'Superficie (ha)' } },
  { id: 'vial', grupo: 'territorio', nombre: 'Red vial', archivo: 'red-vial.json', tipo: 'linea', color: '#e9dcc0',
    fuente: 'Dirección de Vialidad · MOP', enlace: 'https://rest-sit.mop.gob.cl/arcgis/rest/services/VIALIDAD/Red_Vial_Chile/MapServer',
    descr: 'Rutas enroladas: Carretera Austral (ruta 7), rutas 9, 255, 257 y caminos regionales.',
    titulo: p => (p.rol ? 'Ruta ' + p.rol : 'Camino') + (p.nombre ? ' · ' + p.nombre : ''), campos: { rol: 'Rol', nombre: 'Nombre', clase: 'Clasificación', carpeta: 'Carpeta', km: 'Largo del tramo (km)' } },

  // ---------- conservación
  { id: 'protegidas', grupo: 'conservacion', nombre: 'Áreas protegidas', archivo: 'areas-protegidas.json', tipo: 'poligono', color: '#5fbf8f', activa: true, ...SIMBIO,
    fecha: '2026', descr: 'Registro Nacional de Áreas Protegidas: parques, reservas y monumentos nacionales, conservación privada y otras designaciones.',
    por: 'grupo', cats: { 'Área protegida': '#5fbf8f', 'Conservación privada': '#c3dc6e', 'Otra designación': '#7cc6b6' },
    titulo: p => p.nombre, campos: { nombre: 'Nombre', designacion: 'Designación', grupo: 'Grupo', tipo: 'Tipo', desde: 'Protegida desde', autoridad: 'Administra', ha_decreto: 'Superficie decreto (ha)', km2: 'Superficie calculada (km²)', ficha: 'Ficha SIMBIO' } },
  { id: 'sitios', grupo: 'conservacion', nombre: 'Sitios prioritarios', archivo: 'sitios-prioritarios.json', tipo: 'poligono-trazo', color: '#c9a0ff', ...SIMBIO,
    descr: 'Sitios prioritarios para la conservación de la biodiversidad (Ley 21.600).',
    titulo: p => p.nombre, campos: { nombre: 'Nombre', designacion: 'Designación', km2: 'Superficie (km²)', ficha: 'Ficha SIMBIO' } },
  { id: 'marinas', grupo: 'conservacion', nombre: 'Áreas marinas protegidas', archivo: 'areas-marinas.json', tipo: 'poligono', color: '#4ea8de',
    fuente: 'Subsecretaría de Pesca y Acuicultura', enlace: 'https://geoportal.subpesca.cl', descr: 'Parques y reservas marinas, áreas marinas costeras protegidas.',
    titulo: p => p.nombre, campos: { nombre: 'Nombre', tipo: 'Tipo', decreto: 'Decreto', institucion: 'Institución', km2: 'Superficie (km²)' } },

  // ---------- agua y hielo
  { id: 'glaciares', grupo: 'agua', nombre: 'Glaciares', archivo: 'glaciares.json', tipo: 'poligono', color: '#d9f3ff', activa: true,
    fuente: 'Dirección General de Aguas · Inventario Público de Glaciares', enlace: 'https://dga.mop.gob.cl/inventario-publico-glaciares/', fecha: '2022',
    descr: 'Más de 8.000 glaciares mayores a 0,05 km², con clase, cuenca, alturas y volumen estimado.',
    titulo: p => p.nombre || 'Glaciar ' + (p.codigo || ''), campos: { nombre: 'Nombre', codigo: 'Código', clase: 'Clasificación', area_km2: 'Área (km²)', vol_km3: 'Volumen estimado (km³)', h_max: 'Altura máxima (m)', h_min: 'Altura mínima (m)', cuenca: 'Cuenca', fuente: 'Imagen fuente', fecha_fuente: 'Fecha imagen' } },
  { id: 'lagos', grupo: 'agua', nombre: 'Lagos y lagunas', archivo: 'lagos.json', tipo: 'poligono', color: '#3f86c6',
    fuente: 'Dirección General de Aguas · inventario de lagos', enlace: 'https://dga.mop.gob.cl', descr: 'Lagos y lagunas inventariados por la DGA.',
    titulo: p => p.nombre || 'Lago', campos: { nombre: 'Nombre', tipo: 'Tipo', altitud: 'Altitud (m)', clasificacion: 'Clasificación', uso: 'Uso', km2: 'Superficie (km²)' } },
  { id: 'humedales', grupo: 'agua', nombre: 'Humedales', tipo: 'raster', color: '#57c4b0', ...SIMBIO, vivo: true,
    servicio: MMA + '/SIMBIO_HUMEDALES/MapServer', capasServicio: 'show:0', consulta: MMA + '/SIMBIO_HUMEDALES/MapServer/0',
    descr: 'Inventario Nacional de Humedales (60.000 polígonos en la zona): se dibuja en vivo desde el servidor del MMA.',
    titulo: p => p.NOM_HUMDET || p.NOM_HUMMASTER || 'Humedal', campos: { NOM_HUMDET: 'Nombre', ORDEN_1: 'Clase', ORDEN_2: 'Subclase', ORDEN_3: 'Tipo', HECTAREAS: 'Superficie (ha)', URL_SIMBIO: 'Ficha SIMBIO' } },
  { id: 'estaciones', grupo: 'agua', nombre: 'Estaciones DGA', archivo: 'estaciones-dga.json', tipo: 'punto', color: '#7fd6ff',
    fuente: 'Dirección General de Aguas · red hidrométrica', enlace: 'https://snia.mop.gob.cl', descr: 'Estaciones fluviométricas, meteorológicas, de calidad de agua y glaciológicas.',
    titulo: p => p.nombre, campos: { nombre: 'Estación', tipo: 'Tipo', vigencia: 'Vigencia', cuenca: 'Cuenca', codigo_bna: 'Código BNA', altitud: 'Altitud (m)', comuna: 'Comuna', institucion: 'Institución' } },

  // ---------- vegetación
  { id: 'bosque', grupo: 'vegetacion', nombre: 'Bosque nativo y uso de suelo', tipo: 'raster', color: '#3f9b52', ...SIMBIO, vivo: true,
    fuente: 'CONAF · Catastro de Recursos Vegetacionales (vía SIMBIO)', servicio: MMA + '/SIMBIO_CATASTRO_BN/MapServer', capasServicio: 'show:0',
    consulta: MMA + '/SIMBIO_CATASTRO_BN/MapServer/0', descr: 'Catastro de uso de suelo y bosque nativo (CONAF): se dibuja en vivo desde el servidor del MMA.',
    titulo: p => p.NIVEL_2 || p.NIVEL_1 || 'Uso de suelo', campos: { NIVEL_1: 'Uso', NIVEL_2: 'Subuso', SINTESIS: 'Síntesis', ANIO_FUENTE: 'Año fuente', REGION: 'Región' } },

  // ---------- actividad humana
  { id: 'acuicultura', grupo: 'actividad', nombre: 'Acuicultura', archivo: 'acuicultura.json', tipo: 'poligono', color: '#ff7a59',
    fuente: 'Subsecretaría de Pesca y Acuicultura', enlace: 'https://geoportal.subpesca.cl', descr: 'Concesiones otorgadas y solicitudes en trámite (salmones, mitílidos, algas…).',
    por: 'tramite', cats: { 'Concesión': '#ff7a59', 'Solicitud': '#ffc75f' },
    titulo: p => (p.tramite || 'Concesión') + (p.centro ? ' · centro ' + p.centro : ''), campos: { titular: 'Titular', tramite: 'Trámite', estado: 'Estado', grupo: 'Grupo de especies', especies: 'Especies', lugar: 'Lugar', comuna: 'Comuna', ha: 'Superficie (ha)', centro: 'Código de centro', resolucion: 'Resolución', documento: 'Documento' } },
  { id: 'seia', grupo: 'actividad', nombre: 'Proyectos SEIA', archivo: 'proyectos-seia.json', tipo: 'punto', color: '#c58cff',
    fuente: 'Servicio de Evaluación Ambiental (vía SIMBIO)', enlace: 'https://seia.sea.gob.cl', descr: 'Proyectos ingresados al Sistema de Evaluación de Impacto Ambiental: declaraciones (DIA) y estudios (EIA).',
    por: 'via', cats: { 'DIA': '#c58cff', 'EIA': '#ff5c8a' },
    titulo: p => p.nombre, campos: { nombre: 'Proyecto', via: 'Vía', tipologia: 'Tipología', estado: 'Estado', titular: 'Titular', presentado: 'Presentado', calificado: 'Calificado', expediente: 'Expediente' } },

  // ---------- monitoreo en vivo
  { id: 'focos', grupo: 'vivo', nombre: 'Focos de calor · 7 días', archivo: '../api/firms.php', tipo: 'foco', color: '#ff6a3d', vivo: true,
    fuente: 'NASA FIRMS · VIIRS (NOAA-20, NOAA-21, Suomi-NPP)', enlace: 'https://firms.modaps.eosdis.nasa.gov', fecha: 'se actualiza cada 3 horas',
    descr: 'Anomalías térmicas detectadas por satélite (incendios, quemas). Resolución 375 m.',
    titulo: p => 'Foco de calor · ' + p.fecha, campos: { fecha: 'Fecha', hora_utc: 'Hora (UTC)', satelite: 'Satélite', confianza: 'Confianza', frp_mw: 'Potencia radiativa (MW)', brillo_k: 'Brillo (K)', dia_noche: 'Detección' } },
];

/** Expresión de color MapLibre para una capa (categórica o fija). */
export function colorDe(c) {
  if (!c.por) return c.color;
  const e = ['match', ['get', c.por]];
  for (const [k, v] of Object.entries(c.cats)) e.push(k, v);
  e.push(c.color);
  return e;
}
