import React, { useState } from "react";
import {
  ActivityIndicator, Image, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { api } from "../api";
import { colors } from "../theme";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const inDays = (n: number) => iso(new Date(Date.now() + n * 86400000));

export default function AddLoanModal({
  visible, token, onClose, onAdded,
}: { visible: boolean; token: string; onClose: () => void; onAdded: () => void }) {
  const [friendName, setFriendName] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(inDays(30));
  const [receipt, setReceipt] = useState<{ uri: string; base64: string; mime: string } | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setFriendName(""); setAmount(""); setDueDate(inDays(30)); setReceipt(undefined); setError(null);
  }

  function validate(): string | null {
    if (!friendName.trim()) return "Friend name is required";
    const n = Number(amount);
    if (!amount || isNaN(n) || n <= 0) return "Enter an amount greater than 0";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || isNaN(new Date(dueDate).getTime()))
      return "Due date must be YYYY-MM-DD";
    return null;
  }

  async function pickReceipt() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { setError("Photo permission denied"); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.5, base64: true });
    if (!res.canceled && res.assets[0].base64) {
      const a = res.assets[0];
      setReceipt({ uri: a.uri, base64: a.base64!, mime: a.mimeType === "image/png" ? "image/png" : "image/jpeg" });
    }
  }

  async function submit() {
    const v = validate();
    if (v) { setError(v); return; }
    setBusy(true); setError(null);
    try {
      await api.addLoan(token, { friendName: friendName.trim(), amount, dueDate, receipt });
      reset();
      onAdded();
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>New entry</Text>

          <Text style={styles.label}>Friend name</Text>
          <TextInput style={styles.input} value={friendName} onChangeText={setFriendName} placeholder="e.g. Rahul" />

          <Text style={styles.label}>Amount (₹)</Text>
          <TextInput style={styles.input} value={amount} onChangeText={setAmount} placeholder="500" keyboardType="decimal-pad" />

          <Text style={styles.label}>Due date (YYYY-MM-DD)</Text>
          <TextInput style={styles.input} value={dueDate} onChangeText={setDueDate} placeholder="2026-12-01" autoCapitalize="none" />
          <View style={styles.chips}>
            {[7, 30, 90].map((d) => (
              <TouchableOpacity key={d} style={styles.chip} onPress={() => setDueDate(inDays(d))}>
                <Text style={styles.chipText}>+{d} days</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Receipt photo (optional)</Text>
          {receipt ? (
            <View>
              <Image source={{ uri: receipt.uri }} style={styles.preview} />
              <TouchableOpacity onPress={() => setReceipt(undefined)}><Text style={styles.remove}>Remove photo</Text></TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.outline} onPress={pickReceipt}>
              <Text style={styles.outlineText}>Choose photo</Text>
            </TouchableOpacity>
          )}

          {error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity style={[styles.button, busy && { opacity: 0.6 }]} disabled={busy} onPress={submit}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save entry</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { reset(); onClose(); }}><Text style={styles.cancel}>Cancel</Text></TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 24, paddingTop: 56, backgroundColor: colors.bg, flexGrow: 1 },
  title: { fontSize: 26, fontWeight: "800", color: colors.text, marginBottom: 8 },
  label: { fontWeight: "600", color: colors.text, marginBottom: 6, marginTop: 14 },
  input: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 14, fontSize: 16 },
  chips: { flexDirection: "row", gap: 8, marginTop: 8 },
  chip: { backgroundColor: "#E7ECFF", paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16 },
  chipText: { color: colors.primary, fontWeight: "600" },
  outline: { borderWidth: 1, borderColor: colors.primary, borderRadius: 10, padding: 12, alignItems: "center" },
  outlineText: { color: colors.primary, fontWeight: "600" },
  preview: { width: "100%", height: 180, borderRadius: 10 },
  remove: { color: colors.danger, marginTop: 8, fontWeight: "600" },
  error: { color: colors.danger, marginTop: 14, fontWeight: "600" },
  button: { backgroundColor: colors.primary, padding: 15, borderRadius: 10, alignItems: "center", marginTop: 24 },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  cancel: { textAlign: "center", marginTop: 16, color: colors.muted, fontWeight: "600" },
});