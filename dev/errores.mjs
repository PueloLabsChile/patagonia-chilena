import { abrirChrome, js, espera } from 'file:///C:/Users/piali/Desktop/propiedades/scripts/videos/grabador.mjs';
const url = process.argv[2];
const ch = await abrirChrome('C:/Users/piali/AppData/Local/Temp/claude/064f854b1392ee76/7fbf4ed5-0d87-4397-96a0-a9632a9495e9/scratchpad/err');
const e = [];
ch.oyentes.push(d => {
  if (d.method === 'Runtime.exceptionThrown') e.push('EXC ' + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text));
  if (d.method === 'Runtime.consoleAPICalled' && ['error','warning'].includes(d.params.type)) e.push(d.params.type + ' ' + d.params.args.map(a => a.value ?? a.description).join(' '));
  if (d.method === 'Log.entryAdded') e.push('LOG ' + d.params.entry.level + ' ' + d.params.entry.text + ' ' + (d.params.entry.url || ''));
});
await ch.cdp('Log.enable');
try { await ch.cdp('Page.navigate', { url }); await espera(9000); console.log('cuenta:', await js(ch, "document.querySelector('[data-c=d]')?.textContent")); }
finally { ch.cerrar(); }
console.log([...new Set(e)].join('\n') || 'sin errores');
