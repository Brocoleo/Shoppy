import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { loadPendingCheckout, savePendingCheckout, newPendingCheckout, clearPendingCheckout, type PendingCheckout } from "@/src/lib/pendingCheckout";
import { addressSchema, type AddressInput } from "@shopy/validation";
import {
  CheckoutApiError,
  confirmOrder,
  createOrder,
  listShippingRates,
  quoteCheckout,
  listPaymentProviders,
  recoverCheckout,
  closeCheckoutAttempt,
} from "@/src/lib/checkout";
import { getSupabase, isSupabaseConfigured } from "@/src/lib/supabase";
import { useAuth } from "@/src/auth/AuthContext";
import { useShopStore, waitForShopPersistence } from "@/src/stores/useShopStore";
import { formatCLP, radius, spacing, typeScale, useTheme } from "@/src/theme/tokens";
import { Screen } from "@/src/components/Screen";
import { EmptyState } from "@/src/components/EmptyState";

type FieldName = keyof AddressInput;

const FIELDS: { name: FieldName; label: string; placeholder: string; keyboard?: "email-address" | "phone-pad" }[] = [
  { name: "fullName", label: "Nombre completo", placeholder: "María González" },
  { name: "email", label: "Email", placeholder: "maria@email.cl", keyboard: "email-address" },
  { name: "phone", label: "Teléfono", placeholder: "+56912345678", keyboard: "phone-pad" },
  { name: "street", label: "Calle y número", placeholder: "Av. Providencia 1234, dpto 56" },
  { name: "comuna", label: "Comuna", placeholder: "Providencia" },
  { name: "region", label: "Región", placeholder: "Metropolitana" },
];

export default function CheckoutScreen() {
  const { session, loading } = useAuth();
  if (loading) return <Screen><Text>Cargando sesión…</Text></Screen>;
  const owner = session?.user.id ?? "guest";
  return <CheckoutFlow key={owner} owner={owner} />;
}

