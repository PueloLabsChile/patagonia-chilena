// Viento austral: partículas que corren de oeste a este sobre el mapa del relato.
export function iniciarViento(canvas) {
  const g = canvas.getContext('2d');
  if (!g || matchMedia('(prefers-reduced-motion: reduce)').matches) return { activar() { } };
  let W = 0, H = 0, dpr = 1, ps = [], activo = false, raf = 0, t = 0, impulso = 0, ultimoY = scrollY;
  const N = () => (innerWidth < 760 ? 260 : 650);
  function medir() {
    dpr = Math.min(2, devicePixelRatio || 1);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
    ps = Array.from({ length: N() }, nueva);
  }
  function nueva() { return { x: Math.random() * W, y: Math.random() * H, v: .6 + Math.random() * 1.4, vida: 60 + Math.random() * 200 }; }
  // campo de flujo: dominante hacia el este, con remolinos suaves
  const campo = (x, y) => {
    const a = Math.sin(y * .0045 + t * .0007) * .55 + Math.cos(x * .0032 - t * .0005) * .35 - .12;
    return [Math.cos(a), Math.sin(a)];
  };
  function cuadro() {
    raf = 0; if (!activo) return;
    t += 16; impulso *= .93;
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = 'rgba(0,0,0,.09)'; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'source-over'; g.lineWidth = .9; g.lineCap = 'round';
    g.strokeStyle = 'rgba(248,246,240,.38)'; g.beginPath();
    for (const p of ps) {
      const [dx, dy] = campo(p.x, p.y), k = p.v * (1.6 + impulso);
      const nx = p.x + dx * k * 1.8, ny = p.y + dy * k;
      g.moveTo(p.x, p.y); g.lineTo(nx, ny);
      p.x = nx; p.y = ny;
      if (--p.vida < 0 || p.x > W + 10 || p.y < -10 || p.y > H + 10) Object.assign(p, nueva(), { x: Math.random() < .7 ? -5 : Math.random() * W });
    }
    g.stroke();
    raf = requestAnimationFrame(cuadro);
  }
  addEventListener('resize', medir);
  addEventListener('scroll', () => { impulso = Math.min(4, impulso + Math.abs(scrollY - ultimoY) * .02); ultimoY = scrollY; }, { passive: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && activo && !raf) raf = requestAnimationFrame(cuadro); });
  medir();
  return {
    activar(si) {
      if (si === activo) return; activo = si;
      if (si && !raf) raf = requestAnimationFrame(cuadro);
      if (!si) setTimeout(() => !activo && g.clearRect(0, 0, W, H), 1300);
    },
  };
}
