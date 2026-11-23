// Area scores as small multiples, the alternatives to the radar on the country page: a grid with one cell per area,
// holding a bar (or a pie) for each shape of the radar: one for all questions, or de jure and de facto side by side.
// Bars and pies look like the radar's shapes: the same line colour, the same light shading (`shade()`) and, where the
// score lies, the same marker coloured by score (`marker()`); outlines are solid. One SVG, so it downloads whole.
import { d3, scoreColor, pct, esc, withTip, t, tx } from "../core.js";

/** the radar's shading: its fill colour at the radar's opacity (lighter when there is one shape) */
export const shadeOpacity = n => (n > 1 ? 0.42 : 0.6);
/** the radar's vertex: a dot coloured by score, ringed in the shape's line colour */
const marker = (g, x, y, v, s) => g.append("circle").attr("cx", x).attr("cy", y).attr("r", 5.5).attr("fill", scoreColor(v))
  .attr("stroke", s.color).attr("stroke-width", 2);

const wrap2 = s => {
  const w = String(s).split(" ");
  return w.length > 1 && s.length > 15 ? [w.slice(0, Math.ceil(w.length / 2)).join(" "), w.slice(Math.ceil(w.length / 2)).join(" ")] : [s];
};

function grid(el, areas, width, cellH, kind, labels) {
  el.innerHTML = "";
  const W = Math.min(width || el.clientWidth || 560, 640);
  const cols = W < 380 ? 2 : W < 520 ? 3 : 4;
  const cw = W / cols, rows = Math.ceil(areas.length / cols), H = rows * cellH + 6;
  const svg = d3.select(el).append("svg").attr("width", W).attr("height", H).attr("viewBox", `0 0 ${W} ${H}`)
    .attr("role", "img").attr("aria-label", (kind === "bars" ? tx("Bar charts of scores by area: ", "Diagrammes en barres des scores par domaine : ")
      : tx("Pie charts of scores by area: ", "Diagrammes circulaires des scores par domaine : ")) + areas.map(a => labels.get(a) || a).join(", "));
  const cells = areas.map((a, i) => ({ a, x: (i % cols) * cw, y: Math.floor(i / cols) * cellH }));
  cells.forEach(c => {
    // the area's name at the top of its cell
    const lines = wrap2(labels.get(c.a) || c.a);
    const tt = svg.append("text").attr("x", c.x + cw / 2).attr("y", c.y + 14).attr("text-anchor", "middle")
      .attr("font-size", 12.5).attr("font-weight", 600).attr("fill", "var(--ink)");
    lines.forEach((l, k) => tt.append("tspan").attr("x", c.x + cw / 2).attr("dy", k ? "1.15em" : 0).text(l));
  });
  return { svg, cells, cw, W };
}

/** series: [{key, label, color, fill, dash, values: Map(area -> score or null)}] */
export function drawAreaBars(el, { areas, series, labels = new Map(), width }) {
  const cellH = 186;
  const { svg, cells, cw } = grid(el, areas, width, cellH, "bars", labels);
  // room for an area name on two lines and the value over a full bar
  const top = 54, plotH = 92, n = series.length;
  const bw = Math.min(34, (cw - 36) / (n + 0.6)), gap = n > 1 ? 10 : 0;
  cells.forEach(c => {
    const x0 = c.x + cw / 2 - (n * bw + (n - 1) * gap) / 2, base = c.y + top + plotH;
    const y = v => base - plotH * v;
    // the 0-100% frame: base line, a light line at 50% and 100%
    svg.append("line").attr("x1", c.x + 12).attr("x2", c.x + cw - 12).attr("y1", base).attr("y2", base).attr("stroke", "var(--line-3)");
    [0.5, 1].forEach(v => svg.append("line").attr("x1", c.x + 12).attr("x2", c.x + cw - 12).attr("y1", y(v)).attr("y2", y(v))
      .attr("stroke", "var(--line-2)").attr("stroke-dasharray", v === 0.5 ? "3 3" : null));
    series.forEach((s, k) => {
      const v = s.values.get(c.a), bx = x0 + k * (bw + gap);
      if (v == null) {
        // "no answer" on two lines, so it stays over its own bar's place
        const w = String(t("no answer")).split(" "), k1 = Math.ceil(w.length / 2);
        const na = svg.append("text").attr("x", bx + bw / 2).attr("y", base - 18).attr("text-anchor", "middle").attr("font-size", 9)
          .attr("fill", "var(--ink-3)");
        [w.slice(0, k1).join(" "), w.slice(k1).join(" ")].filter(Boolean).forEach((l, j) =>
          na.append("tspan").attr("x", bx + bw / 2).attr("dy", j ? "1.15em" : 0).text(l));
      } else {
        const g = svg.append("g").attr("class", "rm");
        g.append("rect").attr("x", bx).attr("y", y(v)).attr("width", bw).attr("height", Math.max(plotH * v, 0.5))
          .attr("fill", s.fill).attr("fill-opacity", shadeOpacity(n)).attr("stroke", s.color).attr("stroke-width", 2);
        marker(g, bx + bw / 2, y(v), v, s);
        g.append("text").attr("x", bx + bw / 2).attr("y", y(v) - 10).attr("text-anchor", "middle").attr("font-size", 11)
          .attr("font-weight", 600).attr("fill", s.color).attr("paint-order", "stroke").attr("stroke", "var(--panel)").attr("stroke-width", 3).text(pct(v));
        withTip(g, () => `<div class="tt-head">${esc(labels.get(c.a) || c.a)}</div><div><span class="tt-val">${pct(v)}</span> <span class="tt-muted">${esc(s.label)}</span></div>`);
      }
      // what each bar is, under it (only when there are two)
      if (n > 1) svg.append("text").attr("x", bx + bw / 2).attr("y", base + 14).attr("text-anchor", "middle").attr("font-size", 10)
        .attr("fill", "var(--ink-3)").text(s.label);
    });
  });
  return svg.node();
}

