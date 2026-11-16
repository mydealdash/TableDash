/**
 * Diner restaurant search powered by Google Places, merged with TableDash.
 * Every result shows Google's photo, rating, price and address. Restaurants that are on
 * TableDash (matched by their linked Google place ID) also carry bookable times.
 */
import { BadRequestException, Controller, Delete, Get, Inject, Param, Post, Query } from '@nestjs/common';
import { and, eq, ilike, inArray, or } from 'drizzle-orm';
import { AuthOptional, AuthUser, CurrentUser } from '../auth/auth.guard';
import { DB, Db } from '../db/db.module';
import { placeInterests, restaurants } from '../db/schema';
import { AvailabilityService } from '../availability/availability.service';
import { isDate, isTime, minutesToTime, timeToMinutes, utcToLocal } from '../common/time';
import { GooglePlacesService } from './google-places.service';

const km = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const R = 6371, dLat = ((b.lat - a.lat) * Math.PI) / 180, dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(x)) * 10) / 10;
};
const PLACE_ID = /^[A-Za-z0-9_-]{10,300}$/;

@Controller('discovery')
export class GoogleSearchController {
  constructor(@Inject(DB) private readonly db: Db, private readonly google: GooglePlacesService, private readonly availability: AvailabilityService) {}

  private async bookableTimes(r: typeof restaurants.$inferSelect, date: string | undefined, time: string, party: number) {
    const d = date ?? utcToLocal(new Date(), r.timezone).date;
    const center = timeToMinutes(time);
    const { slots } = await this.availability.slots(r.id, { date: d, partySize: party, online: true,
      fromTime: minutesToTime(Math.max(0, center - 90)), toTime: minutesToTime(Math.min(23 * 60 + 45, center + 90)) });
    const open = slots.filter((x) => x.available).sort((a, b) => Math.abs(timeToMinutes(a.time) - center) - Math.abs(timeToMinutes(b.time) - center))
      .slice(0, 5).sort((a, b) => a.time.localeCompare(b.time)).map((x) => ({ time: x.time, startsAt: x.startsAt }));
    return { date: d, slots: open };
  }

  /**
   * GET /discovery/places-search?q=sushi&lat=..&lng=..&date=..&time=19:00&party=2[&pageToken=..]
   * With no text, searches "restaurants" near the diner. Falls back to TableDash-only results
   * when Google isn't configured or no location/text is given.
   */
  @AuthOptional() @Get('places-search')
  async search(
    @Query('q') q = '', @Query('lat') lat?: string, @Query('lng') lng?: string, @Query('date') date?: string,
    @Query('time') time = '19:00', @Query('party') partyRaw = '2', @Query('pageToken') pageToken?: string, @Query('lang') lang = 'en',
  ) {
    if (date && !isDate(date)) throw new BadRequestException('date must be YYYY-MM-DD');
    if (!isTime(time)) throw new BadRequestException('time must be HH:mm');
    const party = Math.max(1, Math.min(20, Number(partyRaw) || 2));
    const near = lat && lng && !isNaN(+lat) && !isNaN(+lng) ? { lat: +lat, lng: +lng } : null;
    const text = q.trim();
    if (!this.google.configured || (!text && !near)) return { source: 'tabledash', google: false, results: [], nextPageToken: null };

    const g = await this.google.searchRestaurants({ query: text || 'restaurants', near, pageToken, languageCode: lang.slice(0, 10) });
    const ids = g.places.map((p: any) => p.placeId);
    const linked = ids.length ? await this.db.select().from(restaurants).where(and(inArray(restaurants.googlePlaceId, ids), eq(restaurants.status, 'LIVE'))) : [];
    const byPlace = new Map(linked.map((r) => [r.googlePlaceId!, r]));

    const results = await Promise.all(g.places.map(async (p: any) => {
      const r = byPlace.get(p.placeId);
      return {
        ...p,
        distanceKm: near && p.lat != null ? km(near, { lat: p.lat, lng: p.lng }) : null,
        tabledash: r ? { id: r.id, slug: r.slug, ...(await this.bookableTimes(r, date, time, party)) } : null,
      };
    }));

    // TableDash restaurants that match the text but aren't linked to Google still appear (first page only).
    let extra: any[] = [];
    if (!pageToken && text) {
      const own = await this.db.select().from(restaurants).where(and(eq(restaurants.status, 'LIVE'),
        or(ilike(restaurants.name, `%${text}%`), ilike(restaurants.cuisine, `%${text}%`), ilike(restaurants.neighborhood, `%${text}%`)))).limit(10);
      extra = await Promise.all(own.filter((r) => !r.googlePlaceId || !byPlace.has(r.googlePlaceId)).map(async (r) => ({
        placeId: r.googlePlaceId, name: r.name, address: r.address, lat: r.lat, lng: r.lng, rating: null, userRatingCount: null,
        priceBand: r.priceBand, type: r.cuisine, temporarilyClosed: false, googleMapsUri: null, photo: null, ownPhoto: r.photos[0] ?? null,
        tableDashRating: r.ratingAvg, distanceKm: near ? km(near, { lat: r.lat, lng: r.lng }) : null,
        tabledash: { id: r.id, slug: r.slug, ...(await this.bookableTimes(r, date, time, party)) },
      })));
    }
    return { source: 'google', google: true, results: [...extra, ...results], nextPageToken: g.nextPageToken };
  }

  /** GET /discovery/places/:placeId — full Google details; `tabledash` is set when the restaurant is bookable here. */
  @AuthOptional() @Get('places/:placeId')
  async place(@Param('placeId') placeId: string, @Query('lang') lang = 'en', @CurrentUser() u?: AuthUser) {
    if (!PLACE_ID.test(placeId)) throw new BadRequestException('Invalid place id');
    const [r] = await this.db.select({ id: restaurants.id, slug: restaurants.slug }).from(restaurants)
      .where(and(eq(restaurants.googlePlaceId, placeId), eq(restaurants.status, 'LIVE')));
    const details = await this.google.place(placeId, lang.slice(0, 10));
    const [interest] = u ? await this.db.select().from(placeInterests).where(and(eq(placeInterests.googlePlaceId, placeId), eq(placeInterests.dinerId, u.id))) : [];
    return { ...details, tabledash: r ?? null, interested: !!interest };
  }

  /** "Tell me when they join TableDash" (stores only the place ID and the diner). */
  @Post('places/:placeId/interest')
  async interest(@Param('placeId') placeId: string, @CurrentUser() u: AuthUser) {
    if (!PLACE_ID.test(placeId)) throw new BadRequestException('Invalid place id');
    await this.db.insert(placeInterests).values({ googlePlaceId: placeId, dinerId: u.id }).onConflictDoNothing();
    return { interested: true };
  }
  @Delete('places/:placeId/interest')
  async uninterest(@Param('placeId') placeId: string, @CurrentUser() u: AuthUser) {
    await this.db.delete(placeInterests).where(and(eq(placeInterests.googlePlaceId, placeId), eq(placeInterests.dinerId, u.id)));
    return { interested: false };
  }
}
