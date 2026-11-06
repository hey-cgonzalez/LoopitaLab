-- T4 (ADR 0006): consistencia del título y tope de tamaño del documento.
--
-- 1. patterns.title duplica document.title y la restricción patterns_document_consistent no los
--    comparaba. Una sola fuente de verdad: ahora la restricción exige document ->> 'title' = title.
--    El validador (TITLE_LENGTH) ya exige 1 a 120 caracteres en el documento, igual que la columna.
-- 2. Tope de tamaño del documento: patterns_document_size mide pg_column_size, que cuenta el valor
--    ya comprimido (TOAST), así que no acota el tamaño real. Se agrega un tope sobre el texto
--    JSON (octet_length(document::text)), que es lo que viaja por la red y lo que Next.js acepta
--    en una Server Action. El valor sale del peor documento válido medido (ver
--    supabase/checks/10_rls_check.sql y docs/seguridad.md).
--
-- No agrega funciones ni tablas. Los triggers (updated_at, patterns_guard_origin) corren como
-- postgres en esta migración y no alteran origin ni updated_at de forma relevante.
--
-- Reversión: ver el bloque comentado al final.

-- Se conserva la condición de B2 (yarns siempre como arreglo, 20261104034436) y se agrega el título.

-- Alinea las filas existentes (hoy no hay ninguna creada por la interfaz). El documento manda:
-- si su título es válido, la columna lo copia; si no, el documento recibe el de la columna.
update public.patterns
set title = document ->> 'title'
where jsonb_typeof(document -> 'title') = 'string'
  and char_length(document ->> 'title') between 1 and 120
  and title is distinct from document ->> 'title';

update public.patterns
set document = jsonb_set(document, '{title}', to_jsonb(title))
where document -> 'title' is distinct from to_jsonb(title);

alter table public.patterns drop constraint patterns_document_consistent;
alter table public.patterns add constraint patterns_document_consistent check (
  jsonb_typeof(document) = 'object'
  and jsonb_typeof(document -> 'yarns') = 'array'
  -- coalesce (T15, B-3): una clave ausente da NULL y un CHECK con NULL pasa; así no pasa.
  and coalesce(document ->> 'kind' = kind, false)
  and coalesce(document ->> 'technique' = technique, false)
  and coalesce((document ->> 'schemaVersion')::smallint = schema_version, false)
  and coalesce(document -> 'origin' ->> 'kind' = origin, false)
  -- El título debe ser texto (B2): jsonb_typeof evita que un número o un objeto se compare por su
  -- representación en texto. coalesce: un documento sin título (NULL) no pasa por omisión.
  and jsonb_typeof(document -> 'title') = 'string'
  and coalesce(document ->> 'title' = title, false)
);

alter table public.patterns add constraint patterns_document_text_size check (octet_length(document::text) <= 1000000);

-- ------------------------------------------------------------- reversión
-- Para deshacer esta migración:
--
--   alter table public.patterns drop constraint patterns_document_text_size;
--   alter table public.patterns drop constraint patterns_document_consistent;
--   alter table public.patterns add constraint patterns_document_consistent check (
--     jsonb_typeof(document) = 'object'
--     and jsonb_typeof(document -> 'yarns') = 'array'
--     and document ->> 'kind' = kind
--     and document ->> 'technique' = technique
--     and (document ->> 'schemaVersion')::smallint = schema_version
--     and document -> 'origin' ->> 'kind' = origin
--   );
--
-- (Los títulos alineados no se deshacen: eran iguales por construcción.)
