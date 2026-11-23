// Language of the site: English (default), French or Spanish. The reader's choice is kept like the colours
// (assets/header.html sets data-lang on <html> before the page shows). Three ways to translate:
//   t("English text", {vars})   short interface text, looked up in i18n-fr.js or i18n-es.js (English is the key, and
//                               the fallback)
//   tx("English", "Français")   longer sentences written in English and French where they are used; the Spanish is
//                               looked up in i18n-es.js by the English
//   lang="en" / "fr" / "es"     blocks of text on the pages themselves (the other languages are hidden by the stylesheet)
// Attributes on the pages: data-fr-placeholder, data-fr-title, data-fr-aria-label, data-fr-alt give the French value,
// data-es-... the Spanish.
// The French questionnaire text is the validated French form; the Spanish (ESP*) is a preliminary translation by
// Claude, not yet reviewed, hence the asterisk.
import { FR } from "./i18n-fr.js";
import { ES } from "./i18n-es.js";

export const LANGS = [
  { k: "en", code: "ENG", name: "English", flag: "gb" },
  { k: "fr", code: "FRA", name: "Français", flag: "fr" },
  { k: "es", code: "ESP*", name: "Español*", flag: "es", note: "*Traducción preliminar, sin revisar" }
];
export const lang = () => { const l = document.documentElement.dataset.lang; return l === "fr" || l === "es" ? l : "en"; };
export const isFr = () => lang() === "fr";
export const isEs = () => lang() === "es";

const fill = (s, vars) => (vars ? String(s).replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m)) : s);
const DICT = () => (isFr() ? FR : isEs() ? ES : null);
/** Interface text in the reader's language: the French or Spanish from the dictionary, or the English as given. */
export function t(s, vars) {
  if (s == null) return s;
  const D = DICT();
  return fill(D && D[s] != null ? D[s] : s, vars);
}
/** A sentence written in English and French where it is used (the Spanish comes from the dictionary). */
export const tx = (en, fr, vars) => fill(isFr() ? fr : isEs() && ES[en] != null ? ES[en] : en, vars);

/** Change the language: remembered in this browser (or carried in the address where storage is refused), then the
 * page is loaded again so that every chart and text is drawn in the new language. */
export function setLang(k) {
  try { localStorage.setItem("pic-lang", k); } catch (e) { /* private mode */ }
  let u;
  try { u = new URL(location.href); } catch (e) { location.reload(); return; }
  if (window.picVolatileStore || u.searchParams.has("lang")) {
    if (k === "en") u.searchParams.delete("lang"); else u.searchParams.set("lang", k);
  }
  location.href = u.href;
}

/** Translate the attributes marked on the pages (the text blocks are switched by the stylesheet). */
export function applyStatic(root = document) {
  const l = lang();
  if (l === "en") return;
  for (const a of ["placeholder", "title", "aria-label", "alt"]) {
    root.querySelectorAll(`[data-${l}-${a}]`).forEach(el => el.setAttribute(a, el.getAttribute(`data-${l}-${a}`)));
  }
}
