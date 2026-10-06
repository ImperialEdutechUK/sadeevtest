import { prisma } from '../db.js';
import { logger } from '../logger.js';
import { getEmailProvider } from '../providers/email/index.js';
import { loadConfig } from '../config.js';

export interface NotifyInput {
  userId: string;
  type: string;
  title: string;
  body: string;
  link?: string | null;
  email?: boolean;
}

export async function notify(input: NotifyInput): Promise<void> {
  try {
    await prisma.notification.create({
      data: { userId: input.userId, type: input.type, title: input.title, body: input.body, link: input.link ?? null },
    });
    if (input.email !== false) {
      const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { email: true, emailNotifications: true, firstName: true } });
      if (user?.emailNotifications) {
        const cfg = loadConfig();
        const link = input.link ? `${cfg.WEB_ORIGIN}${input.link}` : cfg.WEB_ORIGIN;
        await getEmailProvider().send({
          to: user.email,
          subject: `[Meeting Review] ${input.title}`,
          text: `Hello ${user.firstName},\n\n${input.body}\n\nOpen Meeting Review: ${link}\n\nYou can turn these emails off in your profile.`,
        });
      }
    }
  } catch (err) {
    logger.warn({ err }, 'notification failed');
  }
}
