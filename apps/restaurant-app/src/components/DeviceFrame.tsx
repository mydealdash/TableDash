/**
 * Web preview frame. On a desktop browser the app is shown inside a tablet frame so it looks
 * and behaves like the mobile app (fixed device width, status bar, home indicator). On real
 * phones/tablets, and in the native iOS/Android builds, the app fills the screen as normal.
 */
import { useEffect, useState } from 'react';
import { Platform, Text, useWindowDimensions, View } from 'react-native';

const KIND = 'tablet' as 'phone' | 'tablet';
const DEVICE = KIND === 'phone' ? { w: 390, h: 844, radius: 48, bezel: 12, min: 560 } : { w: 1180, h: 820, radius: 30, bezel: 16, min: 1000 };

function Clock() {
  const fmt = () => new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M/i, '');
  const [t, setT] = useState(fmt());
  useEffect(() => { const i = setInterval(() => setT(fmt()), 30000); return () => clearInterval(i); }, []);
  return <Text style={{ fontWeight: '600', fontSize: 15, color: '#111' }}>{t}</Text>;
}

function StatusBarMock() {
  return (
    <View style={{ height: KIND === 'phone' ? 50 : 26, paddingHorizontal: KIND === 'phone' ? 30 : 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'transparent' }}>
      <Clock />
      {KIND === 'phone' && <View style={{ width: 120, height: 34, borderRadius: 20, backgroundColor: '#000', position: 'absolute', left: '50%', marginLeft: -60, top: 8 }} />}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2 }}>{[5, 7, 9, 11].map((h) => <View key={h} style={{ width: 3, height: h, borderRadius: 1, backgroundColor: '#111' }} />)}</View>
        <Text style={{ fontSize: 13, fontWeight: '700', color: '#111' }}>5G</Text>
        <View style={{ width: 25, height: 12, borderRadius: 3, borderWidth: 1, borderColor: '#111', padding: 1 }}><View style={{ flex: 1, width: '80%', backgroundColor: '#111', borderRadius: 1 }} /></View>
      </View>
    </View>
  );
}

export function DeviceFrame({ children, background = '#f4f2ee' }: { children: React.ReactNode; background?: string }) {
  const { width, height } = useWindowDimensions();
  // Real phones/tablets, installed apps and native builds fill the screen as normal.
  // Decide by the device type, not by touch support: many Windows laptops report touch too.
  const realDevice = Platform.OS === 'web' && typeof window !== 'undefined' && (() => {
    const ua = navigator.userAgent || '';
    const phoneOrTablet = /iPhone|iPod|iPad|Android|Mobile|Silk|Kindle|Opera Mini|IEMobile/i.test(ua)
      || (/Macintosh/.test(ua) && (navigator as any).maxTouchPoints > 1); // iPadOS reports itself as a Mac
    const installed = !!window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true;
    return phoneOrTablet || installed;
  })();
  if (Platform.OS !== 'web' || realDevice) return <>{children}</>;

  // On a computer, always show the device. Tablets turn to portrait in tall windows; the whole
  // device is scaled down to fit smaller windows instead of stretching into a web page.
  const portrait = KIND === 'phone' || height > width;
  const screenW = portrait ? Math.min(DEVICE.w, DEVICE.h) : Math.max(DEVICE.w, DEVICE.h);
  const screenH = portrait ? Math.max(DEVICE.w, DEVICE.h) : Math.min(DEVICE.w, DEVICE.h);
  const outerW = screenW + DEVICE.bezel * 2, outerH = screenH + DEVICE.bezel * 2;
  const scale = Math.min(1, (width - 32) / outerW, (height - 56) / outerH);
  if (scale < 0.3) return <>{children}</>; // window far too small to be useful as a device

  return (
    <View style={{ flex: 1, minHeight: height, alignItems: 'center', justifyContent: 'center', backgroundColor: '#14213D', overflow: 'hidden' }}>
      <View style={{ width: outerW * scale, height: outerH * scale }}>
        <View style={{ position: 'absolute', left: 0, top: 0, width: outerW, height: outerH, borderRadius: DEVICE.radius + DEVICE.bezel, backgroundColor: '#0b0b0c', padding: DEVICE.bezel,
          ...({ transform: `scale(${scale})`, transformOrigin: '0 0', boxShadow: '0 30px 80px rgba(0,0,0,.55), 0 0 0 2px #2A3858' } as any) }}>
          <View style={{ flex: 1, borderRadius: DEVICE.radius, overflow: 'hidden', backgroundColor: background }}>
            <StatusBarMock />
            <View style={{ flex: 1 }}>{children}</View>
            {KIND === 'phone' && <View style={{ height: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}><View style={{ width: 134, height: 5, borderRadius: 3, backgroundColor: '#111' }} /></View>}
          </View>
        </View>
      </View>
      <Text style={{ color: '#8D98B3', fontSize: 12, marginTop: 12 }}>{KIND === 'phone' ? 'TableDash diner app · web preview' : 'TableDash for Restaurants · iPad preview'}</Text>
    </View>
  );
}
