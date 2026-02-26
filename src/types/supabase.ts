/**
 * Типы для новых таблиц Supabase: new_polzovateli, new_scheta, new_tranzakcii.
 */

// ── new_polzovateli ──────────────────────────────────────────
export interface NewPolzovateli {
    id: string;                    // TEXT, формат YYMMDD-XXXXXX
    auth_user_id: string;          // UUID из auth.users
    imya: string | null;           // Имя
    familiya: string | null;       // Фамилия
    nomer_telefona: string | null; // Телефон в формате +7XXXXXXXXXX
    created_at?: string;           // timestamp
}

export type NewPolzovateliInsert = Pick<
    NewPolzovateli,
    'id' | 'auth_user_id' | 'imya' | 'familiya' | 'nomer_telefona'
>;

export type NewPolzovateliUpdate = Partial<
    Pick<NewPolzovateli, 'imya' | 'familiya' | 'nomer_telefona' | 'auth_user_id'>
>;

// ── new_scheta ───────────────────────────────────────────────
export interface NewScheta {
    id: string;              // TEXT, формат YYMMDD-XXXXXX-BANK
    vladilec_id: string;     // TEXT → ссылка на new_polzovateli.id
    nazvanie_banka: string;  // 'Kaspi Bank' | 'Halyk Bank' | 'BCC Bank'
    balans: number;          // numeric, баланс в тенге
    created_at?: string;
}

export type NewSchetaInsert = Pick<
    NewScheta,
    'id' | 'vladilec_id' | 'nazvanie_banka' | 'balans'
>;

export type NewSchetaUpdate = Partial<Pick<NewScheta, 'balans'>>;

// ── new_tranzakcii ───────────────────────────────────────────
export interface NewTranzakcii {
    id?: string;              // uuid, auto-generated
    vladilec_id: string;      // TEXT → владелец записи (profile id)
    tip?: 'plus' | 'minus' | null;
    amount: number;           // сумма
    clean_amount?: number;    // чистая сумма перевода (без комиссии)
    description?: string | null;
    category?: string | null;
    counterparty?: string | null;
    commission?: number;
    bank?: string | null;     // название банка, из которого операция
    sender_iin?: string | null;
    sender_bank?: string | null;
    recipient_iin?: string | null;
    recipient_bank?: string | null;
    balance_after?: number | null;
    type?: 'income' | 'expense' | null;
    date: string;             // ISO timestamp
}

export type NewTranzakciiInsert = Omit<NewTranzakcii, 'id'>;
