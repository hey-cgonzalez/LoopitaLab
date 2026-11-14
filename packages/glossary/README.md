# @loopitalab/glossary

Terminología de los patrones en español (Chile), inglés de EE. UU. (US) e inglés del Reino Unido (UK). Es la fuente de los nombres que muestra la interfaz (ADR 0011, sección 8).

**Todo término está en estado `"pendiente"`**: falta validarlo con una tejedora real (regla de oro 5, T1b). La interfaz debe rotular la terminología como pendiente de validación.

## Qué contiene y qué no

- **Las abreviaturas de los puntos no están aquí.** Con ellas se lee y se escribe un patrón, y viven solo en `packages/pattern-core/src/stitches.ts` (`STITCHES`, `stitchAbbrev`). Este paquete las importa y agrega los nombres completos, los términos y el estado de validación.
- Términos: casilla, vuelta, fila, muestra, anillo mágico, cadeneta base, espiral, vueltas cerradas, aumento, disminución, disminución invisible, relleno, cantidad, cierre, parte, y además **cadeneta de subida, pd de unión y cadeneta de giro**, que **no cuentan como puntos** y no se escriben como ítems (enmienda C-21).
- Sin variantes regionales del español sin respaldo (F4-69): no hay "medio punto", "pma" ni "punto raso".
- Sin marcas ni nombres de tienda (regla de oro 9). Una prueba lo revisa (CA4-G4).
- Es la terminología de los patrones, no la traducción de la interfaz.

## API

```ts
import { term, termDefinition, termEntry, stitchLabel, stitchLabels, roundWord, localeFor, TERMS } from "@loopitalab/glossary";

term("magic_ring", "es");                 // "anillo mágico"
term("round", "en-GB", { plural: true }); // "rounds"
termDefinition("fasten_off", "en-US");    // definición breve
stitchLabel("sc", "uk");                  // { abbrev: "dc", name: "double crochet", status: "pendiente" }
roundWord("flat", "es");                  // "fila"
```

| Función | Qué hace |
|---|---|
| `term(key, locale, { plural? })` | Nombre del término. Sin plural definido devuelve el singular; con clave desconocida, la clave |
| `termDefinition(key, locale)` | Definición breve |
| `termEntry(key)` | Entrada completa (`TermEntry`: textos, alias, estado, nota) |
| `stitchLabel(code, dialect)` | `{ abbrev, name, status }` de un punto; `abbrev` sale de `pattern-core` |
| `stitchLabels(dialect)` | Rótulos de todos los puntos |
| `roundWord(construction, locale, { plural? })` | "vuelta" (`spiral`, `joined`, `rounds`) o "fila" (`flat`, `rows`) |
| `localeFor(dialect)` | `"es"` -> `"es"`, `"us"` -> `"en-US"`, `"uk"` -> `"en-GB"` |
| `TERMS` | Todos los términos |

Los dialectos son los de `pattern-core`: `"es" | "us" | "uk"`. El dialecto de la usuaria se guarda en `profiles.pattern_dialect`.

## Pruebas

```
pnpm --filter @loopitalab/glossary test
```

- **CA4-G1**: cada código de `STITCHES` tiene abreviatura y nombre en los tres dialectos; todos los términos están "pendiente"; están los términos de amigurumi y los de C-21.
- **CA4-G4**: ningún dato ni archivo fuente contiene marcas ni nombres de tienda.

## Pendientes

- `TODO(verificar)`: los nombres en inglés de varios términos (espiral, vueltas cerradas, cantidad, cadeneta de subida, pd de unión, cadeneta de giro) y las definiciones, con una tejedora (T1b).
- Variantes regionales del español: se agregan solo con lo que entregue `experto-tejido`, en estado "pendiente".
