/**
 * Sistema de diseño Shopy — tokens editoriales (Fase 3).
 * Paleta: blanco / negro / grises neutros. La marca vive en tokens,
 * no hardcodeada en pantallas, para poder re-brandear fácilmente.
 */
import { useColorScheme } from "@/components/useColorScheme";

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 2,
  md: 4,
  lg: 8,
  pill: 999,
} as const;

export const typeScale = {
  hero: 34,
  title: 22,
  headline: 18,
  body: 15,
  caption: 13,
  tiny: 11,
} as const;

export interface Palette {
  background: string;
  surface: string;
  text: string;
  muted: string;
  border: string;
  accent: string;
  onAccent: string;
  sale: string;
  success: string;
  warning: string;
  imageFallback: string;
}

const light: Palette = {
  background: "#FFFFFF",
  surface: "#F5F5F4",
  text: "#111111",
  muted: "#6E6E6E",
  border: "#E8E8E8",
  accent: "#111111",
  onAccent: "#FFFFFF",
  sale: "#A6192E",
  success: "#1B7A3D",
  warning: "#B7791F",
  imageFallback: "#EFEFED",
} as const;

const dark: Palette = {
  background: "#0E0E0E",
  surface: "#1A1A1A",
  text: "#F5F5F5",
  muted: "#A3A3A3",
  border: "#2A2A2A",
  accent: "#F5F5F5",
  onAccent: "#111111",
  sale: "#E5484D",
  success: "#46A758",
  warning: "#D8A24A",
  imageFallback: "#232323",
} as const;

export type Theme = Palette;

export function useTheme(): Theme {
  const scheme = useColorScheme();
  return scheme === "dark" ? dark : light;
}

export const CONDITION_LABELS: Record<string, string> = {
  como_nuevo: "Como nuevo",
  excelente: "Excelente",
  bueno: "Bueno",
  con_detalles: "Con detalles",
};

export function formatCLP(amountClp: number): string {
  if (!Number.isFinite(amountClp)) return "$0";
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(Math.round(amountClp));
}
