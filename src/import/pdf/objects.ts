/**
 * Minimal PDF object reader (enough to find pages, fonts and content streams for text extraction).
 * Pure TypeScript, no dependencies: works in Hermes and jest. Handles classic and compressed (ObjStm) objects,
 * FlateDecode / ASCIIHex / ASCII85 filters, and damaged xref tables (objects are found by scanning).
 */
import { inflate } from './inflate';

export type PdfValue =
  number | boolean | null | string | PdfName | PdfString | PdfRef | PdfValue[] | PdfDict | PdfStream;

export class PdfName {
  constructor(readonly name: string) {}
}
export class PdfString {
  constructor(readonly bytes: Uint8Array) {}
}
export class PdfRef {
  constructor(
    readonly num: number,
    readonly gen: number,
  ) {}
}
export class PdfDict {
  constructor(readonly map: Map<string, PdfValue>) {}
  get(key: string): PdfValue | undefined {
    return this.map.get(key);
  }
}
export class PdfStream {
  constructor(
    readonly dict: PdfDict,
    readonly raw: Uint8Array,
  ) {}
}
/** An operator / keyword inside a content stream (Tj, BT, …) or `obj`/`R` while parsing. */
export class PdfOp {
  constructor(readonly op: string) {}
}

const WS = new Set([0, 9, 10, 12, 13, 32]);
const DELIM = new Set([40, 41, 60, 62, 91, 93, 123, 125, 47, 37]);

export class Lexer {
  pos: number;
  constructor(
    readonly data: Uint8Array,
    start = 0,
  ) {
    this.pos = start;
  }

  private skipWs(): void {
    const d = this.data;
    while (this.pos < d.length) {
      const c = d[this.pos];
      if (WS.has(c)) this.pos++;
      else if (c === 37) {
        while (this.pos < d.length && d[this.pos] !== 10 && d[this.pos] !== 13) this.pos++;
      } else break;
    }
  }

