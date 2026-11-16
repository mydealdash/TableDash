'use client';
import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { API_URL, getToken } from './api';

/** Subscribe to live restaurant events (bookings, tables, waitlist) from the API gateway. */
export function useRealtime(restaurantId: string | undefined, onEvent: (e: { type: string }) => void) {
  const cb = useRef(onEvent);
  cb.current = onEvent;
  useEffect(() => {
    if (!restaurantId) return;
    const socket: Socket = io(`${API_URL}/realtime`, { transports: ['websocket'] });
    socket.on('connect', () => socket.emit('join', { token: getToken(), restaurantId }));
    socket.on('event', (e) => cb.current(e));
    return () => { socket.disconnect(); };
  }, [restaurantId]);
}
