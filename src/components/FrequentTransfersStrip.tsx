import { motion } from 'framer-motion';
import { Plus, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { getBankMeta } from '../lib/banks';
import { type FavoriteContact } from '../lib/favoritesApi';

type FrequentTransfersStripProps = {
  title?: string;
  favorites: FavoriteContact[];
  loading?: boolean;
  onSelect: (favorite: FavoriteContact) => void;
  onAdd: () => void;
  onDelete: (favorite: FavoriteContact) => void;
};

const getInitials = (name: string) => {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
  }

  return (parts[0]?.slice(0, 2) ?? 'F').toUpperCase();
};

const FrequentTransfersStrip = ({
  title = 'Частые переводы',
  favorites,
  loading = false,
  onSelect,
  onAdd,
  onDelete
}: FrequentTransfersStripProps) => {
  const [isEditMode, setIsEditMode] = useState(false);
  const longPressRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);

  const clearLongPress = () => {
    if (longPressRef.current) {
      window.clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  };

  const handlePointerDown = (favorite: FavoriteContact) => {
    clearLongPress();
    longPressTriggeredRef.current = false;
    longPressRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      const confirmed = window.confirm(`Удалить контакт «${favorite.name}» из избранного?`);
      if (confirmed) {
        onDelete(favorite);
      }
      clearLongPress();
    }, 650);
  };

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{title}</p>
        <button
          type="button"
          onClick={() => setIsEditMode((prev) => !prev)}
          className="text-[11px] text-slate-400 transition hover:text-slate-200"
        >
          {isEditMode ? 'Готово' : 'Изменить'}
        </button>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex gap-3 overflow-x-auto pb-1"
      >
        <button
          type="button"
          onClick={onAdd}
          className="flex min-w-[68px] flex-col items-center gap-1.5 rounded-2xl border border-dashed border-emerald-400/50 bg-emerald-500/10 px-2 py-2.5 text-[11px] text-emerald-200 transition hover:bg-emerald-500/15"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500/20">
            <Plus size={17} />
          </span>
          <span>Добавить</span>
        </button>

        {favorites.map((favorite) => {
          const bankMeta = getBankMeta(favorite.bank_name);

          return (
            <motion.button
              key={favorite.id}
              type="button"
              layout
              whileTap={{ scale: 0.96 }}
              onPointerDown={() => handlePointerDown(favorite)}
              onPointerUp={clearLongPress}
              onPointerLeave={clearLongPress}
              onPointerCancel={clearLongPress}
              onClick={() => {
                if (longPressTriggeredRef.current) {
                  longPressTriggeredRef.current = false;
                  return;
                }
                onSelect(favorite);
              }}
              className="relative flex min-w-[68px] flex-col items-center gap-1.5 rounded-2xl px-1 py-2 text-[11px] text-slate-200 transition hover:bg-slate-800/50"
            >
              {isEditMode && (
                <span
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onDelete(favorite);
                  }}
                  className="absolute right-1 top-1 z-10 inline-flex h-5 w-5 items-center justify-center rounded-full bg-rose-500/90 text-rose-50"
                >
                  <X size={11} />
                </span>
              )}
              <span className="relative">
                {favorite.avatar_url ? (
                  <img
                    src={favorite.avatar_url}
                    alt={favorite.name}
                    className="h-12 w-12 rounded-full object-cover ring-1 ring-slate-700"
                  />
                ) : (
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold ring-1 ring-slate-700">
                    {getInitials(favorite.name)}
                  </span>
                )}
                <span
                  className={`absolute -bottom-0.5 -right-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ring-2 ring-slate-950 ${bankMeta.badgeTone}`}
                >
                  {bankMeta.logo}
                </span>
              </span>
              <span className="max-w-[68px] truncate">{favorite.name}</span>
            </motion.button>
          );
        })}

        {!loading && favorites.length === 0 && (
          <div className="flex min-h-[84px] items-center rounded-2xl border border-slate-700/70 bg-slate-900/40 px-3 text-xs text-slate-400">
            Пока нет избранных контактов
          </div>
        )}
      </motion.div>
    </section>
  );
};

export default FrequentTransfersStrip;
