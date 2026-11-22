// Home page: the pilot countries on a dotted map, why PIC is built this way, the pipeline stage by stage (scroll or
// click the figure), how to read the results, what the pipeline could not answer and de jure against de facto
// (a second scrolling story), the two questionnaires and the comparison with other datasets.
import { d3, loadMeta, getJSON, pal, onColours, svgFlag, withTip, pct, num, esc, flagImg, pageUrl, countryMenu,
  plural, showError, cssVar, SECTORS, sectorIcon, sectorLabel, lineIcon, segmented, t, tx, isFr } from "../core.js";
import { hexMap } from "../charts/hexmap.js";

const $ = id => document.getElementById(id);
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const DUR = reduce ? 0 : 900;

// one scrolling story: cards next to a sticky graphic, one step per card. The active step is the one under the middle
// of the window, worked out on scroll (an IntersectionObserver margin is ignored inside a cross-origin frame such
// as the claude.ai artifact viewer, which switched steps too early). Returns a function that scrolls to a step.
function scrolly(stepSel, cardSel, navId, onStep) {
  const steps = [...document.querySelectorAll(stepSel)];
  let active = -1, lock = null, lockT;
  const activate = k => {
    document.querySelectorAll(cardSel).forEach(el => el.classList.toggle("is-active", +el.dataset.i === k));
    document.querySelectorAll(`#${navId} button`).forEach(el => (+el.dataset.i === k ? el.setAttribute("aria-current", "step") : el.removeAttribute("aria-current")));
    if (k !== active) { active = k; onStep(k); }
  };
  const check = () => {
    if (lock != null) return;
    const mid = innerHeight / 2;
    const k = steps.findIndex(el => { const r = el.getBoundingClientRect(); return r.top <= mid && r.bottom > mid; });
    if (k >= 0) activate(k);
  };
  let ticking = false;
  addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(() => { ticking = false; check(); }); } }, { passive: true });
  addEventListener("resize", check);
  activate(0);
  check();
  // a click shows the chosen step at once and keeps it while the page scrolls there
  const goTo = k => {
    activate(k);
    lock = k; clearTimeout(lockT);
    const r = steps[k].getBoundingClientRect();
    window.scrollTo({ top: scrollY + r.top + r.height / 2 - innerHeight / 2, behavior: reduce ? "auto" : "smooth" });
    const release = () => { lock = null; clearTimeout(lockT); check(); };
    lockT = setTimeout(release, reduce ? 50 : 1200);
  };
  $(navId).addEventListener("click", e => { const b = e.target.closest("button"); if (b) goTo(+b.dataset.i); });
  return goTo;
}
// cards and the small step numbers under them
function cardsFor(steps, cardsId, stepsId, navId, marks) {
  $(cardsId).innerHTML = steps.map((s, i) => `<div class="step-card" data-i="${i}"><h3>${esc(s.h)}</h3>${s.body || `<p>${s.p}</p>`}</div>`).join("");
  $(stepsId).innerHTML = steps.map((s, i) => `<div class="step" data-i="${i}"></div>`).join("");
  $(navId).innerHTML = steps.map((s, i) => `<button type="button" data-i="${i}" aria-label="${esc(s.h)}">${esc(marks[i])}</button>`).join("");
}
// flags pushed apart so that none hides another
function settle(ns, { x, y, r, strength = 0.4, iters = 280 }) {
  const rad = typeof r === "function" ? r : () => r;
  const sim = d3.forceSimulation(ns.map(n => ({ n, x: x(n), y: y(n) })))
    .force("x", d3.forceX(d => x(d.n)).strength(strength))
    .force("y", d3.forceY(d => y(d.n)).strength(strength))
    .force("c", d3.forceCollide(d => rad(d.n)).iterations(3)).stop();
  for (let i = 0; i < iters; i++) sim.tick();
  return new Map(sim.nodes().map(d => [d.n.key, [d.x, d.y]]));
}

