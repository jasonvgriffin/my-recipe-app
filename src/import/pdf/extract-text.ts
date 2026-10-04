/**
 * On-device PDF text extraction (no network, no paid APIs): walks each page's content stream, decodes text with the
 * page's fonts, and rebuilds reading-order lines from glyph positions. Scanned / image-only PDFs have no text layer,
 * so they come back with `hasText: false` (the UI explains that instead of failing silently).
 */
import { createFontDecoder, type FontDecoder } from './fonts';
import { Lexer, PdfDict, PdfDocument, PdfName, PdfOp, PdfStream, PdfString, nameOf, type PdfValue } from './objects';

export interface PdfText {
  /** One string per page, lines separated by "\n" (a blank line between paragraphs / blocks). */
  pages: string[];
  /** False when no page has any real text (e.g. a scan). */
  hasText: boolean;
}

export class NotAPdfError extends Error {
  constructor() {
    super('That file is not a PDF.');
    this.name = 'NotAPdfError';
  }
}

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
const mul = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[1] * n[2],
  m[0] * n[1] + m[1] * n[3],
  m[2] * n[0] + m[3] * n[2],
  m[2] * n[1] + m[3] * n[3],
  m[4] * n[0] + m[5] * n[2] + n[4],
  m[4] * n[1] + m[5] * n[3] + n[5],
];

interface Glyphs {
  x: number;
  y: number;
  /** End x of the run (device space). */
  endX: number;
  size: number;
  text: string;
}

const MAX_PAGES = 200;
const MAX_FORM_DEPTH = 8;

export function extractPdfText(bytes: Uint8Array): PdfText {
  const head = String.fromCharCode(...Array.from(bytes.subarray(0, Math.min(bytes.length, 1024))));
  if (!head.includes('%PDF-')) throw new NotAPdfError();
  const doc = new PdfDocument(bytes);
  const pages = doc.pages().slice(0, MAX_PAGES);
  const out = pages.map(({ page, resources }) => {
    const runs: Glyphs[] = [];
    const contents = doc.array(page.get('Contents'));
    const chunks = contents.map((c) => doc.resolve(c)).filter((c): c is PdfStream => c instanceof PdfStream);
    // Concatenate content streams (a page may split one text object across several).
    const parts = chunks.map((c) => doc.decode(c));
    const total = parts.reduce((n, p) => n + p.length + 1, 0);
    const data = new Uint8Array(total);
    let at = 0;
    for (const p of parts) {
      data.set(p, at);
      at += p.length;
      data[at++] = 10;
    }
    runContent(doc, data, resources, IDENTITY, runs, 0);
    return layoutLines(runs);
  });
  return { pages: out, hasText: out.some((p) => /[A-Za-z0-9\u00C0-\u024F\u0370-\uFFEF]/.test(p)) };
}

