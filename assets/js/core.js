// Shared code for every page: data loading, colours, flags, tooltips, URL state and small controls.
import * as d3 from "./vendor/d3.bundle.js";
import { t, tx, isFr, lang } from "./i18n.js";
export { d3, t, tx, isFr, lang };

// site root (this file lives in assets/js/), so pages work in any sub-folder on a server
export const ROOT = new URL("../../", import.meta.url).href;

/* ---------------------------------------------------------------- data */

const cache = new Map();
export function getJSON(path) {
  if (!cache.has(path)) {
    cache.set(path, fetch(ROOT + path).then(r => {
      if (!r.ok) throw new Error(`could not load ${path} (${r.status})`);
      return r.json();
    }));
  }
  return cache.get(path);
}

export async function loadMeta() {
  const m = await getJSON("data/meta.json");
  if (m._ready) return m;
  // in French, the names and the questionnaire text are swapped for their French versions (the English stays in *_en);
  // area and region names stay as keys and are translated where they are shown (t())
  if (isFr()) {
    m.countries.forEach(c => { c.name_en = c.name; c.name = c.name_fr || c.name; });
    m.countries.sort((a, b) => a.name.localeCompare(b.name, "fr"));
    for (const s of ["HRM", "PFM"]) {
      const st = m.structure[s];
      st.sections.forEach(x => { x.label_en = x.label; x.label = t(x.label); x.pillar_en = x.pillar; x.pillar = t(x.pillar);
        x.subsections.forEach(u => { u.label_en = u.label; u.label = t(u.label); }); });
      st.questions.forEach(q => {
        q.text_en = q.text; q.item_en = q.item;
        if (q.text_fr) q.text = q.text_fr;
        if (q.item_fr) q.item = q.item_fr;
        if (q.options_fr && q.options_fr.length === (q.options || []).length) q.options = q.options_fr;
      });
    }
  }
  m.byIso = new Map(m.countries.map(c => [c.iso3, c]));
  m.withData = m.countries.filter(c => Object.keys(c.runs || {}).length);
  for (const s of ["HRM", "PFM"]) {
    const st = m.structure[s];
    st.byId = new Map(st.questions.map(q => [q.id, q]));
    st.secById = new Map(st.sections.map(x => [x.id, x]));
    st.subLabel = new Map(st.sections.flatMap(x => x.subsections.map(u => [u.id, u.label])));
  }
  m.scoreOf = (iso3, sector, area, lp = "all", year = m.years[0]) =>
    m.scores.find(r => r.iso3 === iso3 && r.sector === sector && r.area === area && r.lp === lp && r.year === year) || null;
  m.countOf = (iso3, sector, year = m.years[0]) => m.counts.find(r => r.iso3 === iso3 && r.sector === sector && r.year === year) || null;
  m.runOf = (c, sector) => (c && c.runs && c.runs[sector]) || null;
  m._ready = true;
  return m;
}

export async function loadAnswers(iso3, year, sector) {
  const raw = await getJSON(`data/country/${iso3}-${year}-${sector}.json`);
  if (!raw._byId) raw._byId = new Map(raw.answers.map(a => [a.id, a]));
  return raw;
}

export async function loadGrid(year, sector) {
  return getJSON(`data/grid-${year}-${sector}.json`);
}

export const SECTORS = {
  HRM: { get short() { return t("HRM"); }, get name() { return t("Public employment"); }, get long() { return t("Public employment (HRM)"); } },
  PFM: { get short() { return t("PFM"); }, get name() { return t("Public finances"); }, get long() { return t("Public finances (PFM)"); } }
};

/** Small line drawings that go with each questionnaire, in the manner of the Open Budget Survey's icons: two people for
 * public employment (HRM), a stack of coins for public finances (PFM). Hidden lines are dotted. The fill that hides
 * them takes --icon-bg (the background the icon sits on). */
/**
 * Small line icons in the same manner as sectorIcon (thin strokes in the text colour, hidden lines dotted), on a
 * 40 x 40 grid: map, trend (down), evidence (a page under a magnifying glass), action (a pointing hand), automation
 * (a robot and a person), dejure (books, one lying down), frontier (a gauge), chatbot (a robot head with a headset).
 */
