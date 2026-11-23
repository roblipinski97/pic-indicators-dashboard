// The world map on the home page: a grid of hexagons coloured by country, with round flags on top.
//
// Zooming in (the + and − buttons, Ctrl or ⌘ + scroll, a trackpad pinch, two fingers on a phone) lays a finer grid
// over the part of the map on screen, so small countries and islands get more hexagons as they grow. Each hexagon
// takes the country its centre falls in; an island too small to hold the centre of any hexagon gets the hexagon
// nearest to it once it is about a third of a hexagon in size, so islands appear as the map is zoomed in (a marked
// country always has at least one). Thin grey lines along the hexagon edges mark the borders between countries, and
// capitals and cities are labelled from the first zoom on, more as the map grows. Disputed areas (and Western Sahara)
// are drawn in a barely different shade, with dashed borders. Flags are sized by the room around them: where marked
// countries crowd, flags are smaller, and they grow as the map is zoomed in. A flag that would hide its whole country
// moves beside it, to the side with the least land, with a thin line back to the country. The map data (Natural
// Earth 1:10m countries and populated places, Equal Earth projection, the frame of the GSPS dotted map) is built by
// prep/make_world_map.R.
import { d3, getJSON, svgFlag, withTip, t, tx, isFr, isEs } from "../core.js";

const S0 = 6.4;       // distance between hexagon centres at the world view, in map units (the map is 960 wide)
const KMAX = 128;     // largest zoom (an island of 30 km is then about 110 units across)
const SPX = 6;        // the grid gets finer whenever hexagons would be more than this many screen pixels apart * √2
const LAND = [58, 14, 934, 442]; // the part of the map shown at first: all land but Antarctica (x0, y0, x1, y1)
const REF = 0.85;     // screen pixels per map unit for which the label zooms were set (a map 820 pixels wide)
const HEX = 0.47;     // hexagon radius as a share of the distance between centres (0.577 would leave no gap)
const PPC = 4;        // canvas pixels per hexagon spacing, when working out which country each hexagon falls in
const R0 = 10;        // flags are drawn at this radius and scaled
const ISLAND = 0.3;   // an island gets its own hexagon once its area is this share of a hexagon's
const LABEL_FROM = 1.5; // no place names when the map is drawn smaller than 1.5 times REF
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// outlines come as whole numbers in steps of 1/q, each point as the difference from the one before
function decode(rings, q) {
  return rings.map(rs => (rs && rs.length ? rs.map(r => {
    const a = new Float64Array(r.length);
    let x = 0, y = 0;
    for (let i = 0; i < r.length; i += 2) { x += r[i]; y += r[i + 1]; a[i] = x / q; a[i + 1] = y / q; }
    return a;
  }) : null));
}
function toPath(rs) {
  const p = new Path2D();
  for (const a of rs) {
    p.moveTo(a[0], a[1]);
    for (let i = 2; i < a.length; i += 2) p.lineTo(a[i], a[i + 1]);
    p.closePath();
  }
  return p;
}
// is the point inside the rings (outline and holes)?
function inside(rs, x, y) {
  let c = false;
  for (const a of rs) {
    for (let i = 0, j = a.length - 2; i < a.length; j = i, i += 2) {
      const yi = a[i + 1], yj = a[j + 1];
      if ((yi > y) !== (yj > y) && x < (a[j] - a[i]) * (y - yi) / (yj - yi) + a[i]) c = !c;
    }
  }
  return c;
}
// each country is painted in its own colour: red is its number, green and blue check that the colour was not
// blended with a neighbour's along a border (where the exact test is used instead)
const G = v => (v * 67 + 29) & 255, B = v => (v * 151 + 101) & 255;

/**
 * Draws the map into root. marks: the countries to show in the accent colour, each { iso3, c (for the flag), tip(m),
 * click(m) or null }. Returns { focus(iso3s) } to zoom onto some countries.
 */
