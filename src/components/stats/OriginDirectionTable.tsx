import { Fragment } from 'react'
import { DIRECTIONS } from '@/lib/attackContext'
import { pct, v, type OriginDirectionRow } from '@/lib/stats/matchStats'
import { useT } from '@/lib/i18n/lang'
import { T } from '@/lib/i18n/terms'

// Cross-tab: 7 origin zones (rows) × 3 directions (column groups). When
// `successLabel` is given, each cell shows success/total/% (e.g. goals/shots);
// otherwise each cell is just a count.
export function OriginDirectionTable({ title, rows, successLabel }: {
  title: string
  rows: OriginDirectionRow[]
  successLabel?: string
}) {
  const t = useT()
  const showRate = !!successLabel
  const edge = 'border-l border-line'
  return (
    <section className="bg-white border border-line rounded-lg overflow-hidden">
      <h3 className="px-4 pt-3 pb-2 text-[15px] font-medium">{title}</h3>
      <div className="overflow-x-auto">
        <table className="text-[13px] border-collapse w-auto num">
          <thead>
            <tr>
              <th className="px-4 pb-1 text-left text-[12px] font-normal text-muted min-w-[140px]" />
              {DIRECTIONS.map(d => (
                <th key={d.v} colSpan={showRate ? 3 : 1} className={`px-3 pb-1 text-left text-[12px] font-medium text-ink whitespace-nowrap ${edge}`}>
                  {t(d.label)}
                </th>
              ))}
            </tr>
            {showRate && (
              <tr className="border-b border-line">
                <th />
                {DIRECTIONS.map(d => (
                  <Fragment key={d.v}>
                    <th className={`px-3 pb-2 text-right text-[12px] font-normal text-muted whitespace-nowrap ${edge}`}>{successLabel}</th>
                    <th className="px-3 pb-2 text-right text-[12px] font-normal text-muted whitespace-nowrap">{t(T.count)}</th>
                    <th className="px-3 pb-2 text-right text-[12px] font-normal text-muted whitespace-nowrap">%</th>
                  </Fragment>
                ))}
              </tr>
            )}
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.zone} className="border-t border-[#eef0f2]">
                <td className="px-4 py-2 font-medium whitespace-nowrap">{t(row.label)}</td>
                {DIRECTIONS.map(d => {
                  const cell = row.cells[d.v]
                  if (!showRate) {
                    return <td key={d.v} className={`px-3 py-2 text-right ${edge} ${cell.total > 0 ? 'text-ink font-medium' : 'text-[#9aa0a8]'}`}>{v(cell.total)}</td>
                  }
                  return (
                    <Fragment key={d.v}>
                      <td className={`px-3 py-2 text-right ${edge} ${cell.success > 0 ? 'text-ink font-medium' : 'text-[#9aa0a8]'}`}>{v(cell.success)}</td>
                      <td className={`px-3 py-2 text-right ${cell.total > 0 ? 'text-ink' : 'text-[#9aa0a8]'}`}>{v(cell.total)}</td>
                      <td className="px-3 py-2 text-right text-muted">{pct(cell.success, cell.total)}</td>
                    </Fragment>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
