# Seguridad: estado y pendientes

Última revisión: 2026-11-12 (T17, fase 3; ver "Revisión final de la fase 3"). Antes: 2026-11-06 (T15, revisión de T4; correcciones en esta rama) y 2026-11-05, agente `revisor-seguridad`, sobre la rama `fase-2/preparacion` (antes: 2026-11-04, rama `fase-1/supabase-auth`). Sin hallazgos críticos. Las comprobaciones de RLS están en `supabase/checks/10_rls_check.sql` y corren en CI. Corren dos veces: sobre Postgres con stubs (job "Migraciones y RLS") y sobre la Supabase local de la CLI (job "E2E con sesión").

**E2E con sesión.** Las E2E usan Supabase local (Docker, CLI 2.122.1) con claves de desarrollo; nunca el proyecto real. `playwright.config.ts` y `e2e/sesion/support.ts` fallan si la URL no es `127.0.0.1` o `localhost`; las cuentas de prueba (`@e2e.loopitalab.test`) se crean y se borran en cada corrida, y la clave secreta local solo llega al servidor de pruebas (`apps/web/e2e/README.md`).

## Corregido

| Hallazgo | Corrección | Dónde |
|---|---|---|
| T7 de la fase 3 (2026-11-10): "Tejer este diseño" (ADR 0009). Antes, `projects.pattern_version` era un entero sin clave foránea que el cliente podía escribir, y `pattern_id` también | Corregido en el repo; **migración aplicada en el proyecto real el 2026-11-11** (y pendiente de la revisión T17). `pattern_version` se elimina (falla si hubiera filas con valor). `pattern_version_id → pattern_versions(id) on delete no action` más una clave compuesta `(pattern_version_id, pattern_id)` (la versión es del patrón del proyecto). El cliente ya no escribe `pattern_id` ni `pattern_version_id`: INSERT de `projects` limitado a `id, owner_id, title, status`, UPDATE a `title, status`; `project_progress` solo el puntero (`part_id, round_number, stitch_index`; `device` deja de ser escribible) y cotas `round_number ≤ 100.001`, `stitch_index ≤ 100.000`. `pattern_versions` inmutable también para `service_role` (disparador). `start_chart_project` y `repin_project` son `security definer` con `search_path` vacío y **solo las ejecuta `service_role`**: la base no puede correr `validatePattern`, así que si las ejecutara `authenticated` cualquier sesión fijaría por /rpc un borrador con errores de tejido. La Server Action (T11) lee el documento desde la base, exige `valid` y las llama con la clave secreta y `p_owner_id` de `auth.getUser()`; el `updated_at` exacto garantiza que lo fijado es lo validado. La lista permitida del check no cambia. Probado en Postgres local con stubs, todas las migraciones, el check, mutaciones (cada una hace fallar el check), la guardia de `pattern_version` y la reversión | `20261111031813_tejer_disenos.sql`, `supabase/checks/10_rls_check.sql` (sección T7) |
| Limpieza menor (T3, 2026-11-09). Cinco funciones de trigger de `public` (`set_updated_at`, `patterns_guard_origin`, `projects_check_pattern`, `pattern_reports_quota`, `patterns_quota`) conservaban EXECUTE para `anon` y `authenticated` vía PUBLIC. No son invocables por /rpc, así que sin impacto explotable; aun así, sobraba | Corregido; **migración aplicada en el proyecto real el 2026-11-11**. Revoca EXECUTE de `public`, `anon` y `authenticated` en esas cinco. El check verifica ahora que ninguna función de trigger de `public` es ejecutable por `anon` ni `authenticated` (la lista permitida solo cubría funciones que no son de trigger). Probado en Postgres local con stubs, todas las migraciones, el check y la reversión (la reversión hace fallar el check) | `20261111031138_revocar_execute_triggers.sql`, `supabase/checks/10_rls_check.sql` |
| M1. La etiqueta de IA se podía quitar o falsificar | Un trigger impide crear patrones `ai` desde el cliente o quitarles la etiqueta; editar uno lo marca `ai_edited` | Migración `…034436_endurecimiento_seguridad.sql` |
| M2. Los patrones públicos exponían `owner_id` y `ai_meta` | Se eliminó `ai_meta`. La tabla solo deja leer los propios. Lo público se lee con `list_public_patterns` y `get_shared_pattern`, que devuelven columnas seguras y el nombre visible | Ídem |
| M3. Las subidas saltaban la validación del servidor | Se quitaron las políticas de inserción del cliente; subir pasa por el servidor (validar contenido, re-codificar y quitar EXIF) | Ídem |
| M4. Cualquier sesión podía cambiar la contraseña | Exige el enlace de recuperación de los últimos 15 minutos o una verificación de contraseña de los últimos 5 minutos (hecha en el navegador, ver F2-M4); después cierra las demás sesiones | `apps/web/src/app/(acceso)/actions.ts`, `lib/recovery.ts` |
| M5. Límite de intentos compartido por todas las usuarias | Ingreso, registro y recuperación corren en el navegador; Supabase ve la IP real de cada persona | `app/(acceso)/client-actions.ts` |
| B2. `yarns` como objeto esquivaba la regla de notas privadas | `yarns` debe ser arreglo | Migración de endurecimiento |
| B3. Un proyecto quedaba bloqueado si su patrón dejaba de ser público | El patrón se valida solo al asociarlo o cambiarlo (trigger) | Ídem |
| B4. Columnas editables de más (`id`, `created_at`, `project_id`) | Permisos de UPDATE por columna | Ídem |
| B5. Versiones sin tope | Máximo 200 por patrón | Ídem |
| B6. La URL de los correos podía salir del encabezado `Origin` | Se arma en el navegador con `NEXT_PUBLIC_SITE_URL` o el origen real de la página | `client-actions.ts` |
| B7. El callback aceptaba `token_hash` con cualquier `type` | Solo flujo PKCE (`?code=`) | `app/auth/callback/route.ts` |
| B8. Cierre de sesión desde otro sitio | Solo acepta solicitudes del mismo sitio | `app/auth/salir/route.ts` |
| B9. La configuración de Auth no estaba fijada | Confirmación de correo, cambio de contraseña seguro y contraseñas de 8 caracteres con letras y números | `supabase/config.toml` y panel de Supabase (aplicado el 2026-11-04) |
| B10. `.gitignore` incompleto | `.env*` excepto `.env.example` | `.gitignore` |
| B10 (segunda parte). Lockfile sin versionar | `pnpm-lock.yaml` versionado y CI con `--frozen-lockfile` | `.github/workflows/ci.yml` |
| B1. Documentos ajenos sin validar | `getSharedPattern` y `listPublicPatterns` pasan todo documento por `validatePattern` y validan el id como UUID antes de consultar | `apps/web/src/lib/shared-pattern.ts` |
| M3 (segunda parte). Subida de imágenes | `POST /api/subidas`: bytes mágicos reales (JPEG, PNG, WebP), máximo 10 MB y 24 MP, re-codificación a WebP sin EXIF/GPS/ICC, ruta armada por el servidor. Borrado solo por `DELETE /api/subidas/[id]` | `apps/web/src/app/api/subidas/` |

### Revisión de la fase 2 (2026-11-05)

| Hallazgo | Corrección | Dónde |
|---|---|---|
| F2-M1. El tope de subidas se saltaba borrando filas propias | Sin DELETE del cliente en `uploads` ni en `storage.objects`. Los topes cuentan sobre `rate_events`, bitácora de solo inserción que el cliente no ve | Migración `20261105133225_denuncias_y_derechos.sql` |
| F2-M2. Intentos fallidos sin límite y sin control de concurrencia | `begin_operation` cobra el intento antes de procesar (60 intentos y 30 imágenes por día). Una subida a la vez por usuaria (`operation_locks`, vence en 2 min). Semáforo de 2 re-codificaciones por instancia. Límite de 24 MP | Migración, `api/_lib/operations.ts`, `api/_lib/semaphore.ts` |
| F2-M3. Exportación sin tope en memoria | Streaming tabla por tabla; si una tabla falla, la descarga se corta (nunca un JSON válido incompleto). Una a la vez y 5 por día | `api/cuenta/exportar/route.ts` |
| F2-M4. Re-verificación de contraseña desde el servidor compartía el límite por IP | La contraseña se verifica en el navegador (con CAPTCHA). El servidor exige una autenticación `password` en `amr` de los últimos 5 minutos | `lib/recovery.ts`, `YourData.tsx`, `NewPasswordForm.tsx` |
| F2-B1. Carrera entre subir y eliminar la cuenta | Bloqueo y cierre global de sesiones antes de borrar; segunda pasada por la carpeta después de `deleteUser` | `api/cuenta/eliminar/route.ts` |
| F2-B2. Las denuncias se borraban con el patrón | `pattern_id` con `on delete set null` e instantánea (título, sha256, autora) guardada por trigger | Migración |
| F2-B3. Los patrones compartidos por enlace no se podían denunciar | `public` y `unlisted` son denunciables | Migración |
| F2-B4. Sin encabezados de seguridad | `frame-ancestors 'none'`, `X-Frame-Options`, `Referrer-Policy`, `nosniff`, `Permissions-Policy` | `apps/web/next.config.ts` |
| F2-B5. Cuerpo de eliminar sin tope real | Lectura con tope de 16 KB | `api/_lib/request.ts` |
| F2-B7. Casos de RLS faltantes | Agregados a `10_rls_check.sql` | `supabase/checks/` |
| F2-B8. Fallo silencioso al borrar archivos huérfanos | Se registra con `console.error` | `api/subidas/route.ts` |
| F2-B9. Textos legales que no coincidían con el código | Corregidos; siguen en borrador | `app/privacidad`, `app/terminos` |
| F2-M5. Un ingreso reciente bastaba para cambiar la contraseña o borrar la cuenta | Re-autenticación atada a la acción: `POST /api/cuenta/reautenticar` emite un intento (`begin_reauth`, nonce en cookie httpOnly SameSite=Strict, 5 min). El navegador verifica la contraseña (crea una sesión nueva) y la acción llama a `consume_reauth`, que exige una autenticación `password` posterior al intento, otro `session_id`, la misma acción y un solo uso. Tope de 20 intentos por hora. Se descartó `reauthenticate()`: solo cubre el cambio de contraseña, envía un correo cada vez y no cierra la ventana con `secure_password_change` | `api/_lib/reauth.ts`, `api/cuenta/reautenticar`, `lib/recovery.ts` |
| F2-M6. Las denuncias conservaban sin plazo el identificador de la autora | `pattern_owner_id` pasa a null al cerrar la denuncia o a los 180 días; el título y el hash quedan como evidencia | Migración, `purge_expired_data()` |
| F2-B11. `end_operation` soltaba candados ajenos | Candados con token (`begin`/`renew`/`end_operation`). Subida: 60 s para recibir el cuerpo y candado de 2 min. Exportación: candado de 5 min, renovado cada minuto | Migración, `api/_lib/operations.ts` |
| F2-B12. El enlace de la política gastaba dos exportaciones | Enlaza a `/cuenta#tus-datos` | `app/privacidad` |
| F2-B13. `rate_events` no se podía purgar | `purge_expired_data()` (solo `service_role`): `rate_events` 30 días, intentos de re-autenticación y candados abandonados 1 día. Se programa con pg_cron (`loopitalab-purga-diaria`, `17 4 * * *`) si la extensión está activa | Migración |
| F2-B14. `.env.example` incompleto | Lista todas las rutas que usan `SUPABASE_SECRET_KEY` | `apps/web/.env.example` |
| F2-B17. Se podía emitir un intento de re-autenticación sin `session_id` | El servidor y `begin_reauth` lo rechazan (falla cerrado) | `api/_lib/reauth.ts`, migración |
| F2-B19. Las confirmaciones de contraseña no figuraban en la política | Declaradas, con plazo de 1 día | `app/privacidad` |
| F2-B15 y F2-B16. Textos de denuncias y cuenta suspendida | Corregidos; la vía para cuentas suspendidas es el correo de contacto | `app/privacidad`, `app/terminos` |

