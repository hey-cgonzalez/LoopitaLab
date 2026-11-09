# ADR 0009: "Tejer este diseño": proyecto con versión fijada, puntero y sincronización entre dispositivos

- Estado: aceptado (aprobado por la usuaria el 2026-11-09 con las decisiones recomendadas 2 a 8 del roadmap). La migración y las funciones pasan por `revisor-seguridad`.
- Fecha: 2026-11-09
- Paquetes: `supabase/`, `apps/web`
- Relacionado: [ADR 0001](0001-modelo-canonico.md), [ADR 0006](0006-guardado-de-disenos.md) (E10: tejer exige `valid` verificado en el servidor; E11: concurrencia con `updated_at`), [ADR 0007](0007-follow-secuencia-de-colorwork.md) (puntero), [docs/seguridad.md](../seguridad.md) ("la base es la única barrera")

## Contexto

La fase 3 permite empezar a tejer un diseño de colorwork propio y seguirlo fila a fila en varios dispositivos. El esquema actual (migraciones hasta `20261107010000`) tiene:

- `projects (owner_id, pattern_id → patterns on delete set null, pattern_version integer, title, status)`, con UPDATE del cliente permitido sobre `title, status, pattern_id, pattern_version` y un disparador que exige que `pattern_id` sea propio o público al cambiarlo. **`pattern_version` es un entero sin clave foránea**: el cliente puede poner cualquier número, y nada asegura que esa versión exista ni que sea de ese patrón.
- `pattern_versions (pattern_id → patterns on delete cascade, version, document)`, inmutable, escrita solo por `snapshot_pattern()` (security definer, tope de 200 por diseño y 5000 por usuaria). La leen solo las dueñas.
- `project_progress (project_id PK, part_id, round_number ≥ 1, stitch_index ≥ 0, device, updated_at)`, con UPDATE del cliente sobre `part_id, round_number, stitch_index, device` y RLS a través del proyecto.
- Topes: 1000 proyectos y 5000 versiones por usuaria.

Problemas que hay que resolver:

1. **Borrar un diseño borra la versión que se está tejiendo**: `pattern_versions` cae en cascada con el patrón, y `projects.pattern_id` queda en null. El proyecto pierde el patrón y el avance deja de tener sentido.
2. **Carrera entre validar y fijar**: si la Server Action valida el documento y después llama `snapshot_pattern()`, otra pestaña puede autoguardar entre medio un borrador con errores de tejido, y se fijaría un documento no `valid` (contra E10 del ADR 0006).
3. **Cuota de versiones**: empezar varios proyectos con el mismo diseño sin cambios no debería gastar una versión cada vez.
4. **Sincronización del puntero** entre dispositivos y con cortes de conexión, sin perder ni pisar avances en silencio.

## Opciones

### Fijar la versión

- **A. Clave foránea a la versión** (`projects.pattern_version_id → pattern_versions.id`), escrita solo por una función del servidor que valida el estado del diseño de forma atómica.
- **B. Copiar el documento en el proyecto.**
- **C. Mantener `pattern_version integer`** y confiar en la Server Action.

### Borrar un diseño con proyectos

- **D1. Impedirlo** mientras existan proyectos que lo tejen (la clave foránea lo hace en la base).
- **D2. Borrar también los proyectos** (cascada).
- **D3. Conservar las versiones** con `pattern_id` nulo (versiones huérfanas).

### Sincronizar el puntero

- **S1. El último que escribe gana**, por hora del servidor.
- **S2. Concurrencia optimista** con `project_progress.updated_at`, igual que el autoguardado de diseños (ADR 0006, E11), con resolución explícita de conflictos.
- **S3. El máximo gana** (el avance nunca retrocede).
- **S4. Tiempo real** (Supabase Realtime) o CRDT.

## Decisión

**A + D1 + S2.**

### 1. Esquema (migración nueva, `backend-supabase`)

