-- GENERADO por scripts/gen-reference-sql.ts desde packages/yarn-catalog/data. No editar a mano.
-- Datos de referencia v2: grosores CYC 0–7, fibras y paleta propia (sin marcas).
--
-- Reemplaza los alias de yarn_weights que traían nombres de tienda (regla de oro 9: sin catálogos de
-- marcas) y las equivalencias en inglés con "Baby"/"Roving" por los datos limpios de grosores.json (T3).
-- No se editó 20261104010100_datos_referencia.sql porque ya está aplicada en el proyecto real: una
-- migración aplicada es historia inmutable. Esta es idempotente (upsert, nunca borra filas, porque
-- user_yarns referencia yarn_weights y palette_colors) y se puede reaplicar sin efectos.
-- Decisión: fuentesAlias (fuente de cada alias) vive solo en el paquete; la base solo necesita alias text[].

insert into public.yarn_weights (cat, nombre, ingles, alias, muestra_palillo_min, muestra_palillo_max, agujas_mm_min, agujas_mm_max, muestra_crochet_min, muestra_crochet_max, muestra_crochet_punto, crochet_mm_min, crochet_mm_max) values
  (0, 'Ultra Fino', array['Lace']::text[], array['Encaje', 'Hilo de crochet n.º 10']::text[], 33, 40, 1.5, 2.25, 32, 42, 'pa', 1.4, 2.25),
  (1, 'Super Fino', array['Fingering', 'Sock']::text[], array['Super Fino (Fingering)']::text[], 27, 32, 2.25, 3.25, 21, 32, 'pb', 2.25, 3.5),
  (2, 'Fino', array['Sport']::text[], array['Fino (Light DK)', 'Sport - Fino']::text[], 23, 26, 3.25, 3.75, 16, 20, 'pb', 3.5, 4.5),
  (3, 'Ligero', array['DK', 'Light Worsted']::text[], array['Ligero (DK)']::text[], 21, 24, 3.75, 4.5, 12, 17, 'pb', 4.5, 5.5),
  (4, 'Medio', array['Worsted', 'Aran', 'Afghan']::text[], array['Medio (Aran / Worsted)', 'Mediano']::text[], 16, 20, 4.5, 5.5, 11, 14, 'pb', 5.5, 6.5),
  (5, 'Abultado', array['Bulky', 'Chunky']::text[], array['Abultado (Chunky)', 'Grueso']::text[], 12, 15, 5.5, 8, 8, 11, 'pb', 6.5, 9),
  (6, 'Súper Abultado', array['Super Bulky']::text[], array['Super Grueso']::text[], 7, 11, 8, 12.75, 7, 9, 'pb', 9, 15),
  (7, 'Jumbo', array['Jumbo']::text[], array[]::text[], 0, 6, 12.75, null, 0, 6, 'pb', 15, null)
on conflict (cat) do update set
  nombre = excluded.nombre, ingles = excluded.ingles, alias = excluded.alias,
  muestra_palillo_min = excluded.muestra_palillo_min, muestra_palillo_max = excluded.muestra_palillo_max,
  agujas_mm_min = excluded.agujas_mm_min, agujas_mm_max = excluded.agujas_mm_max,
  muestra_crochet_min = excluded.muestra_crochet_min, muestra_crochet_max = excluded.muestra_crochet_max,
  muestra_crochet_punto = excluded.muestra_crochet_punto, crochet_mm_min = excluded.crochet_mm_min, crochet_mm_max = excluded.crochet_mm_max;

