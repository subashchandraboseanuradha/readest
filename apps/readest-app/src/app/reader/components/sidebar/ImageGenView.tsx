'use client';

import clsx from 'clsx';
import dayjs from 'dayjs';
import React, { useCallback, useMemo, useState } from 'react';
import { MdOutlineImage, MdDownload, MdDeleteOutline } from 'react-icons/md';
import { LuSparkles } from 'react-icons/lu';

import { useTranslation } from '@/hooks/useTranslation';
import { useBookDataStore } from '@/store/bookDataStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useImageGenStore, type ImageGenItem } from '@/store/imageGenStore';
import { useReaderStore } from '@/store/readerStore';
import { DEFAULT_AI_SETTINGS } from '@/services/ai/constants';
import { generateImageFromCitation } from '@/services/ai/imageGeneration';
import { eventDispatcher } from '@/utils/event';

interface ImageGenViewProps {
  bookKey: string;
}

// Stable empty list — `?? []` in a zustand selector creates a new array every
// read and triggers Maximum update depth exceeded.
const EMPTY_ITEMS: ImageGenItem[] = [];

const ImageGenView: React.FC<ImageGenViewProps> = ({ bookKey }) => {
  const _ = useTranslation();
  const { getBookData } = useBookDataStore();
  const { settings, setSettingsDialogOpen, setActiveSettingsItemId } = useSettingsStore();
  const { getView } = useReaderStore();

  const bookHash = bookKey.split('-')[0] || '';
  const bookData = getBookData(bookKey);
  const bookTitle = bookData?.book?.title;
  const author = bookData?.book?.author;

  const items = useImageGenStore((s) => s.itemsByBook[bookHash] ?? EMPTY_ITEMS);
  const selectedId = useImageGenStore((s) => s.selectedIdByBook[bookHash] ?? null);
  const loading = useImageGenStore((s) => !!s.loadingByBook[bookHash]);
  const stage = useImageGenStore((s) => s.stageByBook[bookHash] ?? null);
  const error = useImageGenStore((s) => s.errorByBook[bookHash] ?? null);
  const selectItem = useImageGenStore((s) => s.selectItem);
  const removeItem = useImageGenStore((s) => s.removeItem);
  const addItem = useImageGenStore((s) => s.addItem);
  const setLoading = useImageGenStore((s) => s.setLoading);
  const setStage = useImageGenStore((s) => s.setStage);
  const setError = useImageGenStore((s) => s.setError);

  const [draftText, setDraftText] = useState('');

  const selected = useMemo(
    () => items.find((i) => i.id === selectedId) ?? items[0] ?? null,
    [items, selectedId],
  );

  const aiEnabled = settings?.aiSettings?.enabled ?? false;
  // Dual-key: Cerebras/chat key OR OpenRouter embed key (for Illustrate pixels)
  const hasKey = !!(
    settings?.aiSettings?.openrouterApiKey ||
    settings?.aiSettings?.embeddingApiKey ||
    settings?.aiSettings?.aiGatewayApiKey ||
    process.env['NEXT_PUBLIC_AI_GATEWAY_API_KEY']
  );

  const openAiSettings = () => {
    setActiveSettingsItemId('settings.AI');
    setSettingsDialogOpen(true);
  };

  const runGenerate = useCallback(
    async (text: string, cfi?: string) => {
      const quote = text.trim();
      if (!quote) return;
      if (!aiEnabled || !hasKey) {
        setError(bookHash, _('Configure AI keys in Settings → AI first.'));
        openAiSettings();
        return;
      }
      setLoading(bookHash, true);
      setStage(bookHash, 'crafting');
      setError(bookHash, null);
      try {
        const result = await generateImageFromCitation({
          selectionText: quote,
          bookTitle,
          author,
          settings: settings.aiSettings ?? DEFAULT_AI_SETTINGS,
          onStage: (s) => setStage(bookHash, s),
        });
        addItem(bookHash, result, cfi);
      } catch (e) {
        setError(bookHash, e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(bookHash, false);
        setStage(bookHash, null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [aiEnabled, hasKey, bookHash, bookTitle, author, settings.aiSettings, _, addItem],
  );

  const handleGenerateFromDraft = () => {
    void runGenerate(draftText);
    setDraftText('');
  };

  const handleUseSelection = () => {
    const view = getView(bookKey);
    const sel = view?.renderer?.getContents?.()?.[0]?.doc?.getSelection?.();
    // Prefer app-level selection via range in renderer is hard; use window selection
    // inside the focused book iframe when available.
    let text = '';
    try {
      const contents = view?.renderer?.getContents?.() as { doc?: Document }[] | undefined;
      for (const c of contents ?? []) {
        const t = c.doc?.getSelection?.()?.toString()?.trim();
        if (t) {
          text = t;
          break;
        }
      }
    } catch {
      /* ignore */
    }
    if (!text) {
      eventDispatcher.dispatch('toast', {
        type: 'info',
        message: _('Select a sentence in the book first, or paste text below.'),
        timeout: 3000,
      });
      return;
    }
    void runGenerate(text);
  };

  const handleDownload = (item: ImageGenItem) => {
    const a = document.createElement('a');
    a.href = item.src;
    a.download = `readest-illustration-${item.id}.png`;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.click();
  };

  const stageLabel =
    stage === 'crafting'
      ? _('Crafting image prompt…')
      : stage === 'generating'
        ? _('Generating illustration…')
        : null;

  return (
    <div className='flex h-full min-h-0 flex-col'>
      <div className='border-base-300/50 flex flex-shrink-0 flex-col gap-2 border-b px-3 py-3'>
        <div className='flex items-center gap-2'>
          <LuSparkles className='text-primary shrink-0' size={18} />
          <div className='min-w-0'>
            <h3 className='text-sm font-semibold'>{_('Image studio')}</h3>
            <p className='text-base-content/60 text-xs'>
              {_('Cite a line → craft prompt → generate illustration')}
            </p>
          </div>
        </div>

        {(!aiEnabled || !hasKey) && (
          <button
            type='button'
            className='btn btn-outline btn-sm h-8 min-h-0 w-full justify-start text-xs'
            onClick={openAiSettings}
          >
            {_('Enable AI & add API key')}
          </button>
        )}

        <textarea
          className='textarea textarea-bordered textarea-sm min-h-[4.5rem] w-full resize-y text-xs leading-relaxed'
          placeholder={_('Paste or type a passage to illustrate…')}
          value={draftText}
          onChange={(e) => setDraftText(e.target.value)}
          disabled={loading || !aiEnabled}
        />
        <div className='flex gap-2'>
          <button
            type='button'
            className='btn btn-ghost btn-sm h-8 min-h-0 flex-1 text-xs'
            onClick={handleUseSelection}
            disabled={loading || !aiEnabled}
          >
            {_('Use book selection')}
          </button>
          <button
            type='button'
            className='btn btn-primary btn-sm h-8 min-h-0 flex-1 gap-1 text-xs'
            onClick={handleGenerateFromDraft}
            disabled={loading || !aiEnabled || !draftText.trim()}
          >
            <MdOutlineImage size={16} />
            {_('Generate')}
          </button>
        </div>

        {loading && (
          <div className='bg-base-100 flex items-center gap-2 rounded-lg px-3 py-2 text-xs'>
            <span className='loading loading-spinner loading-xs text-primary' />
            <span className='text-base-content/70'>{stageLabel}</span>
          </div>
        )}
        {error && !loading && (
          <p className='text-error bg-error/10 rounded-lg px-3 py-2 text-xs'>{error}</p>
        )}
      </div>

      <div className='flex min-h-0 flex-1 flex-col overflow-hidden'>
        {items.length === 0 && !loading ? (
          <div className='text-base-content/55 flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center'>
            <MdOutlineImage className='opacity-40' size={56} />
            <p className='text-sm font-semibold text-base-content'>{_('No illustrations yet')}</p>
            <p className='text-xs leading-relaxed'>
              {_(
                'Select a sentence in the book and choose Illustrate, or paste text above to generate.',
              )}
            </p>
          </div>
        ) : (
          <>
            {selected && (
              <div className='border-base-300/50 min-h-0 flex-1 overflow-y-auto border-b px-3 py-3'>
                <blockquote className='border-primary/40 bg-base-100 mb-2 rounded-md border-s-4 px-2 py-1.5 text-xs italic leading-relaxed'>
                  “{selected.citation}”
                </blockquote>
                <details className='mb-2'>
                  <summary className='text-base-content/50 cursor-pointer text-[10px] font-semibold uppercase tracking-wide'>
                    {_('Crafted prompt')}
                  </summary>
                  <p className='text-base-content/70 mt-1 text-[11px] leading-relaxed'>
                    {selected.prompt}
                  </p>
                </details>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={selected.src}
                  alt={_('Illustration')}
                  className='bg-base-100 max-h-64 w-full rounded-lg object-contain'
                />
                <div className='mt-2 flex items-center justify-between gap-2'>
                  <span className='text-base-content/45 truncate text-[10px]'>
                    {dayjs(selected.createdAt).format('MMM D, HH:mm')}
                    {selected.promptModel
                      ? ` · ${selected.promptModel.split('/').pop()}`
                      : ''}
                    {` · ${selected.model.split('/').pop()}`}
                  </span>
                  <div className='flex shrink-0 gap-1'>
                    <button
                      type='button'
                      className='btn btn-ghost btn-xs h-7 min-h-0 px-2'
                      aria-label={_('Download')}
                      onClick={() => handleDownload(selected)}
                    >
                      <MdDownload size={16} />
                    </button>
                    <button
                      type='button'
                      className='btn btn-ghost btn-xs h-7 min-h-0 px-2'
                      aria-label={_('Delete')}
                      onClick={() => removeItem(bookHash, selected.id)}
                    >
                      <MdDeleteOutline size={16} />
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className='max-h-40 flex-shrink-0 overflow-y-auto px-2 py-2'>
              <p className='text-base-content/50 mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wide'>
                {_('History')}
              </p>
              <ul className='flex flex-col gap-1'>
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      type='button'
                      onClick={() => selectItem(bookHash, item.id)}
                      className={clsx(
                        'hover:bg-base-300/60 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start transition-colors',
                        selected?.id === item.id && 'bg-base-300/85',
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.src}
                        alt=''
                        className='bg-base-100 h-9 w-9 shrink-0 rounded object-cover'
                      />
                      <span className='line-clamp-2 min-w-0 flex-1 text-[11px] leading-snug'>
                        {item.citation}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ImageGenView;
