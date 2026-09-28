export const $ = <T extends HTMLElement = HTMLElement>(selector: string, root: ParentNode = document): T | null => root.querySelector<T>(selector);

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (text: string): string => text.replace(/[&<>"']/g, (c) => ESCAPES[c]);

/** Sentence case for decoded pages: "LA LLAMA" → "La llama." */
export const sentence = (text: string): string => {
  const lower = text.toLowerCase();
  return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}${/[.!?]$/.test(lower) ? '' : '.'}`;
};

/** Focusable controls inside the overlay, in document order. */
export const focusables = (root: ParentNode): HTMLElement[] =>
  [...root.querySelectorAll<HTMLElement>('button, input')].filter((el) => !el.hasAttribute('disabled'));
