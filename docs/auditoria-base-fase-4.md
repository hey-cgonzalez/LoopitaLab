# Auditoría de la base real para la fase 4 (T2)

Fecha: 2026-11-13. Proyecto real de Supabase. Solo consultas de lectura (MCP `execute_sql`).

## Resultado

**La v2 del esquema (ADR 0011) no necesita migración SQL de `patterns`.**

| Revisión | Resultado |
|---|---|
| Diseños (`patterns`) | 2, los dos con `schemaVersion` 1 y ninguno escrito (`kind = 'written'` o con `parts`) |
| Versiones (`pattern_versions`) | 1, con `schemaVersion` 1 y no escrita |
| Columna `patterns.schema_version` | `smallint not null`, sin valor por defecto ni CHECK que fije el valor 1 |
| `patterns_document_consistent` | Exige que `document.schemaVersion` coincida con la columna, sin fijar un valor: acepta 2 |
| `patterns_kind_check` | Ya admite `'chart'` y `'written'` |
| Funciones que nombran `schema_version`, `parts` o `written` | Solo `get_shared_pattern` y `list_public_patterns`, que **devuelven** la columna sin filtrarla ni compararla |

## Consecuencias

- Guardar un documento v2 solo exige que el servidor escriba `schema_version = 2` junto con `document.schemaVersion = 2`; la restricción de consistencia ya lo obliga.
- Las versiones fijadas en v1 se siguen leyendo con la migración en memoria de `pattern-core` (`STEPS[1]`), como dice el ADR 0011.
- Volver a revisar antes del despliegue de la v2 si aparecen diseños escritos en la base real (hoy no hay).

## Consultas usadas

```sql
-- conteos y versiones de esquema
select count(*) from public.patterns;
select count(*) from public.patterns where document->>'kind' = 'written' or document ? 'parts';
select json_agg(distinct document->>'schemaVersion') from public.patterns;
-- lo mismo en public.pattern_versions
-- restricciones que nombran schema, parts, written o kind
select conname, pg_get_constraintdef(oid) from pg_constraint
 where connamespace = 'public'::regnamespace and pg_get_constraintdef(oid) ~* 'schema|parts|written|kind';
-- funciones cuyo cuerpo las nombra, y las líneas donde aparece schema_version
select proname from pg_proc
 where pronamespace = 'public'::regnamespace and prosrc ~* 'schemaVersion|schema_version|''parts''|written';
-- columnas schema_version, valor por defecto y nulos
select table_name, column_name, column_default, is_nullable from information_schema.columns
 where table_schema = 'public' and column_name = 'schema_version';
```
