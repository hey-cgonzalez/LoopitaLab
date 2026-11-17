import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Términos de servicio" };

export default function Page() {
  return (
    <LegalPage title="Términos de servicio" updated="16 de noviembre de 2026">
      <section>
        <h2>1. Quiénes somos</h2>
        <p>
          LoopitaLab es una plataforma para diseñar patrones de crochet y de tejido a palillo, guardar proyectos y seguir su avance. La ofrece [RAZÓN SOCIAL], [RUT], con domicilio en [DOMICILIO].
          Contacto: [CORREO DE CONTACTO].
        </p>
        <p>Durante la beta el servicio puede cambiar, tener errores o interrumpirse. Al crear una cuenta aceptas estos términos y la <Link href="/privacidad">Política de privacidad</Link>.</p>
      </section>
      <section>
        <h2>2. Uso aceptable</h2>
        <p>Puedes usar LoopitaLab para tus propios patrones y proyectos. No puedes:</p>
        <ul>
          <li>subir o publicar contenido ilegal, ofensivo, que acose a otras personas o que infrinja derechos de terceros;</li>
          <li>intentar acceder a cuentas o datos de otras personas, ni vulnerar o sobrecargar el servicio (por ejemplo, con envíos automatizados masivos);</li>
          <li>usar el servicio para enviar spam o publicidad no solicitada;</li>
          <li>hacerte pasar por otra persona.</li>
        </ul>
        <p>Podemos suspender cuentas que incumplan estas reglas, avisando cuando sea posible.</p>
      </section>
      <section>
        <h2>3. Tus patrones son tuyos</h2>
        <p>
          Los patrones, notas y proyectos que creas siguen siendo tuyos. Nos das solo el permiso necesario para guardarlos, mostrártelos y, si tú decides compartirlos por enlace o hacerlos públicos,
          mostrarlos a quienes los vean. Puedes cambiar la visibilidad de un patrón, descargar tus datos o eliminar tu cuenta cuando quieras desde <Link href="/cuenta">tu cuenta</Link>. Si eliminas tu cuenta, los patrones que habías publicado o compartido por enlace dejan de estar disponibles, también en los proyectos de otras personas que los usaban.
        </p>
      </section>
      <section id="ia">
        <h2>4. Contenido generado con IA</h2>
        <p>
          La función Imagen a patrón usa inteligencia artificial para proponer un patrón aproximado. Todo patrón generado o modificado con IA queda etiquetado como &ldquo;Generado con IA&rdquo; y
          lista sus supuestos. Los conteos de puntos los calcula y valida un motor determinista, no la IA, pero el resultado es una propuesta: revísalo y teje una muestra antes de usarlo.
        </p>
        <ul>
          <li>La etiqueta &ldquo;Generado con IA&rdquo; no se puede quitar, tampoco si editas el patrón o lo publicas.</li>
          <li>El resultado es una aproximación: puede tener errores o diferir de la imagen. Revísalo completo y teje una muestra antes de empezar la pieza.</li>
          <li>Eres responsable del uso que hagas del patrón generado, incluido el de publicarlo.</li>
          <li>Durante la beta, la función puede estar habilitada solo para cuentas autorizadas y tener límites diarios.</li>
        </ul>
        <p>
          Cómo se tratan las imágenes en la generación con IA está en la <Link href="/privacidad#ia">Política de privacidad</Link>.
          [PENDIENTE DE REVISIÓN LEGAL]
        </p>
      </section>
      <section>
        <h2>5. Imágenes que subes</h2>
        <p>
          Sube solo imágenes que sean tuyas o para las que tengas permiso de quien tenga los derechos (fotografías, ilustraciones, obras de otras personas). Te pediremos confirmar que tienes ese permiso en el formulario de subida, cuando esté disponible la subida de imágenes, y al subir una imagen declaras que lo tienes.
          No uses imágenes de terceros que puedas identificar sin su consentimiento. Podemos eliminar imágenes que incumplan este punto.
        </p>
        <p>
          Eres responsable de las imágenes que subes y de tener derecho a usarlas. En cada subida te pediremos marcar una casilla que lo confirma. En esta versión se rechazan las fotos cuyo tema principal es una persona.
          Una versión reducida de la imagen se envía a un proveedor de IA para analizarla y se borra en los plazos de la <Link href="/privacidad#ia">Política de privacidad</Link>.
          [PENDIENTE DE REVISIÓN LEGAL]
        </p>
      </section>
      <section>
        <h2>6. Patrones públicos, denuncias y retiro de contenido</h2>
        <p>
          Si publicas un patrón, eres responsable de que tengas derecho a hacerlo. Cualquier persona con cuenta podrá denunciar un patrón público o compartido por enlace por derechos de autor, contenido ofensivo, spam u otro motivo.
          Revisaremos las denuncias y podemos ocultar o retirar el contenido, avisando a su autora cuando corresponda. Si crees que un patrón infringe tus derechos, escríbenos a [CORREO DE CONTACTO] con el enlace y la
          explicación. [PROCEDIMIENTO Y PLAZOS DE RETIRO: por definir con asesoría legal.]
        </p>
      </section>
      <section>
        <h2>7. Es un prototipo digital: teje una muestra</h2>
        <p>
          Las vistas previas 2D y 3D y los cálculos son aproximaciones. Los resultados reales dependen de tu tensión, tu lana y tus agujas. Antes de empezar una pieza, teje una muestra, mide tu gauge
          y compara con el patrón. No garantizamos que una prenda o figura quede exactamente igual a la vista previa.
        </p>
      </section>
      <section>
        <h2>8. Responsabilidad</h2>
        <p>
          El servicio se ofrece &ldquo;tal cual&rdquo; durante la beta. Hacemos copias de seguridad, pero te recomendamos exportar tus datos de vez en cuando. [LIMITACIÓN DE RESPONSABILIDAD: por definir con asesoría legal.]
        </p>
      </section>
      <section>
        <h2>9. Cambios y ley aplicable</h2>
        <p>
          [PENDIENTE DE REVISIÓN LEGAL: la Ley 19.628 sigue vigente hasta que entre en vigencia la Ley 21.719, anunciada para el 1 de diciembre de 2026 y aún sin confirmar. Si hay usuarias en la Unión Europea, también aplicaría el RGPD.]
        </p>
        <p>Si cambiamos estos términos de forma importante te avisaremos con anticipación. Se rigen por las leyes de Chile. [TRIBUNALES COMPETENTES: por definir con asesoría legal.]</p>
      </section>
    </LegalPage>
  );
}