  /** Next token: a value, an operator, or undefined at the end. Array/dict delimiters come back as PdfOp. */
  token(): PdfValue | PdfOp | undefined {
    this.skipWs();
    const d = this.data;
    if (this.pos >= d.length) return undefined;
    const c = d[this.pos];
    if (c === 47) {
      // /Name with #xx escapes
      this.pos++;
      let s = '';
      while (this.pos < d.length && !WS.has(d[this.pos]) && !DELIM.has(d[this.pos])) {
        if (d[this.pos] === 35 && this.pos + 2 < d.length) {
          s += String.fromCharCode(parseInt(String.fromCharCode(d[this.pos + 1], d[this.pos + 2]), 16));
          this.pos += 3;
        } else s += String.fromCharCode(d[this.pos++]);
      }
      return new PdfName(s);
    }
    if (c === 40) return this.literalString();
    if (c === 60) {
      if (d[this.pos + 1] === 60) {
        this.pos += 2;
        return new PdfOp('<<');
      }
      return this.hexString();
    }
    if (c === 62 && d[this.pos + 1] === 62) {
      this.pos += 2;
      return new PdfOp('>>');
    }
    if (c === 91 || c === 93 || c === 123 || c === 125) {
      this.pos++;
      return new PdfOp(String.fromCharCode(c));
    }
    let s = '';
    while (this.pos < d.length && !WS.has(d[this.pos]) && !DELIM.has(d[this.pos]))
      s += String.fromCharCode(d[this.pos++]);
    if (!s) {
      this.pos++;
      return new PdfOp(String.fromCharCode(c));
    }
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) return parseFloat(s);
    if (s === 'true') return true;
    if (s === 'false') return false;
    if (s === 'null') return null;
    return new PdfOp(s);
  }

  private literalString(): PdfString {
    const d = this.data;
    this.pos++;
    const out: number[] = [];
    let depth = 1;
    while (this.pos < d.length) {
      const c = d[this.pos++];
      if (c === 92) {
        const n = d[this.pos++];
        if (n === 110) out.push(10);
        else if (n === 114) out.push(13);
        else if (n === 116) out.push(9);
        else if (n === 98) out.push(8);
        else if (n === 102) out.push(12);
        else if (n === 13) {
          if (d[this.pos] === 10) this.pos++;
        } else if (n === 10) {
          // line continuation
        } else if (n >= 48 && n <= 55) {
          let v = n - 48;
          for (let k = 0; k < 2 && d[this.pos] >= 48 && d[this.pos] <= 55; k++) v = v * 8 + (d[this.pos++] - 48);
          out.push(v & 0xff);
        } else out.push(n);
      } else if (c === 40) {
        depth++;
        out.push(c);
      } else if (c === 41) {
        if (--depth === 0) break;
        out.push(c);
      } else out.push(c);
    }
    return new PdfString(Uint8Array.from(out));
  }

  private hexString(): PdfString {
    const d = this.data;
    this.pos++;
    let hex = '';
    while (this.pos < d.length && d[this.pos] !== 62) {
      const ch = String.fromCharCode(d[this.pos++]);
      if (/[0-9a-fA-F]/.test(ch)) hex += ch;
    }
    this.pos++;
    if (hex.length % 2) hex += '0';
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
    return new PdfString(out);
  }

  /** Parse one full value (arrays, dicts, `n g R` refs). Returns a PdfOp for bare operators. */
  value(): PdfValue | PdfOp | undefined {
    const t = this.token();
    if (t instanceof PdfOp) {
      if (t.op === '[') {
        const arr: PdfValue[] = [];
        for (;;) {
          const v = this.value();
          if (v === undefined || (v instanceof PdfOp && v.op === ']')) break;
          if (!(v instanceof PdfOp)) arr.push(v);
        }
        return arr;
      }
      if (t.op === '<<') {
        const map = new Map<string, PdfValue>();
        for (;;) {
          const k = this.value();
          if (k === undefined || (k instanceof PdfOp && k.op === '>>')) break;
          if (!(k instanceof PdfName)) continue;
          const v = this.value();
          if (v === undefined) break;
          if (v instanceof PdfOp && v.op === '>>') break;
          if (!(v instanceof PdfOp)) map.set(k.name, v);
        }
        return new PdfDict(map);
      }
      return t;
    }
    if (typeof t === 'number' && Number.isInteger(t) && t >= 0) {
      // Look ahead for "gen R".
      const save = this.pos;
      const g = this.token();
      if (typeof g === 'number' && Number.isInteger(g)) {
        const r = this.token();
        if (r instanceof PdfOp && r.op === 'R') return new PdfRef(t, g);
      }
      this.pos = save;
    }
    return t;
  }
}

function indexOf(data: Uint8Array, needle: string, from: number): number {
  const n = needle.length;
  const first = needle.charCodeAt(0);
  outer: for (let i = from; i <= data.length - n; i++) {
    if (data[i] !== first) continue;
    for (let k = 1; k < n; k++) if (data[i + k] !== needle.charCodeAt(k)) continue outer;
    return i;
  }
  return -1;
}

export class PdfDocument {
  private objects = new Map<number, PdfValue>();
  private trailers: PdfDict[] = [];

  constructor(readonly data: Uint8Array) {
    this.scan();
  }

