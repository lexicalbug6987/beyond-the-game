import { create } from "zustand";
import uiContent from "@team-culture-sim/content/ui-content.json";
import { getContent } from "./api";

export interface ContentField {
  key: string;
  label: string;
  value: string;
  multiline?: boolean;
}

export interface ContentPage {
  key: string;
  title: string;
  description?: string;
  fields: ContentField[];
}

export interface ContentDoc {
  pages: ContentPage[];
}

const defaults = uiContent as ContentDoc;

type ContentMap = Record<string, Record<string, string>>;

function buildMap(pages: ContentPage[]): ContentMap {
  const map: ContentMap = {};
  for (const page of pages) {
    map[page.key] = {};
    for (const field of page.fields) {
      map[page.key][field.key] = field.value;
    }
  }
  return map;
}

/** Overlay saved values onto the bundled defaults, keyed by page + field. */
function mergePages(incoming: ContentPage[]): ContentPage[] {
  const savedMap = buildMap(incoming);
  return defaults.pages.map((page) => ({
    ...page,
    fields: page.fields.map((field) => ({
      ...field,
      value: savedMap[page.key]?.[field.key] ?? field.value,
    })),
  }));
}

interface ContentStore {
  pages: ContentPage[];
  map: ContentMap;
  refresh: () => Promise<void>;
  setMerged: (pages: ContentPage[]) => void;
}

export const useContentStore = create<ContentStore>((set) => ({
  pages: defaults.pages,
  map: buildMap(defaults.pages),
  refresh: async () => {
    try {
      const data = await getContent();
      const merged = mergePages(data.pages);
      set({ pages: merged, map: buildMap(merged) });
    } catch {
      // Keep bundled defaults if the server can't be reached.
    }
  },
  setMerged: (pages) => {
    const merged = mergePages(pages);
    set({ pages: merged, map: buildMap(merged) });
  },
}));

/** Returns a lookup function: c("hostSetup", "title"). Falls back to defaults. */
export function useContent(): (page: string, field: string) => string {
  const map = useContentStore((s) => s.map);
  const defaultMap = buildMap(defaults.pages);
  return (page, field) => map[page]?.[field] ?? defaultMap[page]?.[field] ?? "";
}

export { defaults as defaultContent };

// Pull the latest saved copy as soon as the app boots.
useContentStore.getState().refresh();
