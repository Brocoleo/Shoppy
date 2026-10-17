import type { Metadata } from "next";
import { LegalArticle, LegalSection } from "../../../components/LegalArticle";

export const metadata: Metadata = {
  title: "Términos y condiciones",
  description:
    "Condiciones de compraventa de vinta.zhe: productos de segunda mano, precios, envíos y derecho a retracto.",
};

export default function TerminosPage() {
  return (
    <LegalArticle title="Términos y condiciones" updated="octubre de 2026">
      <LegalSection title="Quiénes somos">
        <p>
          La tienda es operada por <strong>[Razón social]</strong>, RUT{" "}
          <strong>[RUT]</strong>, contacto{" "}
          <a href="mailto:[correo de contacto]">[correo de contacto]</a>. Al
          comprar en vinta.zhe aceptas estas condiciones.
        </p>
      </LegalSection>

      <LegalSection title="Naturaleza de los productos">
        <p>
          Vendemos <strong>ropa de segunda mano</strong>. Cada prenda es única;
          su talla, color y estado se describen en la ficha del producto y las
          fotografías muestran el estado real, incluidos posibles detalles o
          defectos señalados. Las prendas del <em>archivo</em> provienen de
          Instagram, son de referencia y{" "}
          <strong>no están disponibles para compra</strong>.
        </p>
      </LegalSection>

      <LegalSection title="Precios y disponibilidad">
        <p>
          Los precios se expresan en pesos chilenos (CLP) e incluyen impuestos
          cuando corresponda. La compra se confirma solo si hay stock; si una
          prenda se agota durante el proceso, te contactaremos para ofrecerte una
          alternativa o el reembolso.
        </p>
      </LegalSection>

      <LegalSection title="Pagos">
        <p>
          Durante el <strong>piloto</strong>, los pagos operan en{" "}
          <strong>modo de prueba</strong>: no se realizan cobros reales y no
          debes ingresar datos de tarjeta válidos. Antes de habilitar pagos
          reales actualizaremos estos términos e informaremos los medios
          disponibles (por ejemplo, Webpay).
        </p>
      </LegalSection>

      <LegalSection title="Envíos">
        <p>
          Despachamos con el courier <strong>Starken</strong> y ofrecemos retiro
          cuando se indique. Los plazos y costos se muestran al finalizar la
          compra. Revisa el detalle en nuestra{" "}
          <a href="/envios" className="underline underline-offset-4">
            política de envíos
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="Derecho a retracto y garantía legal">
        <p>
          Como consumidor tienes <strong>derecho a retracto dentro de 10 días</strong>{" "}
          contados desde la recepción (Ley 19.496), y cuentas con la garantía
          legal por productos defectuosos. Las condiciones para ejercerlos están
          en{" "}
          <a href="/devoluciones" className="underline underline-offset-4">
            devoluciones
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="Uso del sitio y contenido">
        <p>
          Las fotografías y textos del sitio pertenecen a vinta.zhe o se usan
          con autorización de su titular. No está permitido reutilizarlos sin
          consentimiento. El uso indebido del sitio puede dar lugar a
          responsabilidad.
        </p>
      </LegalSection>

      <LegalSection title="Ley aplicable">
        <p>
          Estas condiciones se rigen por la ley chilena. Cualquier controversia
          se someterá a los tribunales competentes de Chile, sin perjuicio de
          los derechos que la ley reconoce al consumidor.
        </p>
      </LegalSection>
    </LegalArticle>
  );
}
