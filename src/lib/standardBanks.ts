export const STANDARD_BANK_NAMES = ['Kaspi', 'Halyk Bank', 'BCC'] as const;

export type StandardBankName = (typeof STANDARD_BANK_NAMES)[number];

export const STANDARD_BANK_BALANCES: Record<StandardBankName, number> = {
  Kaspi: 50000,
  'Halyk Bank': 75000,
  BCC: 0
};

export const normalizeToStandardBankName = (
  value: string | null | undefined
): StandardBankName | null => {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return null;

  if (normalized.includes('kaspi')) return 'Kaspi';
  if (normalized.includes('halyk')) return 'Halyk Bank';
  if (
    normalized === 'bcc' ||
    normalized.includes('центркредит') ||
    normalized.includes('centercredit')
  ) {
    return 'BCC';
  }

  return null;
};
