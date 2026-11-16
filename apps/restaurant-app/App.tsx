import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider, useSession } from './src/lib/session';
import { C } from './src/lib/theme';
import { Loading } from './src/components/ui';
import LoginScreen from './src/screens/LoginScreen';
import HostScreen from './src/screens/HostScreen';
import BookingsScreen from './src/screens/BookingsScreen';
import GuestsScreen from './src/screens/GuestsScreen';
import ReviewsScreen from './src/screens/ReviewsScreen';
import ReportsScreen from './src/screens/ReportsScreen';
import MoreScreen from './src/screens/MoreScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();
const icon = (g: string) => ({ color }: { color: string }) => <Text style={{ color, fontSize: 18 }}>{g}</Text>;

function Tabs() {
  const { restaurant } = useSession();
  return (
    <Tab.Navigator key={restaurant!.id} screenOptions={{ tabBarActiveTintColor: C.brand, headerStyle: { backgroundColor: C.bg }, headerShadowVisible: false }}>
      <Tab.Screen name="Host" component={HostScreen} options={{ headerShown: false, tabBarIcon: icon('▦'), title: 'Host stand' }} />
      <Tab.Screen name="Bookings" component={BookingsScreen} options={{ tabBarIcon: icon('▤') }} />
      <Tab.Screen name="Guests" component={GuestsScreen} options={{ tabBarIcon: icon('☺'), title: 'Guestbook' }} />
      <Tab.Screen name="Reports" component={ReportsScreen} options={{ tabBarIcon: icon('▥'), headerShown: false }} />
      <Tab.Screen name="More" component={MoreScreen} options={{ tabBarIcon: icon('⋯'), title: 'Settings' }} />
    </Tab.Navigator>
  );
}

function Root() {
  const { ready, restaurant } = useSession();
  if (!ready) return <Loading />;
  return (
    <NavigationContainer theme={{ ...DefaultTheme, colors: { ...DefaultTheme.colors, background: C.bg, primary: C.brand } }}>
      <Stack.Navigator>
        {restaurant ? <>
          <Stack.Screen name="Main" component={Tabs} options={{ headerShown: false }} />
          <Stack.Screen name="Reviews" component={ReviewsScreen} />
        </> : <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return <SafeAreaProvider><SessionProvider><StatusBar style="dark" /><Root /></SessionProvider></SafeAreaProvider>;
}
