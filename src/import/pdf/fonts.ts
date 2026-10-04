/**
 * Font decoding for PDF text extraction: ToUnicode CMaps (what Chrome/Skia, Word and most generators embed),
 * simple-font encodings (WinAnsi / MacRoman / Standard + Differences) and glyph widths for word spacing.
 */
import { Lexer, PdfDict, PdfDocument, PdfName, PdfOp, PdfStream, PdfString, nameOf, type PdfValue } from './objects';

export interface FontDecoder {
  /** Split a shown string into glyphs: unicode text + width in text-space thousandths. */
  decode(bytes: Uint8Array): { text: string; width: number; isSpace: boolean }[];
}

// WinAnsiEncoding differences from Latin-1 in 0x80–0x9F.
const WIN_ANSI_HIGH: Record<number, string> = {
  0x80: '€',
  0x82: '‚',
  0x83: 'ƒ',
  0x84: '„',
  0x85: '…',
  0x86: '†',
  0x87: '‡',
  0x88: 'ˆ',
  0x89: '‰',
  0x8a: 'Š',
  0x8b: '‹',
  0x8c: 'Œ',
  0x8e: 'Ž',
  0x91: '‘',
  0x92: '’',
  0x93: '“',
  0x94: '”',
  0x95: '•',
  0x96: '–',
  0x97: '—',
  0x98: '˜',
  0x99: '™',
  0x9a: 'š',
  0x9b: '›',
  0x9c: 'œ',
  0x9e: 'ž',
  0x9f: 'Ÿ',
};

// Common glyph names (Adobe Glyph List subset) for /Differences.
const GLYPHS: Record<string, string> = {
  space: ' ',
  exclam: '!',
  quotedbl: '"',
  numbersign: '#',
  dollar: '$',
  percent: '%',
  ampersand: '&',
  quotesingle: "'",
  quoteright: '’',
  quoteleft: '‘',
  parenleft: '(',
  parenright: ')',
  asterisk: '*',
  plus: '+',
  comma: ',',
  hyphen: '-',
  minus: '−',
  period: '.',
  slash: '/',
  zero: '0',
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
  colon: ':',
  semicolon: ';',
  less: '<',
  equal: '=',
  greater: '>',
  question: '?',
  at: '@',
  bracketleft: '[',
  backslash: '\\',
  bracketright: ']',
  asciicircum: '^',
  underscore: '_',
  grave: '`',
  braceleft: '{',
  bar: '|',
  braceright: '}',
  asciitilde: '~',
  bullet: '•',
  endash: '–',
  emdash: '—',
  quotedblleft: '“',
  quotedblright: '”',
  quotesinglbase: '‚',
  quotedblbase: '„',
  ellipsis: '…',
  degree: '°',
  onehalf: '½',
  onequarter: '¼',
  threequarters: '¾',
  onethird: '⅓',
  twothirds: '⅔',
  fraction: '⁄',
  fi: 'fi',
  fl: 'fl',
  ff: 'ff',
  ffi: 'ffi',
  ffl: 'ffl',
  copyright: '©',
  registered: '®',
  trademark: '™',
  multiply: '×',
  divide: '÷',
  periodcentered: '·',
  middot: '·',
  eacute: 'é',
  egrave: 'è',
  ecircumflex: 'ê',
  agrave: 'à',
  aacute: 'á',
  ccedilla: 'ç',
  ntilde: 'ñ',
  odieresis: 'ö',
  udieresis: 'ü',
  adieresis: 'ä',
  iacute: 'í',
  oacute: 'ó',
  uacute: 'ú',
  germandbls: 'ß',
  nbspace: ' ',
  uni00A0: ' ',
};

function glyphToUnicode(name: string): string | undefined {
  if (GLYPHS[name]) return GLYPHS[name];
  if (/^[A-Za-z]$/.test(name)) return name;
  const uni = name.match(/^uni([0-9A-Fa-f]{4,})$/);
  if (uni) return String.fromCodePoint(parseInt(uni[1].slice(0, 4), 16));
  const u = name.match(/^u([0-9A-Fa-f]{4,6})$/);
  if (u) return String.fromCodePoint(parseInt(u[1], 16));
  return undefined;
}