  private scan(): void {
    const d = this.data;
    // Find "N G obj" headers by scanning (robust against broken xref tables). Later definitions win (updates).
    const re = /(\d+)\s+(\d+)\s+obj\b/g;
    let text = '';
    // Build a latin1 string view lazily in chunks for the regex.
    const CHUNK = 8192;
    const parts: string[] = [];
    for (let i = 0; i < d.length; i += CHUNK)
      parts.push(String.fromCharCode.apply(null, Array.from(d.subarray(i, i + CHUNK))));
    text = parts.join('');
    const objStms: PdfStream[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const num = parseInt(m[1], 10);
      const lex = new Lexer(d, m.index + m[0].length);
      let v: PdfValue | PdfOp | undefined;
      try {
        v = lex.value();
      } catch {
        continue;
      }
      if (v === undefined || v instanceof PdfOp) continue;
      if (v instanceof PdfDict) {
        const after = lex.pos;
        const kw = new Lexer(d, after).token();
        if (kw instanceof PdfOp && kw.op === 'stream') {
          let start = indexOf(d, 'stream', after) + 6;
          if (d[start] === 13) start++;
          if (d[start] === 10) start++;
          const len = v.get('Length');
          let end = -1;
          if (typeof len === 'number' && start + len <= d.length) {
            const tail = new Lexer(d, start + len).token();
            if (tail instanceof PdfOp && tail.op === 'endstream') end = start + len;
          }
          if (end < 0) {
            end = indexOf(d, 'endstream', start);
            if (end < 0) end = d.length;
            while (end > start && (d[end - 1] === 10 || d[end - 1] === 13)) end--;
          }
          const stream = new PdfStream(v, d.subarray(start, end));
          this.objects.set(num, stream);
          if (nameOf(v.get('Type')) === 'ObjStm') objStms.push(stream);
          const type = nameOf(v.get('Type'));
          if (type === 'XRef') this.trailers.push(v);
          re.lastIndex = Math.max(re.lastIndex, end);
          continue;
        }
      }
      this.objects.set(num, v);
    }
    for (const stm of objStms) this.loadObjStm(stm);
    // Classic trailers.
    let at = 0;
    for (;;) {
      at = indexOf(d, 'trailer', at);
      if (at < 0) break;
      const v = new Lexer(d, at + 7).value();
      if (v instanceof PdfDict) this.trailers.push(v);
      at += 7;
    }
  }

  private loadObjStm(stm: PdfStream): void {
    const n = stm.dict.get('N');
    const first = stm.dict.get('First');
    if (typeof n !== 'number' || typeof first !== 'number') return;
    const data = this.decode(stm);
    const lex = new Lexer(data);
    const pairs: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const num = lex.token();
      const off = lex.token();
      if (typeof num !== 'number' || typeof off !== 'number') break;
      pairs.push([num, off]);
    }
    for (const [num, off] of pairs) {
      if (this.objects.has(num) && !(this.objects.get(num) === undefined)) {
        // A classic object with the same number defined in the file body wins only if found later; keep simple:
        // compressed objects fill gaps.
        continue;
      }
      const v = new Lexer(data, first + off).value();
      if (v !== undefined && !(v instanceof PdfOp)) this.objects.set(num, v);
    }
  }

  resolve(v: PdfValue | undefined, depth = 0): PdfValue | undefined {
    if (v instanceof PdfRef && depth < 32) return this.resolve(this.objects.get(v.num), depth + 1);
    return v;
  }

  dict(v: PdfValue | undefined): PdfDict | undefined {
    const r = this.resolve(v);
    if (r instanceof PdfDict) return r;
    if (r instanceof PdfStream) return r.dict;
    return undefined;
  }

  array(v: PdfValue | undefined): PdfValue[] {
    const r = this.resolve(v);
    return Array.isArray(r) ? r : r === undefined || r === null ? [] : [r];
  }

  /** Decoded stream bytes (FlateDecode, ASCIIHexDecode, ASCII85Decode; PNG predictors for Flate). */
  decode(stream: PdfStream): Uint8Array {
    let bytes = stream.raw;
    const filters = this.array(stream.dict.get('Filter')).map((f) => nameOf(this.resolve(f)));
    const parms = this.array(stream.dict.get('DecodeParms'));
    filters.forEach((f, i) => {
      if (f === 'FlateDecode' || f === 'Fl') {
        bytes = inflate(bytes);
        const p = this.dict(parms[i]);
        const predictor = p?.get('Predictor');
        if (typeof predictor === 'number' && predictor >= 10) {
          const cols = (p?.get('Columns') as number) || 1;
          bytes = unpredictPng(bytes, cols);
        }
      } else if (f === 'ASCIIHexDecode' || f === 'AHx') bytes = asciiHex(bytes);
      else if (f === 'ASCII85Decode' || f === 'A85') bytes = ascii85(bytes);
      else if (f) bytes = new Uint8Array(0); // DCT/JBIG2/… = images; no text inside
    });
    return bytes;
  }

  catalog(): PdfDict | undefined {
    for (const t of [...this.trailers].reverse()) {
      const root = this.dict(t.get('Root'));
      if (root) return root;
    }
    for (const v of this.objects.values()) {
      const d = v instanceof PdfDict ? v : undefined;
      if (d && nameOf(d.get('Type')) === 'Catalog') return d;
    }
    return undefined;
  }

  /** Pages in reading order, each with its (inherited) Resources. */
  pages(): { page: PdfDict; resources: PdfDict | undefined }[] {
    const out: { page: PdfDict; resources: PdfDict | undefined }[] = [];
    const seen = new Set<PdfDict>();
    const walk = (node: PdfDict | undefined, inherited: PdfDict | undefined, depth: number) => {
      if (!node || seen.has(node) || depth > 64) return;
      seen.add(node);
      const resources = this.dict(node.get('Resources')) ?? inherited;
      const type = nameOf(node.get('Type'));
      if (type === 'Pages' || node.get('Kids')) {
        for (const kid of this.array(node.get('Kids'))) walk(this.dict(kid), resources, depth + 1);
      } else out.push({ page: node, resources });
    };
    walk(this.dict(this.catalog()?.get('Pages')), undefined, 0);
    if (out.length === 0) {
      for (const v of this.objects.values()) {
        if (v instanceof PdfDict && nameOf(v.get('Type')) === 'Page')
          out.push({ page: v, resources: this.dict(v.get('Resources')) });
      }
    }
    return out;
  }
}

