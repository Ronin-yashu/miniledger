import React, { useState } from "react";
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { api } from "../api";
import { colors } from "../theme";

export default function LoginScreen({ onLoggedIn }: { onLoggedIn: (token: string) => void }) {
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const normalized = phone.replace(/[\s-]/g, "");

  async function sendOtp() {
    setBusy(true); setError(null);
    try {
      await api.requestOtp(normalized);
      setOtpSent(true);
      setInfo("OTP printed in the server log. Check your backend terminal.");
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function verify() {
    setBusy(true); setError(null);
    try {
      const { token } = await api.verifyOtp(normalized, otp.trim());
      onLoggedIn(token);
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  }

  return (
    <KeyboardAvoidingView style={styles.wrap} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Text style={styles.logo}>MiniLedger</Text>
      <Text style={styles.sub}>Track money you've lent to friends</Text>

      <Text style={styles.label}>Phone number</Text>
      <TextInput
        style={styles.input} value={phone} onChangeText={setPhone} editable={!otpSent}
        placeholder="+919876543210" keyboardType="phone-pad" autoComplete="tel"
      />

      {otpSent && (
        <>
          <Text style={styles.label}>OTP</Text>
          <TextInput
            style={styles.input} value={otp} onChangeText={setOtp} placeholder="6-digit code"
            keyboardType="number-pad" maxLength={6}
          />
        </>
      )}

      {info && <Text style={styles.info}>{info}</Text>}
      {error && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity
        style={[styles.button, busy && { opacity: 0.6 }]} disabled={busy}
        onPress={otpSent ? verify : sendOtp}
      >
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{otpSent ? "Verify & Login" : "Send OTP"}</Text>}
      </TouchableOpacity>

      {otpSent && (
        <TouchableOpacity onPress={() => { setOtpSent(false); setOtp(""); setInfo(null); setError(null); }}>
          <Text style={styles.link}>Change number</Text>
        </TouchableOpacity>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: colors.bg },
  logo: { fontSize: 34, fontWeight: "800", color: colors.primary },
  sub: { color: colors.muted, marginBottom: 32, marginTop: 4 },
  label: { fontWeight: "600", color: colors.text, marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 14, fontSize: 16 },
  button: { backgroundColor: colors.primary, padding: 15, borderRadius: 10, alignItems: "center", marginTop: 22 },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  info: { color: colors.muted, marginTop: 12 },
  error: { color: colors.danger, marginTop: 12, fontWeight: "600" },
  link: { color: colors.primary, textAlign: "center", marginTop: 16, fontWeight: "600" },
});