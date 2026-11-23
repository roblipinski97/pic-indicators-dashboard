// Country profile: the run, the scores by area (radar and table), and every question section by section.
import { d3, loadMeta, loadAnswers, params, setParams, pageUrl, countryMenu, segmented, fillSelect, responsive,
  onColours, esc, pct, num, plural, flagImg, flagUrl, dotSvg, dotLegend, dotKind, gradeChip, quoteMark, GRADES,
  answerParts, domainOf, scoreColor, scoreColorSoft, darker, htmlTips, svgButton, showError, SECTORS, lpSeries, allSeries, cssVar, sectorLabel,
  t, tx, isFr, isEs } from "../core.js";
import { drawRadar } from "../charts/radar.js";
import { drawAreaBars, drawAreaPies, shadeOpacity } from "../charts/minis.js";

const $ = id => document.getElementById(id);
// how the web chatbot's answer compares with the pipeline's (codes written by the pipeline), in words
const WC_FR = { same_answer: "même réponse", unsupported: "non étayée", conflict_unverified: "désaccord non vérifié", chatbot_idk: "l'assistant ne sait pas",
  not_current: "pas à jour", unreachable: "page inaccessible", supports_other: "étaye une autre réponse", out_of_scope: "hors champ",
  quote_failed: "citation non retrouvée", not_authoritative: "source non officielle", planned_not_current: "prévu, pas en vigueur", published: "publiée",
  adjudicated_web: "tranchée par la recherche web", confirmed: "confirmée", conflict_recorded: "désaccord consigné",
  multiple_choice_not_adjudicated: "choix multiple non tranché", stale: "ancienne", adjudicated_pipeline: "tranchée par le pipeline",
  closed_by_routing: "fermée par le filtrage", contradicted: "contredite", not_in_force: "pas en vigueur" };
const WC_ES = { same_answer: "misma respuesta", unsupported: "sin respaldo", conflict_unverified: "desacuerdo no verificado", chatbot_idk: "el asistente no sabe",
  not_current: "no vigente", unreachable: "página inaccesible", supports_other: "respalda otra respuesta", out_of_scope: "fuera del alcance",
  quote_failed: "cita no encontrada", not_authoritative: "fuente no oficial", planned_not_current: "prevista, no vigente", published: "publicada",
  adjudicated_web: "resuelta por la búsqueda web", confirmed: "confirmada", conflict_recorded: "desacuerdo registrado",
  multiple_choice_not_adjudicated: "opción múltiple no resuelta", stale: "antigua", adjudicated_pipeline: "resuelta por el pipeline",
  closed_by_routing: "cerrada por el filtro", contradicted: "contradicha", not_in_force: "no vigente" };