export function nameOf(v: PdfValue | undefined): string | undefined {
  return v instanceof PdfName ? v.name : undefined;
}

function unpredictPng(data: Uint8Array, columns: number): Uint8Array {
  const rowLen = columns + 1;
  const rows = Math.floor(data.length / rowLen);
  const out = new Uint8Array(rows * columns);
  const prev = new Uint8Array(columns);
  for (let r = 0; r < rows; r++) {
    const type = data[r * rowLen];
    for (let c = 0; c < columns; c++) {
      const x = data[r * rowLen + 1 + c];
      const a = c > 0 ? out[r * columns + c - 1] : 0;
      const b = prev[c];
      const cc = c > 0 ? prev[c - 1] : 0;
      let v = x;
      if (type === 1) v = x + a;
      else if (type === 2) v = x + b;
      else if (type === 3) v = x + ((a + b) >> 1);
      else if (type === 4) {
        const p = a + b - cc;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - cc);
        v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : cc);
      }
      out[r * columns + c] = v & 0xff;
    }
    prev.set(out.subarray(r * columns, r * columns + columns));
  }
  return out;
}

function asciiHex(data: Uint8Array): Uint8Array {
  let hex = '';
  for (const b of data) {
    if (b === 62) break;
    const ch = String.fromCharCode(b);
    if (/[0-9a-fA-F]/.test(ch)) hex += ch;
  }
  if (hex.length % 2) hex += '0';
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

function ascii85(data: Uint8Array): Uint8Array {
  const out: number[] = [];
  let group: number[] = [];
  for (let i = 0; i < data.length; i++) {
    const c = data[i];
    if (c === 126) break; // ~>
    if (WS.has(c)) continue;
    if (c === 122 && group.length === 0) {
      out.push(0, 0, 0, 0);
      continue;
    }
    group.push(c - 33);
    if (group.length === 5) {
      let v = 0;
      for (const g of group) v = v * 85 + g;
      out.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
      group = [];
    }
  }
  if (group.length) {
    const n = group.length;
    while (group.length < 5) group.push(84);
    let v = 0;
    for (const g of group) v = v * 85 + g;
    const bytes = [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
    out.push(...bytes.slice(0, n - 1));
  }
  return Uint8Array.from(out);
}