function utf16beToString(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i + 1 < bytes.length; i += 2) s += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
  return s;
}

function bytesToInt(bytes: Uint8Array): number {
  let v = 0;
  for (const b of bytes) v = v * 256 + b;
  return v;
}

interface CMap {
  map: Map<number, string>;
  /** Byte widths of codes, from codespacerange (default: 1 for simple fonts, 2 for Type0). */
  codeLengths: number[];
}

function parseToUnicode(data: Uint8Array): CMap {
  const lex = new Lexer(data);
  const map = new Map<number, string>();
  const codeLengths = new Set<number>();
  const pending: (PdfValue | PdfOp)[] = [];
  for (;;) {
    const t = lex.value();
    if (t === undefined) break;
    if (t instanceof PdfOp) {
      if (t.op === 'endcodespacerange') {
        for (let i = 0; i + 1 < pending.length; i += 2) {
          const lo = pending[i];
          if (lo instanceof PdfString) codeLengths.add(lo.bytes.length);
        }
      } else if (t.op === 'endbfchar') {
        for (let i = 0; i + 1 < pending.length; i += 2) {
          const src = pending[i];
          const dst = pending[i + 1];
          if (src instanceof PdfString && dst instanceof PdfString)
            map.set(bytesToInt(src.bytes), utf16beToString(dst.bytes));
          else if (src instanceof PdfString && dst instanceof PdfName) {
            const u = glyphToUnicode(dst.name);
            if (u) map.set(bytesToInt(src.bytes), u);
          }
        }
      } else if (t.op === 'endbfrange') {
        for (let i = 0; i + 2 < pending.length; i += 3) {
          const lo = pending[i];
          const hi = pending[i + 1];
          const dst = pending[i + 2];
          if (!(lo instanceof PdfString) || !(hi instanceof PdfString)) continue;
          const a = bytesToInt(lo.bytes);
          const b = Math.min(bytesToInt(hi.bytes), a + 65535);
          if (dst instanceof PdfString) {
            const base = dst.bytes;
            for (let c = a; c <= b; c++) {
              const copy = base.slice();
              let carry = c - a;
              for (let k = copy.length - 1; k >= 0 && carry > 0; k--) {
                const sum = copy[k] + carry;
                copy[k] = sum & 0xff;
                carry = sum >> 8;
              }
              map.set(c, utf16beToString(copy));
            }
          } else if (Array.isArray(dst)) {
            dst.forEach((d, k) => {
              if (d instanceof PdfString && a + k <= b) map.set(a + k, utf16beToString(d.bytes));
            });
          }
        }
      }
      if (t.op.startsWith('begin') || t.op.startsWith('end')) pending.length = 0;
      continue;
    }
    pending.push(t);
  }
  return { map, codeLengths: [...codeLengths].sort((x, y) => x - y) };
}

function baseEncoding(name: string | undefined): (code: number) => string {
  if (name === 'MacRomanEncoding') {
    const mac: Record<number, string> = {
      0xd0: '–',
      0xd1: '—',
      0xd2: '“',
      0xd3: '”',
      0xd4: '‘',
      0xd5: '’',
      0xa5: '•',
      0xa1: '°',
    };
    return (c) => mac[c] ?? (c < 128 ? String.fromCharCode(c) : '');
  }
  if (name === 'StandardEncoding') {
    const std: Record<number, string> = { 0x27: '’', 0x60: '‘', 0xb1: '–', 0xd0: '—', 0xb7: '•', 0xaa: '“', 0xba: '”' };
    return (c) => std[c] ?? (c < 128 ? String.fromCharCode(c) : '');
  }
  return (c) => WIN_ANSI_HIGH[c] ?? (c === 0xa0 ? ' ' : String.fromCharCode(c));
}

