import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useURL } from "expo-linking";
import { addressSchema, type AddressInput } from "@shopy/validation";
import {
  CheckoutApiError,
  confirmOrder,
  createOrder,
  listShippingRates,
  quoteCheckout,
} from "@/src/lib/checkout";
import { getSupabase, isSupabaseConfigured } from "@/src/lib/supabase";
import { useAuth } from "@/src/auth/AuthContext";
import { useShopStore } from "@/src/stores/useShopStore";
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
  const theme = useTheme();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const cart = useShopStore((s) => s.cart);
  const clearCart = useShopStore((s) => s.clearCart);
  const [step, setStep] = useState(0);
  const [address, setAddress] = useState<AddressInput | null>(null);
  const [rateId, setRateId] = useState<string | null>(null);
  const [discountCode, setDiscountCode] = useState("");
  const [appliedCode, setAppliedCode] = useState<string | undefined>(undefined);
  const [result, setResult] = useState<{ order_number: string; guest_token: string | null } | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const [pendingRedirect, setPendingRedirect] = useState<{ order_id: string; checkout_url: string; guest_token: string | null } | null>(null);
  const returnUrl = useURL();

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

  const quoteSig = JSON.stringify({ items, rateId, appliedCode });
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

  const pay = useMutation({
    mutationFn: async () => {
      if (!address || !rateId) throw new Error("Faltan datos");
      const created = await createOrder({
        items,
        address,
        shipping_rate_id: rateId,
        discount_code: appliedCode,
        save_address: Boolean(session),
        return_url: "shopy://checkout-return",
      });
      // Proveedor con redirect (MP/Transbank): abrir checkout externo.
      if (created.payment.checkout_url) {
        setPendingRedirect({ order_id: created.order_id, checkout_url: created.payment.checkout_url, guest_token: created.guest_token });
        await WebBrowser.openBrowserAsync(created.payment.checkout_url);
        // La confirmación ocurre al retornar (deep link) o con "Ya pagué".
        return confirmOrder(created.order_id, created.guest_token);
      }
      return confirmOrder(created.order_id, created.guest_token);
    },
    onSuccess: (confirmed) => {
      setResult({ order_number: confirmed.order_number, guest_token: confirmed.guest_token });
      clearCart();
      queryClient.invalidateQueries({ queryKey: ["cart-validation"] });
      setStep(3);
    },
    onError: (e) => {
      setPayError(e instanceof CheckoutApiError ? e.message : "No se pudo completar el pago.");
    },
  });

  // Solo-verificación (retorno desde browser o botón "Ya pagué"): idempotente.
  const [verifying, setVerifying] = useState(false);
  const checkPayment = async (order_id: string, guest_token?: string | null) => {
    setVerifying(true);
    setPayError(null);
    try {
      const confirmed = await confirmOrder(order_id, guest_token);
      setResult({ order_number: confirmed.order_number, guest_token: confirmed.guest_token });
      clearCart();
      queryClient.invalidateQueries({ queryKey: ["cart-validation"] });
      setPendingRedirect(null);
      setStep(3);
    } catch (e) {
      setPayError(e instanceof CheckoutApiError ? e.message : "El pago aún no está confirmado.");
    }
    setVerifying(false);
  };

  useEffect(() => {
    if (returnUrl?.startsWith("shopy://checkout-return") && pendingRedirect && !result && !verifying) {
      checkPayment(pendingRedirect.order_id, pendingRedirect.guest_token);
    }
  }, [returnUrl, pendingRedirect, result, verifying, clearCart, queryClient]);

  if (!isSupabaseConfigured) {
    return (
      <Screen>
        <EmptyState
          icon="cloud-offline-outline"
          title="Checkout no disponible"
          message="Conecta Supabase (apps/mobile/.env) para comprar."
          actionLabel="Volver al carrito"
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

  if (cart.length === 0 && !result) {
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
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: theme.text }]}>Checkout</Text>
        <Text style={[styles.steps, { color: theme.muted }]}>
          {step === 3 ? "¡Listo!" : `Paso ${step + 1} de 3: ${["Dirección", "Despacho", "Revisar y pagar"][step]}`}
        </Text>

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
            {rates.isLoading ? <Text style={{ color: theme.muted }}>Cargando tarifas…</Text> : null}
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
                disabled={!rateId || !quote.data}
                onPress={() => setStep(2)}
                style={[styles.ctaSmall, { backgroundColor: theme.accent, opacity: !rateId || !quote.data ? 0.5 : 1 }]}
              >
                <Text style={[styles.ctaText, { color: theme.onAccent }]}>Revisar pedido</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {step === 2 ? (
          <View style={styles.form}>
            <Text style={[styles.section, { color: theme.text }]}>Tu pedido</Text>
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
            <Text style={[styles.payNote, { color: theme.muted }]}>
              Pago de prueba (mock, sin cargos). La reserva dura 15 minutos.
            </Text>
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
            {payError ? <Text style={[styles.error, { color: theme.sale }]}>{payError}</Text> : null}
            <View style={styles.navRow}>
              <Pressable accessibilityRole="button" onPress={() => { setPayError(null); setStep(1); }} hitSlop={8}>
                <Text style={{ color: theme.muted }}>Atrás</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={pay.isPending}
                onPress={() => { setPayError(null); pay.mutate(); }}
                style={[styles.ctaSmall, { backgroundColor: theme.accent, opacity: pay.isPending ? 0.6 : 1 }]}
              >
                <Text style={[styles.ctaText, { color: theme.onAccent }]}>
                  {pay.isPending ? "Procesando…" : `Pagar ${formatCLP(quote.data?.total_clp ?? 0)}`}
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
              onPress={() => router.replace("/pedidos")}
              style={[styles.cta, { backgroundColor: theme.accent }]}
            >
              <Text style={[styles.ctaText, { color: theme.onAccent }]}>Ver mis pedidos</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
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