function CheckoutFlow({ owner }: { owner: string }) {
  const theme = useTheme();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const cart = useShopStore((s) => s.cart);
  const consumePaidOrder = useShopStore((s) => s.consumePaidOrder);
  const [step, setStep] = useState(0);
  const [address, setAddress] = useState<AddressInput | null>(null);
  const [rateId, setRateId] = useState<string | null>(null);
  const [discountCode, setDiscountCode] = useState("");
  const [appliedCode, setAppliedCode] = useState<string | undefined>(undefined);
  const [result, setResult] = useState<{ order_id: string; order_number: string; guest_token: string | null } | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const [pendingRedirect, setPendingRedirect] = useState<{ order_id: string; checkout_url: string; guest_token: string | null } | null>(null);
  const { verify } = useLocalSearchParams<{ verify?: string }>();
  const handledReturn = useRef<string | null>(null);
  const busy = useRef(false);
  const active = useRef(true);
  const [pending, setPending] = useState<PendingCheckout | null>(null);
  const [restoreRetry, setRestoreRetry] = useState(0);
  const [restoreError, setRestoreError] = useState(false);
  const [restored, setRestored] = useState(false);
  const [provider, setProvider] = useState<"mock" | "mercadopago" | "transbank" | null>(null);
  const providers = useQuery({ queryKey: ["payment-providers"], queryFn: listPaymentProviders, enabled: isSupabaseConfigured });
  useEffect(() => {
    active.current = true;
    setRestoreError(false);
    loadPendingCheckout(owner).then((saved) => {
      if (!active.current) return;
      setPending(saved);
      if (saved) {
        setStep(2);
        if (saved.created?.payment.checkout_url) setPendingRedirect({ ...saved.created, checkout_url: saved.created.payment.checkout_url });
      }
      setRestored(true);
    }).catch(() => { if (active.current) setRestoreError(true); });
    return () => { active.current = false; };
  }, [owner, restoreRetry]);

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AddressInput>({ resolver: zodResolver(addressSchema) });

  // Prefill con última dirección guardada (autenticados).
  useQuery({
    queryKey: ["my-address", session?.user.id ?? "guest"],
    queryFn: async () => {
      const { data } = await getSupabase()
        .from("addresses")
        .select("full_name,email,phone,street,comuna,region,zip_code,notes")
        .eq("user_id", session?.user.id ?? "")
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
    enabled: isSupabaseConfigured && Boolean(session),
    staleTime: 60_000,
  });

  const items = cart.map((l) => ({ product_id: l.productId, qty: l.qty }));

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
    if (!active.current || useShopStore.getState().owner !== owner) return;
    // El recibo y el descuento se guardan juntos para no descontar dos veces tras reiniciar.
    consumePaidOrder(res.order_id, (attempt?.input?.items ?? []).map((line) => ({ productId: line.product_id, qty: line.qty })));
    await waitForShopPersistence();
    await clearPendingCheckout(owner);
    if (!active.current) return;
    setResult({ order_id: res.order_id, order_number: res.order_number, guest_token: res.guest_token });
    setPending(null);
    setPendingRedirect(null);
    queryClient.invalidateQueries({ queryKey: ["cart-validation"] });
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
          if (!address || !rateId || !provider || !quote.data || quote.isError || quote.isFetching) throw new Error("Revisa los datos y la cotización.");
          attempt = await newPendingCheckout(owner, { items, address, shipping_rate_id: rateId, discount_code: appliedCode, save_address: Boolean(session), provider });
          if (!active.current) return;
          setPending(attempt);
        }
        let created = attempt.created;
        if (!created) {
          try { created = await recoverCheckout(attempt.key, attempt.secret, owner); }
          catch (error) {
            if (!(error instanceof CheckoutApiError) || error.code !== "ATTEMPT_NOT_FOUND" || !attempt.input) throw error;
            if (!active.current) return;
            created = await createOrder({ ...attempt.input, expected_user_id: owner === "guest" ? null : owner, idempotency_key: attempt.key, attempt_secret: attempt.secret });
          }
          attempt = { ...attempt, created };
          await savePendingCheckout(owner, attempt);
        }
        if (!active.current) return;
        setPending(attempt);
        if (created.payment.checkout_url) {
          setPendingRedirect({ ...created, checkout_url: created.payment.checkout_url });
          await WebBrowser.openBrowserAsync(created.payment.checkout_url);
        } else await complete(await confirmOrder(created.order_id, created.guest_token, owner), attempt);
      } finally { busy.current = false; }
    },
    onError: (error) => {
      if (!active.current) return;
      setPayError(error instanceof Error ? error.message : "No se pudo completar el pago.");
      if (error instanceof CheckoutApiError && error.code === "ATTEMPT_FAILED") {
        void clearPendingCheckout(owner).then(() => { if (active.current) { setPending(null); setStep(1); } });
      }
    },
  });

  const [verifying, setVerifying] = useState(false);
  const checkPayment = async (order_id: string, guest_token?: string | null) => {
    if (busy.current) return;
    busy.current = true;
    setVerifying(true);
    setPayError(null);
    try { await complete(await confirmOrder(order_id, guest_token, owner)); }
    catch (e) { if (active.current) setPayError(e instanceof Error ? e.message : "El pago aún no está confirmado."); }
    finally { busy.current = false; if (active.current) setVerifying(false); }
  };

  useEffect(() => {
    const key = Array.isArray(verify) ? verify[0] : verify;
    if (key && pendingRedirect && !result && !verifying && !pay.isPending && !busy.current && handledReturn.current !== key) {
      handledReturn.current = key;
      void checkPayment(pendingRedirect.order_id, pendingRedirect.guest_token);
    }
  }, [verify, pendingRedirect, result, verifying, pay.isPending]);

  const closePending = async () => {
    if (!pending || busy.current) return;
    busy.current = true;
    setVerifying(true);
    try {
      await closeCheckoutAttempt(pending.key, pending.secret, owner);
      await clearPendingCheckout(owner);
      if (!active.current) return;
      setPending(null); setPendingRedirect(null); setPayError(null); setStep(0);
    } catch (error) { if (active.current) setPayError(error instanceof Error ? error.message : "No se pudo cerrar el intento."); }
    finally { busy.current = false; if (active.current) setVerifying(false); }
  };

  if (restoreError) return <Screen><EmptyState icon="alert-circle-outline" title="No se pudo recuperar el pedido" message="Reintenta para comprobar el pedido guardado antes de comprar." actionLabel="Reintentar recuperación" onAction={() => setRestoreRetry((n) => n + 1)} /></Screen>;

  if (!isSupabaseConfigured) {
    return (
      <Screen>
        <EmptyState
          icon="cloud-offline-outline"
          title="Checkout no disponible"
          message="Falta configuración del backend para comprar."
          actionLabel="Volver al carrito"
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

  if (cart.length === 0 && !result && !pending) {
    return (
      <Screen>
        <EmptyState
          icon="bag-outline"
          title="Nada que pagar"
          message="Tu carrito está vacío."
          actionLabel="Explorar catálogo"
          onAction={() => router.push("/catalogo")}
        />
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={90}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: theme.text }]}>Checkout</Text>
        <Text style={[styles.steps, { color: theme.muted }]}>
          {step === 3 ? "¡Listo!" : `Paso ${step + 1} de 3: ${["Dirección", "Despacho", "Revisar y pagar"][step]}`}
        </Text>

        <Text style={{ color: theme.muted }}>Beta de prueba · no uses tarjetas reales.</Text>
        {!restored ? <Text style={{ color: theme.muted }}>Recuperando pedido pendiente…</Text> : null}
        {step === 0 ? (
          <View style={styles.form}>
            {FIELDS.map((f) => (
              <View key={f.name}>
                <Text style={[styles.label, { color: theme.muted }]}>{f.label}</Text>
                <Controller
                  control={control}
                  name={f.name}
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput
                      accessibilityLabel={f.label}
                      autoCapitalize={f.name === "email" ? "none" : "words"}
                      keyboardType={f.keyboard ?? "default"}
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={(value as string) ?? ""}
                      placeholder={f.placeholder}
                      placeholderTextColor={theme.muted}
                      style={[styles.input, { borderColor: theme.border, color: theme.text }]}
                    />
                  )}
                />
                {errors[f.name] ? (
                  <Text style={[styles.error, { color: theme.sale }]}>
                    {String(errors[f.name]?.message ?? "")}
                  </Text>
                ) : null}
              </View>
            ))}
            <Pressable
              accessibilityRole="button"
              onPress={handleSubmit((values) => {
                setAddress(values);
                setRateId(null);
                setStep(1);
              })}
              style={[styles.cta, { backgroundColor: theme.accent }]}
            >
              <Text style={[styles.ctaText, { color: theme.onAccent }]}>Continuar al despacho</Text>
            </Pressable>
          </View>
        ) : null}

        {step === 1 ? (
          <View style={styles.form}>
            <Text style={[styles.section, { color: theme.text }]}>
              Despacho a {address?.comuna}, {address?.region}
            </Text>
            {rates.fetchStatus === "paused" ? <Text style={{ color: theme.muted }}>Sin conexión. Las tarifas se cargarán al reconectar.</Text> : null}
            {rates.isLoading ? <Text style={{ color: theme.muted }}>Cargando tarifas…</Text> : null}
            {rates.isError ? (
              <Text style={[styles.error, { color: theme.sale }]}>
                No pudimos cargar las tarifas. Revisa tu conexión.
              </Text>
            ) : null}
            {!rates.isPending && !rates.isError && (rates.data ?? []).length === 0 ? (
              <Text style={[styles.error, { color: theme.sale }]}>
                No hay tarifas para esta región. Prueba con otra comuna.
              </Text>
            ) : null}
            {(rates.data ?? []).map((r) => (
              <Pressable
                key={r.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: rateId === r.id }}
                onPress={() => setRateId(r.id)}
                style={[
                  styles.rate,
                  { borderColor: rateId === r.id ? theme.accent : theme.border },
                ]}
              >
                <View>
                  <Text style={[styles.rateCarrier, { color: theme.text }]}>{r.carrier}</Text>
                  <Text style={[styles.rateEta, { color: theme.muted }]}>
                    {r.eta_days_min ?? "?"}–{r.eta_days_max ?? "?"} días hábiles
                  </Text>
                </View>
                <Text style={[styles.ratePrice, { color: theme.text }]}>{formatCLP(r.price_clp)}</Text>
              </Pressable>
            ))}
            <Text style={[styles.label, { color: theme.muted }]}>Cupón (opcional)</Text>
            <View style={styles.couponRow}>
              <TextInput
                accessibilityLabel="Cupón de descuento"
                autoCapitalize="characters"
                value={discountCode}
                onChangeText={setDiscountCode}
                placeholder="BIENVENIDA10"
                placeholderTextColor={theme.muted}
                style={[styles.input, styles.couponInput, { borderColor: theme.border, color: theme.text }]}
              />
              <Pressable
                accessibilityRole="button"
                onPress={() => setAppliedCode(discountCode.trim() || undefined)}
                style={[styles.couponBtn, { borderColor: theme.border }]}
              >
                <Text style={{ color: theme.text }}>Aplicar</Text>
              </Pressable>
            </View>
            {appliedCode && quote.data && quote.data.discount_clp > 0 ? (
              <Text style={[styles.applied, { color: theme.success }]}>
                Cupón {appliedCode} aplicado (−{formatCLP(quote.data.discount_clp)})
              </Text>
            ) : null}
            {appliedCode && !quote.isPending && (quote.data?.discount_clp ?? -1) === 0 ? (
              <Text style={[styles.error, { color: theme.sale }]}>
                El cupón {appliedCode} no aplica a este pedido.
              </Text>
            ) : null}
            {quote.data ? (
              <View style={styles.totals}>
                <TotalRow label="Subtotal" value={quote.data.subtotal_clp} />
                {quote.data.discount_clp > 0 ? (
                  <TotalRow label={`Descuento${appliedCode ? ` (${appliedCode})` : ""}`} value={-quote.data.discount_clp} />
                ) : null}
                <TotalRow label="Despacho" value={quote.data.shipping_clp} />
                <TotalRow label="Total" value={quote.data.total_clp} big />
              </View>
            ) : null}
            {quote.isError ? (
              <Text style={[styles.error, { color: theme.sale }]}>
                {quote.error instanceof CheckoutApiError
                  ? quote.error.message
                  : "No se pudo cotizar. Revisa el cupón o la tarifa."}
              </Text>
            ) : null}
            <View style={styles.navRow}>
              <Pressable accessibilityRole="button" onPress={() => setStep(0)} hitSlop={8}>
                <Text style={{ color: theme.muted }}>Atrás</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={!rateId || !quote.data || quote.isError || quote.isFetching}
                onPress={() => setStep(2)}
                style={[styles.ctaSmall, { backgroundColor: theme.accent, opacity: !rateId || !quote.data || quote.isError || quote.isFetching ? 0.5 : 1 }]}
              >
                <Text style={[styles.ctaText, { color: theme.onAccent }]}>Revisar pedido</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {step === 2 ? (
          <View style={styles.form}>
            <Text style={[styles.section, { color: theme.text }]}>Tu pedido</Text>
            {pending?.created ? <Text style={{ color: theme.text }}>Pedido {pending.created.order_number} · Total {formatCLP(pending.created.total_clp)}</Text> : null}
            {!pending ? <>
            {(quote.data?.lines ?? []).map((l) => (
              <View key={l.product_id} style={styles.line}>
                <Text style={[styles.lineName, { color: theme.text }]} numberOfLines={2}>
                  {l.qty} × {l.product_name}
                </Text>
                <Text style={[styles.linePrice, { color: theme.text }]}>
                  {formatCLP(l.unit_price_clp * l.qty)}
                </Text>
              </View>
            ))}
            <View style={styles.totals}>
              <TotalRow label="Subtotal" value={quote.data?.subtotal_clp ?? 0} />
              {(quote.data?.discount_clp ?? 0) > 0 ? (
                <TotalRow label="Descuento" value={-(quote.data?.discount_clp ?? 0)} />
              ) : null}
              <TotalRow label="Despacho" value={quote.data?.shipping_clp ?? 0} />
              <TotalRow label="Total" value={quote.data?.total_clp ?? 0} big />
            </View>
            </> : null}
            <Text style={[styles.payNote, { color: theme.muted }]}>La reserva dura 15 minutos. El proveedor confirma el resultado.</Text>
            {pending ? <Text style={{ color: theme.text }}>Hay un intento guardado. Continúa o verifica este pago antes de iniciar otro.</Text> : (
              <View style={{ gap: spacing.sm }}>
                <Text style={{ color: theme.text }}>Medio de pago de prueba</Text>
                {providers.isError ? <Pressable accessibilityRole="button" onPress={() => providers.refetch()}><Text style={{ color: theme.sale }}>No se pudieron cargar los medios. Reintentar</Text></Pressable> : null}
                {(providers.data?.providers ?? []).map((name) => <Pressable key={name} accessibilityRole="radio" accessibilityState={{ selected: provider === name }} onPress={() => setProvider(name)} style={[styles.rate, { borderColor: provider === name ? theme.accent : theme.border }]}><Text style={{ color: theme.text }}>{name === "mercadopago" ? "Mercado Pago" : name === "transbank" ? "Webpay" : "Simulación local"}</Text></Pressable>)}
              </View>
            )}
            {pendingRedirect ? (
              <Pressable
                accessibilityRole="button"
                disabled={verifying}
                onPress={() => checkPayment(pendingRedirect.order_id, pendingRedirect.guest_token)}
                style={[styles.cta, { backgroundColor: theme.accent, opacity: verifying ? 0.6 : 1 }]}
              >
                <Text style={[styles.ctaText, { color: theme.onAccent }]}>
                  {verifying ? "Verificando…" : "Ya pagué, verificar pago"}
                </Text>
              </Pressable>
            ) : null}
            {pending ? <Pressable accessibilityRole="button" disabled={pay.isPending || verifying} onPress={() => { void closePending(); }} style={styles.couponBtn}><Text style={{ color: theme.muted }}>Cerrar intento rechazado o vencido</Text></Pressable> : null}
            {pending?.created ? <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/pedido/[id]", params: { id: pending.created!.order_id, ...(pending.created!.guest_token ? { token: pending.created!.guest_token } : {}) } })}><Text style={{ color: theme.accent }}>Ver pedido guardado</Text></Pressable> : null}
            {payError ? <Text style={[styles.error, { color: theme.sale }]}>{payError}</Text> : null}
            <View style={styles.navRow}>
              <Pressable accessibilityRole="button" disabled={Boolean(pending) || pay.isPending || verifying} onPress={() => { setPayError(null); setStep(1); }} hitSlop={8}>
                <Text style={{ color: theme.muted }}>Atrás</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={pay.isPending || verifying || !restored || (!pending && (!provider || !quote.data || quote.isError || quote.isFetching))}
                onPress={() => { setPayError(null); pay.mutate(); }}
                style={[styles.ctaSmall, { backgroundColor: theme.accent, opacity: pay.isPending ? 0.6 : 1 }]}
              >
                <Text style={[styles.ctaText, { color: theme.onAccent }]}>
                  {pay.isPending ? "Procesando…" : pending ? "Continuar pago pendiente" : `Pagar ${formatCLP(quote.data?.total_clp ?? 0)}`}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {step === 3 && result ? (
          <View style={styles.form}>
            <Text style={[styles.section, { color: theme.text }]}>¡Pedido confirmado!</Text>
            <Text style={[styles.orderNumber, { color: theme.text }]}>{result.order_number}</Text>
            {result.guest_token ? (
              <Text style={[styles.guestBox, { color: theme.text }]}>
                Guarda este código para rastrear tu pedido sin cuenta:{"\n"}
                <Text style={styles.guestToken}>{result.guest_token}</Text>
              </Text>
            ) : null}
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                !session && result.guest_token
                  ? router.replace({
                      pathname: "/pedido/[id]",
                      params: { id: result.order_id, token: result.guest_token },
                    })
                  : router.replace("/pedidos")
              }
              style={[styles.cta, { backgroundColor: theme.accent }]}
            >
              <Text style={[styles.ctaText, { color: theme.onAccent }]}>
                {!session && result.guest_token ? "Ver mi pedido" : "Ver mis pedidos"}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function TotalRow({ label, value, big = false }: { label: string; value: number; big?: boolean }) {
  const theme = useTheme();
  return (
    <View style={styles.totalRow}>
      <Text style={[styles.totalLabel, big && styles.totalBig, { color: big ? theme.text : theme.muted }]}>
        {label}
      </Text>
      <Text style={[styles.totalValue, big && styles.totalBig, { color: theme.text }]}>
        {formatCLP(value)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  title: { fontSize: typeScale.title, fontWeight: "700" },
  steps: { fontSize: typeScale.caption, marginBottom: spacing.sm },
  form: { gap: spacing.sm },
  section: { fontSize: typeScale.headline, fontWeight: "700", marginBottom: spacing.sm },
  label: { fontSize: typeScale.caption, marginTop: spacing.sm },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.lg, minHeight: 48, fontSize: typeScale.body },
  error: { fontSize: typeScale.caption },
  applied: { fontSize: typeScale.caption, fontWeight: "600" },
  cta: { borderRadius: radius.pill, minHeight: 52, alignItems: "center", justifyContent: "center", marginTop: spacing.md },
  ctaText: { fontSize: typeScale.body, fontWeight: "700" },
  ctaSmall: { borderRadius: radius.pill, paddingHorizontal: spacing.xl, minHeight: 48, alignItems: "center", justifyContent: "center" },
  rate: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderWidth: 1, borderRadius: radius.md, padding: spacing.lg },
  rateCarrier: { fontSize: typeScale.body, fontWeight: "600" },
  rateEta: { fontSize: typeScale.caption },
  ratePrice: { fontSize: typeScale.body, fontWeight: "700" },
  couponRow: { flexDirection: "row", gap: spacing.sm },
  couponInput: { flex: 1 },
  couponBtn: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.lg, justifyContent: "center", minHeight: 48 },
  totals: { gap: 4, marginTop: spacing.md },
  totalRow: { flexDirection: "row", justifyContent: "space-between" },
  totalLabel: { fontSize: typeScale.body },
  totalValue: { fontSize: typeScale.body },
  totalBig: { fontWeight: "800", fontSize: typeScale.headline },
  navRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.md },
  line: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md },
  lineName: { flex: 1, fontSize: typeScale.body },
  linePrice: { fontSize: typeScale.body, fontWeight: "600" },
  payNote: { fontSize: typeScale.caption },
  orderNumber: { fontSize: 28, fontWeight: "800", letterSpacing: 1 },
  guestBox: { fontSize: typeScale.body, lineHeight: 24 },
  guestToken: { fontWeight: "700" },
});
