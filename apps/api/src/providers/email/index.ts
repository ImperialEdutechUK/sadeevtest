import { loadConfig } from '../../config.js';
import { logger } from '../../logger.js';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}
export interface EmailProvider {
  send(msg: EmailMessage): Promise<void>;
}

class NoopEmail implements EmailProvider {
  async send(msg: EmailMessage): Promise<void> {
    logger.info({ to: msg.to, subject: msg.subject }, 'email (not sent - EMAIL_PROVIDER=none)');
  }
}

class SesEmail implements EmailProvider {
  private clientPromise: Promise<import('@aws-sdk/client-ses').SESClient> | null = null;
  constructor(private region: string, private from: string) {}
  private async client() {
    if (!this.clientPromise) {
      this.clientPromise = import('@aws-sdk/client-ses').then((m) => new m.SESClient({ region: this.region }));
    }
    return this.clientPromise;
  }
  async send(msg: EmailMessage): Promise<void> {
    const { SendEmailCommand } = await import('@aws-sdk/client-ses');
    const client = await this.client();
    await client.send(
      new SendEmailCommand({
        Source: this.from,
        Destination: { ToAddresses: [msg.to] },
        Message: {
          Subject: { Data: msg.subject, Charset: 'UTF-8' },
          Body: {
            Text: { Data: msg.text, Charset: 'UTF-8' },
            ...(msg.html ? { Html: { Data: msg.html, Charset: 'UTF-8' } } : {}),
          },
        },
      }),
    );
  }
}

let instance: EmailProvider | null = null;
export function getEmailProvider(): EmailProvider {
  if (instance) return instance;
  const cfg = loadConfig();
  instance = cfg.EMAIL_PROVIDER === 'ses' ? new SesEmail(cfg.SES_REGION, cfg.EMAIL_FROM) : new NoopEmail();
  return instance;
}
