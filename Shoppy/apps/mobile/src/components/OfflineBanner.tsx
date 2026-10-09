import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { spacing, typeScale, useTheme } from "../theme/tokens";
import { useIsOnline } from "../query/online";

/** Franja visible cuando no hay red. Las queries pausadas se reanudan solas. */
export function OfflineBanner() {
  const theme = useTheme();
  const isOnline = useIsOnline();
  if (isOnline) return null;
  return (
    <View style={[styles.bar, { backgroundColor: theme.text }]}>
      <Ionicons name="wifi-outline" size={14} color={theme.background} />
      <Text style={[styles.label, { color: theme.background }]}>
        Sin conexión — verás datos guardados y todo se actualizará al reconectar
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  label: { fontSize: typeScale.caption, fontWeight: "600", textAlign: "center" },
});
