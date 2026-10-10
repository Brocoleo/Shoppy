import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { MOCK_ORDERS } from "@/src/data/catalog";
import { useFavoriteIds } from "@/src/data/favorites";
import { useAuth } from "@/src/auth/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { isSupabaseConfigured } from "@/src/lib/supabase";
import { listMyOrders } from "@/src/lib/checkout";
import { radius, spacing, typeScale, useTheme } from "@/src/theme/tokens";
import { Screen } from "@/src/components/Screen";

type MenuIcon = keyof typeof Ionicons.glyphMap;

const authSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Mínimo 6 caracteres"),
});

type AuthForm = z.infer<typeof authSchema>;

export default function ProfileScreen() {
  const theme = useTheme();
  const { isConfigured, session, loading, signIn, signUp, signOut } = useAuth();
  const favIds = useFavoriteIds();
  const myOrders = useQuery({
    queryKey: ["my-orders", session?.user.id ?? "guest"],
    queryFn: listMyOrders,
    enabled: isSupabaseConfigured && Boolean(session),
    staleTime: 60_000,
  });
  const orderCount = !isSupabaseConfigured
    ? MOCK_ORDERS.length
    : !session
      ? null
      : myOrders.isError
        ? undefined
        : (myOrders.data?.length ?? 0);
  const [mode, setMode] = useState<"in" | "up">("in");
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AuthForm>({ resolver: zodResolver(authSchema), defaultValues: { email: "", password: "" } });

  const onSubmit = async (values: AuthForm) => {
    setFormError(null);
    const { error } = mode === "in"
      ? await signIn(values.email, values.password)
      : await signUp(values.email, values.password);
    if (error) setFormError(error);
    else if (mode === "up") setNotice("Cuenta creada. Revisa tu email si se requiere confirmación.");
  };

  const menu: { icon: MenuIcon; label: string; detail?: string; onPress: () => void }[] = [
    {
      icon: "receipt-outline",
      label: "Mis pedidos",
      detail: typeof orderCount === "number" ? `${orderCount} pedidos` : undefined,
      onPress: () => router.push("/pedidos"),
    },
    {
      icon: "heart-outline",
      label: "Favoritos",
      detail: `${favIds.length} guardados`,
      onPress: () => router.push("/(tabs)/favoritos"),
    },
    {
      icon: "location-outline",
      label: "Mis direcciones",
      onPress: () => setNotice("Mis direcciones (próximamente)."),
    },
    {
      icon: "help-circle-outline",
      label: "Ayuda y despachos",
      onPress: () => setNotice("Ayuda y despachos (próximamente)."),
    },
  ];

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.card, { backgroundColor: theme.surface }]}>
          <View style={[styles.avatar, { backgroundColor: theme.accent }]}>
            <Text style={[styles.avatarText, { color: theme.onAccent }]}>
              {(session?.user.email ?? "I").charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.who}>
            <Text style={[styles.name, { color: theme.text }]}>
              {session ? (session.user.email ?? "Mi cuenta") : "Invitado"}
            </Text>
            <Text style={[styles.sub, { color: theme.muted }]}>
              {session
                ? "Sesión sincronizada en este dispositivo"
                : "Compra sin cuenta o inicia sesión para sincronizar"}
            </Text>
          </View>
        </View>

        {!isConfigured ? (
          <Text style={[styles.sub, { color: theme.muted }]}>
            Falta configuración del backend para activar el inicio de sesión.
          </Text>
        ) : loading ? (
          <Text style={[styles.sub, { color: theme.muted }]}>Cargando sesión…</Text>
        ) : session ? (
          <Pressable
            accessibilityRole="button"
            onPress={signOut}
            style={[styles.ctaSecondary, { borderColor: theme.border }]}
          >
            <Text style={[styles.ctaSecondaryText, { color: theme.text }]}>Cerrar sesión</Text>
          </Pressable>
        ) : (
          <View style={styles.form}>
            <View style={styles.modeRow}>
              <Pressable accessibilityRole="button" onPress={() => setMode("in")} hitSlop={8}>
                <Text style={[styles.mode, mode === "in" && styles.modeActive, { color: mode === "in" ? theme.text : theme.muted }]}>
                  Entrar
                </Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => setMode("up")} hitSlop={8}>
                <Text style={[styles.mode, mode === "up" && styles.modeActive, { color: mode === "up" ? theme.text : theme.muted }]}>
                  Crear cuenta
                </Text>
              </Pressable>
            </View>

            <Text style={[styles.label, { color: theme.muted }]}>Email</Text>
            <Controller
              control={control}
              name="email"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  accessibilityLabel="Email"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  placeholder="tu@email.cl"
                  placeholderTextColor={theme.muted}
                  style={[styles.input, { borderColor: theme.border, color: theme.text }]}
                />
              )}
            />
            {errors.email ? <Text style={[styles.error, { color: theme.sale }]}>{errors.email.message}</Text> : null}

            <Text style={[styles.label, { color: theme.muted }]}>Contraseña</Text>
            <Controller
              control={control}
              name="password"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  accessibilityLabel="Contraseña"
                  secureTextEntry
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  placeholder="Mínimo 6 caracteres"
                  placeholderTextColor={theme.muted}
                  style={[styles.input, { borderColor: theme.border, color: theme.text }]}
                />
              )}
            />
            {errors.password ? <Text style={[styles.error, { color: theme.sale }]}>{errors.password.message}</Text> : null}
            {formError ? <Text style={[styles.error, { color: theme.sale }]}>{formError}</Text> : null}

            <Pressable
              accessibilityRole="button"
              onPress={handleSubmit(onSubmit)}
              disabled={isSubmitting}
              style={[styles.cta, { backgroundColor: theme.accent, opacity: isSubmitting ? 0.6 : 1 }]}
            >
              <Text style={[styles.ctaText, { color: theme.onAccent }]}>
                {isSubmitting ? "Enviando…" : mode === "in" ? "Iniciar sesión" : "Crear cuenta"}
              </Text>
            </Pressable>
          </View>
        )}

        {notice ? <Text style={[styles.notice, { color: theme.warning }]}>{notice}</Text> : null}

        <View>
          {menu.map((m) => (
            <Pressable
              key={m.label}
              accessibilityRole="button"
              onPress={m.onPress}
              style={[styles.row, { borderBottomColor: theme.border }]}
            >
              <Ionicons name={m.icon} size={20} color={theme.text} />
              <Text style={[styles.rowLabel, { color: theme.text }]}>{m.label}</Text>
              {m.detail ? <Text style={[styles.rowDetail, { color: theme.muted }]}>{m.detail}</Text> : null}
              <Ionicons name="chevron-forward" size={18} color={theme.muted} />
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.lg },
  card: {
    flexDirection: "row",
    gap: spacing.md,
    borderRadius: radius.md,
    padding: spacing.lg,
    alignItems: "center",
  },
  avatar: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: typeScale.title, fontWeight: "700" },
  who: { flex: 1, gap: 2 },
  name: { fontSize: typeScale.headline, fontWeight: "700" },
  sub: { fontSize: typeScale.caption },
  form: { gap: spacing.sm },
  modeRow: { flexDirection: "row", gap: spacing.lg, marginBottom: spacing.sm },
  mode: { fontSize: typeScale.body },
  modeActive: { fontWeight: "700", textDecorationLine: "underline" },
  label: { fontSize: typeScale.caption, marginTop: spacing.sm },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    minHeight: 48,
    fontSize: typeScale.body,
  },
  error: { fontSize: typeScale.caption },
  cta: { borderRadius: radius.pill, minHeight: 52, alignItems: "center", justifyContent: "center", marginTop: spacing.sm },
  ctaText: { fontSize: typeScale.body, fontWeight: "700" },
  ctaSecondary: { borderWidth: 1, borderRadius: radius.pill, minHeight: 52, alignItems: "center", justifyContent: "center" },
  ctaSecondaryText: { fontSize: typeScale.body, fontWeight: "600" },
  notice: { fontSize: typeScale.caption },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.lg, borderBottomWidth: 1, minHeight: 56 },
  rowLabel: { flex: 1, fontSize: typeScale.body },
  rowDetail: { fontSize: typeScale.caption },
});
