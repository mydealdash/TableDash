import { BadRequestException, ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import { DB, Db } from '../db/db.module';
import { otpCodes, staffMemberships, restaurants, users } from '../db/schema';
import { MessagingService } from '../messaging/messaging.service';

@Injectable()
export class AuthService {
  constructor(@Inject(DB) private readonly db: Db, private readonly jwt: JwtService, private readonly messaging: MessagingService) {}

  private async issue(user: typeof users.$inferSelect) {
    const token = await this.jwt.signAsync({ sub: user.id, role: user.platformRole });
    const memberships = await this.db
      .select({ restaurantId: staffMemberships.restaurantId, role: staffMemberships.role, name: restaurants.name, slug: restaurants.slug })
      .from(staffMemberships).innerJoin(restaurants, eq(restaurants.id, staffMemberships.restaurantId))
      .where(eq(staffMemberships.userId, user.id));
    const { passwordHash, ...safe } = user;
    return { token, user: safe, memberships };
  }

  async register(input: { email: string; password: string; firstName: string; lastName: string; phone?: string }) {
    const email = input.email.toLowerCase().trim();
    const [exists] = await this.db.select({ id: users.id }).from(users).where(eq(users.email, email));
    if (exists) throw new ConflictException('Email already registered');
    const [user] = await this.db.insert(users).values({
      email, phone: input.phone, firstName: input.firstName, lastName: input.lastName,
      passwordHash: await bcrypt.hash(input.password, 10),
    }).returning();
    return this.issue(user);
  }

  async login(emailRaw: string, password: string) {
    const [user] = await this.db.select().from(users).where(eq(users.email, emailRaw.toLowerCase().trim()));
    if (!user?.passwordHash || user.deletedAt || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.issue(user);
  }

  /**
   * DIN-01: phone OTP. While testing (non-production, or SHOW_DEV_OTP=true) the code is returned so
   * the apps work without an SMS provider. Turn SHOW_DEV_OTP off before real diners sign up.
   */
  async requestOtp(phone: string) {
    const code = String(randomInt(100000, 1000000));
    await this.db.insert(otpCodes).values({ phone, code, expiresAt: new Date(Date.now() + 10 * 60000) });
    await this.messaging.send('SMS', phone, 'otp', `Your TableDash code is ${code}`);
    const showCode = process.env.NODE_ENV !== 'production' || process.env.SHOW_DEV_OTP === 'true';
    return showCode ? { sent: true, devCode: code } : { sent: true };
  }

  async verifyOtp(input: { phone: string; code: string; firstName?: string; lastName?: string }) {
    const [otp] = await this.db.select().from(otpCodes)
      .where(and(eq(otpCodes.phone, input.phone), eq(otpCodes.code, input.code), isNull(otpCodes.usedAt), gt(otpCodes.expiresAt, new Date())))
      .orderBy(desc(otpCodes.createdAt)).limit(1);
    if (!otp) throw new UnauthorizedException('Invalid or expired code');
    await this.db.update(otpCodes).set({ usedAt: new Date() }).where(eq(otpCodes.id, otp.id));
    let [user] = await this.db.select().from(users).where(eq(users.phone, input.phone));
    if (!user) {
      if (!input.firstName) throw new BadRequestException('firstName required for new accounts');
      [user] = await this.db.insert(users).values({ phone: input.phone, firstName: input.firstName, lastName: input.lastName ?? '' }).returning();
    }
    return this.issue(user);
  }

  async me(userId: string) {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId));
    if (!user) throw new UnauthorizedException();
    return this.issue(user);
  }
}
