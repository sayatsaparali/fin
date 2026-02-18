export type BankId =
  | 'kaspi'
  | 'halyk'
  | 'bcc'
  | 'freedom'
  | 'forte'
  | 'jusan'
  | 'bereke'
  | 'eurasian'
  | 'unknown';

export type BankMeta = {
  id: BankId;
  name: string;
  shortName: string;
  logo: string;
  badgeTone: string;
  cardGradient: string;
};

export const KZ_BANKS: BankMeta[] = [
  {
    id: 'kaspi',
    name: 'Kaspi.kz',
    shortName: 'Kaspi',
    logo: 'K',
    badgeTone: 'bg-rose-500/25 text-rose-200',
    cardGradient: 'from-rose-600/35 via-rose-500/20 to-transparent'
  },
  {
    id: 'halyk',
    name: 'Halyk Bank',
    shortName: 'Halyk',
    logo: 'H',
    badgeTone: 'bg-emerald-500/25 text-emerald-200',
    cardGradient: 'from-emerald-600/35 via-emerald-500/20 to-transparent'
  },
  {
    id: 'bcc',
    name: 'BCC (ЦентрКредит)',
    shortName: 'BCC',
    logo: 'B',
    badgeTone: 'bg-amber-400/25 text-amber-100',
    cardGradient: 'from-amber-500/35 via-yellow-400/20 to-transparent'
  },
  {
    id: 'freedom',
    name: 'Freedom Bank',
    shortName: 'Freedom',
    logo: 'F',
    badgeTone: 'bg-cyan-500/25 text-cyan-200',
    cardGradient: 'from-cyan-500/35 via-sky-500/20 to-transparent'
  },
  {
    id: 'forte',
    name: 'ForteBank',
    shortName: 'Forte',
    logo: 'F',
    badgeTone: 'bg-violet-500/25 text-violet-200',
    cardGradient: 'from-violet-600/35 via-fuchsia-500/20 to-transparent'
  },
  {
    id: 'jusan',
    name: 'Jusan Bank',
    shortName: 'Jusan',
    logo: 'J',
    badgeTone: 'bg-orange-500/25 text-orange-200',
    cardGradient: 'from-orange-500/35 via-amber-500/20 to-transparent'
  },
  {
    id: 'bereke',
    name: 'Bereke Bank',
    shortName: 'Bereke',
    logo: 'B',
    badgeTone: 'bg-lime-500/25 text-lime-200',
    cardGradient: 'from-lime-500/35 via-green-500/20 to-transparent'
  },
  {
    id: 'eurasian',
    name: 'Eurasian Bank',
    shortName: 'Eurasian',
    logo: 'E',
    badgeTone: 'bg-blue-500/25 text-blue-200',
    cardGradient: 'from-blue-500/35 via-cyan-500/20 to-transparent'
  }
];

const UNKNOWN_BANK: BankMeta = {
  id: 'unknown',
  name: 'Неизвестный банк',
  shortName: 'Bank',
  logo: '•',
  badgeTone: 'bg-slate-500/25 text-slate-200',
  cardGradient: 'from-slate-500/35 via-slate-500/10 to-transparent'
};

export const normalizeBankId = (bankName: string | null | undefined): BankId => {
  const value = String(bankName ?? '').toLowerCase();

  if (value.includes('kaspi')) return 'kaspi';
  if (value.includes('halyk')) return 'halyk';
  if (value.includes('bcc') || value.includes('центркредит') || value.includes('centercredit')) {
    return 'bcc';
  }
  if (value.includes('freedom')) return 'freedom';
  if (value.includes('forte')) return 'forte';
  if (value.includes('jusan')) return 'jusan';
  if (value.includes('bereke')) return 'bereke';
  if (value.includes('eurasian')) return 'eurasian';

  return 'unknown';
};

export const getBankMeta = (bankName: string | null | undefined): BankMeta => {
  const id = normalizeBankId(bankName);
  return KZ_BANKS.find((bank) => bank.id === id) ?? UNKNOWN_BANK;
};
