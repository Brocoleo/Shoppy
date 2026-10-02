const clpFormatter = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

/** Formatea un monto en CLP, ej: 19990 -> "$19.990" */
export function formatCLP(amountClp: number): string {
  if (!Number.isFinite(amountClp)) return "$0";
  return clpFormatter.format(Math.round(amountClp));
}
