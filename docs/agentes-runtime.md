# Agentes de IA del producto (runtime)

Estos agentes funcionan dentro de la plataforma, cuando el usuario usa funciones con IA. Los orquesta código propio (`packages/ai-router`), no un LLM: el flujo es una máquina de estados predecible, y cada paso que requiere IA llama a un agente con el modelo que elige el router.

## Principio central

**La IA propone, el motor decide.** Ningún agente entrega conteos de puntos. Los agentes devuelven estructuras intermedias en JSON validado por esquema; el motor determinista (`pattern-core`) calcula el patrón y lo valida.

## Orquestador de trabajos (código, sin LLM)

Máquina de estados por trabajo (`ai_jobs`):

```
recibido → moderado → clasificado → [ruta plana | ruta 3D] → calculado → validado → redactado → entregado
                                                           ↘ (falla validación) → reintento con modelo superior → (falla de nuevo) → entregado con advertencias
```

Responsabilidades: aplicar cuotas y presupuesto, llamar al router, persistir cada paso (permite reanudar), registrar modelo, tokens, costo y latencia.

## Agentes

| # | Agente | Qué hace | Entrada | Salida (JSON) | Modelo base |
|---|---|---|---|---|---|
| 1 | **Moderador** | Rechaza contenido no permitido y detecta texto incrustado en la imagen que intente dar instrucciones | Imagen | `{allowed, reasons[], hasEmbeddedText}` | Haiku |
| 2 | **Clasificador** | Decide si la imagen es diseño plano (logo, ilustración, foto para gráfico) u objeto 3D (peluche, amigurumi, prenda); estima complejidad y sugiere técnica | Imagen + técnica elegida por el usuario | `{kind: "flat"\|"object3d", complexity: 1-5, subject, suggestedTechnique, cropSuggestion}` | Haiku |
| 3 | **Asistente de paleta** (ruta plana y estudio) | Sugiere recorte, número de colores, fusiones, nombres de color y combinaciones armónicas; también un grosor y una fibra adecuados según la técnica (por ejemplo, algodón o acrílico para amigurumi). El pixelado, la cuantización y el color más cercano de la paleta (CIELAB, ΔE2000) los hace código | Imagen recortada + cuantización + paleta | `{colorNames[], mergeSuggestions[], paletteMatches[], suggestedWeight, suggestedFibers[], backgroundColor}` | Haiku → Sonnet |
| 4 | **Descomponedor de forma** (ruta 3D) | Describe el objeto como partes primitivas (esfera, elipsoide, cilindro, cono, plano) con proporciones relativas, colores y uniones | Imagen + escala objetivo | `{parts:[{name, primitive, proportions, color, attachTo, position}]}` | Sonnet → Opus |
| 5 | **Redactor** | Escribe notas, instrucciones de armado y lista de supuestos en español claro, usando el glosario elegido por el usuario | Modelo canónico calculado + supuestos | `{notes, assemblyInstructions[], assumptions[]}` | Sonnet |
| 6 | **Explicador de errores** | Traduce errores del validador a lenguaje de tejedora y sugiere correcciones (que el motor vuelve a validar) | Errores del validador + vuelta afectada | `{explanation, suggestedFixes[]}` | Haiku |
| 7 | **Asistente del editor** (opcional v1.1) | Responde preguntas sobre el patrón abierto ("¿cómo hago esta disminución?") | Pregunta + contexto del patrón | Texto | Haiku → Sonnet |

## Flujos

### Ruta plana (gráfico de colores)

1. Moderador → Clasificador (`kind: flat`).
2. Código: recorte, redimensionado al número de puntos × filas objetivo (considerando la proporción de la muestra: un punto no es cuadrado), cuantización de colores y mapeo al color más cercano de la paleta propia.
3. Asistente de paleta nombra colores, sugiere fusiones, grosor y fibra; el usuario confirma en el selector de lana. Si la imagen se puede expresar como motivo + repeticiones, el código lo detecta y lo propone.
4. Motor: construye el gráfico canónico y valida (largos de hebra flotante en Fair Isle, cantidad de colores por fila).
5. Redactor: notas y supuestos. Se abre en el estudio de colorwork, editable, con etiqueta "Generado con IA".

### Ruta 3D (amigurumi aproximado)

1. Moderador → Clasificador (`kind: object3d`).
2. Descomponedor de forma entrega partes primitivas.
3. Motor: convierte cada primitiva en vueltas con aumentos y disminuciones usando la muestra del usuario (fórmulas geométricas deterministas) y valida.
4. Visor 3D muestra el resultado; el usuario ajusta proporciones.
5. Redactor: instrucciones de armado y supuestos. Se abre en el estudio amigurumi, listo para el modo tejiendo, marcado como "aproximación".

## Router de modelos

Configuración en `packages/ai-router/src/router.config.ts`. Reglas:

1. Cada agente tiene un modelo base y una cadena de escalamiento.
2. **Sube de modelo** cuando: la complejidad estimada por el Clasificador es ≥ 4, la salida no valida contra el esquema dos veces, o el motor rechaza el resultado.
3. **Baja de modelo** (o no usa IA) cuando: la tarea es determinista, el usuario está en plan gratuito y la tarea lo permite, o el presupuesto diario está sobre el 80 %.
4. Máximo de escalamientos por trabajo: 2. Después se entrega con advertencias o se pide más información al usuario.
5. Todo queda registrado en `ai_jobs` para ajustar las reglas con datos reales.

## Seguridad

- La imagen y cualquier texto dentro de ella se tratan como datos, nunca como instrucciones.
- Las claves de API viven solo en servidor.
- Cuotas por usuario y presupuesto global con corte automático.
- No se envían datos personales del usuario a los modelos.
