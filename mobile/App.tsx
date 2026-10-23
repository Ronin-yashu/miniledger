import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";
import LoginScreen from "./src/screens/LoginScreen";
import HomeScreen from "./src/screens/HomeScreen";

const TOKEN_KEY = "miniledger_token";

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(TOKEN_KEY).then((t) => { setToken(t); setReady(true); });
  }, []);

  const login = useCallback(async (t: string) => { await AsyncStorage.setItem(TOKEN_KEY, t); setToken(t); }, []);
  const logout = useCallback(async () => { await AsyncStorage.removeItem(TOKEN_KEY); setToken(null); }, []);

  if (!ready) return <View style={{ flex: 1, justifyContent: "center" }}><ActivityIndicator /></View>;

  return (
    <>
      <StatusBar style="dark" />
      {token ? <HomeScreen token={token} onLogout={logout} /> : <LoginScreen onLoggedIn={login} />}
    </>
  );
}