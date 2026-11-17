// Se evalúa justo después de `image-chart` (orden de los imports de index.ts): mide su evaluación.
import { marks } from "./boot.ts";
marks.push(["image-chart", performance.now()]);