export function lineIcon(name, h = 28) {
  const st = `fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"`;
  const dot = `fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="0.1 3" stroke-linecap="round" vector-effect="non-scaling-stroke"`;
  const bg = `fill="var(--icon-bg, var(--panel))"`;
  const P = (d, a = st) => `<path d="${d}" ${a}/>`;
  const I = {
    map: P("M4,9 L14,5 L26,9 L36,5 V31 L26,35 L14,31 L4,35 Z") + P("M14,5 V31 M26,9 V35", dot) +
      P("M20,13 C17,13 15.5,15 15.5,17 C15.5,20.5 20,25 20,25 C20,25 24.5,20.5 24.5,17 C24.5,15 23,13 20,13 Z", `${bg} stroke="none"`) +
      P("M20,13 C17,13 15.5,15 15.5,17 C15.5,20.5 20,25 20,25 C20,25 24.5,20.5 24.5,17 C24.5,15 23,13 20,13 Z") + `<circle cx="20" cy="17" r="1.6" ${st}/>`,
    trend: P("M5,34 H36", dot) + P("M5,8 L14,17 L20,13 L33,27") + P("M25,27 H33 V19"),
    evidence: P("M7,4 H24 L30,10 V36 H7 Z") + P("M24,4 V10 H30") + P("M11,13 H20 M11,18 H25 M11,23 H18 M11,28 H17", dot) +
      `<circle cx="25" cy="25" r="6.5" ${bg} stroke="none"/><circle cx="25" cy="25" r="6.5" ${st}/>` + P("M29.8,29.8 L36,36"),
    action: P("M17,9 V25 L14,22 C12.5,20.5 10,21.5 11,23.5 L16,32 C17.5,34.5 19.5,36 23,36 H25 C29,36 31,33 31,29 V22 C31,20.5 29,20.5 29,22 V21 C29,19.5 27,19.5 27,21 V20 C27,18.5 25,18.5 25,20 V19 C25,17.5 23,17.5 23,19 V9 C23,6.5 17,6.5 17,9 Z") +
      P("M20,2.5 V4.5 M12.5,5.5 L14,7 M27.5,5.5 L26,7 M10,11 H12 M28,11 H30"),
    automation: P("M5,11 H19 V22 H5 Z") + P("M12,11 V7") + `<circle cx="12" cy="5.5" r="1.5" ${st}/>` +
      `<circle cx="9" cy="16" r="1.2" ${st}/><circle cx="15" cy="16" r="1.2" ${st}/>` + P("M7,25 H17 V35 H7 Z") + P("M9.5,35 V37.5 M14.5,35 V37.5", dot) +
      `<circle cx="29" cy="12" r="5" ${st}/>` + P("M20.5,36 C20.5,27 24,22.5 29,22.5 C34,22.5 37.5,27 37.5,36"),
    dejure: P("M5,6 H12 V35 H5 Z") + P("M13,4 H20 V35 H13 Z") + P("M5,10 H12 M5,31 H12 M13,8 H20 M13,31 H20", dot) +
      P("M21,29 H37 V35 H21 Z") + P("M24,29 V35 M34,29 V35", dot),
    frontier: P("M5,30 A15,15 0 0 1 35,30") + P("M9,23 L11,24.5 M13.5,18 L15,20 M20,15.5 V18 M26.5,18 L25,20 M31,23 L29,24.5", dot) +
      `<circle cx="20" cy="30" r="2" ${st}/>` + P("M21.4,28.6 L28,20") + P("M7,35 H33"),
    chatbot: P("M10,13 H30 C33,13 34,15 34,17.5 V27 C34,29.5 33,31.5 30,31.5 H10 C7,31.5 6,29.5 6,27 V17.5 C6,15 7,13 10,13 Z") +
      P("M20,13 V8") + `<circle cx="20" cy="6.5" r="1.6" ${st}/><circle cx="14.5" cy="21" r="1.6" ${st}/><circle cx="25.5" cy="21" r="1.6" ${st}/>` +
      P("M16,26 C18,28 22,28 24,26") + P("M3,24 V19 C3,13 6,10 9,9 M37,24 V19 C37,13 34,10 31,9", dot) + P("M34,27 C34,33 31,35 26,35 H23")
  };
  return `<svg class="line-icon" viewBox="0 0 40 40" width="${h}" height="${h}" aria-hidden="true">${I[name] || ""}</svg>`;
}
export function sectorIcon(s, h = 22) {
  const w = Math.round(h * 1.5);
  const st = `fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"`;
  const dot = `fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="0.1 3" stroke-linecap="round" vector-effect="non-scaling-stroke"`;
  const bg = `fill="var(--icon-bg, var(--panel))"`;
  const person = (x, y, k) => `M${x - 13 * k},${y + 26 * k} C${x - 13 * k},${y + 14 * k} ${x - 7 * k},${y + 9 * k} ${x},${y + 9 * k} C${x + 7 * k},${y + 9 * k} ${x + 13 * k},${y + 14 * k} ${x + 13 * k},${y + 26 * k} Z`;
  const head = (x, y, k) => `M${x - 6.5 * k},${y} a${6.5 * k},${6.5 * k} 0 1 0 ${13 * k},0 a${6.5 * k},${6.5 * k} 0 1 0 ${-13 * k},0 Z`;
  let body;
  if (s === "HRM") {
    // the person at the back (right), then the one in front, filled so that the back person's lines behind it are
    // hidden; the hidden part is drawn again, dotted
    const back = `${person(39, 8, 0.95)} ${head(39, 8, 0.95)}`, front = `${person(23, 10, 1.05)} ${head(23, 10, 1.05)}`;
    body = `<path d="${back}" ${st}/><path d="${front}" ${bg} stroke="none"/><path d="${back}" ${dot}/><path d="${front}" ${st}/>`;
  } else {
    // a stack of coins seen from the side (coin edges dotted) and one coin standing in front of it
    const stack = `M8,10 A14,4.5 0 0 0 36,10 A14,4.5 0 0 0 8,10 Z M8,10 V31 A14,4.5 0 0 0 36,31 V10`;
    body = `<path d="${stack}" ${st}/>` +
      [17, 24].map(y => `<path d="M8,${y} A14,4.5 0 0 0 36,${y}" ${dot}/>`).join("") +
      `<circle cx="45" cy="28" r="10" ${bg} stroke="none"/><path d="M36,10 V31" ${dot}/>` +
      `<circle cx="45" cy="28" r="10" ${st}/><circle cx="45" cy="28" r="6.5" ${dot}/>`;
  }
  return `<svg class="sector-icon" viewBox="0 0 60 40" width="${w}" height="${h}" aria-hidden="true">${body}</svg>`;
}
/** A questionnaire's name with its icon, for buttons and headings. */
export const sectorLabel = (s, { long = true, h = 22 } = {}) =>
  `<span class="sector-lbl">${sectorIcon(s, h)}<span>${esc(long ? SECTORS[s].long : SECTORS[s].name)}</span></span>`;

