import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Summary, money } from "../api";
import { colors } from "../theme";

export default function SummaryCard({ summary }: { summary: Summary | null }) {
  const s = summary ?? { totalLent: 0, totalRepaid: 0, totalOutstanding: 0, overdueAmount: 0 };
  return (
    <View style={styles.card}>
      <Text style={styles.heading}>Outstanding</Text>
      <Text style={styles.big}>{money(s.totalOutstanding)}</Text>
      <View style={styles.row}>
        <Stat label="Total lent" value={money(s.totalLent)} />
        <Stat label="Repaid" value={money(s.totalRepaid)} color={colors.success} />
        <Stat label="Overdue" value={money(s.overdueAmount)} color={s.overdueAmount > 0 ? "#FFD3E2" : undefined} />
      </View>
    </View>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.primary, borderRadius: 16, padding: 18, marginBottom: 16 },
  heading: { color: "#DCE4FF", fontWeight: "600" },
  big: { color: "#fff", fontSize: 34, fontWeight: "800", marginVertical: 4 },
  row: { flexDirection: "row", marginTop: 12 },
  statLabel: { color: "#DCE4FF", fontSize: 12 },
  statValue: { color: "#fff", fontWeight: "700", fontSize: 16, marginTop: 2 },
});