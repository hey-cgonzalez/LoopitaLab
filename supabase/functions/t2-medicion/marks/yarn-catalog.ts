// Se evalúa justo después de `yarn-catalog` (orden de los imports de index.ts): mide su evaluación.
import { marks } from "./boot.ts";
marks.push(["yarn-catalog", performance.now()]);