/* ---------------------------------------------------------------- colours */

// The palettes of the "Are leaders leading?" site. Blue (or green, teal, olive) is always the better end.
// dots: five steps from the lowest answer (0) to the best (1), with a warm middle so that in-between
// answers never look like "don't know" (grey).
export const PALETTES = {
  blueorange: { label: "Blue and orange", pos: "#2E6AA8", neg: "#C9461A", posInk: "#1E4F86", negInk: "#A63D10",
    dots: ["#C9461A", "#EE8F3E", "#F3C460", "#7DB5DD", "#2E6AA8"] },
  // World Bank blues, light (lowest answer) to dark (best); on the dark background the ramp runs the other way,
  // so that the best answer is still the most visible
  wbblue: { label: "World Bank blues", pos: "#0071BC", neg: "#5FA6DC", posInk: "#002244", negInk: "#2F6FA3",
    dots: ["#B3D8F2", "#77B6E6", "#2F93D6", "#0067B1", "#002244"],
    darkDots: ["#24476B", "#2B6AA3", "#3E9FDC", "#86C6EE", "#D3ECFB"] },
  greenred: { label: "Green and red", pos: "#1E7D4F", neg: "#C0322F", posInk: "#0B5D3A", negInk: "#9E2421",
    dots: ["#C0322F", "#E4794C", "#EEC052", "#7DBE8D", "#1E7D4F"] },
  tealplum: { label: "Teal and plum", pos: "#0F7C80", neg: "#8E3A74", posInk: "#0B6366", negInk: "#76285F",
    dots: ["#8E3A74", "#C383B0", "#DCC9A2", "#74BDBB", "#0F7C80"] },
  olivepurple: { label: "Olive and violet", pos: "#5F7D1C", neg: "#6B3FA0", posInk: "#4B6413", negInk: "#56308A",
    dots: ["#6B3FA0", "#A78ACF", "#DCC9A2", "#ABC070", "#5F7D1C"] }
};
export const paletteKey = () => (PALETTES[document.documentElement.dataset.palette] ? document.documentElement.dataset.palette : "blueorange");
export const themeKey = () => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");
export const isDark = () => themeKey() === "dark";
const lift = (c, k) => d3.interpolateLab(c, "#ffffff")(k);

/** The active palette, adjusted for the background (on dark, colours are lifted so they stay visible). */
export function pal(key = paletteKey()) {
  const P = PALETTES[key];
  if (!isDark()) return { ...P, idk: "#C3CAD3", panel: "#FFFFFF" };
  return { ...P, pos: lift(P.pos, 0.3), neg: lift(P.neg, 0.18), posInk: lift(P.pos, 0.55), negInk: lift(P.neg, 0.45),
    dots: P.darkDots || P.dots.map((c, i) => (i === 0 || i === 4 ? lift(c, 0.22) : c)), idk: "#556070", panel: "#19202A" };
}
export const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
/** Colours of the de jure and de facto shapes (and of the single "all questions" shape): the active palette's two
 * extremes, de jure at the best-answer end and de facto at the lowest-answer end. The line is the extreme colour,
 * made darker (on dark: lighter) where needed so it reads against the background; the fill is a lighter version. */
