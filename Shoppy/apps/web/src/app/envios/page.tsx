import type { Metadata } from "next";
import { LegalArticle, LegalSection } from "../../components/LegalArticle";

export const metadata: Metadata = {
  title: "Envíos",
  description:
    "Borrador de información de envíos de vinta.zhe, pendiente de habilitación.",
  alternates: { canonical: "/envios" },
};

export default function EnviosPage() {
  return (
    <LegalArticle title="Envíos" updated="octubre de 2026">
      <LegalSection title="Servicio pendiente de habilitación">
        <p>Esta etapa prepara el catálogo y la administración. No habilita ventas ni despachos.</p>
        <p>Antes de vender se confirmarán cobertura, transportista, costos, plazos, opciones de retiro y canal de contacto. Todavía no hay condiciones operativas verificadas para comunicar.</p>
      </LegalSection>
    </LegalArticle>
  );
}
