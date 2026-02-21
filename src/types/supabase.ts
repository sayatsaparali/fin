/**
 * Типы для новых таблиц Supabase: new_polzovateli, new_scheta, new_tranzakcii.
 */

// ── new_polzovateli ──────────────────────────────────────────
export interface NewPolzovateli {
    id: string;                    // TEXT, формат YYMMDD-XXXXXX
    auth_user_id: string;          // UUID из auth.users → TEXT
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
    user_id: string;          // TEXT → ссылка на new_polzovateli.id
    amount: number;           // сумма
    description?: string | null;
    category?: string | null;
    counterparty?: string | null;
    commission?: number;
    bank?: string | null;     // название банка, из которого операция
    type: 'income' | 'expense';
    date: string;             // ISO timestamp
}

export type NewTranzakciiInsert = Omit<NewTranzakcii, 'id'>;
