// Servidor de desarrollo: sirve el sitio y simula la API PHP con SQLite (node:sqlite). No envía correos:
// el enlace de confirmación se devuelve en la respuesta (dev_enlace) y se imprime en consola.
//   node dev/servidor.mjs            → http://127.0.0.1:4410
//   node dev/servidor.mjs --semilla  → crea inscritos de prueba repartidos por Chile
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomInt } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = Number(process.env.PUERTO || 4410);
const SITIO = `http://127.0.0.1:${PUERTO}/`;
const META = 100000;
const db = new DatabaseSync(path.join(RAIZ, 'dev', 'dev.sqlite'));
db.exec(`CREATE TABLE IF NOT EXISTS socios (id INTEGER PRIMARY KEY, nombre TEXT NOT NULL, correo TEXT NOT NULL UNIQUE, comuna INTEGER NOT NULL,
  fundador INTEGER NOT NULL DEFAULT 1, token TEXT NOT NULL UNIQUE, codigo TEXT NOT NULL UNIQUE, ref TEXT, numero INTEGER UNIQUE,
  creado TEXT NOT NULL, confirmado TEXT, ip TEXT, envios INTEGER NOT NULL DEFAULT 0, ultimo_envio TEXT)`);

const ahora = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
const token = () => randomBytes(24).toString('base64url');
const codigo = () => Array.from({ length: 7 }, () => 'abcdefghjkmnpqrstuvwxyz23456789'[randomInt(31)]).join('');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.geojson': 'application/geo+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };

function jsonR(res, datos, estado = 200) { res.writeHead(estado, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(datos)); }
function redirigir(res, url) { res.writeHead(302, { Location: url }); res.end(); }
async function cuerpo(req) { let s = ''; for await (const c of req) s += c; try { return JSON.parse(s || '{}'); } catch { return Object.fromEntries(new URLSearchParams(s)); } }

const api = {
  async 'inscribir.php'(req, res) {
    if (req.method !== 'POST') return jsonR(res, { ok: false, error: 'Método no permitido' }, 405);
    const d = await cuerpo(req);
    if (d.sitio) return jsonR(res, { ok: true });
    const nombre = String(d.nombre || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    const correo = String(d.correo || '').trim().toLowerCase();
    const comuna = Number(d.comuna || 0), fundador = d.fundador ? 1 : 0;
    let ref = String(d.ref || '').toLowerCase().replace(/[^a-z0-9]/g, '') || null;
    if (nombre.length < 3 || nombre.length > 80) return jsonR(res, { ok: false, error: 'Escribe tu nombre (3 a 80 letras).' }, 422);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo)) return jsonR(res, { ok: false, error: 'Ese correo no parece válido.' }, 422);
    if (comuna < 1101 || comuna > 16305) return jsonR(res, { ok: false, error: 'Elige tu comuna de la lista.' }, 422);
    if (!d.acepto) return jsonR(res, { ok: false, error: 'Debes aceptar la política de privacidad.' }, 422);
    let s = db.prepare('SELECT * FROM socios WHERE correo = ?').get(correo), t, confirmado = false;
    if (s) {
      if (!s.confirmado) db.prepare('UPDATE socios SET nombre=?, comuna=?, fundador=? WHERE id=?').run(nombre, comuna, fundador, s.id);
      db.prepare('UPDATE socios SET envios=envios+1, ultimo_envio=? WHERE id=?').run(ahora(), s.id);
      t = s.token; confirmado = !!s.confirmado;
    } else {
      if (ref && !db.prepare('SELECT 1 FROM socios WHERE codigo=?').get(ref)) ref = null;
      t = token();
      db.prepare('INSERT INTO socios (nombre, correo, comuna, fundador, token, codigo, ref, creado, ip, envios, ultimo_envio) VALUES (?,?,?,?,?,?,?,?,?,1,?)')
        .run(nombre, correo, comuna, fundador, t, codigo(), ref, ahora(), 'dev', ahora());
    }
    const enlace = confirmado ? `${SITIO}?s=${t}` : `${SITIO}api/confirmar.php?t=${t}`;
    console.log(`[correo simulado] ${correo} → ${enlace}`);
    jsonR(res, { ok: true, dev_enlace: enlace });
  },
  'confirmar.php'(req, res, q) {
    const s = db.prepare('SELECT id, numero FROM socios WHERE token=?').get(q.get('t') || '');
    if (!s) return redirigir(res, SITIO + '?error=enlace#sumate');
    if (!s.numero) {
      const n = db.prepare('SELECT COALESCE(MAX(numero),0)+1 n FROM socios').get().n;
      db.prepare('UPDATE socios SET numero=?, confirmado=? WHERE id=?').run(n, ahora(), s.id);
    }
    redirigir(res, SITIO + '?s=' + encodeURIComponent(q.get('t')));
  },
  'socio.php'(req, res, q) {
    const s = db.prepare('SELECT nombre, comuna, numero, codigo FROM socios WHERE token=? AND numero IS NOT NULL').get(q.get('t') || '');
    if (!s) return jsonR(res, { ok: false }, 404);
    const inv = db.prepare('SELECT COUNT(*) n FROM socios WHERE ref=? AND numero IS NOT NULL').get(s.codigo).n;
    jsonR(res, { ok: true, ...s, invitados: inv });
  },
  'estadisticas.php'(req, res) {
    const total = db.prepare('SELECT COUNT(*) n FROM socios WHERE numero IS NOT NULL').get().n;
    const comunas = db.prepare('SELECT comuna, COUNT(*) n FROM socios WHERE numero IS NOT NULL GROUP BY comuna ORDER BY n DESC').all().map(r => [r.comuna, r.n]);
    jsonR(res, { total, meta: META, comunas, al: new Date().toISOString() });
  },
  async 'baja.php'(req, res, q) {
    const t = req.method === 'POST' ? (await cuerpo(req)).t : q.get('t');
    if (req.method === 'POST') db.prepare('DELETE FROM socios WHERE token=?').run(t || '');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(req.method === 'POST' ? '<p>Datos borrados (dev).</p>' : `<form method="post"><input type="hidden" name="t" value="${t}"><button>Borrar mis datos (dev)</button></form>`);
  },
};

