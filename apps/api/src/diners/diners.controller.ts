import { Body, Controller, Delete, Get, Inject, NotFoundException, Param, Patch, Post, Put } from '@nestjs/common';
import { IsBoolean, IsInt, IsOptional, IsString, Length, Matches, Max, Min } from 'class-validator';
import { and, desc, eq } from 'drizzle-orm';
import { AuthUser, CurrentUser } from '../auth/auth.guard';
import { DB, Db } from '../db/db.module';
import { loyaltyEntries, notifySubscriptions, paymentMethods, reservations, restaurants, reviews, savedRestaurants, users } from '../db/schema';

class ProfileDto {
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsString() dietaryNotes?: string;
  @IsOptional() @IsString() seatingPref?: string;
  @IsOptional() @IsBoolean() marketingOptIn?: boolean;
  @IsOptional() @IsString() pushToken?: string;
}
/** Card details arrive already tokenized by the client payment SDK (PAY-01). */
class CardDto {
  @IsString() token: string;
  @IsString() brand: string;
  @Matches(/^\d{4}$/) last4: string;
  @IsInt() @Min(1) @Max(12) expMonth: number;
  @IsInt() @Min(2024) expYear: number;
  @IsOptional() @IsString() provider?: string;
}

@Controller('me')
export class DinersController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Get() async profile(@CurrentUser() u: AuthUser) {
    const [user] = await this.db.select().from(users).where(eq(users.id, u.id));
    if (!user) throw new NotFoundException();
    const { passwordHash, ...safe } = user;
    return safe;
  }

  @Patch() async update(@CurrentUser() u: AuthUser, @Body() dto: ProfileDto) {
    const [user] = await this.db.update(users).set(dto).where(eq(users.id, u.id)).returning();
    const { passwordHash, ...safe } = user;
    return safe;
  }

  @Get('payment-methods') methods(@CurrentUser() u: AuthUser) {
    return this.db.select({ id: paymentMethods.id, brand: paymentMethods.brand, last4: paymentMethods.last4, expMonth: paymentMethods.expMonth, expYear: paymentMethods.expYear })
      .from(paymentMethods).where(eq(paymentMethods.userId, u.id));
  }
  @Post('payment-methods') async addMethod(@CurrentUser() u: AuthUser, @Body() dto: CardDto) {
    const [m] = await this.db.insert(paymentMethods).values({ ...dto, userId: u.id }).returning();
    return { id: m.id, brand: m.brand, last4: m.last4, expMonth: m.expMonth, expYear: m.expYear };
  }
  @Delete('payment-methods/:id') async removeMethod(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    await this.db.delete(paymentMethods).where(and(eq(paymentMethods.id, id), eq(paymentMethods.userId, u.id)));
    return { ok: true };
  }

  @Get('saved') saved(@CurrentUser() u: AuthUser) {
    return this.db.select({ id: restaurants.id, slug: restaurants.slug, name: restaurants.name, cuisine: restaurants.cuisine, neighborhood: restaurants.neighborhood,
      photo: restaurants.photos, ratingAvg: restaurants.ratingAvg, priceBand: restaurants.priceBand })
      .from(savedRestaurants).innerJoin(restaurants, eq(restaurants.id, savedRestaurants.restaurantId)).where(eq(savedRestaurants.userId, u.id));
  }
  @Put('saved/:rid') async save(@CurrentUser() u: AuthUser, @Param('rid') rid: string) {
    await this.db.insert(savedRestaurants).values({ userId: u.id, restaurantId: rid }).onConflictDoNothing();
    return { saved: true };
  }
  @Delete('saved/:rid') async unsave(@CurrentUser() u: AuthUser, @Param('rid') rid: string) {
    await this.db.delete(savedRestaurants).where(and(eq(savedRestaurants.userId, u.id), eq(savedRestaurants.restaurantId, rid)));
    return { saved: false };
  }

  @Get('loyalty') async loyalty(@CurrentUser() u: AuthUser) {
    const [user] = await this.db.select({ points: users.points, tier: users.tier, completedCount: users.completedCount }).from(users).where(eq(users.id, u.id));
    const history = await this.db.select().from(loyaltyEntries).where(eq(loyaltyEntries.userId, u.id)).orderBy(desc(loyaltyEntries.createdAt)).limit(50);
    return { ...user, goldThreshold: 6, history };
  }

  /** DIN-06: data export and deletion. */
  @Get('export') async export(@CurrentUser() u: AuthUser) {
    const [user] = await this.db.select().from(users).where(eq(users.id, u.id));
    const { passwordHash, ...profile } = user;
    return {
      profile,
      reservations: await this.db.select().from(reservations).where(eq(reservations.dinerId, u.id)),
      reviews: await this.db.select().from(reviews).where(eq(reviews.dinerId, u.id)),
      notify: await this.db.select().from(notifySubscriptions).where(eq(notifySubscriptions.dinerId, u.id)),
      loyalty: await this.db.select().from(loyaltyEntries).where(eq(loyaltyEntries.userId, u.id)),
    };
  }
  @Delete() async remove(@CurrentUser() u: AuthUser) {
    await this.db.delete(paymentMethods).where(eq(paymentMethods.userId, u.id));
    await this.db.update(users).set({ email: null, phone: null, passwordHash: null, firstName: 'Deleted', lastName: 'User', dietaryNotes: null, pushToken: null, deletedAt: new Date() })
      .where(eq(users.id, u.id));
    return { deleted: true };
  }
}
