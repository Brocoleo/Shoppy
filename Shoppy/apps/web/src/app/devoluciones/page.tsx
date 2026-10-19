import type { Metadata } from "next";
import { LegalArticle, LegalSection } from "../../components/LegalArticle";

export const metadata: Metadata = {
  title: "Devoluciones y retracto",
  description:
    "Política de devoluciones, retracto y garantía legal de vinta.zhe (borrador para revisión).",
  alternates: { canonical: "/devoluciones" },
};

export default function DevolucionesPage() {
  return (
    <LegalArticle title="Devoluciones y retracto" updated="octubre de 2026">
      <LegalSection title="Derecho a retracto (10 días)">
        <p>
          En compras hechas a distancia tienes derecho a retractarte dentro de{" "}
          <strong>10 días corridos</strong> desde que recibes la prenda, sin
          necesidad de explicar el motivo (Ley 19.496 sobre Protección de los
          Derechos de los Consumidores).
        </p>
        <p>
          Para ejercerlo, entra a tu pedido en el sitio y usa la opción{" "}
          <strong>&laquo;Solicitar devolución&raquo;</strong>, indicando el
          motivo. También puedes escribirnos a{" "}
          <strong>leomir2656@icloud.com</strong>.
        </p>
      </LegalSection>

      <LegalSection title="Cómo devolver la prenda">
        <p>
          Una vez aprobada la solicitud, te indicaremos dónde y cómo enviar la
          prenda. Debe volver sin uso, con sus etiquetas y en las mismas
          condiciones en que la recibiste. Los costos de la devolución por
          retracto son de cargo de la tienda cuando la prenda llega en las
          condiciones descritas.
        </p>
      </LegalSection>

      <LegalSection title="Reembolso">
        <p>
          Aprobada y recibida la devolución, reembolsamos el monto pagado por la
          prenda con el mismo medio de pago que usaste (por ejemplo,
          MercadoPago). El reembolso se acredita en un plazo de
          <strong>10 días hábiles</strong> desde la recepción de la prenda en
          nuestras manos.
        </p>
      </LegalSection>

      <LegalSection title="Garantía legal (productos defectuosos)">
        <p>
          Si la prenda presenta una falla o no corresponde a lo descrito en la
          publicación, tienes derecho a exigir, a tu elección, la reparación, la
          reposición o la devolución de lo pagado, según los plazos y
          condiciones que fija la ley. Escríbenos a{" "}
          <strong>leomir2656@icloud.com</strong> con el detalle y una fotografía.
        </p>
      </LegalSection>

      <LegalSection title="Exclusiones">
        <p>
          No procede el retracto respecto de prendas personalizadas o hechas a
          medida, ni cuando la prenda haya sido usada o dañada por el
          consumidor. Estas exclusiones no afectan los derechos que la ley
          reconoce frente a productos defectuosos.
        </p>
      </LegalSection>

      <LegalSection title="Contacto">
        <p>
          Responsable: <strong>vinta.zhe</strong> · RUT{" "}
          <strong>[pendiente]</strong> · Correo{" "}
          <strong>leomir2656@icloud.com</strong>.
        </p>
        <p>
          Este texto es un borrador del piloto y debe revisarse antes de
          publicarse como política definitiva.
        </p>
      </LegalSection>
    </LegalArticle>
  );
}
