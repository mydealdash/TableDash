/**
 * Real-time push to host-stand devices (spec TBL-05, NFR-03 <2s). Clients
 * connect with their JWT and join a restaurant room; any domain event for that
 * restaurant is forwarded so every iPad on the floor stays in sync.
 */
import { Inject, OnModuleInit } from '@nestjs/common';
import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { and, eq } from 'drizzle-orm';
import { Server, Socket } from 'socket.io';
import { DB, Db } from '../db/db.module';
import { staffMemberships } from '../db/schema';
import { EventBus } from '../common/events';

@WebSocketGateway({ namespace: '/realtime', cors: { origin: true } })
export class RealtimeGateway implements OnModuleInit {
  @WebSocketServer() server: Server;
  constructor(private readonly events: EventBus, private readonly jwt: JwtService, @Inject(DB) private readonly db: Db) {}

  onModuleInit() {
    this.events.on('*', (e) => { this.server?.to(`restaurant:${e.restaurantId}`).emit('event', e); });
  }

  @SubscribeMessage('join')
  async join(@ConnectedSocket() client: Socket, @MessageBody() body: { token: string; restaurantId: string }) {
    try {
      const p = await this.jwt.verifyAsync<{ sub: string; role: string }>(body.token);
      if (p.role !== 'ADMIN') {
        const [m] = await this.db.select().from(staffMemberships).where(and(eq(staffMemberships.userId, p.sub), eq(staffMemberships.restaurantId, body.restaurantId)));
        if (!m) return { ok: false, error: 'forbidden' };
      }
      await client.join(`restaurant:${body.restaurantId}`);
      return { ok: true };
    } catch { return { ok: false, error: 'unauthorized' }; }
  }
}
