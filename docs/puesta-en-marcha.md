# Puesta en marcha

Pasos para conectar el proyecto de Supabase y levantar la web en tu computador.

## 1. Aplicar las migraciones en Supabase

> **Estado del proyecto LoopitaLab (xsutqyhbvgxfdsfxhvnr) al 2026-11-04:** las cinco migraciones están aplicadas y registradas en el historial, y las verificaciones de `10_rls_check.sql` pasaron sobre la base real. `npx supabase db push` solo aplicará migraciones nuevas.

Se necesitan las cinco migraciones de `supabase/migrations`, en orden: esquema con RLS, datos de referencia, storage, endurecimiento de seguridad e índices.

**Opción A: con la CLI de Supabase (recomendada)**

```
npx supabase login
npx supabase link --project-ref xsutqyhbvgxfdsfxhvnr
npx supabase db push
```

`link` pide la contraseña de la base de datos. Está en Supabase, en Project Settings > Database.

**Opción B: desde el panel**

Abre SQL Editor y ejecuta, en este orden, el contenido de cada archivo:

1. `supabase/migrations/20261104010000_esquema_inicial.sql`
2. `supabase/migrations/20261104010100_datos_referencia.sql`
3. `supabase/migrations/20261104010200_storage_subidas.sql`
4. `supabase/migrations/20261104034436_endurecimiento_seguridad.sql`
5. `supabase/migrations/20261104035130_indices_claves_foraneas.sql`

Con esta opción, la CLI no sabrá qué migraciones ya se aplicaron. Si después usas `db push`, primero márcalas como aplicadas con `npx supabase migration repair --status applied <versión>`.

**No ejecutes** los archivos de `supabase/checks/`: el `00_stubs_supabase.sql` imita a Supabase en un PostgreSQL común y solo sirve para pruebas.

## 2. Configurar Auth en el panel

> **Estado al 2026-11-04:** aplicado en el proyecto LoopitaLab. Site URL y Redirect URL apuntan a `localhost:3000`, la confirmación de correo y el cambio de contraseña seguro están activos, y las contraseñas exigen 8 caracteres con letras y números. "Require current password" queda desactivado porque la web ya lo exige, salvo en el flujo de recuperación. La protección contra contraseñas filtradas requiere plan Pro.

En Authentication > URL Configuration:

- **Site URL**: `http://localhost:3000` (cámbiala por el dominio real cuando publiques).
- **Redirect URLs**: agrega `http://localhost:3000/auth/callback` y, más adelante, `https://TU-DOMINIO/auth/callback`.

Deja la configuración igual a `supabase/config.toml`:

- **Authentication > Sign In / Providers > Email**: confirmación de correo activada y "Secure password change" activado.
- **Authentication > Policies (o Passwords)**: largo mínimo 8 y requisito de letras y números.

Con la CLI también puedes aplicarla con `npx supabase config push`.

El correo que trae Supabase por defecto tiene un límite bajo de envíos por hora. Para la beta conviene configurar un SMTP propio (Authentication > Emails > SMTP Settings).

## 2b. Acceso con Google y Microsoft

> **Estado al 2026-11-05:** preparado en el código, **no activado** en el proyecto real. En `supabase/config.toml` ambos proveedores están con `enabled = false`. Las claves de cliente de Google y Microsoft se guardan **solo** en el panel de Supabase; nunca en la web, en `.env.local` de la web ni en el repositorio.

La URI de redirección que se registra en Google y en Microsoft es siempre la de Supabase Auth, no la de la web:

```
https://xsutqyhbvgxfdsfxhvnr.supabase.co/auth/v1/callback
```

Supabase devuelve después a la web en `/auth/callback`, que tiene que estar en la lista de Redirect URLs (ver más abajo).

### Google (Google Cloud Console)

1. Crear o elegir un proyecto en https://console.cloud.google.com.
2. **Google Auth Platform > Branding** (pantalla de consentimiento): nombre de la aplicación ("LoopitaLab"), correo de asistencia, dominio de la aplicación, enlaces a `/privacidad` y `/terminos`, y correo del desarrollador. En **Branding > Authorized domains**, agregar el dominio del sitio y `supabase.co`.
3. **Audience**: tipo de usuario **Externo**. Mientras esté en "Testing" solo entran las cuentas agregadas como usuarias de prueba; para abrirlo, **Publish app**. Con solo los permisos básicos no hace falta la verificación de Google, aunque el logo no se muestra hasta verificar la marca.
4. **Data access**: agregar solo `openid`, `.../auth/userinfo.email` y `.../auth/userinfo.profile`. Ningún otro permiso.
5. **Clients > Create client**, tipo **Web application**:
   - **Authorized JavaScript origins**: `http://localhost:3000` y, al publicar, `https://TU-DOMINIO`.
   - **Authorized redirect URIs**: `https://xsutqyhbvgxfdsfxhvnr.supabase.co/auth/v1/callback` (exacta).
6. Copiar el **Client ID** y el **Client secret** directamente al panel de Supabase (paso de abajo). No guardarlos en ningún archivo del repositorio.

### Microsoft (Microsoft Entra ID)

1. En https://entra.microsoft.com, **App registrations > New registration**.
2. **Supported account types**: "Personal Microsoft accounts only" ("Solo cuentas personales de Microsoft"). Es lo que corresponde al tenant `consumers` que usa el proyecto por defecto (`supabase/config.toml`).
   - Aceptar también cuentas de organización ("Accounts in any organizational directory ... and personal Microsoft accounts", tenant `common`) queda condicionado a configurar el claim `xms_edov` del paso 5 y **probar** con una cuenta de organización que un correo sin verificar no se vincule a una cuenta existente (`docs/seguridad.md`, Pendiente). Sin esa prueba, no usar `common`.
