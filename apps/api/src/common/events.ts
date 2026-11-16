import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';

/**
 * Domain event bus (spec: "Event bus"). In-process for the MVP; the publish
 * signature is the seam for swapping in Redis Streams / Kafka later.
 */
export type DomainEvent =
  | { type: 'booking.created'; restaurantId: string; reservationId: string }
  | { type: 'booking.updated'; restaurantId: string; reservationId: string }
  | { type: 'booking.cancelled'; restaurantId: string; reservationId: string }
  | { type: 'slot.released'; restaurantId: string; date: string; startsAt: string }
  | { type: 'table.updated'; restaurantId: string; tableId: string }
  | { type: 'waitlist.updated'; restaurantId: string; entryId: string };

@Injectable()
export class EventBus {
  private readonly emitter = new EventEmitter();
  constructor() { this.emitter.setMaxListeners(50); }

  publish(event: DomainEvent) {
    // Side effects run after the current tick so the caller's transaction has committed.
    setImmediate(() => this.emitter.emit(event.type, event));
    setImmediate(() => this.emitter.emit('*', event));
  }

  on<T extends DomainEvent['type']>(type: T | '*', handler: (e: Extract<DomainEvent, { type: T }>) => void | Promise<void>) {
    this.emitter.on(type, (e) => {
      Promise.resolve(handler(e)).catch((err) => console.error(`[event ${type}]`, err));
    });
  }
}
