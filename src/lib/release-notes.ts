/**
 * GitHub release bodies are markdown. Settings renders headings and bullets
 * from this parser. No markdown library: the notes are a short list.
 */

export type ReleaseNoteBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'bullet'; text: string }
  | { kind: 'paragraph'; text: string };

function stripInline(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/(^|\s)\*([^*]+)\*(?=\s|$)/g, '$1$2')
    .trim();
}

/** Headings (`#`…`######`), `-` / `*` / `1.` bullets, and paragraphs. Blank lines are skipped. */
export function parseReleaseNotes(markdown: string): ReleaseNoteBlock[] {
  const blocks: ReleaseNoteBlock[] = [];
  for (const raw of markdown.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line || /^[-*_]{3,}$/.test(line)) continue;
    const heading = /^#{1,6}\s+(.+)$/.exec(line);
    if (heading) {
      const text = stripInline(heading[1]);
      if (text) blocks.push({ kind: 'heading', text });
      continue;
    }
    const bullet = /^(?:[-*+]|\d+\.)\s+(.+)$/.exec(line);
    if (bullet) {
      const text = stripInline(bullet[1]);
      if (text) blocks.push({ kind: 'bullet', text });
      continue;
    }
    const text = stripInline(line.replace(/^>\s?/, ''));
    if (text) blocks.push({ kind: 'paragraph', text });
  }
  return blocks;
}
