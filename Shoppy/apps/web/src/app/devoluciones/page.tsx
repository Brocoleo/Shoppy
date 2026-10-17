import type { Metadata } from "next";
import { LegalArticle, LegalSection } from "../../components/LegalArticle";

export const metadata: Metadata = {
  title: "Devoluciones y retracto",
  description:
    "Derecho a retracto de 10 días (Ley 19.496) y garantía legal en vinta.zhe.",
};

export default function DevolucionesPage() {
  return (
    <LegalArticle title="Devoluciones y retracto" updated="octubre de 2026">
      <LegalSection title="Derecho a retracto (10 días)">
        <p>
          Como consumidor puedes ejercer el <strong>derecho a retracto dentro de
          10 días</strong> contados desde la recepción del producto, sin
          necesidad de justificar tu decisión (Ley 19.496). Escríbenos a{" "}
          <a href="mailto:[correo de contacto]">[correo de contacto]</a> con tu
          número de pedido.
        </p>
      </LegalSection>

      <LegalSection title="Condiciones">
        <p>
          La prenda debe devolverse en el mismo estado en que se recibió. Los
          costos de envío del retracto se rigen por la ley. Si el producto
          presenta defectos no informados, cubrimos el retorno.
        </p>
      </LegalSection>

      <LegalSection title="Garantía legal">
        <p>
          Si un producto presenta una falla o no corresponde a lo descrito,
          contamos con la garantía legal para repararlo, cambiarlo o
          reembolsarlo, según corresponda.
        </p>
      </LegalSection>

      <LegalSection title="Reembolsos">
        <p>
          Aprobada la devolución, el reembolso se realiza por el mismo medio de
          pago, dentro de los plazos que permita el proveedor.
        </p>
      </LegalSection>
    </LegalArticle>
  );
}
