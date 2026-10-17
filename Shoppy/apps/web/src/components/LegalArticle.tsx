import Link from "next/link";

/** Envoltorio editorial para las páginas legales. Server component. */
export function LegalArticle({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <article className="mx-auto max-w-2xl py-4 sm:py-8">
      <header className="border-b border-line pb-6">
        <h1 className="font-display text-4xl tracking-tight text-carbon sm:text-5xl">
          {title}
        </h1>
        <p className="mt-3 text-xs uppercase tracking-[0.12em] text-muted">
          Última actualización: {updated}
        </p>
      </header>

      <p className="mt-6 border-l-2 border-taupe pl-4 text-sm text-muted">
        Borrador para el piloto. Los datos entre corchetes
        (<code className="text-carbon">[ ]</code>) deben completarse y el texto
        ser revisado antes de considerarse definitivo. Este documento no
        constituye asesoría legal.
      </p>

      <div className="mt-8 flex flex-col gap-8 text-sm leading-relaxed text-carbon">
        {children}
      </div>

      <nav
        aria-label="Páginas legales"
        className="mt-12 flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-6 text-sm text-muted"
      >
        <Link href="/legal/privacidad" className="underline underline-offset-4">
          Privacidad
        </Link>
        <Link href="/legal/terminos" className="underline underline-offset-4">
          Términos
        </Link>
        <Link href="/legal/cookies" className="underline underline-offset-4">
          Cookies
        </Link>
        <Link href="/envios" className="underline underline-offset-4">
          Envíos
        </Link>
        <Link href="/devoluciones" className="underline underline-offset-4">
          Devoluciones
        </Link>
      </nav>
    </article>
  );
}

export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-xl text-carbon sm:text-2xl">{title}</h2>
      {children}
    </section>
  );
}
