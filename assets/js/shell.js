// Adds the light/dark switch, the colour menu and the language menu to the navbar on every page, translates the menu
// and the page title when French is chosen, and swaps logos for the dark background.
import { PALETTES, paletteKey, themeKey, setPalette, setTheme, onColours, scoreColor, esc, ROOT } from "./core.js";
import { t, lang, LANGS, setLang, applyStatic } from "./i18n.js";
import { circuitBackground } from "./circuit.js";

const SUN = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="12" cy="12" r="4.3" fill="currentColor"/><path d="M12 2.6v2.3M12 19.1v2.3M2.6 12h2.3M19.1 12h2.3M5.4 5.4l1.6 1.6M17 17l1.6 1.6M5.4 18.6 7 17M17 7l1.6-1.6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
const MOON = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M20.4 14.7A8.6 8.6 0 0 1 9.3 3.6a8.6 8.6 0 1 0 11.1 11.1Z" fill="currentColor"/></svg>`;

// swatch of a palette: the five answer colours, worked out with that palette
function swatch(k) {
  const keep = document.documentElement.dataset.palette;
  document.documentElement.dataset.palette = k;
  const cols = [0, 0.25, 0.5, 0.75, 1].map(scoreColor);
  document.documentElement.dataset.palette = keep;
  return cols.map(c => `<i style="background:${c}"></i>`).join("");
}

function swapLogos() {
  const dark = themeKey() === "dark";
  document.querySelectorAll("img[data-logo], .navbar-brand img, img.navbar-logo").forEach(img => {
    const src = img.getAttribute("src") || "";
    const want = dark ? src.replace(/(pic-logo|pic-mark|wb-logo)\.png$/, "$1-dark.png") : src.replace(/-dark\.png$/, ".png");
    if (want !== src) img.setAttribute("src", want);
  });
}

const CHEV = `<svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="M2 4.5 6 8.5l4-4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>`;
const flag = L => `<img class="lang-flag" src="${ROOT}assets/flags/${L.flag}.svg" width="18" height="18" alt="">`;

// the menu, the page title and the attributes marked on the page, in French
const NAV = { "index.html": "Home", "country.html": "Country profiles", "compare.html": "Compare countries", "ask.html": "Ask the data" };
function translatePage() {
  if (lang() === "en") return;
  document.querySelectorAll(".navbar .nav-link").forEach(a => {
    const page = (a.getAttribute("href") || "").split("/").pop().split("?")[0] || "index.html";
    const span = a.querySelector(".menu-text") || a;
    if (NAV[page]) span.textContent = t(NAV[page]);
  });
  document.title = document.title.replace(/Country profiles|Compare countries|Ask the data/, m => t(m));
  applyStatic();
}

