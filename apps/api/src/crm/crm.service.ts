import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { DB, Db, Tx } from '../db/db.module';
import { guestProfiles, reservations } from '../db/schema';

@Injectable()
export class CrmService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** CRM-01: one guest record per restaurant, matched by diner id, phone or email. */
  async upsertForBooking(q: Tx, restaurantId: string, g: { dinerId?: string | null; name: string; phone?: string | null; email?: string | null; dietary?: string | null; marketing?: boolean }) {
    const conds = [
      g.dinerId ? eq(guestProfiles.dinerId, g.dinerId) : undefined,
      g.phone ? eq(guestProfiles.phone, g.phone) : undefined,
      g.email ? eq(guestProfiles.email, g.email.toLowerCase()) : undefined,
    ].filter(Boolean) as any[];
    if (conds.length) {
      const [found] = await q.select().from(guestProfiles).where(and(eq(guestProfiles.restaurantId, restaurantId), or(...conds))).limit(1);
      if (found) {
        await q.update(guestProfiles).set({
          dinerId: found.dinerId ?? g.dinerId ?? null, phone: found.phone ?? g.phone ?? null, email: found.email ?? g.email?.toLowerCase() ?? null,
          allergies: found.allergies || g.dietary || '',
        }).where(eq(guestProfiles.id, found.id));
        return found.id;
      }
    }
    const [first, ...rest] = g.name.trim().split(/\s+/);
    const [created] = await q.insert(guestProfiles).values({
      restaurantId, dinerId: g.dinerId ?? null, firstName: first ?? 'Guest', lastName: rest.join(' '),
      phone: g.phone ?? null, email: g.email?.toLowerCase() ?? null, allergies: g.dietary ?? '', marketingConsent: !!g.marketing,
    }).returning();
    return created.id;
  }

  async bump(q: Tx | Db, guestProfileId: string | null, field: 'visit' | 'noShow' | 'cancel', spendCents = 0) {
    if (!guestProfileId) return;
    const set =
      field === 'visit' ? { visitCount: sql`${guestProfiles.visitCount} + 1`, lastVisitAt: new Date(), totalSpendCents: sql`${guestProfiles.totalSpendCents} + ${spendCents}` }
      : field === 'noShow' ? { noShowCount: sql`${guestProfiles.noShowCount} + 1` }
      : { cancelCount: sql`${guestProfiles.cancelCount} + 1` };
    await q.update(guestProfiles).set(set as any).where(eq(guestProfiles.id, guestProfileId));
    if (field === 'visit') await this.autoTag(q, guestProfileId);
  }

  /** Rule-based tags (CRM-02). */
  private async autoTag(q: Tx | Db, id: string) {
    const [g] = await q.select().from(guestProfiles).where(eq(guestProfiles.id, id));
    if (!g) return;
    const tags = new Set(g.tags);
    if (g.visitCount >= 3) tags.add('Regular');
    if (g.visitCount > 0 && g.totalSpendCents / g.visitCount >= 30000) tags.add('High spender');
    if (g.allergies) tags.add('Allergy');
    await q.update(guestProfiles).set({ tags: [...tags] }).where(eq(guestProfiles.id, id));
  }

  list(restaurantId: string, search?: string, limit = 50, offset = 0) {
    const where = search
      ? and(eq(guestProfiles.restaurantId, restaurantId), or(
          ilike(guestProfiles.firstName, `%${search}%`), ilike(guestProfiles.lastName, `%${search}%`),
          ilike(guestProfiles.phone, `%${search}%`), ilike(guestProfiles.email, `%${search}%`)))
      : eq(guestProfiles.restaurantId, restaurantId);
    return this.db.select().from(guestProfiles).where(where).orderBy(desc(guestProfiles.lastVisitAt)).limit(limit).offset(offset);
  }

  async get(restaurantId: string, id: string) {
    const [g] = await this.db.select().from(guestProfiles).where(and(eq(guestProfiles.id, id), eq(guestProfiles.restaurantId, restaurantId)));
    if (!g) throw new NotFoundException();
    const history = await this.db.select().from(reservations).where(eq(reservations.guestProfileId, id)).orderBy(desc(reservations.startsAt)).limit(100);
    return { ...g, history };
  }

  async update(restaurantId: string, id: string, patch: Partial<{ tags: string[]; notes: string; allergies: string; isVip: boolean; firstName: string; lastName: string; phone: string; email: string; marketingConsent: boolean }>) {
    const [g] = await this.db.update(guestProfiles).set(patch).where(and(eq(guestProfiles.id, id), eq(guestProfiles.restaurantId, restaurantId))).returning();
    if (!g) throw new NotFoundException();
    return g;
  }

  /** CRM-05: restaurant owns and can export its guest data. */
  async exportCsv(restaurantId: string) {
    const rows = await this.db.select().from(guestProfiles).where(eq(guestProfiles.restaurantId, restaurantId));
    const cols = ['firstName', 'lastName', 'phone', 'email', 'tags', 'allergies', 'isVip', 'visitCount', 'noShowCount', 'totalSpendCents', 'lastVisitAt', 'marketingConsent'] as const;
    const esc = (v: unknown) => `"${String(Array.isArray(v) ? v.join('; ') : v ?? '').replace(/"/g, '""')}"`;
    return [cols.join(','), ...rows.map((r) => cols.map((c) => esc((r as any)[c])).join(','))].join('\n');
  }
}