export function lpColour(key) {
  const P = pal(), dark = isDark();
  const c = d3.hcl(key === "de facto" ? P.dots[0] : P.dots[4]);
  const off = dark ? c.l < 64 : c.l > 52;    // too dark (on dark) or too light (on white) for a line
  const line = off ? d3.hcl(c.h, Math.max(c.c || 0, 35), dark ? 64 : 52).formatHex() : d3.rgb(c).formatHex();
  return { color: line, fill: d3.interpolateRgb(line, P.panel)(dark ? 0.5 : 0.55) };
}
export const lpSeries = () => [
  { key: "de jure", label: t("De jure"), ...lpColour("de jure"), dash: "5 3" },
  { key: "de facto", label: t("De facto"), ...lpColour("de facto") }
];
export const allSeries = () => ({ key: "all", label: t("All scored questions"), ...lpColour("all") });

/** Colour of an answer worth s (0 = lowest answer, 1 = best): five steps, so every dot has one of the five
 * colours of the legend (a smooth scale would turn the middle values greyish, too close to "don't know"). */
export function scoreColor(s) {
  return d3.scaleThreshold().domain([0.2, 0.4, 0.6, 0.8]).range(pal().dots)(s);
}
export const darker = c => d3.lab(c).darker(isDark() ? -0.6 : 0.9).formatHex();

// Five kinds of answer shown with a dot
const STATUS_EN = {
  scored: "Answer, coloured by how far it goes",
  answered: "Answered, not scored",
  idk: "I don't know",
  closed: "Not asked (an earlier answer closes it)",
  upload: "Not answerable from documents"
};
export const STATUS_LABEL = {};
Object.keys(STATUS_EN).forEach(k => Object.defineProperty(STATUS_LABEL, k, { get: () => t(STATUS_EN[k]), enumerable: true }));
export function dotKind(a, q) {
  if (!a) return "none";
  if (a.st === "idk") return "idk";
  if (a.st === "closed") return "closed";
  if (a.st === "upload") return "upload";
  return a.s != null && q && q.points > 0 ? "scored" : "answered";
}
/** An SVG dot for an answer, as a string. */
export function dotSvg(a, q, size = 14) {
  const k = dotKind(a, q), r = size / 2 - 1, c = size / 2;
  const svg = inner => `<svg class="dot-svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">${inner}</svg>`;
  if (k === "scored") { const f = scoreColor(a.s); return svg(`<circle cx="${c}" cy="${c}" r="${r}" fill="${f}" stroke="${darker(f)}" stroke-width="1"/>`); }
  if (k === "idk") return svg(`<circle cx="${c}" cy="${c}" r="${r}" fill="${pal().idk}"/>`);
  if (k === "answered") return svg(`<circle cx="${c}" cy="${c}" r="${r - 0.6}" fill="none" stroke="var(--ink-3)" stroke-width="1.6"/>`);
  if (k === "closed") return svg(`<line x1="${c - r * 0.7}" x2="${c + r * 0.7}" y1="${c}" y2="${c}" stroke="var(--ink-4)" stroke-width="1.6" stroke-linecap="round"/>`);
  if (k === "upload") return svg(`<circle cx="${c}" cy="${c}" r="${r * 0.35}" fill="var(--ink-4)"/>`);
  return svg("");
}
/** Legend for the dots, as HTML. */
export function dotLegend({ compact = false } = {}) {
  const P = pal();
  const ramp = [0, 0.25, 0.5, 0.75, 1].map(s => `<i style="background:${scoreColor(s)};border-color:${darker(scoreColor(s))}"></i>`).join("");
  return `<span class="key"><span class="lg-lo">${t("Worst answer")}</span><span class="dot-ramp">${ramp}</span><span class="lg-hi">${t("Best answer")}</span></span>` +
    `<span class="key">${dotSvg({ st: "idk" }, null, 12)}${t("I don't know")}</span>` +
    (compact ? "" : `<span class="key">${dotSvg({ st: "answered" }, { points: 0 }, 12)}${t("Answered, not scored")}</span>`) +
    `<span class="key">${dotSvg({ st: "closed" }, null, 12)}${t("Not asked")}</span>`;
}

