import type { Metadata } from "next";
import { LegalArticle, LegalSection } from "../../../components/LegalArticle";

export const metadata: Metadata = {
  title: "Política de cookies",
  description:
    "Qué almacenamiento usa vinta.zhe, para qué y cómo consultar el aviso informativo.",
  alternates: { canonical: "/legal/cookies" },
};

export default function CookiesPage() {
  return (
    <LegalArticle title="Política de cookies" updated="octubre de 2026">
      <LegalSection title="Qué usamos">
        <p>
          vinta.zhe usa <strong>almacenamiento local del navegador</strong>{" "}
          (localStorage) con fines necesarios para el funcionamiento del sitio.
          A la fecha <strong>no usamos cookies publicitarias ni de terceros</strong>{" "}
          y no incorporamos herramientas de analítica.
        </p>
      </LegalSection>

      <LegalSection title="Almacenamiento necesario">
        <ul className="flex list-disc flex-col gap-1 pl-5">
          <li>
            <strong>Sesión:</strong> mantiene tu sesión iniciada mediante el
            servicio de autenticación (Supabase).
          </li>
          <li>
            <strong>Carrito:</strong> conserva las prendas que agregas antes de
            comprar.
          </li>
          <li>
            <strong>Aviso leído:</strong> recuerda que ya leíste la información
            sobre este aviso.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Aviso informativo">
        <p>El botón «Entendido» cierra el aviso sobre el almacenamiento necesario. No activa herramientas opcionales. Puedes volver a consultarlo desde «Información de almacenamiento» en el pie de página.</p>
      </LegalSection>

      <LegalSection title="Si añadimos analítica">
        <p>
          Si en el futuro incorporamos medición de uso o cookies de terceros,
          actualizaremos este aviso y solicitaremos tu consentimiento antes de
          activarlas.
        </p>
      </LegalSection>
    </LegalArticle>
  );
}
