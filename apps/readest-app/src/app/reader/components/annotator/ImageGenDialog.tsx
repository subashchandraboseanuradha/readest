'use client';

import React from 'react';
import { MdClose, MdDownload } from 'react-icons/md';
import { useTranslation } from '@/hooks/useTranslation';
import type { GeneratedImage, ImageGenStage } from '@/services/ai/imageGeneration';

type ImageGenDialogProps = {
  open: boolean;
  loading: boolean;
  stage: ImageGenStage | null;
  error: string | null;
  result: GeneratedImage | null;
  onClose: () => void;
  onRetry?: () => void;
};

const ImageGenDialog: React.FC<ImageGenDialogProps> = ({
  open,
  loading,
  stage,
  error,
  result,
  onClose,
  onRetry,
}) => {
  const _ = useTranslation();
  if (!open) return null;

  const stageLabel =
    stage === 'crafting'
      ? _('Crafting image prompt from selection…')
      : stage === 'generating'
        ? _('Generating illustration…')
        : _('Working…');

  const handleDownload = () => {
    if (!result?.src) return;
    const a = document.createElement('a');
    a.href = result.src;
    a.download = `readest-illustration-${Date.now()}.png`;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.click();
  };

  return (
    <div
      className='fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4'
      role='dialog'
      aria-modal='true'
      aria-label={_('Generated illustration')}
      onClick={onClose}
    >
      <div
        className='bg-base-100 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl shadow-2xl'
        onClick={(e) => e.stopPropagation()}
      >
        <div className='border-base-300 flex items-center justify-between border-b px-4 py-3'>
          <h2 className='text-base font-semibold'>{_('Illustrate selection')}</h2>
          <button
            type='button'
            className='btn btn-ghost btn-circle btn-sm'
            aria-label={_('Close')}
            onClick={onClose}
          >
            <MdClose size={20} />
          </button>
        </div>

        <div className='flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4'>
          {loading && (
            <div className='flex flex-col items-center justify-center gap-3 py-16'>
              <span className='loading loading-spinner loading-lg text-primary' />
              <p className='text-base-content/70 text-sm'>{stageLabel}</p>
              <ol className='text-base-content/50 list-decimal space-y-1 text-xs'>
                <li className={stage === 'crafting' ? 'text-primary font-medium' : ''}>
                  {_('Expand selected line into a visual prompt')}
                </li>
                <li className={stage === 'generating' ? 'text-primary font-medium' : ''}>
                  {_('Send crafted prompt to the image model')}
                </li>
              </ol>
            </div>
          )}

          {!loading && error && (
            <div className='flex flex-col gap-3 py-6'>
              <p className='text-error text-sm'>{error}</p>
              {onRetry && (
                <button
                  type='button'
                  className='btn btn-primary btn-sm self-start'
                  onClick={onRetry}
                >
                  {_('Retry')}
                </button>
              )}
            </div>
          )}

          {!loading && result && (
            <>
              <blockquote className='border-primary/40 bg-base-200/60 rounded-lg border-s-4 px-3 py-2 text-sm italic leading-relaxed'>
                “{result.citation}”
              </blockquote>

              <div className='bg-base-200/50 rounded-lg px-3 py-2'>
                <p className='text-base-content/50 mb-1 text-xs font-semibold tracking-wide uppercase'>
                  {_('Crafted prompt')}
                </p>
                <p className='text-base-content/80 text-xs leading-relaxed'>{result.prompt}</p>
              </div>

              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={result.src}
                alt={_('Illustration of the selected passage')}
                className='bg-base-200 max-h-[45vh] w-full rounded-xl object-contain'
              />
              <p className='text-base-content/50 text-xs'>
                {result.promptModel
                  ? `${_('Prompt')}: ${result.promptModel} · ${_('Image')}: ${result.model}`
                  : `${_('Model')}: ${result.model}`}
              </p>
            </>
          )}
        </div>

        {!loading && result && (
          <div className='border-base-300 flex justify-end gap-2 border-t px-4 py-3'>
            <button type='button' className='btn btn-ghost btn-sm' onClick={onClose}>
              {_('Close')}
            </button>
            <button type='button' className='btn btn-primary btn-sm gap-1' onClick={handleDownload}>
              <MdDownload size={16} />
              {_('Download')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ImageGenDialog;