### Revisión del acceso con proveedores (2026-11-05, rama `fase-2/oauth`)

| Hallazgo | Corrección | Dónde |
|---|---|---|
| A1. Un ingreso con Google bastaba para eliminar una cuenta con contraseña (y Google vinculado automáticamente), sin escribir ninguna clave en un equipo compartido | `consumeReauthIntent` elige el método por acción. Eliminar la cuenta: si tiene contraseña (`public.user_has_password`), solo `password` y con la hora de **ese** ingreso, aunque haya un `oauth` más reciente; si no la tiene, `password` u `oauth`; si no se puede saber, falla cerrado | Migración `20261105231613_estado_contrasena.sql`, `lib/password-status.ts`, `api/_lib/reauth.ts`, `lib/recovery.ts` (`passwordAuthAt`, `oauthAuthAt`) |
| M1. Un ingreso con proveedor servía para crear o cambiar la contraseña | Cambiar la contraseña exige siempre `password`. Una cuenta solo OAuth crea su primera contraseña con el enlace por correo (`hasRecentEmailProof`) | `api/_lib/reauth.ts`, `(acceso)/actions.ts` |
| M4. Microsoft con tenant `common` sin `xms_edov` probado | Tenant `consumers` por defecto; `common` comentado y condicionado a `xms_edov` | `supabase/config.toml`, `docs/puesta-en-marcha.md` |
| B2. La exportación no incluía las formas de ingreso | `account.identities`: proveedor, fechas e `identity_data`, copiados campo por campo (sin tokens) | `api/cuenta/exportar/route.ts` |
| B5. Saber si la cuenta tiene contraseña dependía de la lista de identidades | El servidor consulta `public.user_has_password` (solo `service_role`, devuelve un booleano, nunca el hash). La lista de identidades queda solo para decidir qué botones mostrar | Migración, `lib/password-status.ts` |
| B6. Comentarios desactualizados (`?via=oauth`) | Corregidos en `reauth.ts`. El comentario SQL de `consume_reauth` (migración ya aplicada) no se cambia: la función solo compara horas y sesiones, y la elección del método vive en `reauth.ts` | `api/_lib/reauth.ts` |
| B7. Vinculación manual de identidades sin fijar | `enable_manual_linking = false` en `[auth]` | `supabase/config.toml` |
| N1 (segunda revisión). Sin la clave secreta o sin la migración, `/nueva-clave` bloqueaba también la recuperación por correo | Con el enlace del correo se ofrece fijar la contraseña aunque no se pueda consultar `user_has_password` | `(acceso)/nueva-clave/page.tsx` |
| N3. El callback seguía aceptando `/nueva-clave?reauth=change_password` como vuelta de re-autenticación | Solo `/cuenta?reauth=delete_account`; `change_password` queda fuera a propósito | `lib/auth-callback.ts` |
| N4. Comentario del cliente admin limitado a Route Handlers | Ahora dice servidor (Route Handlers, server actions y server components), sin pasar el cliente ni sus errores al navegador | `lib/supabase/admin.ts` |
| O7 (QA). `anon` y `authenticated` tenían TRUNCATE (que no pasa por RLS) en todas las tablas de `public`, por los privilegios por defecto de Supabase | Migración que revoca TRUNCATE, REFERENCES y TRIGGER a `anon` y `authenticated`, TRUNCATE a `service_role` (la purga usa DELETE), y ajusta los privilegios por defecto para tablas futuras. PostgREST no lo exponía: es defensa en profundidad. `10_rls_check.sql` lo verifica, incluida una tabla creada después | Migración `20261106035626_sin_truncate.sql`, `supabase/checks/10_rls_check.sql` |
| T15-1 (medio). El bloque de default privileges de `postgres` tragaba `insufficient_privilege` con un aviso | Se quitó el `exception`: si no se pueden ajustar, la migración falla. En Supabase la corre `postgres` | `20261106035626_sin_truncate.sql` |
| T15-2 (medio). Funciones y secuencias futuras nacían con EXECUTE/USAGE para los roles de la API | Secuencias: sin USAGE/SELECT/UPDATE para `anon` y `authenticated` (actuales y futuras). Funciones: se quitan las entradas por defecto de `anon` y `authenticated` en `public`, pero **no** el EXECUTE global de PUBLIC: es global, y en este proyecto `pgcrypto`, `uuid-ossp` y `pg_stat_statements` son de `postgres`, así que revocarlo rompería extensiones futuras. La red es una **lista permitida** en el check de CI: falla si una función de `public` (que no sea de trigger) es ejecutable por `anon` o `authenticated` sin estar en la lista. Exponer una función nueva exige grant explícito en su migración y agregarla a la lista | `20261106035626_sin_truncate.sql`, `checks/10_rls_check.sql` |
| T15-3 (medio). `update palette_colors set orden = -orden` no era idempotente (chocaba con `unique(orden)` al reaplicar) | Desplazamiento +10000/+20000 solo donde `orden < 10000` (columna smallint), en el generador; probado aplicando la v2 dos veces | `scripts/gen-reference-sql.ts`, `20261106035603_datos_referencia_v2.sql` |
| T15-4 (bajo). El generador interpolaba valores del JSON sin validar tipo | `num`, `int`, `bool` y `str` lanzan si llega un tipo inesperado | `scripts/gen-reference-sql.ts` |
| T15-5 (bajo). El check no cubría funciones/secuencias ni decía con qué rol correr | Comentario (correr como `postgres`; no cubre `supabase_admin`) y lista permitida de funciones ejecutables por la API y de secuencias sin privilegios | `supabase/checks/10_rls_check.sql` |
| T15-6 (bajo). Si la relectura sin `mirror_knitting` fallaba, no quedaba rastro | Se registra solo el código de error; prueba añadida | `lib/session.ts`, `test/session-fallback.test.ts` |

## Acceso con proveedores (OAuth)

Ingreso con Google y Microsoft (proveedor `azure` de Supabase) además de correo y contraseña. Flujo PKCE: el navegador llama a `signInWithOAuth`, el proveedor vuelve a Supabase Auth y este a `/auth/callback`, que canjea el código (`lib/auth-callback.ts` documenta parámetros y redirecciones). Configuración en `supabase/config.toml` y `docs/puesta-en-marcha.md`, sección 2b. Estado al 2026-11-08: Google **activo** en el proyecto real desde el 2026-11-05 (`config.toml`, `enabled = true`); Microsoft **apagado** en el panel (verificado) y en `config.toml`. Ver ALTO-1 de T15 (riesgo aceptado).

**Vinculación automática por correo.** Supabase Auth vincula una identidad nueva (Google o Microsoft) a la cuenta existente que tenga el mismo correo, **solo si el proveedor declara el correo como verificado**. Es seguro porque quien controla ese correo ya podría entrar a la cuenta con "recuperar contraseña". Con un correo no verificado, la vinculación sería una toma de cuenta: alguien crea en un proveedor una cuenta con el correo de otra persona y entra a la de ella.
- Google: entrega `email_verified`; las cuentas de Google tienen el correo verificado.
- Microsoft: es el riesgo real (el caso "nOAuth"). Con una app multi-tenant (`common`), la administradora de cualquier tenant de Entra puede poner a una usuaria el correo que quiera, sin verificarlo. Supabase solo trata el correo como verificado si viene el claim opcional `xms_edov` (dominio verificado por la organización) o si es una cuenta personal. Por eso el proyecto usa por defecto el tenant `consumers` (solo cuentas personales; en Entra, tipo de cuenta "Solo cuentas personales de Microsoft"). Pasar a `common` exige declarar `xms_edov` (puesta en marcha, paso 5 de Microsoft) y probarlo antes (ver Pendiente).
- El aviso por correo "identity linked" es la segunda capa: la dueña se entera si alguien vincula un proveedor a su cuenta.
- **Vincular un proveedor agrega un método de ingreso** que no depende de la contraseña: cambiarla o cerrar sesiones no lo quita. Por eso las mitigaciones de F2-M7 (aviso de contraseña cambiada, sesiones con tiempo máximo e inactividad, MFA) son requisito **antes** de activar los proveedores (ver Riesgos aceptados y Pendiente).
- **Vinculación manual desactivada** (`enable_manual_linking = false` en `config.toml`, B7). Si se activara, cualquiera con una sesión abierta de la usuaria (equipo compartido, token robado) podría llamar a `linkIdentity` y vincular **su** Google o Microsoft a la cuenta ajena: un acceso permanente que sobrevive al cambio de contraseña. No activarla sin re-autenticación previa con contraseña y sin el aviso "identity linked".
- **Cuentas sin confirmar.** Si alguien registra con correo y contraseña X una dirección ajena (sin confirmarla) y después la dueña real entra con Google con ese correo, la vinculación no debe dejar que X sirva. Está pendiente comprobarlo en la base real (M3, ver Pendiente).

**Re-autenticación con proveedor (F2-M5, A1, M1).** El método que vale depende de la acción y de si la cuenta tiene contraseña. El servidor lo sabe por `public.user_has_password` (migración `20261105231613_estado_contrasena.sql`, solo `service_role`, `lib/password-status.ts`), no por la lista de identidades (B5).

| Acción | Cuenta con contraseña | Cuenta sin contraseña (solo Google o Microsoft) |
|---|---|---|
| Eliminar la cuenta | Solo `password`, con la hora de ese ingreso | `password` u `oauth` (el más reciente) |
| Cambiar o crear la contraseña | Solo `password`, o el enlace por correo | Solo el enlace por correo (`recovery`/`otp` de los últimos 15 minutos) |

