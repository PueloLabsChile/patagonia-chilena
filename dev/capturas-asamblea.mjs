// Capturas de la página de la Asamblea en varios tamaños.  node dev/capturas-asamblea.mjs <carpeta> [url]
import { abrirChrome, js, espera } from 'file:///C:/Users/piali/Desktop/propiedades/scripts/videos/grabador.mjs';
import fs from 'node:fs'; import path from 'node:path';
const [, , salida, url = 'https://patagoniadechile.cl/asamblea.html'] = process.argv;
fs.mkdirSync(salida, { recursive: true });
const ch = await abrirChrome(path.join(salida, 'chrome'));
const foto = async n => { const { data } = await ch.cdp('Page.captureScreenshot', { format: 'jpeg', quality: 75 }); fs.writeFileSync(path.join(salida, n + '.jpg'), Buffer.from(data, 'base64')); };
try {
  for (const [n, w, h, mob] of [['1366', 1366, 768, false], ['1280', 1280, 720, false], ['1024', 1024, 768, false], ['cel', 390, 844, true]]) {
    await ch.cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: mob });
    await ch.cdp('Page.navigate', { url }); await espera(7000); await foto(n + '-a-sala');
    await js(ch, "document.querySelector('.sala-pie')?.scrollIntoView({block:'end'})"); await espera(1200); await foto(n + '-b-pie');
    await js(ch, "document.getElementById('participar').scrollIntoView()"); await espera(1500); await foto(n + '-c-participar');
    await js(ch, "scrollTo(0, document.body.scrollHeight)"); await espera(1500); await foto(n + '-d-final');
  }
} finally { ch.cerrar(); }
