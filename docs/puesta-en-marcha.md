# Puesta en marcha

Pasos para conectar el proyecto de Supabase y levantar la web en tu computador.

## 1. Aplicar las migraciones en Supabase

Se necesitan las tres migraciones de `supabase/migrations`, en orden: esquema con RLS, datos de referencia y storage.

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

Con esta opción, la CLI no sabrá qué migraciones ya se aplicaron. Si después usas `db push`, primero marca estas tres como aplicadas con `npx supabase migration repair --status applied <versión>`.

**No ejecutes** los archivos de `supabase/checks/`: el `00_stubs_supabase.sql` imita a Supabase en un PostgreSQL común y solo sirve para pruebas.

## 2. Configurar Auth en el panel

En Authentication > URL Configuration:

- **Site URL**: `http://localhost:3000` (cámbiala por el dominio real cuando publiques).
- **Redirect URLs**: agrega `http://localhost:3000/auth/callback` y, más adelante, `https://TU-DOMINIO/auth/callback`.

En Authentication > Providers > Email, deja activada la confirmación por correo.

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
