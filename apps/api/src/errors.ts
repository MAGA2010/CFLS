import type { FastifyReply } from 'fastify';
import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const errors = {
  validation: (details?: unknown) => new AppError(400, 'VALIDATION_FAILED', 'Request validation failed', details),
  unauthenticated: () => new AppError(401, 'UNAUTHENTICATED', 'Authentication required'),
  authFailed: () => new AppError(401, 'AUTH_FAILED', 'Invalid username or password'),
  forbidden: () => new AppError(403, 'FORBIDDEN', 'Permission denied'),
  selfReview: () => new AppError(403, 'SELF_REVIEW_FORBIDDEN', 'You cannot review your own content'),
  csrf: () => new AppError(403, 'CSRF_INVALID', 'CSRF token is missing or invalid'),
  notFound: () => new AppError(404, 'NOT_FOUND', 'Resource not found'),
  versionConflict: (currentVersion: number) =>
    new AppError(409, 'VERSION_CONFLICT', 'The resource version has changed', { currentVersion }),
  invalidTransition: () => new AppError(409, 'INVALID_TRANSITION', 'The requested status transition is not allowed'),
  idempotencyConflict: () => new AppError(409, 'IDEMPOTENCY_CONFLICT', 'Idempotency key was used with different content'),
  rateLimited: () => new AppError(429, 'RATE_LIMITED', 'Too many requests'),
  internal: () => new AppError(500, 'INTERNAL_ERROR', 'Internal server error'),
};

export function sendError(reply: FastifyReply, requestId: string, error: AppError): FastifyReply {
  return reply.status(error.statusCode).send({
    error: {
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    },
    requestId,
  });
}

export function normalizeError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof ZodError) {
    return errors.validation(
      error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }
  return errors.internal();
}