- `projects.pattern_version_id uuid references public.pattern_versions (id)` **con `on delete no action`** (no `restrict`):
  - borrar un diseño que tiene proyectos falla en la base (23503) y la acción `deletePattern` lo traduce a "Este diseño tiene N proyectos. Bórralos antes de borrar el diseño" (D1);
  - borrar la **cuenta** sigue funcionando: `auth.users` borra en cascada `projects` y `patterns` en la misma sentencia, y `no action` se comprueba al final de la sentencia, cuando los proyectos ya no existen. `restrict` se comprueba de inmediato y podría romper la eliminación de la cuenta según el orden de la cascada. Se prueba en `10_rls_check.sql`.
- **Consistencia**: restricción o disparador que exige que la versión pertenezca a `pattern_id` (`pattern_versions.pattern_id = projects.pattern_id`) cuando las dos columnas tienen valor.
- **Permisos por columna**: `authenticated` ya no puede escribir `pattern_id`, `pattern_version` ni `pattern_version_id` (ni INSERT ni UPDATE). Crear un proyecto suelto (sin patrón, como hoy en `/proyectos`) sigue igual: INSERT limitado a `title, status`. Solo las funciones de abajo asocian un patrón.
- `projects.pattern_version` (entero) queda **en desuso**: la interfaz nunca lo escribió. `backend-supabase` comprueba en la base real que no hay filas con valor y lo elimina en la misma migración, o lo deja documentado como obsoleto si hubiera datos.
- `project_progress`: CHECK de cotas generales (`round_number ≤ 100.001`, `stitch_index ≤ 100.000`, por `LIMITS`), sin depender del documento. La cota exacta la aplica `clampPointer` al leer (ADR 0007).
- Las dos funciones nuevas entran en la **lista permitida** del check de CI (hoy, 6 funciones ejecutables por la API), con `security definer`, `set search_path = ''` y grant explícito solo a `authenticated`.

### 2. Funciones del servidor

```sql
-- Empieza un proyecto con una versión fijada. Atómica.
start_chart_project(p_pattern_id uuid, p_expected_updated_at timestamptz, p_title text)
  returns table (project_id uuid, version integer, reused boolean)

-- Cambia la versión fijada de un proyecto propio a la del diseño actual. Atómica.
repin_project(p_project_id uuid, p_expected_updated_at timestamptz)
  returns table (version integer, reused boolean)
```

`start_chart_project`, en una transacción:

1. Bloquea la fila del patrón (`for update`) y exige `owner_id = auth.uid()`, `kind = 'chart'` y `updated_at = p_expected_updated_at` (comparación exacta, como E11 del ADR 0006). Si `updated_at` cambió, falla con un código propio de conflicto: **el documento que se fija es exactamente el que la Server Action validó** (resuelve el problema 2).
2. Si la última versión del patrón tiene un `document` igual (`=` de `jsonb`) al actual, la **reutiliza** (`reused = true`); si no, crea una con la misma lógica y topes de `snapshot_pattern()` (200 por diseño, 5000 por usuaria). Resuelve el problema 3.
3. Inserta el proyecto (`title` de 1 a 120, `status = 'in_progress'`, `pattern_id`, `pattern_version_id`) y su fila de `project_progress` con el puntero inicial (`round_number = 1`, `stitch_index = 0`). Respeta el tope de 1000 proyectos.

`repin_project` hace lo mismo sobre un proyecto propio existente y **no toca el puntero**: lo reubica la Server Action con `remapPointer` (ADR 0007) después de mostrarle a la usuaria qué cambia.

### 3. Server Actions (`apps/web/src/app/proyectos/actions.ts`, `backend-supabase`)

