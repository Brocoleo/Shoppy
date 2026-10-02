import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { radius, spacing, typeScale, useTheme } from "../theme/tokens";

export function SearchBar({
  value,
  onChange,
  onSubmit,
  placeholder = "Buscar marcas, prendas, categorías…",
  autoFocus = false,
}: {
  value: string;
  onChange: (text: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.wrap,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      <Ionicons name="search-outline" size={18} color={theme.muted} />
      <TextInput
        accessibilityLabel="Buscar productos"
        value={value}
        onChangeText={onChange}
        onSubmitEditing={onSubmit}
        returnKeyType="search"
        placeholder={placeholder}
        placeholderTextColor={theme.muted}
        autoFocus={autoFocus}
        style={[styles.input, { color: theme.text }]}
      />
      {value.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Limpiar búsqueda"
          onPress={() => onChange("")}
          hitSlop={8}
        >
          <Ionicons name="close-circle" size={18} color={theme.muted} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function QtyStepper({
  qty,
  onChange,
}: {
  qty: number;
  onChange: (qty: number) => void;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.stepper, { borderColor: theme.border }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Disminuir cantidad"
        onPress={() => onChange(qty - 1)}
        style={styles.stepButton}
        hitSlop={4}
      >
        <Text style={[styles.stepText, { color: theme.text }]}>−</Text>
      </Pressable>
      <Text style={[styles.qty, { color: theme.text }]}>{qty}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Aumentar cantidad"
        onPress={() => onChange(qty + 1)}
        style={styles.stepButton}
        hitSlop={4}
      >
        <Text style={[styles.stepText, { color: theme.text }]}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    minHeight: 48,
  },
  input: { flex: 1, fontSize: typeScale.body },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: radius.pill,
  },
  stepButton: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  stepText: { fontSize: typeScale.headline },
  qty: { fontSize: typeScale.body, fontWeight: "600", minWidth: 24, textAlign: "center" },
});
