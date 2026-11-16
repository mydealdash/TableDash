import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { API_URL, getToken } from './api';

/** Live updates from the API: every device on the floor refreshes when anything changes. */
export function useRealtime(restaurantId: string | undefined, onEvent: (e: { type: string }) => void) {
  const cb = useRef(onEvent); cb.current = onEvent;
  useEffect(() => {
    if (!restaurantId) return;
    const socket = io(`${API_URL}/realtime`, { transports: ['websocket'] });
    socket.on('connect', () => socket.emit('join', { token: getToken(), restaurantId }));
    socket.on('event', (e) => cb.current(e));
    return () => { socket.disconnect(); };
  }, [restaurantId]);
}
