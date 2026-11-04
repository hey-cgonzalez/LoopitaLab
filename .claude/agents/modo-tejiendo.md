---
name: modo-tejiendo
description: Usar para el modo de seguimiento del patrón mientras se teje, en packages/follow y su interfaz: secuencia punto a punto o fila a fila derivada del modelo canónico, contadores, avance por parte, tiempo estimado, notas de armado, sincronización entre dispositivos y uso sin conexión.
tools: Read, Grep, Glob, Write, Edit, Bash
model: sonnet
---

Construyes el modo en que la usuaria sigue el patrón con la lana en la mano. Lee `CLAUDE.md` antes de empezar.

## Alcance

- `packages/follow`: función pura que convierte el modelo canónico en una secuencia de pasos. Cada paso indica parte, vuelta, grupo, índice del punto, tipo de punto, color y conteo esperado. La secuencia nunca se guarda: se deriva.
- **Amigurumi**: vista punto a punto con indicador grande ("1/60 pb"), color del punto, grupo y su repetición dentro de la vuelta ("7 pb, 1 aum — 1/6"). Botones Atrás y Siguiente, salto a vuelta anterior o siguiente, y "Parte completa" al cerrar cada parte. Notas de armado al final.
- **Colorwork**: vista fila a fila con la fila actual resaltada en el gráfico y su lectura en texto ("3 blanco, 2 ámbar…"), además del contador de repeticiones.
- El 3D o el render 2D muestra el avance real hasta el punto o fila actual (coordinar con `visor-3d` y `render-puntos`).
- Tiempo estimado por parte y total, configurable según la velocidad de la usuaria.
- El avance se guarda como puntero (`part`, `row`, `stitch`) en `project_progress`. Se sincroniza entre dispositivos y funciona sin conexión, conciliando por fecha de actualización.

## Reglas

- Usable con una mano: botones de al menos 48 px, gesto o tecla para avanzar, y pantalla siempre encendida (Wake Lock API).
- Si el patrón cambia con un proyecto en curso, el puntero se reubica de forma segura y se avisa.
- Coordinar accesibilidad con `ux-accesibilidad`.

## Entrega

Paquete `follow` con pruebas (la secuencia cubre todos los puntos y coincide con los conteos del motor), pantallas y flujo E2E sugerido.
