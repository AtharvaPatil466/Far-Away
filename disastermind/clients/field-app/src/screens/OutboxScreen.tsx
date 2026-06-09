/**
 * Offline outbox + Iridium fallback indicator (PRD Step 8 channels / Step 10).
 *
 * Shows the durable send queue and lets the operator simulate loss of
 * terrestrial coverage and the Iridium satellite modem state, so the
 * offline-queue + satellite-fallback behaviour is fully demonstrable. While
 * terrestrial is down but Iridium is up, emissions are delivered over the
 * satellite link; with both down they queue durably (FIFO) and drain on
 * reconnect.
 */
import React from 'react';
import { ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';

import { useDevice } from '../state/device';
import { colors } from '../ui/theme';

export default function OutboxScreen() {
  const {
    connectivity,
    setTerrestrialOnline,
    setIridiumEnabled,
    outbox,
    flushOutbox,
    iridiumFallbackActive,
  } = useDevice();

  const offline = !connectivity.terrestrialOnline && !connectivity.iridiumEnabled;
  const onSatellite =
    !connectivity.terrestrialOnline && connectivity.iridiumEnabled;

  const banner = offline
    ? { style: styles.bannerOffline, text: `OFFLINE · ${outbox.depth} queued (durable)` }
    : iridiumFallbackActive || onSatellite
      ? { style: styles.bannerSat, text: 'IRIDIUM FALLBACK ACTIVE · satellite link' }
      : { style: styles.bannerOnline, text: 'ONLINE · terrestrial link up' };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={[styles.banner, banner.style]}>
        <Text style={styles.bannerText}>{banner.text}</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Terrestrial link</Text>
          <Switch
            value={connectivity.terrestrialOnline}
            onValueChange={setTerrestrialOnline}
          />
        </View>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Iridium satellite modem</Text>
          <Switch value={connectivity.iridiumEnabled} onValueChange={setIridiumEnabled} />
        </View>
        <Text style={styles.hint}>
          Turn off terrestrial to force the Iridium fallback. Turn off both to queue
          offline; emissions drain automatically when a link returns.
        </Text>
      </View>

      <View style={styles.card}>
        <View style={styles.queueHead}>
          <Text style={styles.queueTitle}>Outbox · depth {outbox.depth}</Text>
          <TouchableOpacity style={styles.flushBtn} onPress={() => void flushOutbox()}>
            <Text style={styles.flushText}>Flush</Text>
          </TouchableOpacity>
        </View>
        {outbox.messages.length === 0 ? (
          <Text style={styles.empty}>queue empty</Text>
        ) : (
          outbox.messages.map((m) => (
            <View key={m.id} style={styles.qrow}>
              <Text style={styles.qkind}>{m.kind}</Text>
              <Text style={styles.qtopic}>{m.topic}</Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 14, gap: 12 },
  banner: { borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  bannerOnline: { backgroundColor: '#0f3d22', borderColor: colors.ok, borderWidth: 1 },
  bannerSat: { backgroundColor: '#2b1d4a', borderColor: colors.sat, borderWidth: 1 },
  bannerOffline: { backgroundColor: '#3d1414', borderColor: colors.crit, borderWidth: 1 },
  bannerText: { color: colors.fg, fontWeight: '700', fontSize: 14 },
  card: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    gap: 10,
  },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toggleLabel: { color: colors.fg, fontSize: 15 },
  hint: { color: colors.muted, fontSize: 12 },
  queueHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  queueTitle: { color: colors.fg, fontSize: 15, fontWeight: '700' },
  flushBtn: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  flushText: { color: '#04122a', fontWeight: '700' },
  empty: { color: colors.muted, fontStyle: 'italic' },
  qrow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopColor: colors.border,
    borderTopWidth: 1,
    paddingTop: 8,
  },
  qkind: { color: colors.fg, fontFamily: 'monospace', fontSize: 12 },
  qtopic: { color: colors.accent, fontFamily: 'monospace', fontSize: 12 },
});
