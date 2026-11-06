/*
 * Límites compartidos entre el servidor y el navegador (este módulo no es `server-only`).
 */

/**
 * Tamaño máximo del documento serializado (bytes de JSON compacto) que acepta el servidor.
 *
 * Peor documento válido medido (T4, 2026-11-06): 200 x 200, 32 lanas con nota de 500 caracteres,
 * repeticiones máximas, 50 notas de 2000 caracteres. Cada cifra mide algo distinto:
 *  - JSON compacto del cliente (lo que mide este tope): 228 573 bytes con ASCII y 576 933 con
 *    caracteres de 4 bytes (el peor caso en bytes);
 *  - texto de jsonb en la base (`document::text`, lo que mide `patterns_document_text_size`):
 *    269 235 bytes con ASCII y 617 595 con caracteres de 4 bytes (supabase/checks/10_rls_check.sql).
 * La base limita el texto de jsonb a 1 000 000 bytes. El texto de jsonb mide hasta ~1,5 veces el JSON
 * compacto (agrega un espacio tras cada `:` y `,`; el máximo se da con muchas claves y valores cortos),
 * así que el servidor corta antes, en 750 000, para dar siempre un error claro (TOO_LARGE) y no uno de
 * la base. También cabe en el límite por defecto del cuerpo de una Server Action de Next.js (1 MB).
 */
export const MAX_DOCUMENT_BYTES = 750_000;
