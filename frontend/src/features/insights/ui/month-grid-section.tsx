import { MONTH_NAMES, type MonthRow } from "../utils/month-grid.js";

const LEGEND = [
  [1, "Under 60%"],
  [2, "60–69%"],
  [3, "70–79%"],
  [4, "80% or more"],
] as const;

export function MonthGridSection({ rows }: { rows: MonthRow[] }) {
  return (
    <section className="insights-card" aria-labelledby="insights-months-title">
      <h2 id="insights-months-title">Good days by month</h2>
      <p className="insights-help">The share of days you scored good or rad.</p>
      <table className="insights-months">
        <caption className="sr-only">Good-day share by month</caption>
        <thead>
          <tr>
            <th scope="col">
              <span className="sr-only">Year</span>
            </th>
            {MONTH_NAMES.map((name) => (
              <th key={name} scope="col">
                {name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.year}>
              <th scope="row">{row.year}</th>
              {row.cells.map((cell, index) =>
                cell ? (
                  <td
                    key={MONTH_NAMES[index]}
                    className={`insights-share-${cell.bin}`}
                    title={cell.title}
                  >
                    <span className="insights-cell-text">{cell.percent}%</span>
                  </td>
                ) : (
                  <td key={MONTH_NAMES[index]}>
                    <span className="sr-only">No recorded days</span>
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="insights-legend">
        {LEGEND.map(([bin, label]) => (
          <li key={bin}>
            <i className={`insights-share-${bin}`} aria-hidden="true" />
            {label}
          </li>
        ))}
      </ul>
    </section>
  );
}
