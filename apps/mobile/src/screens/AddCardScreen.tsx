import { useState } from 'react';
import { Alert, ScrollView, Text, TextInput } from 'react-native';
import { api } from '../lib/api';
import { s } from '../lib/theme';
import { Button } from '../components/ui';

/**
 * Card entry. In production replace `tokenize` with the payment provider's SDK
 * (e.g. Stripe's CardField → createPaymentMethod). The card number never leaves
 * this device in raw form — only a token, brand, last 4 and expiry reach the API.
 */
async function tokenize(number: string, exp: string) {
  const digits = number.replace(/\D/g, '');
  const brand = digits.startsWith('4') ? 'Visa' : /^5[1-5]/.test(digits) ? 'Mastercard' : digits.startsWith('3') ? 'Amex' : 'Card';
  const [mm, yy] = exp.split('/').map((x) => Number(x));
  return { token: `tok_dev_${digits.slice(-4)}_${Date.now()}`, brand, last4: digits.slice(-4), expMonth: mm, expYear: 2000 + yy, provider: 'mock' };
}

export default function AddCardScreen({ navigation }: any) {
  const [number, setNumber] = useState(''); const [exp, setExp] = useState(''); const [cvc, setCvc] = useState(''); const [busy, setBusy] = useState(false);
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}>
      <Text style={s.label}>Card number</Text><TextInput style={s.input} value={number} onChangeText={setNumber} keyboardType="number-pad" placeholder="4242 4242 4242 4242" />
      <Text style={s.label}>Expiry (MM/YY)</Text><TextInput style={s.input} value={exp} onChangeText={setExp} placeholder="12/29" />
      <Text style={s.label}>CVC</Text><TextInput style={s.input} value={cvc} onChangeText={setCvc} keyboardType="number-pad" secureTextEntry maxLength={4} />
      <Button style={{ marginTop: 16 }} title="Save card" loading={busy} disabled={number.replace(/\D/g, '').length < 12 || !/^\d{2}\/\d{2}$/.test(exp)} onPress={async () => {
        setBusy(true);
        try { await api('/me/payment-methods', { body: await tokenize(number, exp) }); navigation.goBack(); }
        catch (e: any) { Alert.alert('Card not saved', e.message); } finally { setBusy(false); }
      }} />
    </ScrollView>
  );
}
