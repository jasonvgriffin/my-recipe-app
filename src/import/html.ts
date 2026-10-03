/**
 * Small HTML helpers for the recipe import fallback parsers.
 * No DOM library: this module stays UI-free and dependency-free (docs/IMPORT_API.md).
 */

export interface HtmlEl {
  tag: string;
  attrs: Record<string, string>;
  children: (HtmlEl | string)[];
}

const VOID = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

/** Decode the entities recipe pages actually use. One pass; numeric code points included. */
export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => safeCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => safeCodePoint(Number(n)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function safeCodePoint(n: number): string {
  if (!Number.isFinite(n) || n < 0 || n > 0x10ffff) return '';
  try {
    return String.fromCodePoint(n);
  } catch {
    return '';
  }
}

export function parseHtml(html: string): HtmlEl {
  const cleaned = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '');
  const root: HtmlEl = { tag: '#root', attrs: {}, children: [] };
  const stack: HtmlEl[] = [root];
  const re = /<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)([^>]*?)(\/?)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cleaned))) {
    if (m[1]) {
      const tag = m[1].toLowerCase();
      for (let i = stack.length - 1; i > 0; i--) {
        const popped = stack.pop();
        if (popped?.tag === tag) break;
      }
      continue;
    }
    if (m[2]) {
      const tag = m[2].toLowerCase();
      const el: HtmlEl = { tag, attrs: parseAttrs(m[3] ?? ''), children: [] };
      stack[stack.length - 1].children.push(el);
      if (m[4] !== '/' && !VOID.has(tag)) stack.push(el);
      continue;
    }
    if (m[5] && m[5].trim()) stack[stack.length - 1].children.push(m[5]);
  }
  return root;
}

function parseAttrs(s: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([^\s"'=<>`]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    attrs[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return attrs;
}

export function classList(el: HtmlEl): string[] {
  return (el.attrs.class ?? '').split(/\s+/).filter(Boolean);
}

export function hasClass(el: HtmlEl, name: string): boolean {
  return classList(el).includes(name);
}

export function textContent(el: HtmlEl): string {
  const parts: string[] = [];
  const walk = (n: HtmlEl | string) => {
    if (typeof n === 'string') {
      parts.push(n);
      return;
    }
    if (n.tag === 'br') {
      parts.push('\n');
      return;
    }
    for (const c of n.children) walk(c);
  };
  walk(el);
  return decodeEntities(parts.join(' '))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function findAll(el: HtmlEl, pred: (e: HtmlEl) => boolean): HtmlEl[] {
  const out: HtmlEl[] = [];
  const walk = (n: HtmlEl) => {
    if (pred(n)) out.push(n);
    for (const c of n.children) if (typeof c !== 'string') walk(c);
  };
  walk(el);
  return out;
}
