/**
 * Tiny PDF writer for tests (Import PDF): Helvetica text pages with WinAnsi encoding, optionally Flate-compressed
 * content, TJ kerning arrays and a /Differences encoding; or an image-only page (what a scan looks like).
 */
const zlib = jest.requireActual('zlib');

export interface SimplePdfOptions {
  compress?: boolean;
  /** Show each line as a TJ array with kerning between characters (like many generators do). */
  kerned?: boolean;
  /** Use a /Differences encoding that maps code 1 → "quoteright". */
  differences?: boolean;
  /** Draw the text inside a Form XObject instead of the page content. */
  form?: boolean;
}

function latin1(s: string): number[] {
  return Array.from(s).map((ch) => {
    if (ch === '’') return 0x92;
    if (ch === '–') return 0x96;
    if (ch === '°') return 0xb0;
    if (ch === '•') return 0x95;
    const c = ch.charCodeAt(0);
    return c < 256 ? c : 0x3f;
  });
}

function pdfString(s: string, differences: boolean): string {
  return (
    '(' +
    latin1(s)
      .map((c) => {
        if (differences && c === 0x92) return '\\001';
        const ch = String.fromCharCode(c);
        if (ch === '(' || ch === ')' || ch === '\\') return `\\${ch}`;
        return c >= 32 && c < 127 ? ch : `\\${c.toString(8).padStart(3, '0')}`;
      })
      .join('') +
    ')'
  );
}

function build(objects: (string | Uint8Array)[][]): Uint8Array {
  const chunks: number[] = [];
  const push = (s: string | Uint8Array) => {
    if (typeof s === 'string') for (const c of latin1(s)) chunks.push(c);
    else chunks.push(...s);
  };
  push('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n');
  const offsets: number[] = [];
  objects.forEach((parts, i) => {
    offsets.push(chunks.length);
    push(`${i + 1} 0 obj\n`);
    parts.forEach(push);
    push('\nendobj\n');
  });
  const xref = chunks.length;
  push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  for (const o of offsets) push(`${String(o).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Uint8Array(chunks);
}

function stream(dict: string, content: string, compress: boolean): (string | Uint8Array)[] {
  const raw = new Uint8Array(latin1(content));
  const data: Uint8Array = compress ? new Uint8Array(zlib.deflateSync(raw)) : raw;
  return [
    `<< ${dict} /Length ${data.length}${compress ? ' /Filter /FlateDecode' : ''} >>\nstream\n`,
    data,
    '\nendstream',
  ];
}

/** Each page is a list of lines (empty string = blank line). */
export function simplePdf(pages: string[][], options: SimplePdfOptions = {}): Uint8Array {
  const { compress = true, kerned = false, differences = false, form = false } = options;
  // 1 catalog, 2 pages, 3 font, then per page: page, content (+ form).
  const per = form ? 3 : 2;
  const kids = pages.map((_, i) => `${4 + i * per} 0 R`).join(' ');
  const encoding = differences
    ? '<< /Type /Encoding /BaseEncoding /WinAnsiEncoding /Differences [1 /quoteright] >>'
    : '/WinAnsiEncoding';
  const objects: (string | Uint8Array)[][] = [
    ['<< /Type /Catalog /Pages 2 0 R >>'],
    [`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} /Resources << /Font << /F1 3 0 R >> >> >>`],
    [`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding ${encoding} >>`],
  ];
  pages.forEach((lines, i) => {
    const pageId = 4 + i * per;
    let y = 760;
    const ops: string[] = ['BT', '/F1 11 Tf'];
    let first = true;
    for (const line of lines) {
      const size = first ? 18 : 11;
      const step = line ? size * 1.4 : 11;
      if (!line) {
        y -= step;
        continue;
      }
      ops.push(`/F1 ${size} Tf`, `1 0 0 1 56 ${y} Tm`);
      if (kerned) {
        const parts = Array.from(line).map((ch) => `${pdfString(ch, differences)} -5`);
        ops.push(`[${parts.join(' ')}] TJ`);
      } else ops.push(`${pdfString(line, differences)} Tj`);
      y -= step;
      first = false;
    }
    ops.push('ET');
    const content = ops.join('\n');
    if (form) {
      objects.push(
        [
          `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${pageId + 1} 0 R /Resources << /XObject << /X1 ${pageId + 2} 0 R >> >> >>`,
        ],
        stream('', 'q 1 0 0 1 0 0 cm /X1 Do Q', compress),
        stream(
          '/Type /XObject /Subtype /Form /BBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >>',
          content,
          compress,
        ),
      );
    } else {
      objects.push(
        [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${pageId + 1} 0 R >>`],
        stream('', content, compress),
      );
    }
  });
  return build(objects);
}

/** A one-page PDF that is just an image (like a phone scan): no text at all. */
export function imageOnlyPdf(): Uint8Array {
  const pixels = '\xff\x00\x00'.repeat(4);
  return build([
    ['<< /Type /Catalog /Pages 2 0 R >>'],
    ['<< /Type /Pages /Kids [3 0 R] /Count 1 >>'],
    [
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /XObject << /Im1 5 0 R >> >> >>',
    ],
    stream('', 'q 612 0 0 792 0 0 cm /Im1 Do Q', true),
    stream(
      '/Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceRGB /BitsPerComponent 8',
      pixels,
      true,
    ),
  ]);
}
