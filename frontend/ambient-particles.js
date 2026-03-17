export function startAmbientParticles() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  const canvas = document.createElement("canvas");
  canvas.className = "ambient-particles";
  canvas.setAttribute("aria-hidden", "true");
  document.body.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const particles = [];
  const count = 42;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function makeParticle() {
    const angle = Math.random() * Math.PI * 2;
    return {
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      radius: 0.8 + Math.random() * 2.6,
      speed: 0.04 + Math.random() * 0.12,
      driftX: Math.cos(angle),
      driftY: Math.sin(angle),
      alpha: 0.05 + Math.random() * 0.16,
      phase: Math.random() * Math.PI * 2
    };
  }

  function init() {
    particles.length = 0;
    for (let i = 0; i < count; i += 1) {
      particles.push(makeParticle());
    }
  }

  function step() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    particles.forEach((p) => {
      p.phase += 0.003;
      const offset = Math.sin(p.phase) * 0.03;
      p.x += (p.driftX + offset) * p.speed;
      p.y += (p.driftY + offset) * p.speed;

      if (p.x < -10) p.x = canvas.width + 10;
      if (p.x > canvas.width + 10) p.x = -10;
      if (p.y < -10) p.y = canvas.height + 10;
      if (p.y > canvas.height + 10) p.y = -10;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(140, 220, 255, ${p.alpha})`;
      ctx.fill();
    });

    requestAnimationFrame(step);
  }

  resize();
  init();
  window.addEventListener("resize", () => {
    resize();
    init();
  });

  requestAnimationFrame(step);
}
