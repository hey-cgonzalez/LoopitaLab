# QA de la fase 5

## Puerta T2

Puerta de viabilidad de las Supabase Edge Functions para la ruta imagen → patrón (roadmap, fase 5, T2; [ADR 0012](adr/0012-pipeline-imagen-a-patron.md), sección 7; [ADR 0013](adr/0013-subidas-y-storage.md), sección 8; riesgos R5-1, R5-2, R5-8 y R5-16).

- **Autor**: `devops`, 2026-11-16. Rama `fase-5/grupo-a`, sin commit.
- **Estado**: **verde en local, provisional**. Se cierra cuando la usuaria despliegue `t2-medicion` en el proyecto desechable `loopitalab-t2-desechable` y corra `scripts/t2-invocar.sh` (ver [Lo que falta medir desplegado](#lo-que-falta-medir-desplegado)).
- **Entorno local**: Apple M1 (8 núcleos, 8 GB), macOS 15.6.1, Docker Desktop 29.9.2 (8 CPU y 4 GB para la VM), Node 24.16.0, Supabase CLI 2.122.1, `supabase-edge-runtime-1.77.8 (compatible with Deno v2.1.4)`. Load average de 3,6 a 4,3 durante las corridas.

### 1. Límites oficiales del plan gratuito

Fuentes consultadas el **2026-11-16** en la documentación oficial de Supabase:

- [Edge Functions limits](https://supabase.com/docs/guides/functions/limits);
- [Edge Functions pricing](https://supabase.com/docs/guides/functions/pricing);
- [Manage Edge Function Invocations usage](https://supabase.com/docs/guides/platform/manage-your-usage/edge-function-invocations);
- [Using Wasm modules](https://supabase.com/docs/guides/functions/wasm);
- [Authorization headers](https://supabase.com/docs/guides/functions/auth-headers) y [API keys](https://supabase.com/docs/guides/api/api-keys).

| Límite | Plan gratuito | Fuente | Lo que suponía el ADR 0012 |
|---|---|---|---|
| CPU por petición | **2 s** ("tiempo real en CPU por petición; no incluye E/S asíncrona") | limits | 2 s: **confirmado** |
| Tiempo de reloj (vida del worker) | **150 s** (400 s en planes pagos). Durante ese tiempo un worker puede atender varias peticiones o tareas de fondo | limits | ~150 s: **confirmado** |
| Inactividad de la petición | **150 s** sin respuesta da 504 | limits | — |
| Memoria | **256 MB** | limits | 256 MB: **confirmado** |
| Cuerpo de la petición | **No está documentado** en ninguna de las páginas consultadas | — | Abierto (R5-8): se mide desplegado |
| Invocaciones | **500.000 al mes** (cuentan todas las respuestas, también los errores; OPTIONS no cuenta). Al pasarlas en el plan gratuito hay aviso y periodo de gracia, sin cobro | pricing, invocations | 500.000: **confirmado** |
| Tamaño de la función | **20 MB** empaquetada en local con la CLI; **5 MB** empaquetada en el servidor (API de gestión o panel, que es el caso del MCP `deploy_edge_function`) | limits | — |
| Archivos estáticos | **No se pueden desplegar por la API** ("Static files cannot be deployed using the API flag"); solo con la CLI y Docker (`static_files` en `config.toml`) | limits, wasm | — |
| Funciones por proyecto | 100 | limits | — |
| Registros | 10.000 caracteres por mensaje; 100 eventos cada 10 s | limits | — |
| Llamadas anidadas | 30 por traza en 60 s | limits | — |
| Secretos | 100 por proyecto, 48 KiB cada uno, sin el prefijo `SUPABASE_` | limits | — |
| Bibliotecas nativas o con hilos | No admitidas (`sharp`, `libvips`); tampoco Web Workers ni `vm` | limits | Coincide con el ADR 0013 |

Dos hechos de la documentación que cambian cosas:

1. **`verify_jwt` no autentica las claves nuevas.** Por compatibilidad, la verificación de la plataforma acepta la clave publicable (`sb_publishable_…`) en `apikey` o en `Authorization`, pero "pasarla no autentica a quien llama" (Authorization headers). Con `verify_jwt = true`, cualquiera con la clave publicable llega a la función. Por eso cada función de la fase 5 debe llamar a `auth.getUser()`, como ya pide el ADR 0012 en la sección 7; no basta con la plataforma.
2. **El despliegue por la API no admite archivos estáticos y empaqueta solo lo que se le envía.** El `.wasm` de jSquash no puede viajar como archivo, y los imports `../../../packages/...` no se resuelven (sección 3).

### 2. Qué se construyó

| Archivo | Qué es |
|---|---|
| `packages/image-chart/` | **Esqueleto** del paquete (T7 lo completa): `sniffImageHeader` (JPEG SOF0 a SOF2, PNG IHDR, WebP VP8, VP8L y VP8X; nulo si está truncado o es otro formato), `fitWithin` y `resizeArea`. Sin dependencias. 7 pruebas con `node:test`, entre ellas la prueba cruzada |
| `packages/image-chart/test/support/cross-cases.ts` y `cross-expected.json` | 8 rasters deterministas (mulberry32), con y sin alfa y con proporciones no enteras, más los SHA-256 que da Node |
| `supabase/functions/t2-medicion/` | Función de medición: `index.ts`, `codec.ts` (jSquash), `marks/` (marcas de importación), `muestras.ts` (imágenes de 48 × 32 en los cuatro formatos) y `deno.json` (mapa hacia el monorepo y `npm:` con versión exacta) |
| `scripts/t2/empaquetar.ts` | Arma el paquete para la API o el MCP en `supabase/.t2-deploy/` (ignorado por git) |
| `scripts/t2/medir.ts` y `scripts/t2-invocar.sh` | Invocan N veces cada caso y calculan p50, p95 y p99 |
| `scripts/t2/cruzada-node.ts` | Lado Node de la prueba cruzada (`--write` fija los hashes; `--compare` compara con una respuesta de Deno) |
| `scripts/t2/generar-fixtures.mjs` y `scripts/t2/fixtures/foto-2048.jpg` | JPEG sintético de 2048 × 2048 con aspecto de foto (degradados, figuras, textura y ruido), calidad 90, 4:2:0, sin EXIF: **1.345.628 bytes**, dentro de los 1 a 2 MB típicos del ADR 0013 |
| `.github/workflows/ci.yml` | Paso "Pruebas de image-chart" en el job `nucleo` |

`resizeArea` hace un promedio por área exacto. Usa pesos enteros por eje: el traslape en unidades de 1/(origen × destino). Las sumas son exactas en doble precisión y hay un solo redondeo final. El color se pondera por el alfa, premultiplicado, para que el fondo transparente no oscurezca los bordes. Procesa fila a fila con memoria O(ancho). T7 puede cambiar el alfa ponderado si `experto-tejido` o `catalogo-lanas` lo piden; si lo cambia, debe volver a fijar los hashes.

#### Casos de la función (`?caso=`)

| Caso | Qué mide |
|---|---|
| `importar` | Evaluación de cada paquete del monorepo, con marcas entre imports, y una llamada a una función de cada uno |
| `codecs` | Decodifica JPEG, PNG con alfa, WebP con pérdida (VP8) y WebP sin pérdida (VP8L), y compara las dimensiones con `sniffImageHeader` |
| `subida` (POST JPEG) | Lo de `subir-imagen`: leer el cuerpo, `sniffImageHeader`, decodificar 2048 × 2048, `resizeArea` a 1024 y codificar el PNG |
| `etapa` (POST PNG) | Lo de una etapa de `ia-trabajo`: decodificar el raster de 1024, reducir a 200 de ancho, cuantizar con un **sustituto** de `rasterToChart` (popularidad de 4 bits y paleta propia; el algoritmo real es de T7) y `validatePattern` |
| `validar` | `validatePattern` de un gráfico de 200 × 200 con 6 lanas: `bloques`, parecido a una foto, y `ruido`, el peor caso de hebras |
| `cruzada` | `resizeArea` de los 8 casos, con su SHA-256 |
| `cuerpo` (POST) | Solo lee el cuerpo, para medir dónde corta la plataforma (R5-8) |

**CPU.** El runtime no da el CPU por invocación: `process.cpuUsage()` no está implementado en supabase-edge-runtime 1.77.8 y devuelve ceros con un aviso. Por eso se informan dos cifras:

- **`procesoMs`**: el tiempo de pared de las secciones síncronas (JavaScript y WebAssembly sin E/S). Sin contención del equipo, es el CPU propio del trabajo.
- **`cpuContenedorMs`**, solo en local: la diferencia de `usage_usec` en `cpu.stat` del cgroup del contenedor del edge-runtime, antes y después de cada invocación, menos la mediana de lecturas en vacío (10,2 ms). Incluye el runtime, el proxy HTTP del servicio principal, el recolector y el arranque de instancias, así que es una **cota superior**.

### 3. Imports en Deno

| Qué | Resultado en local |
|---|---|
| `pattern-core`, `yarn-catalog` (con `import … with { type: "json" }`), `ai-router` e `image-chart` desde `deno.json` → `../../../packages/*/src/index.ts` | **Funciona** con `supabase functions serve`. La CLI recorre el grafo de imports y monta en el contenedor, solo lectura, cada archivo de fuera de `supabase/functions` (lo muestra `docker inspect`) |
| jSquash por `npm:@jsquash/…@versión/decode.js` | **Funciona** |
| **Paquete para la API** (`scripts/t2/empaquetar.ts`): 32 archivos, 211 KB (316 KB de fuentes), sin import map | **Funciona** servido **aislado**: con `supabase functions serve --workdir` en un directorio que solo contiene el paquete. Solo se monta ese directorio. Las mismas cifras y la misma prueba cruzada |
| `verify_jwt = true` en el paquete aislado | Sin credenciales responde 401; con la clave publicable local en `apikey`, 200 |

**Decisión para el despliegue (R5-2).** El MCP `deploy_edge_function` usa la API de gestión, que empaqueta en el servidor con lo que recibe. No puede seguir rutas fuera de la función ni el mapa hacia el monorepo, y no admite el `.wasm` como archivo estático. Por eso `empaquetar.ts` hace tres cosas:

- copia los paquetes a `vendor/<paquete>/…`, con la misma estructura, para que los imports relativos `.ts` y el JSON con atributos resuelvan sin cambios;
- reemplaza `@loopitalab/*` por rutas relativas y `@jsquash/*` por `npm:` con versión exacta;
- quita los tipos y los comentarios con `typescript`, que ya es dependencia de desarrollo de la raíz, para que el contenido que viaja en la llamada del MCP sea menor. Los archivos siguen siendo `.ts`.

Es la alternativa que nombra R5-2 ("un paso de bundle en la CI que copie los paquetes"), y su resultado se prueba en local antes de subirlo.

**WebAssembly.** Como el `.wasm` no puede ser un archivo estático en el despliegue por la API, `codec.ts` lo descarga una vez por instancia desde jsDelivr. jsDelivr sirve el mismo archivo del paquete de npm: se verificó que los SHA-256 coinciden con los del tarball. `codec.ts` comprueba el SHA-256 antes de compilar y falla cerrado si no coincide. Esto sirve para medir; para producción, ver la enmienda E-T2-1.

### 4. Cifras locales

Paquete para la API servido aislado y `verify_jwt = true`. 20 invocaciones seguidas por caso (3 en `cruzada`), en milisegundos. Percentil por rango más cercano: con N = 20, p95 es el 19.º valor y **p99 es el máximo**. Las corridas incluyen arranques en frío, porque el runtime local retira la instancia al pasar el límite blando de CPU (sección 5). La corrida previa con la función sin empaquetar (imports al monorepo) dio cifras equivalentes: `subida` con `procesoMs` de 145, 184 y 198 ms y `cpuContenedorMs` de 200, 335 y 346 ms (p50, p95 y p99).

**`subida`** (JPEG de 2048 × 2048 → raster PNG de 1024 × 1024; 4 de las 20 invocaciones en frío):

| Etapa | p50 | p95 | p99 |
|---|---|---|---|
| Leer el cuerpo (1,3 MB) | 6,7 | 13,7 | 15,8 |
| `sniffImageHeader` | 0,0 | 0,1 | 0,2 |
| Decodificar el JPEG (mozjpeg en WebAssembly) | 66,2 | 79,0 | 82,9 |
| `resizeArea` 2048 → 1024 | 60,7 | 96,9 | 167,7 |
| Codificar el PNG | 22,7 | 48,8 | 51,2 |
| **`procesoMs`** (suma de lo anterior) | **154,7** | **206,9** | **294,2** |
| **`cpuContenedorMs`** (cota superior) | **216,5** | **387,6** | **400,5** |
| Respuesta vista por el cliente | 171,0 | 344,4 | 363,3 |

- **PNG de salida: 2.637.609 bytes** con este fixture ruidoso. Es más que los "1 a 2 MB" que supone el ADR 0013 (sección 4), y queda bajo el tope de 4 MB del bucket; ver la enmienda E-T2-3.
- Como referencia, `resizeArea` 2048 → 1024 tarda en Node 24 en este mismo equipo 50,8 ms de p50 y 103 ms de máximo, en 20 corridas.

**`etapa`** (raster de 1024 × 1024 → gráfico de 200 × 200 → validación; 1 en frío):

| Etapa | p50 | p95 | p99 |
|---|---|---|---|
| Leer el cuerpo (2,6 MB) | 12,1 | 17,7 | 41,5 |
| Decodificar el PNG | 21,9 | 31,4 | 35,7 |
| Reducir a 200 (`resizeArea`) | 9,1 | 21,5 | 23,2 |
| Cuantizar (sustituto de `rasterToChart`) | 10,2 | 26,4 | 26,9 |
| `validatePattern` | 3,2 | 11,5 | 11,8 |
| **`procesoMs`** (sin leer el cuerpo) | **51,5** | **75,1** | **76,8** |
| **`cpuContenedorMs`** (cota superior) | **120,5** | **243,5** | **262,6** |

**`validatePattern` de 200 × 200** (sin opciones, como en el ADR 0012, sección 1):

| Variante | p50 | p95 | p99 | Resultado |
|---|---|---|---|---|
| `bloques` | 2,5 | 8,8 | 8,8 | `valid`, avisos `CHART_COLORS_PER_ROW` y `CHART_FLOAT_LONG` |
| `ruido` | 3,4 | 10,7 | 11,8 | `valid`, los mismos avisos |

**Importación y arranque en frío** (las 6 instancias que se estrenaron durante la corrida):

| Qué | Rango |
|---|---|
| Del origen del worker al primer módulo evaluado (carga y transpilación del grafo) | 18 a 31 ms |
| Evaluar `pattern-core` | 0,4 a 0,9 ms |
| Evaluar `yarn-catalog` (con los tres JSON) | 0,9 a 1,2 ms (4 ms en la primera corrida) |
| Evaluar `ai-router`, `image-chart` y el JavaScript de jSquash | < 0,05, < 0,02 y 0,5 a 0,9 ms |
| Cargar el WebAssembly (`initCodecs`), en paralelo: descarga de jsDelivr, SHA-256, compilación e instanciación | 59 a 80 ms de pared. La descarga es espera de red (55 a 95 ms por archivo); el CPU es de unos 15 ms (SHA-256 de 1 ms, compilación de 1 a 3 ms por módulo, instanciación de 8 a 12 ms) |
| `subida` en frío: `procesoMs` / `cpuContenedorMs` | 178 a 193 ms / 329 a 401 ms |

**Códecs** (`codecs`): los cuatro formatos decodifican en Deno, y las dimensiones coinciden con las de `sniffImageHeader`. El alfa se conserva en el PNG y en el WebP sin pérdida. Cada muestra de 48 × 32 tarda menos de 0,5 ms, ya con la instancia caliente.

**Memoria**: el montón de V8 se queda en unos 9 MB. La memoria externa (ArrayBuffer y la memoria del WebAssembly, que nunca se encoge) sube a **80 MB** en la primera `subida` y a **unos 119 MB** después de varias subidas en la misma instancia. Está bajo los 256 MB, con un margen de unas 2 veces.

**Cuerpo** (`cuerpo`, en local): 1, 5,9, 6,5 y 10 MB llegan enteros (200). 12,5 MB los rechaza la propia función (413, su tope de 12 MB). El gateway local no corta antes de 10 MB. **El tope de la plataforma no está documentado y hay que medirlo desplegado.**

**Prueba cruzada Node/Deno de `resizeArea`**: los **8 casos dan los mismos bytes** (SHA-256 iguales) en Node 24.16.0 y en supabase-edge-runtime 1.77.8 (Deno 2.1.4). Coinciden tanto con la función sin empaquetar como con el paquete transpilado. Los casos incluyen 2048 × 2048 → 1024, proporciones no enteras (1999 × 1001, 777 × 2048), alfa parcial, 1025 × 64, → 768, → 200 y el caso que no cambia de tamaño. Los hashes fijados están en `cross-expected.json`, y la prueba de Node los verifica en la CI.

### 5. Criterio y conclusión provisional

| Criterio (roadmap T2; ADR 0012, sección 7; ADR 0013, sección 8) | Local | Veredicto local |
|---|---|---|
| CPU p99 < 1 s en la subida | `procesoMs` p99 = 294 ms; cota superior del contenedor p99 = 401 ms, en frío | **Cumple**, con un margen de 2,5 a 3,4 veces |
| CPU p99 < 500 ms en una etapa (decodificar el PNG + `rasterToChart` + `validatePattern`) | `procesoMs` p99 = 77 ms; cota superior p99 = 263 ms | **Cumple**. Falta el `rasterToChart` real (T7, con su meta de < 30 ms en Node) |
| `validatePattern` de 200 × 200 | p99 de 9 a 12 ms | **Cumple** |
| Los imports funcionan | Funcionan en local, sin empaquetar y con el paquete aislado | **Cumple en local**; falta desplegado |
| Códecs de jSquash en Deno | Los tres decodificadores y el codificador PNG funcionan | **Cumple** |
| Prueba cruzada Node/Deno | 8 de 8 casos iguales | **Cumple** |

- **El runtime local emula los límites de CPU del alojado.** El servicio principal de la CLI crea cada worker con `cpuTimeSoftLimitMs = 1000` y `cpuTimeHardLimitMs = 2000`. En los registros aparece "CPU time soft limit reached … early termination": el límite blando se acumula por instancia, y al llegar a 1 s la instancia se retira después de responder. Pasó cada unas 5 subidas. Ninguna petición llegó al límite duro ni se cortó.
- **Conclusión provisional: la opción E (Supabase Edge Functions) es viable en local**, con margen en CPU y memoria. No hace falta volver a T0 ni elegir R (Node con `sharp`). Hay que confirmarlo desplegado; si desplegado falla alguno de estos puntos, se vuelve a decidir con la usuaria:
  - el empaquetado en el servidor de los `npm:`;
  - el CPU real;
  - el tope del cuerpo;
  - la descarga del WebAssembly desde la región del proyecto.

### 6. Propuestas de enmienda (para `arquitecto`)

Nada falló, así que ninguna es bloqueante. Salen de lo medido:

- **E-T2-1 (ADR 0013, sección 8): cómo llega el WebAssembly a producción.** No se debe depender de jsDelivr en tiempo de ejecución. Aunque el SHA-256 garantiza la integridad, la disponibilidad depende de un tercero y suma unos 60 a 90 ms de red en cada arranque en frío. Propuesta: el paso de empaquetado genera, desde el tarball de npm con `integrity` fijada, un módulo `.ts` con cada `.wasm` en base64, de unos 650 KB en total. El paquete queda en menos de 1 MB, bajo los 5 MB del despliegue por la API. También copia (*vendor*) el JavaScript de jSquash, que es Apache-2.0, en vez de resolver `npm:` al desplegar. Eso reemplaza "`integrity` en `deno.lock`" de la sección 8 y quita la dependencia transitiva `wasm-feature-detect@^1.2.11` de `@jsquash/webp`, que tiene un rango y que el decodificador no usa. Alternativa: desplegar con la CLI y Docker, con `static_files`, pero eso no sirve con el MCP. T11 mide el costo de decodificar el base64 en frío.
- **E-T2-2 (ADR 0012, sección 7, y R5-2): cómo se despliegan las funciones.** Se adopta el paso de empaquetado (`scripts/t2/empaquetar.ts`, que T11 generaliza a `scripts/empaquetar-funcion.ts`). El paquete se prueba en local con `supabase functions serve --workdir` antes de desplegarlo, y la CI puede verificarlo con el edge-runtime en Docker. Se despliega con el MCP o con la API. La alternativa es `supabase functions deploy` desde la CI con un token de acceso como secreto de GitHub.
- **E-T2-3 (ADR 0013, sección 4): `file_size_limit` del bucket.** El PNG de 1024 × 1024 de una foto ruidosa pesó 2,6 MB. El peor caso de un PNG RGBA de 1024 × 1024 incompresible es de unos 4,2 MB (4.194.304 bytes de píxeles más un byte de filtro por fila y los encabezados de deflate), y eso pasa los 4 MB. Propuesta: subir el tope a **5 MB**, que acota el peor caso por construcción, o fallar con un código claro. T11 lo confirma con fotos reales.
- **E-T2-4 (ADR 0012, sección 7, nota): `verify_jwt` y las claves nuevas.** Con `verify_jwt = true`, la clave publicable pasa la verificación de la plataforma sin autenticar a nadie. `auth.getUser()` dentro de cada función es obligatorio, no una defensa adicional. Lo revisa `revisor-seguridad` en T21.
- **Nota de memoria para T11**: la memoria externa llegó a unos 119 MB en una instancia caliente. `subir-imagen` no debe guardar referencias al raster decodificado entre peticiones. T11 vuelve a medir desplegado.

### 7. Dependencias

No se agregó ninguna dependencia a ningún `package.json`. El `pnpm-lock.yaml` solo suma el importador vacío `packages/image-chart: {}`, que hace falta para `--frozen-lockfile` en la CI.

| Qué | Dónde | Justificación |
|---|---|---|
| `@jsquash/jpeg@1.6.0`, `@jsquash/png@3.1.1`, `@jsquash/webp@1.5.0` | Solo en la función de medición, por `npm:` con versión exacta en `deno.json` | Son los códecs elegidos en el ADR 0013, sección 8, y lo que T2 debía probar. Licencia **Apache-2.0**, verificada en el metadato de npm y en el `package.json` de cada tarball. Publicados el 2025-05-12 y el 2025-05-20, más de 7 días antes (T20-I6). **Sin scripts de instalación** (solo `build` y `prepublishOnly`). `integrity` de npm: jpeg `sha512-zwN46Awh…SIMA==`, png `sha512-C10pc+0H…Zphaw==`, webp `sha512-KggLoj2M…oZtKFw==` |
| `typescript` | `scripts/t2/empaquetar.ts` | Ya es dependencia de desarrollo de la raíz |
| `sharp` | `scripts/t2/generar-fixtures.mjs` | Ya está en `apps/web`. Se usó una vez para generar los fixtures, que quedan en el repo. Cuando T11 retire `sharp`, el script deja de funcionar, pero los fixtures siguen sirviendo |

### 8. Cómo reproducir en local

```bash
npx supabase@2.122.1 start -x studio,imgproxy,realtime,storage-api,logflare,vector,mailpit,postgres-meta,supavisor
npx supabase@2.122.1 functions serve      # en otra terminal; sirve supabase/functions/t2-medicion
T2_DOCKER=supabase_edge_runtime_loopitalab scripts/t2-invocar.sh http://127.0.0.1:54321/functions/v1/t2-medicion "<clave publicable local de supabase status>" 20
```

Para probar el paquete aislado, se corre `node scripts/t2/empaquetar.ts`. Después se copia `supabase/.t2-deploy/t2-medicion` a `<dir>/supabase/functions/`, con un `config.toml` que tenga `project_id = "loopitalab"`, y se corre `npx supabase@2.122.1 functions serve --workdir <dir>`.

### 9. Despliegue en el proyecto desechable (lo hace la usuaria con el MCP)

1. `node scripts/t2/empaquetar.ts` genera `supabase/.t2-deploy/payload.json` y `supabase/.t2-deploy/t2-medicion/`.
2. `deploy_edge_function` en el proyecto `ifhcxgxjcpxbjzbbqmws` con:
   - `name: "t2-medicion"`;
   - `entrypoint_path: "index.ts"`;
   - `verify_jwt: true`;
   - **sin `import_map`**, porque el paquete ya no usa especificadores del mapa;
   - `files`: los 32 archivos de `payload.json`, con su `name` relativo a la función.
3. Opcional: el secreto `T2_TOKEN`. Si existe, la función exige la cabecera `x-t2-token`, así que la clave publicable sola no basta.
4. `T2_JSON=/tmp/t2-desplegada.json scripts/t2-invocar.sh https://ifhcxgxjcpxbjzbbqmws.supabase.co/functions/v1/t2-medicion "<clave publicable>" 20`.
5. **Borrar la función** al terminar: es medible por cualquiera que tenga la clave publicable, y gasta invocaciones.

### Lo que falta medir desplegado

- Que el empaquetado en el servidor acepte el paquete y resuelva los `npm:` de jSquash: que `importar` y `codecs` respondan 200.
- La versión del runtime alojado (campo `runtime`) y la prueba cruzada allí (`cruzada`; el script compara solo contra `cross-expected.json`).
- **CPU real** por invocación, en los registros de la función en el panel (eventos de arranque y cierre del worker). Si no traen el CPU, vale `procesoMs` como estimación. Una `subida` que pasara los 2 s respondería con el error de límite de recursos de la plataforma.
- **Tope del cuerpo** (R5-8): el caso `cuerpo` con 1, 5,9, 6,5, 10 y 12,5 MB.
- Arranque en frío, con la descarga del WebAssembly desde la región del proyecto, y la memoria externa.
- Con eso se cierra la puerta: el veredicto final y las enmiendas aceptadas o descartadas.
