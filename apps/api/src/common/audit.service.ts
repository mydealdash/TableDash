import { Inject, Injectable } from '@nestjs/common';
import { DB, Db } from '../db/db.module';
import { auditLogs } from '../db/schema';

@Injectable()
export class AuditService {
  constructor(@Inject(DB) private readonly db: Db) {}
  async log(entry: { actorId?: string | null; restaurantId?: string | null; action: string; entity: string; entityId?: string; data?: unknown }) {
    await this.db.insert(auditLogs).values({ ...entry, data: entry.data as any });
  }
}
