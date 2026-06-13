import { readFileSync } from 'node:fs';

export type MarkdownHeading = {
  readonly level: number;
  readonly text: string;
};

export type MarkdownLink = {
  readonly text: string;
  readonly target: string;
};

export type MarkdownTableRow = {
  readonly cells: readonly string[];
};

export type MarkdownTaskRow = {
  readonly status: string;
  readonly id: string;
  readonly text: string;
};

const HEADING_PATTERN = /^(#{1,6})\s+(.+)$/u;
const LINK_PATTERN = /\[([^\]]+)\]\(([^)]+)\)/gu;
const TASK_ROW_PATTERN = /^\s*\[([ x~✗])\]\s+([A-Za-z][A-Za-z0-9_-]+)\b(.*)$/u;
const LIST_ITEM_PATTERN = /^\s*(?:[-*+]|\d+\.)\s+(.+)$/u;

export default class MarkdownDocument {
  readonly text: string;

  constructor(text: string) {
    this.text = text;
    Object.freeze(this);
  }

  static fromFile(path: string): MarkdownDocument {
    return new MarkdownDocument(readFileSync(path, 'utf8'));
  }

  headings(): readonly MarkdownHeading[] {
    return this.lines().flatMap((line) => {
      const match = HEADING_PATTERN.exec(line);
      if (match === null) {
        return [];
      }
      const marker = match[1] ?? '';
      const text = match[2] ?? '';
      return [Object.freeze({ level: marker.length, text })];
    });
  }

  hasHeading(level: number, text: string): boolean {
    return this.headings().some((heading) => heading.level === level && heading.text === text);
  }

  links(): readonly MarkdownLink[] {
    const links: MarkdownLink[] = [];
    for (const match of this.text.matchAll(LINK_PATTERN)) {
      const text = match[1];
      const target = match[2];
      if (text !== undefined && target !== undefined) {
        links.push(Object.freeze({ text, target }));
      }
    }
    return links;
  }

  hasLink(text: string, target: string): boolean {
    return this.links().some((link) => link.text === text && link.target === target);
  }

  containsText(text: string): boolean {
    return this.text.includes(text);
  }

  tableRows(): readonly MarkdownTableRow[] {
    const rows: MarkdownTableRow[] = [];
    for (const line of this.lines()) {
      if (!line.startsWith('|') || !line.endsWith('|')) {
        continue;
      }
      const cells = line
        .slice(1, -1)
        .split('|')
        .map((cell) => cell.trim());
      if (cells.every((cell) => /^:?-{3,}:?$/u.test(cell))) {
        continue;
      }
      rows.push(Object.freeze({ cells: Object.freeze(cells) }));
    }
    return rows;
  }

  tableRowByFirstCell(firstCell: string): MarkdownTableRow | undefined {
    return this.tableRows().find((row) => row.cells[0] === firstCell);
  }

  tableRowContainingCell(cell: string): MarkdownTableRow | undefined {
    return this.tableRows().find((row) => row.cells.includes(cell));
  }

  listItems(): readonly string[] {
    return this.lines().flatMap((line) => {
      const match = LIST_ITEM_PATTERN.exec(line);
      const item = match?.[1];
      return item === undefined ? [] : [item];
    });
  }

  taskRows(): readonly MarkdownTaskRow[] {
    const rows: MarkdownTaskRow[] = [];
    for (const line of this.lines()) {
      const match = TASK_ROW_PATTERN.exec(line);
      if (match === null) {
        continue;
      }
      const status = match[1];
      const id = match[2];
      const text = match[3];
      if (status !== undefined && id !== undefined && text !== undefined) {
        rows.push(Object.freeze({ status, id, text: text.trim() }));
      }
    }
    return rows;
  }

  taskRow(id: string): MarkdownTaskRow | undefined {
    return this.taskRows().find((row) => row.id === id);
  }

  private lines(): readonly string[] {
    return this.text.split('\n');
  }
}
