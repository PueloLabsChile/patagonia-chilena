// Distribución de asientos de la Asamblea: un hemiciclo visto desde arriba.
// Cada asiento es un socio. La sala se llena desde las filas delanteras y se reparte en sectores por región,
// de Arica (izquierda) a Magallanes (derecha).

export const ORDEN_REGIONES = [15, 1, 2, 3, 4, 5, 13, 6, 7, 16, 8, 9, 14, 10, 11, 12];
export const NOMBRE_REGION = {
  15: 'Arica y Parinacota', 1: 'Tarapacá', 2: 'Antofagasta', 3: 'Atacama', 4: 'Coquimbo', 5: 'Valparaíso', 13: 'Metropolitana',
  6: "O'Higgins", 7: 'Maule', 16: 'Ñuble', 8: 'Biobío', 9: 'La Araucanía', 14: 'Los Ríos', 10: 'Los Lagos', 11: 'Aysén', 12: 'Magallanes',
};
// del desierto al hielo
export const COLOR_REGION = {
  15: '#e8a85c', 1: '#e39d52', 2: '#da9150', 3: '#d29c5d', 4: '#c9a467', 5: '#bcab70', 13: '#a8b27a', 6: '#93b27f',
  7: '#7eae84', 16: '#6ca98a', 8: '#5ea392', 9: '#559d9d', 14: '#5597aa', 10: '#5d92b8', 11: '#7fb6d2', 12: '#b4e0ec',
};
export const regionDeComuna = cut => Math.floor(cut / 1000);

/** Asientos de un hemiciclo con `capacidad` lugares, en coordenadas normalizadas (radio exterior 1, centro en 0,0, hacia +y).
 *  Devuelve { x, y, fila, ang } como Float32Array/Int32Array, ordenados por fila (de adelante hacia atrás) y ángulo. */
export function trazar(capacidad, { r0 = .26, pasillos = 9, anchoPasillo = .9 } = {}) {
  const d = Math.sqrt(Math.PI * (1 - r0 * r0) / (2 * capacidad)) * .985;
  const xs = [], ys = [], fs = [], as = [];
  const angPasillos = Array.from({ length: pasillos }, (_, i) => Math.PI * (i + 1) / (pasillos + 1));
  let fila = 0;
  for (let r = r0; r <= 1.0001 && xs.length < capacidad; r += d, fila++) {
    const n = Math.floor(Math.PI * r / d);
    for (let i = 0; i < n && xs.length < capacidad; i++) {
      const a = Math.PI - (i + .5) * Math.PI / n;               // de izquierda (π) a derecha (0)
      if (angPasillos.some(p => Math.abs(a - p) * r < d * anchoPasillo)) continue;
      xs.push(Math.cos(a) * r); ys.push(Math.sin(a) * r); fs.push(fila); as.push(a);
    }
  }
  return { n: xs.length, x: Float32Array.from(xs), y: Float32Array.from(ys), fila: Int32Array.from(fs), ang: Float32Array.from(as), filas: fila, paso: d };
}

/** Asigna región a los primeros `total` asientos (los de adelante), en sectores de izquierda a derecha.
 *  porRegion: Map(región → inscritos). Devuelve Uint8Array con el código de región (0 = vacío). */
export function ocupar(sala, porRegion) {
  const total = Math.min(sala.n, [...porRegion.values()].reduce((a, b) => a + b, 0));
  const reg = new Uint8Array(sala.n);
  const ocupados = Array.from({ length: total }, (_, i) => i).sort((a, b) => sala.ang[b] - sala.ang[a]);
  let k = 0;
  for (const r of ORDEN_REGIONES) {
    const c = porRegion.get(r) || 0;
    for (let j = 0; j < c && k < total; j++, k++) reg[ocupados[k]] = r;
  }
  return reg;
}

/** Índice del asiento de un socio: el «puesto»-ésimo asiento de su región, de adelante hacia atrás. */
export function asientoDe(sala, reg, region, puesto) {
  let visto = 0, ultimo = -1;
  for (let i = 0; i < sala.n; i++) if (reg[i] === region) { ultimo = i; if (++visto === puesto) return i; }
  return ultimo;
}

export function porRegionDesde(comunas) {
  const m = new Map(ORDEN_REGIONES.map(r => [r, 0]));
  for (const [cut, n] of comunas || []) { const r = regionDeComuna(cut); if (m.has(r)) m.set(r, m.get(r) + n); }
  return m;
}