| Acción | Firma | Qué verifica | Resultado |
|---|---|---|---|
| `startProjectFromDesign` | `(patternId, title?)` | Sesión. **Lee el documento desde la base** (nunca lo recibe del cliente), `migratePattern` y `validatePattern` sin opciones: exige `valid` (ADR 0006, E10). Llama `start_chart_project` con el `updated_at` leído | `{ ok, projectId, version, reused }` o `NOT_KNITTABLE` (con los errores de tejido), `CONFLICT`, `QUOTA`, `NOT_FOUND` |
| `loadProject` | `(projectId)` | Sesión y propiedad. Lee el proyecto, la versión fijada y el avance. Pasa la versión por `migratePattern` y `validatePattern`: sin `savable` no se muestra; sin `valid` (regla nueva) se muestra con aviso | `{ ok, project, document, pointerRow, progressUpdatedAt, newerVersionAvailable }` |
| `saveProgress` | `(projectId, pinnedVersionId, pointer, expectedUpdatedAt)` | Sesión, enteros dentro de las cotas generales, y que `pinnedVersionId` siga siendo la versión fijada del proyecto (si otro dispositivo cambió de versión, el puntero es de otro plan: `VERSION_CHANGED`, y la pantalla se recarga). `update … where project_id = $id and updated_at = $expected` | `{ ok, updatedAt }`, `VERSION_CHANGED` con la versión actual, o `CONFLICT` con `{ currentPointer, currentUpdatedAt }` |
| `repinProject` | `(projectId, pointerAfterRemap)` | Igual que empezar (lee, exige `valid`, `updated_at` exacto) y llama `repin_project`; después guarda el puntero reubicado | `{ ok, version, reused }` o los mismos errores |

- El cliente **vacía el autoguardado** antes de llamar a `startProjectFromDesign`. Si lo guardado es un borrador con errores de tejido, la respuesta es `NOT_KNITTABLE` y el botón explica qué impide tejer (el panel ya agrupa "Impide tejer", T9 de la fase 2).
- **Códec del puntero** (capa de aplicación, `apps/web/src/lib/projects/progress-codec.ts`):
  - `round_number = rowsDone + 1` (1 a `totalRows + 1`; `totalRows + 1` = terminado);
  - `stitch_index = stitchesDone`;
  - `part_id = null` en gráficos (lo usará la fase 6);
  - al leer: `clampPointer(plan, decode(fila))`. Una fila sin avance (proyecto creado antes de esta fase) es `startPointer()`.
- `device` no se usa en la fase 3: identificar el dispositivo exige guardar un identificador o el agente de usuario, y el mensaje de conflicto funciona con la hora (`updated_at`). Si se usa más adelante, pasa por `revisor-seguridad`.
- Los 54000 (topes) se traducen a mensajes, junto con el pendiente de la fase 2 en `app/proyectos/actions.ts`.

### 4. Sincronización entre dispositivos (S2)

- **La interfaz es optimista**: avanzar cambia el puntero local al instante (la fila resaltada responde en menos de 100 ms, CA de la fase 3) y la escritura va después.
- **Escritura agrupada**: una sola en vuelo por proyecto; se envía el **último** puntero deseado 800 ms después del último toque, y de inmediato al ocultarse la página (`visibilitychange`). Cada respuesta trae el `updatedAt` nuevo, así un mismo dispositivo nunca entra en conflicto consigo mismo.
- **Conflicto** (`CONFLICT`):
  - si el puntero del servidor es igual al deseado, no hay conflicto real: se adopta su `updatedAt` en silencio;
  - si no, se muestra: "En otro dispositivo vas en la vuelta 40 (hace 3 min). Aquí vas en la vuelta 36. ¿Con cuál sigues?". Elegir "esta" reintenta con `currentUpdatedAt` (acción explícita, como sobrescribir en ADR 0006); elegir "la otra" adopta el puntero del servidor. **Nunca se pisa en silencio.**
- **Al volver a la pantalla** (foco o `visibilitychange` a visible) se relee el avance. Si el servidor avanzó y no hay escrituras pendientes, se adopta con un aviso ("Se actualizó desde otro dispositivo: vuelta 40"). Si hay escrituras pendientes, sigue el flujo de conflicto.
- **Sin conexión, en la fase 3**: solo cortes con la página ya abierta.
  - El último puntero deseado y su `updatedAt` base se guardan en `localStorage` bajo `loopitalab:<uid>:avance:<projectId>`, con `ownerId`, `savedAt` y versión de formato, con las mismas reglas que el respaldo del estudio (ALTO-1 y MEDIO-1 de T15): se borra al confirmarse la escritura, al cerrar sesión y al eliminar la cuenta; caduca a los 14 días; se descarta si es de otra cuenta, está dañado o pasa de un tamaño máximo.
  - El estado se ve siempre: "Guardado", "Guardando", "Sin conexión: tu avance se guardará al volver", "Conflicto".
  - Al volver la conexión se envía con su `updatedAt` base; si el servidor cambió mientras tanto, es un conflicto normal.
  - Abrir la pantalla sin conexión (service worker, PWA) es de la fase 6.

