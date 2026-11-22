// Language of the site: English (default) or French. The reader's choice is kept like the colours (assets/header.html
// sets data-lang on <html> before the page shows). Three ways to translate:
//   t("English text", {vars})   short interface text, looked up in i18n-fr.js (English is the key, and the fallback)
//   tx("English", "Français")   longer sentences written in both languages where they are used
//   lang="en" / lang="fr"       blocks of text on the pages themselves (the other language is hidden by the stylesheet)
// Attributes on the pages: data-fr-placeholder, data-fr-title, data-fr-aria-label, data-fr-alt give the French value.
import { FR } from "./i18n-fr.js";

export const LANGS = [
  { k: "en", code: "ENG", name: "English", flag: "gb" },
  { k: "fr", code: "FRA", name: "Français", flag: "fr" }
];
export const lang = () => (document.documentElement.dataset.lang === "fr" ? "fr" : "en");
export const isFr = () => lang() === "fr";

const fill = (s, vars) => (vars ? String(s).replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m)) : s);
/** Interface text in the reader's language: the French from the dictionary, or the English as given. */
export function t(s, vars) {
  if (s == null) return s;
  return fill(isFr() && FR[s] != null ? FR[s] : s, vars);
}
/** A sentence written in both languages where it is used. */
export const tx = (en, fr, vars) => fill(isFr() ? fr : en, vars);

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
  if (!isFr()) return;
  for (const a of ["placeholder", "title", "aria-label", "alt"]) {
    root.querySelectorAll(`[data-fr-${a}]`).forEach(el => el.setAttribute(a, el.getAttribute(`data-fr-${a}`)));
  }
}
