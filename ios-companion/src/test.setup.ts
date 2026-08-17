import { vi } from "vitest";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const store = new Map<string, string>();

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (key: string) => store.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => { store.set(key, value); }),
    removeItem: vi.fn(async (key: string) => { store.delete(key); }),
  },
}));

vi.mock("@react-native-community/netinfo", () => ({
  default: {
    fetch: vi.fn(async () => ({ isConnected: true, isInternetReachable: true })),
    addEventListener: vi.fn(() => () => undefined),
  },
}));

vi.mock("expo-notifications", () => ({
  getPermissionsAsync: vi.fn(async () => ({ ios: { status: 2 } })),
  requestPermissionsAsync: vi.fn(async () => ({ ios: { status: 2 } })),
  getExpoPushTokenAsync: vi.fn(async () => ({ data: "ExponentPushToken[test-token]" })),
  IosAuthorizationStatus: { AUTHORIZED: 2, PROVISIONAL: 3 },
}));

vi.mock("expo-device", () => ({ default: { isDevice: false } }));
vi.mock("expo-constants", () => ({ default: { expoConfig: { extra: { eas: { projectId: "test-project" } } } } }));
