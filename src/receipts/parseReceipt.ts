import { findUnit } from '@/lib/units';

import type { ReceiptLineItem } from './types';

const TRAILING_PRICE = /^(.*)\s+\$?(\d{1,6}\.\d{2})\s*[TFNA]?\s*$/;
const UNIT_RE =
  /^(lbs?|ounces?|oz|grams?|g|kilograms?|kg|ml|milliliters?|liters?|litres?|l|ct|pk|pkg|package|gal|gallons?|cups?|tbsp|tsp)$/i;

/**
 * Lines that are not products: totals, tax, tender, and store chrome.
 * A product that merely contains one of these words (for example "total cereal") is kept.
 */
const NON_ITEM =
  /^(sub\s*total|grand\s*total|total|amount\s*due|balance(\s*due)?|sales\s*tax|tax|hst|gst|vat|pst|visa|mastercard|master\s*card|amex|american\s*express|discover|debit|credit(\s*card)?|cash|change(\s*due)?|tend(er)?|approval|auth(orization)?|thank\s*you.*|survey|cashier|coupon|rewards?|member(\s*(savings|discount))?|you\s*saved|savings|items?\s*sold|item\s*count|bottle\s*deposit|bag\s*fee|eco\s*fee|crv)$/i;

const TENDER_START =
  /^(visa|mastercard|master\s*card|amex|american\s*express|discover|debit|credit|cash|gift(\s*card)?|ebt|snap)\b/i;

const TOTAL_START = /^(grand\s*)?(sub\s*)?total\b/i;
const TAX_START = /^(sales\s*)?tax\b|\b(hst|gst|vat|pst)\b/i;