function runContent(
  doc: PdfDocument,
  data: Uint8Array,
  resources: PdfDict | undefined,
  baseCtm: Matrix,
  runs: Glyphs[],
  depth: number,
): void {
  const fontsDict = doc.dict(resources?.get('Font'));
  const xobjects = doc.dict(resources?.get('XObject'));
  const decoders = new Map<string, FontDecoder>();
  const fontFor = (name: string): FontDecoder => {
    let d = decoders.get(name);
    if (!d) {
      d = createFontDecoder(doc, doc.dict(fontsDict?.get(name)));
      decoders.set(name, d);
    }
    return d;
  };

  let ctm: Matrix = baseCtm;
  const stack: Matrix[] = [];
  let tm: Matrix = IDENTITY;
  let tlm: Matrix = IDENTITY;
  let font: FontDecoder | undefined;
  let fontSize = 12;
  let charSpacing = 0;
  let wordSpacing = 0;
  let hScale = 1;
  let leading = 0;
  let rise = 0;
  const operands: (PdfValue | PdfOp)[] = [];
  const lex = new Lexer(data);

  const show = (str: PdfString) => {
    if (!font) font = fontFor('');
    const glyphs = font.decode(str.bytes);
    let text = '';
    const start = mul([fontSize * hScale, 0, 0, fontSize, 0, rise], mul(tm, ctm));
    let advance = 0;
    for (const g of glyphs) {
      text += g.text;
      advance += ((g.width / 1000) * fontSize + charSpacing + (g.isSpace ? wordSpacing : 0)) * hScale;
    }
    tm = mul([1, 0, 0, 1, advance, 0], tm);
    const end = mul([1, 0, 0, 1, 0, rise], mul(tm, ctm));
    const size = Math.abs(fontSize * Math.hypot(tm[2], tm[3]) * Math.hypot(ctm[2], ctm[3])) || fontSize;
    if (text) runs.push({ x: start[4], y: start[5], endX: end[4], size, text });
  };

  const num = (v: PdfValue | PdfOp | undefined, d = 0) => (typeof v === 'number' ? v : d);

  for (;;) {
    let t: PdfValue | PdfOp | undefined;
    try {
      t = lex.value();
    } catch {
      break;
    }
    if (t === undefined) break;
    if (!(t instanceof PdfOp)) {
      operands.push(t);
      continue;
    }
    const op = t.op;
    const a = operands;
    switch (op) {
      case 'q':
        stack.push(ctm);
        break;
      case 'Q':
        ctm = stack.pop() ?? baseCtm;
        break;
      case 'cm':
        if (a.length >= 6) ctm = mul(a.slice(-6).map((v) => num(v)) as Matrix, ctm);
        break;
      case 'BT':
        tm = IDENTITY;
        tlm = IDENTITY;
        break;
      case 'Tf': {
        const name = a[a.length - 2];
        fontSize = num(a[a.length - 1], 12);
        font = fontFor(name instanceof PdfName ? name.name : '');
        break;
      }
      case 'Tc':
        charSpacing = num(a[a.length - 1]);
        break;
      case 'Tw':
        wordSpacing = num(a[a.length - 1]);
        break;
      case 'Tz':
        hScale = num(a[a.length - 1], 100) / 100;
        break;
      case 'TL':
        leading = num(a[a.length - 1]);
        break;
      case 'Ts':
        rise = num(a[a.length - 1]);
        break;
      case 'Td':
      case 'TD': {
        const tx = num(a[a.length - 2]);
        const ty = num(a[a.length - 1]);
        if (op === 'TD') leading = -ty;
        tlm = mul([1, 0, 0, 1, tx, ty], tlm);
        tm = tlm;
        break;
      }
      case 'Tm':
        if (a.length >= 6) {
          tlm = a.slice(-6).map((v) => num(v)) as Matrix;
          tm = tlm;
        }
        break;
      case 'T*':
        tlm = mul([1, 0, 0, 1, 0, -leading], tlm);
        tm = tlm;
        break;
      case 'Tj': {
        const s = a[a.length - 1];
        if (s instanceof PdfString) show(s);
        break;
      }
      case "'":
      case '"': {
        if (op === '"' && a.length >= 3) {
          wordSpacing = num(a[a.length - 3]);
          charSpacing = num(a[a.length - 2]);
        }
        tlm = mul([1, 0, 0, 1, 0, -leading], tlm);
        tm = tlm;
        const s = a[a.length - 1];
        if (s instanceof PdfString) show(s);
        break;
      }
      case 'TJ': {
        const arr = a[a.length - 1];
        if (Array.isArray(arr)) {
          for (const item of arr) {
            if (item instanceof PdfString) show(item);
            else if (typeof item === 'number') tm = mul([1, 0, 0, 1, (-item / 1000) * fontSize * hScale, 0], tm);
          }
        }
        break;
      }
      case 'Do': {
        const name = a[a.length - 1];
        if (depth >= MAX_FORM_DEPTH || !(name instanceof PdfName)) break;
        const xo = doc.resolve(xobjects?.get(name.name));
        if (xo instanceof PdfStream && nameOf(xo.dict.get('Subtype')) === 'Form') {
          const m = doc.array(xo.dict.get('Matrix')).map((v) => doc.resolve(v));
          const formMatrix = (m.length === 6 && m.every((v) => typeof v === 'number') ? m : IDENTITY) as Matrix;
          runContent(
            doc,
            doc.decode(xo),
            doc.dict(xo.dict.get('Resources')) ?? resources,
            mul(formMatrix, ctm),
            runs,
            depth + 1,
          );
        }
        break;
      }
      case 'BI': {
        // Skip inline image data up to "EI".
        const d = lex.data;
        let p = lex.pos;
        while (
          p < d.length - 2 &&
          !(d[p] === 69 && d[p + 1] === 73 && (p + 2 >= d.length || d[p + 2] <= 32) && d[p - 1] <= 32)
        )
          p++;
        lex.pos = p + 2;
        break;
      }
      default:
        break;
    }
    operands.length = 0;
  }
}

/** Group glyph runs into lines (top to bottom), join runs with spaces where there's a visible gap. */
function layoutLines(runs: Glyphs[]): string {
  if (runs.length === 0) return '';
  const sorted = [...runs].sort((p, q) => q.y - p.y || p.x - q.x);
  const lines: { y: number; size: number; runs: Glyphs[] }[] = [];
  for (const r of sorted) {
    const line = lines.find((l) => Math.abs(l.y - r.y) <= Math.max(1.5, Math.min(l.size, r.size) * 0.45));
    if (line) {
      line.runs.push(r);
      line.size = Math.max(line.size, r.size);
    } else lines.push({ y: r.y, size: r.size, runs: [r] });
  }
  lines.sort((p, q) => q.y - p.y);
  const out: string[] = [];
  let prev: { y: number; size: number } | undefined;
  for (const line of lines) {
    const items = line.runs.sort((p, q) => p.x - q.x);
    let text = '';
    let lastEnd: number | undefined;
    for (const r of items) {
      if (lastEnd !== undefined) {
        const gap = r.x - lastEnd;
        const needsSpace = gap > r.size * 0.18 && !/\s$/.test(text) && !/^\s/.test(r.text);
        if (needsSpace) text += gap > r.size * 2.5 ? '  ' : ' ';
      }
      text += r.text;
      lastEnd = Math.max(lastEnd ?? -Infinity, r.endX);
    }
    text = text.replace(/[ \t\u00a0]+/g, ' ').trim();
    if (!text) continue;
    if (prev && prev.y - line.y > Math.max(prev.size, line.size) * 1.8) out.push('');
    out.push(text);
    prev = line;
  }
  return out.join('\n');
}
