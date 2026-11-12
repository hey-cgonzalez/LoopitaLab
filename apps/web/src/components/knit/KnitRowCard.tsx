import { yarnLetter, type Yarn } from "@loopitalab/pattern-core";
import type { ChartPlan, ChartPointer, ChartPosition } from "@loopitalab/follow";
import { inkFor } from "@/lib/studio/color.ts";
import { PROJECT_TEXTS, cellCounterText, finishedText, repeatCounterText, repeatDotText, rowCounterText, sideAndReadingText } from "@/lib/projects/texts.ts";

const T = PROJECT_TEXTS.tejiendo;

export interface KnitRowCardProps {
  plan: ChartPlan;
  position: ChartPosition;
  /** Puntero acotado: `stitchesDone` son las casillas hechas de la fila actual (T1-5). */
  pointer: ChartPointer;
  yarns: readonly Yarn[];
  direction: "bottom_up" | "top_down";
  /** `stepAt(plan, totalRows − 1).stitches` para el texto de "Gráfico terminado" (F3-7); lo calcula quien llama con `follow`. */
  lastRowStitches: number | null;
}

/**
 * Tarjeta de la fila actual (T12): contador grande "Vuelta N de M" / "Fila N de M", lado y sentido, tramos de una
 * repetición ("3 A · 2 B") con los colores como se ven por el derecho, repetición en curso resaltada y "casilla N de M"
 * cuando la fila tiene disminuciones (T1-5). Presentación pura: todo viene de `follow`.
 */
export function KnitRowCard({ plan, position, pointer, yarns, direction, lastRowStitches }: KnitRowCardProps) {
  const step = position.step;
  if (!step) {
    return (
      <section aria-labelledby="knit-row-title" className="grid gap-2 rounded-2xl border-2 border-exito bg-superficie p-4" data-testid="knit-finished">
        <h2 id="knit-row-title" className="font-display text-3xl font-bold sm:text-4xl">
          {T.graficoTerminado}
        </h2>
        <p>{finishedText(plan.workedIn, direction, lastRowStitches)}</p>
      </section>
    );
  }
  const rep = position.horizontalRepeat;
  const stitchesDone = pointer.stitchesDone;
  return (
    <section aria-labelledby="knit-row-title" className="grid gap-2 rounded-2xl border-2 border-marino bg-superficie p-4" data-testid="knit-row">
      <h2 id="knit-row-title" className="font-display text-3xl font-bold sm:text-4xl" data-testid="knit-row-counter">
        {rowCounterText(plan.workedIn, step.number, plan.totalRows)}
      </h2>
      <p className="text-lg" data-testid="knit-row-side">
        {sideAndReadingText(step.side, step.reading)}
        {plan.mirror ? ` · ${T.espejo}` : ""}
      </p>
      {step.side === "wrong" ? (
        <p className="text-sm text-tinta-suave" data-testid="knit-wrong-side-note">
          {T.coloresDelDerecho}
        </p>
      ) : null}
      {step.stitches === 0 ? (
        <p className="font-bold">{T.sinPuntos(plan.workedIn)}</p>
      ) : (
        <>
          <ol className="flex flex-wrap gap-2" aria-label={T.tramos} data-testid="knit-runs">
            {step.runs.map((r, i) => {
              const hex = yarns[r.yarn]?.color.hex ?? "#FFFFFF";
              return (
                // Doble borde (marino por fuera, blanco por dentro): el tramo se ve sobre cualquier lana, clara u oscura.
                // La letra de la lana va siempre en el tramo: el color nunca es lo único que lo identifica.
                <li key={`${i}-${r.yarn}`} className="rounded-xl border-2 border-marino px-3 py-1.5 text-2xl font-bold shadow-[inset_0_0_0_2px_#fff]" style={{ backgroundColor: hex, color: inkFor(hex) }}>
                  {r.count} {yarnLetter(r.yarn)}
                </li>
              );
            })}
          </ol>
          {rep ? (
            <p className="text-lg" data-testid="knit-repeat">
              {plan.repeatX > 1 ? (
                <>
                  <span className="font-bold">{repeatCounterText(rep.index, rep.of)}</span>
                  <span className="text-tinta-suave"> · {T.puntosPorRepeticion(step.stitchesPerRepeat)}, {T.enLa(plan.workedIn, step.stitches)}</span>
                </>
              ) : (
                <span className="text-tinta-suave">{T.puntosEnLa(plan.workedIn, step.stitches)}</span>
              )}
            </p>
          ) : null}
          {step.change < 0 ? (
            <p className="text-lg" data-testid="knit-cell-counter">
              <span className="font-bold">{cellCounterText(stitchesDone, step.stitches)}</span>
              <span className="text-tinta-suave"> · {T.puntosMenos(Math.abs(step.change))}</span>
            </p>
          ) : null}
          {plan.repeatX > 1 && rep ? (
            <ol className="flex flex-wrap gap-1.5" aria-label={T.repeticionesDeFila(plan.workedIn)} data-testid="knit-repeat-dots">
              {Array.from({ length: rep.of }, (_, i) => (
                <li key={i} aria-current={i === rep.index ? "step" : undefined} className="flex">
                  {/* La forma no depende del color: hecha = con ✓, actual = anillo grueso, por hacer = vacía. */}
                  <span
                    aria-hidden="true"
                    className={`flex size-6 items-center justify-center rounded-full border-2 border-marino text-xs font-bold leading-none ${i < rep.index ? "bg-marino text-white" : i === rep.index ? "bg-mostaza text-marino ring-2 ring-marino ring-offset-2" : "bg-superficie"}`}
                  >
                    {i < rep.index ? "✓" : ""}
                  </span>
                  <span className="sr-only">{repeatDotText(i, rep.index)}</span>
                </li>
              ))}
            </ol>
          ) : null}
        </>
      )}
    </section>
  );
}
