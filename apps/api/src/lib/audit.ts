import { prisma } from '../db.js';
import { logger } from '../logger.js';

export interface AuditInput {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
}

/** Fire-and-forget audit record. Never throws - an audit failure must not break the request. */
export function audit(input: AuditInput): void {
  prisma.auditLog
    .create({
      data: {
        actorId: input.actorId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        metadata: (input.metadata ?? undefined) as never,
        ip: input.ip ?? null,
      },
    })
    .catch((err: unknown) => logger.warn({ err }, 'audit log write failed'));
}
