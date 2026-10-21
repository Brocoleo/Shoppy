"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller, useWatch, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatCLP } from "../../lib/format";
import { addressSchema, REGIONES, type AddressInput } from "@shopy/validation";
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
import { isSupabaseConfigured } from "../../lib/supabase-config";
import { getSupabase } from "../../lib/supabase";
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
import { AddressSelect } from "../../components/AddressSelect";

type FieldName = keyof AddressInput;

const FIELDS: { name: FieldName; label: string; placeholder: string; autoComplete: string; type?: string }[] = [
  { name: "fullName", autoComplete: "name", label: "Nombre completo", placeholder: "María González" },
  { name: "email", autoComplete: "email", label: "Email", placeholder: "maria@email.cl", type: "email" },
  { name: "phone", autoComplete: "tel", label: "Teléfono", placeholder: "+56912345678", type: "tel" },
  { name: "street", autoComplete: "street-address", label: "Calle y número", placeholder: "Av. Providencia 1234, dpto 56" },
];

const PROVIDER_LABEL: Record<string, string> = {
  mock: "Simulación local",
  mercadopago: "Mercado Pago",
  transbank: "Webpay",
};

export default function CheckoutPage() {
  const { user, loading } = useSession();
  const { ready } = useCart();
  if (loading || !ready) return <p className="py-10 text-center text-sm text-muted">Cargando sesión…</p>;
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
    queryFn: listPaymentProviders,
    enabled: isSupabaseConfigured,
  });

  useEffect(() => {
    active.current = true;
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

  const { control, handleSubmit, reset, setValue, formState: { errors, dirtyFields } } = useForm<AddressInput>({ resolver: zodResolver(addressSchema) });

  // Región → comuna: el select de comuna se llena solo con las comunas de la
  // región elegida (16 regiones / 346 comunas oficiales, división SUBDERE).
  const regionPicked = useWatch({ control, name: "region" }) ?? "";
  const comunasDisponibles = REGIONES.find((r) => r.name === regionPicked)?.comunas ?? [];

  // Keep dirty values when a slow saved-address request finishes.
  void dirtyFields; // Subscribe so React Hook Form tracks keepDirtyValues.
  const addressPrefilled = useRef(false);
  const savedAddress = useQuery({
    queryKey: ["my-address", owner],
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from("addresses")
        .select("full_name,email,phone,street,comuna,region,zip_code,notes")
        .eq("user_id", owner)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      const row = data as unknown as Record<string, string | null> | null;

      return row;
    },
    enabled: isSupabaseConfigured && authed,
    staleTime: 60_000,
  });

  useEffect(() => {
    const row = savedAddress.data;
    if (row && !addressPrefilled.current) {
      addressPrefilled.current = true;
      reset({
        fullName: row["full_name"] ?? "",
        email: row["email"] ?? "",
        phone: row["phone"] ?? "",
        street: row["street"] ?? "",
        comuna: row["comuna"] ?? "",
        region: row["region"] ?? "",
        zipCode: row["zip_code"] ?? undefined,
        notes: row["notes"] ?? undefined,
      }, { keepDirtyValues: true });
    }
  }, [savedAddress.data, reset]);

  const savedNeedsCorrection = savedAddress.data && !addressSchema.safeParse({
    fullName: savedAddress.data.full_name, email: savedAddress.data.email,
    phone: savedAddress.data.phone, street: savedAddress.data.street,
    region: savedAddress.data.region, comuna: savedAddress.data.comuna,
  }).success;

  const items = lines.map((l) => ({ product_id: l.productId, qty: l.qty }));

  const rates = useQuery({
    queryKey: ["rates", address?.region ?? ""],
    queryFn: () => listShippingRates(address?.region ?? ""),
    enabled: step >= 1 && Boolean(address?.region),
  });

  const quoteSig = JSON.stringify({ items, rateId, appliedCode, region: address?.region });
  const quote = useQuery({
    // La clave incluye la cuenta propietaria: la cotización de una sesión
    // nunca se sirve a otra.
    queryKey: ["quote", owner, quoteSig],
    queryFn: () =>
      quoteCheckout({
        items,
        shipping_rate_id: rateId ?? "",
        discount_code: appliedCode,
        region: address?.region ?? "",
      }),
    enabled: step >= 1 && Boolean(rateId && address?.region && items.length > 0),
  });

  const canReview = rates.isSuccess && !rates.isFetching
    && Boolean(rates.data.some((rate) => rate.id === rateId))
    && quote.isSuccess && !quote.isFetching;
  const canStartPayment = canReview && providers.isSuccess && !providers.isFetching
    && Boolean(provider && providers.data.providers.includes(provider));

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
          if (!address || !rateId || !provider || !canStartPayment) {
            throw new Error("Revisa los datos y la cotización.");
          }
          attempt = await newPendingCheckout(owner, {
            items,
            address,
            shipping_rate_id: rateId,
            discount_code: appliedCode,
            save_address: authed,
            provider,
            // El total que el cliente está viendo: si cambia, el backend lo
            // rechaza con PRICE_CHANGED en vez de cobrar otro importe.
            expected_total_clp: quote.data?.total_clp,
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
      if (error instanceof CheckoutApiError && (error.code === "ATTEMPT_FAILED" || error.code === "PRICE_CHANGED")) {
        void clearPendingCheckout(owner).then(() => {
          if (active.current) {
            setPending(null);
            setStep(1);
            // El precio cambió: se refresca la cotización para que el cliente
            // vea el importe nuevo antes de volver a pagar.
            if (error.code === "PRICE_CHANGED") void queryClient.invalidateQueries({ queryKey: ["quote"] });
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
        onRetry={() => {
          setRestoreError(false);
          setRestoreRetry((n) => n + 1);
        }}
      />
    );
  }
  if (!isSupabaseConfigured) {
    return <ErrorState message="La tienda no está disponible en este momento. Vuelve a intentarlo más tarde." />;
  }
  if (lines.length === 0 && !result && !pending) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
        <h1 className="font-display text-3xl text-carbon">Nada que pagar</h1>
        <p className="text-sm text-muted">Tu carrito está vacío.</p>
        <Link href="/catalogo" className="bg-carbon px-4 py-2 text-sm text-white">
          Explorar catálogo
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div>
        <h1 className="font-display text-3xl tracking-tight text-carbon">Checkout</h1>
        <p className="text-sm text-muted">
          {step === 3 ? "¡Listo!" : `Paso ${step + 1} de 3: ${["Dirección", "Despacho", "Revisar y pagar"][step]}`}
        </p>
        <p className="mt-1 text-xs text-muted">Beta de prueba · no uses tarjetas reales.</p>
        {!restored ? <p className="text-xs text-muted">Recuperando pedido pendiente…</p> : null}
      </div>

      {step === 0 ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={handleSubmit((values) => {
            setAddress(values);
            setRateId(null);
            setPayError(null);
            setStep(1);
          })}
        >
          {savedAddress.isError ? <ErrorState message="No pudimos recuperar tu dirección guardada. Puedes escribirla aquí o reintentar." onRetry={() => void savedAddress.refetch()} /> : null}
          {savedNeedsCorrection ? <p role="status" className="text-sm text-muted">Revisa tu dirección guardada: necesitamos calle y número, región y comuna válidas.</p> : null}
          {FIELDS.map((f) => (
            <div key={f.name} className="flex flex-col gap-1 text-sm">
              <label htmlFor={`address-${f.name}`} className="text-muted">{f.label}</label>
              <Controller
                control={control}
                name={f.name}
                render={({ field: { onChange, onBlur, value, ref, name } }) => (
                  <input
                    ref={ref}
                    name={name}
                    id={`address-${name}`}
                    autoComplete={f.autoComplete}
                    aria-invalid={Boolean(errors[f.name])}
                    aria-describedby={[errors[f.name] ? `error-${name}` : "", name === "street" ? "street-help" : ""].filter(Boolean).join(" ") || undefined}
                    type={f.type ?? "text"}
                    onBlur={onBlur}
                    onChange={onChange}
                    value={(value as string) ?? ""}
                    placeholder={f.placeholder}
                    className="h-11 border border-carbon/30 bg-ivory px-3"
                  />
                )}
              />
              {errors[f.name] ? <span id={`error-${f.name}`} role="alert" className="text-xs text-red-700">{String(errors[f.name]?.message ?? "")}</span> : null}
            </div>
          ))}
          <p id="street-help" className="text-xs text-muted">Incluye el número después de la calle: 5 de Abril 1234. Es una comprobación de formato, no de ubicación.</p>
          <div className="flex flex-col gap-1 text-sm">
            <span id="address-region-label" className="text-muted">Región</span>
            <Controller control={control} name="region" render={({ field }) => (
              <AddressSelect {...field} id="address-region" value={field.value ?? ""}
                placeholder="Selecciona tu región" options={REGIONES.map((region) => region.name)}
                invalid={Boolean(errors.region)} describedBy={errors.region ? "error-region" : undefined}
                onChange={(value) => { field.onChange(value); setValue("comuna", "", { shouldDirty: true }); }} />
            )} />
            {errors.region ? <span id="error-region" role="alert" className="text-xs text-red-700">{String(errors.region?.message ?? "")}</span> : null}
          </div>
          <div className="flex flex-col gap-1 text-sm">
            <span id="address-comuna-label" className="text-muted">Comuna</span>
            <Controller control={control} name="comuna" render={({ field }) => (
              <AddressSelect {...field} id="address-comuna" value={field.value ?? ""}
                placeholder={comunasDisponibles.length ? "Selecciona tu comuna" : "Primero elige tu región"}
                options={comunasDisponibles} disabled={!comunasDisponibles.length}
                invalid={Boolean(errors.comuna)} describedBy={errors.comuna ? "error-comuna" : undefined} />
            )} />
            {errors.comuna ? <span id="error-comuna" role="alert" className="text-xs text-red-700">{String(errors.comuna?.message ?? "")}</span> : null}
          </div>
          <button type="submit" className="btn-press mt-2 h-11 bg-carbon text-sm font-semibold text-white transition-colors hover:bg-carbon-soft">
            Continuar al despacho
          </button>
        </form>
      ) : null}

      {step === 1 ? (
        <div className="flex flex-col gap-3">
          <p className="font-medium">Despacho a {address?.comuna}, {address?.region}</p>
          {rates.isPending ? <p role="status" className="text-sm text-muted">Cargando tarifas…</p> : null}
          {rates.isError ? <ErrorState message="No pudimos cargar las tarifas. Revisa tu conexión." onRetry={() => void rates.refetch()} /> : null}
          {!rates.isPending && !rates.isError && (rates.data ?? []).length === 0 ? (
            <p className="text-sm text-red-700">No hay tarifas disponibles para esta región. Puedes revisar tu dirección o volver al catálogo.</p>
          ) : null}
          {(rates.data ?? []).map((r) => (
            <label
              key={r.id}
              className={`flex items-center justify-between rounded-lg border bg-white p-4 text-left ${rateId === r.id ? "border-zinc-900" : "border-zinc-300"}`}
            >
              <input type="radio" name="shippingRate" value={r.id} checked={rateId === r.id} onChange={() => setRateId(r.id)} className="mr-3 h-5 w-5 shrink-0 accent-carbon" />
              <span className="flex-1">
                <span className="block font-semibold">{r.carrier}</span>
                <span className="block text-xs text-muted">{r.eta_days_min ?? "?"}–{r.eta_days_max ?? "?"} días hábiles</span>
                {r.free_from_clp !== null && r.price_clp > 0 ? (
                  <span className="block text-xs text-green-700">Envío gratis desde {formatCLP(r.free_from_clp)}</span>
                ) : null}
              </span>
              <span className="font-bold">{formatCLP(r.price_clp)}</span>
            </label>
          ))}
          <label className="mt-2 flex flex-col gap-1 text-sm">
            <span className="text-muted">Cupón (opcional)</span>
            <span className="flex gap-2">
              <input
                aria-label="Cupón de descuento"
                value={discountCode}
                onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
                placeholder="BIENVENIDA10"
                name="discountCode"
                autoComplete="off"
                className="h-11 min-w-0 flex-1 border border-carbon/30 bg-ivory px-3 uppercase"
              />
              <button type="button" onClick={() => setAppliedCode(discountCode.trim() || undefined)} className="border border-carbon/30 px-4 text-sm">
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
              freeShipping={quote.data.free_shipping}
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
            <button type="button" onClick={() => setStep(0)} className="text-sm text-muted">
              Atrás
            </button>
            <button
              type="button"
              disabled={!canReview}
              onClick={() => setStep(2)}
              className="btn-press bg-carbon px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-carbon-soft disabled:opacity-50"
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
                freeShipping={quote.data?.free_shipping}
                total={quote.data?.total_clp ?? 0}
                code={appliedCode}
              />
            </>
          )}
          <p className="text-xs text-muted">La reserva dura 15 minutos. El proveedor confirma el resultado.</p>
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
              {providers.isPending ? <p role="status" className="text-sm text-muted">Cargando medios de pago…</p> : null}
              {providers.isSuccess && providers.data.providers.length === 0 ? <p role="status" className="text-sm text-muted">No hay medios de pago disponibles en este momento.</p> : null}
              {(providers.data?.providers ?? []).map((name) => (
                <label
                  key={name}
                  className={`rounded-lg border bg-white p-3 text-left text-sm ${provider === name ? "border-zinc-900 font-semibold" : "border-zinc-300"}`}
                >
                  <input type="radio" name="paymentProvider" value={name} checked={provider === name} onChange={() => setProvider(name)} className="mr-3 h-5 w-5 align-middle accent-carbon" />
                  {PROVIDER_LABEL[name] ?? name}
                </label>
              ))}
            </div>
          )}
          {pendingRedirect ? (
            <button
              type="button"
              disabled={verifying}
              onClick={() => checkPayment(pendingRedirect.order_id, pendingRedirect.guest_token)}
              className="btn-press h-11 bg-carbon text-sm font-semibold text-white transition-colors hover:bg-carbon-soft disabled:opacity-60"
            >
              {verifying ? "Verificando…" : "Ya pagué, verificar pago"}
            </button>
          ) : null}
          {pending ? (
            <button type="button" disabled={pay.isPending || verifying} onClick={() => void closePending()} className="text-sm text-muted underline underline-offset-4 hover:text-carbon">
              Cerrar intento rechazado o vencido
            </button>
          ) : null}
          {pending?.created ? (
            <Link
              href={pending.created.guest_token ? `/pedido/${pending.created.order_id}?token=${encodeURIComponent(pending.created.guest_token)}` : `/pedido/${pending.created.order_id}`}
              className="text-sm text-carbon underline underline-offset-4"
            >
              Ver pedido guardado
            </Link>
          ) : null}
          {!pending && !canReview ? <p role="status" className="text-sm text-muted">La cotización se está revisando o dejó de estar disponible. Vuelve a despacho para revisarla.</p> : null}
          {payError ? <p role="alert" className="text-sm text-red-700">{payError}</p> : null}
          <div className="mt-2 flex items-center justify-between">
            <button
              type="button"
              disabled={Boolean(pending) || pay.isPending || verifying}
              onClick={() => {
                setPayError(null);
                setStep(1);
              }}
              className="text-sm text-muted"
            >
              Atrás
            </button>
            <button
              type="button"
              disabled={pay.isPending || verifying || !restored || (!pending && !canStartPayment)}
              onClick={() => {
                setPayError(null);
                pay.mutate();
              }}
              className="btn-press bg-carbon px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-carbon-soft disabled:opacity-50"
            >
              {pay.isPending ? "Procesando…" : pending ? "Continuar pago pendiente" : `Pagar ${formatCLP(quote.data?.total_clp ?? 0)}`}
            </button>
          </div>
        </div>
      ) : null}

      {step === 3 && result ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <p className="font-display text-2xl text-carbon">¡Pedido confirmado!</p>
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
            className="btn-press bg-carbon px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-carbon-soft"
          >
            {!authed && result.guest_token ? "Ver mi pedido" : "Ver mis pedidos"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Totals({ subtotal, discount, shipping, freeShipping, total, code }: { subtotal: number; discount: number; shipping: number; freeShipping?: boolean; total: number; code?: string }) {
  return (
    <dl className="flex flex-col gap-1 border border-line bg-ivory p-4 text-sm">
      <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd>{formatCLP(subtotal)}</dd></div>
      {discount > 0 ? (
        <div className="flex justify-between"><dt className="text-muted">Descuento{code ? ` (${code})` : ""}</dt><dd>−{formatCLP(discount)}</dd></div>
      ) : null}
      <div className="flex justify-between"><dt className="text-muted">Despacho</dt><dd>{shipping === 0 && freeShipping ? "Gratis" : formatCLP(shipping)}</dd></div>
      <div className="flex justify-between text-base font-bold"><dt>Total</dt><dd>{formatCLP(total)}</dd></div>
    </dl>
  );
}
