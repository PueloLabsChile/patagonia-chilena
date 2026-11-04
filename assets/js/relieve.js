// Inclinación 3D suave con un brillo que sigue al cursor (solo con mouse y sin «reducir movimiento»).
export function iniciarRelieve(selector) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  for (const el of document.querySelectorAll(selector)) {
    el.setAttribute('data-relieve', '');
    el.addEventListener('pointermove', e => {
      const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      el.style.setProperty('--ry', ((x - .5) * 7).toFixed(2) + 'deg');
      el.style.setProperty('--rx', ((.5 - y) * 6).toFixed(2) + 'deg');
      el.style.setProperty('--gx', (x * 100).toFixed(1) + '%');
      el.style.setProperty('--gy', (y * 100).toFixed(1) + '%');
      el.style.setProperty('--brillo', 1);
    });
    el.addEventListener('pointerleave', () => { el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); el.style.setProperty('--brillo', 0); });
  }
}
