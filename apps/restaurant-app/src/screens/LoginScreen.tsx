import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, TextInput, View } from 'react-native';
import { useSession } from '../lib/session';
import { C, s } from '../lib/theme';
import { Btn } from '../components/ui';
import { Logo } from '../components/Logo';

export default function LoginScreen() {
  const { signIn } = useSession();
  const [email, setEmail] = useState('host+osteria-lume@tabledash.dev');
  const [password, setPassword] = useState('password123');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  return (
    <KeyboardAvoidingView style={[s.screen, { justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: C.dark }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[s.card, { width: '100%', maxWidth: 420, padding: 20 }]}>
        <Logo size={44} subtitle="for Restaurants" />
        <View style={{ height: 12 }} />
        <Text style={s.label}>Email</Text><TextInput style={s.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
        <Text style={s.label}>Password</Text><TextInput style={s.input} value={password} onChangeText={setPassword} secureTextEntry />
        {!!err && <Text style={{ color: C.bad, marginTop: 8 }}>{err}</Text>}
        <Btn style={{ marginTop: 16 }} kind="primary" title="Sign in" loading={busy} onPress={async () => {
          setBusy(true); setErr('');
          try { await signIn(email.trim(), password); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
        }} />
        <Text style={[s.muted, { marginTop: 12 }]}>Demo: host+osteria-lume@tabledash.dev, manager@tabledash.dev · password123</Text>
      </View>
    </KeyboardAvoidingView>
  );
}
