import type { Metadata } from "next";
import { LegalArticle, LegalSection } from "../../../components/LegalArticle";

export const metadata: Metadata = {
  title: "Términos y condiciones",
  description:
    "Borrador de condiciones de vinta.zhe. Archivo de referencia y preparación del catálogo comercial.",
  alternates: { canonical: "/legal/terminos" },
};

export default function TerminosPage() {
  return (
    <LegalArticle title="Términos y condiciones" updated="octubre de 2026">
      <LegalSection title="Identificación pendiente">
        <p>
          Antes de habilitar ventas deben completarse la razón social{" "}
          <strong>[pendiente]</strong>, el RUT <strong>[pendiente]</strong> y el
          correo de contacto <strong>[pendiente]</strong> del responsable de
          vinta.zhe.
        </p>
      </LegalSection>

      <LegalSection title="Fotografías y catálogo">
        <p>
          Las fotografías y los datos de cada producto comercial deben
          verificarse antes de su publicación. Los ejemplos de administración
          sirven como referencia para preparar nuevas fichas; no confirman
          existencias, estado ni disponibilidad de prendas reales.
        </p>
        <p>
          Las entradas del <em>archivo de Instagram</em> son de referencia y{" "}
          <strong>no están disponibles para compra</strong>. No representan
          inventario comercial.
        </p>
      </LegalSection>

      <LegalSection title="Precios y disponibilidad">
        <p>
          El precio y las existencias de cada prenda deberán ser confirmados por
          la tienda antes de habilitar su venta. No debe interpretarse un dato
          de prueba como una oferta comercial.
        </p>
      </LegalSection>

      <LegalSection title="Pagos y envíos">
        <p>
          Los pagos y envíos reales no están habilitados en esta etapa. No
          ingreses datos reales de tarjeta ni realices transferencias. Los
          medios de pago, costos, destinos y plazos de entrega quedan pendientes
          de confirmación antes de abrir las ventas.
        </p>
        <p>
          Consulta el estado de la información en{" "}
          <a href="/envios" className="underline underline-offset-4">
            envíos
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="Devoluciones y condiciones legales">
        <p>
          Las condiciones de devolución y las obligaciones legales aplicables
          deben revisarse antes de habilitar compras. El texto disponible en{" "}
          <a href="/devoluciones" className="underline underline-offset-4">
            devoluciones
          </a>{" "}
          también es un borrador; esta página no certifica cumplimiento legal.
        </p>
      </LegalSection>

      <LegalSection title="Uso del contenido">
        <p>
          El archivo enlaza a sus publicaciones de origen. La inclusión de una
          fotografía en el sitio no concede autorización para reutilizarla.
        </p>
      </LegalSection>
    </LegalArticle>
  );
}
