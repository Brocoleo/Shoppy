"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatCLP } from "../../lib/format";
import { addressSchema, type AddressInput } from "@shopy/validation";
import {
  CheckoutApiError,
  closeCheckoutAttempt,
  confirmOrder,
  createOrder,
  listPaymentProviders,
  listShippingRates,
  quoteCheckout,
  recoverCheckout,
} from "../../lib/checkout";
import { getSupabase, isSupabaseConfigured } from "../../lib/supabase";
import { useSession } from "../../lib/session";
import { useCart } from "../../lib/cart";
import {
  clearPendingCheckout,
  loadPendingCheckout,
  newPendingCheckout,
  savePendingCheckout,
  type PendingCheckout,
} from "../../lib/pendingCheckout";
import { ErrorState } from "../../components/States";

type FieldName = keyof AddressInput;

const FIELDS: { name: FieldName; label: string; placeholder: string; type?: string }[] = [
  { name: "fullName", label: "Nombre completo", placeholder: "María González" },
  { name: "email", label: "Email", placeholder: "maria@email.cl", type: "email" },
  { name: "phone", label: "Teléfono", placeholder: "+56912345678", type: "tel" },
  { name: "street", label: "Calle y número", placeholder: "Av. Providencia 1234, dpto 56" },
  { name: "comuna", label: "Comuna", placeholder: "Providencia" },
  { name: "region", label: "Región", placeholder: "Metropolitana" },
];

const PROVIDER_LABEL: Record<string, string> = {
  mock: "Simulación local",
  mercadopago: "Mercado Pago",
  transbank: "Webpay",
};

export default function CheckoutPage() {
  const { user, loading } = useSession();
  if (loading) return <p className="py-10 text-center text-sm text-zinc-500">Cargando sesión…</p>;
  const owner = user?.id ?? "guest";
  return <CheckoutFlow key={owner} owner={owner} authed={Boolean(user)} />;
}

