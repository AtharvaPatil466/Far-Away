/**
 * Incoming deployment orders (PRD Step 8 field app).
 *
 * Lists DeploymentOrderMsg orders pushed to this team. Accept emits an
 * OrderAck{status:"accepted"}; Decline emits OrderAck{status:"rejected"} —
 * both on the `fieldapp.order_ack` topic, routed through the durable outbox so
 * the receipt survives a loss of coverage (Iridium fallback / offline queue).
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { DeploymentOrderMsg } from '../contracts/types';
import { useDevice } from '../state/device';
import { colors, priorityColor } from '../ui/theme';

function OrderCard({ order }: { order: DeploymentOrderMsg }) {
  const { acceptOrder, declineOrder } = useDevice();
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.site}>{order.site}</Text>
        <View style={[styles.pill, { borderColor: priorityColor(order.priority) }]}>
          <Text style={[styles.pillText, { color: priorityColor(order.priority) }]}>
            P{order.priority}
          </Text>
        </View>
      </View>
      <Text style={styles.meta}>order {order.order_id} · team {order.team_id}</Text>
      {order.reason ? <Text style={styles.reason}>{order.reason}</Text> : null}
      <Text style={styles.meta}>
        {order.waypoints.length} waypoint(s) · channel {order.channel}
        {order.incident_id ? ` · ${order.incident_id}` : ''}
      </Text>
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.btn, styles.accept]}
          onPress={() => void acceptOrder(order)}
        >
          <Text style={styles.btnText}>Accept</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, styles.decline]}
          onPress={() => void declineOrder(order)}
        >
          <Text style={styles.btnText}>Decline</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function OrdersScreen() {
  const { orders } = useDevice();
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {orders.length === 0 ? (
        <Text style={styles.empty}>No incoming orders. You are clear.</Text>
      ) : (
        orders.map((o) => <OrderCard key={o.order_id} order={o} />)
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 14, gap: 12 },
  empty: { color: colors.muted, fontStyle: 'italic', marginTop: 24, textAlign: 'center' },
  card: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    gap: 6,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  site: { color: colors.fg, fontSize: 16, fontWeight: '700', flex: 1, paddingRight: 8 },
  pill: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 },
  pillText: { fontSize: 12, fontWeight: '700' },
  meta: { color: colors.muted, fontSize: 12 },
  reason: { color: colors.fg, fontSize: 14 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  btn: { flex: 1, borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  accept: { backgroundColor: '#176f2c' },
  decline: { backgroundColor: '#5c1b1b' },
  btnText: { color: colors.fg, fontWeight: '700', fontSize: 14 },
});
