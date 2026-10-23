import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, Image, RefreshControl, StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { Loan, Summary, UnauthorizedError, api, money } from "../api";
import { API_URL } from "../config";
import SummaryCard from "../components/SummaryCard";
import AddLoanModal from "../components/AddLoanModal";
import { colors } from "../theme";

export default function HomeScreen({ token, onLogout }: { token: string; onLogout: () => void }) {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    try {
      const [l, s] = await Promise.all([api.loans(token), api.summary(token)]);
      setLoans(l.loans); setSummary(s); setError(null);
    } catch (e: any) {
      if (e instanceof UnauthorizedError) return onLogout();
      setError(e.message);
    } finally { setLoading(false); setRefreshing(false); }
  }, [token, onLogout]);

  useEffect(() => { load(); }, [load]);

  function confirmRepay(loan: Loan) {
    Alert.alert("Mark as repaid?", `${loan.friendName} repaid ${money(loan.amount)}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Yes, repaid",
        onPress: async () => {
          try { await api.repay(token, loan.id); load(); }
          catch (e: any) { Alert.alert("Error", e.message); }
        },
      },
    ]);
  }

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>;

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>MiniLedger</Text>
        <TouchableOpacity onPress={onLogout}><Text style={styles.logout}>Logout</Text></TouchableOpacity>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <FlatList
        data={loans}
        keyExtractor={(l) => String(l.id)}
        ListHeaderComponent={<SummaryCard summary={summary} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        ListEmptyComponent={<Text style={styles.empty}>No entries yet. Tap + to add one.</Text>}
        contentContainerStyle={{ paddingBottom: 100 }}
        renderItem={({ item }) => (
          <View style={[styles.item, item.overdue && styles.itemOverdue, item.repaid && { opacity: 0.6 }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.friendName}</Text>
              <Text style={[styles.due, item.overdue && { color: colors.danger, fontWeight: "700" }]}>
                {item.repaid ? "Repaid" : item.overdue ? `OVERDUE · was due ${item.dueDate}` : `Due ${item.dueDate}`}
              </Text>
              {item.receiptUrl && <Image source={{ uri: API_URL + item.receiptUrl }} style={styles.thumb} />}
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={[styles.amount, item.overdue && { color: colors.danger }]}>{money(item.amount)}</Text>
              {!item.repaid && (
                <TouchableOpacity style={styles.repayBtn} onPress={() => confirmRepay(item)}>
                  <Text style={styles.repayText}>Mark repaid</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      />

      <TouchableOpacity style={styles.fab} onPress={() => setShowAdd(true)}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      <AddLoanModal
        visible={showAdd} token={token} onClose={() => setShowAdd(false)}
        onAdded={() => { setShowAdd(false); load(); }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 16, paddingTop: 56 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  title: { fontSize: 26, fontWeight: "800", color: colors.text },
  logout: { color: colors.primary, fontWeight: "600" },
  error: { color: colors.danger, marginBottom: 8, fontWeight: "600" },
  empty: { textAlign: "center", color: colors.muted, marginTop: 40 },
  item: {
    flexDirection: "row", backgroundColor: colors.card, borderRadius: 12, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: colors.border,
  },
  itemOverdue: { backgroundColor: colors.dangerBg, borderColor: colors.danger, borderLeftWidth: 5 },
  name: { fontSize: 17, fontWeight: "700", color: colors.text },
  due: { color: colors.muted, marginTop: 3 },
  amount: { fontSize: 18, fontWeight: "800", color: colors.text },
  thumb: { width: 56, height: 56, borderRadius: 8, marginTop: 8 },
  repayBtn: { marginTop: 10, backgroundColor: "#E7F6EC", paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8 },
  repayText: { color: colors.success, fontWeight: "700", fontSize: 12 },
  fab: {
    position: "absolute", right: 20, bottom: 28, width: 58, height: 58, borderRadius: 29,
    backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", elevation: 4,
  },
  fabText: { color: "#fff", fontSize: 32, marginTop: -2 },
});