insert into public.fibers (id, nombre, origen, elasticidad, calidez, definicion, halo, brillo, afieltra, notas, usos) values
  ('lana', 'Lana', 'animal', 'alta', 'alta', 'media', 'bajo', 'bajo', true, 'Buena memoria; en colorwork las hebras se ''agarran'' y el dibujo se empareja al lavar.', array['colorwork', 'prendas']::text[]),
  ('merino', 'Merino', 'animal', 'alta', 'alta', 'alta', 'bajo', 'bajo', true, 'Suave al contacto con la piel.', array['prendas', 'colorwork']::text[]),
  ('merino_superwash', 'Merino superwash', 'animal (tratada)', 'media', 'alta', 'alta', 'bajo', 'medio', false, 'Tratada para lavado a máquina; más resbaladiza y puede estirarse.', array['prendas', 'calcetines', 'bebé']::text[]),
  ('alpaca', 'Alpaca', 'animal', 'baja', 'alta', 'media', 'medio', 'medio', true, 'Muy abrigada y con caída; cede con el uso.', array['prendas', 'accesorios']::text[]),
  ('mohair', 'Mohair', 'animal', 'media', 'alta', 'baja', 'alto', 'medio', true, 'El halo difumina el dibujo: no recomendado para colorwork detallado ni amigurumi definido.', array['prendas livianas', 'doble hebra']::text[]),
  ('seda', 'Seda', 'animal', 'baja', 'media', 'alta', 'bajo', 'alto', false, 'Aparece en mezclas (merino y seda).', array['prendas', 'accesorios']::text[]),
  ('algodon', 'Algodón', 'vegetal', 'baja', 'baja', 'alta', 'bajo', 'bajo', false, 'Puntos muy definidos; el mercerizado tiene brillo. Muy usado en amigurumi.', array['amigurumi', 'tapestry', 'verano', 'hogar']::text[]),
  ('lino', 'Lino', 'vegetal', 'baja', 'baja', 'alta', 'bajo', 'medio', false, 'Rígido al principio; se suaviza con los lavados.', array['verano', 'hogar']::text[]),
  ('yute', 'Yute', 'vegetal', 'baja', 'baja', 'media', 'bajo', 'bajo', false, 'Áspero y firme; aparece en mezclas con algodón.', array['canastos', 'decoración']::text[]),
  ('bambu', 'Bambú', 'artificial (celulosa)', 'baja', 'baja', 'alta', 'bajo', 'alto', false, 'Suave, con caída y brillo; pesa más que la lana.', array['verano', 'bebé']::text[]),
  ('viscosa', 'Viscosa', 'artificial (celulosa)', 'baja', 'baja', 'alta', 'bajo', 'alto', false, 'Brillo y caída; suele ir en mezclas.', array['verano', 'accesorios']::text[]),
  ('acrilico', 'Acrílico', 'sintética', 'media', 'media', 'alta', 'bajo', 'bajo', false, 'Económico, lavable y de colores vivos; transpira poco. Muy usado en amigurumi.', array['amigurumi', 'colorwork', 'mantas']::text[]),
  ('poliester', 'Poliéster', 'sintética', 'media', 'media', 'media', 'bajo', 'medio', false, 'Resistente; base de hilados tipo felpa o chenilla usados en peluches.', array['amigurumi', 'mantas']::text[]),
  ('lurex', 'Lurex', 'metalizada', 'baja', 'baja', 'media', 'bajo', 'alto', false, 'Fibra decorativa para destellos; se usa como acento o en mezclas.', array['detalles', 'fiesta']::text[]),
  ('poliamida', 'Poliamida (nylon)', 'sintética', 'media', 'baja', 'alta', 'bajo', 'medio', false, 'No aparece como filtro en los sitios revisados; se incluye porque refuerza las mezclas para calcetines. Pendiente de validación.', array['calcetines (en mezcla)']::text[])
on conflict (id) do update set
  nombre = excluded.nombre, origen = excluded.origen, elasticidad = excluded.elasticidad, calidez = excluded.calidez,
  definicion = excluded.definicion, halo = excluded.halo, brillo = excluded.brillo, afieltra = excluded.afieltra,
  notas = excluded.notas, usos = excluded.usos;

