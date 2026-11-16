import { NavigationContainer, LinkingOptions, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/lib/auth';
import { C } from './src/lib/theme';
import { Loading } from './src/components/ui';
import DiscoverScreen from './src/screens/DiscoverScreen';
import RestaurantScreen from './src/screens/RestaurantScreen';
import CheckoutScreen from './src/screens/CheckoutScreen';
import ConfirmationScreen from './src/screens/ConfirmationScreen';
import ReservationsScreen from './src/screens/ReservationsScreen';
import ReservationDetailScreen from './src/screens/ReservationDetailScreen';
import NotifyScreen from './src/screens/NotifyScreen';
import AccountScreen from './src/screens/AccountScreen';
import LoginScreen from './src/screens/LoginScreen';
import AddCardScreen from './src/screens/AddCardScreen';
import WaitlistScreen from './src/screens/WaitlistScreen';

export type RootStack = {
  Tabs: undefined;
  Restaurant: { slug: string; date: string; party?: number; time?: string; autoHold?: boolean };
  Checkout: { restaurant: { id: string; name: string; timezone: string; photo?: string }; hold?: any; sessionKey?: string; request?: { partySize: number }; date: string; time: string };
  Confirmation: { reservation: any; restaurant: { id: string; name: string; timezone: string } };
  ReservationDetail: { id: string };
  Login: { reason?: string };
  AddCard: {};
  Waitlist: { restaurantId: string; name: string };
};

const Stack = createNativeStackNavigator<RootStack>();
const Tab = createBottomTabNavigator();
const icon = (glyph: string) => ({ color }: { color: string }) => <Text style={{ color, fontSize: 18 }}>{glyph}</Text>;

function Tabs() {
  return (
    <Tab.Navigator screenOptions={{ tabBarActiveTintColor: C.brand, headerShown: false }}>
      <Tab.Screen name="Discover" component={DiscoverScreen as any} options={{ tabBarIcon: icon('⌕'), headerShown: false }} />
      <Tab.Screen name="Reservations" component={ReservationsScreen} options={{ tabBarIcon: icon('▤'), headerShown: true }} />
      <Tab.Screen name="Notify" component={NotifyScreen} options={{ tabBarIcon: icon('◔'), headerShown: false }} />
      <Tab.Screen name="Account" component={AccountScreen} options={{ tabBarIcon: icon('◉'), headerShown: false }} />
    </Tab.Navigator>
  );
}

/** Deep links used by Notify alerts and reminders: tabledash://restaurant/<slug>?date=…&time=…&party=… */
const linking: LinkingOptions<RootStack> = {
  prefixes: ['tabledash://'],
  config: { screens: { Restaurant: { path: 'restaurant/:slug', parse: { party: Number } }, Tabs: '' } as any },
};

function Root() {
  const { ready } = useAuth();
  if (!ready) return <Loading />;
  return (
    <NavigationContainer linking={linking} theme={{ ...DefaultTheme, colors: { ...DefaultTheme.colors, background: C.bg, primary: C.brand } }}>
      <Stack.Navigator screenOptions={{ headerTintColor: C.ink, headerBackTitle: 'Back' }}>
        <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false, title: 'TableDash' }} />
        <Stack.Screen name="Restaurant" component={RestaurantScreen} options={{ title: '' }} />
        <Stack.Screen name="Checkout" component={CheckoutScreen} options={{ title: 'Confirm details' }} />
        <Stack.Screen name="Confirmation" component={ConfirmationScreen} options={{ title: '', headerBackVisible: false, gestureEnabled: false }} />
        <Stack.Screen name="ReservationDetail" component={ReservationDetailScreen} options={{ title: 'Reservation' }} />
        <Stack.Screen name="Login" component={LoginScreen} options={{ title: 'Sign in', presentation: 'modal' }} />
        <Stack.Screen name="AddCard" component={AddCardScreen} options={{ title: 'Add a card', presentation: 'modal' }} />
        <Stack.Screen name="Waitlist" component={WaitlistScreen} options={{ title: 'Waitlist' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <Root />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
