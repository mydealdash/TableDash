import './globals.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import '@fontsource/nunito/700.css';
import '@fontsource/nunito/800.css';
import '@fontsource/nunito/900.css';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'TableDash for Restaurants', description: 'TableDash restaurant reservations', icons: { icon: '/favicon.svg' }, themeColor: '#14213D' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
