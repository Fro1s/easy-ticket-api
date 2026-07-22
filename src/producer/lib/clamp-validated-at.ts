/** Relógio do device offline não é confiável: nunca aceitar futuro/inválido. */
export function clampValidatedAt(
  deviceIso: string,
  now: Date = new Date(),
): Date {
  const d = new Date(deviceIso);
  if (Number.isNaN(d.getTime()) || d.getTime() > now.getTime()) return now;
  return d;
}
