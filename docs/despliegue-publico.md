# Plan: dejar LoopitaLab público en loopitalab.cl

Estado: **propuesto** (2026-11-11). Ejecutan agentes con Fable 5.1 bajo el protocolo de orquestación; la usuaria hace los pasos marcados **(usuaria)**. Restricción: **solo planes gratuitos**; ningún paso contrata un plan pago.

## Objetivo

Que `https://loopitalab.cl` sirva la aplicación real (cuentas, diseños, proyectos, lanas) con la seguridad mínima para una beta con tejedoras externas (T1b/T1c de la fase 3), sin costos mensuales.

## Decisiones (aprobadas por la usuaria el 2026-11-11)

| # | Decisión | Elegido | Motivo y condiciones |
|---|---|---|---|
| D1 | Hosting de la web | **Cloudflare Workers, plan gratuito, con vinext** | Sin cláusula de uso no comercial; dominio, HTTPS y despliegue gratis; misma cuenta que el DNS y Turnstile. Cloudflare recomienda vinext (reimplementa Next.js sobre Vite) para Next.js 16; está **en beta**, así que la fase P1 empieza con una prueba de viabilidad. **Límite duro del plan gratuito: 10 ms de CPU por petición** (sin contar esperas de red) y 100.000 peticiones al día. Si la prueba muestra que el estudio o "Tejer este diseño" superan los 10 ms de forma sostenida, se vuelve a decidir (opciones: aligerar el servidor, o Vercel Hobby mientras el proyecto no sea comercial). |
| D2 | DNS de loopitalab.cl | **Cloudflare**, cambiando los servidores de nombre en NIC Chile | DNS con DNSSEC, registros de correo (SPF/DKIM/DMARC), y el dominio queda en la misma cuenta que el Worker. |
| D3 | Correo transaccional (confirmación, recuperación de contraseña) | **Resend, plan gratuito** (3.000 correos/mes, 100/día, un dominio) como SMTP de Supabase Auth | El SMTP integrado de Supabase permite ~2 correos por hora y es solo para pruebas: con él, la beta falla al segundo registro. |
| D4 | Entornos de vista previa | **Solo `main` despliega** | Una vista previa por PR con las variables de la base real apuntaría al proyecto Supabase real. La verificación por PR ya la hace la CI (E2E con Supabase local). |

## Lo que ya está listo en el código

- Cabeceras de seguridad en `apps/web/next.config.ts` (CSP `frame-ancestors 'none'`, HSTS en producción, etc.).
- Candado de `/dev/*` en producción (`lib/dev-pages.ts`); subidas de imágenes apagadas salvo `LOOPITA_UPLOADS_ENABLED=1`.
- CAPTCHA de Turnstile previsto: variable `NEXT_PUBLIC_TURNSTILE_SITE_KEY` y bloque `[auth.captcha]` en `supabase/config.toml`.
- Clave secreta solo en el servidor (`lib/supabase/admin.ts`, `server-only`).
- Páginas `/privacidad` y `/terminos` con marcadores `[RAZÓN SOCIAL]`, `[RUT]`, `[DOMICILIO]`, `[CORREO DE CONTACTO]` y `[PENDIENTE DE REVISIÓN LEGAL]`.
- Cuotas en la base (patrones, versiones, proyectos, lanas, denuncias, exportaciones).

## Fases

### Fase P0: cuentas y accesos (usuaria, 1 día)

1. **(usuaria)** Cuenta de Cloudflare (gratis) con plan Workers Free; agregar el sitio `loopitalab.cl`; en NIC Chile cambiar los servidores de nombre a los que indique Cloudflare (propaga en minutos a horas). Nada se enruta todavía: el sitio sigue sin contenido hasta P1.
2. **(usuaria)** En esa cuenta, Turnstile: crear un widget para `loopitalab.cl` (modo "managed"); anotar clave de sitio (pública) y clave secreta (va solo en Supabase).
3. **(usuaria)** Cuenta de Resend (gratis); agregar el dominio `loopitalab.cl` y copiar los registros DNS que pide (SPF, DKIM, DMARC) en Cloudflare. Crear una clave API solo con permiso de envío.
4. **(usuaria)** Para que los agentes desplieguen desde este equipo: `! npx cf auth login` en la terminal (abre el navegador; la sesión queda en tu usuario, nunca en el repositorio). Alternativa para la CI: un token de API con permiso solo de "Workers Scripts: Edit", guardado como secreto del repositorio en GitHub.

