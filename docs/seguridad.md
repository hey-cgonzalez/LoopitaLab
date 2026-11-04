# Seguridad: estado y pendientes

Última revisión: 2026-11-04, agente `revisor-seguridad`, sobre la rama `fase-1/supabase-auth`. Sin hallazgos críticos. Las comprobaciones de RLS están en `supabase/checks/10_rls_check.sql` y corren en CI.

## Corregido

| Hallazgo | Corrección | Dónde |
|---|---|---|
| M1. La etiqueta de IA se podía quitar o falsificar | Un trigger impide crear patrones `ai` desde el cliente o quitarles la etiqueta; editar uno lo marca `ai_edited` | Migración `…034436_endurecimiento_seguridad.sql` |
| M2. Los patrones públicos exponían `owner_id` y `ai_meta` | Se eliminó `ai_meta`. La tabla solo deja leer los propios. Lo público se lee con `list_public_patterns` y `get_shared_pattern`, que devuelven columnas seguras y el nombre visible | Ídem |
| M3. Las subidas saltaban la validación del servidor | Se quitaron las políticas de inserción del cliente; subir pasa por el servidor (validar contenido, re-codificar y quitar EXIF) | Ídem |
| M4. Cualquier sesión podía cambiar la contraseña | Exige el enlace de recuperación de los últimos 15 minutos o la contraseña actual; después cierra las demás sesiones | `apps/web/src/app/(acceso)/actions.ts`, `lib/recovery.ts` |
| M5. Límite de intentos compartido por todas las usuarias | Ingreso, registro y recuperación corren en el navegador; Supabase ve la IP real de cada persona | `app/(acceso)/client-actions.ts` |
| B2. `yarns` como objeto esquivaba la regla de notas privadas | `yarns` debe ser arreglo | Migración de endurecimiento |
| B3. Un proyecto quedaba bloqueado si su patrón dejaba de ser público | El patrón se valida solo al asociarlo o cambiarlo (trigger) | Ídem |
| B4. Columnas editables de más (`id`, `created_at`, `project_id`) | Permisos de UPDATE por columna | Ídem |
| B5. Versiones sin tope | Máximo 200 por patrón | Ídem |
| B6. La URL de los correos podía salir del encabezado `Origin` | Se arma en el navegador con `NEXT_PUBLIC_SITE_URL` o el origen real de la página | `client-actions.ts` |
| B7. El callback aceptaba `token_hash` con cualquier `type` | Solo flujo PKCE (`?code=`) | `app/auth/callback/route.ts` |
| B8. Cierre de sesión desde otro sitio | Solo acepta solicitudes del mismo sitio | `app/auth/salir/route.ts` |
| B9. La configuración de Auth no estaba fijada | Confirmación de correo, cambio de contraseña seguro y contraseñas de 8 caracteres con letras y números | `supabase/config.toml` (replicar en el panel) |
| B10. `.gitignore` incompleto | `.env*` excepto `.env.example` | `.gitignore` |

## Pendiente

| Tema | Cuándo | Qué hacer |
|---|---|---|
| CAPTCHA en Auth (M5, segunda capa) | Antes de abrir el registro al público | Activar Turnstile o hCaptcha en Supabase y enviar `captchaToken` desde los formularios |
| Validar documentos ajenos antes de mostrarlos (B1) | Al construir la vista de patrones compartidos | Pasar todo documento ajeno por `validatePattern` de `pattern-core`. Evaluar `pg_jsonschema` en la base |
| Lockfile (B10) | En la primera instalación | Versionar `pnpm-lock.yaml` y cambiar la CI a `--frozen-lockfile` |
| Subida de imágenes por el servidor (M3) | Fase 5 (imagen → patrón) | Route Handler con la clave secreta solo en el servidor: revisar el contenido real, re-codificar y guardar |
| Publicar patrones | Antes de ofrecer la opción en la interfaz | Mecanismo de denuncia, términos de servicio y aviso de derechos al subir imágenes. Hoy la interfaz no permite publicar |
| Ley 21.719 (protección de datos, Chile) | Antes del lanzamiento | Política de privacidad y revisión legal. Según Diario Constitucional (junio de 2026), entra en vigencia el 1 de diciembre de 2026. Hay notas sobre una posible postergación a 2027 que no se pudieron confirmar. Si hay usuarias en la UE, también aplica el RGPD |
