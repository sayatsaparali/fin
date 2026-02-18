import { getSupabaseClient } from './supabaseClient';

export type FavoriteCategory = 'phone' | 'card' | 'own';

export type FavoriteContact = {
  id: string;
  user_id: string;
  name: string;
  phone_number: string;
  bank_name: string;
  avatar_url: string | null;
  category: FavoriteCategory;
};

type FavoriteRow = {
  id: string;
  user_id: string;
  name: string;
  phone_number: string;
  bank_name: string;
  avatar_url: string | null;
  category: string;
};

export type NewFavoriteContactInput = {
  name: string;
  phone_number: string;
  bank_name: string;
  avatar_url?: string | null;
  category: FavoriteCategory;
};

const mapFavorite = (row: FavoriteRow): FavoriteContact => ({
  id: String(row.id),
  user_id: String(row.user_id),
  name: String(row.name ?? 'Контакт'),
  phone_number: String(row.phone_number ?? ''),
  bank_name: String(row.bank_name ?? ''),
  avatar_url: row.avatar_url ? String(row.avatar_url) : null,
  category: row.category === 'card' || row.category === 'own' ? row.category : 'phone'
});

export const fetchFavoriteContacts = async (): Promise<FavoriteContact[]> => {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw userError ?? new Error('Пользователь не найден.');
  }

  const { data, error } = await supabase
    .from('favorites')
    .select('id, user_id, name, phone_number, bank_name, avatar_url, category')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => mapFavorite(row as FavoriteRow));
};

export const addFavoriteContact = async (payload: NewFavoriteContactInput): Promise<FavoriteContact> => {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase не настроен.');
  }

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw userError ?? new Error('Пользователь не найден.');
  }

  const { data, error } = await supabase
    .from('favorites')
    .insert({
      user_id: user.id,
      name: payload.name,
      phone_number: payload.phone_number,
      bank_name: payload.bank_name,
      avatar_url: payload.avatar_url ?? null,
      category: payload.category
    })
    .select('id, user_id, name, phone_number, bank_name, avatar_url, category')
    .single();

  if (error || !data) {
    throw error ?? new Error('Не удалось добавить контакт.');
  }

  return mapFavorite(data as FavoriteRow);
};

export const removeFavoriteContact = async (favoriteId: string): Promise<void> => {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase не настроен.');
  }

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw userError ?? new Error('Пользователь не найден.');
  }

  const { error } = await supabase
    .from('favorites')
    .delete()
    .eq('id', favoriteId)
    .eq('user_id', user.id);

  if (error) {
    throw error;
  }
};
