// Persian (and Finglish-friendly) text helpers.
// Customers mix Arabic and Persian letter forms, Persian and Arabic-Indic digits,
// zero-width non-joiners, and diacritics. Normalize before any matching or parsing.

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_INDIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

export const toEnglishDigits = (input: string): string =>
  input.replace(/[۰-۹٠-٩]/g, (digit) => {
    const persianIndex = PERSIAN_DIGITS.indexOf(digit);
    if (persianIndex !== -1) return String(persianIndex);
    return String(ARABIC_INDIC_DIGITS.indexOf(digit));
  });

/** Persian digits for display, e.g. 250000 -> "۲۵۰٬۰۰۰". */
export const toPersianDigits = (input: string): string =>
  input.replace(/[0-9]/g, (digit) => PERSIAN_DIGITS[Number(digit)]);

/**
 * Canonical form for matching: Persian letters, English digits, no ZWNJ,
 * no diacritics or tatweel, collapsed whitespace, lowercase Latin.
 */
export const normalizePersian = (input: string): string =>
  toEnglishDigits(input)
    .replace(/\u064A/g, '\u06CC') // Arabic yeh -> Persian yeh
    .replace(/\u0643/g, '\u06A9') // Arabic kaf -> Persian kaf
    .replace(/\u200C/g, '') // zero-width non-joiner: "می‌خوام" == "میخوام"
    .replace(/[\u064B-\u065F\u0670]/g, '') // harakat
    .replace(/\u0640/g, '') // tatweel
    .replace(/\u060C/g, ',') // Arabic comma
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

// Words that carry no product meaning. Used when turning a message into search terms.
const STOP_WORDS = new Set([
  'سلام', 'سلم', 'ببخشید', 'ببخشيد', 'میشه', 'می‌شه', 'لطفا', 'لطفاً', 'دارید', 'دارین', 'داری', 'دارم',
  'دارد', 'هست', 'هستش', 'قیمت', 'قیمتش', 'چنده', 'چند', 'چقدر', 'موجودی', 'موجوده', 'موجود', 'این', 'اون',
  'آن', 'اینو', 'اونو', 'رو', 'را', 'یه', 'یک', 'یا', 'که', 'و', 'با', 'از', 'به', 'در', 'برای', 'من', 'شما',
  'میخوام', 'می‌خوام', 'میخوام', 'خواستم', 'بفرستید', 'بفرست', 'میخوام', 'ممنون', 'مرسی', 'ok', 'hi',
  'hello', 'salam', 'dare', 'darin', 'cheghadr', 'chande', 'gheymat', 'ghimat', 'mojoodi',
]);

/** Splits a customer message into normalized search terms, dropping stop words and very short tokens. */
export const extractSearchTerms = (message: string): string[] => {
  const normalized = normalizePersian(message).replace(/[?؟!.,،:;()\[\]"'«»]/g, ' ');
  const seen = new Set<string>();
  for (const token of normalized.split(' ')) {
    if (token.length < 2 || STOP_WORDS.has(token)) continue;
    seen.add(token);
  }
  return [...seen];
};

const MULTIPLIERS: Array<{ word: string; factor: number }> = [
  { word: 'میلیارد', factor: 1_000_000_000 },
  { word: 'میلیون', factor: 1_000_000 },
  { word: 'هزار', factor: 1_000 },
];

/**
 * Parses a price written in text into integer toman.
 * Handles "۲۵۰ هزار تومان", "۲,۵۰۰,۰۰۰ ریال", "1.5 میلیون", and bare numbers.
 * Bare numbers use defaultUnit. Returns null when no price is found.
 */
export const parsePriceToToman = (
  text: string,
  defaultUnit: 'toman' | 'rial' = 'toman',
): number | null => {
  let source = normalizePersian(text);
  // Thousands separators: "250,000" or "2.500.000" stay readable; decimals like "1.5" are kept.
  source = source.replace(/(\d)[,٬](?=\d{3}\b)/g, '$1').replace(/(\d)\.(?=\d{3}\b)/g, '$1');

  const match = source.match(/(\d+(?:\.\d+)?)\s*(میلیارد|میلیون|هزار)?\s*(تومان|تومن|ریال)?/);
  if (!match) return null;

  let amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;

  const multiplier = MULTIPLIERS.find((m) => m.word === match[2]);
  if (multiplier) amount *= multiplier.factor;

  const unit = match[3] === 'ریال' ? 'rial' : match[3] ? 'toman' : defaultUnit;
  if (unit === 'rial') amount /= 10; // 10 rial = 1 toman

  return Math.round(amount);
};

/** Formats integer toman for customer-facing text, e.g. 250000 -> "۲۵۰٬۰۰۰ تومان". */
export const formatToman = (amount: number): string => {
  const grouped = Math.round(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '٬');
  return `${toPersianDigits(grouped)} تومان`;
};

/** Rough script/style check so replies can follow the customer's style. */
export type MessageStyle = 'persian' | 'finglish' | 'english' | 'unknown';

export const detectMessageStyle = (text: string): MessageStyle => {
  if (/[\u0600-\u06FF]/.test(text)) return 'persian';
  const latin = normalizePersian(text);
  if (!/[a-z]/.test(latin)) return 'unknown';
  // Common Finglish markers; a plain English question rarely contains these.
  const finglishMarkers = /\b(dari|darin|chand|chande|cheghadr|gheymat|mikham|mikhad|khoob|salam|mishe|kharid|sefareshi|mojodi|tooye|shalvar|montaghel)\b/;
  return finglishMarkers.test(latin) ? 'finglish' : 'english';
};
