// Small helpers shared by the index panel and the index editor.
import { useT, type Text } from '@/lib/i18n/lang'
import type { IndexDef, Label } from '@/lib/stats/indexDefs'

/** Built-in names are bilingual; names a user typed are shown as typed. */
export function useLabel() {
  const t = useT()
  return (l: Label) => (typeof l === 'string' ? l : t(l))
}

export function colourNote(def: Pick<IndexDef, 'green' | 'yellow' | 'higherIsBetter'>, t: (x: Text) => string) {
  return def.higherIsBetter
    ? t({ en: `Green from ${def.green}, yellow from ${def.yellow}, red below ${def.yellow}.`, is: `Grænt frá ${def.green}, gult frá ${def.yellow}, rautt undir ${def.yellow}.` })
    : t({ en: `Lower is better: green up to ${def.green}, yellow up to ${def.yellow}, red above ${def.yellow}.`, is: `Lægra er betra: grænt upp að ${def.green}, gult upp að ${def.yellow}, rautt yfir ${def.yellow}.` })
}