Si `user_has_password` falla, eliminar la cuenta falla cerrado y `/nueva-clave` no ofrece nada sin el enlace del correo. Con el enlace de recuperación la contraseña se puede fijar igual (segunda revisión, N1): ese camino no usa la clave secreta, así que la recuperación de contraseña no depende de ella ni de la migración. El flujo con proveedor es: intento (`begin_reauth`) → `signInWithOAuth` → `/auth/callback?next=/cuenta?reauth=delete_account` → sesión **nueva** con `amr` `oauth` → `consume_reauth`, que exige ingreso posterior al intento, otro `session_id`, la misma acción, menos de 5 minutos y un solo uso (la SQL no cambió). `lib/recovery.ts` expone la hora de cada método por separado (`passwordAuthAt`, `oauthAuthAt`); `api/_lib/reauth.ts` elige cuál usar. `recovery`, `otp` y `magiclink` **no** cuentan para la re-autenticación: prueban acceso al correo y ya tienen su propio camino (solo cambio de contraseña, 15 minutos).
- Qué garantiza: que la usuaria completó un ingreso con el proveedor vinculado a esta cuenta después de pedir la acción, en este navegador (PKCE) y en los últimos 5 minutos. Una cookie de sesión robada no basta. Una cuenta con contraseña no se puede eliminar ni cambiar de contraseña solo con un proveedor.
- Qué **no** garantiza: la marca `oauth` es la hora del ingreso en Supabase, no prueba que la usuaria haya escrito su contraseña en el proveedor. Si tiene la sesión de Google o Microsoft abierta en ese equipo, el proveedor puede devolverla sin preguntar nada.
- Tampoco protege de quien controla el **correo** de la cuenta: con Gmail abierto en un equipo compartido se puede pedir el enlace por correo, crear o cambiar la contraseña y después eliminar la cuenta. Esto ya existía sin OAuth (controlar el correo equivale a controlar la cuenta) y A1/M1 no lo cambian.
- Mitigación: la web agrega parámetros para forzar el reingreso (`REAUTH_QUERY_PARAMS` en `lib/auth-providers.ts`).
  - Microsoft: `prompt=login` está soportado y obliga a escribir las credenciales (o usar Windows Hello o una passkey).
  - Google: no soporta `prompt=login`. `prompt=select_account` muestra el selector de cuentas (la usuaria tiene que elegir la cuenta, pero no escribe la contraseña si ya tiene sesión). `max_age=0` es un parámetro estándar de OpenID Connect que Google no documenta en su lista de parámetros; puede no tener efecto. No hay forma documentada de obligar a Google a pedir la contraseña.
- **Riesgo aceptado (medio), acotado:** solo en cuentas **sin contraseña** y solo para **eliminar la cuenta**: con una sesión de Google abierta en un equipo compartido, quien tenga ese equipo puede confirmar la eliminación sin conocer ninguna contraseña. Es el mismo nivel que tiene la propia cuenta de Google en ese equipo, que es el único medio de acceso de esa cuenta. A futuro: MFA (aal2) para acciones sensibles.

**Datos que entregan los proveedores.** Nombre, correo, foto (URL del avatar) e identificador de la cuenta. Supabase Auth los guarda en `auth.users.raw_user_meta_data` y `auth.identities.identity_data` (no se puede evitar). La aplicación no los copia: `handle_new_user` solo lee `display_name`, que los proveedores no envían, así que el nombre real de Google o Microsoft **no** se publica como autora de patrones (queda "Tejedora" hasta que la usuaria elija un nombre). No se guarda el avatar en `profiles` ni se muestra. Los permisos pedidos son solo `openid`, `email` y `profile`.

**CAPTCHA.** No aplica al flujo OAuth: Supabase Auth no pide `captchaToken` en `signInWithOAuth` y la protección contra bots la hace el proveedor. El CAPTCHA sigue en registro, ingreso con contraseña y recuperación.

