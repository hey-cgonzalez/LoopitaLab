# @loopitalab/yarn-catalog

Grosores CYC 0 a 7, fibras y paleta propia (48 colores, 8 familias). Sin marcas (regla de oro 9) y sin dependencias (ADR 0002). Los datos viven en `data/*.json`, con su fuente dentro de cada archivo; las tiendas chilenas son solo referencia de terminología y quedan como alias en `fuentesAlias`.

## API

- `WEIGHTS`, `FIBERS`, `PALETTE`, `weightInfo`, `weightLabel`, `suggestedGauge(cat, technique)`: la muestra sugerida es un supuesto; la de la usuaria manda.
- `hexToLab`, `deltaE2000` (CIEDE2000), `nearestPaletteColor(hex)` y `nearestPaletteColors(hex, k)` (de menor a mayor diferencia; empates por orden de la paleta).
- `NEAR_COLOR_DELTA_E = 2.3`: bajo ese valor un color personalizado se rotula "prácticamente igual". Un hex que no es de la paleta nunca lleva `paletteId`.
- `findWeights(query)`: búsqueda sin tildes ni mayúsculas, mínimo 2 caracteres, prefijo de palabra, una entrada por categoría con la mejor coincidencia, exactas primero y luego por categoría. Toda coincidencia por alias es `approximate: true`. "light" da las categorías 2 (alias) y 3 (inglés). Cualquier "ply" da `[]`.
- `weightQueryHint(query)`: `"too_short"`, `"ply_varies_by_country"` o `undefined`.
- `estimateYarnLength(usage, gauge, opts)`: convierte la salida de `yarnUsage` (pattern-core) a metros. Recibe números, no importa pattern-core.

## Metraje

```
m = (puntos × 3,8 + flotantes × 1,1) × (10 / puntos en 10 cm) × 1,10 / 100
meters = ceil(m / 5) × 5     low = floor(0,85 m / 5) × 5 (mínimo 5)     high = ceil(1,2 m / 5) × 5
```

Todo en 0 si m = 0. Crochet devuelve `undefined`. Nunca gramos ni ovillos. Solo del gráfico: no incluye elástico, montaje ni remate. Los supuestos usados salen en `assumptions` (`assumed_gauge`, `low_confidence_weight`, `loop_factor`, `float_slack` solo si hay flotantes, `waste_margin`).

Constantes en `YARN_LENGTH_ASSUMPTIONS`. La lazada 3,8 es Munden Kw = 3,8 (lana, punto liso, seco-relajado; en húmedo-relajado 4,1): Munden, D. L., "The geometry and dimensional properties of plain-knit fabrics", J. Text. Inst. 50(7), 1959, 448-471, citado vía resumen secundario (no se abrió el original). La holgura 1,1, el margen 10 % y el rango 0,85 a 1,2 son supuestos pendientes de validar con tejedora (comparar con 2 o 3 proyectos terminados).

## Pruebas

`node --test "test/**/*.test.ts"`. Propiedades con semilla (`test/support/property.ts`, copia de la de pattern-core): `SEED=7 node --test ...` reproduce una corrida.
