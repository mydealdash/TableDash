/** Verified reviews (MKT-03): only seated diners, within 30 days; restaurants reply; admins moderate. */
import { BadRequestException, Body, Controller, ConflictException, Get, Inject, NotFoundException, Param, Post } from '@nestjs/common';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { and, avg, count, desc, eq } from 'drizzle-orm';
import { AuthUser, CurrentUser, MANAGERS, StaffRoles } from '../auth/auth.guard';
import { DB, Db } from '../db/db.module';
import { reservations, restaurants, reviews, users } from '../db/schema';

class ReviewDto {
  @IsInt() @Min(1) @Max(5) rating: number;
  @IsOptional() @IsInt() @Min(1) @Max(5) foodRating?: number;
  @IsOptional() @IsInt() @Min(1) @Max(5) serviceRating?: number;
  @IsOptional() @IsInt() @Min(1) @Max(5) ambienceRating?: number;
  @IsOptional() @IsString() @MaxLength(2000) text?: string;
}
class ReplyDto { @IsString() @MaxLength(1000) reply: string; }

export async function recomputeRating(db: Db, restaurantId: string) {
  const [s] = await db.select({ a: avg(reviews.rating), n: count() }).from(reviews).where(and(eq(reviews.restaurantId, restaurantId), eq(reviews.status, 'PUBLISHED')));
  await db.update(restaurants).set({ ratingAvg: Math.round(Number(s.a ?? 0) * 10) / 10, ratingCount: Number(s.n) }).where(eq(restaurants.id, restaurantId));
}

@Controller()
export class ReviewsController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Post('me/reservations/:id/review')
  async create(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: ReviewDto) {
    const [res] = await this.db.select().from(reservations).where(and(eq(reservations.id, id), eq(reservations.dinerId, u.id)));
    if (!res) throw new NotFoundException();
    if (res.status !== 'COMPLETED') throw new BadRequestException('Only completed visits can be reviewed');
    if (Date.now() - (res.completedAt ?? res.startsAt).getTime() > 30 * 86400000) throw new BadRequestException('The review window has closed');
    const [exists] = await this.db.select().from(reviews).where(eq(reviews.reservationId, id));
    if (exists) throw new ConflictException('Already reviewed');
    const [rv] = await this.db.insert(reviews).values({ ...dto, text: dto.text ?? '', reservationId: id, restaurantId: res.restaurantId, dinerId: u.id }).returning();
    await recomputeRating(this.db, res.restaurantId);
    return rv;
  }

  @StaffRoles(...MANAGERS, 'MARKETING') @Get('manage/:rid/reviews')
  list(@Param('rid') rid: string) {
    return this.db.select({ r: reviews, firstName: users.firstName, lastName: users.lastName }).from(reviews).innerJoin(users, eq(users.id, reviews.dinerId))
      .where(eq(reviews.restaurantId, rid)).orderBy(desc(reviews.createdAt)).limit(200)
      .then((rows) => rows.map((x) => ({ ...x.r, author: `${x.firstName} ${x.lastName.slice(0, 1)}.` })));
  }

  @StaffRoles(...MANAGERS, 'MARKETING') @Post('manage/:rid/reviews/:id/reply')
  async reply(@Param('rid') rid: string, @Param('id') id: string, @Body() dto: ReplyDto) {
    const [rv] = await this.db.update(reviews).set({ reply: dto.reply }).where(and(eq(reviews.id, id), eq(reviews.restaurantId, rid))).returning();
    if (!rv) throw new NotFoundException();
    return rv;
  }

  /** Restaurants can flag a review for platform moderation. */
  @StaffRoles(...MANAGERS) @Post('manage/:rid/reviews/:id/flag')
  async flag(@Param('rid') rid: string, @Param('id') id: string) {
    await this.db.update(reviews).set({ status: 'FLAGGED' }).where(and(eq(reviews.id, id), eq(reviews.restaurantId, rid)));
    return { ok: true };
  }
}
