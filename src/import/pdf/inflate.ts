/**
 * Small, dependency-free DEFLATE decoder (RFC 1950/1951) for PDF FlateDecode streams. Runs anywhere (Hermes, Node,
 * jest). Not streaming: PDF streams are decoded whole. Tolerates truncated / damaged data by returning what it got.
 */

const LEN_BASE = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258,
];
const LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DIST_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145,
  8193, 12289, 16385, 24577,
];
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const CL_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

interface Huffman {
  counts: Uint16Array;
  symbols: Uint16Array;
}

function buildHuffman(lengths: ArrayLike<number>, n: number): Huffman {
  const counts = new Uint16Array(16);
  for (let i = 0; i < n; i++) counts[lengths[i]]++;
  counts[0] = 0;
  const offs = new Uint16Array(16);
  for (let i = 1; i < 16; i++) offs[i] = offs[i - 1] + counts[i - 1];
  const symbols = new Uint16Array(n);
  for (let i = 0; i < n; i++) if (lengths[i]) symbols[offs[lengths[i]]++] = i;
  return { counts, symbols };
}

class Bits {
  pos = 0;
  bit = 0;
  constructor(readonly data: Uint8Array) {}
  get(n: number): number {
    let v = 0;
    for (let i = 0; i < n; i++) {
      if (this.pos >= this.data.length) throw new RangeError('eof');
      v |= ((this.data[this.pos] >> this.bit) & 1) << i;
      if (++this.bit === 8) {
        this.bit = 0;
        this.pos++;
      }
    }
    return v;
  }
  decode(h: Huffman): number {
    let code = 0;
    let first = 0;
    let index = 0;
    for (let len = 1; len < 16; len++) {
      code |= this.get(1);
      const count = h.counts[len];
      if (code - count < first) return h.symbols[index + (code - first)];
      index += count;
      first += count;
      first <<= 1;
      code <<= 1;
    }
    throw new Error('bad huffman code');
  }
  align(): void {
    if (this.bit) {
      this.bit = 0;
      this.pos++;
    }
  }
}

let fixedLit: Huffman | undefined;
let fixedDist: Huffman | undefined;
function fixedTables(): [Huffman, Huffman] {
  if (!fixedLit || !fixedDist) {
    const l = new Uint8Array(288);
    l.fill(8, 0, 144);
    l.fill(9, 144, 256);
    l.fill(7, 256, 280);
    l.fill(8, 280, 288);
    fixedLit = buildHuffman(l, 288);
    fixedDist = buildHuffman(new Uint8Array(30).fill(5), 30);
  }
  return [fixedLit, fixedDist];
}

class Out {
  buf = new Uint8Array(1024);
  len = 0;
  push(b: number): void {
    if (this.len === this.buf.length) this.grow(1);
    this.buf[this.len++] = b;
  }
  grow(extra: number): void {
    let size = this.buf.length * 2;
    while (size < this.len + extra) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buf.subarray(0, this.len));
    this.buf = next;
  }
  result(): Uint8Array {
    return this.buf.slice(0, this.len);
  }
}

/** Raw DEFLATE (no zlib header). */
export function inflateRaw(data: Uint8Array): Uint8Array {
  const bits = new Bits(data);
  const out = new Out();
  try {
    let last = 0;
    while (!last) {
      last = bits.get(1);
      const type = bits.get(2);
      if (type === 0) {
        bits.align();
        const p = bits.pos;
        if (p + 4 > data.length) break;
        const len = data[p] | (data[p + 1] << 8);
        bits.pos = p + 4;
        const end = Math.min(bits.pos + len, data.length);
        if (out.len + len > out.buf.length) out.grow(len);
        for (let i = bits.pos; i < end; i++) out.buf[out.len++] = data[i];
        bits.pos = end;
        continue;
      }
      let lit: Huffman;
      let dist: Huffman;
      if (type === 1) [lit, dist] = fixedTables();
      else if (type === 2) {
        const hlit = bits.get(5) + 257;
        const hdist = bits.get(5) + 1;
        const hclen = bits.get(4) + 4;
        const cl = new Uint8Array(19);
        for (let i = 0; i < hclen; i++) cl[CL_ORDER[i]] = bits.get(3);
        const clh = buildHuffman(cl, 19);
        const lengths = new Uint8Array(hlit + hdist);
        for (let i = 0; i < hlit + hdist;) {
          const sym = bits.decode(clh);
          if (sym < 16) lengths[i++] = sym;
          else {
            let rep = 0;
            let val = 0;
            if (sym === 16) {
              if (i === 0) throw new Error('bad repeat');
              val = lengths[i - 1];
              rep = 3 + bits.get(2);
            } else if (sym === 17) rep = 3 + bits.get(3);
            else rep = 11 + bits.get(7);
            while (rep-- && i < lengths.length) lengths[i++] = val;
          }
        }
        lit = buildHuffman(lengths.subarray(0, hlit), hlit);
        dist = buildHuffman(lengths.subarray(hlit), hdist);
      } else throw new Error('bad block type');
      for (;;) {
        const sym = bits.decode(lit);
        if (sym < 256) out.push(sym);
        else if (sym === 256) break;
        else {
          const li = sym - 257;
          const length = LEN_BASE[li] + bits.get(LEN_EXTRA[li]);
          const di = bits.decode(dist);
          const d = DIST_BASE[di] + bits.get(DIST_EXTRA[di]);
          if (d > out.len) throw new Error('bad distance');
          if (out.len + length > out.buf.length) out.grow(length);
          for (let i = 0; i < length; i++) out.buf[out.len] = out.buf[out.len++ - d];
        }
      }
    }
  } catch {
    // Damaged or truncated stream: keep whatever decoded.
  }
  return out.result();
}

/** zlib-wrapped DEFLATE (what PDF FlateDecode uses). Falls back to raw DEFLATE when there's no zlib header. */
export function inflate(data: Uint8Array): Uint8Array {
  const zlib = data.length > 2 && (data[0] & 0x0f) === 8 && ((data[0] << 8) | data[1]) % 31 === 0;
  return inflateRaw(zlib ? data.subarray(2) : data);
}
