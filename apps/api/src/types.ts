import type { Role } from './constants.js';

export interface QueryResult<T> {
  rows: T[];
  rowCount: number;
}

export interface Queryable {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<T>>;
  exec(sql: string): Promise<void>;
}

export interface AuthUser {
  id: string;
  username: string;
  roles: Role[];
}

export interface AuthContext {
  user: AuthUser;
  sessionId: string;
  sessionToken: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthContext;
  }
}
