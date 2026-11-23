import type { ContentStatus } from './constants.js';

export interface ContentRow extends Record<string, unknown> {
  id: string;
  type: string;
  category: string;
  title: string;
  summary: string | null;
  body: string;
  status: ContentStatus;
  version: number;
  author_id: string;
  reviewer_id: string | null;
  published_at: string | Date | null;
  is_demo: boolean;
  created_at: string | Date;
  updated_at: string | Date;
}

export function publicContent(row: ContentRow) {
  return {
    id: row.id,
    type: row.type,
    category: row.category,
    title: row.title,
    summary: row.summary,
    body: row.body,
    publishedAt: toIso(row.published_at),
    isDemo: row.is_demo,
  };
}

export function adminContent(row: ContentRow) {
  return {
    ...publicContent(row),
    status: row.status,
    version: row.version,
    authorId: row.author_id,
    reviewerId: row.reviewer_id,
    updatedAt: toIso(row.updated_at),
  };
}

export function toIso(value: string | Date | null | undefined): string | null {
  return value == null ? null : new Date(value).toISOString();
}