### 5. Qué exige `valid` (ADR 0006, E10)

| Acción | Exige | Dónde se verifica |
|---|---|---|
| "Tejer este diseño" | `valid` del documento **que se fija** | Servidor (`startProjectFromDesign` + `updated_at` exacto en `start_chart_project`) |
| "Pasar a la versión actual" | `valid` del documento nuevo | Servidor (`repinProject`) |
| Abrir un proyecto | `savable` de la versión fijada; si no es `valid` por una regla nueva, aviso | Servidor (`loadProject`) |
| Guardar el avance | Nada del documento (solo cotas del puntero) | Servidor y base |

La interfaz deshabilita "Tejer este diseño" con el motivo cuando el panel de validación tiene errores de tejido, pero esa marca es solo una ayuda: el servidor decide.

### 6. Lo que no cambia

- El progreso sigue siendo solo un puntero; nunca se copia el patrón al proyecto (regla de oro 1, ADR 0001). La versión fijada es una versión del diseño en `pattern_versions`, no una copia en el proyecto.
- Proyectos sobre patrones públicos ajenos: siguen pendientes para la fase 7 (`pattern_versions` solo la lee su dueña). En la fase 3, `start_chart_project` exige que el patrón sea propio.

## Alternativas descartadas

- **B. Copiar el documento en el proyecto**: duplica hasta 1 MB por proyecto, crea una segunda fuente de verdad del patrón y salta los topes de versiones. `pattern_versions` ya es la copia inmutable que se necesita.
- **C. Entero sin clave foránea**: el cliente puede apuntar a una versión inexistente o de otro diseño, y borrar el diseño deja el proyecto sin patrón.
- **D2. Borrar los proyectos en cascada**: una usuaria puede perder el avance de meses por limpiar "Mis diseños".
- **D3. Versiones huérfanas**: rompe la RLS de `pattern_versions`, que decide la dueña a través del patrón, y deja datos que la usuaria no ve ni puede borrar desde "Mis diseños".
- **S1. El último que escribe gana**: un teléfono con un puntero viejo (por ejemplo, abierto ayer) retrocede en silencio el avance de la tableta.
- **S3. El máximo gana**: retroceder es legítimo (deshacer una vuelta, desarmar), y el máximo lo desharía.
- **S4. Tiempo real o CRDT**: agrega un canal autenticado más y estado en el cliente para un dato que cambia cada varios minutos. Releer al volver a la pantalla basta.
- **Validar en la Server Action y llamar `snapshot_pattern()` aparte**: deja la carrera del problema 2.
- **Una versión nueva en cada proyecto**: gasta la cuota sin necesidad.

## Consecuencias

- Una migración en la fase 3 (columna, permisos, consistencia, cotas y dos funciones), con su verificación en `10_rls_check.sql`: el cliente no puede asociar ni cambiar la versión; un patrón con proyectos no se borra; borrar la cuenta sigue funcionando; las funciones exigen dueña, `kind = 'chart'` y `updated_at` exacto, y reutilizan la última versión idéntica.
- `deletePattern` traduce 23503 a un mensaje claro y la lista "Mis diseños" muestra cuántos proyectos tiene cada diseño (o lo dice al intentar borrar).
- Precisa la consecuencia del ADR 0006 sobre `snapshot_pattern()` al empezar un proyecto: se usa la lógica de `snapshot_pattern()` dentro de `start_chart_project`, con reutilización de la versión idéntica.
- La prueba E2E con sesión (pendiente de la fase 2) pasa a ser requisito: sin ella no se pueden verificar CA3-T5 y CA3-T6.
- `revisor-seguridad` revisa la migración, las funciones `security definer`, las Server Actions y el almacenamiento local del avance.
