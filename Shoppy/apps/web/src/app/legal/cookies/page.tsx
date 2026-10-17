import type { Metadata } from "next";
import { LegalArticle, LegalSection } from "../../../components/LegalArticle";

export const metadata: Metadata = {
  title: "Política de cookies",
  description:
    "Qué almacenamiento usa vinta.zhe, para qué y cómo cambiar tu consentimiento.",
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
            <strong>Preferencia de consentimiento:</strong> recuerda tu elección
            sobre este aviso.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Tu elección">
        <p>
          Puedes aceptar o limitarte a lo necesario desde el aviso que aparece
          al entrar. Para cambiar tu decisión en cualquier momento, abre{" "}
          <strong>Preferencias de cookies</strong> en el pie de página y elige
          de nuevo.
        </p>
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
