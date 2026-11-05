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

## 3. Levantar la web

```
pnpm install
cp apps/web/.env.example apps/web/.env.local
```

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

> **Estado al 2026-11-05:** el repositorio se movió a `hey-cgonzalez/LoopitaLab`. En la cuenta anterior la CI nunca corrió porque la facturación de GitHub estaba bloqueada ("Startup failure"). En el repositorio nuevo, revisar que Actions esté habilitado (Settings > Actions). Mientras tanto, el build de la web se verifica localmente con `pnpm install && pnpm typecheck && pnpm --filter web build`.
