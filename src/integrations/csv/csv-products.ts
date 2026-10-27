import { parsePriceToToman, normalizePersian, toEnglishDigits } from '../../utils/persian';
import { type ProductDraft, type ProductDraftVariant } from '../../domain/product-draft';
import { createHash } from 'node:crypto';

// Minimal RFC 4180 parser: quoted fields, escaped quotes, CRLF or LF, optional BOM.
export const parseCsv = (text: string): string[][] => {
  const input = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (inQuotes) {
      if (char === '"' && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') inQuotes = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((cell) => cell.trim() !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  row.push(field);
  if (row.some((cell) => cell.trim() !== '')) rows.push(row);
  return rows;
};

// Header aliases, English and Persian. Anything not listed is ignored unless it is "attr:<name>".
const HEADER_ALIASES: Record<string, string[]> = {
  name: ['name', 'product', 'title', 'نام', 'نام محصول', 'عنوان', 'عنوان محصول'],
  price: ['price', 'قیمت', 'قیمت فروش'],
  stock: ['stock', 'inventory', 'quantity', 'موجودی', 'تعداد'],
  sku: ['sku', 'کد', 'کد محصول', 'کد کالا'],
  color: ['color', 'colour', 'رنگ'],
  size: ['size', 'سایز', 'اندازه'],
  description: ['description', 'توضیحات', 'توضیح'],
  category: ['category', 'دسته', 'دسته بندی', 'دسته‌بندی'],
  image: ['image', 'image_url', 'image_urls', 'تصویر', 'عکس'],
};

const canonicalHeader = (header: string): string => {
  const normalized = normalizePersian(header).replace(/[-_]/g, ' ').trim();
  for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.some((alias) => normalizePersian(alias).replace(/[-_]/g, ' ') === normalized)) {
      return canonical;
    }
  }
  if (normalized.startsWith('attr:')) return `attr:${normalized.slice(5).trim()}`;
  return '';
};

export type CsvImportError = { row: number; message: string };
export type CsvImportResult = { drafts: ProductDraft[]; errors: CsvImportError[]; rowCount: number };

const externalIdFor = (name: string): string =>
  `csv:${createHash('sha1').update(normalizePersian(name)).digest('hex').slice(0, 16)}`;

/**
 * Turns CSV rows into product drafts. Rows with the same product name become one product
 * with several variants (e.g. one row per colour and size).
 */
export const csvToProductDrafts = (
  text: string,
  options: { priceUnit: 'toman' | 'rial' },
): CsvImportResult => {
  const rows = parseCsv(text);
  if (rows.length < 2) {
    return { drafts: [], errors: [{ row: 1, message: 'CSV needs a header row and at least one product row' }], rowCount: 0 };
  }

  const headers = rows[0].map(canonicalHeader);
  if (!headers.includes('name')) {
    return { drafts: [], errors: [{ row: 1, message: 'Missing product name column (name / نام محصول)' }], rowCount: rows.length - 1 };
  }
  if (!headers.includes('price')) {
    return { drafts: [], errors: [{ row: 1, message: 'Missing price column (price / قیمت)' }], rowCount: rows.length - 1 };
  }

  const errors: CsvImportError[] = [];
  const grouped = new Map<string, { name: string; rows: Array<{ variant: ProductDraftVariant; row: Record<string, string> }> }>();

  rows.slice(1).forEach((cells, index) => {
    const lineNumber = index + 2;
    const record: Record<string, string> = {};
    headers.forEach((key, column) => {
      if (key) record[key] = (cells[column] ?? '').trim();
    });

    if (!record.name) {
      errors.push({ row: lineNumber, message: 'Product name is empty' });
      return;
    }

    const priceToman = parsePriceToToman(record.price ?? '', options.priceUnit);
    if (priceToman === null) {
      errors.push({ row: lineNumber, message: `Cannot read price "${record.price}"` });
      return;
    }

    const stockText = toEnglishDigits(record.stock ?? '').trim();
    const stock = stockText === '' ? 0 : Number(stockText);
    if (!Number.isInteger(stock) || stock < 0) {
      errors.push({ row: lineNumber, message: `Cannot read stock "${record.stock}"` });
      return;
    }

    const attributes: Record<string, string> = {};
    if (record.color) attributes['رنگ'] = record.color;
    if (record.size) attributes['سایز'] = record.size;
    for (const [key, value] of Object.entries(record)) {
      if (key.startsWith('attr:') && value) attributes[key.slice(5)] = value;
    }

    const groupKey = normalizePersian(record.name);
    const group = grouped.get(groupKey) ?? { name: record.name, rows: [] };
    group.rows.push({
      variant: {
        externalId: null,
        sku: record.sku || null,
        priceToman,
        stock,
        attributes,
      },
      row: record,
    });
    grouped.set(groupKey, group);
  });

  const drafts: ProductDraft[] = [...grouped.values()].map((group) => {
    const first = group.rows[0].row;
    const warnings: string[] = [];
    const priceSet = new Set(group.rows.map((r) => r.variant.priceToman));
    if (priceSet.size > 1 && group.rows.every((r) => Object.keys(r.variant.attributes).length === 0)) {
      warnings.push('Rows share a product name but have different prices and no colour/size; they were merged as variants.');
    }

    return {
      externalId: externalIdFor(group.name),
      name: group.name,
      description: first.description || null,
      category: first.category || null,
      status: 'published',
      imageUrls: first.image ? first.image.split(/[|;]/).map((url) => url.trim()).filter(Boolean) : [],
      variants: group.rows.map((r) => r.variant),
      warnings,
    };
  });

  return { drafts, errors, rowCount: rows.length - 1 };
};