function mount() {
  const nav = document.querySelector("#navbarCollapse") || document.querySelector(".navbar .container-fluid, .navbar");
  if (!nav || nav.querySelector(".look")) return;
  const cur = LANGS.find(L => L.k === lang());
  const box = document.createElement("div");
  box.className = "look";
  box.innerHTML =
    `<div class="theme-switch" role="group" aria-label="${t("Light or dark background")}">` +
      `<button type="button" data-t="light" title="${t("Light background")}" aria-label="${t("Light background")}" aria-pressed="${themeKey() === "light"}">${SUN}</button>` +
      `<button type="button" data-t="dark" title="${t("Dark background")}" aria-label="${t("Dark background")}" aria-pressed="${themeKey() === "dark"}">${MOON}</button>` +
    `</div>` +
    `<div class="pal-menu">` +
      `<button type="button" class="pal-btn" aria-haspopup="true" aria-expanded="false" title="${t("Colours of the answers")}"><span class="swatch"></span><span class="lbl">${t("Colours")}</span>${CHEV}</button>` +
      `<div class="pal-pop" role="menu" hidden>` +
        `<p class="pal-head">${t("Colours of the answers")}</p>` +
        Object.entries(PALETTES).map(([k, P]) => `<button type="button" role="menuitemradio" data-k="${k}" aria-checked="${k === paletteKey()}"><span class="swatch" data-sw="${k}"></span>${esc(t(P.label))}</button>`).join("") +
        `<p class="pal-note">${t("The better answer is always the blue, green, teal or olive end; in World Bank blues, the strongest blue.")}</p>` +
      `</div>` +
    `</div>` +
    // language: a flag and a three-letter code, right of the colours
    `<div class="pal-menu lang-menu">` +
      `<button type="button" class="pal-btn lang-btn" aria-haspopup="true" aria-expanded="false" title="${t("Language")}" aria-label="${t("Language")}: ${cur.name}">${flag(cur)}<span class="lbl">${cur.code}</span>${CHEV}</button>` +
      `<div class="pal-pop lang-pop" role="menu" hidden>` +
        LANGS.map(L => `<button type="button" role="menuitemradio" data-l="${L.k}" aria-checked="${L.k === lang()}"${L.note ? ` title="${L.note}"` : ""}>${flag(L)}<b>${L.code}</b><span>${L.name}</span></button>`).join("") +
        LANGS.filter(L => L.note).map(L => `<p class="lang-note">${L.note}</p>`).join("") +
      `</div>` +
    `</div>`;
  nav.appendChild(box);
  const lbtn = box.querySelector(".lang-btn"), lpop = box.querySelector(".lang-pop");
  const lclose = () => { lpop.hidden = true; lbtn.setAttribute("aria-expanded", "false"); };
  lbtn.addEventListener("click", ev => { ev.stopPropagation(); close(); lpop.hidden = !lpop.hidden; lbtn.setAttribute("aria-expanded", String(!lpop.hidden)); });
  document.addEventListener("click", ev => { if (!box.querySelector(".lang-menu").contains(ev.target)) lclose(); });
  document.addEventListener("keydown", ev => { if (ev.key === "Escape") lclose(); });
  lpop.querySelectorAll("button[data-l]").forEach(b => b.addEventListener("click", () => { lclose(); if (b.dataset.l !== lang()) setLang(b.dataset.l); }));

  const btn = box.querySelector(".pal-btn"), pop = box.querySelector(".pal-pop");
  function close() { pop.hidden = true; btn.setAttribute("aria-expanded", "false"); }
  const paint = () => {
    btn.querySelector(".swatch").innerHTML = swatch(paletteKey());
    pop.querySelectorAll("[data-sw]").forEach(s => { s.innerHTML = swatch(s.dataset.sw); });
    pop.querySelectorAll("button[data-k]").forEach(b => b.setAttribute("aria-checked", b.dataset.k === paletteKey()));
    box.querySelectorAll(".theme-switch button").forEach(b => b.setAttribute("aria-pressed", b.dataset.t === themeKey()));
    swapLogos();
  };
  btn.addEventListener("click", ev => { ev.stopPropagation(); box.querySelector(".lang-pop").hidden = true; pop.hidden = !pop.hidden; btn.setAttribute("aria-expanded", String(!pop.hidden)); });
  document.addEventListener("click", ev => { if (!box.querySelector(".pal-menu").contains(ev.target)) close(); });
  document.addEventListener("keydown", ev => { if (ev.key === "Escape") close(); });
  pop.querySelectorAll("button[data-k]").forEach(b => b.addEventListener("click", () => { setPalette(b.dataset.k); close(); }));
  box.querySelectorAll(".theme-switch button").forEach(b => b.addEventListener("click", () => setTheme(b.dataset.t)));
  onColours(paint);
  paint();
}
// height of the navbar, for the sticky table headers and the scrolling stories
function navHeight() {
  const h = (document.querySelector("#quarto-header") || document.querySelector(".navbar") || {}).offsetHeight;
  if (h) document.documentElement.style.setProperty("--nav-h", h + "px");
}
// two quiet hints for first-time readers: an arrow at the bottom right while there is more below, and one at the top
// right (under the menu) once the reader is past the first section; a click moves the page by most of a screen. A hint
// stays hidden while it would cover something (a chart, a figure, a table, text or a button), so it never gets in the way.
function scrollHints() {
  const arrow = d => `<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="${d === "down" ? "M6 2v8M2.5 6.5 6 10l3.5-3.5" : "M6 10V2M2.5 5.5 6 2l3.5 3.5"}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const make = (d, label) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `scroll-hint scroll-${d}`;
    b.setAttribute("aria-label", label);
    b.innerHTML = `<span>${label}</span>${arrow(d)}`;
    b.addEventListener("click", () => window.scrollBy({ top: (d === "down" ? 1 : -1) * innerHeight * 0.8, behavior: "smooth" }));
    document.body.appendChild(b);
    return b;
  };
  const down = make("down", t("Scroll down for further information")), up = make("up", t("Scroll up for previous information"));
  const first = document.querySelector("#quarto-document-content section, #quarto-document-content .pic-intro");
  const FREE = new Set(["html", "body", "main", "section", "div", "header", "footer", "article", "figure", "form", "svg"]);
  const covers = b => {
    const r = b.getBoundingClientRect();
    return [[r.left + 3, r.top + 3], [r.right - 3, r.top + 3], [r.left + 3, r.bottom - 3], [r.right - 3, r.bottom - 3], [(r.left + r.right) / 2, (r.top + r.bottom) / 2]]
      .some(([x, y]) => {
        const under = document.elementsFromPoint(x, y).find(e => !e.closest(".scroll-hint"));
        return under && !FREE.has(under.tagName.toLowerCase());
      });
  };
  let tick = false;
  const update = () => {
    tick = false;
    const doc = document.documentElement, rest = doc.scrollHeight - (scrollY + innerHeight);
    const past = first ? first.getBoundingClientRect().bottom < navOffset() : scrollY > innerHeight * 0.6;
    const wantDown = doc.scrollHeight > innerHeight + 120 && rest > 80, wantUp = past && scrollY > 40;
    down.classList.toggle("on", wantDown && !covers(down));
    up.classList.toggle("on", wantUp && !covers(up));
  };
  const navOffset = () => (document.getElementById("quarto-header") || {}).offsetHeight || 80;
  addEventListener("scroll", () => { if (!tick) { tick = true; requestAnimationFrame(update); } }, { passive: true });
  addEventListener("resize", update);
  new ResizeObserver(update).observe(document.body);
  update();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => { translatePage(); mount(); navHeight(); scrollHints(); circuitBackground(); }); else { translatePage(); mount(); navHeight(); scrollHints(); circuitBackground(); }
window.addEventListener("resize", navHeight);

// where the browser forgets the reader's choice between pages (no storage), carry colours, background and language in the links
document.addEventListener("click", ev => {
  if (!window.picVolatileStore) return;
  const a = ev.target.closest && ev.target.closest("a[href]");
  if (!a) return;
  let u;
  try { u = new URL(a.getAttribute("href"), location.href); } catch (e) { return; }
  if (u.origin !== location.origin || !/(\.html|\/)$/.test(u.pathname)) return;
  if (paletteKey() !== "blueorange") u.searchParams.set("palette", paletteKey()); else u.searchParams.delete("palette");
  if (themeKey() === "dark") u.searchParams.set("theme", "dark"); else u.searchParams.delete("theme");
  if (lang() !== "en") u.searchParams.set("lang", lang()); else u.searchParams.delete("lang");
  a.setAttribute("href", u.href);
}, true);

// printing always uses the light background
let printedDark = false;
window.addEventListener("beforeprint", () => { if (themeKey() === "dark") { printedDark = true; setTheme("light", { remember: false }); } });
window.addEventListener("afterprint", () => { if (printedDark) { printedDark = false; setTheme("dark", { remember: false }); } });
