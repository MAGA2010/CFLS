import { z } from 'zod';
import {
  CONTENT_STATUSES,
  CONTENT_TYPES,
  TYPE_CATEGORY_SET,
  type ContentStatus,
  type ContentType,
} from './constants.js';
import { errors } from './errors.js';

const typeSchema = z.enum(CONTENT_TYPES);
export function validPair(type: string, category: string): boolean {
  return TYPE_CATEGORY_SET.has(`${type}:${category}`);
}

export const contentCreateSchema = z
  .object({
    type: typeSchema,
    category: z.string().trim().min(1).max(40),
    title: z.string().trim().min(1).max(120),
    summary: z.string().max(300).optional(),
    body: z.string().max(20_000).default(''),
    isDemo: z.boolean().default(true),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!validPair(value.type, value.category)) {
      ctx.addIssue({ code: 'custom', path: ['category'], message: 'type and category are not a valid pair' });
    }
  });

export const contentPatchSchema = z
  .object({
    type: typeSchema.optional(),
    category: z.string().trim().min(1).max(40).optional(),
    title: z.string().trim().min(1).max(120).optional(),
    summary: z.string().max(300).nullable().optional(),
    body: z.string().max(20_000).optional(),
    isDemo: z.boolean().optional(),
    version: z.number().int().positive(),
  })
  .strict();

export const versionSchema = z.object({ version: z.number().int().positive() }).strict();
export const rejectSchema = z
  .object({ version: z.number().int().positive(), reason: z.string().trim().min(1).max(500) })
  .strict();

export const loginSchema = z
  .object({ username: z.string().trim().min(1).max(100), password: z.string().min(1).max(200) })
  .strict();

export const inquirySchema = z
  .object({
    kind: z.enum(['consultation', 'visit']),
    testName: z.string().trim().min(1).max(40),
    testContact: z.string().trim().min(1).max(100),
    message: z.string().max(500).optional(),
    isTest: z.literal(true),
  })
  .strict();

export const paginationSchema = z.object({
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(20),
});

export function parsePagination(query: Record<string, unknown>): { page: number; pageSize: number; offset: number } {
  const page = parsePositiveInt(query.page, 1);
  const pageSize = parsePositiveInt(query.pageSize, 20);
  if (page < 1 || pageSize < 1 || pageSize > 100) throw errors.validation('Invalid pagination');
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function parsePositiveInt(value: unknown, fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) throw errors.validation('Invalid pagination');
  return Number(value);
}

export function parseStatus(value: unknown): ContentStatus | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !(CONTENT_STATUSES as readonly string[]).includes(value)) {
    throw errors.validation('Invalid status');
  }
  return value as ContentStatus;
}

export function parseType(value: unknown): ContentType | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !(CONTENT_TYPES as readonly string[]).includes(value)) {
    throw errors.validation('Invalid content type');
  }
  return value as ContentType;
}

export function requireString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) throw errors.validation(`${name} is required`);
  return value;
}
