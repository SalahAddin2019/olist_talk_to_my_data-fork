// Turns a Markdown table from an answer into chartable data. A table is chartable when it
// has a label column plus at least one column whose cells are all non-negative numbers.

export interface TableData {
  headers: string[];
  rows: string[][];
}

export interface Series {
  label: string;
  column: number;
}

const MAX_BARS = 30;

// Accepts "R$ 1,234.56", "1.234,56", "12.5%", "3.2K", "-" is not a number.
export function parseNumber(raw: string): number | null {
  let text = raw
    .trim()
    .replace(/^(R\$|US\$|\$|€|£)\s*/i, '')
    .replace(/\s*%$/, '');
  const scale = /^[\d.,]+\s*([kmb])$/i.exec(text)?.[1]?.toLowerCase();
  if (scale) text = text.slice(0, -1).trim();
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(text) || /^\d+,\d{1,2}$/.test(text)) {
    text = text.replace(/\./g, '').replace(',', '.'); // pt-BR
  } else {
    text = text.replace(/,/g, '');
  }
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const factor = scale === 'k' ? 1e3 : scale === 'm' ? 1e6 : scale === 'b' ? 1e9 : 1;
  return Number(text) * factor;
}

export function numericSeries({ headers, rows }: TableData): Series[] {
  if (rows.length < 2 || rows.length > MAX_BARS || headers.length < 2) return [];
  return headers.flatMap((label, column) =>
    column > 0 &&
    rows.every((row) => row[column] !== undefined && parseNumber(row[column]) !== null)
      ? [{ label, column }]
      : [],
  );
}

interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  children?: HastNode[];
}

function text(node: HastNode): string {
  if (node.type === 'text') return node.value ?? '';
  return (node.children ?? []).map(text).join('');
}

function find(node: HastNode, tag: string): HastNode[] {
  if (node.tagName === tag) return [node];
  return (node.children ?? []).flatMap((child) => find(child, tag));
}

export function fromHast(table: HastNode): TableData {
  const [head, ...body] = find(table, 'tr').map((row) =>
    (row.children ?? [])
      .filter((cell) => cell.tagName === 'th' || cell.tagName === 'td')
      .map((cell) => text(cell).trim()),
  );
  return { headers: head ?? [], rows: body };
}
