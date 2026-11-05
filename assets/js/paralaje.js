// Cielo austral: estrellas en tres profundidades + auroras difusas que se mueven con el scroll y el mouse,
// paralaje en títulos y bloques, y aparición suave de los elementos.
const sinMov = matchMedia('(prefers-reduced-motion: reduce)').matches;

export function iniciarParalaje({ paralaje = [], revelar = [] } = {}) {
  // ---------- capa de cielo
  const cielo = document.createElement('div');
  cielo.className = 'cielo'; cielo.setAttribute('aria-hidden', 'true');
  cielo.innerHTML = '<canvas class="estrellas"></canvas><i class="aurora a1"></i><i class="aurora a2"></i><i class="aurora a3"></i><i class="aurora a4"></i>';
  document.body.prepend(cielo);
  const cv = cielo.querySelector('canvas'), g = cv.getContext('2d');
  const auroras = [...cielo.querySelectorAll('.aurora')];
  let W = 0, H = 0, dpr = 1, capas = [];
  function medir() {
    dpr = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px'; g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round(W * H / 9000);
    capas = [.08, .2, .42].map((vel, k) => ({ vel, est: Array.from({ length: Math.round(n / (k + 1)) }, () => ({ x: Math.random() * W, y: Math.random() * H * 3, r: (.3 + Math.random() * .8) * (k + 1) * .6, f: Math.random() * 6.28, c: Math.random() < .12 ? (Math.random() < .5 ? '255,170,160' : '170,180,255') : '235,240,255' })) }));
  }
  medir(); addEventListener('resize', medir);

  let mx = 0, my = 0, tmx = 0, tmy = 0;
  addEventListener('pointermove', e => { tmx = e.clientX / W - .5; tmy = e.clientY / H - .5; }, { passive: true });

  // ---------- elementos con paralaje
  const items = [];
  for (const [sel, f] of paralaje) document.querySelectorAll(sel).forEach(el => items.push({ el, f }));
  const nodos = [...document.querySelectorAll('[data-paralaje]')].map(el => ({ el, f: +el.dataset.paralaje }));
  items.push(...nodos);

  // ---------- aparición
  if (!sinMov) {
    const obs = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('revelado'); obs.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
    for (const sel of revelar) document.querySelectorAll(sel).forEach((el, i) => { el.classList.add('revelar'); el.style.setProperty('--d', (i % 4) * 90 + 'ms'); obs.observe(el); });
  }

  if (sinMov) { dibujar(0, 0); return; }
  let t0 = performance.now();
  function cuadro(t) {
    const s = scrollY, dt = (t - t0) / 1000;
    mx += (tmx - mx) * .05; my += (tmy - my) * .05;
    dibujar(s, dt);
    // auroras: derivan solas, respiran con el scroll y siguen un poco al mouse
    auroras.forEach((a, k) => {
      const fase = k * 1.7, x = Math.sin(dt * .05 + fase + s / 2200) * 18 + mx * (10 + k * 6), y = Math.cos(dt * .04 + fase + s / 1700) * 14 + my * (8 + k * 5) - (s * (.02 + k * .01)) % 40;
      a.style.transform = `translate3d(${x}vw, ${y}vh, 0) rotate(${Math.sin(dt * .03 + k) * 25}deg) scale(${1 + Math.sin(dt * .07 + k) * .12})`;
    });
    // paralaje de elementos (usa «translate» para no pisar otros transform)
    const ch = H / 2;
    for (const it of items) {
      const r = it.el.getBoundingClientRect(); if (r.bottom < -200 || r.top > H + 200) continue;
      const d = (r.top + r.height / 2 - ch);
      it.el.style.translate = `${(mx * it.f * 40).toFixed(1)}px ${(-d * it.f).toFixed(1)}px`;
    }
    requestAnimationFrame(cuadro);
  }
  requestAnimationFrame(cuadro);

  function dibujar(s, dt) {
    g.clearRect(0, 0, W, H);
    for (const c of capas) {
      const oy = (s * c.vel) % (H * 3), ox = mx * c.vel * 120, oyM = my * c.vel * 90;
      for (const e of c.est) {
        let y = e.y - oy + oyM; y = ((y % (H * 3)) + H * 3) % (H * 3); if (y > H) continue;
        const a = .35 + .45 * Math.sin(dt * 1.3 + e.f);
        g.fillStyle = `rgba(${e.c},${a.toFixed(2)})`;
        g.beginPath(); g.arc(e.x + ox, y, e.r, 0, 6.283); g.fill();
      }
    }
  }
}
