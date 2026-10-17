import type { Metadata } from "next";
import { LegalArticle, LegalSection } from "../../../components/LegalArticle";

export const metadata: Metadata = {
  title: "Política de privacidad",
  description:
    "Cómo vinta.zhe trata tus datos personales: qué guardamos, para qué y cómo ejercer tus derechos.",
};

export default function PrivacidadPage() {
  return (
    <LegalArticle title="Política de privacidad" updated="octubre de 2026">
      <LegalSection title="Responsable del tratamiento">
        <p>
          El responsable es <strong>[Razón social]</strong>, RUT{" "}
          <strong>[RUT]</strong>, con domicilio en <strong>[Domicilio]</strong>{" "}
          y correo de contacto{" "}
          <a href="mailto:[correo de contacto]">[correo de contacto]</a>. vinta.zhe
          es la tienda en línea de prendas de segunda mano operada por dicho
          responsable.
        </p>
      </LegalSection>

      <LegalSection title="Qué datos tratamos">
        <ul className="flex list-disc flex-col gap-1 pl-5">
          <li>
            <strong>Identificación y contacto:</strong> nombre, correo
            electrónico y teléfono, cuando creas una cuenta o haces un pedido.
          </li>
          <li>
            <strong>Entrega:</strong> dirección y datos necesarios para el
            despacho por el courier (Starken).
          </li>
          <li>
            <strong>Pedidos:</strong> productos, montos y estado de la compra.
          </li>
          <li>
            <strong>Técnicos:</strong> datos mínimos de funcionamiento del sitio
            y registros de seguridad.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Para qué y con qué base">
        <p>
          Usamos tus datos para gestionar tu cuenta y tus pedidos, coordinar
          envíos, entregar soporte y prevenir fraudes. La base es la ejecución
          del contrato de compraventa, tu consentimiento cuando lo otorgas y
          nuestros intereses legítimos de seguridad. No vendemos ni arrendamos
          tus datos.
        </p>
      </LegalSection>

      <LegalSection title="Encargados y transferencias">
        <p>
          Nos apoyamos en proveedores que tratan datos por cuenta nuestra:{" "}
          <strong>Supabase</strong> (alojamiento de base de datos y archivos),{" "}
          <strong>Transbank/Webpay</strong> (pagos, actualmente en modo de
          prueba) y el <strong>courier</strong> para la entrega. Algunos pueden
          almacenar datos fuera de Chile; en tal caso exigimos garantías
          contractuales de protección.
        </p>
      </LegalSection>

      <LegalSection title="Conservación">
        <p>
          Conservamos tus datos mientras exista la relación y, luego, durante los
          plazos legales aplicables. Después se eliminan o anonimizan.
        </p>
      </LegalSection>

      <LegalSection title="Tus derechos">
        <p>
          Puedes solicitar acceso, rectificación, supresión, oposición y
          portabilidad de tus datos, conforme a la Ley 19.628 y la Ley 21.719,
          escribiendo a <a href="mailto:[correo de contacto]">[correo de contacto]</a>.
          Responderemos dentro de los plazos legales. También puedes reclamar
          ante la autoridad de protección de datos.
        </p>
      </LegalSection>
    </LegalArticle>
  );
}
