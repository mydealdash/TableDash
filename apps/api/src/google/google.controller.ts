import { Body, Controller, Get, Inject, NotFoundException, Param, Put, Query, Res } from '@nestjs/common';
import { IsOptional, IsString, Matches } from 'class-validator';
import { eq, or } from 'drizzle-orm';
import type { Response } from 'express';
import { MANAGERS, Public, StaffRoles, AuthUser, CurrentUser } from '../auth/auth.guard';
import { DB, Db } from '../db/db.module';
import { placeInterests, restaurants, users } from '../db/schema';
import { MessagingService } from '../messaging/messaging.service';
import { and, isNull } from 'drizzle-orm';
import { AuditService } from '../common/audit.service';
import { GooglePlacesService } from './google-places.service';

class LinkDto { @IsOptional() @IsString() @Matches(/^[A-Za-z0-9_-]{10,300}$/) placeId?: string | null; }

@Controller()
export class GoogleController {
  constructor(@Inject(DB) private readonly db: Db, private readonly google: GooglePlacesService, private readonly audit: AuditService, private readonly messaging: MessagingService) {}

  /** Diner-facing: live Google rating, reviews and photos for a linked restaurant. */
  @Public() @Get('discovery/restaurants/:key/google')
  async listing(@Param('key') key: string, @Query('lang') lang = 'en') {
    const [r] = await this.db.select({ placeId: restaurants.googlePlaceId }).from(restaurants).where(or(eq(restaurants.slug, key), eq(restaurants.id, key)));
    if (!r) throw new NotFoundException();
    if (!r.placeId || !this.google.configured) return { enabled: false };
    try { return await this.google.listing(r.placeId, lang.slice(0, 10)); }
    catch { return { enabled: false, error: 'Google content is temporarily unavailable' }; }
  }

  /** Redirects to a short-lived Google photo URL; keeps the API key server-side. */
  @Public() @Get('discovery/google-photo')
  async photo(@Query('name') name: string, @Query('w') w: string, @Res() res: Response) {
    const url = await this.google.photoUrl(name, Number(w) || 800);
    res.setHeader('Cache-Control', 'no-store');
    res.redirect(302, url);
  }

  /** Staff: search Google for their listing (biased to the restaurant's location). */
  @StaffRoles(...MANAGERS) @Get('manage/:rid/settings/google/search')
  async search(@Param('rid') rid: string, @Query('q') q?: string) {
    const [r] = await this.db.select().from(restaurants).where(eq(restaurants.id, rid));
    if (!r) throw new NotFoundException();
    return { configured: this.google.configured, results: this.google.configured ? await this.google.search(q?.trim() || `${r.name} ${r.address}`, { lat: r.lat, lng: r.lng }) : [] };
  }

  @StaffRoles(...MANAGERS) @Get('manage/:rid/settings/google')
  async current(@Param('rid') rid: string) {
    const [r] = await this.db.select({ placeId: restaurants.googlePlaceId }).from(restaurants).where(eq(restaurants.id, rid));
    if (!r) throw new NotFoundException();
    if (!r.placeId || !this.google.configured) return { configured: this.google.configured, placeId: r.placeId, listing: null };
    const listing = await this.google.listing(r.placeId).catch(() => null);
    return { configured: true, placeId: r.placeId, listing: listing && { rating: listing.rating, userRatingCount: listing.userRatingCount, googleMapsUri: listing.googleMapsUri, photos: listing.photos.length, reviews: listing.reviews.length } };
  }

  @StaffRoles(...MANAGERS) @Put('manage/:rid/settings/google')
  async link(@Param('rid') rid: string, @Body() dto: LinkDto, @CurrentUser() u: AuthUser) {
    await this.db.update(restaurants).set({ googlePlaceId: dto.placeId ?? null }).where(eq(restaurants.id, rid));
    await this.audit.log({ actorId: u.id, restaurantId: rid, action: dto.placeId ? 'google_linked' : 'google_unlinked', entity: 'restaurant', entityId: rid, data: { placeId: dto.placeId ?? null } });
    const notified = dto.placeId ? await this.notifyInterested(rid, dto.placeId) : 0;
    return { placeId: dto.placeId ?? null, notified };
  }

  /** Diners who tapped "Tell me when they join" hear about it once the restaurant is live and linked. */
  private async notifyInterested(rid: string, placeId: string) {
    const [r] = await this.db.select().from(restaurants).where(eq(restaurants.id, rid));
    if (!r || r.status !== 'LIVE') return 0;
    const waiting = await this.db.select({ i: placeInterests, email: users.email }).from(placeInterests).innerJoin(users, eq(users.id, placeInterests.dinerId))
      .where(and(eq(placeInterests.googlePlaceId, placeId), isNull(placeInterests.notifiedAt)));
    for (const w of waiting) {
      const body = `${r.name} is now on TableDash. Book a table: tabledash://restaurant/${r.slug}`;
      await this.messaging.send('PUSH', w.i.dinerId, 'place_joined', body);
      await this.messaging.send('EMAIL', w.email, 'place_joined', body);
      await this.db.update(placeInterests).set({ notifiedAt: new Date() }).where(eq(placeInterests.id, w.i.id));
    }
    return waiting.length;
  }
}