const HEADER =
  /\b(store\s*#|st#|op#|te#|tr#|cashier|thank\s*you|survey|www\.|https?:|welcome|manager|phone|receipt\s*#|items?\s*sold)\b/i;
const PHONE = /\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/;
const DATE_LINE = /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/;

/** The last money amount on a line is the price. Earlier decimals (1.25 lb, @ 0.58/lb) are not. */
function splitTrailingPrice(line: string): { body: string; price?: number } {
  const match = line.match(TRAILING_PRICE);
  if (!match) return { body: line };
  const price = Number(match[2]);
  if (!Number.isFinite(price)) return { body: line };
  return { body: match[1].trim(), price };
}

/** "2 @ 4.48" or "2 @ 4.48 8.96" — quantity for the previous item, not its own product. */
function parseQtyContinuation(line: string): { quantity: number; price?: number } | undefined {
  const m = line.match(
    /^(\d+(?:\.\d+)?)\s*@\s*\$?\d+\.\d{2}(?:\s*\/\s*[a-z]+)?(?:\s+(\$?\d+\.\d{2}))?\s*[a-z]?\s*$/i,
  );
  if (!m) return undefined;
  const quantity = Number(m[1]);
  if (!Number.isFinite(quantity) || quantity <= 0) return undefined;
  const price = m[2] ? Number(m[2].replace('$', '')) : undefined;
  return { quantity, ...(price !== undefined ? { price } : {}) };
}

function canonUnit(token: string | undefined): string | undefined {
  if (!token) return undefined;
  const found = findUnit(token);
  if (found) return found.id;
  const t = token.toLowerCase().replace(/\.$/, '');
  if (t === 'lbs' || t === 'lb') return 'lb';
  if (t === 'ct') return 'ct';
  if (t === 'pk' || t === 'pkg' || t === 'package') return 'package';
  return t;
}

function cleanName(raw: string): string {
  return raw
    .replace(/[@#*]/g, ' ')
    .replace(/\b\d{6,}\b/g, ' ')
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Totals, tax, and payment lines. Product names that only start with those words are kept. */
export function isNonItemName(name: string): boolean {
  const n = name.trim().toLowerCase();
  if (!n) return true;
  if (NON_ITEM.test(n)) return true;
  if (TENDER_START.test(n) && n.split(/\s+/).length <= 4) return true;
  if (TAX_START.test(n) && n.split(/\s+/).length <= 4) return true;
  if (TOTAL_START.test(n)) {
    const rest = n.replace(TOTAL_START, '').trim();
    if (!rest || /^(due|tax|saved)?$/.test(rest)) return true;
  }
  if (/\b(deposit|bag\s*fee|eco\s*fee)\b/.test(n)) return true;
  return false;
}

function looksLikeHeader(line: string): boolean {
  if (HEADER.test(line) || PHONE.test(line)) return true;
  if (DATE_LINE.test(line) && splitTrailingPrice(line).price === undefined) return true;
  // "123 Main Street" / "500 Congress Ave" — a street number, not a quantity.
  return /^\d{1,6}\s+.+\b(st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|way|hwy|pkwy)\b/i.test(
    line,
  );
}

interface QtyName {
  quantity: number;
  unit?: string;
  name: string;
}

function parseQtyName(working: string): QtyName {
  const text = working.replace(/\s+[TFNA]$/i, '').trim();
  // "1.25 lb bananas"
  let m = text.match(/^(\d+(?:\.\d+)?)\s+([a-zA-Z.]+)\s+(.+)$/);
  if (m && UNIT_RE.test(m[2])) {
    return { quantity: Number(m[1]), unit: canonUnit(m[2]), name: cleanName(m[3]) };
  }
  // "bananas 1.25 lb" or "allulose 1 lb"
  m = text.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s+([a-zA-Z.]+)$/);
  if (m && UNIT_RE.test(m[3])) {
    return { quantity: Number(m[2]), unit: canonUnit(m[3]), name: cleanName(m[1]) };
  }
  // "2 eggs" / "2 x eggs"
  m = text.match(/^(\d+(?:\.\d+)?)\s*(?:x|×)?\s+(.+)$/i);
  if (m && !UNIT_RE.test(m[1])) {
    const name = cleanName(m[2]);
    if (name && !/^\d/.test(name)) return { quantity: Number(m[1]), name };
  }
  return { quantity: 1, name: cleanName(text) };
}

function parseItemLine(rawLine: string): ReceiptLineItem | undefined {
  if (/^\d{8,}$/.test(rawLine.replace(/\s/g, ''))) return undefined;
  const { body, price } = splitTrailingPrice(rawLine);
  const hasPrice = price !== undefined;
  if (!hasPrice && (looksLikeHeader(rawLine) || HEADER.test(rawLine) || PHONE.test(rawLine))) return undefined;
  // No price and no leading quantity: store header, slogan, barcode label.
  if (!hasPrice && !/^\d+(?:\.\d+)?\s+\S/.test(rawLine)) return undefined;

  let working = body;
  // "BANANAS 1.25 LB @ 0.58/LB" → drop the unit price, keep the weight.
  working = working.replace(/\s*@\s*\$?\d+\.\d{2}(?:\s*\/\s*[a-z]+)?\s*$/i, '').trim();
  working = working.replace(/^qty\s+/i, '');
  working = working.replace(/\s+[TFNA]$/i, '').trim();
  if (!working || isNonItemName(cleanName(working))) return undefined;

  const parsed = parseQtyName(working);
  if (!parsed.name || isNonItemName(parsed.name)) return undefined;
  if (!Number.isFinite(parsed.quantity) || parsed.quantity <= 0) return undefined;

  return {
    rawText: rawLine,
    name: parsed.name,
    quantity: parsed.quantity,
    ...(parsed.unit ? { unit: parsed.unit } : {}),
    ...(price !== undefined ? { price } : {}),
  };
}

/**
 * OCR text → purchased line items (spec #26).
 * Skips totals, tax, payment, and store-header lines. UI-free.
 */
export function parseReceipt(ocrText: string): ReceiptLineItem[] {
  const lines = ocrText
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const items: ReceiptLineItem[] = [];
  for (const rawLine of lines) {
    const continuation = parseQtyContinuation(rawLine);
    if (continuation) {
      const prev = items[items.length - 1];
      if (prev) {
        prev.quantity = continuation.quantity;
        if (continuation.price !== undefined) prev.price = continuation.price;
      }
      continue;
    }
    const item = parseItemLine(rawLine);
    if (item) items.push(item);
  }
  return items;
}
