/**
 * Lector XML mínimo para las pruebas, sin dependencias (ADR 0002). Cubre lo que produce
 * `chartToSvg`: elementos, atributos entre comillas dobles, texto y referencias de
 * entidad. Lanza un error con la posición si el documento no está bien formado:
 * - etiquetas sin cerrar o cruzadas, un solo elemento raíz;
 * - nombres y atributos válidos, sin atributos repetidos;
 * - `<` nunca aparece en texto ni en atributos, y `&` solo como entidad conocida o numérica.
 */
export interface XmlElement {
  name: string;
  attrs: Record<string, string>;
  children: XmlElement[];
  /** Texto directo del elemento, con las entidades resueltas. */
  text: string;
}

const NAME = /^[A-Za-z_][\w.:-]*/;
const ENTITY = /^&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9A-Fa-f]+);/;

function decode(raw: string, at: number): string {
  for (let i = raw.indexOf("&"); i >= 0; i = raw.indexOf("&", i + 1)) {
    if (!ENTITY.test(raw.slice(i))) throw new Error(`"&" sin escapar en la posición ${at + i}`);
  }
  if (raw.includes("<")) throw new Error(`"<" sin escapar cerca de la posición ${at}`);
  return raw
    .replace(/&#x([0-9A-Fa-f]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

export function parseXml(src: string): XmlElement {
  let i = 0;
  const stack: XmlElement[] = [];
  let root: XmlElement | undefined;
  const ws = () => {
    while (i < src.length && /\s/.test(src[i] as string)) i++;
  };
  while (i < src.length) {
    if (src[i] !== "<") {
      const end = src.indexOf("<", i);
      const raw = src.slice(i, end < 0 ? src.length : end);
      const top = stack[stack.length - 1];
      if (!top) {
        if (raw.trim() !== "") throw new Error(`Texto fuera del elemento raíz en la posición ${i}`);
      } else top.text += decode(raw, i);
      i = end < 0 ? src.length : end;
      continue;
    }
    if (src.startsWith("</", i)) {
      i += 2;
      const m = NAME.exec(src.slice(i));
      if (!m) throw new Error(`Nombre de cierre inválido en la posición ${i}`);
      i += m[0].length;
      ws();
      if (src[i] !== ">") throw new Error(`Se esperaba ">" en la posición ${i}`);
      i++;
      const open = stack.pop();
      if (!open || open.name !== m[0]) throw new Error(`Cierre </${m[0]}> no coincide con <${open?.name ?? "(nada)"}>`);
      continue;
    }
    i++;
    const m = NAME.exec(src.slice(i));
    if (!m) throw new Error(`Nombre de etiqueta inválido en la posición ${i}`);
    i += m[0].length;
    const el: XmlElement = { name: m[0], attrs: {}, children: [], text: "" };
    for (;;) {
      const before = i;
      ws();
      if (src.startsWith("/>", i)) {
        i += 2;
        attach(el, true);
        break;
      }
      if (src[i] === ">") {
        i++;
        attach(el, false);
        break;
      }
      if (i === before) throw new Error(`Falta un espacio antes del atributo en la posición ${i}`);
      const a = NAME.exec(src.slice(i));
      if (!a) throw new Error(`Atributo inválido en la posición ${i}`);
      i += a[0].length;
      if (src[i] !== "=" || src[i + 1] !== '"') throw new Error(`Atributo sin ="…" en la posición ${i}`);
      i += 2;
      const end = src.indexOf('"', i);
      if (end < 0) throw new Error(`Atributo sin cerrar en la posición ${i}`);
      if (a[0] in el.attrs) throw new Error(`Atributo repetido ${a[0]} en la posición ${i}`);
      el.attrs[a[0]] = decode(src.slice(i, end), i);
      i = end + 1;
    }
  }
  if (stack.length > 0) throw new Error(`Etiqueta sin cerrar: <${stack[stack.length - 1]?.name}>`);
  if (!root) throw new Error("Documento sin elemento raíz");
  return root;

  function attach(el: XmlElement, selfClosing: boolean) {
    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(el);
    else if (root) throw new Error(`Segundo elemento raíz <${el.name}>`);
    else root = el;
    if (!selfClosing) stack.push(el);
  }
}

/** Todos los elementos del árbol, en orden de documento. */
export function walk(el: XmlElement, out: XmlElement[] = []): XmlElement[] {
  out.push(el);
  for (const c of el.children) walk(c, out);
  return out;
}

/** Elementos cuyo atributo `class` contiene la clase indicada. */
export function byClass(root: XmlElement, cls: string): XmlElement[] {
  return walk(root).filter((e) => (e.attrs.class ?? "").split(/\s+/).includes(cls));
}
