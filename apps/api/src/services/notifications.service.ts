import type { AuditLogItem, Notification } from '@slc/shared';
import { prisma } from '../db.js';
import { asRecord, fullName, iso, isoReq } from '../lib/serialize.js';

export async function listNotifications(userId: string): Promise<{ items: Notification[]; unread: number }> {
  const [rows, unread] = await Promise.all([
    prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 30 }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);
  return { items: rows.map((n) => ({ id: n.id, type: n.type, title: n.title, body: n.body, link: n.link, readAt: iso(n.readAt), createdAt: isoReq(n.createdAt) })), unread };
}

export async function markRead(userId: string, ids: string[] | 'all') {
  await prisma.notification.updateMany({ where: { userId, readAt: null, ...(ids === 'all' ? {} : { id: { in: ids } }) }, data: { readAt: new Date() } });
}

export async function listAudit(q: { page: number; pageSize: number; action?: string; entityType?: string; actorId?: string; from?: string; to?: string }): Promise<{ items: AuditLogItem[]; total: number; page: number; pageSize: number }> {
  const where = {
    ...(q.action ? { action: { contains: q.action } } : {}),
    ...(q.entityType ? { entityType: q.entityType } : {}),
    ...(q.actorId ? { actorId: q.actorId } : {}),
    ...(q.from || q.to ? { createdAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ where, include: { actor: true }, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
  ]);
  return {
    items: rows.map((r) => ({ id: r.id, action: r.action, entityType: r.entityType, entityId: r.entityId, actorName: r.actor ? fullName(r.actor) : null, actorEmail: r.actor?.email ?? null, metadata: asRecord(r.metadata), ip: r.ip, createdAt: isoReq(r.createdAt) })),
    total,
    page: q.page,
    pageSize: q.pageSize,
  };
}
