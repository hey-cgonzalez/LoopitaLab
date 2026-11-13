import { yarnLetter } from "@loopitalab/pattern-core";
import { groupIssueLines } from "@/lib/studio/issue-groups.ts";
import { LENGTH_SCOPE_NOTE, assumptionText, lengthLabel } from "@/lib/studio/metraje.ts";
import { STUDIO_TEXTS, assumedSampleNote } from "@/lib/studio-texts.ts";
import { PROJECT_TEXTS, gaugeText, motifText, workShapeText } from "@/lib/projects/texts.ts";
import type { KnitPreview } from "@/lib/projects/types.ts";
import type { LengthAssumption } from "@loopitalab/yarn-catalog";

const T = PROJECT_TEXTS.tejer;

/**
 * Pantalla previa a "Tejer este diseño" (ADR 0009, T1-7; caso F3-39). Presentación pura de lo que devuelve
 * `getKnitPreview`: nada se calcula aquí (muestra de `gaugeInUse`, metraje de `yarnUsage` + `estimateYarnLength`,
 * advertencias de `validatePattern`, filas de `planChart`). Se prueba con `renderToStaticMarkup`.
 */
export function KnitPreviewView({ preview }: { preview: KnitPreview }) {
  const { gauge, shape, yarns, warnings, technique } = preview;
  const lines = groupIssueLines(warnings, {
    workedIn: shape.workedIn,
    // La vista previa del servidor no trae el id de paleta: se nombra la lana por su letra, sin afirmar su color.
    yarnLabel: (i) => `la lana ${yarnLetter(i)}`,
  });
  const assumptions = new Set<LengthAssumption>();
  for (const y of yarns) for (const a of y.length?.assumptions ?? []) assumptions.add(a);
  const order: LengthAssumption[] = ["assumed_gauge", "low_confidence_weight", "loop_factor", "float_slack", "waste_margin"];

  return (
    <div className="grid gap-4" data-testid="knit-preview">
      <section aria-labelledby="kp-forma" className="grid gap-1">
        <h3 id="kp-forma" className="font-bold">
          {T.formaDeTrabajo}
        </h3>
        <p data-testid="knit-preview-shape">{workShapeText(shape.workedIn, shape.direction, shape.renderAs, shape.totalRows)}</p>
        {shape.flatAndSewn ? (
          <p className="font-bold" data-testid="knit-preview-sewn">
            {T.idaYVueltaYCose}
          </p>
        ) : null}
        <p className="text-sm text-tinta-suave" data-testid="knit-preview-motif">
          {motifText(shape.motif.width, shape.motif.height, shape.repeat.x, shape.repeat.y)}
        </p>
      </section>

      <section aria-labelledby="kp-muestra" className="grid gap-1">
        <h3 id="kp-muestra" className="font-bold">
          {T.muestra}
        </h3>
        {gauge ? (
          <>
            <p data-testid="knit-preview-gauge">{gaugeText(gauge, shape.workedIn)}</p>
            {gauge.assumed ? (
              <p className="text-sm text-tinta-suave">
                {T.muestraSupuestaAyuda} {assumedSampleNote(gauge.lowConfidence)}
              </p>
            ) : (
              <p className="text-sm text-tinta-suave">{T.muestraPropia}.</p>
            )}
          </>
        ) : (
          <p className="text-sm font-bold">{STUDIO_TEXTS.metraje.sinMuestra}</p>
        )}
      </section>

      <section aria-labelledby="kp-metraje" className="grid gap-1">
        <h3 id="kp-metraje" className="font-bold">
          {T.metraje}
        </h3>
        {technique === "crochet" ? (
          <p className="text-sm font-bold" data-testid="knit-preview-no-length">
            {T.metrajeCrochet}
          </p>
        ) : (
          <>
            <ul className="grid gap-1.5" aria-label={STUDIO_TEXTS.metraje.lista}>
              {yarns.map((y, i) => (
                <li key={y.id} className="grid gap-0.5 rounded-xl border-2 border-linea px-2.5 py-1.5 text-sm" data-testid="knit-preview-yarn">
                  <span className="flex items-center gap-2 font-bold">
                    <span aria-hidden="true" className="inline-block size-4 shrink-0 rounded border-2 border-marino" style={{ backgroundColor: y.hex }} />
                    {STUDIO_TEXTS.metraje.lana} {yarnLetter(i)}
                  </span>
                  <span className="text-tinta-suave">
                    {y.stitches.toLocaleString("es-CL")} {y.stitches === 1 ? STUDIO_TEXTS.unidades.punto : STUDIO_TEXTS.unidades.puntos}
                  </span>
                  <span className="font-bold">{y.length ? lengthLabel(y.length) : STUDIO_TEXTS.metraje.sinEstimacion}</span>
                </li>
              ))}
            </ul>
            {assumptions.size > 0 ? (
              <div className="grid gap-1 text-sm">
                <p className="font-bold">{STUDIO_TEXTS.metraje.supuestos}</p>
                <ul className="grid list-disc gap-1 pl-5">
                  {order.filter((a) => assumptions.has(a)).map((a) => (
                    <li key={a}>{assumptionText(a)}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <p className="text-sm text-tinta-suave">{LENGTH_SCOPE_NOTE}</p>
          </>
        )}
      </section>

      {lines.length > 0 ? (
        <section aria-labelledby="kp-avisos" className="grid gap-1 rounded-xl border-2 border-mostaza px-3 py-2" data-testid="knit-preview-warnings">
          <h3 id="kp-avisos" className="font-bold">
            {T.advertencias}
          </h3>
          <ul className="grid list-disc gap-1 pl-5 text-sm">
            {lines.map((l) => (
              <li key={l.key} data-issue-code={l.code}>
                {l.text}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="kp-fuera" className="grid gap-1">
        <h3 id="kp-fuera" className="font-bold">
          {T.noEnGrafico}
        </h3>
        <ul className="grid list-disc gap-0.5 pl-5 text-sm" data-testid="knit-preview-not-in-chart">
          {preview.notInChart.map((k) => (
            <li key={k}>{PROJECT_TEXTS.noEnGrafico[k]}</li>
          ))}
        </ul>
      </section>

      <p className="rounded-xl border-2 border-mostaza px-3 py-2 text-sm" data-testid="knit-preview-prototype">
        <strong>{STUDIO_TEXTS.prototipo.etiqueta}.</strong> {T.prototipo}
      </p>
    </div>
  );
}
