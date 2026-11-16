import { useState } from 'react';
import { Alert, ScrollView, Text, TextInput, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { s } from '../lib/theme';
import { Button, Chip, ChipRow } from '../components/ui';
import type { RootStack } from '../../App';
import { Logo } from '../components/Logo';

/** DIN-01: phone one-time code (default) or email + password. */
export default function LoginScreen({ route, navigation }: NativeStackScreenProps<RootStack, 'Login'>) {
  const { signIn } = useAuth();
  const [mode, setMode] = useState<'phone' | 'email' | 'register'>('phone');
  const [phone, setPhone] = useState(''); const [code, setCode] = useState(''); const [sent, setSent] = useState(false);
  const [email, setEmail] = useState('diner@tabledash.dev'); const [password, setPassword] = useState('password123');
  const [first, setFirst] = useState(''); const [last, setLast] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<any>) => {
    setBusy(true);
    try { const res = await fn(); if (res?.token) { await signIn(res.token, res.user); navigation.goBack(); } }
    catch (e: any) { Alert.alert('Sign-in problem', e.message); } finally { setBusy(false); }
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={[s.pad, { gap: 6 }]} keyboardShouldPersistTaps="handled">
      <Logo size={40} />
      <Text style={[s.h1, { marginTop: 12 }]}>Welcome</Text>
      {route.params?.reason && <Text style={s.muted}>{route.params.reason}</Text>}
      <ChipRow>
        <Chip label="Phone" on={mode === 'phone'} onPress={() => setMode('phone')} />
        <Chip label="Email" on={mode === 'email'} onPress={() => setMode('email')} />
        <Chip label="Create account" on={mode === 'register'} onPress={() => setMode('register')} />
      </ChipRow>
      {mode === 'phone' && (
        <View>
          <Text style={s.label}>Mobile number</Text>
          <TextInput style={s.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+15551234567" />
          {sent && <>
            <Text style={s.label}>6-digit code</Text>
            <TextInput style={s.input} value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} />
            <Text style={s.label}>First name (new accounts)</Text>
            <TextInput style={s.input} value={first} onChangeText={setFirst} />
          </>}
          <Button style={{ marginTop: 14 }} loading={busy} title={sent ? 'Verify' : 'Send code'} onPress={() => run(async () => {
            if (!sent) {
              const r = await api('/auth/otp/request', { body: { phone } }); setSent(true);
              if (r.devCode) { setCode(r.devCode); Alert.alert('Development mode', `Your code is ${r.devCode}`); }
              return null;
            }
            return api('/auth/otp/verify', { body: { phone, code, firstName: first || undefined } });
          })} />
        </View>
      )}
      {mode === 'email' && (
        <View>
          <Text style={s.label}>Email</Text><TextInput style={s.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
          <Text style={s.label}>Password</Text><TextInput style={s.input} value={password} onChangeText={setPassword} secureTextEntry />
          <Button style={{ marginTop: 14 }} loading={busy} title="Sign in" onPress={() => run(() => api('/auth/login', { body: { email, password } }))} />
        </View>
      )}
      {mode === 'register' && (
        <View>
          <Text style={s.label}>First name</Text><TextInput style={s.input} value={first} onChangeText={setFirst} />
          <Text style={s.label}>Last name</Text><TextInput style={s.input} value={last} onChangeText={setLast} />
          <Text style={s.label}>Email</Text><TextInput style={s.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
          <Text style={s.label}>Password (8+ characters)</Text><TextInput style={s.input} value={password} onChangeText={setPassword} secureTextEntry />
          <Button style={{ marginTop: 14 }} loading={busy} title="Create account" onPress={() => run(() => api('/auth/register', { body: { email, password, firstName: first, lastName: last } }))} />
        </View>
      )}
    </ScrollView>
  );
}
