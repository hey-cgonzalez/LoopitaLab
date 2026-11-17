// Se evalúa justo después de `pattern-core` (orden de los imports de index.ts): mide su evaluación.
import { marks } from "./boot.ts";
marks.push(["pattern-core", performance.now()]);
