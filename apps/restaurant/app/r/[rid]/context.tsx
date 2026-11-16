'use client';
import { createContext, useContext } from 'react';
export interface RestaurantCtx { rid: string; name: string; timezone: string; role: string; onlineBookingEnabled: boolean; refreshMeta: () => void }
export const Ctx = createContext<RestaurantCtx>(null as any);
export const useRestaurant = () => useContext(Ctx);
