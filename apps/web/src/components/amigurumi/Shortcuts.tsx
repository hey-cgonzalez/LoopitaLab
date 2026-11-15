import { AMIGURUMI_TEXTS } from "@/lib/amigurumi/texts.ts";

const A = AMIGURUMI_TEXTS.a11y;

/** Atajos de teclado del estudio, documentados a la vista (T17; WCAG 2.1.1 y 3.3.5). */
export function Shortcuts() {
  return (
    <details className="rounded-xl border-2 border-linea bg-superficie px-3 py-2 text-sm" data-testid="shortcuts">
      <summary className="cursor-pointer font-bold">{A.atajosTitulo}</summary>
      <ul className="mt-2 grid list-disc gap-1 pl-5 text-tinta-suave">
        {A.atajos.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </details>
  );
}
