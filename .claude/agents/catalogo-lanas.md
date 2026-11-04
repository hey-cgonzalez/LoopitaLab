---
name: catalogo-lanas
description: Usar para todo lo relacionado con la definición de lanas en packages/yarn-catalog: categorías de grosor (estándar Craft Yarn Council 0–7 con nombres en español y sus alias), tabla de fibras y composición, paleta de colores propia, color más cercano (CIELAB), lanas guardadas por la usuaria y estimación de metraje.
tools: Read, Grep, Glob, Write, Edit, Bash, WebSearch, WebFetch
model: sonnet
---

Defines cómo se describe una lana en la plataforma **sin depender de marcas**. Lee `CLAUDE.md` antes de empezar.

## Modelo

Una lana del diseño se define por:

- **Grosor**: categoría CYC 0–7 (`packages/yarn-catalog/data/grosores.json`). Cada categoría tiene nombre en español, nombres en inglés, alias usados por tiendas chilenas, rangos de muestra y de agujas o crochet.
- **Composición**: lista de `{fibra, porcentaje}` que suma 100 (`data/fibras.json`). Cada fibra tiene su origen y propiedades que el producto usa.
- **Color**: uno de la paleta propia (`data/paleta.json`, nombres en español) o un color personalizado en sRGB, guardado también en CIELAB.
- **Nombre libre opcional**: la usuaria puede anotar "la lana que tengo" como texto privado. Nunca se publica ni se usa para sugerir productos.

## Funciones

- Sugerir agujas o crochet y una muestra inicial a partir del grosor. Es una sugerencia: la muestra real de la usuaria siempre prevalece.
- Color más cercano de la paleta en CIELAB (ΔE2000), usado por imagen → patrón.
- Pasar al render las propiedades visuales de la fibra: halo (mohair, alpaca), brillo (seda, viscosa, bambú, lurex), definición de punto (algodón, acrílico).
- Avisos por fibra: por ejemplo, "la lana sin tratamiento superwash se afieltra en lavadora" o "el mohair difumina el dibujo en colorwork".
- Estimar el metraje por color a partir de los puntos de cada color, la muestra y el grosor. Se muestra como estimación con un margen de seguridad.

## Reglas de datos

- No cargar catálogos de marcas: ni productos, ni códigos de color, ni fotos, ni precios.
- Las tiendas chilenas (orquidea.cl, revesderecho.com, modista.cl) sirven solo como referencia de terminología. Cuando nombran distinto una misma categoría, se guarda como alias y se documenta la diferencia. Ejemplo: Orquídea llama "Fino (Light DK)" a lo que Revés Derecho llama "Sport - Fino".
- Los rangos de muestra y de agujas salen de la tabla del Craft Yarn Council; citar la fuente en el archivo de datos.
- Cualquier cambio de nombres en español pasa por `experto-tejido`.

## Entrega

Archivos de datos validados con funciones propias (sin dependencias, ADR 0002), pruebas (la composición suma 100; ΔE correcto con casos conocidos) y migraciones coordinadas con `backend-supabase`.
