import { Platform } from "react-native";

// Override with EXPO_PUBLIC_API_URL (required for a physical phone: use your PC's LAN IP).
// Defaults work for emulators: Android emulator reaches the host via 10.0.2.2.
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  (Platform.OS === "android" ? "http://10.0.2.2:4000" : "http://localhost:4000");