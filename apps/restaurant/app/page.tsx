'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getMemberships, getToken } from '@/lib/api';

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    if (!getToken()) return router.replace('/login');
    const m = getMemberships();
    const last = localStorage.getItem('td_last_restaurant');
    const rid = m.find((x) => x.restaurantId === last)?.restaurantId ?? m[0]?.restaurantId;
    router.replace(rid ? `/r/${rid}/host` : '/login');
  }, [router]);
  return null;
}
