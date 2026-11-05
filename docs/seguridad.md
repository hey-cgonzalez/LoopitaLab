# Seguridad: estado y pendientes

Última revisión: 2026-11-05, agente `revisor-seguridad`, sobre la rama `fase-2/preparacion` (antes: 2026-11-04, rama `fase-1/supabase-auth`). Sin hallazgos críticos. Las comprobaciones de RLS están en `supabase/checks/10_rls_check.sql` y corren en CI.

## Corregido

| Hallazgo | Corrección | Dónde |
|---|---|---|
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

## Riesgos aceptados

- **F2-M7 (medio, de plataforma).** Con `secure_password_change`, Supabase Auth solo exige el nonce de re-autenticación si la sesión tiene más de 24 horas. Quien obtenga el `access_token` de una sesión reciente (por ejemplo, en un equipo compartido; la cookie no es httpOnly porque la necesita el cliente del navegador) puede cambiar la contraseña con `PUT /auth/v1/user` directo a Supabase, sin pasar por la aplicación. M4 y F2-M5 protegen solo el camino de la aplicación. Mitigaciones en el panel (pendientes, ver abajo): aviso por correo de "contraseña cambiada", sesiones con tiempo máximo e inactividad, y evaluar MFA (aal2) para acciones sensibles.
- El semáforo de re-codificación es por instancia del servidor, no global. Los topes por usuaria sí están en la base.
- La instantánea de una denuncia conserva `pattern_owner_id` (sin clave foránea) aunque la autora borre su cuenta, como evidencia de moderación. Debe declararse en la política de privacidad.
- Las denuncias que hizo una usuaria se borran en cascada si ella elimina su cuenta.

## Pendiente

| Tema | Cuándo | Qué hacer |
|---|---|---|
| Clave secreta del servidor | Antes de usar las rutas nuevas | La migración `20261105133225_denuncias_y_derechos.sql` ya está aplicada en el proyecto real (2026-11-05, con pg_cron activo y la purga programada) y `10_rls_check.sql` pasó sobre esa base. Falta configurar `SUPABASE_SECRET_KEY` (solo servidor) en `.env.local` y en el hosting: la necesitan subir, exportar y eliminar. Si se recrea el proyecto: activar pg_cron **antes** de aplicar la migración, o programar la purga a mano con `select cron.schedule('loopitalab-purga-diaria', '17 4 * * *', 'select public.purge_expired_data()');` |
| Comprobaciones en la base real | Al aplicar la migración | Que un token emitido antes del bloqueo deja de servir en `getUser`; que los JWT traen `session_id` (sin él la re-autenticación falla siempre, de forma cerrada); que `amr[].timestamp` no cambia con un refresh |
| Mitigar F2-M7 | Antes de cualquier beta con personas externas | Authentication > Emails: activar la notificación de "contraseña cambiada". Authentication > Sessions: tiempo máximo de sesión e inactividad. Evaluar MFA. Probar el escenario contra la versión de Auth del proyecto |
| Purga programada (F2-B18) | Al aplicar la migración y en cada despliegue | Comprobar `select 1 from cron.job where jobname = 'loopitalab-purga-diaria'`. Sin esa tarea, `/privacidad` promete plazos (30 y 180 días) que no se cumplen |
| CAPTCHA en Auth (M5, segunda capa) | Antes de abrir el registro al público | El front ya lo soporta con `NEXT_PUBLIC_TURNSTILE_SITE_KEY`. Falta crear el widget de Turnstile, activarlo en Authentication > Attack Protection y pasar `[auth.captcha] enabled = true` en `config.toml`, todo al mismo tiempo que se despliega el front. Activar solo una de las dos partes rompe el acceso o da una protección falsa |
| `pg_jsonschema` (B1, segunda capa) | Fase 7, con la vista de patrones compartidos | Evaluar validar el documento también en la base |
| Publicar patrones | Fase 7, antes de ofrecer la opción | Ya existen la denuncia (`pattern_reports`, `ReportPatternForm`) y los términos en borrador. Falta montar el formulario en la vista pública, una interfaz de moderación (hoy se revisa en el editor de tablas con `status = 'open'`) y la revisión legal |
| Aviso de derechos al subir imágenes | Fase 5, con la interfaz de subida | Confirmación obligatoria en el formulario de subida |
| Ley 21.719 (protección de datos, Chile) | Antes de cualquier beta con personas externas | Ya existen exportar y eliminar la cuenta, y `/privacidad` y `/terminos` en borrador. Falta completar los marcadores ([RAZÓN SOCIAL], [RUT], plazos, bases de licitud) y la revisión legal. Según Diario Constitucional (junio de 2026), entra en vigencia el 1 de diciembre de 2026; no se pudo confirmar una posible postergación a 2027. Mientras tanto rige la Ley 19.628. Si hay usuarias en la UE, también aplica el RGPD |
| CSP completa | Antes del lanzamiento | Debe permitir `https://challenges.cloudflare.com` en `script-src` y `frame-src` para Turnstile |
