// Capturas de la historia (varios hitos) y de la Asamblea en vivo con un socio que participa.
//   node dev/capturas-v3.mjs <carpeta> [url]
import { abrirChrome, js, espera } from 'file:///C:/Users/piali/Desktop/propiedades/scripts/videos/grabador.mjs';
import fs from 'node:fs'; import path from 'node:path';
const [, , salida, url = 'http://127.0.0.1:4410/'] = process.argv;
fs.mkdirSync(salida, { recursive: true });
const ch = await abrirChrome(path.join(salida, 'chrome'));
const errores = [];
ch.oyentes.push(d => {
  if (d.method === 'Runtime.exceptionThrown') errores.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
  if (d.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(d.params.type)) errores.push(d.params.type + ': ' + d.params.args.map(a => a.value ?? a.description).join(' '));
});
const foto = async n => { const { data } = await ch.cdp('Page.captureScreenshot', { format: 'jpeg', quality: 80 }); fs.writeFileSync(path.join(salida, n + '.jpg'), Buffer.from(data, 'base64')); };
async function historia(prefijo, hitos) {
  await ch.cdp('Page.navigate', { url }); await espera(4000);
  for (const i of hitos) {
    await js(ch, `(() => { const a = document.querySelector('.h-paso[data-i="${i}"] .h-tarjeta'); const r = a.getBoundingClientRect(); scrollTo({ top: r.top + scrollY + r.height / 2 - innerHeight / 2, behavior: 'instant' }); })()`);
    await espera(5200); await foto(`${prefijo}-historia-${String(i).padStart(2, '0')}`);
  }
}
try {
  await historia('escritorio', [0, 1, 3, 5, 6, 7, 10, 13]);
  // socio nuevo
  await ch.cdp('Page.navigate', { url }); await espera(3000);
  const enlace = await js(ch, `(async () => {
    const r = await fetch('api/inscribir.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre: 'Gonzalo Prueba', correo: 'gp' + Date.now() + '@ejemplo.cl', comuna: 11101, fundador: 1, acepto: 1 }) });
    return (await r.json()).dev_enlace; })()`);
  await ch.cdp('Page.navigate', { url: enlace }); await espera(3000);
  const token = enlace.split('t=')[1];
  await ch.cdp('Page.navigate', { url: url + 'asamblea.html?s=' + token }); await espera(7000); await foto('asamblea-1-vivo');
  console.log(await js(ch, `(async () => {
    const p = (accion, d = {}) => fetch('api/participar.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ t: '${token}', accion, ...d }) }).then(r => r.json());
    const a = await p('apodo', { apodo: 'Lenga del Simpson' + Math.floor(Math.random() * 99) });
    const b = await p('acreditar');
    const c = await p('mensaje', { texto: 'Hola a todos, saludos desde Coyhaique', sala: 'plaza' });
    const d = await p('palabra', { pedir: true });
    const vot = await fetch('api/sala.php').then(r => r.json());
    const e = await p('votar', { votacion: vot.votacion.id, opcion: 0 });
    return JSON.stringify([a.ok, b.ok, c.ok || c.error, d.ok || d.error, e.ok || e.error]); })()`));
  await ch.cdp('Page.navigate', { url: url + 'asamblea.html?s=' + token }); await espera(8000); await foto('asamblea-2-participando');
  await js(ch, "document.querySelector('[data-sala=sesion]').click()"); await espera(1500); await foto('asamblea-3-sesion');
  await js(ch, "document.getElementById('ir-asiento').click()"); await espera(3500); await foto('asamblea-4-mi-asiento');
  await js(ch, "document.getElementById('b-aplauso').click()"); await espera(700); await foto('asamblea-5-aplauso');
  const mods = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname.slice(1)), 'moderadores-local.txt'), 'utf8').trim().split('\n');
  await ch.cdp('Page.navigate', { url: mods[0].split('\t').pop() }); await espera(3000); await foto('moderacion');
  await ch.cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await ch.cdp('Page.navigate', { url: url + 'asamblea.html?s=' + token }); await espera(7000); await foto('celular-asamblea');
  await historia('celular', [1, 5, 7]);
} finally { ch.cerrar(); }
console.log(errores.length ? 'ERRORES:\n' + [...new Set(errores)].join('\n') : 'sin errores de consola');
