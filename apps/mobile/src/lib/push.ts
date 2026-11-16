import * as Notifications from 'expo-notifications';

/** Registers for Notify alerts and reminders; returns an Expo push token or null. */
export async function registerForPush(): Promise<string | null> {
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') return null;
    return (await Notifications.getExpoPushTokenAsync()).data;
  } catch { return null; }
}
