import { Fragment } from 'react'
import { DIRECTIONS } from '@/lib/attackContext'
import { pct, v, type OriginDirectionRow } from '@/lib/stats/matchStats'

// Cross-tab: 7 origin zones (rows) × 3 directions (Hægri/Vinstri/Hvorugt, column
// groups). When `successLabel` is given, each cell shows success/total/% (e.g.
// goals/shots for shots); otherwise each cell is just a count.
export function OriginDirectionTable({ title, rows, successLabel }: {
  title: string
  rows: OriginDirectionRow[]
  successLabel?: string
}) {
  const showRate = !!successLabel
  return (
    <div className="px-2 pb-4">
      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">{title}</p>
      <div className="overflow-x-auto">
        <table className="text-xs border-collapse w-auto">
          <thead>
            <tr className="bg-gray-100 border-b border-gray-300">
              <th className="px-3 py-1.5 text-left text-[10px] font-bold text-gray-600 border-r border-gray-200" />
              {DIRECTIONS.map(d => (
                <th key={d.v} colSpan={showRate ? 3 : 1}
                  className="px-2 py-1 text-center text-[10px] font-bold text-gray-700 bg-gray-100 border-r border-gray-300 whitespace-nowrap">
                  {d.label}
                </th>
              ))}
            </tr>
            {showRate && (
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="border-r border-gray-200" />
                {DIRECTIONS.map(d => (
                  <Fragment key={d.v}>
                    <th className="px-2 py-1 text-center text-[10px] font-medium text-gray-500 whitespace-nowrap">{successLabel}</th>
                    <th className="px-2 py-1 text-center text-[10px] font-medium text-gray-500 whitespace-nowrap">Fjöldi</th>
                    <th className="px-2 py-1 text-center text-[10px] font-medium text-gray-500 border-r border-gray-300 whitespace-nowrap">%</th>
                  </Fragment>
                ))}
              </tr>
            )}
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.zone} className="bg-white border-b border-gray-100">
                <td className="px-3 py-1.5 font-medium text-gray-700 border-r border-gray-200 whitespace-nowrap">{row.label}</td>
                {DIRECTIONS.map(d => {
                  const cell = row.cells[d.v]
                  if (!showRate) {
                    return (
                      <td key={d.v} className={`px-3 py-1.5 text-center border-r border-gray-200 ${cell.total > 0 ? 'text-gray-700 font-semibold' : 'text-gray-300'}`}>
                        {v(cell.total)}
                      </td>
                    )
                  }
                  return (
                    <Fragment key={d.v}>
                      <td className={`px-2 py-1.5 text-center ${cell.success > 0 ? 'text-green-700 font-semibold' : 'text-gray-300'}`}>{v(cell.success)}</td>
                      <td className="px-2 py-1.5 text-center text-gray-500">{v(cell.total)}</td>
                      <td className="px-2 py-1.5 text-center text-gray-600 border-r border-gray-300">{pct(cell.success, cell.total)}</td>
                    </Fragment>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
