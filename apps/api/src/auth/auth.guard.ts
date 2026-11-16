import {
  CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, SetMetadata,
  UnauthorizedException, createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { and, eq, inArray } from 'drizzle-orm';
import { DB, Db } from '../db/db.module';
import { staffMemberships } from '../db/schema';

export type StaffRoleName = 'OWNER' | 'MANAGER' | 'HOST' | 'SERVER' | 'MARKETING' | 'READ_ONLY';
export interface AuthUser { id: string; role: 'DINER' | 'ADMIN'; staffRole?: StaffRoleName }

const PUBLIC = 'isPublic';
const OPTIONAL = 'authOptional';
const ADMIN = 'adminOnly';
const STAFF = 'staffRoles';

/** No token needed. */
export const Public = () => SetMetadata(PUBLIC, true);
/** Token used if present (e.g. guest checkout vs signed-in). */
export const AuthOptional = () => SetMetadata(OPTIONAL, true);
/** Platform admins only (internal console). */
export const AdminOnly = () => SetMetadata(ADMIN, true);
/**
 * Restaurant staff with one of these roles at the restaurant in `:rid`.
 * Platform admins are always allowed (support impersonation, audited).
 */
export const StaffRoles = (...roles: StaffRoleName[]) => SetMetadata(STAFF, roles);
export const ALL_STAFF: StaffRoleName[] = ['OWNER', 'MANAGER', 'HOST', 'SERVER', 'MARKETING', 'READ_ONLY'];
export const FLOOR_STAFF: StaffRoleName[] = ['OWNER', 'MANAGER', 'HOST'];
export const MANAGERS: StaffRoleName[] = ['OWNER', 'MANAGER'];

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest().user as AuthUser);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService, private readonly reflector: Reflector, @Inject(DB) private readonly db: Db) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const meta = <T>(key: string) => this.reflector.getAllAndOverride<T>(key, [ctx.getHandler(), ctx.getClass()]);
    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;

    if (token) {
      try {
        const payload = await this.jwt.verifyAsync<{ sub: string; role: 'DINER' | 'ADMIN' }>(token);
        req.user = { id: payload.sub, role: payload.role } satisfies AuthUser;
      } catch {
        if (!meta<boolean>(PUBLIC) && !meta<boolean>(OPTIONAL)) throw new UnauthorizedException('Invalid or expired token');
      }
    }
    if (meta<boolean>(PUBLIC)) return true;
    if (!req.user) {
      if (meta<boolean>(OPTIONAL)) return true;
      throw new UnauthorizedException();
    }
    if (meta<boolean>(ADMIN) && req.user.role !== 'ADMIN') throw new ForbiddenException('Admin only');

    const roles = meta<StaffRoleName[]>(STAFF);
    if (roles) {
      if (req.user.role === 'ADMIN') return true;
      const rid = req.params.rid;
      if (!rid) throw new ForbiddenException('Restaurant scope missing');
      const [m] = await this.db.select().from(staffMemberships)
        .where(and(eq(staffMemberships.userId, req.user.id), eq(staffMemberships.restaurantId, rid), inArray(staffMemberships.role, roles)));
      if (!m) throw new ForbiddenException('No access to this restaurant');
      req.user.staffRole = m.role;
    }
    return true;
  }
}
