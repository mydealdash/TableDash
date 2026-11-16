import { BadRequestException, Controller, Get, Inject, NotFoundException, Param, Query } from '@nestjs/common';
import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { Public } from '../auth/auth.guard';
import { DB, Db } from '../db/db.module';
import { policies, restaurants, reviews, users } from '../db/schema';
import { AvailabilityService } from '../availability/availability.service';
import { isDate, isTime, minutesToTime, timeToMinutes, utcToLocal } from '../common/time';

const km = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const R = 6371, dLat = ((lat2 - lat1) * Math.PI) / 180, dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};

@Controller('discovery')
export class DiscoveryController {
  constructor(@Inject(DB) private readonly db: Db, private readonly availability: AvailabilityService) {}

  /**
   * DSC-01..03: search by place, text, date/time/party and filters; each result
   * carries its nearest bookable times so the diner can book from the list.
   */
  @Public() @Get('search')
  async search(
    @Query('q') q?: string, @Query('city') city?: string, @Query('lat') lat?: string, @Query('lng') lng?: string,
    @Query('date') date?: string, @Query('time') time = '19:00', @Query('party') party = '2',
    @Query('cuisine') cuisine?: string, @Query('price') price?: string, @Query('features') features?: string,
    @Query('sort') sort: 'relevance' | 'distance' | 'rating' = 'relevance', @Query('limit') limitRaw = '20',
  ) {
    if (date && !isDate(date)) throw new BadRequestException('date must be YYYY-MM-DD');
    if (!isTime(time)) throw new BadRequestException('time must be HH:mm');
    const partySize = Math.max(1, Math.min(20, Number(party) || 2));
    const conds = [eq(restaurants.status, 'LIVE')];
    if (q) conds.push(or(ilike(restaurants.name, `%${q}%`), ilike(restaurants.cuisine, `%${q}%`), ilike(restaurants.neighborhood, `%${q}%`), ilike(restaurants.description, `%${q}%`))!);
    if (city) conds.push(ilike(restaurants.city, city));
    if (cuisine) conds.push(inArray(restaurants.cuisine, cuisine.split(',')));
    if (price) conds.push(inArray(restaurants.priceBand, price.split(',').map(Number)));
    if (features) conds.push(sql`${restaurants.features} @> ${features.split(',')}::text[]`);
    let rows = await this.db.select().from(restaurants).where(and(...conds)).limit(200);

    const here = lat && lng ? { lat: Number(lat), lng: Number(lng) } : null;
    let list = rows.map((r) => ({ r, distanceKm: here ? Math.round(km(here.lat, here.lng, r.lat, r.lng) * 10) / 10 : null }));
    if (sort === 'distance' && here) list.sort((a, b) => a.distanceKm! - b.distanceKm!);
    else if (sort === 'rating') list.sort((a, b) => b.r.ratingAvg - a.r.ratingAvg);
    else list.sort((a, b) => b.r.ratingCount * b.r.ratingAvg - a.r.ratingCount * a.r.ratingAvg);
    list = list.slice(0, Math.min(50, Number(limitRaw) || 20));

    const center = timeToMinutes(time);
    const from = minutesToTime(Math.max(0, center - 90)); const to = minutesToTime(Math.min(23 * 60 + 45, center + 90));
    const results = await Promise.all(list.map(async ({ r, distanceKm }) => {
      const d = date ?? utcToLocal(new Date(), r.timezone).date;
      const { slots } = await this.availability.slots(r.id, { date: d, partySize, online: true, fromTime: from, toTime: to });
      const open = slots.filter((s) => s.available)
        .sort((a, b) => Math.abs(timeToMinutes(a.time) - center) - Math.abs(timeToMinutes(b.time) - center)).slice(0, 5)
        .sort((a, b) => a.time.localeCompare(b.time)).map((s) => ({ time: s.time, startsAt: s.startsAt, tableTypes: s.tableTypes }));
      return {
        id: r.id, slug: r.slug, name: r.name, cuisine: r.cuisine, priceBand: r.priceBand, neighborhood: r.neighborhood, city: r.city,
        photo: r.photos[0] ?? null, ratingAvg: r.ratingAvg, ratingCount: r.ratingCount, lat: r.lat, lng: r.lng, distanceKm, features: r.features,
        date: d, slots: open,
      };
    }));
    return { partySize, time, results };
  }

  @Public() @Get('cuisines')
  async cuisines() {
    const rows = await this.db.selectDistinct({ c: restaurants.cuisine }).from(restaurants).where(eq(restaurants.status, 'LIVE'));
    return rows.map((r) => r.c).sort();
  }

  /** PRF-01/02: public restaurant profile with policy, table types and verified reviews. */
  @Public() @Get('restaurants/:slugOrId')
  async profile(@Param('slugOrId') key: string) {
    const [r] = await this.db.select().from(restaurants).where(or(eq(restaurants.slug, key), eq(restaurants.id, key)));
    if (!r || r.status === 'SUSPENDED') throw new NotFoundException();
    const [policy] = await this.db.select().from(policies).where(and(eq(policies.restaurantId, r.id), eq(policies.active, true)));
    const tableTypes = await this.db.selectDistinct({ t: sql<string>`table_type` }).from(sql`dining_tables`).where(sql`restaurant_id = ${r.id} and online_bookable`);
    const recent = await this.db.select({ id: reviews.id, rating: reviews.rating, foodRating: reviews.foodRating, serviceRating: reviews.serviceRating,
      ambienceRating: reviews.ambienceRating, text: reviews.text, reply: reviews.reply, createdAt: reviews.createdAt, firstName: users.firstName })
      .from(reviews).innerJoin(users, eq(users.id, reviews.dinerId))
      .where(and(eq(reviews.restaurantId, r.id), eq(reviews.status, 'PUBLISHED'))).orderBy(desc(reviews.createdAt)).limit(20);
    return {
      ...r, tableTypes: tableTypes.map((t) => t.t),
      policy: policy ? { version: policy.version, text: policy.text, cancelCutoffHours: policy.cancelCutoffHours, depositType: policy.depositType,
        depositAmountCents: policy.depositAmountCents, noShowFeeCents: policy.noShowFeeCents, lateCancelFeeCents: policy.lateCancelFeeCents,
        minPartyForDeposit: policy.minPartyForDeposit } : null,
      reviews: recent.map((x) => ({ ...x, author: x.firstName })),
    };
  }
}
