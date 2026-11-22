// Compare countries: the answers of every country question by question (dots, with collapsible sections), the
// distribution of area scores (ridgelines), and where the answer is "I don't know" (bars). Countries can be limited
// to one World Bank region.
import { d3, loadMeta, loadGrid, params, setParams, pageUrl, segmented, tabs, fillSelect, responsive, onColours,
  esc, pct, num, plural, flagImg, flagUrl, dotSvg, dotLegend, scoreColor, darker, gradeChip, answerParts, htmlTips,
  svgButton, showError, SECTORS, cssVar, lpSeries, allSeries, lpColour, pal, isDark, withTip, sectorLabel, t, tx,
  loadAnswers, domainOf, tip } from "../core.js";
import { drawRidges } from "../charts/ridges.js";

const $ = id => document.getElementById(id);
const CHEV = `<svg class="chev" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

try {
  const meta = await loadMeta();
  const P = params();
  let sector = ["HRM", "PFM"].includes(P.get("s")) ? P.get("s") : "HRM";
  let year = meta.years.includes(+P.get("y")) ? +P.get("y") : meta.years[0];
  const regions = [...new Set(meta.withData.map(c => c.region).filter(Boolean))].sort();
  let region = regions.includes(P.get("r")) ? P.get("r") : "";
  let order = ["name", "score", "answered"].includes(P.get("o")) ? P.get("o") : "name";
  let view = ["grid", "dist", "missing"].includes(P.get("v")) ? P.get("v") : "grid";
  const distMode = { HRM: "all", PFM: "all" };   // all questions, or de jure and de facto
  let missView = P.get("m") === "bars" ? "bars" : "table";   // "I don't know" answers as a table or as bar charts
  const hl = meta.byIso.has(P.get("hl")) ? P.get("hl") : null;
  const open = new Set();
  let grid = null;

  fillSelect($("year"), meta.years.map(y => ({ value: y, label: String(y) })), year);
  $("year").addEventListener("change", e => { year = +e.target.value; load(); });
  segmented($("sector"), [{ value: "HRM", html: sectorLabel("HRM") }, { value: "PFM", html: sectorLabel("PFM") }], sector, v => { sector = v; open.clear(); load(); });
  fillSelect($("region"), [{ value: "", label: t("All regions") }, ...regions.map(r => ({ value: r, label: t(r) }))], region);
  $("region").addEventListener("change", e => { region = e.target.value; setParams({ r: region || null }); draw(); });
  segmented($("order"), [{ value: "name", label: t("Name") }, { value: "score", label: t("Score") }, { value: "answered", label: t("Share answered") }], order, v => { order = v; setParams({ o: v === "name" ? null : v }); draw(); });
  tabs($("tabs"), [{ value: "grid", label: t("Question by question") }, { value: "dist", label: t("Distribution of scores") }, { value: "missing", label: t("I don't know answers") }], view, v => { view = v; showView(); });

  function showView() {
    ["grid", "dist", "missing"].forEach(k => { $("view-" + k).hidden = k !== view; });
    setParams({ v: view === "grid" ? null : view });
    draw();
  }

  async function load() {
    grid = await loadGrid(year, sector);
    setParams({ s: sector === "HRM" ? null : sector, y: year === meta.years[0] ? null : year });
    draw();
  }

  /* ------------------------------------------------------------ which countries, in which order */
  function countries() {
    const list = grid.countries.map(i => meta.byIso.get(i)).filter(c => c && c.runs[sector] && c.runs[sector].year === year);
    const sel = region ? list.filter(c => c.region === region) : list;
    const total = c => (meta.scoreOf(c.iso3, sector, "Total", "all", year) || {}).score ?? -1;
    const answered = c => { const r = meta.countOf(c.iso3, sector, year); return r && (r.answered + r.idk) ? r.answered / (r.answered + r.idk) : -1; };
    const key = order === "score" ? total : order === "answered" ? answered : null;
    return key ? sel.sort((a, b) => key(b) - key(a) || a.name.localeCompare(b.name)) : sel.sort((a, b) => a.name.localeCompare(b.name, document.documentElement.lang || "en"));
  }

  function draw() {
    if (!grid) return;
    if (view === "grid") drawGrid();
    if (view === "dist") drawDist();
    if (view === "missing") drawMissing();
  }

  /* ------------------------------------------------------------ question by question */
  // average score of a set of questions in one country (weighted by the points each question carries)
  function avg(qs, iso) {
    let e = 0, p = 0;
    qs.forEach(q => { const cell = (grid.items[q.id] || {})[iso]; if (cell && cell[1] != null && q.points > 0) { e += q.points * cell[1]; p += q.points; } });
    return p ? e / p : null;
  }
  const avgDot = v => (v == null ? `<svg width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="5.5" fill="none" stroke="var(--line-3)" stroke-dasharray="2 2"/></svg>`
    : `<svg width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="${scoreColor(v)}" stroke="${darker(scoreColor(v))}"/></svg>`);

  function drawGrid() {
    const st = meta.structure[sector], cs = countries();
    const cellOf = (q, iso) => { const x = (grid.items[q.id] || {})[iso]; return x ? { st: x[0], s: x[1], a: x[2], g: x[3] } : null; };
    let h = `<table class="dgrid"><thead><tr><th class="qcol">Question</th>${cs.map(c => `<th class="${c.iso3 === hl ? "is-hl" : ""}"><div class="fl"><a href="${pageUrl("country.html", { c: c.iso3, s: sector })}" title="${esc(t("Open {name}'s profile", { name: c.name }))}">${flagImg(c, 24)}</a><span>${c.iso3}</span></div></th>`).join("")}</tr></thead><tbody>`;
    const hlStyle = iso => (iso === hl ? ` style="box-shadow: inset 2px 0 0 var(--ink), inset -2px 0 0 var(--ink)"` : "");
    st.sections.forEach(sec => {
      const qs = st.questions.filter(q => q.sec === sec.id);
      const sOpen = open.has("s:" + sec.id);
      const num = sector === "HRM" ? sec.id : String(+sec.id);
      h += `<tr class="g-sec${sOpen ? " is-open" : ""}" data-k="s:${esc(sec.id)}"><td class="qcol">${CHEV}<span class="muted" style="font-family:'Public Sans';font-size:var(--fs-xs);margin-right:6px">${esc(num)}</span>${esc(sec.label)}</td>${cs.map(c => { const v = avg(qs, c.iso3); return `<td data-tip="sec" data-k="${esc(sec.id)}" data-c="${c.iso3}"${hlStyle(c.iso3)}>${avgDot(v)}</td>`; }).join("")}</tr>`;
      if (!sOpen) return;
      sec.subsections.forEach(sub => {
        const sq = qs.filter(q => q.sub === sub.id);
        const uOpen = open.has("u:" + sub.id);
        h += `<tr class="g-sub${uOpen ? " is-open" : ""}" data-k="u:${esc(sub.id)}"><td class="qcol">${CHEV}${esc(sub.label)}</td>${cs.map(c => `<td data-tip="sub" data-k="${esc(sub.id)}" data-c="${c.iso3}"${hlStyle(c.iso3)}>${avgDot(avg(sq, c.iso3))}</td>`).join("")}</tr>`;
        if (!uOpen) return;
        sq.forEach(q => {
          const label = q.item ? `<span class="qn">${esc(q.n)}</span>${esc(q.item)}` : `<span class="qn">${esc(q.n)}</span>${esc(q.text)}`;
          h += `<tr class="g-q"><td class="qcol" title="${esc(q.text)}">${label}</td>${cs.map(c => `<td class="cell" data-tip="q" data-pin="1" data-q="${esc(q.id)}" data-c="${c.iso3}"${hlStyle(c.iso3)}>${dotSvg(cellOf(q, c.iso3), q, 13)}</td>`).join("")}</tr>`;
        });
      });
    });
    h += `</tbody></table>`;
    $("grid").innerHTML = cs.length ? h : `<div class="empty">${t("No country in this region has answers for this questionnaire yet.")}</div>`;
    $("grid-note").textContent = `${plural(cs.length, "country", "countries")}. ${t("Click a flag to open the country's profile.")}`;
    if ($("grid").querySelector("tr.g-q")) prefetch(cs.map(c => c.iso3));
  }

  /* ------------------------------------------------------------ one answer in full, on pointing at its dot */
  // each country's full answers (quote, sources, rationale) are loaded when first needed, one file per country
  const full = new Map(), ready = new Map();
  const keyOf = iso => `${iso}-${year}-${sector}`;
  const answersOf = iso => {
    const k = keyOf(iso);
    if (!full.has(k)) full.set(k, loadAnswers(iso, year, sector).catch(() => null).then(d => { ready.set(k, d); return d; }));
    return full.get(k);
  };
  // once questions are on screen, the visible countries' files are fetched one after another in the background
  let queue = Promise.resolve();
  const prefetch = isos => isos.forEach(iso => { if (!full.has(keyOf(iso))) queue = queue.then(() => answersOf(iso)); });
  // a long text cut at the end of a sentence near n characters
  const clip = (s, n) => {
    s = String(s || "").trim();
    if (s.length <= n) return s;
    const cut = s.slice(0, n), end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf(".\n"), cut.lastIndexOf("; "));
    return (end > n * 0.5 ? cut.slice(0, end + 1) : cut.slice(0, cut.lastIndexOf(" "))) + " …";
  };
  const shortUrl = u => { try { const x = new URL(u); return decodeURIComponent((x.hostname.replace(/^www\./, "") + x.pathname).replace(/\/$/, "") + x.search).replace(/\+/g, " "); } catch (e) { return u; } };
  const block = (title, body) => `<div class="tt-block"><h5>${title}</h5>${body}</div>`;
  let tipTarget = null;
  function cellTip(td) {
    const c = meta.byIso.get(td.dataset.c), st = meta.structure[sector], q = st.byId.get(td.dataset.q);
    const x = (grid.items[q.id] || {})[c.iso3];
    let h = `<div class="tt-head">${flagImg(c)}${esc(c.name)}</div>` +
      `<div class="tt-muted" style="font-size:var(--fs-xs)">${esc(q.n)} ${esc(q.item ? q.text + " … " + q.item : q.text)}</div>`;
    if (!x) return `<div class="tt-wide">${h}<div class="tt-muted">${t("No answer in the file")}</div></div>`;
    const [s, sc, a, g] = x;
    const txt = s === "idk" ? t("I don't know") : s === "closed" ? t("Not asked (an earlier answer closes it)") : s === "upload" ? t("Not answerable from documents") : clip(answerParts(a, q).join("; "), 300);
    h += `<div class="tt-ans">${dotSvg({ st: s, s: sc }, q, 12)}<span><b>${esc(txt)}</b></span></div>` +
      (g || (sc != null && q.points) ? `<div style="margin-top:6px">${g ? `${gradeChip(g, { title: false })} <span class="tt-muted">${t("evidence grade")}</span>` : ""}` +
        `${sc != null && q.points ? `${g ? "<br>" : ""}<span class="tt-muted">${t("Score of this answer: <b>{v}</b>", { v: pct(sc) })}</span>` : ""}</div>` : "");
    if (s !== "closed" && s !== "upload") {
      const k = keyOf(c.iso3);
      if (!ready.has(k)) h += `<div class="tt-block tt-muted">${t("Loading the quote and rationale…")}</div>`;
      else {
        const d = ready.get(k), A = d && d._byId.get(q.id);
        if (A) {
          // the pipeline appends "SOURCE: <url>" lines to its quotes; the sources are listed once, below
          const quote = A.q ? A.q.replace(/^\s*(?:CITED:\s*)?SOURCE:\s*\S+\s*$/gim, "").trim() : "";
          if (quote) h += block(t("Quoted passage"), `<p class="tt-quote">${esc(clip(quote, 550))}</p>`);
          const srcs = [...new Set([A.qu, ...(A.src || [])].filter(Boolean))];
          if (srcs.length) h += block(srcs.length > 1 ? t("Sources") : t("Source"), `<p class="tt-src">${srcs.slice(0, 3).map(u => /^https?:\/\//i.test(u)
            ? `<a href="${esc(u)}" target="_blank" rel="noopener" title="${esc(u)}">${esc(shortUrl(u))}</a>` : `<span>${esc(u)}</span>`).join("")}` +
            `${srcs.length > 3 ? `<span class="tt-muted">${t("and {n} more", { n: srcs.length - 3 })}</span>` : ""}</p>`);
          if (A.r) h += block(t("Rationale"), `<p>${esc(clip(A.r, 750))}</p>`);
          else if (s === "idk" && A.iw) h += block(t("Why the answer is \"I don't know\""), `<p>${esc(clip(A.iw, 500))}</p>`);
        }
      }
    }
    h += `<div class="tt-hint">${t("Click the dot to keep this open and use the links.")}</div>` +
      `<div class="tt-foot"><a href="${pageUrl("country.html", { c: c.iso3, s: sector })}">${esc(t("Open {name}'s profile", { name: c.name }))}</a></div>`;
    return `<div class="tt-wide">${h}</div>`;
  }
  // the tooltip of a dot; if the country's file is not in yet, it is filled in once it arrives
  function qTip(td) {
    const k = keyOf(td.dataset.c);
    if (!ready.has(k)) answersOf(td.dataset.c).then(() => { if (tipTarget === td) tip.update(cellTip(td)); });
    return cellTip(td);
  }
  $("grid").addEventListener("click", ev => {
    const cell = ev.target.closest("td.cell");
    if (cell) { tipTarget = cell; tip.pin(qTip(cell), ev); return; }
    const tr = ev.target.closest("tr.g-sec, tr.g-sub"); if (!tr) return;
    const k = tr.dataset.k;
    open.has(k) ? open.delete(k) : open.add(k);
    drawGrid();
  });
  $("g-open").addEventListener("click", () => { const st = meta.structure[sector]; st.sections.forEach(s => { open.add("s:" + s.id); s.subsections.forEach(u => open.add("u:" + u.id)); }); drawGrid(); });
  $("g-close").addEventListener("click", () => { open.clear(); drawGrid(); });
  htmlTips($("grid"), el => {
    const c = meta.byIso.get(el.dataset.c), st = meta.structure[sector];
    const head = `<div class="tt-head">${flagImg(c)}${esc(c.name)}</div>`;
    if (el.dataset.tip === "q") { if (!tip.pinned) tipTarget = el; return qTip(el); }
    const qs = el.dataset.tip === "sec" ? st.questions.filter(q => q.sec === el.dataset.k) : st.questions.filter(q => q.sub === el.dataset.k);
    const v = avg(qs, c.iso3), cells = qs.map(q => (grid.items[q.id] || {})[c.iso3]).filter(Boolean);
    const label = el.dataset.tip === "sec" ? st.secById.get(el.dataset.k).label : st.subLabel.get(el.dataset.k);
    return head + `<div class="tt-muted">${esc(label)}</div>` +
      (v == null ? `<div>${t("No scored answer")}</div>` : `<div><span class="tt-val">${pct(v)}</span> <span class="tt-muted">${t("average score")}</span></div>`) +
      `<div class="tt-muted">${t("{a} answered, {b} \"I don't know\"", { a: cells.filter(x => x[0] === "answered").length, b: cells.filter(x => x[0] === "idk").length })}</div>`;
  });

  /* ------------------------------------------------------------ spread of the area scores */
  function drawDist() {
    const areas = ["Total", ...meta.structure[sector].areas], cs = countries();
    const lp = distMode[sector] === "lp";
    const series = lp ? lpSeries() : [allSeries()];
    const rows = areas.map(a => ({ area: a, label: a === "Total" ? t("All areas") : t(a),
      series: Object.fromEntries(series.map(s => [s.key, cs.map(c => { const r = meta.scoreOf(c.iso3, sector, a, s.key, year); return r && r.score != null ? { c, v: r.score, idk: r.idk } : null; }).filter(Boolean)])) }));
    $("dist-tools").innerHTML = `<span id="dmode"></span>`;
    segmented($("dmode"), [{ value: "all", label: t("All questions") }, { value: "lp", label: t("De jure and de facto") }], distMode[sector], v => { distMode[sector] = v; drawDist(); });
    svgButton($("dist-tools"), () => $("dist").querySelector("svg[role=img]"), () => `pic-${sector}-${year}-distribution-of-scores`);
    const sw = s => `<span class="key"><svg width="24" height="12" aria-hidden="true"><rect x="1" y="1" width="22" height="10" fill="${s.fill}" stroke="${s.color}" stroke-width="1.5"/></svg>${esc(t("{label} questions", { label: s.label }))}</span>`;
    $("dist-legend").innerHTML = (lp ? series.map(sw).join("") : "") + `<span class="key">${t("Dashed vertical line: the middle country (median)")}</span>`;
    $("dist-sub").textContent = tx("Each curve is a smoothed outline of the {n}' scores in one area; the flags show where each country sits.",
      "Chaque courbe est un contour lissé des scores des {n} dans un domaine ; les drapeaux montrent la position de chaque pays.", { n: plural(cs.length, "country", "countries") }) +
      (lp ? tx(" For each area, the de jure questions (about the law) are on the upper row and the de facto questions (about practice) on the lower one.",
        " Pour chaque domaine, les questions de jure (sur le droit) sont sur la ligne du haut et les questions de facto (sur la pratique) sur celle du bas.") : "");
    const go = c => { location.href = pageUrl("country.html", { c: c.iso3, s: sector }); };
    drawRidges($("dist"), { rows, series, width: $("dist").clientWidth, highlight: hl, onClick: go });
    $("dist-note").textContent = lp
      ? tx("The two curves of an area share one height scale; across areas, compare shape and position, not height. With so few countries, read the flags rather than the smooth outline.",
        "Les deux courbes d'un domaine partagent la même échelle de hauteur ; d'un domaine à l'autre, comparez la forme et la position, pas la hauteur. Avec si peu de pays, lisez les drapeaux plutôt que le contour lissé.")
      : tx("Curve heights are scaled within each row, so compare their shape and position, not their height. With so few countries, read the flags rather than the smooth outline.",
        "La hauteur des courbes est mise à l'échelle dans chaque ligne : comparez leur forme et leur position, pas leur hauteur. Avec si peu de pays, lisez les drapeaux plutôt que le contour lissé.");
  }

  /* ------------------------------------------------------------ where the answer is "I don't know" */
  function drawMissing() {
    const areas = meta.structure[sector].areas, cs = countries();
    const m = (c, a) => meta.scoreOf(c.iso3, sector, a, "all", year) || {};
    $("miss-tools").innerHTML = `<span id="mview"></span>`;
    segmented($("mview"), [{ value: "table", label: t("Table") }, { value: "bars", label: t("Bar charts") }], missView, v => { missView = v; setParams({ m: v === "bars" ? "bars" : null }); drawMissing(); });
    if (missView === "bars") return drawIdkBars(areas, cs, m);
    $("miss-legend").innerHTML = "";
    // countries in the order chosen above (name, score or share answered), as in the other tabs
    const rows = cs.map(c => ({ c, tot: m(c, "Total") }));
    const idk = cssVar("--ink-3");
    const cell = r => r.idk == null ? `<span class="muted">–</span>` :
      `<div class="mbar" title="${tx("{v} of {n} points", "{v} de {n} points", { v: pct(r.idk), n: num(r.possible) })}"><span style="width:${100 * r.idk}%;background:${idk}"></span><b>${pct(r.idk)}</b></div>`;
    $("missing").innerHTML = `<div class="ds-wrap" style="border:0"><table class="area-list miss-table"><thead><tr><th>${t("Country")}</th><th>${t("All areas")}</th>${areas.map(a => `<th>${esc(t(a))}</th>`).join("")}</tr></thead>
      <tbody>${rows.map(r => `<tr${r.c.iso3 === hl ? ` class="is-hl"` : ""}><td style="white-space:nowrap"><a href="${pageUrl("country.html", { c: r.c.iso3, s: sector })}" style="color:var(--ink);text-decoration:none;display:inline-flex;align-items:center;gap:8px">${flagImg(r.c, 18)}${esc(r.c.name)}</a>
        <div class="muted" style="font-size:var(--fs-xs)">${r.tot.possible ? tx("{a} of {b} points", "{a} sur {b} points", { a: num(Math.round(r.tot.possible * r.tot.idk)), b: num(r.tot.possible) }) : ""}</div></td>
        <td>${cell(r.tot)}</td>${areas.map(a => `<td>${cell(m(r.c, a))}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    $("miss-sub").textContent = tx(`Share of the points in each area on questions answered "I don't know", by country.`, `Part des points de chaque domaine sur des questions avec « Je ne sais pas », par pays.`);
    $("miss-note").textContent = t("Questions an earlier answer closes count as answered (zero points).");
  }

  // the same figures as bar charts: one small chart per country (in the order chosen above), a bar per area, shaded by the
  // share in the chosen palette, with the points answered "I don't know" over the points possible above each bar
  const SHORT = { "Performance evaluation": "Perf. evaluation", "Information systems": "Info. systems", "Reporting and audit": "Reporting" };
  function drawIdkBars(areas, cs, m) {
    // the chosen palette's lowest-answer end (made dark enough to read), from very light to full
    const end = lpColour("de facto").color, panel = cssVar("--panel") || "#fff";
    const ramp = v => d3.interpolateLab(d3.interpolateLab(end, panel)(0.85), end)(v);
    const rows = cs.map(c => ({ c, tot: m(c, "Total") })).filter(r => r.tot.idk != null);
    const n = r => Math.round((r.possible || 0) * (r.idk || 0));
    const stops = d3.range(0, 1.01, 0.1).map(v => `${ramp(v)} ${v * 100}%`).join(",");
    $("miss-legend").innerHTML = `<span class="key">${t("Share of the area's points answered \"I don't know\":")}</span><span class="key">${pct(0)}<span class="ramp" style="background:linear-gradient(90deg,${stops})"></span>${pct(1)}</span><span class="key">${t("Above each bar: points answered \"I don't know\" of the points possible")}</span>`;
    $("missing").innerHTML = `<div class="idk-grid">${rows.map(r => `<figure class="idk-card${r.c.iso3 === hl ? " is-hl" : ""}">
      <figcaption><a href="${pageUrl("country.html", { c: r.c.iso3, s: sector })}">${flagImg(r.c, 18)}${esc(r.c.name)}</a>
      <span>${tx("I don't know: {v} ({a} of {b} points)", "Je ne sais pas : {v} ({a} sur {b} points)", { v: pct(r.tot.idk), a: num(n(r.tot)), b: num(r.tot.possible) })}</span></figcaption><div class="idk-svg" data-c="${r.c.iso3}"></div></figure>`).join("")}</div>`;
    const W = Math.max(220, Math.round($("missing").querySelector(".idk-svg").clientWidth || 260)), H = 220;
    const M = { l: 34, r: 6, t: 20, b: 66 };
    const x = d3.scaleBand().domain(areas).range([M.l, W - M.r]).padding(0.22);
    const y = d3.scaleLinear().domain([0, 1]).range([H - M.b, M.t]);
    $("missing").querySelectorAll(".idk-svg").forEach(el => {
      const c = meta.byIso.get(el.dataset.c);
      const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("width", "100%").attr("role", "img")
        .attr("aria-label", c.name + tx(": share of points answered I don't know, by area", " : part des points avec « Je ne sais pas », par domaine"));
      [0, 0.25, 0.5, 0.75, 1].forEach(t => {
        svg.append("line").attr("x1", M.l).attr("x2", W - M.r).attr("y1", y(t)).attr("y2", y(t)).attr("stroke", t === 0 ? "var(--line-3)" : "var(--line-2)");
        if (t % 0.5 === 0) svg.append("text").attr("x", M.l - 5).attr("y", y(t)).attr("dy", "0.32em").attr("text-anchor", "end").attr("font-size", 10).attr("fill", "var(--ink-3)").text(pct(t));
      });
      const d = areas.map(a => ({ a, r: m(c, a) })).filter(z => z.r.idk != null);
      const g = svg.append("g").selectAll("g").data(d).join("g");
      g.append("rect").attr("x", z => x(z.a)).attr("width", x.bandwidth()).attr("y", z => y(z.r.idk)).attr("height", z => Math.max(0, y(0) - y(z.r.idk)))
        .attr("fill", z => ramp(z.r.idk));
      // labels: the points above the bar, the share inside it; each is made smaller until it fits its bar, and left
      // out when it still doesn't (the tooltip and the table keep every figure)
      const bw = x.bandwidth(), step = x.step();
      g.append("text").attr("class", "lab-n").attr("x", z => x(z.a) + bw / 2).attr("y", z => y(z.r.idk) - 4).attr("text-anchor", "middle").attr("font-size", 9.5).attr("fill", "var(--ink-3)")
        .text(z => `${n(z.r)}/${z.r.possible}`);
      g.filter(z => y(0) - y(z.r.idk) > 15).append("text").attr("class", "lab-p").attr("x", z => x(z.a) + bw / 2).attr("y", z => y(z.r.idk) + 12).attr("text-anchor", "middle")
        .attr("font-size", 10).attr("font-weight", 600).attr("fill", z => (z.r.idk > 0.55 ? "#fff" : "var(--ink)")).text(z => pct(z.r.idk));
      const fit = (sel, maxW, minFs) => sel.each(function () {
        let fs = +this.getAttribute("font-size");
        while (this.getComputedTextLength() > maxW && fs > minFs) { fs -= 0.5; this.setAttribute("font-size", fs); }
        if (this.getComputedTextLength() > maxW) this.remove();
      });
      fit(g.selectAll("text.lab-n"), step - 2, 7.5);
      fit(g.selectAll("text.lab-p"), bw - 3, 7.5);
      g.selectAll("text.lab-p").filter(function (z) { return y(0) - y(z.r.idk) < +this.getAttribute("font-size") + 5; }).remove();
      svg.append("g").selectAll("text").data(areas).join("text")
        .attr("transform", a => `translate(${x(a) + x.bandwidth() / 2},${y(0) + 8}) rotate(-40)`).attr("text-anchor", "end").attr("dy", "0.6em")
        .attr("font-size", 10).attr("fill", "var(--ink-2)").text(a => t(SHORT[a] || a));
      withTip(g, z => `<div class="tt-head">${flagImg(c)}${esc(c.name)}</div><div class="tt-muted">${esc(t(z.a))}</div><div>${tx("<b>{v}</b> \"I don't know\" ({a} of {b} points)", "<b>{v}</b> « Je ne sais pas » ({a} sur {b} points)", { v: pct(z.r.idk), a: num(n(z.r)), b: num(z.r.possible) })}</div>`);
    });
    $("miss-sub").textContent = tx(`Share of the points in each area on questions answered "I don't know", one chart per country.`, `Part des points de chaque domaine sur des questions avec « Je ne sais pas », un graphique par pays.`);
    $("miss-note").textContent = t("Questions an earlier answer closes count as answered (zero points).");
  }

  const gridLegend = () => dotLegend({ compact: true }) + `<span class="key"><svg width="16" height="16"><circle cx="8" cy="8" r="7" fill="${scoreColor(0.6)}" stroke="${darker(scoreColor(0.6))}"/></svg>${t("section or subsection average")}</span>`;
  $("grid-legend").innerHTML = gridLegend();
  onColours(() => { $("grid-legend").innerHTML = gridLegend(); draw(); });
  responsive($("dist"), () => { if (view === "dist") drawDist(); });
  responsive($("missing"), () => { if (view === "missing" && missView === "bars") drawMissing(); });
  showView();
  await load();
} catch (err) { showError(document.querySelector(".pic-page"), err); }
