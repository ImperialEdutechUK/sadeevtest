import { z } from 'zod';

export const IdParamSchema = z.object({ id: z.string().min(1) });

/** "true"/"false" (or 1/0) query-string flags; z.coerce.boolean() would treat "false" as true. */
export const QueryBoolSchema = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((v) => v === true || v === 'true' || v === '1')
  .optional();
export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

export const DateRangeQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export const OkResponseSchema = z.object({ ok: z.literal(true) });
