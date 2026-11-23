// "Ask the data": answers typed questions from the PIC data, in the browser. It recognizes countries, areas,
// de jure and de facto, "I don't know" answers, evidence grades and words like "highest"; it can also find one question of
// the questionnaires by its words. Every figure comes from the data files. If an AI endpoint is set in
// assets/assistant-config.json, the reader can also send the question and the figures found to it.
import { d3, loadMeta, loadGrid, getJSON, esc, pct, num, plural, flagImg, svgFlag, scoreColor, dotSvg, answerParts,
  gradeChip, pageUrl, showError, SECTORS, t, tx, isFr, isEs } from "../core.js";

const $ = id => document.getElementById(id);
const fold = s => " " + String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9%\s'-]/g, " ").replace(/\s+/g, " ").trim() + " ";
const has = (q, w) => q.includes(" " + w + " ");

// words for the areas of each questionnaire
const AREA_WORDS = {
  HRM: {
    "Strategy": ["estrategia", "estrategico", "marco legal", "marco juridico", "metas de desempeno", "indicadores clave", "strategy", "strategic", "legal framework", "kpi", "kpis", "performance targets", "long-term plan", "strategie", "cadre juridique", "objectifs de performance"],
    "Recruitment": ["reclutamiento", "contratacion", "seleccion", "merito", "concursos", "examenes", "ofertas de empleo", "vacantes", "ingreso", "recruitment", "recruit", "recruiting", "hiring", "hire", "hired", "merit", "selection", "entry exam", "exams", "job offers", "vacancies", "recrutement", "recruter", "embauche", "concours", "examens", "offres d'emploi"],
    "Compensation": ["compensacion", "remuneracion", "remuneraciones", "salario", "salarios", "sueldos", "escala salarial", "beneficios", "compensation", "pay", "salary", "salaries", "wages", "pay grade", "pay scale", "benefits", "remuneration", "salaire", "salaires", "traitement", "grille", "avantages"],
    "Promotion": ["promocion", "promociones", "ascenso", "ascensos", "carrera", "promotion", "promotions", "promoted", "career", "avancement", "carriere"],
    "Performance evaluation": ["evaluacion del desempeno", "evaluacion de desempeno", "evaluaciones", "desempeno", "performance evaluation", "appraisal", "appraisals", "evaluations", "evaluation", "performance management", "evaluation des performances", "notation"],
    "Training": ["capacitacion", "formacion", "aprendizaje", "training", "trained", "learning", "on-the-job", "formation", "formations"],
    "Dismissal": ["desvinculacion", "despido", "despidos", "destitucion", "cese", "dismissal", "dismiss", "dismissed", "firing", "fired", "exit", "separation", "termination", "licenciement", "revocation", "depart", "cessation"],
    "Information systems": ["sistema de informacion", "sistemas de informacion", "nomina", "planilla", "datos de personal", "hrmis", "information system", "information systems", "hr data", "payroll", "digital", "data quality", "records", "sigrh", "sirh", "systeme d'information", "systemes d'information", "paie", "donnees rh"]
  },
  PFM: {
    "Planning": ["planificacion", "programacion fiscal", "proyecciones", "pronosticos", "estrategia fiscal", "riesgos fiscales", "mediano plazo", "macroeconomicas", "planning", "fiscal programming", "forecast", "forecasts", "fiscal strategy", "fiscal risks", "medium-term", "macroeconomic", "planification", "programmation budgetaire", "previsions", "strategie budgetaire", "risques budgetaires", "moyen terme"],
    "Formulation": ["formulacion", "preparacion del presupuesto", "calendario presupuestario", "circular presupuestaria", "techos", "clasificacion presupuestaria", "proyecto de presupuesto", "formulation", "budget preparation", "budget calendar", "budget circular", "ceilings", "classification", "budget proposal", "elaboration", "preparation du budget", "calendrier budgetaire", "circulaire budgetaire", "plafonds"],
    "Approval": ["aprobacion", "poder legislativo", "congreso", "aprobacion del presupuesto", "approval", "legislature", "parliament", "legislative", "budget approval", "adoption", "parlement", "vote du budget"],
    "Execution": ["ejecucion", "ejecucion presupuestaria", "ejecucion del presupuesto", "caja", "compromisos", "pagos", "tesoreria", "auditoria interna", "atrasos", "execution", "budget execution", "cash", "commitment", "commitments", "payments", "treasury", "internal audit", "arrears", "execution du budget", "tresorerie", "engagements", "paiements", "tresor", "audit interne", "arrieres"],
    "Reporting and audit": ["informes", "auditoria", "auditoria externa", "entidad fiscalizadora", "efs", "contraloria", "informes financieros", "cuentas", "reporting", "reports", "audit", "external audit", "supreme audit", "sai", "financial reports", "accounts", "rapports", "audit externe", "cour des comptes", "rapports financiers", "comptes"],
    "IFMIS": ["siaf", "sistema integrado de administracion financiera", "ifmis", "financial management information system", "fmis", "siigf", "sigfp"],
    "Personnel": ["dotacion", "funcionarios de gfp", "personnel", "staff", "vacancies", "pfm staff", "technical staff", "effectifs", "agents"]
  }
};
const SECTOR_WORDS = {
  HRM: ["hrm", "civil service", "civil servants", "public employment", "public servants", "human resource", "human resources", "staff management", "employment",
    "grh", "fonction publique", "fonctionnaires", "emploi public", "agents publics", "ressources humaines",
    "servicio civil", "funcion publica", "funcionarios", "servidores publicos", "empleo publico", "recursos humanos", "rrhh"],
  PFM: ["pfm", "budget", "budgets", "public finance", "public finances", "fiscal", "financial management", "spending",
    "gfp", "finances publiques", "budgetaire", "budgetaires", "gestion financiere", "depenses",
    "presupuesto", "presupuestos", "finanzas publicas", "presupuestario", "presupuestaria", "gasto"]
};
const EXTRA_COUNTRY = { "ivory coast": "CIV", "cote divoire": "CIV", "laos": "LAO", "lao": "LAO", "ghanaian": "GHA", "nigerian": "NGA", "colombian": "COL",
  "brazilian": "BRA", "estonian": "EST", "swedish": "SWE", "malaysian": "MYS", "senegalese": "SEN", "kenyan": "KEN", "moroccan": "MAR", "uzbek": "UZB",
  "cambodian": "KHM", "filipino": "PHL", "philippine": "PHL", "bangladeshi": "BGD", "mozambican": "MOZ", "romanian": "ROU",
  // French spellings (accents are dropped before matching)
  "rdp lao": "LAO", "bresilien": "BRA", "colombien": "COL", "estonien": "EST", "ghaneen": "GHA", "ivoirien": "CIV", "kenyan": "KEN",
  "laotien": "LAO", "malaisien": "MYS", "marocain": "MAR", "mozambicain": "MOZ", "nigerian": "NGA", "philippin": "PHL", "senegalais": "SEN",
  "suedois": "SWE", "ouzbek": "UZB", "cambodgien": "KHM", "bangladais": "BGD", "roumain": "ROU",
  // Spanish spellings
  "costa de marfil": "CIV", "brasileno": "BRA", "colombiano": "COL", "estonio": "EST", "ghanes": "GHA", "marfileno": "CIV", "keniano": "KEN",
  "laosiano": "LAO", "malasio": "MYS", "marroqui": "MAR", "mozambiqueno": "MOZ", "nigeriano": "NGA", "senegales": "SEN", "sueco": "SWE",
  "uzbeko": "UZB", "camboyano": "KHM", "bangladesi": "BGD", "rumano": "ROU", "rdp lao": "LAO" };