3. **Redirect URI**: plataforma **Web**, `https://xsutqyhbvgxfdsfxhvnr.supabase.co/auth/v1/callback`.
4. **Certificates & secrets > New client secret**: elegir vencimiento (máximo 24 meses) y **anotar la fecha** en el calendario del equipo: al vencer, el ingreso con Microsoft deja de funcionar. Copiar el **Value** (no el "Secret ID"); solo se muestra una vez.
5. **Token configuration > Add optional claim > ID**: agregar `email` y `xms_edov` (`xms_edov` es obligatorio solo si se usa `common`; con `consumers` no hace daño dejarlo). Si pide agregar el permiso de Microsoft Graph `email`, aceptar. En el **Manifest** debe quedar así:
   ```json
   "optionalClaims": {
     "idToken": [
       { "name": "email", "essential": false },
       { "name": "xms_edov", "essential": false }
     ]
   }
   ```
   `xms_edov` indica si el dominio del correo está verificado por la organización. Sin él, Supabase no puede distinguir correos verificados en cuentas de organización (ver `docs/seguridad.md`, "Acceso con proveedores").
6. **API permissions**: solo `openid`, `email` y `profile` (delegados, Microsoft Graph).
7. Anotar el **Application (client) ID**.

### Panel de Supabase

1. **Authentication > Sign In / Providers > Google**: activar, pegar Client ID y Client secret. Dejar "Skip nonce checks" desactivado.
2. **Authentication > Sign In / Providers > Azure (Microsoft)**: activar, pegar Application (client) ID y el Value del secreto. **Azure Tenant URL**: `https://login.microsoftonline.com/consumers` (solo cuentas personales). `https://login.microsoftonline.com/common` solo con `xms_edov` configurado y probado (ver paso 2 de Microsoft).
3. **Authentication > URL Configuration**:
   - **Site URL**: `https://TU-DOMINIO` (hoy `http://localhost:3000`).
   - **Redirect URLs**, exactas y sin comodines: `http://localhost:3000/auth/callback` y `https://TU-DOMINIO/auth/callback`.
4. **Authentication > Emails > Security notifications** (o "Notifications"): activar "Identity linked", "Identity unlinked" y "Password changed". Avisan a la usuaria si se vincula Google o Microsoft a su cuenta o si cambia la contraseña.
5. En `supabase/config.toml`, pasar `enabled = true` en `[auth.external.google]` y `[auth.external.azure]` para que la configuración quede fijada (las claves van como variables `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID`, `..._SECRET`, `SUPABASE_AUTH_EXTERNAL_AZURE_CLIENT_ID`, `..._SECRET` en `supabase/.env`, que no se sube).

### Web

En `apps/web/.env.local` (y en el hosting), al mismo tiempo que se activan en el panel:

```
NEXT_PUBLIC_AUTH_PROVIDERS=google,azure
```

Vacía, la web solo muestra correo y contraseña. Debe coincidir con lo activado en Supabase: un botón de un proveedor apagado da error al pulsarlo. Esta variable no es secreta; las claves de Google y Microsoft **no** van aquí.

### Comprobar

Con una cuenta de prueba de cada proveedor: entrar, entrar de nuevo con una cuenta de correo existente con el mismo correo (debe vincularse y llegar el aviso "identity linked"), cancelar en la pantalla del proveedor (debe volver a `/ingresar` con un aviso), y eliminar una cuenta creada solo con Google (debe pedir confirmar con Google). Con una cuenta que tiene contraseña y Google vinculado: eliminarla debe pedir la contraseña (Google no sirve) y cambiar la contraseña nunca debe ofrecer Google; una cuenta solo de Google crea su primera contraseña con el enlace por correo. Antes de activar los proveedores, hacer también la prueba de cuentas sin confirmar (M3) y las mitigaciones de F2-M7. Las verificaciones de seguridad pendientes están en `docs/seguridad.md`.

## 3. Levantar la web

El proyecto usa Node 24 LTS (mínimo 22.18), fijado en `.nvmrc`. Antes de instalar, activa esa versión:

```
nvm use
pnpm install
cp apps/web/.env.example apps/web/.env.local
```

> Con Node anterior a 22.18, `pnpm test` falla: esas versiones no ejecutan TypeScript directamente, y las pruebas del núcleo corren los archivos `.ts` sin compilar (ADR 0002). Revisa con `node --version`.

Completa `apps/web/.env.local` con la URL del proyecto y la clave publicable (`sb_publishable_…`). Esa clave es pública por diseño: lo que protege los datos son las políticas RLS. La clave secreta (`sb_secret_…`) **nunca** va en un archivo del front ni con prefijo `NEXT_PUBLIC_`.

```
pnpm dev
```

Abre http://localhost:3000, crea una cuenta, confirma el correo y crea un proyecto.

## 4. Verificaciones

| Qué | Comando |
|---|---|
| Pruebas del núcleo | `pnpm test` |
| Tipos | `pnpm typecheck` |
| RLS en un PostgreSQL local | aplicar `supabase/checks/00_stubs_supabase.sql`, luego las migraciones, y después `psql -f supabase/checks/10_rls_check.sql` |

GitHub Actions (`.github/workflows/ci.yml`) corre las tres cosas en cada pull request: pruebas, tipos y build de la web, y migraciones con RLS en PostgreSQL 16.

> **Estado al 2026-11-05:** el repositorio se movió a `hey-cgonzalez/LoopitaLab`. En la cuenta anterior la CI nunca corrió porque la facturación de GitHub estaba bloqueada ("Startup failure"). En el repositorio nuevo, revisar que Actions esté habilitado (Settings > Actions). Mientras tanto, el build de la web se verifica localmente con `pnpm install && pnpm typecheck && pnpm --filter @loopitalab/web build`.
