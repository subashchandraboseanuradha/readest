import { create } from 'zustand';
import type { GeneratedImage } from '@/services/ai/imageGeneration';
import { uniqueId } from '@/utils/misc';

export type ImageGenItem = GeneratedImage & {
  id: string;
  bookHash: string;
  createdAt: number;
  cfi?: string;
};

type ImageGenState = {
  /** Illustrations keyed by book hash (session only, no localStorage). */
  itemsByBook: Record<string, ImageGenItem[]>;
  /** Currently selected item id in the workspace (per book). */
  selectedIdByBook: Record<string, string | null>;
  /** In-flight generation for a book (sidebar + dialog share status). */
  loadingByBook: Record<string, boolean>;
  stageByBook: Record<string, 'crafting' | 'generating' | null>;
  errorByBook: Record<string, string | null>;

  addItem: (bookHash: string, image: GeneratedImage, cfi?: string) => ImageGenItem;
  selectItem: (bookHash: string, id: string | null) => void;
  removeItem: (bookHash: string, id: string) => void;
  clearBook: (bookHash: string) => void;
  setLoading: (bookHash: string, loading: boolean) => void;
  setStage: (bookHash: string, stage: 'crafting' | 'generating' | null) => void;
  setError: (bookHash: string, error: string | null) => void;
  getItems: (bookHash: string) => ImageGenItem[];
};

export const useImageGenStore = create<ImageGenState>((set, get) => ({
  itemsByBook: {},
  selectedIdByBook: {},
  loadingByBook: {},
  stageByBook: {},
  errorByBook: {},

  addItem: (bookHash, image, cfi) => {
    const item: ImageGenItem = {
      ...image,
      id: uniqueId(),
      bookHash,
      createdAt: Date.now(),
      cfi,
    };
    set((state) => {
      const prev = state.itemsByBook[bookHash] ?? [];
      return {
        itemsByBook: {
          ...state.itemsByBook,
          [bookHash]: [item, ...prev],
        },
        selectedIdByBook: {
          ...state.selectedIdByBook,
          [bookHash]: item.id,
        },
        errorByBook: {
          ...state.errorByBook,
          [bookHash]: null,
        },
      };
    });
    return item;
  },

  selectItem: (bookHash, id) => {
    set((state) => ({
      selectedIdByBook: { ...state.selectedIdByBook, [bookHash]: id },
    }));
  },

  removeItem: (bookHash, id) => {
    set((state) => {
      const prev = state.itemsByBook[bookHash] ?? [];
      const next = prev.filter((i) => i.id !== id);
      const selected = state.selectedIdByBook[bookHash];
      return {
        itemsByBook: { ...state.itemsByBook, [bookHash]: next },
        selectedIdByBook: {
          ...state.selectedIdByBook,
          [bookHash]: selected === id ? (next[0]?.id ?? null) : selected,
        },
      };
    });
  },

  clearBook: (bookHash) => {
    set((state) => {
      const { [bookHash]: _i, ...itemsRest } = state.itemsByBook;
      const { [bookHash]: _s, ...selRest } = state.selectedIdByBook;
      return {
        itemsByBook: itemsRest,
        selectedIdByBook: selRest,
      };
    });
  },

  setLoading: (bookHash, loading) => {
    set((state) => ({
      loadingByBook: { ...state.loadingByBook, [bookHash]: loading },
    }));
  },

  setStage: (bookHash, stage) => {
    set((state) => ({
      stageByBook: { ...state.stageByBook, [bookHash]: stage },
    }));
  },

  setError: (bookHash, error) => {
    set((state) => ({
      errorByBook: { ...state.errorByBook, [bookHash]: error },
    }));
  },

  getItems: (bookHash) => get().itemsByBook[bookHash] ?? [],
}));
