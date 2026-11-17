// Se evalúa justo después de `jsquash` (orden de los imports de index.ts): mide su evaluación.
import { marks } from "./boot.ts";
marks.push(["jsquash", performance.now()]);