export function createFontDecoder(doc: PdfDocument, font: PdfDict | undefined): FontDecoder {
  const subtype = nameOf(font?.get('Subtype'));
  const type0 = subtype === 'Type0';
  const toUnicodeStream = doc.resolve(font?.get('ToUnicode'));
  const cmap = toUnicodeStream instanceof PdfStream ? parseToUnicode(doc.decode(toUnicodeStream)) : undefined;

  // Widths.
  let widthOf: (code: number) => number = () => 500;
  if (type0) {
    const desc = doc.dict(doc.array(font?.get('DescendantFonts'))[0]);
    const dw = doc.resolve(desc?.get('DW'));
    const defaultW = typeof dw === 'number' ? dw : 1000;
    const widths = new Map<number, number>();
    const w = doc.array(desc?.get('W')).map((v) => doc.resolve(v));
    for (let i = 0; i < w.length;) {
      const first = w[i];
      const next = w[i + 1];
      if (typeof first !== 'number') break;
      if (Array.isArray(next)) {
        next.forEach((val, k) => {
          const r = doc.resolve(val);
          if (typeof r === 'number') widths.set(first + k, r);
        });
        i += 2;
      } else {
        const last = next;
        const val = w[i + 2];
        if (typeof last === 'number' && typeof val === 'number')
          for (let c = first; c <= last && c - first < 65536; c++) widths.set(c, val);
        i += 3;
      }
    }
    widthOf = (code) => widths.get(code) ?? defaultW;
  } else {
    const firstChar = doc.resolve(font?.get('FirstChar'));
    const widths = doc.array(font?.get('Widths')).map((v) => doc.resolve(v));
    if (typeof firstChar === 'number' && widths.length) {
      widthOf = (code) => {
        const v = widths[code - firstChar];
        return typeof v === 'number' && v > 0 ? v : 500;
      };
    }
  }

  // Simple-font encoding (when there's no ToUnicode entry for a code).
  let simple: (code: number) => string = baseEncoding(undefined);
  if (!type0) {
    const enc = doc.resolve(font?.get('Encoding'));
    if (enc instanceof PdfName) simple = baseEncoding(enc.name);
    else if (enc instanceof PdfDict) {
      const base = baseEncoding(nameOf(enc.get('BaseEncoding')));
      const diffs = new Map<number, string>();
      let code = 0;
      for (const item of doc.array(enc.get('Differences'))) {
        const r = doc.resolve(item);
        if (typeof r === 'number') code = r;
        else if (r instanceof PdfName) {
          const u = glyphToUnicode(r.name);
          if (u !== undefined) diffs.set(code, u);
          code++;
        }
      }
      simple = (c) => diffs.get(c) ?? base(c);
    }
  }

  const codeLengths = cmap?.codeLengths.length ? cmap.codeLengths : [type0 ? 2 : 1];

  return {
    decode(bytes) {
      const glyphs: { text: string; width: number; isSpace: boolean }[] = [];
      for (let i = 0; i < bytes.length;) {
        let len = codeLengths[0];
        let code = -1;
        let text: string | undefined;
        // Prefer the shortest code length that maps (CMaps with mixed 1/2-byte ranges).
        for (const l of codeLengths) {
          if (i + l > bytes.length) break;
          const c = bytesToInt(bytes.subarray(i, i + l));
          if (cmap?.map.has(c)) {
            len = l;
            code = c;
            text = cmap.map.get(c);
            break;
          }
        }
        if (code < 0) {
          len = Math.min(len, bytes.length - i);
          code = bytesToInt(bytes.subarray(i, i + len));
          text = type0 ? '' : simple(code);
        }
        const t = (text ?? '').replace(/\u0000/g, '');
        // PDF word spacing (Tw) applies to single-byte code 32 only.
        glyphs.push({ text: t, width: widthOf(code), isSpace: len === 1 && code === 32 });
        i += len;
      }
      return glyphs;
    },
  };
}

export { PdfDict };
