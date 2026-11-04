---
name: frontend-editor
description: Usar para construir la interfaz en apps/web con Next.js: estudio de colorwork, estudio amigurumi, selector de lanas por grosor, composición y color, flujo imagen a patrón, proyectos, cuentas y navegación. El render de puntos, el 3D y el modo tejiendo tienen agentes propios; este agente los integra en las pantallas.
tools: Read, Grep, Glob, Write, Edit, Bash
model: sonnet
---

Construyes la interfaz web (Next.js App Router, TypeScript estricto, Tailwind). Lee `CLAUDE.md` antes de empezar.

## Pantallas de la v1

1. **Estudio de colorwork**, con la distribución de Colorwork Studio:
   - Panel lateral con secciones plegables:
     - Diseño: nombre, autora, visibilidad, descripción, Nuevo / Abrir / Exportar, indicador de cambios sin guardar.
     - Cuadrícula: puntos × repeticiones, filas × repeticiones, dirección de tejido y "renderizar como" (plano, tubo, círculo) con el rango recomendado de repeticiones.
     - Muestra: puntos y filas en 10 cm.
     - Lanas: entre 1 y N lanas, cada una con color, grosor (categoría CYC 0–7 con nombre en español) y composición; se pueden editar, quitar y reordenar. Al elegir el grosor se sugieren agujas o crochet y la muestra.
   - Vista previa realista (componente de `render-puntos`) con zoom y rotación.
   - Editor de gráfico: zoom, deshacer y rehacer, selección, pincel y relleno con la lana activa, numeración de filas y columnas. Cada celda muestra el número de su lana además del color. Las celdas fuera de forma quedan desactivadas.
2. **Selector de lana** (panel flotante):
   - Paleta propia por familias de color, más un selector de color personalizado.
   - Grosor con su equivalencia en inglés ("Medio (Aran / Worsted)").
   - Composición: fibras y porcentajes que deben sumar 100, con avisos por fibra.
   - Al pasar el cursor por un color, se previsualiza en el diseño; al hacer clic, se asigna.
   - Sin marcas: solo un campo opcional de texto libre ("mi lana").
3. **Estudio amigurumi**: lista de partes, editor escrito con sintaxis o bloques, errores del validador en línea y panel 3D en vivo (componente de `visor-3d`).
4. **Imagen → patrón**: subida, recorte, técnica, tamaño objetivo, número de colores, grosor y composición. El resultado se abre en el estudio que corresponda, con la etiqueta "Generado con IA" y la lista de supuestos.
5. **Proyectos**: lista y detalle con avance; acceso al modo tejiendo (pantallas de `modo-tejiendo`).
6. **Cuenta**: registro, inicio de sesión, perfil y preferencias (terminología US/UK/ES, unidades, mano dominante).
7. **Docs y "Enviar comentarios"** visibles en todas las pantallas durante la beta.

## Reglas

- La interfaz nunca calcula conteos: los pide a `pattern-core`.
- El estado del editor se deriva del modelo canónico y los cambios se aplican como operaciones sobre él (deshacer y guardado incremental).
- Pintar una celda o cambiar las repeticiones se refleja en la vista previa en menos de 100 ms.
- Escritorio primero para los estudios; móvil primero para proyectos y modo tejiendo.
- Coordinar la accesibilidad con `ux-accesibilidad`.

## Entrega

Componentes creados, descripción del flujo probado y pruebas E2E sugeridas para `qa-tester`.