/* evidence grades: A and B rest on a quote the code found in a document; C is the models' own suggestion; D is no answer */
const GRADES_EN = {
  A: "A quote found word for word in a strong, recent source (law, official report, independent assessment) supports the answer.",
  B: "A quote found in the documents supports the answer, but the source is weaker, older or the check was not conclusive.",
  C: "No document found: the answer is the models' own suggestion, not evidence.",
  D: "No answer could be given."
};
export const GRADES = {};
Object.keys(GRADES_EN).forEach(k => Object.defineProperty(GRADES, k, { get: () => t(GRADES_EN[k]), enumerable: true }));
/** The grade as a plain letter, in the table's own type. */
export function gradeChip(g, { title = true } = {}) {
  if (!g || !GRADES[g]) return `<span class="grade grade-none" title="${t("No grade")}">–</span>`;
  return `<span class="grade grade-${g}"${title ? ` title="${esc(t("Grade {g}: {text}", { g, text: GRADES[g] }))}"` : ""}>${g}</span>`;
}
export function quoteMark(qf) {
  if (qf === true) return `<span class="qcheck qcheck-yes" title="${t("The code found the quoted passage word for word in the source")}">${t("Yes")}</span>`;
  if (qf === false) return `<span class="qcheck qcheck-no" title="${t("The quoted passage was not found word for word in the source")}">${t("No")}</span>`;
  return `<span class="qcheck qcheck-none" title="${t("No quote")}">–</span>`;
}

/* ---------------------------------------------------------------- formats */

// numbers: "45%" and "1,234" in English, "45 %" and "1 234" in French (narrow no-break spaces)
export const pct = (v, d = 0) => (v == null || isNaN(v) ? "–" : isFr() ? `${(v * 100).toFixed(d).replace(".", ",")}\u202F%` : `${(v * 100).toFixed(d)}%`);
const numEn = d3.format(","), numFr = d3.formatLocale({ decimal: ",", thousands: "\u202F", grouping: [3], currency: ["", "\u00A0€"] }).format(",");
export const num = n => (isFr() ? numFr(n) : numEn(n));
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// English words, translated: French uses the singular for 0 and 1
export const plural = (n, one, many) => `${num(n)} ${(isFr() ? n <= 1 : n === 1) ? t(one) : t(many || one + "s")}`;
export const domainOf = u => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return u; } };
/** "1: Yes" -> "Yes"; several options on separate lines -> a list. With the question, each option is shown in the
 * question's own wording (its French wording when French is chosen), matched by its number. */
export function answerParts(a, q) {
  if (a == null) return [];
  const byCode = new Map((q && q.options || []).map(o => { const m = String(o).match(/^\s*(-?\d{1,3})\s*:\s*(.*)$/); return m ? [m[1], m[2]] : null; }).filter(Boolean));
  // options are on separate lines ("1: A\n3: C"); older files may have them on one line ("1: A 3: C")
  return String(a).split(/\n+|\s+(?=\d{1,3}:\s)/).map(s => s.trim().replace(/[;,]\s*$/, "")).filter(Boolean).map(s => {
    const m = s.match(/^(\d{1,3})\s*:\s*(.*)$/);
    if (!m) return s;
    return byCode.get(m[1]) || (m[1] === "99" ? t("I don't know") : m[2]);
  });
}
export function answerText(a, { max = 0, q = null } = {}) {
  const p = answerParts(a, q);
  let t = p.join("; ");
  if (max && t.length > max) t = t.slice(0, max - 1) + "…";
  return t;
}

/* ---------------------------------------------------------------- flags */

export const flagUrl = c => (c && c.iso2 ? `${ROOT}assets/flags/${c.iso2}.svg` : null);
export function flagImg(c, size = 20) {
  const u = flagUrl(c);
  return u ? `<img class="flag" src="${u}" width="${size}" height="${size}" alt="" loading="lazy">` : "";
}
/** A round flag in an SVG, with a ring. */
export function svgFlag(sel, c, r, { ring = "var(--panel)", ringWidth = 2, edge = false } = {}) {
  const g = sel.append("g").attr("class", "flag-mark");
  g.append("circle").attr("class", "ring").attr("r", r + ringWidth / 2).attr("fill", "var(--panel)").attr("stroke", ring).attr("stroke-width", ringWidth);
  const u = flagUrl(c);
  if (u) g.append("image").attr("href", u).attr("x", -r).attr("y", -r).attr("width", 2 * r).attr("height", 2 * r);
  // a thin grey edge so that neighbouring flags, and white or pale flags, stand apart
  if (edge) g.append("circle").attr("class", "edge").attr("r", r + ringWidth).attr("fill", "none").attr("stroke", "var(--ink-4)").attr("stroke-width", 0.9);
  return g;
}

/* ---------------------------------------------------------------- tooltip */

let tipEl, tipPinned = false, tipAt = null;
/** One tooltip for the whole page. A tooltip can be pinned (tip.pin): it then stays where it is, takes clicks (links
 * in it work) and ignores hovering elsewhere, until its close button, Escape or a click outside it. */
