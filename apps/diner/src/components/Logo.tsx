import { Image, Text, View } from 'react-native';
import { C } from '../lib/theme';

/** TableDash logo: mark + wordmark ("Table" in navy, "Dash" in coral). */
export function Logo({ size = 34, light, subtitle }: { size?: number; light?: boolean; subtitle?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: size * 0.3 }} accessibilityRole="header" accessibilityLabel="TableDash">
      <Image source={require('../../assets/logo-mark.png')} style={{ width: size, height: size }} />
      <View>
        <Text style={{ fontFamily: 'Nunito_900Black', fontSize: size * 0.78, letterSpacing: -0.5, color: light ? '#FFFFFF' : C.ink, lineHeight: size * 0.95 }}>
          Table<Text style={{ color: C.brand }}>Dash</Text>
        </Text>
        {subtitle ? <Text style={{ fontFamily: 'Nunito_700Bold', fontSize: Math.max(11, size * 0.32), color: light ? '#C9D1E3' : C.muted, marginTop: -2 }}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}
