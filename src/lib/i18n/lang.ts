import { create } from 'zustand'

// ─── Language ─────────────────────────────────────────────────────────────────
// Two languages, chosen per device. The choice is remembered in localStorage;
// a first visit follows the browser (Icelandic browsers get Icelandic).

export type Lang = 'en' | 'is'

const LANG_KEY = 'handball_stats_lang'

function detectLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY)
    if (saved === 'en' || saved === 'is') return saved
  } catch { /* storage blocked — fall through to the browser */ }
  const nav = typeof navigator !== 'undefined' ? navigator.language.toLowerCase() : 'en'
  return nav.startsWith('is') ? 'is' : 'en'
}

/** Product name in each language. Used by the wordmark, titles and copy. */
export const PRODUCT_NAME: Record<Lang, string> = {
  en: 'Handball Stats',
  is: 'Handboltatölfræði',
}

function applyToDocument(lang: Lang) {
  if (typeof document === 'undefined') return
  document.documentElement.lang = lang
  document.title = PRODUCT_NAME[lang]
}

interface LangState {
  lang: Lang
  setLang: (lang: Lang) => void
}

export const useLang = create<LangState>((set) => {
  const initial = detectLang()
  applyToDocument(initial)
  return {
    lang: initial,
    setLang: (lang) => {
      try { localStorage.setItem(LANG_KEY, lang) } catch { /* not persisted, still switches */ }
      applyToDocument(lang)
      set({ lang })
    },
  }
})

/**
 * Pick the text for the current language from a pair.
 *   const t = useT();  t({ en: 'Sign in', is: 'Skrá inn' })
 * Keeping both languages side by side at the call site means a string can
 * never exist in one language only.
 */
export type Text = Record<Lang, string>

export function useT() {
  const lang = useLang(s => s.lang)
  return (text: Text) => text[lang]
}