export const tip = {
  get pinned() { return tipPinned; },
  el() {
    if (!tipEl) {
      tipEl = document.createElement("div"); tipEl.className = "pic-tip"; tipEl.setAttribute("role", "status"); document.body.appendChild(tipEl);
      tipEl.addEventListener("click", ev => { if (ev.target.closest(".tt-close")) tip.unpin(); });
      document.addEventListener("pointerdown", ev => { if (tipPinned && !tipEl.contains(ev.target) && !ev.target.closest("[data-pin]")) tip.unpin(); });
      document.addEventListener("keydown", ev => { if (ev.key === "Escape" && tipPinned) tip.unpin(); });
    }
    return tipEl;
  },
  show(html, ev) {
    if (tipPinned) return;
    const el = tip.el();
    el.innerHTML = html;
    el.classList.add("on");
    tip.move(ev);
  },
  /** Keep the tooltip open where it is, with a close button. */
  pin(html, ev) {
    const el = tip.el();
    tipPinned = false;
    el.innerHTML = `<button type="button" class="tt-close" aria-label="${t("Close")}">×</button>` + html;
    el.classList.add("on", "pinned");
    el.setAttribute("role", "dialog");
    tip.move(ev);
    tipPinned = true;
  },
  unpin() {
    tipPinned = false;
    if (tipEl) { tipEl.classList.remove("on", "pinned"); tipEl.setAttribute("role", "status"); }
  },
  /** New content for the tooltip that is showing (e.g. once more data has loaded), at the same place. */
  update(html) {
    if (!tipEl || !tipEl.classList.contains("on")) return;
    tipEl.innerHTML = (tipPinned ? `<button type="button" class="tt-close" aria-label="${t("Close")}">×</button>` : "") + html;
    if (tipAt) { const p = tipPinned; tipPinned = false; tip.move(tipAt); tipPinned = p; }
  },
  move(ev) {
    if (!tipEl || !ev || tipPinned) return;
    let x, y;
    if (typeof ev.clientX === "number" && (ev.clientX || ev.clientY)) { x = ev.clientX; y = ev.clientY; }
    else { const b = (ev.target || ev).getBoundingClientRect(); x = b.right; y = b.top; }
    tipAt = { clientX: x, clientY: y };
    const w = tipEl.offsetWidth, h = tipEl.offsetHeight;
    let left = x + 14, top = y + 14;
    if (left + w > window.innerWidth - 8) left = x - w - 14;
    if (top + h > window.innerHeight - 8) top = y - h - 14;
    if (top < 8) top = Math.max(8, window.innerHeight - h - 8);
    tipEl.style.left = Math.max(8, left) + "px";
    tipEl.style.top = Math.max(8, top) + "px";
  },
  hide() { if (tipEl && !tipPinned) tipEl.classList.remove("on"); }
};
export function withTip(sel, html) {
  sel.attr("tabindex", 0)
    .on("pointerenter focus", function (ev, d) { tip.show(html(d, this), ev); })
    .on("pointermove", ev => tip.move(ev))
    .on("pointerleave blur", () => tip.hide());
  return sel;
}
/** Tooltips for plain HTML elements carrying data-tip (delegated, works for rows added later). */
export function htmlTips(root, html) {
  root.addEventListener("pointerover", ev => { const t = ev.target.closest("[data-tip]"); if (t && root.contains(t)) tip.show(html(t), ev); });
  root.addEventListener("pointermove", ev => { if (ev.target.closest("[data-tip]")) tip.move(ev); });
  root.addEventListener("pointerout", ev => { const t = ev.target.closest("[data-tip]"); if (t && !t.contains(ev.relatedTarget)) tip.hide(); });
  root.addEventListener("focusin", ev => { const t = ev.target.closest("[data-tip]"); if (t) tip.show(html(t), ev); });
  root.addEventListener("focusout", () => tip.hide());
}

/* ---------------------------------------------------------------- URL state */

export const params = () => new URLSearchParams(location.search);
export function setParams(obj) {
  const p = params();
  Object.entries(obj).forEach(([k, v]) => (v == null || v === "" ? p.delete(k) : p.set(k, v)));
  const q = p.toString();
  // some hosts (sandboxed frames) refuse to change the address: the page still works
  try { history.replaceState(null, "", location.pathname + (q ? "?" + q : "") + location.hash); } catch (e) { /* ignore */ }
}
export const pageUrl = (page, obj = {}) => {
  const p = new URLSearchParams(Object.entries(obj).filter(([, v]) => v != null && v !== ""));
  return `${ROOT}${page}${[...p].length ? "?" + p : ""}`;
};

/* ---------------------------------------------------------------- colours and theme switches */

