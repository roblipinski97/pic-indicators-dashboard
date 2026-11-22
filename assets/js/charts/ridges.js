// Ridgeline of area scores: a smoothed distribution of the countries' scores, with the countries themselves as flags
// along the baseline. With one series, one row per area. With two (de jure and de facto), each area gets two rows
// next to each other, one per series, so the two can be compared area by area without the curves overlapping.
import { d3, pct, esc, flagImg, svgFlag, withTip, t, tx } from "../core.js";

function kde(values, bw = 0.085) {
  const xs = d3.range(0, 1.0001, 0.01);
  const k = u => Math.exp(-0.5 * u * u) / Math.sqrt(2 * Math.PI);
  return xs.map(x => [x, values.length ? d3.mean(values, v => k((x - v) / bw)) / bw : 0]);
}

/**
 * rows: [{ area, label, series: { key: [{ c, v, idk }] } }]; series: [{ key, label, color, fill }]
 */
export function drawRidges(el, { rows, series, width, highlight, onClick }) {
  el.innerHTML = "";
  const W = width || el.clientWidth || 900, narrow = W < 620, paired = series.length > 1;
  const M = { l: paired ? (narrow ? 70 : 96) : (narrow ? 110 : 190), r: 24, t: 10, b: 34 };
  // one row per area, or (paired) an area title and one row per series
  const rowH = paired ? (narrow ? 78 : 92) : (narrow ? 112 : 150);
  const headH = paired ? 26 : 0, gap = paired ? 18 : 0, axH = 26;   // axH: the score scale under every area
  const groupH = headH + (paired ? series.length : 1) * rowH + axH + gap;
  const H = M.t + rows.length * groupH + M.b;
  const x = d3.scaleLinear().domain([0, 1]).range([M.l, W - M.r]);
  const svg = d3.select(el).append("svg").attr("width", W).attr("height", H).attr("viewBox", `0 0 ${W} ${H}`)
    .attr("role", "img").attr("aria-label", tx("Distribution of country scores by area", "Distribution des scores des pays par domaine") + (paired ? ": " + series.map(s => s.label).join(", ") : ""));
  // grid
  const TICKS = [0, 0.25, 0.5, 0.75, 1];
  TICKS.forEach(t => {
    svg.append("line").attr("x1", x(t)).attr("x2", x(t)).attr("y1", M.t).attr("y2", H - M.b + 6).attr("stroke", t === 0.5 ? "var(--line-3)" : "var(--line-2)").attr("stroke-dasharray", t === 0.5 ? "4 3" : null);
  });
  svg.append("text").attr("x", (x(0) + x(1)) / 2).attr("y", H - M.b + 26).attr("text-anchor", "middle").attr("font-size", 13).attr("font-weight", 600).attr("fill", "var(--ink)").text(t("Score: points earned as a share of points possible"));

  const fr = narrow ? 7 : 8;
  rows.forEach((r, i) => {
    const top = M.t + i * groupH;
    const g = svg.append("g").attr("class", "ridge");
    const tip = p => `<div class="tt-head">${flagImg(p.c)}${esc(p.c.name)}</div><div class="tt-muted">${esc(r.label)}</div>` +
      series.map(s => { const q = (r.series[s.key] || []).find(z => z.c === p.c); return q ? `<div>${esc(s.label)}: <b>${pct(q.v)}</b></div>` : ""; }).join("") +
      (p.idk != null ? `<div class="tt-muted">${tx("I don't know: {v} of the points", "Je ne sais pas : {v} des points", { v: pct(p.idk) })}</div>` : "");
    if (paired) {
      // area title over the pair, and a separator above it (except for the first)
      if (i) g.append("line").attr("x1", 0).attr("x2", W - M.r).attr("y1", top - gap / 2 + 2).attr("y2", top - gap / 2 + 2).attr("stroke", "var(--line-2)");
      g.append("text").attr("x", 0).attr("y", top + headH - 8).attr("font-size", narrow ? 13 : 14).attr("font-weight", 700).attr("fill", "var(--ink)").text(r.label);
    }
    // the curves of one area share one height scale, so the two of a pair can be compared
    const dens = series.map(s => ({ s, d: kde((r.series[s.key] || []).map(p => p.v)) }));
    const ymax = d3.max(dens, d => d3.max(d.d, p => p[1])) || 1;
    dens.forEach(({ s, d }, k) => {
      const base = paired ? top + headH + (k + 1) * rowH - 22 : top + rowH - 26;
      const hgt = (paired ? rowH : rowH) * 0.72;
      const y = d3.scaleLinear().domain([0, ymax]).range([base, base - hgt]);
      g.append("line").attr("x1", x(0)).attr("x2", x(1)).attr("y1", base).attr("y2", base).attr("stroke", "var(--line-3)");
      // row label: the area (one series) or the series (paired)
      const labText = paired ? s.label : r.label;
      const lab = g.append("text").attr("x", M.l - 18).attr("y", base - 8).attr("text-anchor", "end").attr("font-size", narrow ? 12 : 13)
        .attr("font-weight", paired ? 600 : (r.area === "Total" ? 700 : 600)).attr("fill", paired ? s.color : "var(--ink)");
      const words = labText.split(" ");
      if (!paired && narrow && words.length > 1 && labText.length > 12) {
        lab.append("tspan").attr("x", M.l - 18).attr("dy", "-0.6em").text(words.slice(0, Math.ceil(words.length / 2)).join(" "));
        lab.append("tspan").attr("x", M.l - 18).attr("dy", "1.15em").text(words.slice(Math.ceil(words.length / 2)).join(" "));
      } else lab.text(labText);
      const pts0 = r.series[s.key] || [];
      if (!pts0.length) {
        g.append("text").attr("x", x(0.5)).attr("y", base - 10).attr("text-anchor", "middle").attr("font-size", 12).attr("fill", "var(--ink-3)").text(t("No scored answer"));
        return;
      }
      g.append("path").attr("d", d3.area().x(p => x(p[0])).y0(base).y1(p => y(p[1])).curve(d3.curveBasis)(d))
        .attr("fill", s.fill || s.color).attr("fill-opacity", s.fill ? 0.85 : 0.2);
      g.append("path").attr("d", d3.line().x(p => x(p[0])).y(p => y(p[1])).curve(d3.curveBasis)(d))
        .attr("fill", "none").attr("stroke", s.color).attr("stroke-width", 1.8);
      // median tick
      const med = d3.median(pts0, p => p.v);
      g.append("line").attr("x1", x(med)).attr("x2", x(med)).attr("y1", base).attr("y2", y(d[Math.round(med * 100)][1])).attr("stroke", s.color).attr("stroke-width", 1.2).attr("stroke-dasharray", "3 2");
      // countries along this row's baseline, placed so they don't cover each other
      const pts = pts0.map(p => ({ ...p, x0: x(p.v) }));
      const sim = d3.forceSimulation(pts).force("x", d3.forceX(p => p.x0).strength(1)).force("y", d3.forceY(0).strength(0.08))
        .force("c", d3.forceCollide(fr + 1)).stop();
      // flags stay within 0-100%, so the collision pushes them up or down rather than past the axis ends
      for (let t = 0; t < 160; t++) { sim.tick(); pts.forEach(p => { p.x = Math.max(x(0), Math.min(x(1), p.x)); }); }
      pts.forEach(p => { p.y = Math.max(-hgt * 0.7, Math.min(16, p.y)); });
      const fl = g.selectAll(null).data(pts).join("g").attr("class", "fl")
        .attr("transform", p => `translate(${p.x},${base + p.y})`).style("cursor", onClick ? "pointer" : null);
      fl.each(function (p) { svgFlag(d3.select(this), p.c, fr, { ring: p.c.iso3 === highlight ? "var(--ink)" : "var(--panel)", ringWidth: p.c.iso3 === highlight ? 2.5 : 1.5, edge: p.c.iso3 !== highlight }); });
      withTip(fl, tip);
      if (onClick) fl.on("click", (ev, p) => onClick(p.c));
    });
    // the score scale under the area (under the pair when paired), so every area can be read on its own
    const ay = top + headH + (paired ? series.length : 1) * rowH + 20;
    const ax = g.append("g").attr("class", "ridge-axis").attr("font-size", 11).attr("fill", "var(--ink-3)");
    ax.append("text").attr("x", M.l - 18).attr("y", ay).attr("text-anchor", "end").text(t("Score"));
    TICKS.forEach(v => ax.append("text").attr("x", x(v)).attr("y", ay).attr("text-anchor", v === 0 ? "start" : v === 1 ? "end" : "middle")
      .attr("stroke", "var(--panel)").attr("stroke-width", 3).attr("paint-order", "stroke").text(pct(v)));
  });
  return svg.node();
}