const STOP = new Set(("a an the of in on to for and or is are do does did which what where who how many much country countries have has with by be any there their that this it its about tell me show give " +
  "le la les un une des du de et ou est sont quel quelle quels quelles qui quoi comment combien pays dans sur pour par avec ce cette ces se sa son ses leur leurs au aux en parle moi montre " +
  "el los las unos unas del cual cuales quien como cuanto cuantos cuantas paises este esta estos estas su sus al lo hay tiene tienen donde dime muestra muestrame hablame").split(" "));

try {
  const meta = await loadMeta();
  const year = meta.years[0];
  const [gH, gP] = await Promise.all([loadGrid(year, "HRM"), loadGrid(year, "PFM")]);
  const GRID = { HRM: gH, PFM: gP };
  let config = {};
  try { config = await getJSON("assets/assistant-config.json"); } catch (e) { config = {}; }

  const aliases = [];
  meta.countries.forEach(c => { aliases.push([fold(c.name).trim(), c]); if (c.name_en) aliases.push([fold(c.name_en).trim(), c]); if (c.name_fr) aliases.push([fold(c.name_fr).trim(), c]); if (c.name_es) aliases.push([fold(c.name_es).trim(), c]); aliases.push([fold(c.id).trim(), c]); aliases.push([c.iso3.toLowerCase(), c]); });
  Object.entries(EXTRA_COUNTRY).forEach(([a, iso]) => aliases.push([a, meta.byIso.get(iso)]));
  aliases.sort((a, b) => b[0].length - a[0].length);

  const current = s => meta.countries.filter(c => c.runs[s] && c.runs[s].year === year);
  const score = (c, s, area = "Total", lp = "all") => (meta.scoreOf(c.iso3, s, area, lp, year) || {});

  function parse(text) {
    let q = fold(text);
    const countries = [];
    for (const [a, c] of aliases) {
      if (!c || a.length < 3) continue;
      if (has(q, a) && !countries.includes(c)) { countries.push(c); q = q.replace(" " + a + " ", " # "); }
    }
    let sector = null, area = null, best = 0;
    for (const s of ["HRM", "PFM"]) {
      for (const [ar, words] of Object.entries(AREA_WORDS[s])) {
        const sc = d3.sum(words, w => (has(q, w) ? w.split(" ").length : 0));
        if (sc > best) { best = sc; area = ar; sector = s; }
      }
    }
    for (const s of ["HRM", "PFM"]) if (SECTOR_WORDS[s].some(w => has(q, w)) && !area) sector = s;
    if (!sector && SECTOR_WORDS.PFM.some(w => has(q, w))) sector = "PFM";
    const lp = /\b(law|laws|legal|de jure|jure|practice|de facto|facto|in practice|gap|droit|loi|lois|juridique|pratique|en pratique|ecart|ley|leyes|normativa|practica|en la practica|brecha)\b/.test(q) && /\b(practice|de facto|facto|gap|compare|versus|vs|fall|below|lag|pratique|ecart|comparer|sous|inferieur|inferieure|inferieurs|practica|brecha|comparar|frente|debajo|inferior)\b/.test(q);
    const missing = /\b(missing|don't know|dont know|unanswered|no answer|idk|gaps in|je ne sais pas|ne sais pas|sans reponse|manquant|manquantes|lacunes|no se|sin respuesta|faltantes|vacios)\b/.test(q);
    const grades = /\b(grade|grades|quote|quotes|evidence|verified|notes|citation|citations|preuve|preuves|calificacion|calificaciones|cita|citas|evidencia|pruebas)\b/.test(q);
    const dir = /\b(lowest|least|worst|weakest|fewest|bottom|smallest|less|below|plus bas|plus basse|plus faible|plus faibles|pire|moins|dernier|mas bajo|mas baja|mas debil|mas debiles|peor|peores|menor|menos|ultimo)\b/.test(q) ? "min" : /\b(highest|most|best|strongest|top|greatest|largest|more|plus eleve|plus elevee|plus fort|plus forte|meilleur|meilleure|meilleurs|premier|plus|mas alto|mas alta|mas fuerte|mas fuertes|mejor|mejores|mayor|primero|mas)\b/.test(q) ? "max" : null;
    const about = /\btell me about\b|\babout\b|\bprofile\b|\bsummary\b|\bhow is\b|\bhow does\b|\bparle moi\b|\bprofil\b|\bresume\b|\bcomment\b|\bhablame de\b|\bperfil\b|\bresumen\b|\bcomo le va\b|\bcomo esta\b/.test(q);
    // a single question, matched by its words
    const words = q.split(" ").filter(w => w.length > 3 && !STOP.has(w));
    let match = null;
    if (words.length) {
      for (const s of ["HRM", "PFM"]) {
        for (const qq of meta.structure[s].questions) {
          if (qq.type === "text") continue;
          const hay = fold(`${qq.text} ${qq.item || ""}`);
          const hit = words.filter(w => hay.includes(" " + w) || hay.includes(w + " ")).length;
          const lawWord = words.some(w => /^(requir|legal|law|mandat|exig|loi|jurid|oblig|ley|norma)/.test(w)), pracWord = words.some(w => /^(practice|actual|often|usual|pratiq|frequen|habitu|practic|frecuen)/.test(w));
          const bonus = (lawWord && /legal|law|mandat|loi|jurid|oblig|ley|norma/.test(hay) ? 1 : 0) + (pracWord && /in practice|how often|en pratique|frequence|en la practica|con que frecuencia/.test(hay) ? 1 : 0);
          const sc = (hit + bonus) / Math.sqrt(words.length) + (qq.item ? -0.15 : 0);
          if (hit >= 2 && (!match || sc > match.sc)) match = { q: qq, s, sc, hit, strength: hit + bonus };
        }
      }
    }
    return { countries, sector, area, lp, missing, grades, dir, about, match };
  }

  /* ---------------------------------------------- a small bar chart with flags */
  function bars(rows, { value = r => r.v, label = r => r.c.name, flag = r => r.c, text = v => pct(v), highlight = new Set(), color } = {}) {
    const div = document.createElement("div");
    div.className = "chart";
    const W = Math.min(820, $("log").clientWidth - 40), rowH = 26, m = { l: 170, r: 70, t: 4 };
    const svg = d3.select(div).append("svg").attr("width", W).attr("height", m.t + rows.length * rowH);
    const x = d3.scaleLinear().domain([0, Math.max(1, d3.max(rows, value) || 1)]).range([m.l, W - m.r]);
    rows.forEach((r, i) => {
      const v = value(r), g = svg.append("g").attr("transform", `translate(0,${m.t + i * rowH + rowH / 2})`);
      if (flag(r)) svgFlag(g.append("g").attr("transform", "translate(10,0)"), flag(r), 8);
      g.append("text").attr("x", 24).attr("dy", "0.32em").attr("font-size", 12).attr("fill", "var(--ink)").attr("font-weight", highlight.has(r) ? 700 : 400)
        .text(label(r).length > 24 ? label(r).slice(0, 23) + "…" : label(r));
      g.append("rect").attr("x", m.l).attr("y", -6).attr("width", Math.max(2, x(v) - m.l)).attr("height", 12).attr("rx", 3).attr("fill", color ? color(r) : scoreColor(v));
      g.append("text").attr("x", x(v) + 6).attr("dy", "0.32em").attr("font-size", 12).attr("font-weight", 600).attr("fill", "var(--ink)").text(text(v, r));
    });
    return div;
  }
  function answersTable(match, cs) {
    const div = document.createElement("div");
    const items = GRID[match.s].items[match.q.id] || {};
    div.innerHTML = `<table class="area-list"><tbody>${cs.map(c => {
      const x = items[c.iso3]; if (!x) return "";
      const [st, s, a, g] = x;
      const txt = st === "idk" ? `<span class="muted">${t("I don't know")}</span>` : st === "closed" ? `<span class="muted">${t("Not asked")}</span>` : esc(answerParts(a, match.q).join("; "));
      return `<tr><td style="white-space:nowrap">${flagImg(c, 16)} ${esc(c.name)}</td><td style="width:22px">${dotSvg({ st, s }, match.q, 13)}</td><td>${txt}</td><td>${g ? gradeChip(g) : ""}</td></tr>`;
    }).join("")}</tbody></table>`;
    return div;
  }

  /* ---------------------------------------------- answers */
  function answer(text) {
    const P = parse(text);
    const out = { html: "", chart: null, links: [], facts: [] };
    const say = s => { out.html += `<p>${s}</p>`; out.facts.push(s.replace(/<[^>]+>/g, "")); };
    const sector = P.sector || "HRM";
    const mid = s => `${SECTORS[s].name.toLowerCase()} (${SECTORS[s].short})`;   // a questionnaire's name inside a sentence
    const ar = a => (isFr() || isEs() ? t(a).toLowerCase() : a.toLowerCase());     // an area's name inside a sentence
    const pool = s => { const cs = current(s); P.countries.forEach(c => { if (c.runs[s] && !cs.includes(c)) cs.push(c); }); return cs; };
    const older = () => "";

    if (!P.countries.length && !P.area && !P.sector && !P.missing && !P.grades && !P.lp && !P.match) {
      say(tx("I can answer questions about the countries, the areas of the two questionnaires (recruitment, compensation, promotion, performance evaluation, training, dismissal, HR information systems; planning, formulation, approval, execution, reporting and audit, IFMIS, personnel), de jure and de facto scores, \"I don't know\" answers and evidence grades, and about single questions, found by their words. Try one of the examples above.",
        "Je peux répondre à des questions sur les pays, les domaines des deux questionnaires (recrutement, rémunération, promotion, évaluation des performances, formation, licenciement, systèmes d'information RH ; planification, élaboration, adoption, exécution, rapports et audit, SIIGF, personnel), les scores de jure et de facto, les réponses « Je ne sais pas » et les notes des preuves, ainsi que sur une question précise, retrouvée par ses mots. Essayez l'un des exemples ci-dessus."));
      return out;
    }
    // 1. a single question matched by its words, when no area or country summary is asked for
    if (P.match && P.match.hit >= 2 && !P.missing && !P.grades && !P.lp && (!P.area || P.match.strength >= 3)) {
      const q = P.match.q, s = P.match.s, cs = P.countries.length ? P.countries.filter(c => c.runs[s]) : current(s);
      const items = GRID[s].items[q.id] || {};
      const ans = cs.filter(c => items[c.iso3] && items[c.iso3][0] === "answered");
      say(tx("I read this as question <b>{n}</b> of the {m} questionnaire: “{q}”.", "Je comprends la question <b>{n}</b> du questionnaire {m} : « {q} ».",
        { n: esc(q.n), m: mid(s), q: esc(q.text) + (q.item ? " … " + esc(q.item) : "") }));
      say(tx(`{a} of {b} have an answer; the rest are "I don't know" or not asked.`, `{a} sur {b} ont une réponse ; les autres sont « Je ne sais pas » ou non posées.`,
        { a: ans.length, b: plural(cs.length, "country", "countries") }));
      out.chart = answersTable(P.match, cs);
      out.links.push([t("Compare all countries"), pageUrl("compare.html", { s })]);
      return out;
    }
    // 2. de jure and de facto
    if (P.lp) {
      const s = sector, area = P.area && AREA_WORDS[s][P.area] ? P.area : "Total";
      const cs = pool(s).map(c => ({ c, dj: score(c, s, area, "de jure").score, df: score(c, s, area, "de facto").score }))
        .filter(r => r.dj != null && r.df != null).map(r => ({ ...r, v: r.dj - r.df })).sort((a, b) => b.v - a.v);
      if (!cs.length) { say(tx("No country has both a de jure and a de facto score for this area.", "Aucun pays n'a à la fois un score de jure et un score de facto pour ce domaine.")); return out; }
      const below = cs.filter(r => r.v > 0.005), above = cs.filter(r => r.v < -0.005);
      const where = area === "Total" ? tx("Across all areas of {m}", "Dans l'ensemble des domaines ({m})", { m: mid(s) }) : tx("In {a}", "En {a}", { a: esc(ar(area)) });
      say(tx("{w}, the de facto score is below the de jure score in <b>{a} of {b}</b> countries", "{w}, le score de facto est inférieur au score de jure dans <b>{a} pays sur {b}</b>", { w: where, a: below.length, b: cs.length }) +
        (below.length ? tx("; the gap is largest in <b>{c}</b> (de jure {dj}, de facto {df})", " ; l'écart est le plus grand pour <b>{c}</b> (de jure {dj}, de facto {df})", { c: esc(below[0].c.name), dj: pct(below[0].dj), df: pct(below[0].df) }) : "") + ". " +
        (above.length ? tx("The de facto score is above the de jure score in {l}.", "Le score de facto dépasse le score de jure pour {l}.", { l: above.map(r => `${esc(r.c.name)} (${pct(r.df)} ${tx("against", "contre")} ${pct(r.dj)})`).join(", ") }) : ""));
      out.chart = bars(cs, { value: r => Math.abs(r.v), text: (v, r) => (Math.abs(r.v) < 0.005 ? tx("no gap", "pas d'écart") : tx("{k} higher by {n} pts", "{k} plus élevé de {n} pts", { k: r.v > 0 ? "de jure" : "de facto", n: Math.round(Math.abs(r.v) * 100) })),
        color: r => (r.v >= 0 ? "var(--ink-3)" : "var(--accent)") });
      out.html += `<p class="note">${tx("Bars: the gap between the de jure and de facto scores, in percentage points; grey where the de jure score is higher, blue where the de facto score is.", "Barres : l'écart entre les scores de jure et de facto, en points de pourcentage ; en gris quand le score de jure est plus élevé, en bleu quand c'est le score de facto.")}</p>`;
      out.links.push([t("Distribution of scores"), pageUrl("compare.html", { v: "dist", s })]);
      return out;
    }
    // 3. "I don't know" answers
    if (P.missing) {
      const s = sector, area = P.area || "Total";
      const cs = (P.countries.length ? P.countries.filter(c => c.runs[s]) : pool(s)).map(c => ({ c, v: score(c, s, area).idk })).filter(r => r.v != null).sort((a, b) => b.v - a.v);
      const where = area === "Total" ? tx("In the {m} questionnaire", "Dans le questionnaire {m}", { m: mid(s) }) : tx("In {a}", "En {a}", { a: esc(ar(area)) });
      say(tx(`{w}, the share of points answered "I don't know" ranges from <b>{lo}</b> in {clo} to <b>{hi}</b> in {chi}.`, `{w}, la part des points avec « Je ne sais pas » va de <b>{lo}</b> ({clo}) à <b>{hi}</b> ({chi}).`,
        { w: where, lo: pct(cs.at(-1).v), clo: esc(cs.at(-1).c.name), hi: pct(cs[0].v), chi: esc(cs[0].c.name) }));
      out.chart = bars(cs, { color: () => "var(--ink-4)" });
      out.links.push([tx("\"I don't know\" answers by area", "Réponses « Je ne sais pas » par domaine"), pageUrl("compare.html", { v: "missing", s })]);
      return out;
    }
    // 4. evidence grades
    if (P.grades) {
      const s = sector, cs = (P.countries.length ? P.countries : pool(s)).map(c => ({ c, r: meta.countOf(c.iso3, s, year) })).filter(x => x.r && (x.r.grade_A + x.r.grade_B + x.r.grade_C + x.r.grade_D));
      const rows = cs.map(x => ({ c: x.c, v: (x.r.grade_A + x.r.grade_B) / Math.max(1, x.r.answered + x.r.idk), a: x.r.grade_A, b: x.r.grade_B, qf: x.r.quotes_found })).sort((a, b) => b.v - a.v);
      if (!rows.length) { say(tx("No graded answers for this choice yet.", "Pas encore de réponses notées pour ce choix.")); return out; }
      if (rows.length === 1) {
        const r = rows[0];
        say(tx("In {c}, for {m}, <b>{v}</b> of the questions asked have an answer resting on a quote found in a document: {a} with grade A and {b} with grade B. {q} quotes were found word for word in their source.",
          "Pour {c}, en {m}, <b>{v}</b> des questions posées ont une réponse fondée sur une citation trouvée dans un document : {a} avec la note A et {b} avec la note B. {q} citations ont été trouvées mot pour mot dans leur source.",
          { c: esc(r.c.name), m: mid(s), v: pct(r.v), a: r.a, b: r.b, q: num(r.qf) }));
        out.links.push([tx("{c}'s profile", "Profil : {c}", { c: r.c.name }), pageUrl("country.html", { c: r.c.iso3, s })]);
        return out;
      }
      say(tx("Share of the questions asked whose answer rests on a quote found in a document (grade A or B), {m}: highest in <b>{hi}</b> ({vh}), lowest in {lo} ({vl}).",
        "Part des questions posées dont la réponse repose sur une citation trouvée dans un document (note A ou B), {m} : la plus élevée pour <b>{hi}</b> ({vh}), la plus faible pour {lo} ({vl}).",
        { m: mid(s), hi: esc(rows[0].c.name), vh: pct(rows[0].v), lo: esc(rows.at(-1).c.name), vl: pct(rows.at(-1).v) }));
      out.chart = bars(rows, { text: (v, r) => `${pct(v)} (A ${r.a}, B ${r.b})`, color: () => "var(--pos)" });
      return out;
    }
    // 5. one country, no area: a summary
    if (P.countries.length === 1 && !P.area) {
      const c = P.countries[0];
      if (!Object.keys(c.runs).length) { say(tx("{c} is a pilot country but hasn't been run yet.", "{c} est un pays pilote, mais n'a pas encore été traité.", { c: esc(c.name) })); return out; }
      for (const s of ["HRM", "PFM"]) {
        if (!c.runs[s]) continue;
        const r = meta.countOf(c.iso3, s, year), tt = score(c, s);
        const areas = meta.structure[s].areas.map(a => ({ a, v: score(c, s, a).score })).filter(x => x.v != null).sort((x, y) => y.v - x.v);
        say(`${flagImg(c)} <b>${esc(c.name)}, ${esc(SECTORS[s].long)}</b>${older(c, s)}` + tx(`: {a} of {b} questions asked have an answer; overall score <b>{sc}</b>, with {i} of the points answered "I don't know". Strongest area: {hi} ({vh}); weakest: {lo} ({vl}).`,
          ` : {a} questions posées sur {b} ont une réponse ; score global <b>{sc}</b>, avec {i} des points en « Je ne sais pas ». Domaine le plus fort : {hi} ({vh}) ; le plus faible : {lo} ({vl}).`,
          { a: num(r.answered), b: num(r.answered + r.idk), sc: pct(tt.score), i: pct(tt.idk), hi: esc(ar(areas[0].a)), vh: pct(areas[0].v), lo: esc(ar(areas.at(-1).a)), vl: pct(areas.at(-1).v) }));
      }
      const s = c.runs.HRM ? "HRM" : "PFM";
      out.chart = bars(meta.structure[s].areas.map(a => ({ c: null, a, v: score(c, s, a).score })).filter(x => x.v != null), { label: r => t(r.a), flag: () => null });
      out.html += `<p class="note">${tx("Bars: {s} scores by area.", "Barres : scores {s} par domaine.", { s: esc(SECTORS[s].long) })}</p>`;
      out.links.push([tx("{c}'s profile", "Profil : {c}", { c: c.name }), pageUrl("country.html", { c: c.iso3 })]);
      return out;
    }
    // 6. an area or the total: rank countries, or compare those named
    const s = sector, area = P.area || "Total", label = area === "Total" ? mid(s) : area === area.toUpperCase() ? t(area) : ar(area);
    let cs = (P.countries.length >= 2 ? P.countries.filter(c => c.runs[s]) : pool(s)).map(c => ({ c, v: score(c, s, area).score })).filter(r => r.v != null);
    if (!cs.length) { say(tx(`I couldn't find scores for that. I know the countries, the areas of the two questionnaires (for example recruitment, compensation, budget execution, IFMIS), de jure and de facto scores, "I don't know" answers and evidence grades.`,
      `Je n'ai pas trouvé de scores pour cela. Je connais les pays, les domaines des deux questionnaires (par exemple recrutement, rémunération, exécution du budget, SIIGF), les scores de jure et de facto, les réponses « Je ne sais pas » et les notes des preuves.`)); return out; }
    cs.sort((a, b) => (P.dir === "min" ? a.v - b.v : b.v - a.v));
    const me = P.countries.length === 1 ? cs.find(r => r.c === P.countries[0]) : null;
    if (me) {
      const rank = [...cs].sort((a, b) => b.v - a.v).indexOf(me) + 1;
      const rk = isEs() ? (rank === 1 ? "el más alto" : `${rank}.º`) :
        tx(rank === 1 ? "the highest" : `${rank}${rank === 2 ? "nd" : rank === 3 ? "rd" : "th"}`, rank === 1 ? "le plus élevé" : `${rank}e`);
      say(`${flagImg(me.c)} <b>${esc(me.c.name)}</b>${older(me.c, s)} ` + tx("scores <b>{v}</b> on {l}: {rk} of {n} countries. The median is {m}.", "obtient <b>{v}</b> en {l} : {rk} sur {n} pays. La médiane est de {m}.",
        { v: pct(me.v), l: esc(label), rk, n: cs.length, m: pct(d3.median(cs, r => r.v)) }));
    } else if (P.countries.length >= 2) {
      say(cs.map(r => `${esc(r.c.name)}${older(r.c, s)}: <b>${pct(r.v)}</b>`).join("; ") + ` (${esc(label)}).`);
    } else {
      const lo = P.dir === "min";
      say(tx("{h} on {l}: <b>{c}</b> ({v}), then {next}. {h2}: {c2} ({v2}), of {n} countries.", "{h} en {l} : <b>{c}</b> ({v}), puis {next}. {h2} : {c2} ({v2}), sur {n} pays.",
        { h: lo ? tx("Lowest", "Le plus faible") : tx("Highest", "Le plus élevé"), l: esc(label), c: esc(cs[0].c.name), v: pct(cs[0].v),
          next: cs.slice(1, 3).map(r => `${esc(r.c.name)} (${pct(r.v)})`).join(tx(" and ", " et ")),
          h2: lo ? tx("Highest", "Le plus élevé") : tx("Lowest", "Le plus faible"), c2: esc(cs.at(-1).c.name), v2: pct(cs.at(-1).v), n: cs.length }));
    }
    out.chart = bars(cs, { highlight: new Set(me ? [me] : []) });
    out.links.push([tx("Compare countries on {s}", "Comparer les pays ({s})", { s: SECTORS[s].short }), pageUrl("compare.html", { s, v: "dist" })]);
    if (me) out.links.push([tx("{c}'s profile", "Profil : {c}", { c: me.c.name }), pageUrl("country.html", { c: me.c.iso3, s })]);
    return out;
  }

  /* ---------------------------------------------- the conversation */
  const examples = isEs() ? [
    "¿Dónde es más fuerte el reclutamiento?",
    "¿Cómo le va a Ghana en ejecución presupuestaria?",
    "¿Dónde queda el puntaje de facto más por debajo del de jure?",
    "¿Qué países tienen una función de auditoría interna operativa?",
    "¿Dónde es más frecuente «No sé» en finanzas públicas?",
    "Comparar Colombia y Brasil en SIAF",
    "Háblame de Senegal"
  ] : isFr() ? [
    "Où le recrutement est-il le plus fort ?",
    "Comment se situe le Ghana en exécution du budget ?",
    "Où le score de facto est-il le plus en dessous du score de jure ?",
    "Quels pays ont une fonction d'audit interne opérationnelle ?",
    "Où « Je ne sais pas » est-il le plus fréquent en finances publiques ?",
    "Comparer la Colombie et le Brésil sur le SIIGF",
    "Parle-moi du Sénégal"
  ] : [
    "Where is recruitment strongest?",
    "How does Ghana do on budget execution?",
    "Where is the de facto score furthest below the de jure score?",
    "Which countries have an operational internal audit function?",
    "Where is \"I don't know\" most common in public finances?",
    "Compare Colombia and Brazil on IFMIS",
    "Tell me about Senegal"
  ];
  $("chips").innerHTML = examples.map(e => `<button type="button">${esc(e)}</button>`).join("");
  $("chips").querySelectorAll("button").forEach(b => b.addEventListener("click", () => ask(b.textContent)));

  async function ask(text) {
    text = text.trim(); if (!text) return;
    $("log").insertAdjacentHTML("beforeend", `<div class="msg-q">${esc(text)}</div>`);
    const a = answer(text);
    const box = document.createElement("div");
    box.className = "msg-a";
    box.innerHTML = a.html;
    if (a.chart) box.appendChild(a.chart);
    if (a.links.length) box.insertAdjacentHTML("beforeend", `<div class="links">${a.links.map(([t, u]) => `<a class="btn-quiet" href="${u}">${esc(t)}</a>`).join("")}</div>`);
    if (config.endpoint && a.facts.length) {
      const b = document.createElement("button");
      b.className = "btn-quiet"; b.textContent = tx("Ask {n} to explain", "Demander une explication à {n}", { n: config.name || tx("the AI assistant", "l'assistant d'IA") });
      b.addEventListener("click", async () => {
        b.disabled = true; b.textContent = t("Asking…");
        try {
          const r = await fetch(config.endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: text, facts: a.facts }) });
          const j = await r.json();
          box.insertAdjacentHTML("beforeend", `<p style="margin-top:10px"><strong>${esc(config.name || tx("AI assistant", "Assistant d'IA"))}:</strong> ${esc(j.answer || "")}</p><p class="note">${tx("Written by an AI model from the figures above. Check against the data before quoting.", "Rédigé par un modèle d'IA à partir des chiffres ci-dessus. À vérifier dans les données avant toute citation.")}</p>`);
          b.remove();
        } catch (e) { b.textContent = t("The assistant didn't answer"); }
      });
      box.appendChild(b);
    }
    $("log").appendChild(box);
    box.scrollIntoView({ behavior: "smooth", block: "start" });
    $("input").value = "";
  }
  $("form").addEventListener("submit", ev => { ev.preventDefault(); ask($("input").value); });
  const q0 = new URLSearchParams(location.search).get("q");
  if (q0) ask(q0);
} catch (err) { showError($("log"), err); }