export function setPalette(k) {
  document.documentElement.dataset.palette = k;
  try { localStorage.setItem("pic-palette", k); } catch (e) { /* private mode */ }
  setParams({ palette: null });
  window.dispatchEvent(new CustomEvent("pic:colours"));
}
export function setTheme(t, { remember = true } = {}) {
  document.documentElement.dataset.theme = t === "dark" ? "dark" : "light";
  if (remember) { try { localStorage.setItem("pic-theme", t); } catch (e) { /* private mode */ } }
  setParams({ theme: null });
  window.dispatchEvent(new CustomEvent("pic:colours"));
}
export function onColours(cb) { window.addEventListener("pic:colours", cb); }

/* ---------------------------------------------------------------- controls */

export function fillSelect(sel, options, value) {
  sel.innerHTML = "";
  const groups = d3.groups(options, o => o.group || "");
  for (const [g, opts] of groups) {
    const parent = g ? Object.assign(document.createElement("optgroup"), { label: g }) : sel;
    if (g) sel.appendChild(parent);
    for (const o of opts) parent.appendChild(Object.assign(document.createElement("option"), { value: o.value, textContent: o.label, disabled: !!o.disabled }));
  }
  if (value != null && options.some(o => String(o.value) === String(value))) sel.value = value;
  return sel.value;
}

export function countryPicker(field, countries, value, onChange) {
  field.innerHTML = `<div class="with-flag"><img alt=""><select aria-label="${t("Country")}"></select></div>`;
  const img = field.querySelector("img"), sel = field.querySelector("select");
  fillSelect(sel, countries.map(c => ({ value: c.iso3, label: c.name })), value);
  const sync = () => { const c = countries.find(x => x.iso3 === sel.value); img.src = flagUrl(c) || ""; img.style.visibility = flagUrl(c) ? "visible" : "hidden"; };
  sel.addEventListener("change", () => { sync(); onChange(sel.value); });
  sync();
  return { get value() { return sel.value; }, set value(v) { sel.value = v; sync(); }, el: sel };
}

/** A country menu with the flags inside it (a native select cannot show images): a button with the chosen
 * country's flag and name, and a list of flags and names. Arrow keys, Enter, Escape and first letters work.
 * setItems() narrows the list (e.g. to one World Bank region). */
export function countryMenu(field, countries, value, onChange, { placeholder = t("Choose a country") } = {}) {
  const CH = `<svg class="cm-chev" viewBox="0 0 12 12" width="11" height="11" aria-hidden="true"><path d="M2 4.5 6 8.5l4-4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>`;
  const uid = "cm" + Math.random().toString(36).slice(2, 8);
  field.classList.add("cmenu-wrap");
  field.innerHTML = `<button type="button" class="cmenu-btn" aria-haspopup="listbox" aria-expanded="false" aria-controls="${uid}"><img alt=""><span class="cm-name"></span>${CH}</button>` +
    `<ul class="cmenu" id="${uid}" role="listbox" tabindex="-1" hidden></ul>`;
  const btn = field.querySelector("button"), list = field.querySelector("ul"), img = btn.querySelector("img"), name = btn.querySelector(".cm-name");
  let items = countries.slice(), cur = value, hi = -1;
  const byIso = iso => countries.find(c => c.iso3 === iso);
  const sync = () => {
    const c = byIso(cur);
    img.src = c ? flagUrl(c) : ""; img.style.display = c ? "" : "none";
    name.textContent = c ? c.name : placeholder;
  };
  const render = () => {
    list.innerHTML = items.map((c, i) => `<li role="option" id="${uid}-${c.iso3}" data-v="${c.iso3}" aria-selected="${c.iso3 === cur}"${i === hi ? ' class="hi"' : ""}>${flagImg(c, 18)}<span>${esc(c.name)}</span></li>`).join("");
    if (hi >= 0) { const el = list.children[hi]; if (el) { el.scrollIntoView({ block: "nearest" }); list.setAttribute("aria-activedescendant", el.id); } }
  };
  const open = () => { hi = Math.max(0, items.findIndex(c => c.iso3 === cur)); list.hidden = false; btn.setAttribute("aria-expanded", "true"); render(); list.focus(); };
  const close = (focus = true) => { list.hidden = true; btn.setAttribute("aria-expanded", "false"); if (focus) btn.focus(); };
  const choose = iso => { close(); if (iso && iso !== cur) { cur = iso; sync(); onChange(iso); } };
  btn.addEventListener("click", () => (list.hidden ? open() : close()));
  btn.addEventListener("keydown", e => { if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); open(); } });
  list.addEventListener("click", e => { const li = e.target.closest("li"); if (li) choose(li.dataset.v); });
  list.addEventListener("keydown", e => {
    if (e.key === "ArrowDown") { e.preventDefault(); hi = Math.min(items.length - 1, hi + 1); render(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); hi = Math.max(0, hi - 1); render(); }
    else if (e.key === "Home") { e.preventDefault(); hi = 0; render(); }
    else if (e.key === "End") { e.preventDefault(); hi = items.length - 1; render(); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (items[hi]) choose(items[hi].iso3); }
    else if (e.key === "Escape" || e.key === "Tab") { close(e.key === "Escape"); }
    else if (/^[a-z]$/i.test(e.key)) { const k = items.findIndex((c, i) => i > hi && c.name[0].toLowerCase() === e.key.toLowerCase()); const k0 = items.findIndex(c => c.name[0].toLowerCase() === e.key.toLowerCase()); hi = k >= 0 ? k : k0 >= 0 ? k0 : hi; render(); }
  });
  document.addEventListener("click", e => { if (!field.contains(e.target) && !list.hidden) close(false); });
  sync();
  return {
    get value() { return cur; },
    set value(v) { cur = v; sync(); },
    setItems(list2) { items = list2.slice(); hi = -1; if (!list.hidden) render(); }
  };
}