function CheckoutFlow({ owner, authed }: { owner: string; authed: boolean }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { lines, clear } = useCart();
  const [step, setStep] = useState(0);
  const [address, setAddress] = useState<AddressInput | null>(null);
  const [rateId, setRateId] = useState<string | null>(null);
  const [discountCode, setDiscountCode] = useState("");
  const [appliedCode, setAppliedCode] = useState<string | undefined>(undefined);
  const [result, setResult] = useState<{ order_id: string; order_number: string; guest_token: string | null } | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const [pendingRedirect, setPendingRedirect] = useState<{ order_id: string; checkout_url: string; guest_token: string | null } | null>(null);
  const busy = useRef(false);
  const active = useRef(true);
  const [pending, setPending] = useState<PendingCheckout | null>(null);
  const [restoreRetry, setRestoreRetry] = useState(0);
  const [restoreError, setRestoreError] = useState(false);
  const [restored, setRestored] = useState(false);
  const [provider, setProvider] = useState<"mock" | "mercadopago" | "transbank" | null>(null);
  const providers = useQuery({
    queryKey: ["payment-providers"],
    queryFn: () =>
      listPaymentProviders().catch(() => ({ providers: ["mock" as const], sandbox: true })),
    enabled: isSupabaseConfigured,
  });

  useEffect(() => {
    active.current = true;
    setRestoreError(false);
    loadPendingCheckout(owner)
      .then((saved) => {
        if (!active.current) return;
        setPending(saved);
        if (saved) {
          setStep(2);
          if (saved.created?.payment.checkout_url) {
            setPendingRedirect({ ...saved.created, checkout_url: saved.created.payment.checkout_url });
          }
        }
        setRestored(true);
      })
      .catch(() => {
        if (active.current) setRestoreError(true);
      });
    return () => {
      active.current = false;
    };
  }, [owner, restoreRetry]);

  const { control, handleSubmit, reset, formState: { errors } } = useForm<AddressInput>({ resolver: zodResolver(addressSchema) });

  // Prefill con última dirección guardada (autenticados).
  useQuery({
    queryKey: ["my-address", owner],
    queryFn: async () => {
      const { data } = await getSupabase()
        .from("addresses")
        .select("full_name,email,phone,street,comuna,region,zip_code,notes")
        .eq("user_id", owner)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const row = data as unknown as Record<string, string | null> | null;
      if (row) {
        reset({
          fullName: row["full_name"] ?? "",
          email: row["email"] ?? "",
          phone: row["phone"] ?? "",
          street: row["street"] ?? "",
          comuna: row["comuna"] ?? "",
          region: row["region"] ?? "",
          zipCode: row["zip_code"] ?? undefined,
          notes: row["notes"] ?? undefined,
        });
      }
      return row;
    },
    enabled: isSupabaseConfigured && authed,
    staleTime: 60_000,
  });

  const items = lines.map((l) => ({ product_id: l.productId, qty: l.qty }));

  const rates = useQuery({
    queryKey: ["rates", address?.region ?? ""],
    queryFn: () => listShippingRates(address?.region ?? ""),
    enabled: step >= 1 && Boolean(address?.region),
  });

  const quoteSig = JSON.stringify({ items, rateId, appliedCode, region: address?.region });
  const quote = useQuery({
    queryKey: ["quote", quoteSig],
    queryFn: () =>
      quoteCheckout({
        items,
        shipping_rate_id: rateId ?? "",
        discount_code: appliedCode,
        region: address?.region ?? "",
      }),
    enabled: step >= 1 && Boolean(rateId && address?.region && items.length > 0),
  });

  const complete = async (res: Awaited<ReturnType<typeof confirmOrder>>, attempt = pending) => {
    if (res.status !== "PAID") throw new Error("Pago no confirmado");
    if (!active.current) return;
    // Guardar el carrito vacío antes de olvidar el intento evita repetir compras tras recargar.
    void attempt;
    clear();
    await clearPendingCheckout(owner);
    if (!active.current) return;
    setResult({ order_id: res.order_id, order_number: res.order_number, guest_token: res.guest_token });
    setPending(null);
    setPendingRedirect(null);
    queryClient.invalidateQueries({ queryKey: ["my-orders"] });
    setStep(3);
  };

  const pay = useMutation({
    mutationFn: async () => {
      if (busy.current) return;
      busy.current = true;
      try {
        let attempt = pending;
        if (!attempt) {
          if (!address || !rateId || !provider || !quote.data || quote.isError || quote.isFetching) {
            throw new Error("Revisa los datos y la cotización.");
          }
          attempt = await newPendingCheckout(owner, {
            items,
            address,
            shipping_rate_id: rateId,
            discount_code: appliedCode,
            save_address: authed,
            provider,
          });
          if (!active.current) return;
          setPending(attempt);
        }
        let created = attempt.created;
        if (!created) {
          try {
            created = await recoverCheckout(attempt.key, attempt.secret, owner);
          } catch (error) {
            if (!(error instanceof CheckoutApiError) || error.code !== "ATTEMPT_NOT_FOUND" || !attempt.input) throw error;
            if (!active.current) return;
            created = await createOrder({
              ...attempt.input,
              expected_user_id: owner === "guest" ? null : owner,
              idempotency_key: attempt.key,
              attempt_secret: attempt.secret,
            });
          }
          attempt = { ...attempt, created };
          await savePendingCheckout(owner, attempt);
        }
        if (!active.current) return;
        setPending(attempt);
        if (created.payment.checkout_url) {
          // Proveedor con redirect externo (MP/Webpay): salir y volver por el bridge.
          // NO confirmar aquí: la confirmación ocurre al retornar o con "Ya pagué".
          setPendingRedirect({ ...created, checkout_url: created.payment.checkout_url });
          window.location.href = created.payment.checkout_url;
        } else {
          await complete(await confirmOrder(created.order_id, created.guest_token, owner), attempt);
        }
      } finally {
        busy.current = false;
      }
    },
    onError: (error) => {
      if (!active.current) return;
      setPayError(error instanceof Error ? error.message : "No se pudo completar el pago.");
      if (error instanceof CheckoutApiError && error.code === "ATTEMPT_FAILED") {
        void clearPendingCheckout(owner).then(() => {
          if (active.current) {
            setPending(null);
            setStep(1);
          }
        });
      }
    },
  });

  const [verifying, setVerifying] = useState(false);
  const checkPayment = async (order_id: string, guest_token?: string | null) => {
    if (busy.current) return;
    busy.current = true;
    setVerifying(true);
    setPayError(null);
    try {
      await complete(await confirmOrder(order_id, guest_token, owner));
    } catch (e) {
      if (active.current) setPayError(e instanceof Error ? e.message : "El pago aún no está confirmado.");
    } finally {
      busy.current = false;
      if (active.current) setVerifying(false);
    }
  };

  const closePending = async () => {
    if (!pending || busy.current) return;
    busy.current = true;
    setVerifying(true);
    try {
      await closeCheckoutAttempt(pending.key, pending.secret, owner);
      await clearPendingCheckout(owner);
      if (!active.current) return;
      setPending(null);
      setPendingRedirect(null);
      setPayError(null);
      setStep(0);
    } catch (error) {
      if (active.current) setPayError(error instanceof Error ? error.message : "No se pudo cerrar el intento.");
    } finally {
      busy.current = false;
      if (active.current) setVerifying(false);
    }
  };

  if (restoreError) {
    return (
      <ErrorState
        message="No se pudo recuperar el pedido guardado. Reintenta antes de comprar."
        onRetry={() => setRestoreRetry((n) => n + 1)}
      />
    );
  }
  if (!isSupabaseConfigured) {
    return <ErrorState message="Falta la configuración del backend para comprar." />;
  }
  if (lines.length === 0 && !result && !pending) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
        <p className="text-lg font-bold">Nada que pagar</p>
        <p className="text-sm text-zinc-500">Tu carrito está vacío.</p>
        <Link href="/catalogo" className="rounded bg-zinc-900 px-4 py-2 text-sm text-white">
          Explorar catálogo
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Checkout</h1>
        <p className="text-sm text-zinc-500">
          {step === 3 ? "¡Listo!" : `Paso ${step + 1} de 3: ${["Dirección", "Despacho", "Revisar y pagar"][step]}`}
        </p>
        <p className="mt-1 text-xs text-zinc-500">Beta de prueba · no uses tarjetas reales.</p>
        {!restored ? <p className="text-xs text-zinc-500">Recuperando pedido pendiente…</p> : null}
      </div>

      {step === 0 ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={handleSubmit((values) => {
            setAddress(values);
            setRateId(null);
            setStep(1);
          })}
        >
          {FIELDS.map((f) => (
            <label key={f.name} className="flex flex-col gap-1 text-sm">
              <span className="text-zinc-500">{f.label}</span>
              <Controller
                control={control}
                name={f.name}
                render={({ field: { onChange, onBlur, value } }) => (
                  <input
                    aria-label={f.label}
                    type={f.type ?? "text"}
                    onBlur={onBlur}
                    onChange={onChange}
                    value={(value as string) ?? ""}
                    placeholder={f.placeholder}
                    className="h-11 rounded border border-zinc-300 bg-white px-3"
                  />
                )}
              />
              {errors[f.name] ? <span className="text-xs text-red-700">{String(errors[f.name]?.message ?? "")}</span> : null}
            </label>
          ))}
          <button type="submit" className="mt-2 h-11 rounded bg-zinc-900 text-sm font-semibold text-white">
            Continuar al despacho
          </button>
        </form>
      ) : null}

      {step === 1 ? (
        <div className="flex flex-col gap-3">
          <p className="font-medium">Despacho a {address?.comuna}, {address?.region}</p>
          {rates.isPending ? <p className="text-sm text-zinc-500">Cargando tarifas…</p> : null}
          {rates.isError ? <p className="text-sm text-red-700">No pudimos cargar las tarifas. Revisa tu conexión.</p> : null}
          {!rates.isPending && !rates.isError && (rates.data ?? []).length === 0 ? (
            <p className="text-sm text-red-700">No hay tarifas para esta región. Prueba con otra comuna.</p>
          ) : null}
          {(rates.data ?? []).map((r) => (
            <button
              key={r.id}
              type="button"
              role="radio"
              aria-checked={rateId === r.id}
              onClick={() => setRateId(r.id)}
              className={`flex items-center justify-between rounded-lg border bg-white p-4 text-left ${rateId === r.id ? "border-zinc-900" : "border-zinc-300"}`}
            >
              <span>
                <span className="block font-semibold">{r.carrier}</span>
                <span className="block text-xs text-zinc-500">{r.eta_days_min ?? "?"}–{r.eta_days_max ?? "?"} días hábiles</span>
              </span>
              <span className="font-bold">{formatCLP(r.price_clp)}</span>
            </button>
          ))}
          <label className="mt-2 flex flex-col gap-1 text-sm">
            <span className="text-zinc-500">Cupón (opcional)</span>
            <span className="flex gap-2">
              <input
                aria-label="Cupón de descuento"
                value={discountCode}
                onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
                placeholder="BIENVENIDA10"
                className="h-10 flex-1 rounded border border-zinc-300 bg-white px-3 uppercase"
              />
              <button type="button" onClick={() => setAppliedCode(discountCode.trim() || undefined)} className="rounded border border-zinc-300 px-4 text-sm">
                Aplicar
              </button>
            </span>
          </label>
          {appliedCode && quote.data && quote.data.discount_clp > 0 ? (
            <p className="text-sm font-semibold text-green-700">Cupón {appliedCode} aplicado (−{formatCLP(quote.data.discount_clp)})</p>
          ) : null}
          {appliedCode && !quote.isPending && (quote.data?.discount_clp ?? -1) === 0 ? (
            <p className="text-sm text-red-700">El cupón {appliedCode} no aplica a este pedido.</p>
          ) : null}
          {quote.data ? (
            <Totals
              subtotal={quote.data.subtotal_clp}
              discount={quote.data.discount_clp}
              shipping={quote.data.shipping_clp}
              total={quote.data.total_clp}
              code={appliedCode}
            />
          ) : null}
          {quote.isError ? (
            <p className="text-sm text-red-700">
              {quote.error instanceof CheckoutApiError ? quote.error.message : "No se pudo cotizar. Revisa el cupón o la tarifa."}
            </p>
          ) : null}
          <div className="mt-2 flex items-center justify-between">
            <button type="button" onClick={() => setStep(0)} className="text-sm text-zinc-500">
              Atrás
            </button>
            <button
              type="button"
              disabled={!rateId || !quote.data || quote.isError || quote.isFetching}
              onClick={() => setStep(2)}
              className="rounded bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              Revisar pedido
            </button>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="flex flex-col gap-3">
          <p className="font-medium">Tu pedido</p>
          {pending?.created ? (
            <p className="text-sm">Pedido {pending.created.order_number} · Total {formatCLP(pending.created.total_clp)}</p>
          ) : (
            <>
              {(quote.data?.lines ?? []).map((l) => (
                <div key={l.product_id} className="flex justify-between gap-3 text-sm">
                  <span className="flex-1">{l.qty} × {l.product_name}</span>
                  <span className="font-semibold">{formatCLP(l.unit_price_clp * l.qty)}</span>
                </div>
              ))}
              <Totals
                subtotal={quote.data?.subtotal_clp ?? 0}
                discount={quote.data?.discount_clp ?? 0}
                shipping={quote.data?.shipping_clp ?? 0}
                total={quote.data?.total_clp ?? 0}
                code={appliedCode}
              />
            </>
          )}
          <p className="text-xs text-zinc-500">La reserva dura 15 minutos. El proveedor confirma el resultado.</p>
          {pending ? (
            <p className="text-sm">Hay un intento guardado. Continúa o verifica este pago antes de iniciar otro.</p>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">Medio de pago de prueba</p>
              {providers.isError ? (
                <button type="button" onClick={() => providers.refetch()} className="text-left text-sm text-red-700">
                  No se pudieron cargar los medios. Reintentar
                </button>
              ) : null}
              {(providers.data?.providers ?? []).map((name) => (
                <button
                  key={name}
                  type="button"
                  role="radio"
                  aria-checked={provider === name}
                  onClick={() => setProvider(name)}
                  className={`rounded-lg border bg-white p-3 text-left text-sm ${provider === name ? "border-zinc-900 font-semibold" : "border-zinc-300"}`}
                >
                  {PROVIDER_LABEL[name] ?? name}
                </button>
              ))}
            </div>
          )}
          {pendingRedirect ? (
            <button
              type="button"
              disabled={verifying}
              onClick={() => checkPayment(pendingRedirect.order_id, pendingRedirect.guest_token)}
              className="h-11 rounded bg-zinc-900 text-sm font-semibold text-white disabled:opacity-60"
            >
              {verifying ? "Verificando…" : "Ya pagué, verificar pago"}
            </button>
          ) : null}
          {pending ? (
            <button type="button" disabled={pay.isPending || verifying} onClick={() => void closePending()} className="text-sm text-zinc-500 underline">
              Cerrar intento rechazado o vencido
            </button>
          ) : null}
          {pending?.created ? (
            <Link
              href={pending.created.guest_token ? `/pedido/${pending.created.order_id}?token=${encodeURIComponent(pending.created.guest_token)}` : `/pedido/${pending.created.order_id}`}
              className="text-sm text-zinc-900 underline"
            >
              Ver pedido guardado
            </Link>
          ) : null}
          {payError ? <p className="text-sm text-red-700">{payError}</p> : null}
          <div className="mt-2 flex items-center justify-between">
            <button
              type="button"
              disabled={Boolean(pending) || pay.isPending || verifying}
              onClick={() => {
                setPayError(null);
                setStep(1);
              }}
              className="text-sm text-zinc-500"
            >
              Atrás
            </button>
            <button
              type="button"
              disabled={pay.isPending || verifying || !restored || (!pending && (!provider || !quote.data || quote.isError || quote.isFetching))}
              onClick={() => {
                setPayError(null);
                pay.mutate();
              }}
              className="rounded bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {pay.isPending ? "Procesando…" : pending ? "Continuar pago pendiente" : `Pagar ${formatCLP(quote.data?.total_clp ?? 0)}`}
            </button>
          </div>
        </div>
      ) : null}

      {step === 3 && result ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <p className="text-lg font-bold">¡Pedido confirmado!</p>
          <p className="text-2xl font-extrabold tracking-widest">{result.order_number}</p>
          {result.guest_token ? (
            <p className="max-w-md text-sm">
              Guarda este código para rastrear tu pedido sin cuenta: <strong>{result.guest_token}</strong>
            </p>
          ) : null}
          <button
            type="button"
            onClick={() =>
              !authed && result.guest_token
                ? router.replace(`/pedido/${result.order_id}?token=${encodeURIComponent(result.guest_token)}`)
                : router.replace("/pedidos")
            }
            className="rounded bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white"
          >
            {!authed && result.guest_token ? "Ver mi pedido" : "Ver mis pedidos"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Totals({ subtotal, discount, shipping, total, code }: { subtotal: number; discount: number; shipping: number; total: number; code?: string }) {
  return (
    <dl className="flex flex-col gap-1 rounded-lg bg-white p-4 text-sm">
      <div className="flex justify-between"><dt className="text-zinc-500">Subtotal</dt><dd>{formatCLP(subtotal)}</dd></div>
      {discount > 0 ? (
        <div className="flex justify-between"><dt className="text-zinc-500">Descuento{code ? ` (${code})` : ""}</dt><dd>−{formatCLP(discount)}</dd></div>
      ) : null}
      <div className="flex justify-between"><dt className="text-zinc-500">Despacho</dt><dd>{formatCLP(shipping)}</dd></div>
      <div className="flex justify-between text-base font-bold"><dt>Total</dt><dd>{formatCLP(total)}</dd></div>
    </dl>
  );
}
