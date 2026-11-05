# @loopitalab/pattern-core

Modelo canónico de patrones, motor determinista y validador. Sin dependencias: corre igual en el navegador, en Next.js y en las Edge Functions de Supabase. Ver [ADR 0001](../../docs/adr/0001-modelo-canonico.md) y [ADR 0002](../../docs/adr/0002-nucleo-sin-dependencias.md).

## Qué hace

| Módulo | Funciones principales |
|---|---|
| `types.ts` | Tipos del modelo: `Pattern` (gráfico o escrito), `Yarn`, `Chart`, `Part`, `Round`, `Item`, `Issue` |
| `stitches.ts` | Tabla de puntos con cuánto consume y produce cada uno; abreviaturas en español (Chile) e inglés (US) |
| `written.ts` | `countRound`, `expandRound`, `concreteRounds`, `summarizePart` |
| `chart.ts` | `cellIndex`, `motifCell`, `fullSize`, `cellAt`, `fullRow`, `yarnTotals`, `stitchTotal`, `rowFloats`, `dimensionsCm`, `floatLengthCm` |
| `text.ts` | `parseRound`, `parsePart`, `formatRound`, `formatPart` |
| `validate.ts` | `validatePattern`, `parsePattern`, `LIMITS` |

## Sintaxis del patrón escrito

```
Parte: Bolita
Inicio: AM
Construcción: espiral
Lana: A
V1: 6 pb en AM (6)
V2: aum x6 (12)
V3: [pb, aum] x6 (18)
V4: [pb 2, aum] x6 (24)
V5-8: 24 pb (24)
V9: @B, [pb 2, dism] x6 (18)
```

- Cantidades: `6 pb`, `pb 6` o `pb x6`.
- Grupos: `[ … ] x6` o `[ … ] 6 veces`, y se pueden anidar.
- Cambio de lana: `@B`.
- Hebra trasera o delantera: `pb ht` / `sc blo`, `pb hd` / `sc flo`.
- Conteo declarado: `(18)` al final de la vuelta.
- También acepta inglés (`R3: [sc, inc] x6 (18)`) y mezclas de ambos.

## Qué valida

- **Errores**:
  - conteo declarado distinto del real;
  - una vuelta que trabaja sobre más o menos puntos de los que dejó la anterior (en espiral y vueltas cerradas);
  - numeración de vueltas;
  - lanas inexistentes;
  - composición que no suma 100 %;
  - grosor fuera de 0–7;
  - colores mal escritos;
  - celdas del gráfico con lanas que no existen;
  - entradas desmedidas.
- **Advertencias**:
  - hebras flotantes largas en colorwork a palillo (2,5 cm según la muestra, o 5 puntos sin muestra);
  - descuadres en piezas en hileras;
  - filas vacías;
  - patrones de IA sin el modelo registrado.
- **Información**: filas con más de 2 colores, vueltas sin conteo declarado y lanas que no se usan.

Nunca lanza excepciones: acepta cualquier JSON (por ejemplo, propuesto por la IA) y devuelve `{ valid, issues }`, con mensajes en español.

## Pruebas

```
node --test "test/**/*.test.ts"
```

Requiere Node 24 LTS (mínimo 22.18, que ejecuta TypeScript directamente). Incluye pruebas de propiedades con semilla: si una falla, el mensaje indica `SEED=…` para reproducirla.

## Limitaciones conocidas (v1)

- Los patrones escritos son solo de crochet; el palillo se diseña con gráfico.
- `aum`, `aum3` y `dism` cuentan igual con cualquier punto, pero el render los dibuja como punto bajo.
- Inicio en óvalo (trabajar ambos lados de la cadeneta) todavía no tiene regla de consumo propia.
- Abreviaturas provisionales pendientes de validar con tejedoras: `aum3`, `ht`/`hd` (hebra trasera o delantera) y `saltar`.
