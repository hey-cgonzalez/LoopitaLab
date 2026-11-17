// Se evalúa justo después de `ai-router` (orden de los imports de index.ts): mide su evaluación.
import { marks } from "./boot.ts";
marks.push(["ai-router", performance.now()]);
