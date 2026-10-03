/** Learned receipt shorthand → pantry name (household-shared). */
export interface LearnedAlias {
  alias: string;
  name: string;
}

/** One purchased line parsed from receipt OCR text (spec #26). */
export interface ReceiptLineItem {
  /** The OCR line the item came from (price and quantity still in the string). */
  rawText: string;
  /** Product words, lowercased, without quantity, unit, or price. */
  name: string;
  quantity: number;
  unit?: string;
  price?: number;
}

export type ReceiptMatchKind = 'alias' | 'exact' | 'fuzzy' | 'new';

/** A parsed line plus the pantry match the review screen shows. */
export interface ReviewLine extends ReceiptLineItem {
  id: string;
  /** Product name from the parser, before matching or editing. Alias key. */
  parsedName: string;
  /** Name the user will apply (editable). */
  name: string;
  skipped: boolean;
  pantryItemId?: string;
  match: ReceiptMatchKind;
  /** Name shown before the user edited. A change from this is a learned correction. */
  suggestedName: string;
}

export interface ApplyReceiptResult {
  applied: number;
  createdAliases: number;
  /** Set when receipt scanning or pantry is gated off. Nothing was written. */
  locked?: boolean;
}