if (process.argv.includes('--semilla')) {
  const comunas = JSON.parse(await readFile(path.join(RAIZ, 'datos', 'comunas.json'), 'utf8'));
  const peso = c => c.r === 13 ? 6 : c.r === 12 || c.r === 11 ? 5 : c.r === 5 || c.r === 8 ? 3 : 1;
  const bolsa = comunas.flatMap(c => Array(peso(c)).fill(c.c));
  let n = db.prepare('SELECT COALESCE(MAX(numero),0) n FROM socios').get().n;
  const ins = db.prepare('INSERT INTO socios (nombre, correo, comuna, fundador, token, codigo, creado, confirmado, numero, ip) VALUES (?,?,?,?,?,?,?,?,?,?)');
  for (let i = 0; i < 1800; i++) ins.run('Prueba ' + i, `prueba${Date.now()}${i}@ejemplo.cl`, bolsa[randomInt(bolsa.length)], 1, token(), codigo(), ahora(), ahora(), ++n, 'semilla');
  console.log('semilla: 1800 inscritos de prueba');
}

http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, SITIO);
    if (u.pathname.startsWith('/api/')) {
      const h = api[u.pathname.slice(5)];
      return h ? await h(req, res, u.searchParams) : jsonR(res, { ok: false }, 404);
    }
    let ruta = path.normalize(path.join(RAIZ, decodeURIComponent(u.pathname)));
    if (!ruta.startsWith(RAIZ) || /[\\/](dev|scripts|\.git)([\\/]|$)/.test(ruta.slice(RAIZ.length))) { res.writeHead(403); return res.end(); }
    if ((await stat(ruta).catch(() => null))?.isDirectory()) ruta = path.join(ruta, 'index.html');
    const buf = await readFile(ruta);
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(ruta)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  } catch (e) { res.writeHead(e.code === 'ENOENT' ? 404 : 500); res.end(String(e.code || e)); }
}).listen(PUERTO, '127.0.0.1', () => console.log('Patagonia Chilena (desarrollo) en ' + SITIO));
