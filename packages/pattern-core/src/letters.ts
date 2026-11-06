/**
 * Letra de una lana según su orden en el documento: A, B, C… Z y, desde la 27, dos
 * letras como las columnas de una planilla (AA, AB… AZ, BA…). Es la que usan el
 * validador (`yarnLabel`), el gráfico SVG, la cuadrícula del editor y el modo tejiendo.
 *
 * Desde la 27 no se usa el número de la lana: en el gráfico se confundiría con la
 * numeración de filas (QA O3, T7b). Validar con experto-tejido.
 *
 * `index` es la posición en `yarns` (desde 0). Un índice no entero o negativo devuelve
 * "?" (nunca lanza).
 */
export function yarnLetter(index: number): string {
  if (!Number.isSafeInteger(index) || index < 0) return "?";
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}
