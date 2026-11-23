// De jure against de facto: one small scatter per area, two to a row (one on phones), as the first chart of the home
// page's story but area by area. Each flag is a country, at its de jure score (across) and its de facto score (up);
// below the diagonal the de facto score is lower. Flags are nudged apart so that none hides another.
import { d3, svgFlag, withTip, esc, pct, flagImg, t, tx } from "../core.js";

const W = 460, H = 420, M = { l: 70, r: 22, t: 20, b: 66 };   // one panel, in its own units (it scales with the page)
const R = 11;                                                  // flag radius, ring included

// nudge the flags apart: each pulled towards its own point, none overlapping another, and all kept inside the plot
// (a flag at 0% or 100% sits on the edge rather than over the axis labels)
function settle(ns, x, y, [x0, x1], [y0, y1]) {
  const sim = d3.forceSimulation(ns.map(n => ({ n, x: x(n), y: y(n) })))
    .force("x", d3.forceX(d => x(d.n)).strength(0.9))
    .force("y", d3.forceY(d => y(d.n)).strength(0.9))
    .force("c", d3.forceCollide(R - 0.5).iterations(3)).stop();
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  for (let i = 0; i < 280; i++) {
    sim.tick();
    sim.nodes().forEach(d => { d.x = clamp(d.x, x0 + R - 4, x1 - R + 4); d.y = clamp(d.y, y1 + R - 4, y0 - R + 4); });
  }
  return sim.nodes();
}

/**
 * panels: [{ key, label, points: [{ c, dj, df }] }]; highlight: an iso3 to ring; onClick(c) opens a country.
 */
export function drawLpScatters(el, { panels, highlight = null, onClick = null }) {
  el.innerHTML = `<div class="lp-grid">${panels.map((p, i) => {
    const below = p.points.filter(d => d.df < d.dj - 0.005).length;
    return `<figure class="lp-card" data-i="${i}"><figcaption><b>${esc(p.label)}</b>` +
      (p.points.length ? `<span>${tx("Below the diagonal: {a} of {b}", "Sous la diagonale : {a} sur {b}", { a: below, b: p.points.length })}</span>` : "") +
      `</figcaption><div class="lp-svg"></div></figure>`;
  }).join("")}</div>`;
  const sx = d3.scaleLinear().domain([0, 1]).range([M.l, W - M.r]);
  const sy = d3.scaleLinear().domain([0, 1]).range([H - M.b, M.t]);
  el.querySelectorAll(".lp-card").forEach(fig => {
    const p = panels[+fig.dataset.i];
    const svg = d3.select(fig.querySelector(".lp-svg")).append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("role", "img")
      .attr("aria-label", `${p.label}: ${t("Score on de jure items")} / ${t("Score on de facto items")}`);
    const txt = (x, y, s, o = {}) => svg.append("text").attr("x", x).attr("y", y).attr("font-size", o.size || 12).attr("fill", o.fill || "var(--ink-3)")
      .attr("text-anchor", o.anchor || "middle").attr("font-weight", o.weight || 400).text(s);
    // the area below the diagonal (de facto lower), the grid and the axes
    svg.append("path").attr("d", `M${sx(0)},${sy(0)}L${sx(1)},${sy(1)}V${sy(0)}Z`).attr("fill", "var(--neg-tint)").attr("opacity", 0.55);
    [0, 0.25, 0.5, 0.75, 1].forEach(v => {
      svg.append("line").attr("x1", sx(v)).attr("x2", sx(v)).attr("y1", sy(0)).attr("y2", sy(1)).attr("stroke", "var(--line-2)");
      svg.append("line").attr("y1", sy(v)).attr("y2", sy(v)).attr("x1", sx(0)).attr("x2", sx(1)).attr("stroke", "var(--line-2)");
      if (v % 0.5 === 0) { txt(sx(v), sy(0) + 22, pct(v)); txt(sx(0) - 10, sy(v) + 4, pct(v), { anchor: "end" }); }
    });
    svg.append("line").attr("x1", sx(0)).attr("y1", sy(0)).attr("x2", sx(1)).attr("y2", sy(1)).attr("stroke", "var(--ink-2)").attr("stroke-width", 1.2);
    txt((sx(0) + sx(1)) / 2, H - 14, t("Score on de jure items"), { size: 13, weight: 600, fill: "var(--ink)" });
    svg.append("text").attr("transform", `translate(16,${(sy(0) + sy(1)) / 2}) rotate(-90)`).attr("text-anchor", "middle")
      .attr("font-size", 13).attr("font-weight", 600).attr("fill", "var(--ink)").text(t("Score on de facto items"));
    if (!p.points.length) {
      txt((sx(0) + sx(1)) / 2, (sy(0) + sy(1)) / 2, tx("No country has both a de jure and a de facto score for this area.", "Aucun pays n'a à la fois un score de jure et un score de facto pour ce domaine."), { fill: "var(--ink-2)" });
      return;
    }
    // the flags, the highlighted country last (on top)
    const nodes = settle(p.points, d => sx(d.dj), d => sy(d.df), sx.range(), sy.range()).sort((a, b) => (a.n.c.iso3 === highlight) - (b.n.c.iso3 === highlight));
    const g = svg.append("g").selectAll("g.node").data(nodes).join("g").attr("class", "node").attr("transform", d => `translate(${d.x},${d.y})`);
    g.each(function (d) {
      const hl = d.n.c.iso3 === highlight;
      svgFlag(d3.select(this), d.n.c, R - 2.5, { ring: hl ? "var(--ink)" : "var(--panel)", ringWidth: hl ? 2.4 : 1.2, edge: !hl });
    });
    withTip(g, d => `<div class="tt-head">${flagImg(d.n.c)}${esc(d.n.c.name)}</div><div class="tt-muted">${esc(p.label)}</div>` +
      `<div>${tx("De jure <b>{a}</b>, de facto <b>{b}</b>", "De jure <b>{a}</b>, de facto <b>{b}</b>", { a: pct(d.n.dj), b: pct(d.n.df) })}</div>` +
      (onClick ? `<div class="tt-q">${t("Click to open the profile")}</div>` : ""));
    if (onClick) g.style("cursor", "pointer").on("click", (ev, d) => onClick(d.n.c));
    g.on("pointerenter.grow", function () { d3.select(this).raise().select("g").transition().duration(120).attr("transform", "scale(1.4)"); })
      .on("pointerleave.grow", function () { d3.select(this).select("g").transition().duration(160).attr("transform", "scale(1)"); });
  });
}