try {
  const meta = await loadMeta();
  const year = meta.years[0];
  const C = meta.countries;
  const counts = meta.counts.filter(r => r.year === year);
  const countOf = (iso, s) => counts.find(r => r.iso3 === iso && r.sector === s);

  /* ------------------------------------------------------------ hero */
  const nQ = { HRM: meta.structure.HRM.questions.length, PFM: meta.structure.PFM.questions.length };
  $("hero-stats").innerHTML =
    `<div><dd>${C.length}</dd><dt class="with-icon">${lineIcon("map", 26)}<span>${tx("pilot countries", "pays pilotes")}</span></dt></div>` +
    `<div><dd>${pct(0.96)}</dd><dt class="with-icon">${lineIcon("trend", 26)}<span>${tx("less time and money to collect the data than by hand", "de temps et d'argent en moins pour collecter les données qu'à la main")}</span></dt></div>` +
    `<div><dd>${num(nQ.HRM)}</dd><dt class="with-icon">${sectorIcon("HRM", 26)}<span>${tx("questions on public employment (HRM)", "questions sur l'emploi public (GRH)")}</span></dt></div>` +
    `<div><dd>${num(nQ.PFM)}</dd><dt class="with-icon">${sectorIcon("PFM", 26)}<span>${tx("questions on public finances (PFM)", "questions sur les finances publiques (GFP)")}</span></dt></div>` +
    `<p class="hero-note">${tx("96%: one country's two questionnaires cost about USD 38 with the AI pipeline, against about 30 hours of a coder's time (USD 900).",
      "96 % : les deux questionnaires d'un pays coûtent environ 38 USD avec le pipeline d'IA, contre environ 30 heures de travail d'un codeur (900 USD).")}</p>`;
  countryMenu($("jump"), meta.withData, null, v => { location.href = pageUrl("country.html", { c: v }); }, { placeholder: t("Choose…") });
  $("jump").querySelector("button").setAttribute("aria-labelledby", "jump-label");

  /* ------------------------------------------------------------ the map: the pilot countries, nothing else */
  const regions = d3.groups(C, c => c.region || "Other").sort((a, b) => t(a[0]).localeCompare(t(b[0])));
  $("map-text").innerHTML = `<div class="map-text"><h2>${tx("{n} pilot countries", "{n} pays pilotes", { n: C.length })}</h2>
    <p>${tx("PIC is being piloted in {n} countries across {r} World Bank regions. Click a flag to open a country's profile. Zoom in with the + button, Ctrl + scroll or two fingers.",
      "PIC est testé dans {n} pays répartis dans {r} régions de la Banque mondiale. Cliquez sur un drapeau pour ouvrir le profil d'un pays. Zoomez avec le bouton +, Ctrl + défilement ou deux doigts.", { n: C.length, r: regions.length })}</p></div>
    <dl class="regions">${regions.map(([r, cs]) => `<div><dt>${esc(t(r))}</dt><dd>${cs.map(c => c.name).sort((a, b) => a.localeCompare(b)).map(esc).join(", ")}</dd></div>`).join("")}</dl>`;
  document.querySelectorAll("[data-icon]").forEach(el => { el.innerHTML = lineIcon(el.dataset.icon, 34); });
  // ?map=caribbean adds the Caribbean countries, to test how the map handles many small islands
  const test = new URLSearchParams(location.search).get("map") === "caribbean" || window.PIC_MAP_TEST === "caribbean";
  const CARIB = [["ATG", "ag", "Antigua and Barbuda", "Antigua-et-Barbuda"], ["BHS", "bs", "The Bahamas", "Bahamas"],
    ["BRB", "bb", "Barbados", "Barbade"], ["BLZ", "bz", "Belize", "Belize"], ["DMA", "dm", "Dominica", "Dominique"],
    ["DOM", "do", "Dominican Republic", "République dominicaine"], ["GRD", "gd", "Grenada", "Grenade"], ["GUY", "gy", "Guyana", "Guyana"],
    ["HTI", "ht", "Haiti", "Haïti"], ["JAM", "jm", "Jamaica", "Jamaïque"], ["KNA", "kn", "St. Kitts and Nevis", "Saint-Kitts-et-Nevis"],
    ["LCA", "lc", "St. Lucia", "Sainte-Lucie"], ["SUR", "sr", "Suriname", "Suriname"], ["TTO", "tt", "Trinidad and Tobago", "Trinité-et-Tobago"],
    ["VCT", "vc", "St. Vincent and the Grenadines", "Saint-Vincent-et-les-Grenadines"]];
  const has = c => Object.keys(c.runs || {}).length > 0;
  const marks = C.map(c => ({
    iso3: c.iso3, c,
    tip: () => `<div class="tt-head">${flagImg(c)}${esc(c.name)}</div><div class="tt-muted">${esc(t(c.region || ""))}</div>` +
      (has(c) ? `<div class="tt-q">${t("Click to open the profile")}</div>` : ""),
    click: has(c) ? () => { location.href = pageUrl("country.html", { c: c.iso3 }); } : null
  }));
  if (test) {
    CARIB.forEach(([iso3, iso2, en, fr]) => {
      const c = { iso3, iso2, name: isFr() ? fr : en };
      marks.push({ iso3, c, click: null,
        tip: () => `<div class="tt-head">${flagImg(c)}${esc(c.name)}</div><div class="tt-muted">${tx("Test only: not a pilot country", "Test uniquement : pas un pays pilote")}</div>` });
    });
    $("map-text").querySelector(".map-text").insertAdjacentHTML("beforeend", `<p class="map-test">${tx("Test view: the {n} Caribbean countries are added to the map, to see how it shows small islands. They are not pilot countries.",
      "Vue de test : les {n} pays des Caraïbes sont ajoutés à la carte, pour voir comment elle montre les petites îles. Ce ne sont pas des pays pilotes.", { n: CARIB.length })}</p>`);
  }
  hexMap($("map"), { marks, label: tx("World map with the {n} PIC pilot countries", "Carte du monde des {n} pays pilotes de PIC", { n: C.length }) }).catch(e => { console.error(e); $("map").textContent = ""; });

  /* ------------------------------------------------------------ the pipeline, stage by stage */
  const STAGES = [
    { h: tx("Six stages, from documents to a pre-filled questionnaire", "Six étapes, des documents au questionnaire prérempli"),
      body: `<p>${tx("Each country goes through the same six stages:", "Chaque pays passe par les mêmes six étapes\u00A0:")}</p><ul class="stage-list">` +
        [[tx("Find, screen and index the documents", "Trouver, trier et indexer les documents"), tx("once per country", "une fois par pays")],
         [tx("Pick the best passages", "Choisir les meilleurs passages"), tx("for each question", "pour chaque question")],
         [tx("Two models read and answer", "Deux modèles lisent et répondent"), tx("for each question", "pour chaque question")],
         [tx("Check every answer", "Vérifier chaque réponse"), tx("for each answer", "pour chaque réponse")],
         [tx("Look again where evidence is missing", "Chercher à nouveau là où les preuves manquent"), tx("after all questions", "après toutes les questions")],
         [tx("A pre-filled questionnaire for review", "Un questionnaire prérempli, prêt à être revu"), tx("once per country", "une fois par pays")]]
          .map(([a, b], i) => `<li><b>${["I", "II", "III", "IV", "V", "VI"][i]}.</b><span>${a} <small>(${b})</small></span></li>`).join("") +
        `</ul><p class="step-hint">${tx("Click a stage in the figure, or scroll.", "Cliquez sur une étape de la figure ou faites défiler la page.")}</p>` },
    { h: tx("I. Find, screen and index the documents", "I. Trouver, trier et indexer les documents"),
      p: tx("Once per country. The pipeline looks for documents from government bodies and independent assessors, starting from a list of core documents every country should have, such as the civil service law, the public finance act or the audit office's annual report. Reviewers can add documents by hand. Each document is screened and cut into passages of about 800 characters. Before reading anything, one model also writes down its own answers from what it already knows; this <b>lead</b> answer is kept for comparison.",
        "Une fois par pays. Le pipeline recherche des documents d'organismes publics et d'évaluateurs indépendants, en partant d'une liste de documents essentiels que chaque pays devrait avoir, comme la loi sur la fonction publique, la loi sur les finances publiques ou le rapport annuel de l'institution supérieure de contrôle. Les examinateurs peuvent ajouter des documents à la main. Chaque document est trié et découpé en passages d'environ 800 caractères. Avant toute lecture, un modèle note aussi ses propres réponses à partir de ce qu'il sait déjà ; cette réponse <b>de départ</b> est conservée pour comparaison.") },
    { h: tx("II. Pick the best passages", "II. Choisir les meilleurs passages"),
      p: tx("For each question. The question is rewritten in the country's language. The library is searched twice, once by meaning and once by keywords, and every passage gets a score from 0 to 100. The best eight go to the readers, more for grids and open questions.",
        "Pour chaque question. La question est reformulée dans la langue du pays. La bibliothèque est interrogée deux fois, une fois par le sens et une fois par mots-clés, et chaque passage reçoit un score de 0 à 100. Les huit meilleurs vont aux lecteurs, davantage pour les grilles et les questions ouvertes.") },
    { h: tx("III. Two models read and answer", "III. Deux modèles lisent et répondent"),
      p: tx("For each question. Two models read the passages and answer the question. If they disagree or abstain, a third model reads them, and if still no two agree, a fourth decides. Tick-all questions and de facto questions follow their own steps. When the evidence is inconclusive, the pipeline searches again, and new documents go back through stage I.",
        "Pour chaque question. Deux modèles lisent les passages et répondent à la question. S'ils ne sont pas d'accord ou s'abstiennent, un troisième modèle les lit, et si deux d'entre eux ne s'accordent toujours pas, un quatrième tranche. Les questions à choix multiples et les questions de facto suivent leurs propres étapes. Lorsque les preuves ne sont pas concluantes, le pipeline cherche à nouveau, et les nouveaux documents repassent par l'étape I.") },
    { h: tx("IV. Check every answer", "IV. Vérifier chaque réponse"),
      p: tx("For each answer. Code checks that the quoted passage is in the document word for word. An independent checker reads the risky answers again, and a judge decides whether the quote supports the answer. Further checks look at scope (central government), at de jure against de facto, and at the type and age of the source. Answers that pass get grade <b>A</b> or <b>B</b>.",
        "Pour chaque réponse. Le code vérifie que le passage cité figure mot pour mot dans le document. Un vérificateur indépendant relit les réponses à risque, et un juge décide si la citation étaye la réponse. D'autres contrôles portent sur le champ (administration centrale), sur la distinction de jure et de facto, et sur le type et l'ancienneté de la source. Les réponses qui passent reçoivent la note <b>A</b> ou <b>B</b>.") },
    { h: tx("V. Look again where evidence is missing", "V. Chercher à nouveau là où les preuves manquent"),
      p: tx("After all questions. Questions still without evidence get a second hunt in the library, steered by the lead answer, then a web search, then a web chatbot whose cited pages are read. Where nothing holds, the models' own suggestion is kept in a separate column with grade <b>C</b>, never mixed with the evidence.",
        "Après toutes les questions. Les questions encore sans preuve font l'objet d'une seconde recherche dans la bibliothèque, guidée par la réponse de départ, puis d'une recherche sur le web, puis d'un assistant conversationnel en ligne dont les pages citées sont lues. Quand rien ne tient, la suggestion des modèles est conservée dans une colonne à part avec la note <b>C</b>, jamais mêlée aux preuves.") },
    { h: tx("VI. A pre-filled questionnaire for review", "VI. Un questionnaire prérempli, prêt à être revu"),
      p: tx("Once per country. The result is the questionnaire with an answer, a quote, a source and a grade for every question, ready for experts to check. Their corrections feed back into the instructions the models follow, and this dashboard shows the result.",
        "Une fois par pays. Le résultat est le questionnaire avec une réponse, une citation, une source et une note pour chaque question, prêt à être vérifié par des experts. Leurs corrections alimentent les instructions suivies par les modèles, et ce tableau de bord en présente le résultat.") }
  ];
  cardsFor(STAGES, "pcards", "psteps", "pdots", [t("Overview"), "I", "II", "III", "IV", "V", "VI"]);
  const X0 = [23, 218, 413, 608, 803, 998], BW = 174;
  const shade = d3.select($("pipe-shade"));
  // one veil over the whole figure with a hole for the stage being described (and for the loop back to stage I
  // under the figure at stages I and III), so arrows between stages are dimmed evenly, never cut in half
  const veil = shade.append("path").attr("class", "veil").attr("fill-rule", "evenodd");
  const hl = shade.append("rect").attr("class", "hl").attr("x", 0).attr("y", 4).attr("width", 1200).attr("height", 410).attr("opacity", 0);
  const box = (x, y, w, h) => `M${x},${y}h${w}v${h}h${-w}Z`;
  const goStage = scrolly("#psteps .step", "#pcards .step-card", "pdots", k => {
    if (k === 0) { veil.attr("d", null); hl.attr("opacity", 0); return; }
    const x = X0[k - 1] - 6;
    veil.attr("d", box(0, 0, 1200, 462) + box(x, 2, BW + 12, 414) + (k === 1 || k === 3 ? box(0, 418, 1200, 44) : ""));
    hl.attr("opacity", 1).attr("x", x).attr("y", 4).attr("width", BW + 12).attr("height", 410);
  });
  // a click on a stage of the figure moves the story to it
  shade.selectAll("rect.hit").data(X0).join("rect").attr("class", "hit")
    .attr("x", d => d - 8).attr("y", 0).attr("width", BW + 16).attr("height", 418)
    .attr("tabindex", 0).attr("role", "button").attr("aria-label", (d, i) => tx("Read about stage {k}", "Lire l'étape {k}", { k: ["I", "II", "III", "IV", "V", "VI"][i] }))
    .on("click", (ev, d) => goStage(X0.indexOf(d) + 1))
    .on("keydown", (ev, d) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); goStage(X0.indexOf(d) + 1); } });

  /* ------------------------------------------------------------ what the pipeline could not answer, de jure and de facto */
  const W = 960, H = 560;
  const nodes = [];
  for (const s of ["HRM", "PFM"]) {
    for (const c of meta.withData.filter(x => x.runs[s] && x.runs[s].year === year)) {
      const r = countOf(c.iso3, s);
      const sc = lp => (meta.scoreOf(c.iso3, s, "Total", lp, year) || {}).score ?? null;
      nodes.push({ key: `${c.iso3}-${s}`, c, s, idk: r && (r.answered + r.idk) ? r.idk / (r.answered + r.idk) : null,
        nIdk: r ? r.idk : 0, nAsked: r ? r.answered + r.idk : 0, dj: sc("de jure"), df: sc("de facto") });
    }
  }
  const BAND = { HRM: 200, PFM: 420 };
  const xI = d3.scaleLinear().domain([0, 1]).range([150, 900]);   // always the full 0-100%
  const PANEL = { HRM: [110, 410], PFM: [590, 890] }, SY = d3.scaleLinear().domain([0, 1]).range([450, 150]);
  const sxOf = s => d3.scaleLinear().domain([0, 1]).range(PANEL[s]);
  const R1 = 11;   // small flags, so each sits close to its value
  const idkN = nodes.filter(n => n.idk != null), lpN = nodes.filter(n => n.dj != null && n.df != null);
  // step 0: de jure against de facto (two scatters); step 1: how often the answer is "I don't know"
  const pos = [
    settle(lpN, { x: n => sxOf(n.s)(n.dj), y: n => SY(n.df), r: R1 - 0.5, strength: 0.9 }),
    settle(idkN, { x: n => xI(n.idk), y: n => BAND[n.s], r: R1 + 0.5, strength: 0.5 })
  ];
  const ext = (ns, k) => [d3.least(ns, n => n[k]), d3.greatest(ns, n => n[k])];
  const range = s => { const [lo, h] = ext(idkN.filter(n => n.s === s), "idk"); return tx("from <b>{a}</b> in {ca} to <b>{b}</b> in {cb}", "de <b>{a}</b> ({ca}) à <b>{b}</b> ({cb})", { a: pct(lo.idk), ca: esc(lo.c.name), b: pct(h.idk), cb: esc(h.c.name) }); };
  const med = lp => d3.median(meta.scores.filter(r => r.year === year && r.area === "Total" && r.lp === lp && r.idk != null), r => r.idk);
  const below = s => { const ns = lpN.filter(n => n.s === s); return tx("<b>{a} of {b}</b>", "<b>{a} sur {b}</b>", { a: ns.filter(n => n.df < n.dj).length, b: ns.length }); };
  const pfmDj = meta.structure.PFM.questions.filter(q => q.lp === "de jure" && q.points > 0).length;
  const pfmScored = meta.structure.PFM.questions.filter(q => q.points > 0).length;
  const steps = [
    { h: tx("De facto scores often fall below de jure scores", "Les scores de facto sont souvent inférieurs aux scores de jure"),
      p: tx(`Each flag is a country: its score on de jure items against its score on de facto items. Below the line, the de facto score is lower: in {hrm} countries for public employment (HRM) and {pfm} for public finances (PFM), where only {pdj} of the {ps} scored questions are de jure. <a href="country.html">Open a country's profile</a> to see the questions behind each score.`,
        `Chaque drapeau est un pays : son score sur les questions de jure face à son score sur les questions de facto. Sous la diagonale, le score de facto est plus faible : dans {hrm} pays pour l'emploi public (GRH) et {pfm} pour les finances publiques (GFP), où seules {pdj} des {ps} questions notées sont de jure. <a href="country.html">Ouvrez le profil d'un pays</a> pour voir les questions derrière chaque score.`,
        { hrm: below("HRM"), pfm: below("PFM"), pdj: pfmDj, ps: pfmScored }) },
    { h: tx("How often the answer is \"I don't know\"", "À quelle fréquence la réponse est « Je ne sais pas »"),
      p: tx(`Share of the questions asked that the pipeline answered "I don't know": {hrm} for public employment (HRM), and {pfm} for public finances (PFM). Most of them are de facto questions: in the middle country, {df} of the de facto points are "I don't know", against {dj} of the de jure points.`,
        `Part des questions posées auxquelles le pipeline a répondu « Je ne sais pas » : {hrm} pour l'emploi public (GRH), et {pfm} pour les finances publiques (GFP). La plupart sont des questions de facto : dans le pays médian, {df} des points de facto sont « Je ne sais pas », contre {dj} des points de jure.`,
        { hrm: range("HRM"), pfm: range("PFM"), df: pct(med("de facto")), dj: pct(med("de jure")) }) }
  ];
  cardsFor(steps, "cards", "steps", "dots", ["1", "2"]);

  let current = 0, svg, L = {};
  function build() {
    $("stage").innerHTML = "";
    svg = d3.select($("stage")).append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("role", "img")
      .attr("aria-label", tx("De jure against de facto scores, then how often each country's answer is I don't know", "Scores de jure face aux scores de facto, puis fréquence des réponses « Je ne sais pas » par pays"));
    const txt = (g, x, y, t, o = {}) => g.append("text").attr("x", x).attr("y", y).attr("font-size", o.size || 12).attr("fill", o.fill || "var(--ink-3)")
      .attr("text-anchor", o.anchor || "middle").attr("font-weight", o.weight || 400).text(t);
    // step 0: two bands, one axis
    const a0 = svg.append("g").attr("class", "ax0").attr("opacity", 0);
    [0, 0.2, 0.4, 0.6, 0.8, 1].forEach(t => {
      a0.append("line").attr("x1", xI(t)).attr("x2", xI(t)).attr("y1", 120).attr("y2", 455).attr("stroke", "var(--line-2)");
      txt(a0, xI(t), 476, pct(t));
    });
    ["HRM", "PFM"].forEach(s => {
      a0.append("line").attr("x1", xI.range()[0]).attr("x2", xI.range()[1]).attr("y1", BAND[s] + 34).attr("y2", BAND[s] + 34).attr("stroke", "var(--ink-4)");
      txt(a0, xI.range()[0], BAND[s] - 64, SECTORS[s].long, { anchor: "start", size: 14, weight: 600, fill: "var(--ink)" });
    });
    txt(a0, d3.mean(xI.range()), 504, t("Share of the questions asked answered \"I don't know\""), { size: 13, weight: 600, fill: "var(--ink)" });
    // step 1: two scatters side by side
    const a1 = svg.append("g").attr("class", "ax1").attr("opacity", 0);
    ["HRM", "PFM"].forEach(s => {
      const sx = sxOf(s);
      [0, 0.5, 1].forEach(t => {
        a1.append("line").attr("x1", sx(t)).attr("x2", sx(t)).attr("y1", SY(0)).attr("y2", SY(1)).attr("stroke", "var(--line-2)");
        a1.append("line").attr("y1", SY(t)).attr("y2", SY(t)).attr("x1", sx(0)).attr("x2", sx(1)).attr("stroke", "var(--line-2)");
        txt(a1, sx(t), SY(0) + 18, pct(t));
        txt(a1, sx(0) - 8, SY(t) + 4, pct(t), { anchor: "end" });
      });
      a1.append("path").attr("d", `M${sx(0)},${SY(0)}L${sx(1)},${SY(1)}V${SY(0)}Z`).attr("fill", "var(--neg-tint)").attr("opacity", 0.55);
      a1.append("line").attr("x1", sx(0)).attr("y1", SY(0)).attr("x2", sx(1)).attr("y2", SY(1)).attr("stroke", "var(--ink-2)").attr("stroke-width", 1.2);
      txt(a1, sx(0.97), SY(0.06), t("De facto below de jure"), { anchor: "end", fill: "var(--neg-ink)", weight: 600 });
      txt(a1, d3.mean(PANEL[s]), SY(1) - 22, SECTORS[s].long, { size: 14, weight: 600, fill: "var(--ink)" });
      txt(a1, d3.mean(PANEL[s]), SY(0) + 42, t("Score on de jure items"), { size: 13, weight: 600, fill: "var(--ink)" });
      a1.append("text").attr("transform", `translate(${sx(0) - 46},${(SY(0) + SY(1)) / 2}) rotate(-90)`).attr("text-anchor", "middle")
        .attr("font-size", 13).attr("font-weight", 600).attr("fill", "var(--ink)").text(t("Score on de facto items"));
    });
    L.nodes = svg.append("g").selectAll("g.node").data(nodes).join("g").attr("class", "node");
    L.nodes.each(function (n) { svgFlag(d3.select(this), n.c, R1 - 2.5, { ring: "var(--panel)", ringWidth: 1.2, edge: true }); });
    withTip(L.nodes, n => `<div class="tt-head">${flagImg(n.c)}${esc(n.c.name)}</div><div class="tt-muted">${esc(SECTORS[n.s].long)}</div>` +
      (current === 1 ? `<div>${tx("<b>{v}</b> \"I don't know\" ({a} of {b} asked)", "<b>{v}</b> « Je ne sais pas » ({a} sur {b} posées)", { v: pct(n.idk), a: num(n.nIdk), b: plural(n.nAsked, "question") })}</div>`
        : `<div>${tx("De jure <b>{a}</b>, de facto <b>{b}</b>", "De jure <b>{a}</b>, de facto <b>{b}</b>", { a: pct(n.dj), b: pct(n.df) })}</div>`) +
      `<div class="tt-q">${t("Click to open the profile")}</div>`)
      .style("cursor", "pointer")
      .on("click", (ev, n) => { location.href = pageUrl("country.html", { c: n.c.iso3, s: n.s }); });
    L.nodes.on("pointerenter.grow", function () { d3.select(this).raise().select("g").transition().duration(120).attr("transform", "scale(1.4)"); })
      .on("pointerleave.grow", function () { d3.select(this).select("g").transition().duration(160).attr("transform", "scale(1)"); });
    go(current, true);
  }
  function go(k, instant) {
    current = k;
    const t = svg.transition().duration(instant ? 0 : DUR).ease(d3.easeCubicInOut);
    const p = pos[k];
    const shown = n => p.has(n.key);
    // flags not shown in this step wait where they will appear next, so they never fly in from a corner
    const at = n => p.get(n.key) || pos[1 - k].get(n.key) || [W / 2, H / 2];
    L.nodes.style("pointer-events", n => (shown(n) ? null : "none"));
    L.nodes.transition(t).attr("transform", n => `translate(${at(n)[0]},${at(n)[1]})`).attr("opacity", n => (shown(n) ? 1 : 0));
    svg.select(".ax0").transition(t).attr("opacity", k === 1 ? 1 : 0);   // "I don't know" axes
    svg.select(".ax1").transition(t).attr("opacity", k === 0 ? 1 : 0);   // the two scatters
  }
  build();
  onColours(build);
  scrolly("#steps .step", "#cards .step-card", "dots", k => { if (k !== current) go(k); });

  /* ------------------------------------------------------------ the questionnaires */
  const QDESC = {
    HRM: { intro: tx("Evaluates the civil service life cycle, analyzing how public servants are managed across three main pillars:",
        "Évalue le cycle de vie de la fonction publique, en analysant la gestion des agents publics selon trois piliers principaux :"),
      pillars: { "Strategy and legal framework": tx("Legal frameworks, institutional mandates, long-term plans and performance targets.", "Cadres juridiques, mandats institutionnels, plans à long terme et objectifs de performance."),
        "Public employment life cycle": tx("Specific mechanisms for recruitment, compensation, promotion and performance evaluation, training, and exit.", "Mécanismes de recrutement, de rémunération, de promotion et d'évaluation des performances, de formation et de départ."),
        "Information systems": tx("The coverage, transparency and data quality of the HR management information system (HRMIS), including payroll.", "Couverture, transparence et qualité des données du système d'information de gestion des ressources humaines (SIGRH), y compris la paie.") } },
    PFM: { intro: tx("Focuses on the budget cycle and fiscal transparency, tracking how a country manages its public finances across eight core dimensions:",
        "Porte sur le cycle budgétaire et la transparence budgétaire, en suivant la gestion des finances publiques d'un pays selon huit dimensions essentielles :"),
      rename: { IFMIS: t("Information systems (IFMIS)") } }
  };
  $("qcards").innerHTML = ["HRM", "PFM"].map(s => {
    const st = meta.structure[s], D = QDESC[s];
    const n = ids => plural(st.questions.filter(q => ids.includes(q.sec)).length, "question");
    const items = s === "HRM"
      ? d3.groups(st.sections, x => x.pillar_en || x.pillar).map(([p, ss]) => `<li><b>${esc(t(p))}${isFr() ? "\u00A0:" : ":"}</b> ${esc(D.pillars[p] || "")} <span class="n">${n(ss.map(x => x.id))}</span></li>`)
      : st.sections.map(x => `<li>${esc(D.rename[x.label_en || x.label] || x.label)} <span class="n">${n([x.id])}</span></li>`);
    return `<div class="qbox"><div class="qbox-head"><span>${sectorLabel(s, { h: 30 })}</span><span class="n">${plural(st.questions.length, "question")}</span></div>
      <div class="qbox-body"><p>${esc(D.intro)}</p><ul>${items.join("")}</ul></div></div>`;
  }).join("");

  /* ------------------------------------------------------------ downloads: the questionnaires and each country's answers */
  const QFILES = [["HRM", "PIC HRM pilot.xlsx"], ["PFM", "PIC PFM pilot.xlsx"]];
  $("dl-q").innerHTML = QFILES.map(([s, f]) => `<li><a href="assets/downloads/${encodeURIComponent(f)}" download="${f}">${sectorIcon(s, 34)}` +
    `<span><b>${esc(f.replace(/\.xlsx$/, ""))}</b><small>${esc(SECTORS[s].long)}. ${tx("Excel, English, French and Lao", "Excel, anglais, français et lao")}</small></span></a></li>`).join("");
  // one Excel file per country and questionnaire; the switch chooses the questionnaire (public employment first)
  const files = (meta.downloads || []).filter(d => d.year === year);
  const dlList = s => {
    $("dl-c").innerHTML = meta.withData.map(c => {
      const d = files.find(x => x.iso3 === c.iso3 && x.sector === s);
      return d ? `<li><a href="data/download/${encodeURIComponent(d.file)}" download>${flagImg(c, 20)}<span>${esc(c.name)}</span></a></li>` : "";
    }).join("") +
      `<li class="dl-all"><a href="data/download/pic_answers_${year}_${s}.csv" download>${tx("All countries in one file: {s} (CSV)", "Tous les pays dans un seul fichier : {s} (CSV)", { s: SECTORS[s].short })}</a></li>`;
  };
  segmented($("dl-sector"), ["HRM", "PFM"].map(s => ({ value: s, html: sectorLabel(s, { h: 18 }) })), "HRM", dlList);
  dlList("HRM");

  /* ------------------------------------------------------------ the comparison table: header and PIC row stay in view */
  const ds = $("ds");
  const setHead = () => ds.style.setProperty("--ds-head", ds.tHead.getBoundingClientRect().height + "px");
  setHead();
  new ResizeObserver(setHead).observe(ds.tHead);

} catch (err) { showError(document.querySelector(".pic-page") || document.body, err); }
