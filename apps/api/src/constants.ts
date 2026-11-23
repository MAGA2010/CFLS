export const CONTENT_TYPES = [
  'school',
  'academics',
  'outcomes',
  'campus',
  'student_union',
  'news',
  'admissions',
  'contact',
] as const;

export type ContentType = (typeof CONTENT_TYPES)[number];

export const CONTENT_STATUSES = ['draft', 'pending_review', 'approved', 'published'] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const ROLES = ['editor', 'reviewer', 'admissions', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export const TYPE_CATEGORY_PAIRS = [
  ['school', 'overview'],
  ['school', 'head_message'],
  ['school', 'mission'],
  ['school', 'history'],
  ['school', 'faculty'],
  ['school', 'partnerships'],
  ['academics', 'overview'],
  ['academics', 'foundation'],
  ['academics', 'ap'],
  ['academics', 'alevel'],
  ['academics', 'subjects'],
  ['academics', 'calendar'],
  ['outcomes', 'counseling'],
  ['outcomes', 'outcomes'],
  ['admissions', 'why_us'],
  ['admissions', 'application'],
  ['admissions', 'requirements'],
  ['admissions', 'fees'],
  ['admissions', 'faq'],
  ['admissions', 'consultation'],
  ['campus', 'clubs'],
  ['campus', 'boarding'],
  ['campus', 'facilities'],
  ['news', 'updates'],
  ['contact', 'contact'],
  ['student_union', 'overview'],
] as const;

export const TYPE_CATEGORY_SET = new Set(TYPE_CATEGORY_PAIRS.map(([type, category]) => `${type}:${category}`));

export const ROUTE_ACCESS = {
  'content.list': ['editor', 'reviewer', 'admin'],
  'content.create': ['editor', 'admin'],
  'content.read': ['editor', 'reviewer', 'admin'],
  'content.update': ['editor', 'admin'],
  'content.submit': ['editor', 'admin'],
  'content.review': ['reviewer', 'admin'],
  'content.revisions': ['editor', 'reviewer', 'admin'],
  'inquiry.read': ['admissions', 'admin'],
  'audit.read': ['admin'],
} as const satisfies Record<string, readonly Role[]>;

export type AccessKey = keyof typeof ROUTE_ACCESS;

export const AUDIT_ACTIONS = [
  'auth.login.success',
  'auth.login.failure',
  'auth.logout',
  'authz.denied',
  'content.create',
  'content.update',
  'content.submit',
  'content.approve',
  'content.reject',
  'content.publish',
  'content.unpublish',
  'inquiry.read',
] as const;

export const TRANSITIONS: Record<string, { from: ContentStatus; to: ContentStatus; audit: string }> = {
  submit: { from: 'draft', to: 'pending_review', audit: 'content.submit' },
  approve: { from: 'pending_review', to: 'approved', audit: 'content.approve' },
  reject: { from: 'pending_review', to: 'draft', audit: 'content.reject' },
  publish: { from: 'approved', to: 'published', audit: 'content.publish' },
  unpublish: { from: 'published', to: 'draft', audit: 'content.unpublish' },
};

export const SESSION_COOKIE = 'cfls_session';
export const CSRF_COOKIE = 'cfls_csrf';
export const CSRF_HEADER = 'x-csrf-token';
