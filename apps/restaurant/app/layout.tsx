import './globals.css';
import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'TableDash for Restaurants', description: 'Host stand and back office' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
