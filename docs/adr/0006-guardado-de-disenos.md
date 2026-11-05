# ADR 0006: Guardado de diseños del estudio

- Estado: propuesto (requiere aprobación de la usuaria)
- Fecha: 2026-11-05
- Paquetes: `apps/web`, `supabase/`
- Relacionado: [ADR 0001](0001-modelo-canonico.md), [ADR 0003](0003-colorwork-en-esquema-v1.md), [docs/seguridad.md](../seguridad.md)

## Contexto

El estudio de colorwork (fase 2) crea y edita patrones con frecuencia. El esquema actual ya tiene:

- `patterns`, con el `document` completo, columnas de búsqueda que deben coincidir con él, límite de 2 MB y RLS;
- `pattern_versions`, inmutable, que se escribe solo con `snapshot_pattern()` y tiene un tope de 200 versiones.

Hay que decidir:

- cómo se guarda sin perder trabajo ni pisar ediciones de otro dispositivo;
- dónde se valida;
- si hace falta una migración.

## Decisión

### Cabe en el esquema actual

Un diseño de colorwork se guarda como una fila de `patterns` con `kind = 'chart'`, `technique = 'knit'`, `origin = 'manual'` y `visibility = 'private'`. No hacen falta tablas nuevas.

### Una migración menor recomendada

`patterns.title` duplica `document.title` y la restricción de consistencia no los compara. Para respetar la fuente única de verdad, `backend-supabase` agrega `document ->> 'title' = title` a `patterns_document_consistent`.

La migración es segura: hoy la interfaz no crea patrones. Si existiera alguna fila, la migración la alinea antes de recrear la restricción. El validador agrega `TITLE_LENGTH` (ADR 0003).

### Flujo de guardado

1. **Crear**:
   - Server Action `createChartPattern(input)`;
   - `newChartPattern`, luego `validatePattern` en el servidor y luego `insert`;
   - devuelve `id` y `updated_at`.
2. **Autoguardado**: el cliente guarda 2 s después de la última edición, al cambiar de pestaña y antes de salir.
   - Server Action `savePattern(id, document, expectedUpdatedAt)`:
     - pasa el documento por `migratePattern` y `validatePattern`;
     - si hay **errores**, se rechaza el guardado (las advertencias se aceptan);
     - si no, hace `update … where id = $id and updated_at = $expectedUpdatedAt`.
   - Si no se actualizó ninguna fila, es un **conflicto** (otro dispositivo o pestaña guardó antes). La interfaz ofrece recargar o sobrescribir; sobrescribir es una acción explícita.
3. **Respaldo local**: el último documento sin guardar se conserva en `localStorage` de la usuaria, para recuperarlo si se pierde la conexión. Se borra al guardar bien.
4. **Versiones**:
   - `snapshot_pattern()` se llama **solo** con "Guardar versión" (con nombre opcional) y, desde la fase 3, al empezar un proyecto, para fijar `projects.pattern_version`;
   - nunca en el autoguardado, para no consumir el tope de 200.
5. **Lectura**: todo documento que se abre pasa por `migratePattern` y `validatePattern`. Los ajenos ya siguen esa regla (B1, `apps/web/src/lib/shared-pattern.ts`).

### Límites y tamaño

- **Tamaño máximo**: en la fase 2, la interfaz limita el motivo a 200 × 200 celdas. `LIMITS.maxCells` (250.000) no cambia, porque protege al validador.
- **Pruebas que hace `backend-supabase`**:
  - el peor caso de documento de la interfaz (200 × 200, 32 lanas, celdas aleatorias) cabe en `pg_column_size(document) <= 2000000` y en el límite del cuerpo de las Server Actions de Next.js;
  - si no cabe, se ajusta el límite del cuerpo o se adelanta la codificación compacta de `cells` (ADR 0003, sección 6).
- **Miniaturas**: en la fase 2, la lista "Mis diseños" muestra título, forma, tamaño y fecha, sin miniatura, porque leer documentos completos en una lista es caro. Las miniaturas serán un derivado regenerable en caché. Su diseño se registra cuando se construyan.

## Alternativas descartadas

- **Versión en cada guardado**: agota el tope de 200 en una tarde de trabajo y llena el almacenamiento.
- **Guardar documentos con errores como borrador**: un documento inválido en `patterns` contamina todas las vistas derivadas. Las operaciones de `edit.ts` no producen errores estructurales; el único caso posible (gráfico sin puntos) se informa sin guardar.
- **Validar solo en el cliente**: el cliente no es confiable; el servidor siempre valida.
- **Tiempo real o CRDT entre dispositivos**: no se justifica en v1. Basta con la concurrencia optimista con `updated_at`.

## Consecuencias

- Una sola migración menor en la fase 2 (consistencia del título).
- Las Server Actions de guardado pasan por `revisor-seguridad`: validan en el servidor, ponen límites de tamaño y solo permiten guardar patrones propios (RLS).
- El modo tejiendo (fase 3) siempre trabaja sobre una versión fija del patrón. Pendiente para la fase 7: hoy `pattern_versions` y `snapshot_pattern()` solo sirven a la dueña. Un proyecto sobre un patrón público ajeno necesitará otra forma de fijar la versión.
