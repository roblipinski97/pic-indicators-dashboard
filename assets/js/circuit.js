// The page background: thin circuit lines with dots at their ends, in the manner of the opening of the pipeline video
// and of the circuit image. They run out to both edges of the page and fade out towards the middle, so the text stays
// clear: on the right from about a third of the width, on the left (where the text starts) only near the edge, and
// fainter on narrow screens, where the text takes the whole width. The lines sit in three layers; as the
// page scrolls, the nearer layers drift faster than the far one and small dots run along the lines. Nothing moves
// while the page is still, and nothing moves at all for readers whose system asks for reduced motion.
// One fixed canvas behind every page (white panels and charts cover it); redrawn only on scroll, resize or a change
// of background.

const TILE = 1500;                 // the pattern repeats every TILE px down the page
const LAYERS = [                   // far to near: how many lines per tile, line width, node size, opacity, drift
  { n: 16, w: 0.8, r: 2.2, a: 0.24, k: 0.10 },
  { n: 11, w: 1.3, r: 3.4, a: 0.32, k: 0.20 },
  { n: 7,  w: 2.0, r: 5.0, a: 0.38, k: 0.34 }
];
const COLOURS = {                  // cyan and periwinkle, as in the image; lighter and fainter on the dark background
  light: { a: [110, 196, 228], b: [128, 150, 208], k: 1 },
  dark:  { a: [74, 150, 196],  b: [104, 124, 190], k: 0.55 }
};

// a small seeded random generator, so the pattern is the same on every page and every visit
function rng(seed) {
  return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// lines in one tile of one layer: runs to the right with 45-degree bends, as on a circuit board; the left side's lines
// are drawn the same way from another seed and then mirrored, so they run out to the left edge
function makeLines(W, layer, li, left = false) {
  const R = rng(7919 * (li + 1) + Math.round(W / 50) + (left ? 104729 : 0));
  const s = 0.6 + 0.25 * li;       // nearer layers: longer runs
  const lines = [];
  const n = left ? Math.round(layer.n * 0.8) : layer.n;
  for (let i = 0; i < n; i++) {
    let x = W * (0.32 + 0.5 * R()), y = TILE * R();
    const pts = [[x, y]], segs = 2 + Math.floor(R() * 3);
    for (let k = 0; k < segs; k++) {
      if (k % 2 === 0) x += (70 + 220 * R()) * s;                       // straight run
      else { const d = (30 + 110 * R()) * s, up = R() < 0.5 ? -1 : 1; x += d; y += up * d; }   // bend
      pts.push([x, y]);
    }
    // length along the line, for the dots that run along it
    let len = 0; const cum = [0];
    for (let k = 1; k < pts.length; k++) { len += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); cum.push(len); }
    if (left) pts.forEach(p => { p[0] = W - p[0]; });
    lines.push({ pts, cum, len, col: R() < 0.72 ? "a" : "b", phase: R() * 1000, pulse: li > 0 && R() < 0.8, end: R() < 0.85 });
  }
  return lines;
}

function pointAt(l, d) {
  for (let k = 1; k < l.pts.length; k++) {
    if (d <= l.cum[k]) {
      const f = (d - l.cum[k - 1]) / (l.cum[k] - l.cum[k - 1] || 1), p = l.pts[k - 1], q = l.pts[k];
      return [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f];
    }
  }
  return l.pts[l.pts.length - 1];
}

export function circuitBackground() {
  if (document.getElementById("pic-bg")) return;
  const cv = document.createElement("canvas");
  cv.id = "pic-bg";
  cv.setAttribute("aria-hidden", "true");
  document.body.prepend(cv);
  const ctx = cv.getContext("2d");
  if (!ctx) return;
  const still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let W = 0, H = 0, dpr = 1, layers = [], queued = false;

  function size() {
    const w = window.innerWidth, h = window.innerHeight;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    if (w !== W) layers = LAYERS.map((L, i) => makeLines(w, L, i).concat(makeLines(w, L, i, true)));
    W = w; H = h;
  }

  function draw() {
    queued = false;
    const dark = document.documentElement.dataset.theme === "dark", C0 = dark ? COLOURS.dark : COLOURS.light;
    const C = { ...C0, k: C0.k * (W < 700 ? 0.6 : 1) };   // fainter where the text takes the whole width
    const sy = still ? 0 : window.scrollY;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    // fade towards the middle: full strength at the left edge, gone by 30% of the width; nothing up to a third of the
    // width; full strength again from about 85% of the width to the right edge
    const fade = ctx.createLinearGradient(0, 0, W, 0);
    fade.addColorStop(0, "rgba(0,0,0,1)"); fade.addColorStop(0.05, "rgba(0,0,0,1)"); fade.addColorStop(0.30, "rgba(0,0,0,0)");
    fade.addColorStop(0.32, "rgba(0,0,0,0)"); fade.addColorStop(0.85, "rgba(0,0,0,1)"); fade.addColorStop(1, "rgba(0,0,0,1)");
    LAYERS.forEach((L, li) => {
      const off = -((sy * L.k) % TILE);
      const rgba = (c, a) => `rgba(${C[c].join(",")},${(a * C.k).toFixed(3)})`;
      for (let tile = -1; tile <= Math.ceil(H / TILE) + 1; tile++) {
        const dy = off + tile * TILE;
        if (dy > H + 200 || dy + TILE < -200) continue;
        layers[li].forEach(l => {
          ctx.lineWidth = L.w; ctx.lineJoin = "round"; ctx.lineCap = "round";
          ctx.strokeStyle = rgba(l.col, L.a);
          ctx.beginPath();
          l.pts.forEach((p, k) => (k ? ctx.lineTo(p[0], p[1] + dy) : ctx.moveTo(p[0], p[1] + dy)));
          ctx.stroke();
          // a small dot where the line starts, a larger one where it ends
          const s = l.pts[0], e = l.pts[l.pts.length - 1];
          ctx.fillStyle = rgba(l.col, L.a * 0.9);
          ctx.beginPath(); ctx.arc(s[0], s[1] + dy, L.r * 0.55, 0, 2 * Math.PI); ctx.fill();
          if (l.end) { ctx.fillStyle = rgba(l.col === "a" ? "b" : "a", L.a * 1.1); ctx.beginPath(); ctx.ellipse(e[0], e[1] + dy, L.r * 1.25, L.r, -0.35, 0, 2 * Math.PI); ctx.fill(); }
          // a dot that runs along the line as the page scrolls
          if (l.pulse && !still) {
            const cyc = l.len + 240, d = ((sy * (0.6 + L.k) + l.phase) % cyc + cyc) % cyc;
            if (d <= l.len) { const p = pointAt(l, d); ctx.fillStyle = rgba("b", Math.min(1, L.a * 1.6)); ctx.beginPath(); ctx.arc(p[0], p[1] + dy, L.r * 0.7, 0, 2 * Math.PI); ctx.fill(); }
          }
        });
      }
    });
    // apply the fade to everything drawn
    ctx.globalCompositeOperation = "destination-in";
    ctx.fillStyle = fade; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "source-over";
  }
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(draw); } };

  size(); draw();
  if (!still) window.addEventListener("scroll", queue, { passive: true });
  let rt;
  window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { size(); draw(); }, 120); });
  window.addEventListener("pic:colours", queue);
}