**Callback.** `?error=` (la usuaria cancela o el proveedor falla) redirige a `/ingresar?error=oauth` o, si `next` es la vuelta de una re-autenticación con proveedor (solo `/cuenta?reauth=delete_account`; `/nueva-clave` ya no lo es, N3), a esa misma ruta con `reauth_error=1`. `error_description` nunca se refleja en la URL ni en los logs; el código de error se registra saneado (`[a-z0-9_]`). `next` pasa siempre por `safeNext` (rutas internas con query; rechaza `//`, `\`, esquemas y caracteres de control).

### Revisión de T4 (T15, 2026-11-06)

**Las Server Actions no son una barrera: la base es la única barrera.** Cualquier persona con sesión puede llamar a la API de Supabase (PostgREST) directo con su propio token, sin pasar por `app/disenos/actions.ts`. Todo lo que una Server Action "fija" (visibilidad privada, origen manual, tope de tamaño, cuota) debe estar también impuesto por permisos, restricciones o disparadores en la base; la acción solo da mensajes claros. Una regla que vive solo en la aplicación no es una regla.

| Hallazgo | Estado | Corrección o pendiente | Dónde |
|---|---|---|---|
| M2 (medio). `authenticated` podía poner `visibility = 'public'` por UPDATE o INSERT directo | Corregido | `authenticated` ya no tiene UPDATE ni INSERT sobre `visibility`: INSERT limitado a `id, owner_id, title, technique, kind, schema_version, origin, document` (la fila nace `private` por el default) y UPDATE a `title, technique, kind, schema_version, origin, document`. Las acciones ya no nombran `visibility` (nombrarla en un INSERT falla aunque valga `private`). Publicar queda para la fase 7: Server Action o función que exija `valid` y escriba con `service_role`. Verificado en el check (la usuaria no puede publicar ni volver a privado; el superusuario sí) | `20261106153415_publicar_y_cuotas.sql`, `checks/10_rls_check.sql` |
| M3 (medio). Sin cuota de diseños por usuaria | Corregido (cuota); frecuencia pendiente | Disparador `before insert` con tope de 500 por `owner_id` y candado `pg_advisory_xact_lock`, error `54000` (se traduce a `QUOTA`). **Frecuencia de las acciones: no se implementa ahora.** Razón: el autoguardado es legítimamente frecuente, un tope por ventana de 24 h lo rompería, y limitar bien exige otra función expuesta (la sesión de la usuaria no escribe `rate_events`) y alterar el CHECK de `kind`. El daño máximo por usuaria queda acotado por la cuota (500 diseños de hasta 1 MB) y por el tope de 200 versiones por diseño. Se cubre en la fase 7 con límites de tasa en el borde (hosting o API Gateway) por IP y por usuaria | Ídem |
| M4 (medio). `list_public_patterns` devolvía hasta 100 documentos completos a `anon` | Corregido (máximo) | Máximo 24 por página. Pendiente fase 7: devolver un resumen sin `document` y paginar por cursor | Ídem |
| B1 (bajo). La migración del título podía fallar o perder datos en la base real | Corregido (2026-11-06) | Antes de aplicar se comprobó en la base real: 0 diseños, 0 títulos distintos, 0 documentos sobre 1 MB | `20261106153401_consistencia_titulo.sql` |
| B2 (bajo). `document.title` numérico u objeto se comparaba como texto | Corregido | La restricción exige `jsonb_typeof(document -> 'title') = 'string'` | `20261106153401_consistencia_titulo.sql` |
| B7 (bajo). La etiqueta de versión admitía caracteres de control | Corregido | Se quita `\p{Cc}` antes de recortar | `app/disenos/actions.ts` |
| F1 (QA). U+0000 o sustituto suelto daban "revisa tu conexión" | Corregido en la capa de datos | `22P05` y `22P02` se traducen a `REJECTED_BY_DATABASE` con mensaje claro; el validador del motor lo rechaza antes (ADR 0003, E16) | `lib/designs/messages.ts` |
| B3. Copiar contenido generado con IA | Pendiente | Revisión legal (titularidad y etiquetado de lo copiado) antes de ofrecerlo; hoy se rechaza (`AI_DUPLICATE_UNSUPPORTED`) | — |
| B4. Guardar un diseño público | Pendiente (fase 7) | Publicar y guardar un diseño ya público exigen `valid` (hoy se guardan borradores con errores de tejido, E10) | — |
| B5. El estudio debe capturar `RangeError` de `layoutGeometry` | Corregido (T10) | `preview-engine.ts` captura `RangeError` y `TypeError`; un documento extremo no rompe la página | `lib/studio/preview-engine.ts` |
| B6. Acciones de CI sin fijar por SHA | Corregido (T13, 2026-11-06) | Todas las `uses:` van fijadas por SHA de commit con la versión en un comentario: `actions/checkout` v4.4.0, `actions/setup-node` v4.4.0, `pnpm/action-setup` v4.3.0, `actions/cache` v4.3.0 y `actions/upload-artifact` v4.6.2. Son los mismos commits a los que apuntaba cada `@v4` (no cambia el comportamiento). El encabezado del workflow explica cómo obtener un SHA nuevo con `git ls-remote`. Pendiente aparte: evaluar el paso a las versiones mayores nuevas (checkout v7, setup-node v7, pnpm/action-setup v6, cache v6, upload-artifact v7) y activar Dependabot para `github-actions` | `.github/workflows/ci.yml` |
| Total de versiones por usuaria | Corregido (T15 final, MEDIO-2) | Tope total de 5000 por usuaria en un disparador `before insert` de `pattern_versions` (candado por usuaria, 54000); el tope de 200 por diseño sigue en `snapshot_pattern` | `20261109024823_cuotas_proyectos_lanas.sql` |

### Revisión del estudio web (T8 a T11, 2026-11-06)

| Hallazgo | Estado | Corrección | Dónde |
|---|---|---|---|
| ALTO-1. El respaldo local del estudio solo se borraba al cerrar sesión: quedaba al eliminar la cuenta, se podía ofrecer a otra cuenta en el mismo navegador y no caducaba | Corregido | Clave `loopitalab:<uid>:diseno:<id>` y `ownerId` en el contenido (formato v2). Al abrir el estudio, `pruneBackups` borra los de otra cuenta, los del formato viejo (`loopitalab:diseno:<id>`), los caducados y los dañados; solo se ofrece uno de la dueña y vigente. Caduca a los 14 días (`savedAt`). Eliminar la cuenta borra todos los respaldos antes de `signOut`, igual que cerrar sesión (`clearAllBackups`, todos los formatos). Si `savePattern` responde `UNAUTHENTICATED`, el respaldo se conserva solo bajo la clave de su dueña | `lib/studio/backup.ts`, `lib/studio/backup-recovery.ts`, `components/studio/useStudioSession.ts`, `app/cuenta/YourData.tsx`, `components/SignOutForm.tsx` |
| MEDIO-1. El respaldo se interpretaba sin tope de tamaño | Corregido | Un texto de más de `MAX_DOCUMENT_BYTES` + 1 KB se rechaza antes de `JSON.parse` (y no se escribe). Se exigen versión 2, `ownerId` igual a la sesión y `savedAt` vigente; el documento pasa por `migratePattern`, `validatePattern(...).savable` y debe tener el mismo `id` (`decideRecovery`) | `lib/studio/backup.ts`, `lib/designs/limits.ts` |
| MEDIO-2. `LOOPITA_DEV_PAGES=1` podía quedar activo en el despliegue real | Corregido | `next.config.ts` llama a `assertDevPagesSafe`: con `NODE_ENV=production`, `LOOPITA_DEV_PAGES=1` y `VERCEL_ENV=production` o `LOOPITA_ENV=production`, el build y el arranque fallan; `devPagesEnabled` además las apaga en ese caso. La medición local (`next build && next start` sin esas variables) sigue funcionando. **Requisito de despliegue:** definir `LOOPITA_ENV=production` en el entorno de producción del hosting si no es Vercel (ver `.env.example`) | `lib/dev-pages.ts`, `next.config.ts` |
| BAJO-2. El respaldo local no está cifrado | Riesgo aceptado, documentado | Vive en `localStorage` del navegador, en texto plano, y contiene el documento completo, incluidas las notas privadas de lanas y del diseño. Lo puede leer cualquier script del mismo origen y cualquier persona con acceso al perfil del navegador. Se limpia: al guardarse el diseño en el servidor, al descartar la recuperación, al cerrar sesión, al eliminar la cuenta, al abrir el estudio con otra cuenta (`pruneBackups`) y a los 14 días. `/privacidad` lo declara. Mitigación pendiente: CSP completa (ver Pendiente) | `lib/studio/backup.ts`, `app/privacidad/page.tsx` |

### Revisión final de la fase 2 (T15, 2026-11-08)

Revisión de `revisor-seguridad` sobre la rama `fase-2/cierre`. Sin hallazgos críticos.

| Hallazgo | Estado | Corrección o pendiente | Dónde |
|---|---|---|---|
| ALTO-1. Google está activo en el proyecto real sin cumplir los requisitos de F2-M7, M3 y avisos | **Aceptado por la usuaria (2026-11-08)** | Decisión: dejar Google activo sin plan Pro. Microsoft quedó apagado en el panel (verificado). Registrado en "Riesgos aceptados" con el escenario residual y la condición de revisión | Panel de Supabase |
| MEDIO-1. El check de RLS no revisaba toda tabla de `public` | Corregido | Aserción de que toda relación `r`/`p` de `public` tiene RLS (se revisan 16 tablas, mínimo exigido 16) y de que las vistas son `security_invoker` o no tienen grants para `anon`/`authenticated`. Prueba en negativo con una tabla temporal sin RLS y una vista abierta | `supabase/checks/10_rls_check.sql` |
| MEDIO-2. Proyectos, notas, lanas y versiones sin tope por usuaria | Corregido | Disparadores `before insert` con `pg_advisory_xact_lock` por usuaria, error `54000`: 1000 proyectos, 10 000 notas, 500 lanas y 5000 versiones en total. El nombre de fibra de `user_yarns.composition` mide 1 a 40 caracteres (`composition_is_valid`, mismos grants). Las funciones de trigger no son ejecutables por `anon` ni `authenticated`. Verificado en el check (el 1001, el 10 001, el 501 y el 5001 fallan; borrar libera). Reversión en el pie de la migración | `20261109024823_cuotas_proyectos_lanas.sql` |
| BAJO-3. Logs con el identificador de la usuaria | Corregido | Ya no se registran `user.id` ni rutas de Storage (empiezan con el uid); solo códigos o nombres de error | `api/cuenta/eliminar/route.ts`, `api/subidas/route.ts`, `api/subidas/[id]/route.ts` |
| BAJO-4. `POST /api/subidas` expuesto sin interfaz hasta la fase 5 | Corregido | Bandera `LOOPITA_UPLOADS_ENABLED` (apagada por defecto): `/api/subidas` y `/api/subidas/[id]` responden 404. Activarla solo cuando exista la interfaz de subida (fase 5) y el aviso de derechos | `api/subidas/enabled.ts`, `apps/web/.env.example` |
| BAJO-5. Sin HSTS | Corregido | `Strict-Transport-Security: max-age=63072000; includeSubDomains`, solo con `NODE_ENV=production`. Sin `preload` a propósito | `apps/web/next.config.ts` |
| BAJO-7. `@supabase/ssr` con rango abierto | Corregido | `^0.12.7` (el mismo resuelto en el lockfile; `pnpm install --frozen-lockfile` sin cambios de versiones) | `apps/web/package.json` |

**Pendientes de ALTO-1 (aceptados, no cumplidos).** Si se quisiera cerrar el riesgo, esto es lo que falta; marcar al cumplirlo:

- [ ] Authentication > Emails: avisos "Password changed", "Identity linked" e "Identity unlinked" activados.
- [ ] Authentication > Sessions: tiempo máximo de sesión y de inactividad configurados (F2-M7).
- [ ] Prueba M3 en la base real: registrar con correo y contraseña X una dirección sin confirmar, entrar con Google con el mismo correo, e intentar entrar con ese correo y X. X no debe servir.
- [ ] Comprobar `amr` con `method: "oauth"`, `session_id` nuevo en la vuelta de OAuth y que eliminar una cuenta con contraseña y Google vinculado con solo Google sea rechazado (ver "Comprobar OAuth en la base real").
- [ ] Texto de `/privacidad` con Google: revisión legal.

### Pendientes consolidados al cierre de la fase 2 (T15)

| Cuándo | Pendiente |
|---|---|
| Cerrar la fase 2 | `SUPABASE_SECRET_KEY` en el hosting. Migración `20261109024823_cuotas_proyectos_lanas.sql` aplicada en el proyecto real el 2026-11-09 (verificado: 4 disparadores de cuota activos, fibra de 41 caracteres rechazada, 0 tablas sin RLS, lista permitida de funciones sin cambios); falta repetir `10_rls_check.sql`. Mapear 54000 en las acciones de proyectos y lanas si se muestran mensajes (`app/proyectos/actions.ts`). Mapear 54000 en las acciones de lanas cuando exista su interfaz (los mensajes de proyectos están hechos, T3 de la fase 3). `20261111031138_revocar_execute_triggers.sql` aplicada el 2026-11-11. |
| Antes de la beta con personas externas | Revisar el riesgo aceptado de ALTO-1: límites de sesión e inactividad (plan Pro), avisos por correo y prueba M3; F2-M7 completo (incluida la evaluación de MFA). Marcadores y revisión legal de `/privacidad` y `/terminos` (Ley 21.719, Ley 19.628, RGPD si hay usuarias en la UE). CAPTCHA de Turnstile en Auth y en el front a la vez. Purga programada verificada. Comprobaciones en la base real (token tras el bloqueo, `session_id`, `amr`). CSP completa. Revisión legal de copiar contenido de IA (B3) |
| Fase 5 | Activar `LOOPITA_UPLOADS_ENABLED` junto con la interfaz de subida. Aviso de derechos al subir. Aviso de cuota antes de lanzar un trabajo de IA (T15 B-2) |
| Fase 7 | Publicar: revalidar en el servidor con `valid` (M-1), avisar qué sale público (M-2), `valid` al guardar un diseño público (B4), listado público como resumen con paginación por cursor, límites de tasa en el borde, interfaz de moderación, `pg_jsonschema` |

### Revisión final de la fase 3 (T17, 2026-11-12)

Revisión de `revisor-seguridad`. Sin hallazgos críticos ni altos; `pnpm audit` limpio.

**Alcance.** Migraciones `20261111031138_revocar_execute_triggers.sql` y `20261111031813_tejer_disenos.sql`; acciones de `app/proyectos/actions.ts`; `lib/projects/list.ts`; la cola local del avance; páginas `/proyectos/[id]` y `/proyectos/[id]/tejer`; notas privadas; y el plan de despliegue (`docs/despliegue-publico.md`).

**Verificado**

- Las funciones `security definer` tienen `search_path` vacío. `start_chart_project` y `repin_project` solo las ejecuta `service_role`; `pin_current_version` no la ejecuta nadie.
- La dueña sale de `auth.getUser()`, `kind = 'chart'` se exige, y el `updated_at` es exacto con la fila bloqueada. El documento validado se lee de la base, no del cliente.
- Las versiones son inmutables. El cliente solo escribe `title`, `status` y su puntero de avance.
- Las páginas exigen sesión en dos capas y responden 404 sin distinguir lo ajeno de lo inexistente. No hay `dangerouslySetInnerHTML`. La pantalla previa no recibe notas privadas.
- La cola local guarda solo identificadores y el puntero, con la dueña en la clave y en el contenido y un TTL de 14 días. Se borra al confirmar, al cerrar sesión y al eliminar la cuenta.

**Hallazgos**

| Hallazgo | Estado | Detalle |
|---|---|---|
| T17-M1 (medio) | Corregido (migración `20261113145129_tope_part_id_y_detalle_cuotas.sql`, aplicada en el proyecto real el 2026-11-13) | `project_progress.part_id` no tenía tope y PostgREST permitía escribirlo |
| T17-M2 (medio) | Incorporado al plan de despliegue | El plan no verifica que vinext conserve las protecciones de Next: Origin de las Server Actions, rutas protegidas, clave secreta fuera del bundle, cabeceras en 200, 404, redirección y estáticos, y `Cache-Control: private, no-store` |
| T17-M3 (medio) | Incorporado al plan de despliegue | `*.workers.dev` es un segundo origen fuera de las reglas de la zona; la prueba de viabilidad no debe usar el proyecto real |
| T17-M4 (medio) | Incorporado al plan de despliegue | La regla gratuita de límite de peticiones debe ir sobre `POST` al host por IP: las Server Actions no tienen ruta propia y el ingreso va directo a Supabase. Revisar además los límites de Auth de Supabase |
| T17-B1 (bajo) | Corregido en el repo | Depurar la cola del avance al entrar otra cuenta o al borrar el proyecto |
| T17-B2 (bajo) | Corregido en el repo | Descartar las entradas locales rechazadas por el servidor y acotar la cola |
| T17-B3 (bajo) | Corregido en el repo | `loadProject` ya no trae notas privadas |
| T17-B4 (bajo) | Requisito de la fase 7 | Las versiones fijadas conservan las notas privadas. Si en la fase 7 se abren a terceros, hay que leerlas por una función que las quite |
| T17-B5 (bajo) | Corregido (migración `20261113145129_tope_part_id_y_detalle_cuotas.sql`, aplicada en el proyecto real el 2026-11-13) | Los topes 54000 se distinguen por un `detail` estable |
| T17-B6 (bajo) | Parcial: `.env.example` y plan corregidos; `/privacidad` pendiente de la revisión legal | `.env.example`, plan y `/privacidad` desalineados: faltan Cloudflare y Resend como encargados y el avance local |
| T17-B7 (bajo) | Incorporado al plan de despliegue | `LOOPITA_ENV=production` y `NODE_ENV=production` también en el entorno de build y despliegue, y una E2E que afirme 404 en `/dev/*` sobre workerd |

**Falta antes de la beta**

- [ ] Avisos por correo de identidad vinculada y desvinculada (y contraseña cambiada).
- [ ] Prueba M3. Decidir dónde se hace: no se crean cuentas de prueba en el proyecto real.
- [ ] Verificar la purga programada (`cron.job`, `loopitalab-purga-diaria`).
- [ ] Comprobaciones en la base real: `session_id`, `amr` y token tras el bloqueo.
- [ ] Repetir `10_rls_check.sql` en el proyecto real sin dejar datos (transacción con rollback o una rama).
- [ ] Política de logs del Worker: sin cuerpos ni query strings, con la retención declarada.

## Riesgos aceptados

- **F2-M7 (medio, de plataforma; requisito antes de activar los proveedores).** Con `secure_password_change`, Supabase Auth solo exige el nonce de re-autenticación si la sesión tiene más de 24 horas. Quien obtenga el `access_token` de una sesión reciente (por ejemplo, en un equipo compartido; la cookie no es httpOnly porque la necesita el cliente del navegador) puede cambiar la contraseña con `PUT /auth/v1/user` directo a Supabase, sin pasar por la aplicación. M4 y F2-M5 protegen solo el camino de la aplicación. Mitigaciones en el panel (pendientes, ver abajo): aviso por correo de "contraseña cambiada", sesiones con tiempo máximo e inactividad, y evaluar MFA (aal2) para acciones sensibles. Con OAuth el riesgo crece: vincular Google o Microsoft agrega un método de ingreso que no se revoca al cambiar la contraseña, y la vinculación automática no pide la contraseña actual. Por eso estas mitigaciones pasan a ser requisito **antes** de activar los proveedores, no solo antes de la beta.
- **ALTO-1 de T15: Google activo sin los requisitos previos de F2-M7 y M3 (riesgo aceptado por la usuaria el 2026-11-08).** Qué cubre: no se configuran los límites de sesión máxima e inactividad (requieren plan Pro de Supabase y no se quiere pagarlo por ahora), ni los avisos por correo de "contraseña cambiada", "identity linked" e "identity unlinked", ni se hizo la prueba M3 de cuentas sin confirmar. Microsoft está apagado (panel y `config.toml`), así que solo aplica a Google. Escenario residual: quien obtenga el `access_token` de una sesión (equipo compartido) puede cambiar la contraseña directo contra Supabase o vincular una identidad sin que la dueña reciba ningún aviso, y la sesión no caduca por inactividad; además, no se ha comprobado que una contraseña registrada sobre un correo ajeno sin confirmar deje de servir cuando la dueña real entra con Google. Condición para revisarlo: **antes de cualquier beta con personas externas** o al pasar a plan Pro, lo que ocurra primero. Los avisos por correo y la prueba M3 no dependen del plan Pro y se pueden hacer antes.
- Re-autenticación con Google sin reingreso real si la sesión del proveedor está abierta: solo afecta a eliminar una cuenta **sin contraseña** (ver "Acceso con proveedores"). En cuentas con contraseña, un ingreso con proveedor no sirve para eliminar la cuenta ni para cambiar la contraseña.
- El semáforo de re-codificación es por instancia del servidor, no global. Los topes por usuaria sí están en la base.
- La instantánea de una denuncia conserva `pattern_owner_id` (sin clave foránea) aunque la autora borre su cuenta, como evidencia de moderación. Ya está declarado en la política de privacidad; queda la revisión legal.
- Las denuncias que hizo una usuaria se borran en cascada si ella elimina su cuenta.

## Pendiente

| Tema | Cuándo | Qué hacer |
|---|---|---|
| Migración de T7 (tejer diseños) | Hecho (2026-11-11) | **Aplicada en el proyecto real el 2026-11-11** (verificado: `pattern_version` eliminada, `pattern_version_id` presente, `start_chart_project` y `repin_project` solo para `service_role`, `pin_current_version` sin EXECUTE para nadie, el cliente no actualiza `pattern_version_id` ni `device`, disparador de inmutabilidad activo). Falta repetir `10_rls_check.sql` allí. La guardia aborta si algún proyecto tiene `pattern_version`. La interfaz actual (`app/proyectos/actions.ts`) solo inserta `title` y actualiza `status`: sigue funcionando |
| Migración T17 (`20261113145129_tope_part_id_y_detalle_cuotas.sql`) | Antes de desplegar | Aplicada en el proyecto real el 2026-11-13 (tope de `project_progress.part_id` y `detail` estable en los 54000). Falta repetir `10_rls_check.sql` contra el proyecto real cuando haya cuentas de prueba allí |
| Revisión T17 de T7 | Hecha (2026-11-12, ver "Revisión final de la fase 3"); hallazgos T17-M1 a B7 abiertos o corregidos allí | Se miró: (1) que T11 llame a `start_chart_project`/`repin_project` solo con el cliente admin del servidor, **después** de `migratePattern` + `validatePattern` sin opciones con `valid` sobre el documento **leído de la base** (nunca del cliente), con el `updated_at` leído junto con ese documento y `p_owner_id` de `auth.getUser()` (no de un parámetro del cliente), y que no devuelva errores de la base al navegador; (2) códigos: `PT409` conflicto (`detail` `pattern` o `progress`), `P0002` no encontrado o ajeno, `22023` no es gráfico o proyecto sin diseño, `54000` topes, `23514` título; (3) `saveProgress` con `where updated_at = esperado` y comprobación de la versión fijada; `repin_project` renueva el `updated_at` del avance, así una escritura en vuelo con la versión vieja da conflicto; (4) `deletePattern` traduce 23503; (5) el avance en `localStorage` (ADR 0009, sección 4); (6) que nadie vuelva a dar a `authenticated` permiso sobre `pattern_id`/`pattern_version_id` ni EXECUTE sobre las funciones (el check lo detecta); (7) **desvío del ADR 0009**: el ADR decía grant a `authenticated` y firmas sin `p_owner_id`; `repin_project` además recibe el puntero reubicado y el `updated_at` esperado del avance, y devuelve `progress_updated_at`. `arquitecto` debe enmendar el ADR |
| Limpieza menor: EXECUTE en funciones de trigger (T3) | **Aplicada en el proyecto real el 2026-11-11** (verificado: `set_updated_at` y `patterns_quota` sin EXECUTE para `anon` ni `authenticated`) | Falta repetir `10_rls_check.sql` allí; el check ya verifica que `anon` y `authenticated` no tienen EXECUTE en ninguna función de trigger de `public` |
| Clave secreta del servidor | Solo falta el hosting | `SUPABASE_SECRET_KEY` ya está en `.env.local`; falta configurarla en el gestor de secretos del hosting (solo servidor). La migración `20261105133225_denuncias_y_derechos.sql` ya está aplicada en el proyecto real (2026-11-05, con pg_cron activo y la purga programada) y `10_rls_check.sql` pasó sobre esa base. La necesitan subir, exportar y eliminar. Si se recrea el proyecto: activar pg_cron **antes** de aplicar la migración, o programar la purga a mano con `select cron.schedule('loopitalab-purga-diaria', '17 4 * * *', 'select public.purge_expired_data()');` |
| Comprobaciones en la base real | Al aplicar la migración | Que un token emitido antes del bloqueo deja de servir en `getUser`; que los JWT traen `session_id` (sin él la re-autenticación falla siempre, de forma cerrada); que `amr[].timestamp` no cambia con un refresh |
| Mitigar F2-M7 | Riesgo aceptado hasta revisar (ALTO-1 de T15); obligatorio antes de cualquier beta con personas externas o al pasar a plan Pro | Authentication > Emails: activar la notificación de "contraseña cambiada". Authentication > Sessions: tiempo máximo de sesión e inactividad. Evaluar MFA. Probar el escenario contra la versión de Auth del proyecto |
| Purga programada (F2-B18) | Al aplicar la migración y en cada despliegue | Comprobar `select 1 from cron.job where jobname = 'loopitalab-purga-diaria'`. Sin esa tarea, `/privacidad` promete plazos (30 y 180 días) que no se cumplen |
| CAPTCHA en Auth (M5, segunda capa) | Antes de abrir el registro al público | El front ya lo soporta con `NEXT_PUBLIC_TURNSTILE_SITE_KEY`. Falta crear el widget de Turnstile, activarlo en Authentication > Attack Protection y pasar `[auth.captcha] enabled = true` en `config.toml`, todo al mismo tiempo que se despliega el front. Activar solo una de las dos partes rompe el acceso o da una protección falsa |
| Migraciones de T4 y T15 en el proyecto real | Hecho el 2026-11-06 | Aplicadas `20261106153401_consistencia_titulo` y `20261106153415_publicar_y_cuotas`. Verificado en la base real: `visibility` sin INSERT ni UPDATE para la API, `anon` sin escritura en `patterns`, CHECK de consistencia con `coalesce` y tope de 1 MB, trigger de cuota activo, `list_public_patterns` sigue `security definer` con `search_path` vacío y la API ejecuta solo las 6 funciones de la lista permitida. Prueba funcional en una transacción revertida: crear nace privado, publicar da 42501, documento sin `kind` o título distinto dan 23514 |
| Revisar T4 (T15) | Hecho (revisión final de la fase 2, T15) | Revisado por `revisor-seguridad`: acciones de `app/disenos/actions.ts` y `lib/designs/` (sesión, validación con `savable` en el servidor, tope de 750 000 bytes, concurrencia con `updated_at`, filtro por `owner_id` además de RLS, mensajes sin detalles de la base). Decisiones a revisar: duplicar un diseño de IA se rechaza (la copia necesitaría `service_role` para conservar la etiqueta); el listado lee rutas JSON de `document`, no el documento completo |
| Publicar (fase 7): revalidar en el servidor (T15 M-1) | Antes de ofrecer "publicar" | La base no impone el documento cerrado: `authenticated` puede escribir `document` por PostgREST con claves arbitrarias (hasta 1 MB). Mientras `visibility` sea solo del servidor no se publica nada. La acción de publicar debe leer el documento desde la base, exigir `valid` (incluido `UNKNOWN_KEY`) y resolver `yarns[*].note` con un mensaje claro (el CHECK `patterns_shared_without_private_notes` lo rechaza). Segunda capa opcional: CHECK de claves de la raíz o `pg_jsonschema` |
| Publicar (fase 7): avisar qué sale público (T15 M-2) | Antes de ofrecer "publicar" | `get_shared_pattern` devuelve `notes`, `assembly`, notas de vuelta, cierre y `origin.model`/`promptVersion` tal cual. La interfaz de publicar debe avisar que esas notas serán públicas (pueden traer datos personales). Decidir si `origin.model` y `promptVersion` se ocultan en la vista pública (hoy el detalle del modelo vive en `ai_jobs`) |
| Cuota y patrones de IA (T15 B-2) | Fase 5 | Las filas que crea `service_role` también cuentan para el tope de 500: un patrón de IA fallaría con 54000 en una cuenta llena. Mostrar el aviso de cuota antes de lanzar el trabajo de IA |
| Mensajes de error (T15 B-1) | Cerrado (revisión final de T15) | Un 54000 en `savePattern` se muestra como "tope de versiones" (`dbErrorCode` sin `op`); una etiqueta de versión con un sustituto UTF-16 suelto da el mensaje genérico de carácter no guardable. Sin riesgo; ajustar si aparece |
| Migraciones de la fase 2 en el proyecto real | Hecho el 2026-11-06 | Aplicadas `20261105231613_estado_contrasena`, `20261106035525_tejer_en_espejo`, `20261106035603_datos_referencia_v2` y `20261106035626_sin_truncate`. Verificado en la base real: 0 permisos TRUNCATE/REFERENCES/TRIGGER para `anon` y `authenticated`, 0 TRUNCATE para `service_role`, 0 secuencias accesibles por la API, solo las 6 funciones de la lista permitida ejecutables por la API, UPDATE de `profiles` limitado a 5 columnas, 8 grosores sin alias de tienda, 48 colores con `orden` 1 a 48 y la purga diaria activa. Al recrear el proyecto, aplicar todas en orden con pg_cron ya activo |
| Activar Microsoft (Google ya está activo desde el 2026-11-05) | Después de revisar el riesgo aceptado de ALTO-1 (F2-M7, M3 y avisos) | Seguir `docs/puesta-en-marcha.md`, 2b. Activar en el panel, `enabled = true` en `config.toml` y `NEXT_PUBLIC_AUTH_PROVIDERS` en el hosting, a la vez. Revisar la fecha de vencimiento del secreto de Microsoft. Estado hoy: apagado en el panel (verificado el 2026-11-08) y `enabled = false` en `config.toml` |
| `xms_edov` en la app de Entra | Solo si se pasa del tenant `consumers` a `common` | Claim opcional `xms_edov` y `email` en el ID token (manifiesto). Probar con una cuenta de organización que el correo llegue como verificado y que, sin verificar, **no** se vincule a una cuenta existente. Si no se puede, quedarse en `consumers` (por defecto) |
| Microsoft (Entra) no validado | Antes de agregar `azure` a `NEXT_PUBLIC_AUTH_PROVIDERS` | El 2026-11-05 el proveedor estaba activo en el panel, pero Microsoft responde `unauthorized_client` ("not enabled for consumers") con el tenant `consumers`. En Entra, en Authentication de la app, el tipo de cuenta debe incluir **cuentas personales de Microsoft**, o el manifiesto debe tener `signInAudience` = `PersonalMicrosoftAccount` (o `AzureADandPersonalMicrosoftAccount` si se usa `common` con `xms_edov`). Revisar también que el Client ID del panel sea el "Application (client) ID". Hoy `enabled = false` en `config.toml` y sin `azure` en `NEXT_PUBLIC_AUTH_PROVIDERS`; Microsoft ya está apagado en el panel (2026-11-08), sin discrepancia con `config.toml`; antes de activarlo hay que resolver lo de Entra |
| Comprobar OAuth en la base real | Al activar cada proveedor | Que el `amr` del token traiga `method: "oauth"` (nombre asumido según el código de Supabase Auth) con la hora del ingreso; que la vuelta de `signInWithOAuth` cree un `session_id` **nuevo** aunque la usuaria ya tuviera sesión; que una cuenta solo OAuth pueda crear su contraseña con el enlace por correo (con `secure_password_change`, `updateUser` sin nonce en esa sesión de recuperación) y luego entrar con correo y contraseña; que `user_has_password` pase a true después de eso; que en una cuenta con contraseña y Google vinculado, eliminar con solo Google sea rechazado; que una cuenta nueva creada solo con Google dé `user_has_password = false` (N2: si alguna vía de alta guardara una contraseña aleatoria, la usuaria quedaría limitada a "Olvidé mi contraseña"); que `prompt=login` (Microsoft) pida credenciales; que cancelar vuelva con `?error=access_denied` en la query |
| Cuentas sin confirmar y vinculación (M3) | Riesgo aceptado (ALTO-1 de T15); revisar antes de una beta con personas externas | Registrar con correo y contraseña X una dirección sin confirmarla; después entrar con Google con el mismo correo; luego intentar entrar con ese correo y X. **X no debe servir** (Supabase debería descartar la contraseña de la cuenta no confirmada o crear una cuenta aparte). Si sirve, no activar los proveedores sin antes limpiar las cuentas sin confirmar (borrarlas o quitarles la contraseña) y repetir la prueba |
| Aviso "identity linked" | Riesgo aceptado (ALTO-1 de T15); revisar antes de una beta con personas externas | Authentication > Emails: activar "Identity linked" e "Identity unlinked" (y "Password changed", F2-M7). Si la CLI acepta `[auth.email.notification.*]`, descomentarlos en `config.toml` |
| `/privacidad` con Google y Microsoft | Antes de activar los proveedores | Texto ya redactado en `/privacidad` (proveedores de identidad y datos que entregan). Falta la revisión legal (Leyes 19.628 y 21.719, RGPD), junto con el contenido de la exportación (`identities`) |
| `pg_jsonschema` (B1, segunda capa) | Fase 7, con la vista de patrones compartidos | Evaluar validar el documento también en la base |
| Publicar patrones | Fase 7, antes de ofrecer la opción | Ya existen la denuncia (`pattern_reports`, `ReportPatternForm`) y los términos en borrador. Falta montar el formulario en la vista pública, una interfaz de moderación (hoy se revisa en el editor de tablas con `status = 'open'`) y la revisión legal |
| Aviso de derechos al subir imágenes | Fase 5, con la interfaz de subida | Confirmación obligatoria en el formulario de subida |
| Ley 21.719 (protección de datos, Chile) | Antes de cualquier beta con personas externas | Ya existen exportar y eliminar la cuenta, y `/privacidad` y `/terminos` en borrador. Falta completar los marcadores ([RAZÓN SOCIAL], [RUT], plazos, bases de licitud) y la revisión legal. Según Diario Constitucional (junio de 2026), entra en vigencia el 1 de diciembre de 2026; no se pudo confirmar una posible postergación a 2027. Mientras tanto rige la Ley 19.628. Si hay usuarias en la UE, también aplica el RGPD |
| CSP completa | Antes del lanzamiento | Con `object-src 'none'` y `base-uri 'self'` (ver `docs/despliegue-publico.md`, P3.1). Debe permitir `https://challenges.cloudflare.com` en `script-src` y `frame-src` para Turnstile |

### Revisión final de la fase 4 (T20, 2026-11-16)

Revisión de `revisor-seguridad` sobre la rama `fase-4/grupo-e` (grupos A a D). Sin hallazgos críticos; `pnpm audit` limpio. Un hallazgo alto (T20-A1) bloquea la fase 5 (IA) y la 7 (publicar), y conviene corregirlo antes de la beta. El texto pegado lo puede provocar hoy mismo.

**Alcance.** Se revisaron:
- el validador v2 (`validate.ts`, `limits.ts`, `migrate.ts`, `written.ts`) frente a documentos hostiles medidos en Node 24;
- el lector de texto (`text.ts`, `PARSE_LIMITS`) con 22 líneas patológicas;
- los huecos de T4 y T6;
- `profiles.pattern_dialect` y `profiles.terminology`;
- `pendingText` en el respaldo local;
- las dependencias `three` 0.186.1, `@react-three/fiber` 9.8.2, `@types/three` 0.186.0 y sus transitivas;
- WebGL en el cliente y las páginas `/dev/*`;
- `createWrittenPattern` y `savePattern`;
- `get_shared_pattern` y `list_public_patterns`.

**Verificado**

- **Valores extremos.** NaN, ±Infinity, ±1e308, 2^53, −1, 0,5 y −0 en `number`, `through`, `count`, `copies`, `expected`, `gauge`, `positionCm`, `rotationDeg` y `copy` dan `SHAPE`, `LIMIT` o su código propio en menos de 1 ms. Hay una excepción: `start.count` y `expected` (huecos 1).
- **Profundidad, ciclos y objetos raros.**
  - Una anidación de 10.000 grupos y una nota con un arreglo de 100.000 niveles se rechazan en 0,1 ms, sin recursión sin tope.
  - Un ciclo en memoria entre ítems da `LIMIT` por profundidad.
  - El ciclo y la profundidad de `layout` son lineales.
  - Un getter que lanza o un `Proxy` dan `SHAPE` (validador) o `ok: false` (migración).
  - `"__proto__"` en el JSON da `UNKNOWN_KEY` y no contamina `Object.prototype`.
- **Lector.**
  - La peor línea hostil de 2.000 caracteres se lee en 0,29 ms (criterio: menos de 5 ms).
  - Una parte de 100.000 caracteres se lee en 9,9 ms, y 50 partes con `parseWrittenParts` en 7 ms.
  - No hay retroceso exponencial ni cuadrático en `ROUND_RE`, `EXPECTED_RE`, `HEADER_RE`, `COPIES_RE` ni en las expresiones de ítems.
  - Más de 100.000 caracteres se rechazan sin leer.
- **`profiles.pattern_dialect`.**
  - La columna es `not null default 'es'` con CHECK `es/us/uk`.
  - El permiso de UPDATE es por columna para `authenticated` y RLS limita a la propia fila.
  - `revoke update` a nivel de tabla arrastra los permisos de columna anteriores.
  - `updatePatternDialect` valida en el servidor, exige `getUser()`, filtra por `id` y no devuelve detalles de Postgres.
  - `10_rls_check.sql` cubre lo propio, lo ajeno, el CHECK, `null` y `anon`.
- **`createWrittenPattern`.**
  - Solo toma `title`, `yarns` y `gauge`, con tope de bytes y de lanas antes de construir.
  - `id`, origen, partes, técnica y tipo los fija el servidor.
  - Guarda por `savable` sin opciones, y RLS y los permisos de columna de T15 siguen siendo la barrera.
  - `savePattern` exige que `document.id` sea el `id` del diseño.
- **`pendingText`.**
  - Nunca entra al documento: vive en `Autosave` y en el respaldo, y `savePattern` envía `store.doc`.
  - Va con la clave de la dueña, `ownerId` en el contenido, vencimiento a 14 días desde la última escritura y `pendingTextOf` sin `__proto__`.
  - Se descarta si el texto es de otra cuenta.
- **Compartir y publicar.**
  - Ninguna ruta de la aplicación llama hoy a `getSharedPattern` ni a `listPublicPatterns`, y `visibility` sigue siendo solo de `service_role`: un diseño escrito no se puede compartir ni publicar.
  - Las dos funciones devuelven `document`, que nunca trae `pendingText`.
  - El CHECK `patterns_shared_without_private_notes` sigue cubriendo `yarns[*].note`, la única nota privada del modelo v2.
- **WebGL.**
  - `dispose` explícito al desmontar (geometrías, materiales, mapa de normales, luces, controles).
  - `webglcontextlost` con `preventDefault` y paso a siluetas; `webglcontextrestored` vuelve a dibujar.
  - El SVG de las siluetas, que va por `dangerouslySetInnerHTML`, escapa el título y valida el color.
- **Páginas `/dev/*`.** Las seis (`amigurumi`, `estudio`, `fibras-2d`, `render-benchmark`, `visor-3d`, `webgl`) llaman a `devPagesEnabled()` → `notFound()` y piden `noindex`. No leen la sesión ni Supabase. `fibras-2d` valida `hex`.
- **Dependencias.**
  - Todas vienen de `registry.npmjs.org`, con `integrity` en el lockfile, sin scripts `preinstall`, `install` ni `postinstall`, y con licencias MIT, BSD-3 o Apache-2.0.
  - `three` 0.186.1 es del 2026-09-24, `@react-three/fiber` 9.8.2 del 2026-10-14 y `@types/three` 0.186.0 del 2026-09-11. Todas se mantienen activamente.
  - pnpm 10 no ejecuta scripts de dependencias sin `onlyBuiltDependencies`.
  - El rango par `three >=0.186.1 <0.187.0` está fijado.
- **Pruebas.** `pattern-core`: 729 de 729. `viewer-3d`: 79 de 79 en tres corridas; una cuarta, la primera, falló una aserción que no se repitió (ver T20-I5).

**Hallazgos**

| Hallazgo | Severidad | Archivo y línea | Cómo reproducirlo | Corrección propuesta |
|---|---|---|---|---|
| T20-A1. **Bomba de expansión**: un grupo que solo cambia de lana se repite `times` veces por nivel sin que el validador lo cuente. Un documento `valid` de unos 600 bytes y 6 puntos cuelga el 3D | **Alta** | `packages/pattern-core/src/written.ts:24-36` (`walk`, bucle de la línea 32) y `:85-91` (`expandRound`); lo llaman `packages/viewer-3d/src/mesh.ts:152` y `:449`. `validate.ts:1391-1447` (`checkItems`) no acota el trabajo de expansión | Escribir en el estudio amigurumi `V1: 6 pb en AM (6)` y debajo `V2: [[[[[@A] x500] x500] x500] x500] x500, 6 pb`. El lector lo acepta (5 grupos, `times` ≤ 500) y es `valid`. `walk` visita 500^5 ≈ 3·10¹³ nodos: no termina. Medido en Node: con `x40` en 5 niveles y un rango V2-10, `buildScene` tarda **6,4 s** con 685 bytes; con `x500` en 3 niveles, `expandRound` tarda 0,8 s por vuelta. En el navegador corre el mismo código en el hilo principal. Si el autoguardado alcanzó a guardarlo, el diseño ya no se puede abrir: el visor se monta al cargar. Se puede provocar pegando un "patrón" de internet; con la IA (fase 5) o publicar (fase 7), le pasa a quien lo abra | (1) Agregar al validador un tope estructural del **trabajo de expansión**: Σ sobre los nodos (puntos, colores y grupos) del producto de los `times` que los envuelven. Se calcula de forma aritmética en `checkItems` o `countItems`. `LIMIT` por vuelta si pasa `LIMITS.maxRoundStitches` (50.000), y por documento si Σ sobre las vueltas concretas pasa `LIMITS.maxExpansionWork` (propuesta: 2.000.000, unas 10 veces el máximo que dejan los límites recomendados). (2) Defensa en `walk`: un grupo cuyo subárbol no consume ni produce puntos se recorre una sola vez, porque desde la segunda pasada su lana final ya no cambia. (3) Pedir a `experto-tejido` si un grupo sin puntos debe ser error estructural. Enmienda del ADR 0011 y pruebas de propiedades con grupos solo de color |
| T20-M1. **Costo del validador y del 3D sin tope**: `countRound` se recalcula por cada vuelta concreta de un rango, y `countItems` recorre cada grupo con `times > 1` dos veces (2^profundidad). Un documento `savable` de 700 KB, bajo los 750 KB del servidor, valida en **3,2 s** (6,4 s con `weightCat`); `partProfile` tarda 3,3 s y `buildScene` 8,1 s. La escena (191.814 puntos) queda bajo `SCENE_HARD_STITCH_CAP`, así que se arma: **CA4-P9 no se cumple con documentos hostiles** (sí con los realistas de T12) | **Media** (sube a alta con IA o publicar, o con un hosting Node en vez de Workers) | `validate.ts:1010-1015` (`countRound` dentro del `for n`), `written.ts:115-121` (`concreteRounds`), `written.ts:65-71` (doble llamada), `profile.ts:178`; en el servidor, `apps/web/src/lib/designs/prepare.ts:46` desde `savePattern` (`app/disenos/actions.ts:122`) | V1 con 6 pb y V2-1000 con 25.000 ítems `@A` y 6 pb, envueltos en 5 grupos `x2`. Cualquier sesión puede llamar a `savePattern` directo. En Workers la petición muere por los 10 ms de CPU (1102); con `next start` o Vercel bloquea el proceso unos 3 s por petición. Con publicar (fase 7), `listPublicPatterns` validaría 24 documentos así por página | (1) En `validate.ts` y `concreteRounds`, contar cada vuelta escrita a lo más dos veces (primera pasada y resto), porque el conteo solo depende de la lana inicial: `O(nodos)` en vez de `O(nodos × largo del rango)`. (2) En `countItems`, si `first.endYarn === startYarn`, reutilizar `first` en vez de recalcular. (3) Con el tope de A1 por documento queda acotado de punta a punta. (4) Agregar a la guardia de Node una prueba de tiempo con este documento (`validatePattern` < 50 ms) |
| T20-M2. **Cerrar sesión desde el estudio no borra el respaldo local**: `SignOutForm` borra en `onSubmit`, pero la navegación del formulario dispara `beforeunload` y `pagehide`, y `writeBackupNow()` vuelve a escribirlo si hay cambios sin guardar **o `pendingText`**. Con `pendingText` no hay diálogo de "¿salir?" (no cuenta como cambio sin guardar), así que pasa en silencio | **Media** (privacidad en equipos compartidos; contradice ADR 0011 T14-1 y `/privacidad`) | `apps/web/src/components/SignOutForm.tsx:16-20`, `components/studio/useStudioSession.ts:70-79`, `lib/studio/autosave.ts:198-201`. La E2E de `cuenta.spec.ts:79-102` cierra sesión desde `/disenos`, no desde el estudio | Abrir un diseño amigurumi y escribir una línea que no se lee (`V2: zzz`). Esperar a que se escriba `pendingText`. Usar "Cerrar sesión" del encabezado del mismo estudio y revisar `localStorage`: la clave `loopitalab:<uid>:diseno:<id>` sigue ahí con el texto, hasta 14 días o hasta que otra cuenta abra un estudio. Pendiente de confirmar con una E2E: el camino del código es claro | (1) Antes de borrar, `SignOutForm` emite una señal (por ejemplo, el evento `loopitalab:salir` o una bandera del módulo `backup.ts`) que los `Autosave` vivos escuchan: `stop()` y `holdBackup(true)`. Así `writeBackupNow` no escribe nada. (2) Segunda capa: `/auth/salir` redirige a `/?salida=1` y un componente de cliente vuelve a llamar `clearBrowserBackups()` y `clearBrowserProgressQueues()`. Esto cubre otra pestaña con el estudio abierto. (3) E2E: cerrar sesión desde `/disenos/[id]` con `pendingText` y comprobar que no queda la clave |
| T20-B1. `start.count` sin tope superior. Una cadeneta de `1e300` da un documento **`valid`**, no solo `savable`, porque el desajuste de la V1 sobre cadeneta en aro o en hileras es advertencia. `formatPart` escribe `cad 1e+300`, que `parsePart` no lee (RT1). El perfil queda con un radio de unos 10^299 cm | Baja | `validate.ts:890`, `text.ts:737`, `profile.ts:168-169` | `start: { type: "chain", count: 1e300 }` con V1 `6 pb`: `validatePattern(...).valid === true` | Hueco 1, abajo |
| T20-B2. `expected` sin tope superior: `1e20` es `savable` (borrador) y no hace la ida y vuelta (`PARSE_NUMBER`) | Baja | `validate.ts:969`, `text.ts:689` | `expected: 1e20` | Hueco 1, abajo |
| T20-B3. RT1 se rompe por largo, no solo por línea. Una vuelta `savable` de 30.000 ítems se escribe en una línea de 120.002 caracteres. Además, **una parte `savable` puede pasar los 100.000 caracteres del lector**: 1.000 vueltas con nota de 500 caracteres dan 577 KB de JSON y 513.942 caracteres de texto, y se rechazan con `PARSE_TOO_LONG`. El editor de texto de esa parte queda inutilizable | Baja (funcional; solo con API, IA o bloques muy por encima de los límites recomendados) | `text.ts:52-55` (`PARSE_LIMITS`); el validador no tiene tope de ítems por vuelta ni de texto por parte | Ver `rt.ts` en "Reproducción" | Hueco 2, abajo |
| T20-B4. Los problemas de texto de `target.part` y `host.part` en `layout` no pasan por el tope de 20 por código: 2.500 ubicaciones con identificadores malos dan **5.001 problemas** | Baja | `validate.ts:1212` (`checkText(..., c)` directo) | 2.500 ubicaciones con `part` de 65 caracteres y `host.part` con `\u0001` | Hueco 3, abajo |
| T20-B5. `checkItems` no tiene tope de problemas, y `prepareDocument` devuelve todos los errores al cliente. 40.000 ítems malos dan 80.000 problemas; dentro de 750 KB, unos 36.000 problemas y una respuesta de varios MB por Server Action | Baja | `validate.ts:1391-1447`; `lib/designs/prepare.ts:54` | `items` con 18.000 `{type:"stitch",stitch:"zz",count:0}` enviado a `savePattern` | Tope de 20 por código y por parte para los códigos estructurales de `checkItems`, con un contador (`data.omitted`). `savable` no cambia porque queda al menos uno de cada código. En `prepareDocument`, devolver a lo más 100 errores |
| T20-B6. El presupuesto de `pendingText` no cabe en el del respaldo: `MAX_PENDING_PARTS × MAX_PENDING_TEXT` permite 5.000.000 de caracteres, pero el respaldo completo se corta en `MAX_BACKUP_CHARS` (751.024). Si se pasa, `#writeBackup` **borra el respaldo entero, con los cambios sin guardar del documento** | Baja (integridad local) | `lib/studio/backup.ts:49`, `:104-106`; `lib/studio/autosave.ts:367` | Diseño con cambios sin conexión y 8 partes con 100.000 caracteres sin leer: el respaldo desaparece | Tope total propio para `pendingText` (por ejemplo, `MAX_PENDING_TOTAL = 200_000`) y `MAX_BACKUP_CHARS = MAX_DOCUMENT_BYTES + MAX_PENDING_TOTAL + 1024`. Si igual no cabe, quitar primero `pendingText` (con un aviso en el estudio) y conservar el documento |
| T20-B7. `/privacidad` dice que el respaldo "se borra al guardarse el diseño". Con `pendingText` ya no es así: tras guardar queda el respaldo con el texto sin leer | Baja | `apps/web/src/app/privacidad/page.tsx:29` | Leer el texto frente a `autosave.ts:316-318` | Agregar: "si quedó texto que no se pudo leer, se conserva solo ese texto hasta que lo corrijas o lo borres, y como máximo 14 días". Va a la revisión legal |
| T20-B8. `profiles.terminology` sigue con permiso de UPDATE y `session.ts` la lee, sin uso en la interfaz | Baja | `supabase/migrations/20261114015632_perfil_dialecto.sql:20`; `apps/web/src/lib/session.ts:31` y `:39` | `PATCH /rest/v1/profiles?id=eq.<uid>` con `{"terminology":"uk"}` y la sesión propia: se acepta | Decisión 5, abajo |
| T20-I1. El check no afirma la lista exacta de columnas con UPDATE en `profiles` | Informativa | `supabase/checks/10_rls_check.sql` (sección T8, unas líneas 1821-1873) | — | Agregar una aserción sobre `information_schema.column_privileges` (`grantee = 'authenticated'`, `privilege_type = 'UPDATE'`, `table_name = 'profiles'`) igual a la lista esperada, con una prueba en negativo |
| T20-I2. La migración `20261114015632_perfil_dialecto.sql` ya está aplicada en el proyecto real (2026-11-14); falta repetir `10_rls_check.sql` allí sin dejar datos | Informativa | — | — | Repetirlo junto con la migración de la decisión 5 |
| T20-I3. `validatePattern` valida lo que lee en ese momento: un objeto con getters puede cambiar después (TOCTOU), y un `kind` heredado del prototipo se acepta. JSON no puede producir ninguno de los dos | Informativa | `validate.ts:261-271` | — | Documentar en `validate.ts` que el resultado vale solo para datos planos (salidos de `JSON.parse` o `structuredClone`). Las Server Actions ya los reciben así |
| T20-I4. `display_name` solo tiene tope de largo; admite controles y marcas bidireccionales (U+202E). Será el nombre de autora visible en lo público | Informativa (fase 7) | `apps/web/src/app/cuenta/actions.ts:25`; esquema inicial, `profiles.display_name` | — | Antes de publicar, rechazar `\p{Cc}` y los caracteres de formato bidireccionales en la acción y con un CHECK |
| T20-I5. Una corrida de `viewer-3d` falló una aserción y las tres siguientes pasaron (probablemente una guardia de tiempo) | Informativa | `packages/viewer-3d/test` | `node --test` varias veces seguidas | `qa-tester` (T19): identificar la prueba y darle margen o marcarla como medición |
| T20-I6. Dependencias: sin edad mínima de publicación ni Dependabot | Informativa | `pnpm-workspace.yaml` | — | `minimumReleaseAge: 10080` (7 días; pnpm 10.28 lo admite) y Dependabot para `npm` y `github-actions` (B6 de T15) |

**Decisiones recomendadas para los huecos de T4 y T6** (para `motor-patrones`, como enmiendas T20-x del ADR 0011; `qa-tester` agrega en T19 las pruebas de RT1 en el borde)

1. **Tope de `expected` y `start.count`.**
   - `expected` debe ser ≤ `LIMITS.maxRoundStitches` (50.000), y `start.count` ≤ `LIMITS.maxRoundStitches`, como `LIMIT` estructural.
   - Razón: ninguna vuelta puede dejar ni trabajar más de 50.000 puntos, así que un valor mayor nunca cuadra.
   - Con el tope, RT1 vale: 5 dígitos.
   - Se cierra además que una cadeneta de `1e300` sea `valid` (T20-B1).
   - Rompe M1 a propósito, como T4-4. La base no tiene patrones escritos (auditoría T2), así que ningún documento real cambia.
   - El lector puede seguir leyendo números mayores: el validador los rechaza con un mensaje claro.
2. **Tope de ítems por vuelta y de texto por parte.**
   - **`LIMITS.maxRoundItems = 100` nodos por vuelta**, contando puntos, colores y grupos en todos los niveles. `LIMIT` estructural.
   - Medido con el formateador: la peor vuelta posible tiene 100 nodos alternando `5000 saltar ht` y `@` más un identificador de 16 caracteres, `V-1000--999:` y `(50000)`. Mide 1.769 caracteres en `es`, 1.619 en `us` y 1.719 en `uk`. Cabe en 2.000 sin tocar `PARSE_LIMITS` y sin que `formatPart` corte líneas (no recomiendo cortar: la sintaxis no tiene continuación).
   - Validar con `experto-tejido` que 100 alcanzan: un tapestry de 200 puntos con color por punto se escribe con grupos (`[@A, pb, @B, pb] x100` son 5 nodos).
   - Si no alcanzan, la alternativa es 200 nodos con `maxLineLength: 4_000`: el lector es lineal y una línea de 4.000 cuesta unos 0,6 ms.
   - **Además, por parte**: un `LIMIT` estructural cuando el texto canónico de la parte, en el dialecto más largo, pase `PARSE_LIMITS.maxTextLength`. Se calcula en tiempo lineal con un `formattedPartLength(part)` en `text.ts`, sin armar el texto. Cubre T20-B3, que hoy deja sin editor de texto una parte `savable`.
3. **Tope de 20 por código en `layout`.** Pasar la revisión de texto de `target.part` y `host.part` por `emit`: `checkText` recibe un destino `{ error(code, path, message, data) }` y, en `validateLayout`, ese destino es `emit("error", …)`. Así `LIMIT` y `TEXT_CONTROL_CHAR` quedan en 20 cada uno dentro de `layout`. `UNKNOWN_KEY` puede quedar con su tope por documento.

**Decisiones de los pendientes 4 y 5**

4. **`pendingText`.** Se acepta con las condiciones de T20-M2, T20-B6 y T20-B7. Queda como el mismo riesgo aceptado que BAJO-2 (texto libre sin cifrar en el navegador, legible por scripts del mismo origen hasta la CSP completa). Respuestas a lo que se pidió revisar:
   - *¿Se borra al cerrar sesión?* Sí desde las otras páginas; **no** desde el estudio (T20-M2).
   - *¿Se borra al eliminar la cuenta?* Sí (`YourData.tsx:105`, después de borrarla).
   - *¿Cuándo vence?* A los 14 días de la última escritura.
   - *¿Qué pasa en un equipo compartido?* Si la usuaria no cierra sesión, queda hasta que otra cuenta abre un estudio (`pruneBackups` solo corre en el estudio). Mejora sugerida: llamar `pruneBackups` y `pruneProgressQueues` en cualquier página con sesión (por ejemplo, desde `AppHeader`).
   - *Tamaño máximo:* 50 × 100.000 caracteres declarados, pero el respaldo se corta en 751.024 (T20-B6).
5. **`profiles.terminology`** (con `backend-supabase`), en dos pasos para no romper una versión en marcha:
   - (a) Migración que quita la columna del permiso: `revoke update on public.profiles from anon, authenticated; grant update (display_name, units, dominant_hand, mirror_knitting, pattern_dialect) on public.profiles to authenticated;`. En el mismo cambio, quitar `terminology` de `session.ts`, de su tipo y de las pruebas (`session-fallback.test.ts`, `profile-mirror.test.ts`).
   - (b) Cuando esa versión esté desplegada, otra migración que borre la columna. La exportación usa `select *` y no se rompe.
   - Hoy el riesgo es nulo porque el CHECK limita a `es`, `us` o `uk`, pero un permiso sin uso es superficie.

**No aplica en esta rama.** El *worker* de R4-20 no está implementado: no hay nada que revisar. Si se agrega, tiene que recibir datos ya validados y con el tope de T20-A1, o el *worker* hereda la bomba.

**Falta antes de la beta** (marcado en el cierre T22, 2026-11-16, contra el código de `fase-4/grupo-e`)

- [x] T20-A1 y T20-M1 corregidos en `cd6c02a`.
  - Topes de trabajo de expansión por vuelta y por documento (`LIMITS.maxExpansionWork = 2.000.000`), defensa en `walk` y conteo por vuelta escrita.
  - El 3D arma vacía, con `PART_TOO_LARGE`, una parte que pasa los topes.
  - Guardia de tiempos en `packages/pattern-core/test/t20-topes.test.ts` con los documentos hostiles (`test/support/hostile.ts`): `validatePattern`, con y sin `weightCat`, y `partProfile` bajo 50 ms (100 en la CI).
  - Enmiendas T20-1 y T20-2 del ADR 0011, y G-E4 del ADR 0010.
  - `buildScene` con los mismos documentos, en `packages/viewer-3d/test/t20-hostiles.test.ts`.
  - **Sin verificar en este cierre**: CA4-P9 (E2E en el navegador) repetido con los documentos hostiles.
- [x] T20-M2 corregido en `f99e397`.
  - `SignOutForm` emite `loopitalab:salir` y los `Autosave` vivos retienen el respaldo.
  - Segunda capa: `/auth/salir` redirige a `/?salida=1`, y `SignOutCleanup` vuelve a borrar.
  - Enmienda T20-6 del ADR 0011.
  - E2E: `apps/web/e2e/sesion/cuenta.spec.ts`, «cerrar sesión desde el estudio no deja el respaldo local ni el texto sin leer».
  - Vitest: `apps/web/test/qa-t20-respaldo.test.ts`.
- [x] Huecos 1 a 3 y T20-B5 aplicados en `cd6c02a`, como enmiendas T20-3, T20-4 y T20-5 del ADR 0011, con las pruebas de RT1 en el borde (`t20-topes.test.ts`). `prepareDocument` devuelve a lo más 100 errores (`f99e397`, T20-8).
- [x] T20-B6 corregido en `f99e397`: `MAX_PENDING_TOTAL = 200.000` y `MAX_BACKUP_CHARS = MAX_DOCUMENT_BYTES + MAX_PENDING_TOTAL + 1024`; si no cabe, se quita primero `pendingText` (T20-7).
- [x] T20-B7 en el texto: `/privacidad` dice que el texto que no se pudo leer se conserva hasta 14 días (`f99e397`). **El marcador legal sigue abierto**: el texto entra en la revisión legal del punto de más abajo.
- [x] T20-B8 y T20-I1 en el repositorio (`295af53`).
  - `20261116225434_quitar_update_terminology.sql` quita `terminology` del permiso de UPDATE.
  - `session.ts` ya no la lee.
  - `10_rls_check.sql` comprueba la lista exacta de columnas y que actualizar `terminology` falla.
- [x] **Migración `20261116225434_quitar_update_terminology.sql` aplicada en el proyecto real (2026-11-16; verificada la lista de columnas con UPDATE)** (la de `pattern_dialect` ya lo está). Después del despliegue, otra migración borra la columna (decisión 5, paso b).
- [ ] **`10_rls_check.sql` repetido en el proyecto real**, sin dejar datos y con la aserción de T20-I1.
- [ ] **Revisión legal** de `/privacidad` y `/terminos`, con `pendingText` (T20-B7): Ley 19.628, Ley 21.719 desde el 2026-12-01 y RGPD si hay usuarias en la UE. Pendiente de revisión legal: no lo puedo confirmar.
- [ ] Lo que sigue abierto de las fases 2 y 3 ("Falta antes de la beta" de T17 y ALTO-1 de T15).
- [ ] **T20-I4**: rechazar controles y marcas bidireccionales en `display_name` antes de publicar (fase 7).
- [ ] **T20-I6**: `minimumReleaseAge` y Dependabot.
- [ ] Antes de la fase 5 o la 7: T20-A1 y T20-M1 ya están corregidos; falta T20-I4.

Los informativos T20-I2 (repetir el check en el proyecto real, ya incluido arriba), T20-I3 (documentar TOCTOU en `validate.ts`) y T20-I5 (prueba inestable de `viewer-3d`, relacionada con BUG-QA4-5, corregido en `ffe3ba3`) no se verificaron uno por uno en este cierre.
