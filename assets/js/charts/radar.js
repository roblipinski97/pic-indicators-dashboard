// Radar chart of area scores: one axis per area, rings at 25, 50, 75 and 100%; 0% is a small circle round the centre,
// so that areas scoring 0 stay apart instead of meeting in one point. Up to two shapes (e.g. de jure and
// de facto). The vertices are coloured by score with the active palette; the area list next to it gives the
// exact figures, since a filled shape is easy to over-read.
import { d3, scoreColor, pct, esc, withTip, t, tx, isFr } from "../core.js";

/**
 * el: container; areas: [names]; series: [{key, label, color, dash, values: Map(area -> score or null)}]
 */
export function drawRadar(el, { areas, series, labels = new Map(), width }) {
  el.innerHTML = "";
  const W = Math.min(width || el.clientWidth || 560, 620), narrow = W < 460;
  const H = W * (narrow ? 0.92 : 0.84);
  const R = Math.min(W * (narrow ? 0.3 : 0.32), H * 0.36);
  const cx = W / 2, cy = H / 2 + 4;
  const svg = d3.select(el).append("svg").attr("width", W).attr("height", H).attr("viewBox", `0 0 ${W} ${H}`)
    .attr("role", "img").attr("aria-label", tx("Radar chart of scores by area: ", "Graphique radar des scores par domaine : ") + areas.map(a => labels.get(a) || a).join(", "));
  const n = areas.length, ang = i => -Math.PI / 2 + (2 * Math.PI * i) / n;
  const R0 = R * 0.13, rad = v => R0 + (R - R0) * v;   // the radius of a score: 0% at R0, 100% at R
  const pt = (i, v) => [cx + Math.cos(ang(i)) * rad(v), cy + Math.sin(ang(i)) * rad(v)];

  // rings and spokes
  const g = svg.append("g");
  // the 0% circle, faint and dotted, then the rings
  g.append("circle").attr("cx", cx).attr("cy", cy).attr("r", R0).attr("fill", "none").attr("stroke", "var(--line)").attr("stroke-dasharray", "1 3");
  [0.25, 0.5, 0.75, 1].forEach(r => {
    g.append("circle").attr("cx", cx).attr("cy", cy).attr("r", rad(r)).attr("fill", "none")
      .attr("stroke", r === 1 ? "var(--line-3)" : "var(--line)").attr("stroke-dasharray", r === 0.5 ? "4 3" : null);
    // ring labels sit between the first two spokes, away from the values
    const a0 = -Math.PI / 2 + Math.PI / n;
    g.append("text").attr("x", cx + Math.cos(a0) * rad(r) + 2).attr("y", cy + Math.sin(a0) * rad(r) - 2).attr("font-size", 10.5).attr("fill", "var(--ink-4)").text(pct(r));
  });
  areas.forEach((a, i) => {
    const [x, y] = pt(i, 1);
    const [x0, y0] = pt(i, 0);
    g.append("line").attr("x1", x0).attr("y1", y0).attr("x2", x).attr("y2", y).attr("stroke", "var(--line)");
    const [lx, ly] = pt(i, narrow ? 1.17 : 1.2), c = Math.cos(ang(i));
    const anchor = Math.abs(c) < 0.2 ? "middle" : c > 0 ? "start" : "end";
    const words = String(labels.get(a) || a).split(" ");
    const lines = words.length > 1 && (labels.get(a) || a).length > 13 ? [words.slice(0, Math.ceil(words.length / 2)).join(" "), words.slice(Math.ceil(words.length / 2)).join(" ")] : [labels.get(a) || a];
    const t = g.append("text").attr("x", lx).attr("y", ly - (lines.length - 1) * 7).attr("text-anchor", anchor)
      .attr("dy", "0.35em").attr("font-size", narrow ? 12 : 13).attr("font-weight", 600).attr("fill", "var(--ink)");
    lines.forEach((l, k) => t.append("tspan").attr("x", lx).attr("dy", k ? "1.15em" : "0.35em").text(l));
  });

  // shapes
  series.forEach(s => {
    // areas without an answer are left out of the shape (drawing them at the centre would read as 0%)
    const ok = areas.map((a, i) => { const v = s.values.get(a); return v == null ? null : pt(i, v); }).filter(Boolean);
    if (ok.length >= 3) {
      svg.append("path").attr("d", d3.line().curve(d3.curveLinearClosed)(ok))
        .attr("fill", s.fill || s.color).attr("fill-opacity", s.fill ? (series.length > 1 ? 0.42 : 0.6) : 0.1).attr("stroke", s.color).attr("stroke-width", 2)
        .attr("stroke-dasharray", s.dash || null).attr("stroke-linejoin", "round");
    }
  });
  // vertices: coloured by score, with the value next to them for the first shape (or for each, when two)
  series.forEach((s, si) => {
    areas.forEach((a, i) => {
      const v = s.values.get(a);
      if (v == null) return;
      const [x, y] = pt(i, v);
      const m = svg.append("g").attr("class", "rm").attr("transform", `translate(${x},${y})`);
      m.append("circle").attr("r", 5.5).attr("fill", scoreColor(v)).attr("stroke", s.color).attr("stroke-width", 2);
      withTip(m, () => `<div class="tt-head">${esc(labels.get(a) || a)}</div><div><span class="tt-val">${pct(v)}</span> <span class="tt-muted">${esc(s.label)}</span></div>`);
      if (series.length === 1 || !narrow) {
        const off = series.length === 2 ? (si === 0 ? -1 : 1) : 0;
        const c = Math.cos(ang(i)), sn = Math.sin(ang(i));
        // a value near 0 is labelled a little way out along its spoke, so that the labels of several points at the
        // centre don't sit on top of one another
        const [bx, by] = v < 0.1 ? pt(i, 0.1) : [x, y];
        const tx = bx + (Math.abs(c) < 0.3 ? 10 * (off || 1) : c * 14), ty = by + (Math.abs(c) < 0.3 ? sn * 14 : 4 + off * 9);
        svg.append("text").attr("x", tx).attr("y", ty).attr("text-anchor", Math.abs(c) < 0.3 ? (off < 0 ? "end" : "start") : c > 0 ? "start" : "end")
          .attr("font-size", 11).attr("font-weight", 600).attr("fill", s.color).attr("paint-order", "stroke")
          .attr("stroke", "var(--panel)").attr("stroke-width", 3).text(pct(v));
      }
    });
  });
  // areas without an answer: a short note at the end of the spoke
  areas.forEach((a, i) => {
    const miss = series.filter(s => s.values.get(a) == null);
    if (!miss.length) return;
    const [x, y] = pt(i, 0.5);
    svg.append("text").attr("x", x).attr("y", y).attr("text-anchor", "middle").attr("dy", "0.35em").attr("font-size", 10.5)
      .attr("fill", "var(--ink-3)").attr("paint-order", "stroke").attr("stroke", "var(--panel)").attr("stroke-width", 3)
      .text(miss.length === series.length ? t("no answer") : `${t("no answer")} (${miss.map(s => (isFr() ? s.label : s.label.toLowerCase())).join(", ")})`);
  });
  return svg.node();
}
