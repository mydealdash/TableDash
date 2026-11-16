import { Inject, Injectable, Logger } from '@nestjs/common';
import { DB, Db } from '../db/db.module';
import { messageOutbox } from '../db/schema';

export type MessageChannel = 'SMS' | 'EMAIL' | 'PUSH';

/**
 * Transactional messaging via an outbox table. A delivery worker (Twilio, SES, Expo push…)
 * reads unsent rows; in development messages are logged and marked sent immediately.
 */
@Injectable()
export class MessagingService {
  private readonly log = new Logger('Messaging');
  constructor(@Inject(DB) private readonly db: Db) {}

  async send(channel: MessageChannel, to: string | null | undefined, template: string, body: string) {
    if (!to) return;
    const sentAt = process.env.MESSAGING_PROVIDER ? null : new Date();
    await this.db.insert(messageOutbox).values({ channel, to, template, body, sentAt });
    if (process.env.NODE_ENV !== 'test') this.log.log(`${channel} → ${to} [${template}] ${body}`);
  }
}
