import type { Metadata } from "next";
import { LegalArticle, LegalSection } from "../../components/LegalArticle";

export const metadata: Metadata = {
  title: "Envíos",
  description:
    "Despachos en Chile con Starken, plazos estimados, retiro y seguimiento.",
};

export default function EnviosPage() {
  return (
    <LegalArticle title="Envíos" updated="octubre de 2026">
      <LegalSection title="Cómo despachamos">
        <p>
          Despachamos a todo Chile mediante el courier <strong>Starken</strong>.
          También ofrecemos <strong>retiro</strong> cuando se indique al
          finalizar la compra. Nuestras bases están en Santiago y Rancagua.
        </p>
      </LegalSection>

      <LegalSection title="Plazos y costos">
        <p>
          Los plazos y costos se calculan y muestran al momento de pagar, según
          tu comuna. Los tiempos de entrega son estimados del courier y pueden
          variar por factores ajenos a nosotros.
        </p>
      </LegalSection>

      <LegalSection title="Seguimiento">
        <p>
          Cuando tu pedido se despacha recibirás el número de seguimiento para
          revisarlo con Starken. Si tienes dudas, escríbenos a{" "}
          <a href="mailto:[correo de contacto]">[correo de contacto]</a>.
        </p>
      </LegalSection>
    </LegalArticle>
  );
}