-- "orden" es unique y smallint (máx. 32767), así que se libera antes de reasignarlo con el upsert:
--   1) los colores que ya no están en la paleta (no se borran: user_yarns los puede referenciar) pasan a
--      20000+ y quedan ahí; 2) los demás se desplazan +10000 y el upsert los devuelve a 1..N.
-- Es idempotente: solo se mueven filas con orden < 10000, y los dos rangos de destino no se pisan entre sí
-- ni con 1..N, así que reaplicar (o aplicar con restos de una versión anterior) nunca choca con unique.
update public.palette_colors set orden = orden + 20000 where orden < 10000 and id not in ('blanco', 'crudo', 'gris-perla', 'gris-medio', 'grafito', 'negro', 'arena', 'camel', 'caramelo', 'canela', 'cafe', 'chocolate', 'vainilla', 'amarillo', 'damasco', 'mostaza', 'naranjo', 'ladrillo', 'rosa-palido', 'rosado', 'palo-rosa', 'coral', 'rojo', 'burdeo', 'lavanda', 'lila', 'malva', 'violeta', 'morado', 'berenjena', 'celeste', 'azul-cielo', 'azul-mezclilla', 'azul-rey', 'indigo', 'azul-marino', 'verde-menta', 'verde-manzana', 'verde-pasto', 'verde-oliva', 'verde-musgo', 'verde-botella', 'hielo', 'verde-agua', 'turquesa', 'jade', 'petroleo', 'azul-petroleo');
update public.palette_colors set orden = orden + 10000 where orden < 10000;
insert into public.palette_colors (id, nombre, hex, familia, tono, orden) values
  ('blanco', 'Blanco', '#F7F6F2', 'Neutros', 1, 1),
  ('crudo', 'Crudo', '#E9DDBE', 'Neutros', 2, 2),
  ('gris-perla', 'Gris perla', '#C3C2BD', 'Neutros', 3, 3),
  ('gris-medio', 'Gris medio', '#959490', 'Neutros', 4, 4),
  ('grafito', 'Grafito', '#55565A', 'Neutros', 5, 5),
  ('negro', 'Negro', '#1E1E1F', 'Neutros', 6, 6),
  ('arena', 'Arena', '#D5BB8E', 'Tierra', 1, 7),
  ('camel', 'Camel', '#BE925E', 'Tierra', 2, 8),
  ('caramelo', 'Caramelo', '#A36A38', 'Tierra', 3, 9),
  ('canela', 'Canela', '#7F4B2C', 'Tierra', 4, 10),
  ('cafe', 'Café', '#553624', 'Tierra', 5, 11),
  ('chocolate', 'Chocolate', '#2E1F16', 'Tierra', 6, 12),
  ('vainilla', 'Vainilla', '#F4E4A8', 'Amarillos y naranjos', 1, 13),
  ('amarillo', 'Amarillo', '#F2CD34', 'Amarillos y naranjos', 2, 14),
  ('damasco', 'Damasco', '#F4B183', 'Amarillos y naranjos', 3, 15),
  ('mostaza', 'Mostaza', '#CFA02A', 'Amarillos y naranjos', 4, 16),
  ('naranjo', 'Naranjo', '#DD6420', 'Amarillos y naranjos', 5, 17),
  ('ladrillo', 'Ladrillo', '#A7452A', 'Amarillos y naranjos', 6, 18),
  ('rosa-palido', 'Rosa pálido', '#F5D3D8', 'Rojos y rosados', 1, 19),
  ('rosado', 'Rosado', '#EC9DB0', 'Rojos y rosados', 2, 20),
  ('palo-rosa', 'Palo rosa', '#B98289', 'Rojos y rosados', 3, 21),
  ('coral', 'Coral', '#EB6E5E', 'Rojos y rosados', 4, 22),
  ('rojo', 'Rojo', '#BA222C', 'Rojos y rosados', 5, 23),
  ('burdeo', 'Burdeo', '#6A1C2C', 'Rojos y rosados', 6, 24),
  ('lavanda', 'Lavanda', '#DCD1EA', 'Morados', 1, 25),
  ('lila', 'Lila', '#B39CD0', 'Morados', 2, 26),
  ('malva', 'Malva', '#9A7194', 'Morados', 3, 27),
  ('violeta', 'Violeta', '#7B4CA6', 'Morados', 4, 28),
  ('morado', 'Morado', '#552D74', 'Morados', 5, 29),
  ('berenjena', 'Berenjena', '#35203D', 'Morados', 6, 30),
  ('celeste', 'Celeste', '#C3DCF0', 'Azules', 1, 31),
  ('azul-cielo', 'Azul cielo', '#7FB1DE', 'Azules', 2, 32),
  ('azul-mezclilla', 'Azul mezclilla', '#5B7DA3', 'Azules', 3, 33),
  ('azul-rey', 'Azul rey', '#2C5CB0', 'Azules', 4, 34),
  ('indigo', 'Índigo', '#2D3878', 'Azules', 5, 35),
  ('azul-marino', 'Azul marino', '#1A2540', 'Azules', 6, 36),
  ('verde-menta', 'Verde menta', '#C3E6CF', 'Verdes', 1, 37),
  ('verde-manzana', 'Verde manzana', '#9FCC57', 'Verdes', 2, 38),
  ('verde-pasto', 'Verde pasto', '#57A84E', 'Verdes', 3, 39),
  ('verde-oliva', 'Verde oliva', '#77762F', 'Verdes', 4, 40),
  ('verde-musgo', 'Verde musgo', '#4C5A2E', 'Verdes', 5, 41),
  ('verde-botella', 'Verde botella', '#1D4A33', 'Verdes', 6, 42),
  ('hielo', 'Hielo', '#D6F0EE', 'Turquesas', 1, 43),
  ('verde-agua', 'Verde agua', '#93D4CA', 'Turquesas', 2, 44),
  ('turquesa', 'Turquesa', '#25A8A6', 'Turquesas', 3, 45),
  ('jade', 'Jade', '#2E8A72', 'Turquesas', 4, 46),
  ('petroleo', 'Petróleo', '#1D6069', 'Turquesas', 5, 47),
  ('azul-petroleo', 'Azul petróleo', '#143C48', 'Turquesas', 6, 48)
on conflict (id) do update set
  nombre = excluded.nombre, hex = excluded.hex, familia = excluded.familia, tono = excluded.tono, orden = excluded.orden;