/** pies filled to each shape's score as the radar is: the radar's shading and line for the points earned, the rest
 * left empty inside a light ring (the radar's 100% ring), and the marker where the slice ends */
export function drawAreaPies(el, { areas, series, labels = new Map(), width }) {
  const n = series.length, cellH = n > 1 ? 168 : 158;
  const { svg, cells, cw } = grid(el, areas, width, cellH, "pies", labels);
  const r = Math.min(n > 1 ? (cw - 30) / 4.4 : 40, 40);
  const arc = d3.arc().innerRadius(0).outerRadius(r);
  cells.forEach(c => {
    const cy = c.y + 46 + r;
    series.forEach((s, k) => {
      const cx = c.x + (n > 1 ? cw / 2 + (k === 0 ? -1 : 1) * (r + 7) : cw / 2), v = s.values.get(c.a);
      const g = svg.append("g").attr("class", "rm").attr("transform", `translate(${cx},${cy})`);
      if (v == null) {
        g.append("circle").attr("r", r).attr("fill", "var(--line-2)").attr("stroke", "var(--line-3)");
        g.append("text").attr("text-anchor", "middle").attr("dy", "0.35em").attr("font-size", 9.5).attr("fill", "var(--ink-3)").text(t("no answer"));
      } else {
        g.append("circle").attr("r", r).attr("fill", "none").attr("stroke", "var(--line-3)");
        if (v > 0) g.append("path").attr("d", v >= 1 ? d3.arc().innerRadius(0).outerRadius(r)({ startAngle: 0, endAngle: 2 * Math.PI })
          : arc({ startAngle: 0, endAngle: 2 * Math.PI * v })).attr("fill", s.fill).attr("fill-opacity", shadeOpacity(n))
          .attr("stroke", s.color).attr("stroke-width", 2).attr("stroke-linejoin", "round");
        // the marker where the slice ends; at 0 in the middle (on the rim it would sit where 100% does)
        const a = 2 * Math.PI * Math.min(v, 1);
        if (v > 0) marker(g, Math.sin(a) * r, -Math.cos(a) * r, v, s); else marker(g, 0, 0, v, s);
        withTip(g, () => `<div class="tt-head">${esc(labels.get(c.a) || c.a)}</div><div><span class="tt-val">${pct(v)}</span> <span class="tt-muted">${esc(s.label)}</span></div>`);
      }
      // the value under the pie; when there are two, the shape's name above it
      if (n > 1) svg.append("text").attr("x", cx).attr("y", cy + r + 13).attr("text-anchor", "middle").attr("font-size", 10)
        .attr("fill", "var(--ink-3)").text(s.label);
      svg.append("text").attr("x", cx).attr("y", cy + r + (n > 1 ? 27 : 15)).attr("text-anchor", "middle").attr("font-size", 11)
        .attr("font-weight", 600).attr("fill", s.color).text(v == null ? "" : pct(v));
    });
  });
  return svg.node();
}