export function segmented(el, items, value, onChange) {
  el.classList.add("seg");
  el.setAttribute("role", "group");
  el.innerHTML = items.map(i => `<button type="button" data-v="${esc(i.value)}" aria-pressed="${i.value === value}"${i.title ? ` title="${esc(i.title)}"` : ""}>${i.html || esc(i.label)}</button>`).join("");
  el.querySelectorAll("button").forEach(b => b.addEventListener("click", () => {
    el.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b));
    onChange(b.dataset.v);
  }));
  return { set(v) { el.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x.dataset.v === v)); } };
}

export function tabs(el, items, value, onChange) {
  el.classList.add("tabs");
  el.setAttribute("role", "tablist");
  el.innerHTML = items.map(i => `<button type="button" role="tab" data-v="${esc(i.value)}" aria-selected="${i.value === value}">${esc(i.label)}</button>`).join("");
  el.querySelectorAll("button").forEach(b => b.addEventListener("click", () => {
    el.querySelectorAll("button").forEach(x => x.setAttribute("aria-selected", x === b));
    onChange(b.dataset.v);
  }));
}

/** Redraw on resize (debounced) and when the colours or background change. */
export function responsive(el, draw) {
  let w = 0, t;
  const ro = new ResizeObserver(() => {
    const nw = Math.round(el.clientWidth);
    if (nw && Math.abs(nw - w) > 4) { w = nw; clearTimeout(t); t = setTimeout(draw, 60); }
  });
  ro.observe(el);
  onColours(draw);
}

export function showError(el, err) {
  console.error(err);
  el.innerHTML = `<div class="empty">${tx("The data didn't load", "Les données ne se sont pas chargées")} (${esc(err.message)}). ${tx("If you opened the page straight from your computer, run <code>quarto preview</code> instead: browsers block data files opened from disk.", "Si vous avez ouvert la page directement depuis votre ordinateur, lancez plutôt <code>quarto preview</code> : les navigateurs bloquent les fichiers de données ouverts depuis le disque.")}</div>`;
}

/* ---------------------------------------------------------------- SVG download */

export async function downloadSvg(svgNode, filename) {
  const clone = svgNode.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("font-family", "Public Sans, Segoe UI, sans-serif");
  const src = [svgNode, ...svgNode.querySelectorAll("*")], dst = [clone, ...clone.querySelectorAll("*")];
  src.forEach((el, i) => {
    const cs = getComputedStyle(el), d = dst[i];
    for (const prop of ["fill", "stroke"]) if ((el.getAttribute(prop) || "").includes("var(")) d.setAttribute(prop, cs[prop]);
    if (el.tagName === "text" && !el.getAttribute("fill")) d.setAttribute("fill", cs.fill);
  });
  const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bg.setAttribute("width", "100%"); bg.setAttribute("height", "100%"); bg.setAttribute("fill", cssVar("--panel") || "#fff");
  clone.insertBefore(bg, clone.firstChild);
  await Promise.all([...clone.querySelectorAll("image")].map(async im => {
    const href = im.getAttribute("href");
    if (!href || href.startsWith("data:")) return;
    try { const txt = await (await fetch(href)).text(); im.setAttribute("href", "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(txt)))); } catch (e) { /* keep link */ }
  }));
  const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: filename + ".svg" });
  document.body.appendChild(a); a.click(); a.remove();
}
export function svgButton(container, getSvg, filename) {
  const b = document.createElement("button");
  b.type = "button"; b.className = "btn-quiet pic-dl"; b.textContent = t("Download (SVG)");
  b.addEventListener("click", () => { const s = getSvg(); if (s) downloadSvg(s, filename()); });
  container.appendChild(b);
  return b;
}