### Fase P1a: prueba de viabilidad en Workers (`devops`, Fable; medio día) — **puerta de decisión**

Antes de tocar el DNS o la base real. Sin cuenta se hace la parte local; el despliegue de prueba necesita P0.1 y P0.4.

1. `npx vinext check` en `apps/web`: informe de compatibilidad (nos interesan `proxy.ts`, Server Actions, `server-only`, `headers()` de `next.config.ts`, `transpilePackages` con imports `.ts` del monorepo, `next/headers`, `revalidatePath`).
2. `npx vinext init --platform=cloudflare --name loopitalab --cdn-cache=none --data-cache=none --image-optimization=none` (la app no usa ISR ni `next/image` con imágenes remotas; `revalidatePath` solo invalida rutas dinámicas). Es no destructivo: `next dev`/`next build` siguen funcionando y la CI no cambia. Dependencias nuevas (`vinext`, `vite`, `@vinext/cloudflare`) justificadas en el PR por esta decisión.
3. `build:vinext` + `start:vinext` en local (workerd): correr las **E2E sin sesión completas** (escritorio, móvil, latencia) y las **E2E con sesión** contra ese servidor en vez de `next start`. Si algo no corre en workerd, aquí aparece.
4. Despliegue de prueba a `loopitalab-prueba.<cuenta>.workers.dev` (un Worker aparte del de producción) con **Supabase local expuesta por túnel** o con un **proyecto Supabase desechable**. **Nunca con el proyecto real**, ni siquiera en modo lectura (T17-M3). La `SUPABASE_SECRET_KEY` real vive solo en el Worker de producción: nunca en GitHub ni en el Worker de prueba. Medir en el panel de Cloudflare (Metrics > CPU time, p50/p99 y `exceededCpu`) las rutas pesadas: `/estudio/[id]` con un diseño de 40.000 puntos, la acción `startProjectFromDesign` (valida el documento completo en el servidor), `getKnitPreview` (metraje), `exportar`, y las lecturas de `/proyectos/[id]/tejer` (`loadProject` y `getProgress`). Criterio: **p99 < 10 ms de CPU** en todas; si una ruta supera 10 ms de forma sostenida, Cloudflare la termina (error 1102).
5. **Puerta de seguridad (T17-M2).** vinext reimplementa Next.js: no se asume que conserve sus protecciones. Sobre el Worker de prueba (o `start:vinext` en workerd) se comprueba, y **sin las cinco en verde no se avanza**:
   1. Las Server Actions rechazan una solicitud con `Origin` ajeno (protección de Origin de Next).
   2. Las rutas protegidas (`/disenos`, `/proyectos/*`, `/lanas`, `/cuenta`) sin sesión redirigen a `/ingresar` y no devuelven contenido.
   3. La clave secreta no aparece en el bundle del cliente (buscar el valor y el prefijo `sb_secret_` en los archivos servidos).
   4. Las cabeceras de `next.config.ts` (CSP, HSTS, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`) están presentes en respuestas 200, 404, redirecciones y archivos estáticos.
   5. Las páginas con sesión responden `Cache-Control: private, no-store`.
6. Resultado documentado en `docs/despliegue.md`. Si falla: proponer aligerar (validación en el cliente ya hecha + reválida mínima en el servidor, dividir acciones) o volver a decidir el hosting. **No se avanza a P1b sin esta prueba en verde.**

### Fase P1b: despliegue real en Workers (`devops`, Fable; medio día)

1. `cloudflare.config.ts`: nombre `loopitalab`, fecha de compatibilidad reciente (≥ `2026-08-04`, que activa la compatibilidad con Node sin flag), `limits.cpu_ms` sin cambiar (el plan gratuito fija 10 ms), ruta personalizada `loopitalab.cl` y `www.loopitalab.cl` (redirige al apex). Vistas previas: ninguna (D4). **`workers_dev: false` y `preview_urls: false` antes de anunciar la beta** (T17-M3): `*.workers.dev` sería un segundo origen fuera de las reglas de la zona (límite de peticiones, Bot Fight Mode).
2. Variables: `NEXT_PUBLIC_*` existen **en el build** (vinext las incrusta): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SITE_URL=https://loopitalab.cl`, `NEXT_PUBLIC_AUTH_PROVIDERS=google`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`. Secretos del Worker de producción (`cf` / panel, nunca en el repositorio): `SUPABASE_SECRET_KEY` (**solo en el Worker de producción: nunca en GitHub ni en el Worker de prueba**) y `LOOPITA_ENV=production` (aquí no existe `VERCEL_ENV`: **obligatoria** para el candado de `/dev`, ver `docs/seguridad.md` MEDIO-2). `LOOPITA_ENV=production` y `NODE_ENV=production` también deben estar definidas en el **entorno de build y del job de despliegue** (T17-B7), no solo en el Worker: así `assertDevPagesSafe` actúa al construir. Nunca `LOOPITA_DEV_PAGES` ni `LOOPITA_UPLOADS_ENABLED`. Verificar que `process.env` del lado servidor lee los secretos del Worker en vinext (si no, leerlos con `import { env } from "cloudflare:workers"` en `lib/supabase/admin.ts` y `lib/dev-pages.ts`).
3. Despliegue desde la CI: job `deploy` en `.github/workflows/ci.yml` que corre **solo en `push` a `main`** tras los jobs actuales, con el token de P0.4 como secreto, `permissions: contents: read`, acciones fijadas por SHA, y `--dry-run` previo. El job usa un **entorno de GitHub (`production`) con aprobación manual** y el token vive como secreto de ese entorno: los PR de forks no reciben secretos. Primer despliegue manual desde este equipo si la usuaria lo prefiere.
4. Comprobación en el dominio o en una ruta de prueba antes de anunciar: `/dev/estudio` y `/dev/*` responden 404 (con una **E2E sobre workerd** que lo afirme, T17-B7), cabeceras de `next.config.ts` presentes (vinext respeta `headers()`), `/api/subidas` responde 404, ingreso con correo funciona contra la base real con la cuenta de la usuaria.
5. Dominio: ruta personalizada en el Worker (Cloudflare crea los registros DNS y el certificado); `www` → apex. HSTS ya con `includeSubDomains`; **sin `preload`** hasta pasar un mes estable. En Cloudflare, SSL/TLS en modo "Full (strict)" y "Always Use HTTPS".
6. Mantener activo el proyecto Supabase gratuito (se pausa tras 7 días sin uso): un **Cron Trigger** del Worker (gratis, hasta 5) cada 2 días que llama al endpoint de salud (P3.4), el cual hace una lectura mínima con la clave publicable (sin datos personales). Como respaldo, un workflow de GitHub Actions programado.
7. Protección gratuita de Cloudflare delante del Worker (T17-M4): una regla de límite de peticiones (1 en el plan gratuito) sobre **`POST` al host por IP**, con umbral holgado. Las Server Actions no tienen ruta propia (son `POST` a la ruta de la página) y el ingreso va directo a Supabase, así que una regla sobre `/auth/*` no los cubriría. Incluir `/api/salud` dentro de la regla. Además, "Bot Fight Mode" si no interfiere con las E2E.

### Fase P2: Supabase en producción (`backend-supabase`, Fable; medio día)

1. Auth > URL Configuration: `Site URL = https://loopitalab.cl`; Redirect URLs: `https://loopitalab.cl/auth/callback` (exacta). Quitar `localhost` del proyecto real (queda solo en `config.toml` para local).
2. Auth > SMTP: Resend (host `smtp.resend.com`, usuario `resend`, contraseña = clave API), remitente `no-responder@loopitalab.cl`; plantillas de correo en español (confirmación, recuperación, cambio de correo, "contraseña cambiada" si está disponible) con el dominio nuevo. Límites de envío de Auth ajustados al tope de Resend.
3. Auth > Attack Protection: CAPTCHA Turnstile activado **a la vez** que el despliegue de la web con `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (si se activa antes, los formularios fallan con `captcha_failed`; ver `supabase/config.toml`). Verificar que los formularios de ingreso, registro y recuperación envían `captchaToken`.
4. Google OAuth **(usuaria en Google Cloud Console)**: pantalla de consentimiento con dominio `loopitalab.cl`, enlaces a `/privacidad` y `/terminos`, URI de redirección la de Supabase (no cambia). Publicar la app (solo alcances básicos: correo y perfil; no requiere verificación de Google). Sigue como riesgo aceptado (F2-M7 sin plan Pro).
5. Registrar `config.toml` con `site_url`/`additional_redirect_urls` de producción mediante `env(...)`, sin romper el `supabase start` local de la CI.
6. Comprobar los avisos del panel (`get_advisors`) y que las migraciones del repositorio coinciden con las remotas (`list_migrations`). La migración `20261113145129_tope_part_id_y_detalle_cuotas.sql` (T17-M1 y B5) ya está aplicada (2026-11-13).
7. Auth > Rate Limits: revisar los límites de Supabase Auth (ingreso, registro, recuperación, correos), porque el ingreso va directo a Supabase y la regla de Cloudflare no lo cubre (T17-M4).
8. Pendientes de seguridad de la fase 3 que se cierran aquí (ver `docs/seguridad.md`, "Falta antes de la beta"): avisos por correo de identidad vinculada y desvinculada; verificar la purga programada (`cron.job`); comprobaciones en la base real (`session_id`, `amr`, token tras el bloqueo); repetir `10_rls_check.sql` en el proyecto real sin dejar datos (transacción con rollback o una rama).

### Fase P3: endurecimiento de la web (`frontend-editor` + `revisor-seguridad`, Fable; 1 día)

1. **CSP completa** (pendiente en `docs/seguridad.md`): `default-src 'self'`; `object-src 'none'`; `base-uri 'self'`; `script-src` con nonce + `https://challenges.cloudflare.com`; `frame-src https://challenges.cloudflare.com`; `connect-src 'self' https://<proyecto>.supabase.co wss://<proyecto>.supabase.co`; `img-src 'self' data: blob: https://<proyecto>.supabase.co`; `style-src 'self' 'unsafe-inline'` (Tailwind) o nonce; `form-action 'self' https://<proyecto>.supabase.co https://accounts.google.com`. Probar en local con `next build && next start`, con `start:vinext` (workerd) y en el `*.workers.dev` antes del dominio. El nonce por petición se genera en `proxy.ts`; comprobar que vinext lo soporta (si no, CSP con hashes de los scripts en línea de Next).
2. Turnstile en los formularios de acceso (si falta alguno), con texto accesible y fallback de error claro.
3. Página pública de inicio con descripción, estado "beta", enlaces a privacidad y términos; `robots.txt` y `sitemap` solo con las rutas públicas (`/`, `/privacidad`, `/terminos`, `/explorar` si existe); metadatos Open Graph.
4. Endpoint de salud `GET /api/salud` (sin datos, sin clave secreta) para P1b.6, con **respuesta constante** (no refleja el estado de Supabase ni errores) y dentro de la regla de límite de peticiones.
5. Revisión de `revisor-seguridad`: variables en Cloudflare (build y Worker), CSP, cookies (`Secure`, `SameSite`), que ningún secreto llegue al bundle, cabeceras con un escáner gratuito (Mozilla Observatory, securityheaders.com) y TLS (SSL Labs).

### Fase P4: legal (usuaria + abogado; `documentador` solo redacta)

1. **(usuaria)** Datos de la responsable: razón social o nombre, RUT, domicilio y correo de contacto de privacidad; reemplazar los marcadores de `/privacidad` y `/terminos`.
2. **(usuaria + abogado)** Revisión de ambos textos frente a la **Ley 21.719** (vigencia 2026-12-01) y la Ley 19.628: base de licitud, derechos ARCO y canal de ejercicio, plazos de conservación, transferencias internacionales (Supabase y Cloudflare alojan fuera de Chile; Google si usan OAuth), encargados de tratamiento (**Cloudflare**, que sirve la web y ve el tráfico, y **Resend**, que envía los correos; confirmar y declarar ambos en `/privacidad`, T17-B6), menores de edad, el respaldo local no cifrado y el avance de tejido guardado en el navegador (cola local, 14 días) que ya se describen. Quitar `[PENDIENTE DE REVISIÓN LEGAL]` solo con el visto bueno.
3. Aviso de cookies: la web usa solo cookies de sesión necesarias; se declara en `/privacidad` sin banner, salvo que el abogado indique lo contrario.
4. Correo de contacto real funcionando (puede ser un alias en el dominio, gratis en Cloudflare Email Routing).

### Fase P5: verificación y apertura (`qa-tester` + usuaria; medio día)

1. **(usuaria)** Prueba manual en producción con su propia cuenta: registro con confirmación por correo, ingreso con Google, crear diseño, guardar versión, "Mis lanas", exportar datos, cambiar contraseña, cerrar sesión. (No se crean cuentas de prueba en el proyecto real.)
2. Latencia CA-P6 en el equipo de referencia contra el sitio real (`/dev` está cerrado: se mide con `next build && next start` local, como documenta `apps/web/e2e/README.md`).
3. Lighthouse (rendimiento, accesibilidad, buenas prácticas) sobre `/`, `/ingresar` y el estudio con sesión.
4. Antes de la apertura, cerrar la lista "Falta antes de la beta" de `docs/seguridad.md`: avisos por correo de identidad vinculada y desvinculada; prueba M3 (decidir dónde: no se crean cuentas de prueba en el proyecto real); purga programada verificada; comprobaciones en la base real; `10_rls_check.sql` repetido sin dejar datos; y la **política de logs del Worker** (sin cuerpos ni query strings, retención declarada).
5. Apertura: anunciar la beta a las tejedoras con la hoja de validación (`docs/validacion-tejedoras.md`). Registro abierto pero protegido por CAPTCHA y cuotas; si hay abuso, se cierra el registro desde Supabase (Auth > "Allow new users to sign up").

## Costos

| Servicio | Plan | Costo | Límite relevante |
|---|---|---|---|
| Dominio `loopitalab.cl` | NIC Chile | ya pagado | renovación anual |
| Cloudflare Workers (vinext) | Workers Free | $0 | **10 ms de CPU por petición**, 100.000 peticiones/día, 50 subpeticiones por petición, 128 MB; activos estáticos gratis e ilimitados |
| Supabase | Free | $0 | se pausa tras 7 días sin uso (mitigado en P1b.6); sin límites de sesión por inactividad (riesgo aceptado) |
| Cloudflare DNS + Turnstile + Email Routing | Free | $0 | sin límite práctico para la beta |
| Resend | Free | $0 | 100 correos/día, 3.000/mes |
| GitHub Actions | Free (repositorio público) o 2.000 min/mes (privado) | $0 | la CI actual usa ~25 min por PR |

## Riesgos y condiciones

- **10 ms de CPU por petición en Workers Free.** Cloudflare indica que el render en servidor y la autenticación suelen usar 10 a 20 ms; nuestras Server Actions validan el documento completo (`validatePattern`, `yarnUsage`: ~14 ms en un motivo de 200×200 con repeticiones grandes). Hay tolerancia para excesos ocasionales, pero el exceso sostenido termina la petición (error 1102). Por eso P1a mide antes de comprometer el dominio. Mitigaciones si hace falta: validar solo lo necesario en el servidor, mover cálculos pesados al navegador (ya ocurre en el estudio), y como última opción Vercel Hobby (gratis, solo uso no comercial).
- **vinext está en beta.** `next build` sigue siendo el camino de la CI; si vinext rompe una funcionalidad, el despliegue se detiene y la aplicación local no cambia. Se fija la versión de vinext en `package.json` y se actualiza solo con las E2E en verde.
- **100.000 peticiones/día.** Suficiente para una beta; superado el tope, el Worker devuelve error 1027 hasta medianoche UTC (modo "fail closed" para no servir sin la aplicación).
- **Sin plan Pro de Supabase no hay límites de inactividad de sesión ni MFA obligatoria:** F2-M7 queda como riesgo aceptado documentado; mitigación parcial con el aviso por correo de "contraseña cambiada" si el SMTP propio lo permite.
- **Resend 100/día:** suficiente para una beta de decenas de tejedoras; si se supera, el registro espera al día siguiente (Supabase devuelve error de límite, que la web ya traduce).
- **Ley 21.719 entra en vigencia el 2026-12-01:** la beta con cuentas externas no debe abrirse antes de la revisión legal (decisión 9 de la fase 3).
- **Pausa del proyecto Supabase:** si el workflow de salud deja de correr (repositorio inactivo 60 días, GitHub lo desactiva), el proyecto puede pausarse; se reactiva a mano desde el panel sin pérdida de datos.

## Orden y dependencias

P1a (parte local) puede empezar hoy sin cuentas → P0 (usuaria) → P1a (despliegue de prueba y medición de CPU) → **puerta de decisión** → P1b y P2 en paralelo → P3 (depende de P1b para probar CSP y Turnstile en el `*.workers.dev`) → P4 en paralelo desde el inicio (solo la usuaria y el abogado) → P5 cuando P1b a P4 estén cerradas. La apertura a tejedoras (T1b) depende de P5.

## Lo que NO entra en este plan

- Pipeline de IA (fase 5): necesita presupuesto de API de Anthropic; se evaluará con límites de costo cuando llegue.
- Monitoreo de errores (Sentry y similares): hay planes gratuitos, pero añaden un tercero con datos de usuarias; se decide con la revisión legal.
- Subidas de imágenes: siguen apagadas (`LOOPITA_UPLOADS_ENABLED` sin definir).
