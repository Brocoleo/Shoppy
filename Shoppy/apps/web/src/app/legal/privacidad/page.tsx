import type { Metadata } from "next";
import { LegalArticle, LegalSection } from "../../../components/LegalArticle";

export const metadata: Metadata = {
  title: "Política de privacidad",
  description:
    "Borrador de privacidad de vinta.zhe: información de funcionamiento y datos pendientes de confirmar antes de habilitar ventas.",
  alternates: { canonical: "/legal/privacidad" },
};

export default function PrivacidadPage() {
  return (
    <LegalArticle title="Política de privacidad" updated="octubre de 2026">
      <LegalSection title="Responsable pendiente de identificar">
        <p>
          Razón social <strong>[pendiente]</strong>, RUT{" "}
          <strong>[pendiente]</strong>, domicilio <strong>[pendiente]</strong> y
          correo de contacto <strong>[pendiente]</strong>. Estos datos deben
          completarse y verificarse antes de considerar definitiva esta política.
        </p>
      </LegalSection>

      <LegalSection title="Funcionamiento actual">
        <p>
          Las funciones de cuenta utilizan correo electrónico y datos de sesión.
          El carrito y la sesión requieren almacenamiento local en el
          navegador. La aplicación utiliza Supabase para autenticación, base de
          datos y archivos.
        </p>
        <p>
          Los pagos y envíos reales no están habilitados en esta etapa. Los
          formularios de prueba no deben utilizarse para enviar datos reales de
          tarjeta ni para solicitar un despacho.
        </p>
      </LegalSection>

      <LegalSection title="Información pendiente antes de vender">
        <p>
          Deben confirmarse y documentarse los datos necesarios para pedidos y
          entregas, sus finalidades y bases de tratamiento, los proveedores que
          intervengan y las condiciones de cualquier transferencia de datos. No
          se confirma aquí un proveedor de pagos ni un courier operativo.
        </p>
      </LegalSection>

      <LegalSection title="Conservación y solicitudes">
        <p>
          Los plazos de conservación, el procedimiento de eliminación y el canal
          de atención para solicitudes sobre datos personales están pendientes
          de definición y revisión. El correo de contacto aún no está
          disponible.
        </p>
        <p>
          Este borrador no acredita que existan procedimientos operativos ni
          certifica cumplimiento de las obligaciones legales aplicables.
        </p>
      </LegalSection>
    </LegalArticle>
  );
}
