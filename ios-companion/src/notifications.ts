import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { registerMobileDevice } from "./api";

const INSTALLATION_ID_KEY = "stephens-todo.installation.v1";
const REMINDERS_ENABLED_KEY = "stephens-todo.reminders-enabled.v1";
const PUSH_TOKEN_KEY = "stephens-todo.expo-push-token.v1";

async function installationId() {
  const existing = await AsyncStorage.getItem(INSTALLATION_ID_KEY);
  if (existing) return existing;
  const created = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await AsyncStorage.setItem(INSTALLATION_ID_KEY, created);
  return created;
}

export async function remindersEnabled() {
  return (await AsyncStorage.getItem(REMINDERS_ENABLED_KEY)) === "true";
}

export async function configurePushReminders(enabled: boolean) {
  if (Platform.OS === "web") {
    await AsyncStorage.setItem(REMINDERS_ENABLED_KEY, String(enabled));
    return { enabled, message: "Push reminders are available in the installed iOS app." };
  }
  if (!enabled) {
    const token = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
    if (token) await registerMobileDevice({ installationId: await installationId(), expoPushToken: token, enabled: false });
    await AsyncStorage.setItem(REMINDERS_ENABLED_KEY, "false");
    return { enabled: false, message: "Task reminders are disabled on this device." };
  }
  if (!Device.isDevice) return { enabled: false, message: "Push reminders require a physical iPhone or iPad." };
  const current = await Notifications.getPermissionsAsync();
  const currentGranted = current.ios?.status === Notifications.IosAuthorizationStatus.AUTHORIZED
    || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  const permission = currentGranted ? current : await Notifications.requestPermissionsAsync();
  const granted = permission.ios?.status === Notifications.IosAuthorizationStatus.AUTHORIZED
    || permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  if (!granted) return { enabled: false, message: "Notification permission was not granted." };
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return { enabled: false, message: "The app notification project is not configured." };
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await registerMobileDevice({ installationId: await installationId(), expoPushToken: token, enabled });
  await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
  await AsyncStorage.setItem(REMINDERS_ENABLED_KEY, String(enabled));
  return { enabled, message: enabled ? "Urgent and due-task reminders are enabled." : "Task reminders are disabled on this device." };
}
