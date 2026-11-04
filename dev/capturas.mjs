// Capturas de revisión (escritorio y celular) del sitio local, con Chrome sin ventana.
//   node dev/capturas.mjs <carpeta-salida> [url]
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
async function recorrido(prefijo) {
  await ch.cdp('Page.navigate', { url });
  for (let i = 0; i < 60; i++) { await espera(500); if (await js(ch, "document.readyState==='complete'").catch(() => false)) break; }
  await js(ch, 'scrollTo(0, 0)'); await espera(7000); await foto(prefijo + '-0-portada');
  const caps = await js(ch, "[...document.querySelectorAll('.relato .capitulo')].length");
  for (let i = 0; i < caps; i++) {
    await js(ch, `(() => { const c = document.querySelectorAll('.relato .capitulo')[${i}]; scrollTo({ top: c.offsetTop + c.offsetHeight / 2 - innerHeight / 2, behavior: 'instant' }); })()`);
    await espera(6000); await foto(`${prefijo}-${i + 1}-cap`);
  }
  for (const id of ['historia', 'como', 'cooperativa', 'chile', 'asamblea', 'viene', 'sumate']) {
    await js(ch, `document.getElementById('${id}').scrollIntoView({ behavior: 'instant' })`); await espera(['chile', 'historia', 'asamblea'].includes(id) ? 4500 : 1200); await foto(`${prefijo}-z-${id}`);
  }
}
try {
  await recorrido('escritorio');
  await ch.cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await recorrido('celular');
  // flujo de inscripción
  await ch.cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await ch.cdp('Page.navigate', { url }); await espera(4000);
  const r = await js(ch, `(async () => {
    const f = document.getElementById('formulario'); f.nombre.value = 'Valentina Prueba'; f.correo.value = 'vale' + Date.now() + '@ejemplo.cl';
    const c = document.getElementById('f-comuna'); c.value = 'coyhai'; c.dispatchEvent(new Event('input'));
    await new Promise(r => setTimeout(r, 300)); document.querySelector('#f-comuna-lista li[data-i]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    f.acepto.checked = true; f.requestSubmit(); await new Promise(r => setTimeout(r, 1500));
    return document.querySelector('#dev-enlace a')?.href || document.getElementById('form-msg').textContent; })()`);
  console.log('inscripción →', r);
  await js(ch, "document.getElementById('sumate').scrollIntoView({ behavior: 'instant' })"); await espera(800); await foto('flujo-1-revisa');
  if (r.startsWith('http')) {
    await ch.cdp('Page.navigate', { url: r }); await espera(6000); await foto('flujo-2-bienvenida');
    const t = r.split('t=')[1];
    await ch.cdp('Page.navigate', { url: url + 'asamblea.html' }); await espera(7000); await foto('asamblea-1-sala');
    await js(ch, "document.getElementById('ir-asiento').click()"); await espera(3500); await foto('asamblea-2-mi-asiento');
    await js(ch, "document.querySelector('[data-vista=tribuna]').click()"); await espera(3500); await foto('asamblea-3-tribuna');
    await js(ch, "document.getElementById('participar').scrollIntoView({behavior:'instant'})"); await espera(1500); await foto('asamblea-4-participar');
    await ch.cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await ch.cdp('Page.navigate', { url: url + 'asamblea.html' }); await espera(7000); await foto('asamblea-5-celular');
  }
} finally { ch.cerrar(); }
console.log(errores.length ? 'ERRORES:\n' + [...new Set(errores)].join('\n') : 'sin errores de consola');
