const clpFormatter = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

/** Formatea un monto en CLP, ej: 19990 -> "$19.990" (duplicado local: el shared usa extensión .js que Next no resuelve; igual que apps/admin). */
export function formatCLP(amountClp: number): string {
  if (!Number.isFinite(amountClp)) return "$0";
  return clpFormatter.format(Math.round(amountClp));
}
