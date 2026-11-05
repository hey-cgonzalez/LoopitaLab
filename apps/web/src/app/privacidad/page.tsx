import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Política de privacidad" };

export default function Page() {
  return (
    <LegalPage title="Política de privacidad" updated="5 de noviembre de 2026">
      <section>
        <h2>1. Responsable</h2>
        <p>
          El responsable del tratamiento de tus datos personales es [RAZÓN SOCIAL], [RUT], domicilio [DOMICILIO]. Contacto para temas de privacidad: [CORREO DE CONTACTO].
          [DELEGADO DE PROTECCIÓN DE DATOS, si corresponde.]
        </p>
      </section>
      <section>
        <h2>2. Qué datos tratamos</h2>
        <ul>
          <li><strong>Cuenta y perfil:</strong> correo, contraseña si creas una (guardada con hash por el proveedor de autenticación, nunca en texto legible), el proveedor con el que ingresas (correo, Google o Microsoft), nombre visible opcional y tus preferencias (terminología, unidades, mano dominante).</li>
          <li><strong>Patrones:</strong> los diseños que creas (gráficos, texto, lanas, colores, gauge), su visibilidad (privado, por enlace o público), versiones y si fueron generados con IA.</li>
          <li><strong>Proyectos:</strong> tus proyectos, el avance guardado y las notas que escribes.</li>
          <li><strong>Lanas:</strong> las lanas que defines (grosor, composición, color) y el texto libre opcional (&ldquo;mi lana&rdquo;), que es privado.</li>
          <li><strong>Subidas:</strong> las imágenes que subes para la función Imagen a patrón, con su tipo y tamaño.</li>
          <li><strong>Trabajos de IA:</strong> el tipo de trabajo, su estado, el modelo usado, el consumo (tokens y costo) y los errores.</li>
          <li><strong>Denuncias:</strong> si denuncias un patrón, guardamos el motivo, el detalle libre que escribas y el título del patrón denunciado junto con una huella digital (hash) de su contenido, para detectar si cambió después de la denuncia. No guardamos una copia del contenido.</li>
          <li><strong>Moderación (si un patrón tuyo fue denunciado):</strong> conservamos su título, una huella digital (hash) del contenido y tu identificador interno para la moderación. [PENDIENTE DE REVISIÓN LEGAL]</li>
          <li><strong>Registros de seguridad:</strong> eventos de uso (por ejemplo, el número de acciones por día) que usamos para aplicar los límites diarios, y las confirmaciones de contraseña que pedimos antes de acciones sensibles (cambiar la contraseña o eliminar la cuenta). [PENDIENTE DE REVISIÓN LEGAL]</li>
          <li><strong>Datos técnicos:</strong> dirección IP y datos del navegador, que se tratan para la seguridad y la prevención de abuso (incluida la verificación CAPTCHA, cuando está activa) y para mantener tu sesión.</li>
        </ul>
        <p>No vendemos tus datos ni los usamos para publicidad de terceros.</p>
      </section>
      <section>
        <h2>3. Para qué los usamos y con qué base</h2>
        <ul>
          <li>Crear y mantener tu cuenta, guardar tus patrones y proyectos y sincronizar tu avance: ejecución del servicio que pides.</li>
          <li>Generar patrones a partir de imágenes con IA: ejecución del servicio, cuando tú lo solicitas.</li>
          <li>Seguridad, prevención de abuso y mejora del servicio: interés legítimo.</li>
          <li>Responder tus consultas y denuncias: interés legítimo y cumplimiento de obligaciones legales.</li>
        </ul>
        <p>[BASES DE LICITUD Y CONSENTIMIENTOS: por confirmar con asesoría legal según la Ley 21.719.]</p>
      </section>
      <section>
        <h2>4. Quién más participa (encargados)</h2>
        <ul>
          <li><strong>Supabase:</strong> base de datos, autenticación y almacenamiento de archivos. [REGIÓN DEL PROYECTO]</li>
          <li><strong>Anthropic:</strong> procesa la imagen y las instrucciones cuando usas funciones con IA, para proponer el patrón. [CONDICIONES DE CONSERVACIÓN Y USO DE DATOS: confirmar con el contrato vigente.]</li>
          <li><strong>Cloudflare Turnstile:</strong> verificación CAPTCHA al ingresar, registrarte, recuperar o cambiar tu contraseña y eliminar tu cuenta, cuando está activa.</li>
          <li><strong>Google y Microsoft (opcional):</strong> si eliges entrar con Google o con Microsoft, esos servicios nos entregan tu nombre y tu correo (y tu foto de perfil y tu identificador en ese servicio: no los usamos ni los mostramos, pero el servicio de autenticación los conserva mientras tengas la cuenta; puedes descargarlos con “Descargar mis datos”). Actúan bajo sus propias políticas de privacidad. Entrar con un proveedor es opcional: siempre puedes usar tu correo y una contraseña. [PENDIENTE DE REVISIÓN LEGAL]</li>
          <li><strong>Hosting de la aplicación:</strong> [PROVEEDOR].</li>
        </ul>
      </section>
      <section>
        <h2>5. Transferencia internacional</h2>
        <p>
          Estos proveedores pueden tratar datos fuera de Chile (por ejemplo, en Estados Unidos). Exigimos medidas de seguridad contractuales y técnicas.
          [MECANISMO DE TRANSFERENCIA Y PAÍSES: por confirmar con asesoría legal.]
        </p>
      </section>
      <section>
        <h2>6. Cuánto tiempo los conservamos</h2>
        <ul>
          <li>Mientras tu cuenta esté activa, conservamos tus datos. Al eliminar tu cuenta, borramos tus datos personales, patrones, proyectos, notas, lanas, subidas y trabajos de IA. [PLAZO DE BORRADO DE COPIAS DE SEGURIDAD: por definir.]</li>
          <li>Registros de auditoría de Supabase Auth (por ejemplo, correo e IP de los eventos de acceso): Supabase puede conservarlos después de que elimines tu cuenta. [PLAZO]</li>
          <li>Registros de seguridad (eventos de uso para los límites diarios): 30 días. Confirmaciones de contraseña para acciones sensibles: 1 día. [PENDIENTE DE REVISIÓN LEGAL]</li>
          <li>Denuncias: si un patrón tuyo fue denunciado, conservamos su título, una huella digital (hash) del contenido y tu identificador interno para la moderación. El identificador se elimina al cerrar la denuncia o a los 180 días, lo que ocurra primero; el título y la huella se conservan [PLAZO]. [PENDIENTE DE REVISIÓN LEGAL]</li>
          <li>Denuncias y su resolución: [PLAZO].</li>
        </ul>
        <p>
          Si eliminas tu cuenta, los patrones que habías hecho públicos o compartido por enlace dejan de estar disponibles, también en los proyectos de otras personas que los usaban.
        </p>
      </section>
      <section>
        <h2>7. Tus derechos</h2>
        <p>Tienes derecho de acceso, rectificación, supresión, oposición y portabilidad sobre tus datos:</p>
        <ul>
          <li><strong>Acceso y portabilidad:</strong> descarga una copia en JSON desde <Link href="/cuenta#tus-datos">Tu cuenta, sección Tus datos</Link> (<Link href="/cuenta#tus-datos">descargar mis datos</Link>). El archivo incluye tu perfil y cuenta, patrones con sus versiones, proyectos, avance, notas, lanas, metadatos de tus subidas, denuncias y trabajos de IA. Las imágenes que subiste todavía no se incluyen en la descarga; si las necesitas, escríbenos a [CORREO DE CONTACTO].</li>
          <li><strong>Rectificación:</strong> edita tu nombre y preferencias en <Link href="/cuenta">Tu cuenta</Link>; tus patrones y proyectos, directamente en la aplicación.</li>
          <li><strong>Supresión:</strong> elimina tu cuenta y tus datos desde <Link href="/cuenta#tus-datos">Tu cuenta, sección Tus datos</Link>.</li>
          <li><strong>Si tu cuenta está suspendida por moderación</strong> y no puedes ingresar, puedes ejercer estos derechos escribiendo a [CORREO DE CONTACTO].</li>
          <li><strong>Oposición:</strong> escríbenos a [CORREO DE CONTACTO] si te opones a un tratamiento basado en interés legítimo.</li>
        </ul>
        <p>
          Respondemos en los plazos que fije la ley ([PLAZO]). Si no quedas conforme, puedes reclamar ante la autoridad de protección de datos personales de Chile. [AUTORIDAD COMPETENTE: confirmar según la Ley 21.719.]
        </p>
      </section>
      <section>
        <h2>8. Marco legal y menores de edad</h2>
        <p>
          [PENDIENTE DE REVISIÓN LEGAL: la Ley 19.628 sigue vigente hasta que entre en vigencia la Ley 21.719, anunciada para el 1 de diciembre de 2026 y aún sin confirmar. Si hay usuarias en la Unión Europea, también aplicaría el RGPD.]
        </p>
        <p>[EDAD MÍNIMA Y TRATAMIENTO DE DATOS DE MENORES: por definir con asesoría legal.]</p>
      </section>
      <section>
        <h2>9. Cambios a esta política</h2>
        <p>Si la cambiamos de forma importante, te avisaremos. Consulta también los <Link href="/terminos">Términos de servicio</Link>.</p>
      </section>
    </LegalPage>
  );
}
