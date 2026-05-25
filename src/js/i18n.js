const I18N_STORAGE_KEY = "app_lang_v1";
const I18N_JP_REGEX = /[ぁ-んァ-ン一-龯]/;
const I18N_ATTRS = ["placeholder", "title", "aria-label"];
const I18N_TEXT_ORIGINAL = new WeakMap();
const I18N_ATTR_ORIGINAL = new WeakMap();
let i18nPhraseKeysCache = null;
let i18nMutationObserver = null;
let i18nObserverPaused = false;

function observeI18nDomChanges() {
  if (!i18nMutationObserver || !document.body) {
    return;
  }
  i18nMutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

function pauseI18nObserver() {
  if (!i18nMutationObserver) {
    return;
  }
  i18nMutationObserver.disconnect();
  i18nObserverPaused = true;
}

function resumeI18nObserver() {
  if (!i18nMutationObserver || !i18nObserverPaused) {
    return;
  }
  observeI18nDomChanges();
  i18nObserverPaused = false;
}

function getAvailableLangs() {
  const dict = window.I18N_DICTIONARY || {};
  return Object.keys(dict);
}

function detectDefaultLanguage() {
  const saved = String(localStorage.getItem(I18N_STORAGE_KEY) || "").trim();
  const langs = getAvailableLangs();
  if (saved && langs.includes(saved)) {
    return saved;
  }
  const browser = String(navigator.language || "ja").toLowerCase();
  return browser.startsWith("ja") ? "ja" : "en";
}

function getCurrentLanguage() {
  const lang = String(window.__APP_LANG__ || "").trim();
  if (lang) {
    return lang;
  }
  return detectDefaultLanguage();
}

function t(key, fallback, vars) {
  const dict = window.I18N_DICTIONARY || {};
  const lang = getCurrentLanguage();
  const byLang = dict[lang] || {};
  const baseJa = dict.ja || {};
  let text = byLang[key] || baseJa[key] || fallback || key;
  if (vars && typeof vars === "object") {
    Object.keys(vars).forEach((k) => {
      text = text.replace(new RegExp(`\\{${k}\\}`, "g"), String(vars[k]));
    });
  }
  return text;
}

function hasJapanese(text) {
  return I18N_JP_REGEX.test(String(text || ""));
}

function getPhraseMap() {
  return window.I18N_PHRASE_MAP || {};
}

function getPhraseKeysDesc() {
  if (i18nPhraseKeysCache) {
    return i18nPhraseKeysCache;
  }
  i18nPhraseKeysCache = Object.keys(getPhraseMap()).sort((a, b) => b.length - a.length);
  return i18nPhraseKeysCache;
}

function translatePhraseText(text, lang) {
  const raw = String(text || "");
  if (!raw) {
    return raw;
  }
  if (lang !== "en") {
    return raw;
  }
  if (!hasJapanese(raw)) {
    return raw;
  }
  const map = getPhraseMap();
  if (map[raw]) {
    return map[raw];
  }
  let out = raw;
  getPhraseKeysDesc().forEach((jp) => {
    if (out.includes(jp)) {
      out = out.split(jp).join(map[jp]);
    }
  });
  return out;
}

function rememberOriginalAttr(el, attr, value) {
  const rec = I18N_ATTR_ORIGINAL.get(el) || {};
  if (!(attr in rec)) {
    rec[attr] = value;
    I18N_ATTR_ORIGINAL.set(el, rec);
  }
}

function applyPhraseTranslationToElement(el, lang) {
  if (!(el instanceof Element)) {
    return;
  }
  I18N_ATTRS.forEach((attr) => {
    if (!el.hasAttribute(attr)) {
      return;
    }
    const cur = el.getAttribute(attr) || "";
    rememberOriginalAttr(el, attr, cur);
    const rec = I18N_ATTR_ORIGINAL.get(el) || {};
    const base = rec[attr] != null ? rec[attr] : cur;
    el.setAttribute(attr, lang === "en" ? translatePhraseText(base, lang) : base);
  });
}

function shouldTranslateTextNode(node) {
  const p = node.parentElement;
  if (!p) {
    return false;
  }
  const tag = p.tagName;
  if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") {
    return false;
  }
  return true;
}

function applyPhraseTranslationToTextNode(node, lang) {
  if (!(node instanceof Text) || !shouldTranslateTextNode(node)) {
    return;
  }
  const cur = node.nodeValue || "";
  if (!I18N_TEXT_ORIGINAL.has(node)) {
    I18N_TEXT_ORIGINAL.set(node, cur);
  }
  const base = I18N_TEXT_ORIGINAL.get(node) || cur;
  node.nodeValue = lang === "en" ? translatePhraseText(base, lang) : base;
}

function translateTreeByPhraseMap(root, lang) {
  const start = root || document.body;
  if (!start) {
    return;
  }
  if (start instanceof Text) {
    applyPhraseTranslationToTextNode(start, lang);
    return;
  }
  if (start instanceof Element) {
    applyPhraseTranslationToElement(start, lang);
  }
  const walker = document.createTreeWalker(start, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    applyPhraseTranslationToTextNode(node, lang);
    node = walker.nextNode();
  }
  if (start instanceof Element) {
    start.querySelectorAll("*").forEach((el) => {
      applyPhraseTranslationToElement(el, lang);
    });
  }
}

function applyTranslations(lang) {
  const nextLang = getAvailableLangs().includes(lang) ? lang : "ja";
  window.__APP_LANG__ = nextLang;
  document.documentElement.lang = nextLang;
  const shouldResume = !!i18nMutationObserver;
  if (shouldResume) {
    pauseI18nObserver();
  }
  try {
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      if (!key) {
        return;
      }
      el.textContent = t(key, el.textContent);
    });

    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      const key = el.getAttribute("data-i18n-placeholder");
      if (!key) {
        return;
      }
      el.setAttribute("placeholder", t(key, el.getAttribute("placeholder") || ""));
    });

    document.querySelectorAll("[data-i18n-title]").forEach((el) => {
      const key = el.getAttribute("data-i18n-title");
      if (!key) {
        return;
      }
      el.setAttribute("title", t(key, el.getAttribute("title") || ""));
    });

    translateTreeByPhraseMap(document.body, nextLang);
  } finally {
    if (shouldResume) {
      resumeI18nObserver();
    }
  }
}

function setLanguage(lang) {
  const nextLang = getAvailableLangs().includes(lang) ? lang : "ja";
  localStorage.setItem(I18N_STORAGE_KEY, nextLang);
  applyTranslations(nextLang);
}

function initLanguageSelector() {
  const select = document.getElementById("languageSelect");
  if (!select || select.dataset.bound === "1") {
    return;
  }
  select.dataset.bound = "1";
  select.value = getCurrentLanguage();
  select.addEventListener("change", () => {
    setLanguage(select.value);
  });
}

function initI18n() {
  const lang = detectDefaultLanguage();
  applyTranslations(lang);
  initLanguageSelector();
  if (!i18nMutationObserver) {
    i18nMutationObserver = new MutationObserver((mutations) => {
      const langNow = getCurrentLanguage();
      pauseI18nObserver();
      try {
        mutations.forEach((m) => {
          if (m.type === "childList") {
            m.addedNodes.forEach((n) => {
              translateTreeByPhraseMap(n, langNow);
            });
          }
        });
      } finally {
        resumeI18nObserver();
      }
    });
    observeI18nDomChanges();
  }
}

window.t = t;
window.applyTranslations = applyTranslations;
window.setAppLanguage = setLanguage;
window.getCurrentAppLanguage = getCurrentLanguage;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initI18n, { once: true });
} else {
  initI18n();
}
