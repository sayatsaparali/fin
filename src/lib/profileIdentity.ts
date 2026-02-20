import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeToStandardBankName, type StandardBankName } from './standardBanks';

export const PROFILE_ID_REGEX = /^\d{6}-\d{6}$/;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const BANK_CODE_BY_NAME: Record<StandardBankName, string> = {
  'Kaspi Bank': 'KASPI',
  'Halyk Bank': 'HALYK',
  'BCC Bank': 'BCC'
};

const toTwoDigits = (value: number) => String(value).padStart(2, '0');

const isMissingColumnError = (error: unknown, columnName: string) => {
  const code = String((error as { code?: string } | null)?.code ?? '');
  const message = String((error as { message?: string } | null)?.message ?? '').toLowerCase();
  return code === '42703' || message.includes(`column "${columnName.toLowerCase()}"`);
};

const randomInt = (maxExclusive: number) => {
  if (maxExclusive <= 0) return 0;
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return arr[0] % maxExclusive;
  }
  return Math.floor(Math.random() * maxExclusive);
};

const normalizeBirthDateInput = (birthDate: string) => {
  const parsed = new Date(birthDate);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Некорректная дата рождения для генерации ID профиля.');
  }
  return parsed;
};

export const buildProfileIdPrefix = (birthDate: string) => {
  const parsed = normalizeBirthDateInput(birthDate);
  const yy = toTwoDigits(parsed.getFullYear() % 100);
  const mm = toTwoDigits(parsed.getMonth() + 1);
  const dd = toTwoDigits(parsed.getDate());
  return `${yy}${mm}${dd}`;
};

export const createDeterministicProfileId = (birthDate: string) => {
  const prefix = buildProfileIdPrefix(birthDate);
  const suffix = String(randomInt(1_000_000)).padStart(6, '0');
  return `${prefix}-${suffix}`;
};

export const isDeterministicProfileId = (value: string | null | undefined) =>
  PROFILE_ID_REGEX.test(String(value ?? '').trim());

export const buildDeterministicAccountId = (
  profileId: string,
  bankName: StandardBankName | string
) => {
  const normalizedBankName = normalizeToStandardBankName(bankName);
  const bankCode = normalizedBankName
    ? BANK_CODE_BY_NAME[normalizedBankName]
    : String(bankName ?? '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'BANK';
  return `${profileId}-${bankCode}`;
};

export const extractProfileIdFromAccountId = (accountId: string | null | undefined) => {
  const normalized = String(accountId ?? '').trim();
  if (!normalized) return null;

  const strictMatch = normalized.match(/^(\d{6}-\d{6})-[A-Z0-9_]+$/i);
  if (strictMatch?.[1]) {
    return strictMatch[1];
  }

  const parts = normalized.split('-');
  if (parts.length >= 3) {
    const candidate = `${parts[0]}-${parts[1]}`;
    return PROFILE_ID_REGEX.test(candidate) ? candidate : null;
  }

  return null;
};

export type ResolvedProfileIdentity = {
  id: string;
  authUserId: string | null;
};

export const resolveProfileByAuthUserId = async (
  supabase: SupabaseClient,
  authUserId: string
): Promise<ResolvedProfileIdentity | null> => {
  const { data: byAuthUserId, error: byAuthUserIdError } = await supabase
    .from('profiles')
    .select('id, auth_user_id')
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (!byAuthUserIdError && byAuthUserId) {
    return {
      id: String((byAuthUserId as { id?: string }).id ?? ''),
      authUserId: String((byAuthUserId as { auth_user_id?: string | null }).auth_user_id ?? authUserId)
    };
  }

  if (byAuthUserIdError && !isMissingColumnError(byAuthUserIdError, 'auth_user_id')) {
    throw byAuthUserIdError;
  }

  const { data: byLegacyId, error: byLegacyIdError } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', authUserId)
    .maybeSingle();

  if (byLegacyIdError) {
    throw byLegacyIdError;
  }

  if (byLegacyId?.id) {
    return { id: String(byLegacyId.id), authUserId };
  }

  return null;
};

export const resolveRequiredProfileIdByAuthUserId = async (
  supabase: SupabaseClient,
  authUserId: string
) => {
  const resolved = await resolveProfileByAuthUserId(supabase, authUserId);
  if (!resolved?.id) {
    throw new Error('Профиль пользователя не найден.');
  }
  return resolved.id;
};

export const findProfileByAccountId = async (
  supabase: SupabaseClient,
  accountId: string
): Promise<ResolvedProfileIdentity | null> => {
  const profileId = extractProfileIdFromAccountId(accountId);
  if (!profileId) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, auth_user_id')
    .eq('id', profileId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data?.id) return null;

  return {
    id: String((data as { id?: string }).id ?? ''),
    authUserId: String((data as { auth_user_id?: string | null }).auth_user_id ?? '')
  };
};

export const generateUniqueDeterministicProfileId = async (
  supabase: SupabaseClient,
  birthDate: string,
  maxAttempts = 30
) => {
  const tried = new Set<string>();

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = createDeterministicProfileId(birthDate);
    if (tried.has(candidate)) continue;
    tried.add(candidate);

    const { data: existing, error: existingError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', candidate)
      .maybeSingle();

    if (existingError) {
      const code = String((existingError as { code?: string } | null)?.code ?? '');
      if (code === '22P02') {
        throw new Error(
          'Колонка profiles.id имеет тип uuid. Для архитектуры ИИН переведите profiles.id в text через SQL миграцию.'
        );
      }
      throw existingError;
    }

    if (!existing?.id) {
      return candidate;
    }
  }

  throw new Error('Не удалось сгенерировать уникальный ID профиля.');
};

export const isUuidLike = (value: string | null | undefined) =>
  UUID_REGEX.test(String(value ?? '').trim());
