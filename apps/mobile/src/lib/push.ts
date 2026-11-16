import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/** Registers for Notify alerts and reminders; returns an Expo push token or null. */
export async function registerForPush(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') return null;
    return (await Notifications.getExpoPushTokenAsync()).data;
  } catch { return null; }
}