const wcText = w => (isFr() || isEs() ? w.replace(/[a-z_]+/g, k => (isFr() ? WC_FR : WC_ES)[k] || k.replace(/_/g, " ")) : w.replace(/_/g, " "));
const CHEV = `<svg class="chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

try {
  const meta = await loadMeta();
  const P = params();
  const countries = meta.withData;
  let iso = meta.byIso.has(P.get("c")) && countries.some(c => c.iso3 === P.get("c")) ? P.get("c") : (countries.find(c => c.iso3 === "COL") || countries[0]).iso3;
  let sector = ["HRM", "PFM"].includes(P.get("s")) ? P.get("s") : "HRM";
  let year = meta.years.includes(+P.get("y")) ? +P.get("y") : meta.years[0];
  const radarMode = { HRM: "all", PFM: "all" };   // all questions, or de jure and de facto
  const chartType = { HRM: "radar", PFM: "radar" };   // radar, bars or pies
  let term = "";
  const openState = new Map();     // which sections and subsections the reader opened
  let data = null;

  // World Bank region first, then the country (the menu shows the countries of that region)
  const regions = [...new Set(countries.map(c => c.region).filter(Boolean))].sort();
  let region = "";
  fillSelect($("region"), [{ value: "", label: t("All regions") }, ...regions.map(r => ({ value: r, label: t(r) }))], region);
  const picker = countryMenu($("country"), countries, iso, v => { iso = v; load(); });
  $("country").querySelector("button").setAttribute("aria-labelledby", "country-label");
  $("region").addEventListener("change", e => {
    region = e.target.value;
    const list = region ? countries.filter(c => c.region === region) : countries;
    picker.setItems(list);
    if (!list.some(c => c.iso3 === iso)) { iso = list[0].iso3; picker.value = iso; load(); }
  });
  fillSelect($("year"), meta.years.map(y => ({ value: y, label: String(y) })), year);
  $("year").addEventListener("change", e => { year = +e.target.value; load(); });
  const sectorSeg = segmented($("sector"), [
    { value: "HRM", html: sectorLabel("HRM") }, { value: "PFM", html: sectorLabel("PFM") }
  ], sector, v => { sector = v; openState.clear(); load(); });
  let searchT;
  $("search").addEventListener("input", e => { clearTimeout(searchT); searchT = setTimeout(() => { term = e.target.value.trim().toLowerCase(); drawTable(); }, 150); });
  // the legend of the table: the answer scale from worst to best, then "I don't know", "answered, not scored" and
  // "not asked" one under the other, each with a tick box that leaves those questions out of the table, and next to
  // them the same for de jure and de facto questions
  const hide = { idk: false, unscored: false, closed: false, dj: false, df: false };
  function drawLegend() {
    const ramp = [0, 0.25, 0.5, 0.75, 1].map(v => `<i style="background:${scoreColor(v)};border-color:${darker(scoreColor(v))}"></i>`).join("");
    $("qscale").innerHTML = `<span class="lg-lo">${t("Worst answer")}</span><span class="dot-ramp">${ramp}</span><span class="lg-hi">${t("Best answer")}</span>`;
    const row = (k, dot, label, aria) => `<label class="omit-row">${dot}<span>${label}</span><input type="checkbox" data-k="${k}"${hide[k] ? " checked" : ""} aria-label="${esc(aria)}"></label>`;
    $("qomit").innerHTML = `<span></span><span></span><span class="omit-h">${t("Omit")}</span>` +
      row("idk", dotSvg({ st: "idk" }, null, 14), t("I don't know"), t("Omit the questions answered \"I don't know\"")) +
      row("unscored", dotSvg({ st: "answered" }, { points: 0 }, 14), t("Answered, not scored"), t("Omit the questions that are not scored")) +
      row("closed", dotSvg({ st: "closed" }, null, 14), t("Not asked"), t("Omit the questions not asked"));
    const lpRow = (k, label, aria) => `<label class="omit-row"><span>${label}</span><input type="checkbox" data-k="${k}"${hide[k] ? " checked" : ""} aria-label="${esc(aria)}"></label>`;
    $("qomitlp").innerHTML = `<span></span><span class="omit-h">${t("Omit")}</span>` +
      lpRow("dj", t("De jure"), t("Omit the de jure questions")) +
      lpRow("df", t("De facto"), t("Omit the de facto questions"));
  }
  for (const id of ["qomit", "qomitlp"]) {
    $(id).addEventListener("change", e => { const k = e.target.dataset.k; if (!k) return; hide[k] = e.target.checked; if (data) drawTable(); });
  }
  // open or close every section and subsection
  const setAll = on => {
    const st = meta.structure[sector];
    st.sections.forEach(sec => { openState.set("s:" + sec.id, on); sec.subsections.forEach(sub => openState.set("u:" + sub.id, on)); });
    if (data) drawTable();
  };
  $("q-open").addEventListener("click", () => setAll(true));
  $("q-close").addEventListener("click", () => setAll(false));

  async function load() {
    const c = meta.byIso.get(iso);
    if (!c.runs[sector]) { sector = sector === "HRM" ? "PFM" : "HRM"; sectorSeg.set(sector); }
    setParams({ c: iso, s: sector, y: year === meta.years[0] ? null : year });
    $("sector").querySelectorAll("button").forEach(b => { b.disabled = !c.runs[b.dataset.v]; b.title = c.runs[b.dataset.v] ? "" : t("Not run yet for this country"); });
    try { data = await loadAnswers(iso, year, sector); }
    catch (e) { $("qtable").innerHTML = `<div class="empty">${tx("No {s} answers for {c} in {y}.", "Pas de réponses {s} pour {c} en {y}.", { s: esc(SECTORS[sector].short), c: esc(c.name), y: year })}</div>`; return; }
    drawHead(); drawRadarPanel(); drawTable();
  }

  /* ------------------------------------------------------------ head and the counts */
  function drawHead() {
    const c = meta.byIso.get(iso), cnt = meta.countOf(iso, sector, year) || {};
    $("head").innerHTML = `<img class="big-flag" src="${flagUrl(c)}" alt="">
      <div><h2>${esc(c.name)}</h2><p class="run">${sectorLabel(sector, { h: 20 })}</p></div>`;
    $("tools").innerHTML = `<a class="btn-quiet" href="${pageUrl("compare.html", { s: sector, hl: iso })}">${t("Compare with other countries")}</a>`;
    svgButton($("tools"), () => $("radar").querySelector("svg"), () => `pic-${iso}-${sector}-${year}-${chartType[sector]}`);
    const asked = (cnt.answered || 0) + (cnt.idk || 0);
    $("facts").innerHTML =
      `<div><dt>${t("Answered")}</dt><dd>${num(cnt.answered || 0)} <small>${t("of {n} asked", { n: num(asked) })}</small></dd></div>` +
      `<div><dt>${t("I don't know")}</dt><dd>${num(cnt.idk || 0)}</dd></div>` +
      // not asked: apart from the two above, which add up to the questions asked
      `<div class="not-asked"><dt>${t("Not asked")}</dt><dd>${num(cnt.closed || 0)}</dd></div>`;
  }

  /* ------------------------------------------------------------ radar and area table */
  function drawRadarPanel() {
    const areas = meta.structure[sector].areas;
    const sc = (a, lp) => (meta.scoreOf(iso, sector, a, lp, year) || {});
    const mode = radarMode[sector];
    const series = mode === "lp"
      ? lpSeries().map(s => ({ ...s, values: new Map(areas.map(a => [a, sc(a, s.key).score ?? null])) }))
      : [{ ...allSeries(), values: new Map(areas.map(a => [a, sc(a, "all").score ?? null])) }];
    const type = chartType[sector];
    // the de jure / de facto key, shaded as the shapes are (dashed de jure on the radar only; bars and pies have solid
    // outlines); all questions need no key
    const key = s => `<span class="key"><svg width="24" height="12" aria-hidden="true"><rect x="1" y="1" width="22" height="10" fill="${s.fill}" fill-opacity="${shadeOpacity(series.length)}" stroke="${s.color}" stroke-width="2" ${s.dash && type === "radar" ? `stroke-dasharray="${s.dash}"` : ""}/></svg>${esc(s.label)}</span>`;
    const keys = mode === "lp" ? series.map(key).join("") : "";
    // one line: the questions, then the chart type; the key at the top left of the chart
    $("radar-legend").innerHTML = `<span id="rmode"></span><span id="ctype"></span>`;
    if (!$("radar-keys")) $("radar").insertAdjacentHTML("beforebegin", `<div class="legend chart-keys" id="radar-keys"></div>`);
    $("radar-keys").innerHTML = keys;
    $("radar-keys").className = `legend chart-keys${type === "radar" ? " over" : ""}${keys ? "" : " empty"}`;
    segmented($("rmode"), [{ value: "all", label: t("All questions") }, { value: "lp", label: t("De jure and de facto") }], mode, v => { radarMode[sector] = v; drawRadarPanel(); });
    segmented($("ctype"), [{ value: "radar", label: t("Radar") }, { value: "bars", label: t("Bars") }, { value: "pies", label: t("Pies") }], type,
      v => { chartType[sector] = v; drawRadarPanel(); });
    const draw = type === "bars" ? drawAreaBars : type === "pies" ? drawAreaPies : drawRadar;
    draw($("radar"), { areas, series, labels: new Map(areas.map(a => [a, t(a)])), width: $("radar").clientWidth });

    // the exact figures
    const rows = areas.map(a => ({ a, all: sc(a, "all"), dj: sc(a, "de jure"), df: sc(a, "de facto") }));
    const tot = sc("Total", "all");
    // bars in the palette's softer middle colours (20% to 80% of the way along it)
    const bar = r => r.score == null ? `<span class="muted">${t("no answer")}</span>` :
      `<div class="bar"><span style="width:${100 * r.score}%;background:${scoreColorSoft(r.score)}"></span></div>`;
    $("areas").innerHTML = `<thead><tr><th>${t("Area")}</th><th style="width:30%">${tx("Score (0→100%)", "Score (0→100 %)")}</th><th class="num"><span class="narrow-only">${tx("Score (0→100%)", "Score (0→100 %)")}</span></th><th class="num">${t("De jure")}</th><th class="num">${t("De facto")}</th><th class="num idk-col" title="${tx("Share of the area's points on questions answered I don't know", "Part des points du domaine sur des questions avec « Je ne sais pas »")}">${tx("Share of<br>I don't know", "Part de<br>« Je ne sais pas »")}</th></tr></thead>
      <tbody><tr class="tot"><td><b>${t("All areas")}</b></td><td>${bar(tot)}</td><td class="num"><b>${pct(tot.score)}</b></td>
        <td class="num">${pct(sc("Total", "de jure").score)}</td><td class="num">${pct(sc("Total", "de facto").score)}</td><td class="num idk-col">${pct(tot.idk)}</td></tr>
        ${rows.map(r => `<tr><td>${esc(t(r.a))}</td><td>${bar(r.all)}</td><td class="num"><b>${pct(r.all.score)}</b></td>
        <td class="num">${pct(r.dj.score)}</td><td class="num">${pct(r.df.score)}</td><td class="num idk-col">${pct(r.all.idk)}</td></tr>`).join("")}</tbody>`;
    $("area-note").textContent = tx(`Score: points earned as a share of the points possible, leaving out the questions answered "I don't know". De jure and de facto: the same score on the questions about the law and about practice. I don't know: share of the area's points on questions answered "I don't know".`,
      `Score : points obtenus en part des points possibles, sans les questions répondues « Je ne sais pas ». De jure et de facto : le même score sur les questions portant sur le droit et sur la pratique. Je ne sais pas : part des points du domaine sur des questions avec « Je ne sais pas ».`) +
      (isFr() || isEs() ? " " + t("Answers, quotes and rationales are shown in the language of the source and of the pipeline (mostly English).") : "");
  }

  /* ------------------------------------------------------------ the questions */
  const codesOf = a => [...String(a || "").matchAll(/(?:^|\n)\s*(\d{1,3})\s*:/g)].map(m => +m[1]);
  function passes(q, a) {
    if (hide.idk && a && a.st === "idk") return false;
    if (hide.unscored && !(q.points > 0)) return false;
    if (hide.closed && a && a.st === "closed") return false;
    if (hide.dj && q.lp === "de jure") return false;
    if (hide.df && q.lp === "de facto") return false;
    if (term) {
      const hay = `${q.n} ${q.text} ${q.item || ""} ${a ? a.a || "" : ""} ${a ? a.r || "" : ""}`.toLowerCase();
      if (!hay.includes(term)) return false;
    }
    return true;
  }
  function answerCell(q, a) {
    if (!a) return `<span class="muted">${t("No row in the file")}</span>`;
    if (a.st === "closed") return `<span class="muted">${t("Not asked")}</span>`;
    if (a.st === "upload") return `<span class="muted">${t("Not answerable from documents")}</span>`;
    if (a.st === "idk") return `<span class="muted">${t("I don't know")}</span>${a.sug ? `<div class="muted" style="font-size:var(--fs-xs);margin-top:2px">${t("Models' suggestion: {s}", { s: esc(answerParts(a.sug, q).join("; ")) })}</div>` : ""}`;
    const parts = answerParts(a.a, q);
    if (q.type === "text") return `<span style="font-weight:400">${esc(a.a.length > 220 ? a.a.slice(0, 219) + "…" : a.a)}</span>`;
    if (parts.length > 1) return `<ul>${parts.map(p => `<li>${esc(p)}</li>`).join("")}</ul>`;
    return esc(parts[0] || "");
  }
  function sourceCell(a) {
    if (!a || !a.src || !a.src.length) return `<span class="muted">–</span>`;
    const first = a.src[0];
    return `<a href="${esc(first)}" target="_blank" rel="noopener" title="${esc(first)}">${esc(domainOf(first))}</a>${a.src.length > 1 ? ` <span class="more">+${a.src.length - 1}</span>` : ""}`;
  }
  function rowHtml(q, a) {
    const qcell = q.item ? `<div class="c-q item">${esc(q.item)}</div>` : `<div class="c-q"><span class="qn">${esc(q.n)}</span>${esc(q.text)}</div>`;
    return `<div class="qrow" data-id="${esc(q.id)}" tabindex="0" role="button" aria-expanded="false">
      <div class="c-dot" data-tip="1">${dotSvg(a, q, 14)}</div>${qcell}
      <div class="c-a">${answerCell(q, a)}</div>
      <div class="c-g">${a && a.st !== "closed" && a.st !== "upload" ? gradeChip(a.g) : ""}</div>
      <div class="c-v">${a && (a.st === "answered" || a.q) ? quoteMark(a.qf) : `<span class="qcheck qcheck-none">–</span>`}</div>
      <div class="c-s">${sourceCell(a)}</div>
      <div class="c-r">${a && a.r ? esc(a.r) : `<span class="muted">–</span>`}</div>
      <div class="c-more"><button type="button" class="see-more" tabindex="-1">${t("See more")}</button></div></div>`;
  }
  const tally = qs => {
    const as = qs.map(q => data._byId.get(q.id)).filter(Boolean);
    const ans = as.filter(a => a.st === "answered").length, asked = as.filter(a => a.st === "answered" || a.st === "idk").length;
    return t("{a} of {b} answered", { a: ans, b: asked });
  };

  function drawTable() {
    const st = meta.structure[sector], A = data._byId;
    const filtering = !!term;
    let html = `<div class="qhead"><span></span><span>${t("Question")}</span><span>${t("Answer")}</span><span title="${t("Evidence grade: A strongest, D no answer")}">${t("Grade")}</span><span title="${t("Whether the code found the quote word for word in its source")}">${t("Quote found")}</span><span>${t("Source")}</span><span>${t("Rationale")}</span></div>`;
    let any = false;
    st.sections.forEach((sec, si) => {
      const qs = st.questions.filter(q => q.sec === sec.id);
      const vis = qs.filter(q => passes(q, A.get(q.id)));
      if (!vis.length) return;
      any = true;
      const sOpen = filtering ? true : (openState.has("s:" + sec.id) ? openState.get("s:" + sec.id) : true);
      const num = sector === "HRM" ? sec.id : String(+sec.id);
      html += `<details class="sec" data-k="s:${esc(sec.id)}"${sOpen ? " open" : ""}><summary>${CHEV}<span class="sec-title"><small>${esc(num)}</small>${esc(sec.label)}</span><span class="sec-meta"><span>${tally(qs)}</span></span></summary>`;
      sec.subsections.forEach(sub => {
        const sq = vis.filter(q => q.sub === sub.id);
        if (!sq.length) return;
        const all = qs.filter(q => q.sub === sub.id);
        const uOpen = filtering ? true : (openState.has("u:" + sub.id) ? openState.get("u:" + sub.id) : false);
        html += `<details class="sub" data-k="u:${esc(sub.id)}"${uOpen ? " open" : ""}><summary>${CHEV}<span class="sub-title">${esc(sub.label)}</span><span class="sec-meta"><span>${tally(all)}</span></span></summary>`;
        let stem = null;
        sq.forEach(q => {
          if (q.item && q.text !== stem) { html += `<div class="stem"><span class="qn">${esc(q.n)}</span>${esc(q.text)}</div>`; }
          stem = q.item ? q.text : null;
          html += rowHtml(q, A.get(q.id));
        });
        html += `</details>`;
      });
      html += `</details>`;
    });
    if (!any) html += `<div class="no-match">${t("No question matches. Clear the search and the boxes to see them all.")}</div>`;
    $("qtable").innerHTML = html;
    $("qtable").querySelectorAll("details").forEach(d => d.addEventListener("toggle", () => { if (!filtering) openState.set(d.dataset.k, d.open); }));
  }

  // a click on a question opens the details under it
  // the details of one answer: the options and their scores and the question's type (de jure or de facto) across the
  // top, then two columns (the main text on the
  // left, what it rests on on the right): quote and source, rationale and grade, and at the bottom the web chatbot's
  // and the reviewer's answers
  function detailHtml(q, a) {
    const chosen = new Set(codesOf(a && a.a));
    const opts = (q.options || []).filter(o => !/^\s*99\s*:/.test(o) && !/text-based open/i.test(o));
    const scores = q.scores || {};
    const optRow = opts.length ? `<div class="d-opts"><h4>${q.points ? t("Options and their scores ({n} in total)", { n: plural(q.points, "point") }) : t("Options")}</h4><ul>${opts.map(o => {
      const code = +(o.match(/^\s*(\d+)\s*:/) || [])[1];
      const sc = scores[code] ?? scores[String(code)];
      return `<li class="${chosen.has(code) ? "on" : ""}">${esc(o.replace(/^\s*\d+\s*:\s*/, ""))}${q.points && sc != null ? ` <span class="pts">(${sc})</span>` : ""}</li>`;
    }).join("")}</ul></div>` : "";
    const gov = ["LAO", "KHM"].includes(iso);
    const block = (title, body) => (body ? `<div><h4>${title}</h4>${body}</div>` : "<div></div>");
    // the pipeline appends "SOURCE: <url>" lines to its quotes; the sources are listed once, on the right
    const qText = a && a.q ? a.q.replace(/^\s*(?:CITED:\s*)?SOURCE:\s*\S+\s*$/gim, "").trim() : "";
    const srcs = a ? [...new Set([a.qu, ...(a.src || [])].filter(Boolean))] : [];
    const rows = [
      [block(t("Quoted passage"), qText ? `<blockquote>${esc(qText)}</blockquote>` : ""),
       block(srcs.length > 1 ? t("Sources") : t("Source"), srcs.length ? `<p>${srcs.map(u => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(domainOf(u))}</a>`).join("<br>")}${a.sc ? `<br><span class="muted">${esc(a.sc)}</span>` : ""}</p>` : "")],
      [a && a.r ? block(t("Rationale"), `<p>${esc(a.r)}</p>`) : block(t("Why the answer is \"I don't know\""), a && a.iw ? `<p>${esc(a.iw)}</p>` : ""),
       block(a && a.g ? t("Grade {g}", { g: esc(a.g) }) : "", a && a.g ? `<p>${esc(GRADES[a.g] || "")}${a.why ? `<br><span class="muted">${esc(a.why)}</span>` : ""}</p>` : "")],
      [block(t("Models' own suggestion (no document)"), a && a.sug ? `<p>${esc(answerParts(a.sug, q).join("; "))}</p>` : ""),
       block(t("Routing"), a && a.rel ? `<p>${esc(a.rel)}${a.nc ? `<br><span class="muted">${t("Not counted in the score: the form would skip this question, so the score counts it as unanswered (0 points).")}</span>` : ""}</p>` : "")],
      [block(t("Web chatbot's answer"), a && a.web ? `<p>${esc(answerParts(a.web, q).join("; "))}${a.wc ? ` <span class="muted">(${esc(wcText(a.wc))})</span>` : ""}</p>` : ""),
       block(gov ? t("The government's own answer") : t("Human reviewer's answer"), a && a.rev ? `<p>${esc(answerParts(a.rev, q).join("; "))}${a.ag ? ` <span class="muted">(${a.ag === "Yes" ? t("agrees with the AI") : t("differs from the AI")})</span>` : ""}${a.revn ? `<br><span class="muted">${esc(a.revn)}</span>` : ""}</p>` : "")]
    ].filter(r => r.some(c => c !== "<div></div>"));
    // across the top: the options (wrapping onto more lines when they are many), and on the right the question's type
    const lp = q.lp === "de jure" ? t("De jure") : q.lp === "de facto" ? t("De facto") : "";
    const typeBlock = `<div class="d-type"><h4>${t("Question type")}</h4><p>${lp || `<span class="muted">${t("Not classified")}</span>`}</p></div>`;
    return `<div class="qdetail"><div class="d-top">${optRow || "<div></div>"}${typeBlock}</div><div class="d-grid">${rows.flat().join("")}</div></div>`;
  }
  $("qtable").addEventListener("click", ev => {
    if (ev.target.closest("a, .qdetail")) return;
    const r = ev.target.closest(".qrow"); if (!r) return;
    toggleRow(r);
  });
  $("qtable").addEventListener("keydown", ev => {
    if ((ev.key === "Enter" || ev.key === " ") && ev.target.classList.contains("qrow")) { ev.preventDefault(); toggleRow(ev.target); }
  });
  function toggleRow(r) {
    const open = r.classList.toggle("is-open");
    r.setAttribute("aria-expanded", String(open));
    r.querySelector(".see-more").textContent = open ? t("See less") : t("See more");
    const ex = r.querySelector(".qdetail");
    if (!open) { if (ex) ex.remove(); return; }
    const q = meta.structure[sector].byId.get(r.dataset.id);
    r.insertAdjacentHTML("beforeend", detailHtml(q, data._byId.get(q.id)));
  }
  htmlTips($("qtable"), el => {
    const r = el.closest(".qrow"); if (!r) return "";
    const q = meta.structure[sector].byId.get(r.dataset.id), a = data._byId.get(q.id);
    const k = dotKind(a, q);
    const what = k === "scored" ? t("Score of this answer: <b>{v}</b>", { v: pct(a.s) }) : k === "idk" ? t("I don't know") : k === "closed" ? t("Not asked: an earlier answer closes this question") : k === "answered" ? t("Answered; this question is not scored") : "";
    return `<div>${what}</div>`;
  });
  drawLegend();
  onColours(() => { drawLegend(); if (data) drawTable(); });
  responsive($("radar"), () => { if (data) drawRadarPanel(); });
  await load();
} catch (err) { showError(document.querySelector(".pic-page"), err); }
