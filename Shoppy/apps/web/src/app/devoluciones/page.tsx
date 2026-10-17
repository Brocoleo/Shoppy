import type { Metadata } from "next";
import { LegalArticle, LegalSection } from "../../components/LegalArticle";

export const metadata: Metadata = {
  title: "Devoluciones y retracto",
  description:
    "Borrador de devoluciones de vinta.zhe, pendiente de revisión antes de vender.",
  alternates: { canonical: "/devoluciones" },
};

export default function DevolucionesPage() {
  return (
    <LegalArticle title="Devoluciones y retracto" updated="octubre de 2026">
      <LegalSection title="Política pendiente de revisión">
        <p>Las ventas y los pagos no se habilitan en esta entrega. Antes de vender se completarán el canal de contacto y el procedimiento para solicitudes, devoluciones y reembolsos.</p>
        <p>Las condiciones y los derechos aplicables deben revisarse antes de publicar una política definitiva. Este borrador no restringe los derechos que correspondan.</p>
      </LegalSection>
    </LegalArticle>
  );
}
