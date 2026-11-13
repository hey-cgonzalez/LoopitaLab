import type { ChartPlan } from "@loopitalab/follow";
import { stepAt } from "@loopitalab/follow";
import { PROJECT_TEXTS, runsText, sideAndReadingText } from "@/lib/projects/texts.ts";

const T = PROJECT_TEXTS.tejiendo;

/**
 * Alternativa en texto del gráfico (T13, CA3-A1): una tabla con una fila por paso, tal como los entrega `follow`
 * (lado, sentido, puntos y tramos de una repetición). La fila actual lleva `aria-current` y texto visible. Presentación
 * pura: no cuenta nada. Va dentro de un `<details>` cerrado para no cargar a quien ve el gráfico.
 */
export function KnitChartText({ plan, currentRow }: { plan: ChartPlan; currentRow: number | null }) {
  const rows = [];
  for (let i = 0; i < plan.totalRows; i++) {
    const s = stepAt(plan, i);
    if (s) rows.push(s);
  }
  return (
    <details className="rounded-xl border-2 border-linea px-3 py-2" data-testid="knit-chart-text">
      <summary className="min-h-11 cursor-pointer py-2 font-bold">{T.graficoEnTexto}</summary>
      <p className="text-sm text-tinta-suave">{T.graficoEnTextoAyuda}</p>
      <div className="mt-2 max-h-80 overflow-auto" tabIndex={0} role="region" aria-label={T.graficoTablaTitulo}>
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{T.graficoTablaTitulo}</caption>
          <thead>
            <tr>
              <th scope="col" className="pr-3">
                {plan.workedIn === "rounds" ? T.columnaVuelta : T.columnaFila}
              </th>
              <th scope="col" className="pr-3">
                {T.columnaLado}
              </th>
              <th scope="col" className="pr-3">
                {T.columnaPuntos}
              </th>
              <th scope="col">{T.columnaColores}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.row} aria-current={s.row === currentRow ? "true" : undefined} className={s.row === currentRow ? "font-bold underline decoration-2 underline-offset-4" : undefined}>
                <th scope="row" className="pr-3 font-bold">
                  {s.number}
                  {s.row === currentRow ? <span className="sr-only"> {T.filaActualTexto}</span> : null}
                </th>
                <td className="pr-3">{sideAndReadingText(s.side, s.reading)}</td>
                <td className="pr-3">{s.stitches}</td>
                <td>{runsText(s.runs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
