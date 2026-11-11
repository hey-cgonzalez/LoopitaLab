import { yarnLetter, type Yarn } from "@loopitalab/pattern-core";
import type { ChartPlan, ChartPointer, ChartPosition } from "@loopitalab/follow";
import { inkFor } from "@/lib/studio/color.ts";
import { PROJECT_TEXTS, cellCounterText, finishedText, repeatCounterText, rowCounterText, sideAndReadingText } from "@/lib/projects/texts.ts";

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
        <p className="font-bold">{T.sinPuntos}</p>
      ) : (
        <>
          <ol className="flex flex-wrap gap-2" aria-label={T.tramos} data-testid="knit-runs">
            {step.runs.map((r, i) => {
              const hex = yarns[r.yarn]?.color.hex ?? "#FFFFFF";
              return (
                <li key={`${i}-${r.yarn}`} className="rounded-xl border-2 border-marino px-3 py-1.5 text-2xl font-bold" style={{ backgroundColor: hex, color: inkFor(hex) }}>
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
                  <span className="text-tinta-suave"> · {step.stitchesPerRepeat} puntos por repetición, {step.stitches} en la {plan.workedIn === "rounds" ? "vuelta" : "fila"}</span>
                </>
              ) : (
                <span className="text-tinta-suave">{step.stitches} puntos en la {plan.workedIn === "rounds" ? "vuelta" : "fila"}</span>
              )}
            </p>
          ) : null}
          {step.change < 0 ? (
            <p className="text-lg" data-testid="knit-cell-counter">
              <span className="font-bold">{cellCounterText(stitchesDone, step.stitches)}</span>
              <span className="text-tinta-suave"> · {Math.abs(step.change)} {Math.abs(step.change) === 1 ? "punto menos" : "puntos menos"} que la anterior</span>
            </p>
          ) : null}
          {plan.repeatX > 1 && rep ? (
            <ol className="flex flex-wrap gap-1" aria-label="Repeticiones de esta fila" data-testid="knit-repeat-dots">
              {Array.from({ length: rep.of }, (_, i) => (
                <li key={i} aria-current={i === rep.index ? "step" : undefined} className={`size-4 rounded-full border-2 border-marino ${i < rep.index ? "bg-marino/40" : i === rep.index ? "bg-mostaza" : "bg-superficie"}`} aria-label={`repetición ${i + 1}${i === rep.index ? " (actual)" : i < rep.index ? " (hecha)" : ""}`} />
              ))}
            </ol>
          ) : null}
        </>
      )}
    </section>
  );
}
