'use client';

import { Check, ChevronDown, Loader2, Plus, RotateCcw, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import {
  useCallback, useEffect, useId, useMemo, useRef, useState,
} from 'react';

export type Phytocannabinoid = {
  id: string;
  name: string;
  fullName: string | null;
  isDefault?: boolean;
};

export type PhytocannabinoidTag = {
  id?: string;
  name: string;
  fullName?: string | null;
};

type Position = {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
};

type Props = {
  value: PhytocannabinoidTag[];
  onChange: (value: PhytocannabinoidTag[]) => void;
  options: Phytocannabinoid[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  disabled?: boolean;
};

const normalize = (term: string) => term.normalize('NFC').trim().replace(/\s+/gu, ' ').toLowerCase();
const MAX_TAGS = 30;

export function PhytocannabinoidPicker({
  value, onChange, options, loading, error, onRetry, disabled = false,
}: Props) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState<Position | null>(null);

  const query = normalize(search);
  const filtered = useMemo(() => options.filter(item =>
    normalize(item.name).includes(query) ||
    (item.fullName ? normalize(item.fullName).includes(query) : false)
  ), [options, query]);

  const matchesSelection = (item: PhytocannabinoidTag, selected: PhytocannabinoidTag) =>
    (item.id && selected.id && item.id === selected.id) ||
    normalize(item.name) === normalize(selected.name);

  const canCreate = !loading && !error && value.length < MAX_TAGS &&
    query.length > 0 && search.trim().length <= 80 &&
    !options.some(item => normalize(item.name) === query || (item.fullName && normalize(item.fullName) === query)) &&
    !value.some(item => normalize(item.name) === query);

  const movePosition = useCallback(() => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;
    const below = window.innerHeight - rect.bottom;
    const above = rect.top;
    const upwards = below < 245 && above > below;
    const width = Math.min(rect.width, window.innerWidth - 24);
    setPosition({
      left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
      width,
      top: upwards ? undefined : rect.bottom + 6,
      bottom: upwards ? window.innerHeight - rect.top + 6 : undefined,
      maxHeight: Math.max(110, Math.min(300, (upwards ? above : below) - 18)),
    });
  }, []);

  useEffect(() => { setActiveIndex(0); }, [query]);

  useEffect(() => {
    if (!open) return;
    movePosition();
    const onOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !popupRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onOutside);
    window.addEventListener('resize', movePosition);
    window.addEventListener('scroll', movePosition, true);
    return () => {
      document.removeEventListener('pointerdown', onOutside);
      window.removeEventListener('resize', movePosition);
      window.removeEventListener('scroll', movePosition, true);
    };
  }, [open, movePosition]);

  const select = (tag: PhytocannabinoidTag) => {
    if (disabled || value.length >= MAX_TAGS) return;
    if (!value.some(item => matchesSelection(item, tag))) onChange([...value, tag]);
    setSearch('');
    setActiveIndex(0);
    setOpen(true);
    inputRef.current?.focus();
  };

  const create = () => {
    const name = search.normalize('NFC').trim().replace(/\s+/gu, ' ');
    if (canCreate && name) select({ name });
  };

  const remove = (index: number) => {
    if (disabled) return;
    onChange(value.filter((_item, i) => i !== index));
    inputRef.current?.focus();
  };

  const handleKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      return;
    }
    if (event.key === 'Backspace' && !search && value.length) {
      event.preventDefault();
      remove(value.length - 1);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) { setOpen(true); return; }
      const count = filtered.length + (canCreate ? 1 : 0);
      if (count) setActiveIndex(index => (index + (event.key === 'ArrowDown' ? 1 : -1) + count) % count);
    }
    if (event.key === 'Enter' && open) {
      event.preventDefault();
      if (activeIndex < filtered.length) select(filtered[activeIndex]);
      else if (canCreate) create();
    }
  };

  const popup = open && position && !disabled && (
    <div
      ref={popupRef}
      id={id + '-list'}
      role="listbox"
      aria-label="Fitocanabinoides disponíveis"
      style={{
        position: 'fixed', left: position.left, width: position.width,
        top: position.top, bottom: position.bottom, maxHeight: position.maxHeight,
      }}
      className="z-[70] overflow-y-auto overscroll-contain rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl"
      onMouseDown={event => event.preventDefault()}
    >
      {loading ? (
        <div role="status" className="flex items-center gap-2 px-3 py-4 text-sm text-gray-500">
          <Loader2 size={16} className="animate-spin" /> Carregando opções...
        </div>
      ) : error ? (
        <div className="space-y-2 px-3 py-3 text-sm">
          <p role="alert" className="text-red-600">Não foi possível carregar os fitocanabinoides.</p>
          <button type="button" onClick={onRetry} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-blue-700 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2">
            <RotateCcw size={14} /> Tentar novamente
          </button>
        </div>
      ) : (
        <>
          {filtered.map((item, index) => {
            const selected = value.some(tag => matchesSelection(item, tag));
            return (
              <button
                id={id + '-option-' + index}
                role="option"
                aria-selected={selected}
                type="button"
                key={item.id}
                onClick={() => select(item)}
                onMouseEnter={() => setActiveIndex(index)}
                className={`flex min-h-[40px] w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${index === activeIndex ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
              >
                <span className="min-w-0">
                  <span className="font-medium text-gray-900">{item.name}</span>
                  {item.fullName && <span className="ml-2 text-xs text-gray-500">{item.fullName}</span>}
                </span>
                {selected && <Check aria-hidden size={16} className="shrink-0 text-blue-600" />}
              </button>
            );
          })}
          {canCreate && (
            <button
              id={id + '-option-' + filtered.length}
              role="option"
              aria-selected={false}
              type="button"
              onClick={create}
              onMouseEnter={() => setActiveIndex(filtered.length)}
              className={`flex min-h-[42px] w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-blue-700 ${activeIndex === filtered.length ? 'bg-blue-50' : 'hover:bg-blue-50'}`}
            >
              <Plus aria-hidden size={16} /> Adicionar &quot;{search.trim()}&quot;
            </button>
          )}
          {!filtered.length && !canCreate && (
            <div className="px-3 py-4 text-sm text-gray-500">
              {query.length > 80 ? 'Nome muito longo (máximo de 80 caracteres).' :
                query ? 'Nenhuma opção correspondente.' : 'Nenhum fitocanabinoide cadastrado.'}
            </div>
          )}
          {value.length >= MAX_TAGS && (
            <div className="border-t px-3 py-2 text-xs text-amber-700">Limite de 30 fitocanabinoides por produto.</div>
          )}
        </>
      )}
    </div>
  );

  return (
    <div className="min-w-0">
      <label htmlFor={id + '-input'} className="mb-1 block text-sm font-medium text-gray-700">
        Fitocanabinoides <span className="font-normal text-gray-400">(opcional)</span>
      </label>
      <p className="mb-2 text-xs text-gray-500">
        Selecione os fitocanabinoides presentes no produto ou adicione um novo.
      </p>
      <div
        ref={rootRef}
        className={`flex min-h-[44px] w-full min-w-0 flex-wrap items-center gap-2 rounded-lg border bg-white px-2.5 py-2 transition-colors focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100 ${error ? 'border-amber-300' : 'border-gray-300'}`}
        onClick={() => { if (!disabled) { setOpen(true); inputRef.current?.focus(); } }}
      >
        {value.map((item, index) => (
          <span
            key={item.id || normalize(item.name)}
            className="inline-flex max-w-full items-center gap-1 rounded-md border border-blue-100 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-800"
          >
            <span className="min-w-0 break-all">{item.name}</span>
            <button
              type="button"
              disabled={disabled}
              aria-label={`Remover ${item.name}`}
              onClick={event => { event.stopPropagation(); remove(index); }}
              className="shrink-0 rounded p-0.5 hover:bg-blue-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
            >
              <X aria-hidden size={13} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={id + '-input'}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={id + '-list'}
          aria-activedescendant={open && (activeIndex < filtered.length || canCreate) ? id + '-option-' + activeIndex : undefined}
          value={search}
          maxLength={80}
          disabled={disabled || value.length >= MAX_TAGS}
          onFocus={() => setOpen(true)}
          onChange={event => { setSearch(event.target.value); setOpen(true); }}
          onKeyDown={handleKey}
          placeholder={value.length ? 'Adicionar mais...' : 'Buscar CBD, CBG, THC...'}
          className="min-w-[120px] flex-1 bg-transparent py-0.5 text-sm text-gray-800 outline-none placeholder:text-gray-400 disabled:opacity-50"
        />
        <ChevronDown aria-hidden size={16} className="shrink-0 text-gray-400" />
      </div>
      <p aria-live="polite" className="mt-1 text-xs text-gray-400">
        {value.length} de {MAX_TAGS} selecionados
      </p>
      {typeof document !== 'undefined' && popup && createPortal(popup, document.body)}
    </div>
  );
}
