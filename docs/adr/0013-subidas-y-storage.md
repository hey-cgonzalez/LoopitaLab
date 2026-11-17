# ADR 0013: Subidas de imágenes y Storage

- Estado: **aceptado (2026-11-16, T0)**. Propuesto el 2026-11-16 por `arquitecto`; la usuaria lo aprobó con las [decisiones de la fase 5](../roadmap.md#decisiones-de-la-fase-5-aprobadas-el-2026-11-16). Ver [Enmiendas por las decisiones de la usuaria](#enmiendas-por-las-decisiones-de-la-usuaria-2026-11-16) y [Enmiendas por el grupo A del hito 1](#enmiendas-por-el-grupo-a-del-hito-1-t1-t2-y-t4-2026-11-16). La puerta de viabilidad T2 **pasó** el 2026-11-16: la opción E y los códecs de la sección 8 quedan confirmados. Pasa por `revisor-seguridad` (T21).
- Fecha: 2026-11-16
- Paquetes: `supabase/functions` (nuevo), `supabase/migrations`, `packages/image-chart` (nuevo), `apps/web`
- Relacionado: [ADR 0012](0012-pipeline-imagen-a-patron.md) (pipeline), [ADR 0014](0014-costos-y-cuotas-de-ia.md) (cuotas), [docs/seguridad.md](../seguridad.md) (M3, F2-M1, F2-M2, BAJO-3, BAJO-4), [docs/despliegue-publico.md](../despliegue-publico.md) (D1, Workers Free)

## Contexto

- **M3** exige que las subidas pasen por el servidor: tipo real por bytes mágicos, re-codificación, sin EXIF, ruta armada por el servidor y guardado con la clave secreta. El cliente no tiene políticas de inserción ni de borrado en `uploads` ni en `storage.objects` (F2-M1).
- **Implementación actual.** `apps/web/src/app/api/subidas/route.ts` y `[id]/route.ts`, apagadas con `LOOPITA_UPLOADS_ENABLED` (BAJO-4). Hacen esto:
  - mismo sitio y sesión;
  - `begin_operation('upload')`, con 60 intentos y 30 imágenes por día y una subida a la vez;
  - cuerpo de 10 MB como máximo en 60 s;
  - bytes mágicos JPEG, PNG o WebP;
  - `sharp`, con `limitInputPixels` de 24 MP, el decodificador igual a los bytes mágicos y re-codificación a WebP q85 de ≤ 4096 px;
  - `uploads/<uid>/<uuid>.webp`;
  - semáforo de 2 re-codificaciones por instancia.
- **`sharp` no corre en Cloudflare Workers**: necesita binarios nativos de libvips. Aunque corriera, una decodificación no cabe en 10 ms de CPU. El ADR 0012 lleva el pipeline a Supabase Edge Functions (Deno, WebAssembly).
- **Bucket** `uploads`: privado, 10 MB, `image/jpeg`, `image/png` e `image/webp`. La lectura en la carpeta propia es la única política del cliente que queda.
- **Eliminar la cuenta** ya borra los objetos de la carpeta de la usuaria por la API de Storage (`api/cuenta/eliminar`).
- **Lo que necesita el pipeline.** El triaje y el descomponedor necesitan una imagen de ≤ 1024 px por lado. `rasterToChart` necesita a lo más 200 × 200 celdas. Nada necesita la foto original.

## Opciones

- **E. Edge Function `subir-imagen`** con un códec WebAssembly. Tiene el mismo contrato que la ruta actual y se invoca desde el navegador con la sesión.
- **R. Mantener el Route Handler con `sharp`** y mover el hosting a Node (Vercel Hobby, de uso no comercial). Es la opción N del ADR 0012.
- **C. Route Handler en el Worker con el *binding* de Cloudflare Images.** La transformación la hace Cloudflare. No se verificó que el plan gratuito lo incluya, ni su cuota de transformaciones, y agrega un tercer encargado de tratamiento que ve las fotos.
- **S. Subida directa a Storage** con una URL firmada a una carpeta de cuarentena, y una función que procesa después. Evita el límite de cuerpo de la función, pero la foto original queda guardada aunque sea un rato, y suma una carpeta, una política y una purga.
- **B. Solo en el navegador**, con el servidor revisando únicamente encabezados. No re-codifica en el servidor: un archivo políglota o una "bomba" llegaría a Storage y a la IA. Contradice M3. Descartada.

## Decisión

**E**, con una primera reducción en el navegador. Si la puerta T2 falla, la alternativa es **R**, con decisión de la usuaria.

### 1. En el navegador (primera capa, no confiable)

- La foto se abre localmente (`createImageBitmap` con `imageOrientation: "from-image"`, que aplica la orientación) y **no sale del equipo** hasta que la usuaria recorta y confirma.
- La usuaria recorta y marca el aviso de derechos (sección 7).
- El recorte se reduce a **≤ 2048 px por lado** y se codifica como JPEG con calidad 0,9 (`canvas.toBlob`). El lienzo no copia metadatos, así que ya sale sin EXIF ni GPS.
- Se envía como `multipart/form-data`, con `file`, `rightsAck` (la versión del texto aceptado) y `route` (`chart` o `amigurumi`).

### 2. En la Edge Function `subir-imagen` (la barrera)

En este orden. Lo que falle después del paso 4 cuenta como intento (F2-M2).

1. `LOOPITA_UPLOADS_ENABLED` (secreto de la función) apagado: responde 404.
2. `Origin` en la lista permitida (ADR 0012, sección 7); si no, 403 `cross_site`.
3. JWT verificado y `auth.getUser()`, **obligatorio** (E-T2-4: con `verify_jwt = true` la plataforma acepta la clave publicable sin autenticar a nadie); si no hay usuario, 401.
4. `begin_operation(uid, 'upload')`: una subida a la vez, más los topes. **Cambio**: 30 intentos y **10 imágenes guardadas cada 24 h**. Con una cuota de 2 trabajos de IA al día (ADR 0014, decisión 3), 30 imágenes no tienen uso; 10 dejan margen para recortar de nuevo sin gastar intentos de IA.
5. Cuerpo de **≤ 6 MB** en ≤ 30 s (un JPEG de 2048 × 2048 con calidad 0,9 pesa típicamente de 1 a 2 MB; el fixture de T2 pesó 1,3 MB). Si no, 413 o 408. El tope lo impone la función leyendo el cuerpo con límite: la plataforma deja pasar 10 MB y con 12,5 MB responde 503 después de unos 160 s, así que no se puede confiar en ella (T2, R5-8).
6. `rightsAck` igual a la versión vigente del aviso; si no, 400 `rights_required`.
7. **Tipo real**: `sniffImageHeader` (puro, en `image-chart`) lee los bytes mágicos y las **dimensiones del encabezado sin decodificar**: SOF0 a SOF2 en JPEG, IHDR en PNG, y VP8, VP8L o VP8X en WebP. Solo JPEG, PNG o WebP; si no, 415 `unsupported_type`. Si el lado mayor pasa de 2048 px, los píxeles pasan de 4.194.304 o el lado menor baja de **16 px** (E-14; antes 64), 413 `dimensions_out_of_range`. Con el lado menor bajo 64 px la subida se acepta y la respuesta lo indica por `width` y `height`: la interfaz avisa "Poca resolución: el resultado puede salir irreconocible". **Antes de decodificar**: así una bomba de descompresión nunca llega al códec.
8. **Decodificación** con el códec del formato detectado. Si el decodificador falla, o las dimensiones decodificadas no coinciden con las del encabezado (políglotas), 415 `unreadable_image`. El PNG o WebP con transparencia se conserva como RGBA: `image-chart` trata el alfa < 128 como el **color de fondo del diseño**, nunca como `NO_STITCH`, y compone el alfa parcial sobre blanco antes de cuantizar (E-13, confirmado por T1 en F5-22 y F5-23).
9. **Orientación**: el servidor **ignora** la orientación EXIF. El navegador ya la aplicó; quien llame directo a la API con un JPEG rotado recibe la imagen rotada, sin riesgo.
10. **Raster de trabajo**: `resizeArea` (puro, promedio por área, ponderado por el alfa) a **≤ 1024 px por lado** (promedia en sRGB; ver E-15), y codificación **PNG sin pérdida**, que tiene solo los fragmentos IHDR, IDAT e IEND. Re-codificar desde los píxeles descarta EXIF, GPS, XMP, IPTC, ICC y miniaturas. Una prueba lo verifica sobre la salida: `assertMinimalPng`, sin ningún otro fragmento.
11. Guarda `uploads/<uid>/<uuid>.png` con `service_role`, con `upsert: false` y `cache-control: private, max-age=0`, e inserta la fila en `uploads` (sección 5). Si la inserción falla, borra el objeto (como hoy). Responde 201 `{ id, width, height }`.
12. **La foto recibida nunca se guarda**: vive solo en la memoria de la invocación.

- **Códigos de error**: los mismos de la ruta actual, más `dimensions_out_of_range`, `rights_required` y `raster_too_large` (sección 4, E-T2-3). La interfaz los traduce. Los mensajes no llevan detalles del códec ni de la base.
- **Logs**: solo códigos de error. Sin `user.id`, sin rutas (empiezan con el uid; BAJO-3), sin bytes y sin nombres de archivo.
- **Concurrencia**: sin semáforo por instancia (Deno aísla cada invocación). El tope real son el candado por usuaria y las cuotas en la base.
- **Borrado**: `DELETE` en `subir-imagen/<id>`, con la misma verificación de sesión y `Origin`. Borra el objeto y la fila juntos, y deja `ai_jobs.upload_id` en `null` por la clave foránea.
- **Ruta actual**: T11 **retira** `apps/web/src/app/api/subidas/` y la dependencia `sharp` de `apps/web`, para que no queden dos implementaciones que diverjan. Si se elige R, en cambio, se conserva y se adapta a esta sección, con las dimensiones y el PNG.

### 3. El raster lo usan el navegador y el pipeline

- El navegador descarga su raster con la sesión (la política "leer en carpeta propia" ya existe) y calcula la vista previa con `image-chart`. Es el mismo archivo que usa el servidor, y por eso la vista previa y el resultado son idénticos (ADR 0012, IA-P3).
- Para la IA, la función reduce en memoria: ≤ 768 px por lado para el triaje y ≤ 1024 px para el descomponedor, en PNG y en base64. No se usa una URL firmada hacia el proveedor: no queda una URL válida en los registros de un tercero.

### 4. Bucket `uploads` (migración de T9)

- Sigue **privado**. `file_size_limit` = **5 MB** (E-T2-3; antes 4 MB). El PNG de 1024 × 1024 de la foto ruidosa de T2 pesó 2,6 MB, y el peor caso de un PNG RGBA de 1024 × 1024 incompresible ronda los **4,2 MB** (4.194.304 bytes de píxeles más un byte de filtro por fila y los encabezados de deflate), que no cabía en 4 MB. Con 5 MB el peor caso cabe por construcción. Si aun así la codificación pasara el tope, la función falla cerrado antes de guardar, con el código nuevo `raster_too_large` (no cuenta como imagen guardada). T11 lo confirma con fotos reales. `allowed_mime_types` = `['image/png']`. Hoy no hay filas, porque las subidas están apagadas desde el inicio. T9 lo verifica con una consulta y, si hubiera filas `webp`, las deja y amplía la lista.
- **Políticas**: sin cambios. Hay lectura en la carpeta propia y ninguna inserción, actualización ni borrado del cliente. `10_rls_check.sql` comprueba que `authenticated` no puede subir, sobrescribir ni borrar, y que no lee la carpeta ajena.
- `uploads.mime_type` admite `image/png`, que ya está en la lista del CHECK.

### 5. Retención y borrado

Columnas nuevas en `uploads`:

- `width` y `height` (`smallint`, ≤ 1024);
- `rights_ack_version` (`text not null`, ≤ 20) y `rights_ack_at` (`timestamptz not null`);
- `expires_at` (`timestamptz not null`);
- `last_used_at` (`timestamptz`).

La Edge Function las escribe con `service_role`, y el cliente solo las lee.

**Plazo** (decisión 4 de la fase 5, aprobada en su opción b): la imagen vence **24 horas después del último trabajo que la usó** (`last_used_at`), y **nunca pasa de 7 días** desde la subida (`expires_at`). Así la usuaria puede volver a generar con otros parámetros el mismo día sin volver a subirla.

- **"Borrar la foto"** está siempre a la vista en el flujo y en el resultado, y borra al instante.
- **Purga**: `ia-mantenimiento` (Edge Function, invocada cada hora por pg_cron con pg_net) busca las filas vencidas y borra primero el objeto por la API de Storage y después la fila. Nunca borra con un `DELETE` sobre `storage.objects`, porque eso no borra el archivo. Registra los conteos sin identificadores. Si el borrado del objeto falla, la fila queda para el próximo ciclo.
- **El patrón generado no depende de la imagen**: `ai_jobs.upload_id` queda en `null` al borrarla, y el documento no la referencia.
- **Eliminar la cuenta**: ya borra la carpeta. Se agrega a las pruebas el caso con un trabajo en curso.
- **En el proveedor de IA**: la imagen reducida se envía a Anthropic. Los plazos de retención del proveedor en la API, y si usa o no los datos, los confirma la revisión legal (T4) y se declaran en `/privacidad`, junto con la transferencia internacional. Este ADR no afirma cifras del proveedor que no se verificaron.

### 6. Exportación de datos

La exportación de la cuenta (`api/cuenta/exportar`) incluye las filas de `uploads`, `ai_jobs` y `ai_job_calls`, sin los bytes de las imágenes. Se agrega a la prueba de exportación.

### 7. Aviso de derechos (decisión 8 de la fase 5, aprobada en su opción a)

Es una **casilla obligatoria, sin marcar, en cada subida**, con un texto versionado. El servidor rechaza la subida sin la versión vigente y guarda la versión y la hora en `uploads`. Borrador para la revisión legal (T4; lo redacta `documentador`):

> Confirmo que esta imagen es mía o que tengo permiso para usarla, y que no muestra a otras personas sin su consentimiento. Entiendo que una versión reducida se envía a un proveedor de inteligencia artificial (Anthropic) solo para analizarla, y que la foto se borra a más tardar en 7 días.

- **Texto vigente (T4, 2026-11-16)**: el borrador de arriba quedó como registro. El texto que usa el producto está en `apps/web/src/lib/ai/rights.ts` (`RIGHTS_VERSION = "rights-v1"`, `RIGHTS_LABEL` y `RIGHTS_HELP`), marcado `[PENDIENTE DE REVISIÓN LEGAL]`. Ya dice que la imagen no muestra a personas identificables y que esas fotos se rechazan (decisión 10). Es la única fuente del texto. `subir-imagen` compara `rightsAck` con la misma versión; T11 decide cómo compartir la constante sin que la función dependa de `apps/web` (por ejemplo, moviendo `RIGHTS_VERSION` a un paquete o comprobándolo con una prueba).
- **Versión**: `rights-v1`. Cambiar el texto sube la versión y vuelve a pedir la casilla. Si T1c confirma `third_party_ip` (ADR 0012, E-5), el texto pasa a `rights-v2` para mencionar logotipos y personajes de terceros (E-16).
- **Personas en la imagen** (decisión 10 de la fase 5, aprobada en su opción b): en la v1, el triaje rechaza las imágenes en que una persona identificable es el tema principal (`reasons: ["identifiable_person"]`), hasta la revisión legal. El texto del aviso ya pide no mostrar a otras personas sin su consentimiento; T4 agrega que esas fotos se rechazan.

### 8. Dependencias de imagen (justificación para el PR de T11)

| Paquete | Para qué | Por qué este | Condiciones |
|---|---|---|---|
| `@jsquash/jpeg` | Decodificar JPEG | Códec de Squoosh (libjpeg-turbo o MozJPEG) compilado a WebAssembly. Sin binarios nativos ni scripts de instalación. Funciona en Deno y en Workers, porque es WebAssembly | Versión fijada (T2 probó `1.6.0`, `png@3.1.1` y `webp@1.5.0`), `integrity` de npm registrada en el paso de empaquetado (E-T2-1), licencia **Apache-2.0 (verificada en T2** en el metadato de npm y en el `package.json` de cada tarball), sin `postinstall`. Edad mínima de publicación de 7 días (T20-I6) |
| `@jsquash/png` | Decodificar PNG y codificar el raster | Ídem | Ídem |
| `@jsquash/webp` | Decodificar WebP | Ídem; solo se usa el decodificador | Ídem |
| (ninguno) | Redimensionar | `resizeArea` propio en `image-chart`: es puro, determinista y probado con propiedades, y garantiza el mismo resultado en el navegador y en Deno (IA-P3) | — |
| (ninguno) | Encabezados y bytes mágicos | `sniffImageHeader` propio en `image-chart`, sin dependencias | Pruebas con archivos truncados, políglotas y dimensiones extremas |

- **Descartadas**: `sharp`, que es nativo y no corre en workerd ni en Deno Deploy (solo con R). `imagescript`, por menos formatos verificados: queda como alternativa si T2 encuentra un problema con jSquash. Cloudflare Images (opción C).
- **`image-chart` sigue sin dependencias.** Los códecs viven solo en `supabase/functions/_shared/codec.ts` (infraestructura) y en el navegador, que usa los decodificadores nativos (`createImageBitmap`) para el recorte y el PNG del raster para la vista previa.
- **El WebAssembly va embebido en el paquete en producción (E-T2-1).** El despliegue por la API no admite archivos estáticos, y descargar el `.wasm` de jsDelivr en cada arranque en frío depende de un tercero y llegó a 371 ms desplegado. El paso de empaquetado genera, desde el tarball de npm con `integrity` fijada, un módulo `.ts` con cada `.wasm` en base64 (unos 650 KB en total) y copia el JavaScript de jSquash (Apache-2.0) en vez de resolver `npm:` al desplegar. El paquete queda bajo 1 MB, dentro de los 5 MB del despliegue por la API. Reemplaza "`integrity` en `deno.lock`" y quita la dependencia transitiva `wasm-feature-detect@^1.2.11` (un rango) de `@jsquash/webp`, que el decodificador no usa. **En producción no hay descargas en tiempo de ejecución.** T11 mide el costo de decodificar el base64 en frío.
- **T2 midió** el CPU de decodificar un JPEG de 2048 × 2048, redimensionar y codificar el PNG de 1024 px: **p99 de unos 0,24 s desplegado** (152 / 191 / 242 ms en p50 / p95 / p99), bajo el criterio de 1 s. No hace falta bajar la entrada a 1600 px. La memoria externa llegó a unos 119 MB en una instancia caliente (tope 256 MB): `subir-imagen` no guarda referencias al raster decodificado entre peticiones.

## Consecuencias

- **Positivas**:
  - la foto original nunca se guarda;
  - el raster es pequeño y sin pérdida;
  - la bomba de descompresión se corta antes de decodificar;
  - una sola implementación de las subidas;
  - el Worker no procesa imágenes;
  - se quita una dependencia nativa (`sharp`) de `apps/web`.
- **Negativas**:
  - una llamada directa a la API con una imagen de más de 2048 px se rechaza en vez de reducirse (la interfaz siempre reduce antes);
  - el color de las fotos de gama amplia (Display P3) depende de la conversión del navegador al lienzo;
  - la purga necesita pg_net y una función programada.
- **Seguridad**: cambia el lugar de M3, no su contrato. `docs/seguridad.md` actualiza la fila de M3 (segunda parte) en T24.

## Riesgos abiertos

| ID | Riesgo | Mitigación |
|---|---|---|
| R5-8 | El cuerpo máximo de la petición de una Edge Function en el plan gratuito es menor que 6 MB | **Cerrado (T2, 2026-11-16).** No está documentado; desplegado, 1, 5,9, 6,5 y 10 MB responden 200 y 12,5 MB da 503 después de unos 160 s. El tope de 6 MB cabe con margen. La función impone su propio tope (sección 2, paso 5) |
| R5-9 | Un códec WebAssembly con una vulnerabilidad de memoria | El tamaño y las dimensiones se acotan antes de decodificar. La invocación está aislada y sin secretos en memoria salvo los de la función. Se fija la versión y se actualiza con edad mínima. `revisor-seguridad` revisa la procedencia en T21 |
| R5-10 | pg_net o pg_cron dejan de llamar a la purga y las fotos superan los 7 días | `ia-mantenimiento` registra la última corrida; una alerta (ADR 0014) avisa si pasan 2 horas sin purga; `/privacidad` promete el plazo solo después de que T20 lo verifique |
| R5-11 | La revisión legal pide otro texto o prohíbe enviar fotos a un tercero fuera de Chile | El aviso está versionado; la IA arranca solo para la cuenta de la usuaria hasta T4 (decisión 11) |

## Enmiendas por las decisiones de la usuaria (2026-11-16)

La usuaria aprobó el ADR el 2026-11-16 ([decisiones de la fase 5](../roadmap.md#decisiones-de-la-fase-5-aprobadas-el-2026-11-16)). Cambios al texto propuesto:

- **T0-3 (decisión 3).** La cuota de IA baja a 2 trabajos por día; el tope de 10 imágenes guardadas cada 24 h y 30 intentos se mantiene (sección 2, paso 4).
- **T0-4 (decisión 4, opción b).** Retención de 24 h desde el último trabajo que usó la imagen, nunca más de 7 días desde la subida, con "Borrar la foto" al instante (sección 5). Sin cambios.
- **T0-5 (decisión 5, opción a).** Se confirma E, la Edge Function `subir-imagen`, sujeta a la puerta T2. R sigue siendo la alternativa solo si T2 falla, con una nueva decisión de la usuaria.
- **T0-8 (decisión 8, opción a).** Casilla obligatoria en cada subida, con la versión del texto guardada (sección 7). Sin cambios.
- **T0-10 (decisión 10, opción b).** Rechazo de las imágenes cuyo tema principal es una persona identificable en la v1, hasta la revisión legal (sección 7).
- **Decisión 2 (dos hitos).** Este ADR se implementa entero en el hito 1 (T9 y T11), porque las subidas sirven a las dos rutas. En el hito 1, `route` solo acepta `chart`; `amigurumi` se rechaza con `route_disabled` hasta el hito 2.

## Enmiendas por el grupo A del hito 1 (T1, T2 y T4, 2026-11-16)

Registradas por `arquitecto` el 2026-11-16 con los resultados de T1 (`experto-tejido`, anexo de [casos-dominio-fase-5.md](../casos-dominio-fase-5.md), commit `417dd2a`), T2 (`devops`, [qa-fase-5.md, Puerta T2](../qa-fase-5.md#puerta-t2), commits `04f8427` y `e3ee051`) y T4 (`documentador`, commit `24d0710`).

### Por T1

- **E-13. Alfa.** Confirmado por T1 (F5-22, F5-23): alfa menor que 128 es el color de fondo del diseño, nunca `NO_STITCH`, y el alfa parcial se compone sobre blanco antes de cuantizar (sección 2, paso 8). La regla vive en `image-chart` (ADR 0012, E-12).
- **E-14. Mínimo de 16 px por lado (antes 64).** Aceptada. El rechazo de 64 px dejaba fuera los íconos y el pixel art de 16 a 48 px, que son los que mejor mapean a un gráfico. La defensa contra bombas de descompresión está en los máximos (2048 px y 4.194.304 píxeles), que no cambian; una imagen chica no agrega riesgo. Bajo 64 px se acepta con el aviso "Poca resolución" (sección 2, paso 7).
- **E-15. Promedio por área en sRGB.** Se mantiene: es aceptable para el gráfico y es lo que fija la prueba cruzada de T2 (los SHA-256 de `cross-expected.json`). Los bordes entre colores muy distintos salen algo oscuros; se valida con tejedora con IMG-02 e IMG-05. Si T7 pasa a promediar en luz lineal, vuelve a fijar los hashes y lo registra por enmienda.
- **E-16. Aviso de derechos y terceros.** Si T1c confirma `third_party_ip`, el aviso sube a `rights-v2` (sección 7).

### Por T2 (la puerta pasa)

- **Resultado**: en la subida, CPU p99 de unos 0,24 s; el cuerpo tolera hasta 10 MB y falla en 12,5 MB; los códecs de jSquash funcionan con el empaquetado del servidor; la prueba cruzada de `resizeArea` da los mismos bytes desplegada. Se confirma la opción E (T0-5). Cierra R5-8. Los límites oficiales del plan gratuito, con su fuente, están en el ADR 0012, sección 7.
- **E-T2-1. El `.wasm` va embebido en el paquete en producción** (sección 8). Sin descargas en tiempo de ejecución.
- **E-T2-3. Bucket de 5 MB** (sección 4), porque el peor caso de un PNG RGBA de 1024 px ronda los 4,2 MB. Cambia el valor de la migración de T9.
- **E-T2-4. `auth.getUser()` obligatorio** en `subir-imagen` y en su `DELETE` (sección 2, paso 3).
- E-T2-2 (despliegue con paso de empaquetado, probado en local antes de subir) está en el ADR 0012, sección 7, y vale también para `subir-imagen`.

### Por T4

- Los textos legales quedaron en borrador, marcados `[PENDIENTE DE REVISIÓN LEGAL]`: `/privacidad` (`apps/web/src/app/privacidad/page.tsx`), `/terminos` (`apps/web/src/app/terminos/page.tsx`) y el aviso `rights-v1` (`apps/web/src/lib/ai/rights.ts`). La usuaria los lleva a la revisión legal (T1c). Enlazarlos desde el flujo pasa a T16, porque el flujo todavía no existe.
