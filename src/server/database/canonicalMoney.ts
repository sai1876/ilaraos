export class MoneyIntegrityError extends Error {
  constructor(public readonly field: string) {
    super(`Stored monetary fields disagree: ${field}`);
  }
}

export function readCanonicalMoneyPaise(
  source: Record<string, unknown>,
  rupeeField: string,
  paiseField: string,
  allowNegative = false,
): number | null {
  const rupeeValue = source[rupeeField];
  const paiseValue = source[paiseField];
  const hasRupees = rupeeValue !== undefined && rupeeValue !== null;
  const hasPaise = paiseValue !== undefined && paiseValue !== null;
  if (!hasRupees && !hasPaise) return null;

  const rupees = hasRupees && typeof rupeeValue === 'number' ? rupeeValue : null;
  const paise = hasPaise && typeof paiseValue === 'number' ? paiseValue : null;
  if ((hasRupees && rupees === null) || (hasPaise && paise === null)
      || (rupees !== null && (!Number.isFinite(rupees) || (!allowNegative && rupees < 0)))
      || (paise !== null && (!Number.isSafeInteger(paise) || (!allowNegative && paise < 0)))) {
    throw new MoneyIntegrityError(paiseField);
  }
  const scaled = rupees === null ? null : rupees * 100;
  const derivedPaise = scaled === null ? null : Math.round(scaled);
  if (scaled !== null && derivedPaise !== null
      && (!Number.isSafeInteger(derivedPaise) || Math.abs(scaled - derivedPaise) > 1e-8)) {
    throw new MoneyIntegrityError(paiseField);
  }
  if (paise !== null && derivedPaise !== null && paise !== derivedPaise) {
    throw new MoneyIntegrityError(paiseField);
  }
  return paise ?? derivedPaise;
}
