export const extractKzPhoneDigits = (input: string | null | undefined): string => {
  let digits = String(input ?? '').replace(/\D/g, '');

  if (digits.startsWith('8')) {
    digits = `7${digits.slice(1)}`;
  }

  if (digits.startsWith('7')) {
    digits = digits.slice(1);
  }

  return digits.slice(0, 10);
};

export const formatKzPhoneFromDigits = (digitsInput: string | null | undefined): string => {
  const digits = extractKzPhoneDigits(digitsInput);
  const p1 = digits.slice(0, 3);
  const p2 = digits.slice(3, 6);
  const p3 = digits.slice(6, 8);
  const p4 = digits.slice(8, 10);

  let result = '+7';
  if (p1) result += ` (${p1}`;
  if (p1.length === 3) result += ')';
  if (p2) result += ` ${p2}`;
  if (p3) result += `-${p3}`;
  if (p4) result += `-${p4}`;

  return result;
};

export const toKzE164Phone = (digitsInput: string | null | undefined): string => {
  return `+7${extractKzPhoneDigits(digitsInput)}`;
};
