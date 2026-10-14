"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { confirmOrder } from "../../lib/checkout";
import { useSession } from "../../lib/session";
import { useCart } from "../../lib/cart";
import { clearPendingCheckout, loadPendingCheckout } from "../../lib/pendingCheckout";
import { LoadingState } from "../../components/States";

/**
 * Retorno del proveedor (MP/Webpay vía bridge).
 * El retorno NO confirma: verifica con `confirm` idempotente.
 */
export default function CheckoutReturnPage() {
  return (
    <Suspense fallback={<LoadingState message="Verificando tu pago…" />}>
      <CheckoutReturnInner />
    </Suspense>
  );
}

function CheckoutReturnInner() {
  const params = useSearchParams();
  const router = useRouter();
  const { user, loading } = useSession();
  const { clear } = useCart();
  const [message, setMessage] = useState("Verificando tu pago con el proveedor…");
  const done = useRef(false);

  useEffect(() => {
    if (loading || done.current) return;
    done.current = true;
    const state = params.get("state");
    const owner = user?.id ?? "guest";
    (async () => {
      const saved = await loadPendingCheckout(owner);
      const orderId = saved?.created?.order_id;
      const guestToken = saved?.created?.guest_token ?? null;
      if (!state || !orderId) {
        setMessage("Retorno no reconocido. Abre el checkout y verifica tu pedido pendiente.");
        return;
      }
      try {
        const res = await confirmOrder(orderId, guestToken, owner);
        if (res.status !== "PAID") throw new Error("Pago no confirmado todavía.");
        clear();
        await clearPendingCheckout(owner);
        router.replace(
          !user && res.guest_token
            ? `/pedido/${res.order_id}?token=${encodeURIComponent(res.guest_token)}`
            : "/pedidos",
        );
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "El pago aún no está confirmado.");
      }
    })();
  }, [loading, params, router, user, clear]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
      <p className="text-lg font-bold">Retorno del pago</p>
      <p className="text-sm text-zinc-500">{message}</p>
      <Link href="/checkout" className="rounded bg-zinc-900 px-4 py-2 text-sm text-white">
        Volver al checkout
      </Link>
    </div>
  );
}