export async function hexMap(root, { marks, label }) {
  const geo = await getJSON("assets/geo/world-map.json");
  const W = geo.w, H = geo.h, C = geo.countries, P = geo.parts; // part: [country, area, x, y, x0, y0, x1, y1]
  const decDis = (list, q) => list.map(rs => (rs && rs.length ? decode([rs], q)[0] : null));
  const DIS = geo.disputed || [];   // disputed areas: { n: name, b: bounding box, r: rings }
  const data = { coarse: { rings: decode(geo.rings, geo.q), paths: [], dis: decDis(DIS.map(g => g.r), geo.q) }, fine: null };
  let fineLoad = null;
  const ciOf = new Map(C.map((c, i) => [c[0], i]));
  const main = new Int32Array(C.length).fill(-1);   // each country's largest part
  P.forEach((q, p) => { if (main[q[0]] < 0 || q[1] > P[main[q[0]]][1]) main[q[0]] = p; });
  const hot = new Uint8Array(C.length);
  const ms = marks.filter(m => ciOf.has(m.iso3)).map(m => {
    const i = ciOf.get(m.iso3);
    hot[i] = 1;
    return { ...m, ci: i, lx: C[i][3], ly: C[i][4], r: R0, dx: 0, dy: 0, px: 0, py: 0, on: true };
  });

  root.innerHTML = "";
  root.classList.add("hexmap");
  const svg = d3.select(root).append("svg").attr("role", "img").attr("aria-label", label);
  // the view box: the land, as wide as the page; on a very wide screen the map would be too tall, so the box widens
  // instead (more ocean on the sides) and the map keeps to 80% of the window's height
  let VB, pxu = 1;
  function sizeBox() {
    const cw = root.clientWidth || 960, lw = LAND[2] - LAND[0], lh = LAND[3] - LAND[1];
    const h = Math.min(cw * lh / lw, Math.max(320, innerHeight * 0.8));
    const w = Math.max(lw, lh * cw / h);
    VB = { x: (LAND[0] + LAND[2]) / 2 - w / 2, y: LAND[1], w, h: lh };
    svg.attr("viewBox", `${VB.x} ${VB.y} ${VB.w} ${VB.h}`);
    pxu = cw / VB.w;
  }
  sizeBox();
  const inView = (x, y, m = 4) => x > VB.x - m && x < VB.x + VB.w + m && y > VB.y - m && y < VB.y + VB.h + m;
  const gz = svg.append("g");
  const pLand = gz.append("path").attr("class", "hex-land");
  const pHot = gz.append("path").attr("class", "hex-hot");
  const pDis = gz.append("path").attr("class", "hex-disputed");
  const pBorder = gz.append("path").attr("class", "hex-border");
  const pBorderD = gz.append("path").attr("class", "hex-border dashed");
  const glab = svg.append("g").attr("class", "places").attr("aria-hidden", "true");
  const gl = svg.append("g").attr("class", "leaders");
  const gf = svg.append("g").attr("class", "flags");

  const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const ui = document.createElement("div");
  ui.className = "map-zoom";
  const globe = `<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M2.5 10h15M10 2.5c-2.6 2.8-2.6 12.2 0 15M10 2.5c2.6 2.8 2.6 12.2 0 15" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>`;
  ui.innerHTML = [["in", "+", t("Zoom in")], ["out", "−", t("Zoom out")], ["home", globe, t("Whole world")]]
    .map(([k, s, l]) => `<button type="button" data-z="${k}" aria-label="${l}" title="${l}">${s}</button>`).join("");
  const hint = document.createElement("div");
  hint.className = "map-hint";
  hint.setAttribute("aria-hidden", "true");
  hint.textContent = mac ? tx("Hold ⌘ and scroll to zoom, or use the buttons", "Maintenez ⌘ et faites défiler pour zoomer, ou utilisez les boutons")
    : tx("Hold Ctrl and scroll to zoom, or use the buttons", "Maintenez Ctrl et faites défiler pour zoomer, ou utilisez les boutons");
  root.append(ui, hint);

  /* ---------------------------------------------------------------- the hexagons */
  let T = d3.zoomIdentity, cur = null, lastBuild = 0;
  const api = {};
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  // a finer grid every √2 of size on screen, so hexagons stay 6 to 8.5 pixels apart whatever the zoom and the screen
  const level = k => Math.max(0, Math.floor(2 * Math.log2(k * pxu * S0 / SPX) + 1e-6));
  const big = () => T.k * pxu / REF;   // how large the map is drawn, against the 820-pixel map the label zooms were set for

  function build(force = false) {
    const lvl = level(T.k);
    const key = lvl >= 3 && data.fine ? "fine" : "coarse";
    const [vx0, vy0] = T.invert([VB.x, VB.y]), [vx1, vy1] = T.invert([VB.x + VB.w, VB.y + VB.h]);
    if (!force && cur && cur.lvl === lvl && cur.key === key && vx0 >= cur.x0 && vy0 >= cur.y0 && vx1 <= cur.x1 && vy1 <= cur.y1) return;
    if (lvl >= 2 && !fineLoad) {
      fineLoad = getJSON("assets/geo/world-map-fine.json").then(f => { data.fine = { rings: decode(f.rings, f.q), paths: [], dis: decDis(f.disputed || [], f.q) }; build(true); }).catch(() => {});
    }
    lastBuild = performance.now();
    const L = data[key];
    const s = S0 / Math.SQRT2 ** lvl, rh = s * Math.sqrt(3) / 2;
    // the part on screen and a quarter of it again on each side, so that small pans need no new grid
    const pw = (vx1 - vx0) / 4, ph = (vy1 - vy0) / 4;
    const x0 = Math.max(0, vx0 - pw), y0 = Math.max(0, vy0 - ph), x1 = Math.min(W, vx1 + pw), y1 = Math.min(H, vy1 + ph);
    const j0 = Math.floor(y0 / rh), j1 = Math.ceil(y1 / rh), i0 = Math.floor(x0 / s) - 1, i1 = Math.ceil(x1 / s);
    const nx = i1 - i0 + 1;
    const own = new Int16Array(nx * (j1 - j0 + 1)).fill(-1);
    const at = (i, j) => (i < i0 || i > i1 || j < j0 || j > j1 ? -1 : (j - j0) * nx + (i - i0));
    const cx = (i, j) => i * s + (j & 1 ? s / 2 : 0);

    // paint the countries on screen into a small canvas, then read the colour under each centre
    const ppu = PPC / s;
    const cw = Math.ceil((x1 - x0) * ppu) + 1, ch = Math.ceil((y1 - y0) * ppu) + 1;
    canvas.width = cw; canvas.height = ch;
    ctx.setTransform(ppu, 0, 0, ppu, -x0 * ppu, -y0 * ppu);
    const vis = [];
    for (let p = 0; p < P.length; p++) {
      const q = P[p];
      if (q[6] < x0 || q[4] > x1 || q[7] < y0 || q[5] > y1) continue;
      vis.push(p);
      const rs = L.rings[p];
      if (!rs) continue;
      const v = q[0] + 1;
      ctx.fillStyle = `rgb(${v},${G(v)},${B(v)})`;
      ctx.fill(L.paths[p] || (L.paths[p] = toPath(rs)), "evenodd");
    }
    const img = ctx.getImageData(0, 0, cw, ch).data;
    const exact = (x, y) => {
      for (const p of vis) {
        const q = P[p], rs = L.rings[p];
        if (rs && x >= q[4] && x <= q[6] && y >= q[5] && y <= q[7] && inside(rs, x, y)) return q[0];
      }
      return -1;
    };
    for (let j = j0; j <= j1; j++) {
      const y = j * rh, py = Math.floor((y - y0) * ppu);
      if (py < 0 || py >= ch) continue;
      for (let i = i0; i <= i1; i++) {
        const x = cx(i, j), px = Math.floor((x - x0) * ppu);
        if (px < 0 || px >= cw) continue;
        const o = (py * cw + px) * 4, a = img[o + 3];
        if (!a) continue;
        const v = img[o];
        own[at(i, j)] = a === 255 && v > 0 && v <= C.length && img[o + 1] === G(v) && img[o + 2] === B(v) ? v - 1 : exact(x, y);
      }
    }

    // islands too small to hold a centre, once they are a third of a hexagon (and every marked country's largest part):
    // the nearest hexagon, or the nearest free one around it
    const nearest = (x, y) => {
      const jj = Math.floor(y / rh);
      let best = null, bd = Infinity;
      for (const j of [jj, jj + 1]) {
        const i = Math.round((x - (j & 1 ? s / 2 : 0)) / s), d = (cx(i, j) - x) ** 2 + (j * rh - y) ** 2;
        if (d < bd) { bd = d; best = [i, j]; }
      }
      return best;
    };
    const around = (i, j) => (j & 1
      ? [[i - 1, j], [i + 1, j], [i, j - 1], [i + 1, j - 1], [i, j + 1], [i + 1, j + 1]]
      : [[i - 1, j], [i + 1, j], [i - 1, j - 1], [i, j - 1], [i - 1, j + 1], [i, j + 1]]);
    const cellA = s * s * Math.sqrt(3) / 2;
    for (const p of vis) {
      const q = P[p];
      if (q[1] < ISLAND * cellA && !(hot[q[0]] && main[q[0]] === p)) continue;
      if (q[6] - q[4] > 3 * s || q[7] - q[5] > 3 * s || q[2] < x0 || q[2] > x1 || q[3] < y0 || q[3] > y1) continue;
      const [i, j] = nearest(q[2], q[3]), k = at(i, j);
      if (k < 0 || own[k] === q[0]) continue;
      if (own[k] === -1) { own[k] = q[0]; continue; }
      const free = around(i, j).map(([a, b]) => [at(a, b), (cx(a, b) - q[2]) ** 2 + (b * rh - q[3]) ** 2])
        .filter(([kk]) => kk >= 0).sort((u, w) => u[1] - w[1]).find(([kk]) => own[kk] === -1 || own[kk] === q[0]);
      if (free && own[free[0]] === -1) own[free[0]] = q[0];
    }

    // disputed areas: hexagons whose centre falls in one
    const dsp = new Int16Array(own.length);
    DIS.forEach((g, di) => {
      const b = g.b, rs = L.dis[di];
      if (!rs || b[2] < x0 || b[0] > x1 || b[3] < y0 || b[1] > y1) return;
      for (let j = Math.max(j0, Math.floor(b[1] / rh)); j <= Math.min(j1, Math.ceil(b[3] / rh)); j++) {
        for (let i = Math.max(i0, Math.floor(b[0] / s) - 1); i <= Math.min(i1, Math.ceil(b[2] / s)); i++) {
          const k = at(i, j);
          if (k >= 0 && own[k] >= 0 && inside(rs, cx(i, j), j * rh)) dsp[k] = di + 1;
        }
      }
    });

    // one path for the marked countries, one for disputed areas, one for the rest
    const R = HEX * s, a = R * Math.sqrt(3) / 2, b = R / 2, dec = s > 1 ? 2 : s > 0.1 ? 3 : 4;
    const f = v => +v.toFixed(dec + 1);
    const shape = `l${f(a)},${f(b)}v${f(R)}l${f(-a)},${f(b)}l${f(-a)},${f(-b)}v${f(-R)}z`;
    const land = [], hotd = [], disd = [];
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = at(i, j), o = own[k];
        if (o < 0) continue;
        (dsp[k] ? disd : hot[o] ? hotd : land).push(`M${cx(i, j).toFixed(dec)},${(j * rh - R).toFixed(dec)}${shape}`);
      }
    }
    pLand.attr("d", land.join(""));
    pHot.attr("d", hotd.join(""));
    pDis.attr("d", disd.join(""));
    // borders: the edge shared with a neighbour of another country or area (east, south-east and south-west, so each
    // once); dashed where either side is a disputed area
    const rt = s / Math.sqrt(3), half = s / 2, bd = [], bdd = [];
    const grp = k => (dsp[k] ? 100000 + dsp[k] : own[k]);
    let dashed = false;
    const seg = (xa, ya, xb, yb) => (dashed ? bdd : bd).push(`M${xa.toFixed(dec)},${ya.toFixed(dec)}L${xb.toFixed(dec)},${yb.toFixed(dec)}`);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k0 = at(i, j), o = grp(k0);
        if (own[k0] < 0) continue;
        const x = cx(i, j), y = j * rh, odd = j & 1;
        const other = (a2, b2) => { const k = at(a2, b2); dashed = k >= 0 && (dsp[k] > 0 || dsp[k0] > 0); return k >= 0 && own[k] >= 0 && grp(k) !== o; };
        if (other(i + 1, j)) seg(x + half, y - rt / 2, x + half, y + rt / 2);
        if (other(odd ? i + 1 : i, j + 1)) seg(x + half, y + rt / 2, x, y + rt);
        if (other(odd ? i : i - 1, j + 1)) seg(x, y + rt, x - half, y + rt / 2);
      }
    }
    pBorder.attr("d", bd.join(""));
    pBorderD.attr("d", bdd.join(""));
    const count = new Int32Array(C.length);
    for (const o of own) if (o >= 0) count[o]++;
    cur = { lvl, key, x0, y0, x1, y1, s, rh, own, at, cx, count };
    api.last = { ms: Math.round(performance.now() - lastBuild), hexagons: land.length + hotd.length, level: lvl, data: key, box: [x0, y0, x1, y1].map(v => Math.round(v)) };
  }

  /* ---------------------------------------------------------------- the flags */
  const lines = gl.selectAll("line").data(ms).join("line");
  const fl = gf.selectAll("g.flag").data(ms).join("g").attr("class", "flag");
  fl.each(function (m) { svgFlag(d3.select(this), m.c, R0, { ring: "var(--panel)", ringWidth: 1.6, edge: true }); });
  withTip(fl, m => m.tip(m)).style("cursor", m => (m.click ? "pointer" : "default")).on("click", (ev, m) => { if (m.click) m.click(m); });

  // flags follow their country while the map moves; their size and place are worked out again when it stops
  function render(dur = 0) {
    ms.forEach(m => {
      [m.px, m.py] = T.apply([m.lx, m.ly]);
      m.on = inView(m.px, m.py);
    });
    fl.interrupt().style("display", m => (m.on ? null : "none"));
    lines.interrupt().style("display", m => (m.on && Math.hypot(m.dx, m.dy) > m.r * 0.8 ? null : "none"));
    const tr = sel => (dur && !reduce ? sel.transition().duration(dur) : sel);
    tr(fl).attr("transform", m => `translate(${m.px + m.dx},${m.py + m.dy}) scale(${m.r / R0})`);
    tr(lines).attr("x1", m => m.px).attr("y1", m => m.py).attr("x2", m => m.px + m.dx).attr("y2", m => m.py + m.dy);
  }
  // land hexagons (marked ones count three times) under a circle on screen, to find a free side for a flag
  function landUnder(x, y, r) {
    const g = cur, [bx, by] = T.invert([x, y]), br = r / T.k;
    let n = 0;
    for (let j = Math.floor((by - br) / g.rh); j <= Math.ceil((by + br) / g.rh); j++) {
      for (let i = Math.floor((bx - br) / g.s) - 1; i <= Math.ceil((bx + br) / g.s); i++) {
        const k = g.at(i, j);
        if (k < 0 || g.own[k] < 0 || (g.cx(i, j) - bx) ** 2 + (j * g.rh - by) ** 2 > br * br) continue;
        n += hot[g.own[k]] ? 3 : 1;
      }
    }
    return n;
  }
  const DIRS = [0, 1, -1, 4, 3, -3, -2, 2].map(a => [Math.cos(a * Math.PI / 4), Math.sin(a * Math.PI / 4)]); // east first
  // radius: three quarters of the distance to the nearest other flag's country (neighbours are then pushed a little
  // apart), between 6 and 14 screen pixels (at most 8 on a phone); a flag that would hide its whole country goes beside it
  function place(dur = 0) {
    const u = 1 / pxu;   // map units per screen pixel
    const rMax = Math.min(14, Math.max(8, (root.clientWidth || 960) / 45)), rMin = Math.min(6, rMax);
    const pts = ms.map(m => T.apply([m.lx, m.ly]));
    const cell = (cur.s * T.k) ** 2 * Math.sqrt(3) / 2;
    ms.forEach((m, i) => {
      let nn = Infinity;
      pts.forEach((p, j) => { if (j !== i) nn = Math.min(nn, Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1])); });
      m.r = Math.max(rMin * u, Math.min(rMax * u, 0.75 * nn));
      [m.px, m.py] = pts[i];
      m.on = inView(m.px, m.py);
      m.tx = m.px; m.ty = m.py;
      const area = cur.count[m.ci] * cell;
      if (m.on && area < 0.5 * Math.PI * m.r * m.r) {
        const d = m.r + Math.sqrt(area / Math.PI) + 3 * u;
        let best = Infinity;
        DIRS.forEach(([ex, ey], k) => {
          const x = m.px + ex * d, y = m.py + ey * d;
          const out = x < VB.x + m.r || x > VB.x + VB.w - m.r || y < VB.y + m.r || y > VB.y + VB.h - m.r;
          const cost = landUnder(x, y, m.r + u) + (out ? 1000 : 0) + k * 0.01;
          if (cost < best) { best = cost; m.tx = x; m.ty = y; }
        });
      }
    });
    const nodes = ms.filter(m => m.on).map(m => ({ m, x: m.tx, y: m.ty }));
    const sim = d3.forceSimulation(nodes)
      .force("x", d3.forceX(d => d.m.tx).strength(0.7)).force("y", d3.forceY(d => d.m.ty).strength(0.7))
      .force("c", d3.forceCollide(d => d.m.r + 2.4 * u).iterations(3)).stop();
    for (let i = 0; i < 240; i++) {
      sim.tick();
      nodes.forEach(d => { const r = d.m.r + 2 * u; d.x = Math.max(VB.x + r, Math.min(VB.x + VB.w - r, d.x)); d.y = Math.max(VB.y + r, Math.min(VB.y + VB.h - r, d.y)); });
    }
    nodes.forEach(d => { d.m.dx = d.x - d.m.px; d.m.dy = d.y - d.m.py; });
    render(dur);
    labels();
  }

  /* ---------------------------------------------------------------- place names */
  // capitals and cities from Natural Earth, shown from its MIN_ZOOM (a web-map zoom; ours is about log2(k) + 1.7),
  // capitals two steps earlier; none at the world view. A name that would touch a flag or another name is left out.
  let places = null, placesLoad = null;
  const meas = document.createElement("canvas").getContext("2d");
  function labels() {
    if (big() < LABEL_FROM) { glab.selectAll("*").remove(); return; }
    if (!places) {
      if (!placesLoad) placesLoad = getJSON("assets/geo/world-places.json").then(d => { places = d.places; labels(); }).catch(() => {});
      return;
    }
    const zz = Math.log2(big()) + 1.7, fr = isFr(), es = isEs();
    const boxes = ms.filter(m => m.on).map(m => { const x = m.px + m.dx, y = m.py + m.dy, r = m.r + 2; return [x - r, y - r, x + r, y + r]; });
    const hit = b => boxes.some(c => b[0] < c[2] && b[2] > c[0] && b[1] < c[3] && b[3] > c[1]);
    const out = [];
    for (const p of places) {
      const cap = p[3];
      if (p[2] / 10 > zz + (cap ? 2 : 0.3)) continue;
      const [x, y] = T.apply([p[0], p[1]]);
      if (!inView(x, y, -4 / pxu)) continue;
      const name = (fr && p[5]) || (es && p[6]) || p[4], px = cap ? 11 : 10;
      meas.font = `${cap ? 600 : 400} ${px}px "Public Sans", sans-serif`;
      const w = meas.measureText(name).width / pxu, fs = px / pxu, r = (cap ? 2.6 : 1.9) / pxu, gap = 3 / pxu;
      let side = 1, b = [x - r - 1, y - fs * 0.62, x + r + gap + w, y + fs * 0.62];
      if (b[2] > VB.x + VB.w || hit(b)) {
        side = -1; b = [x - r - gap - w, y - fs * 0.62, x + r + 1, y + fs * 0.62];
        if (b[0] < VB.x || hit(b)) continue;
      }
      boxes.push(b);
      out.push({ p, name, cap, side, fs, r, gap, pxu });
      if (out.length >= 260) break;
    }
    glab.selectAll("g.pl").data(out, d => d.p[4] + d.p[0]).join(e => { const g = e.append("g"); g.append("circle"); g.append("text"); return g; })
      .attr("class", d => (d.cap ? "pl cap" : "pl"))
      .call(g => g.select("circle").attr("r", d => d.r).style("stroke-width", d => 1.2 / d.pxu))
      .call(g => g.select("text").attr("x", d => d.side * (d.r + d.gap)).attr("dy", "0.35em")
        .attr("text-anchor", d => (d.side > 0 ? "start" : "end")).style("font-size", d => `${d.fs}px`)
        .style("stroke-width", d => 2.6 / d.pxu).text(d => d.name));
    moveLabels();
  }
  const moveLabels = () => glab.selectAll("g.pl").attr("transform", d => `translate(${T.apply([d.p[0], d.p[1]])})`);

  /* ---------------------------------------------------------------- zoom */
  const zoom = d3.zoom().scaleExtent([1, KMAX]).translateExtent([[0, 0], [W, H]])
    // the page keeps scrolling with the wheel and with one finger; Ctrl or ⌘ + wheel, a pinch, or a drag move the map
    .filter(ev => (ev.type === "wheel" ? ev.ctrlKey || ev.metaKey : ev.type === "touchstart" ? ev.touches.length > 1 : !ev.button && !ev.ctrlKey))
    .wheelDelta(ev => -ev.deltaY * (ev.deltaMode === 1 ? 0.05 : ev.deltaMode ? 1 : 0.003) * (ev.deltaMode === 0 && Math.abs(ev.deltaY) < 25 ? 3 : 1))
    .on("zoom", ev => {
      T = ev.transform;
      gz.attr("transform", T);
      svg.classed("zoomed", T.k > 1.01);
      render(0);
      moveLabels();
      if (performance.now() - lastBuild > 140) build();
    })
    .on("end", () => { build(); place(260); });
  svg.call(zoom).style("touch-action", "pan-x pan-y");

  ui.addEventListener("click", e => {
    const b = e.target.closest("button");
    if (!b) return;
    const go = svg.transition().duration(reduce ? 0 : 450);
    if (b.dataset.z === "home") go.call(zoom.transform, d3.zoomIdentity);
    else go.call(zoom.scaleBy, b.dataset.z === "in" ? 2 : 0.5);
  });
  let hintT;
  svg.on("wheel.hint", ev => {
    if (ev.ctrlKey || ev.metaKey) return;
    hint.classList.add("on");
    clearTimeout(hintT);
    hintT = setTimeout(() => hint.classList.remove("on"), 1500);
  });
  let rsT;
  addEventListener("resize", () => { clearTimeout(rsT); rsT = setTimeout(() => { sizeBox(); build(true); place(0); }, 150); });

  build();
  place(0);

  // zoom onto some countries (their larger parts), for links and tests
  function focus(iso3s, dur = 600) {
    const set = new Set(iso3s.map(x => ciOf.get(x)));
    const ps = P.filter(q => set.has(q[0]) && q[1] > 0.01);   // islands of more than about 13 km2
    if (!ps.length) return;
    focusBox(d3.min(ps, q => q[4]), d3.min(ps, q => q[5]), d3.max(ps, q => q[6]), d3.max(ps, q => q[7]), dur);
  }
  // zoom onto a box in map units
  function focusBox(bx0, by0, bx1, by1, dur = 600) {
    const k = Math.min(KMAX, 0.85 / Math.max((bx1 - bx0) / VB.w, (by1 - by0) / VB.h));
    const tt = d3.zoomIdentity.translate(VB.x + VB.w / 2, VB.y + VB.h / 2).scale(k).translate(-(bx0 + bx1) / 2, -(by0 + by1) / 2);
    svg.transition().duration(reduce ? 0 : dur).call(zoom.transform, tt);
  }
  Object.assign(api, { focus, focusBox, zoom, svg });
  root.__map = api;
  return api;
}
