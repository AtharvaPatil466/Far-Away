/**
 * 60-second GPS beacon (PRD Step 6).
 *
 * The device emits a TeamStatusUpdate (rendered as the coordinator's
 * gps_beacon reading) every 60 s automatically; this screen shows the live
 * position/status and lets the operator advance the status lifecycle
 * idle -> enroute -> onsite -> returning or fire a beacon on demand.
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { STATUS_FLOW, Status } from '../contracts/types';
import { BEACON_INTERVAL_MS, useDevice } from '../state/device';
import { colors } from '../ui/theme';

export default function BeaconScreen() {
  const { teamId, assetType, location, status, setStatus, sendBeaconNow, lastSend } =
    useDevice();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.label}>Team</Text>
        <Text style={styles.value}>
          {teamId} · {assetType}
        </Text>
        <Text style={styles.label}>Position (simulated GPS)</Text>
        <Text style={styles.value}>
          {location.lat.toFixed(5)}, {location.lon.toFixed(5)}
        </Text>
        <Text style={styles.label}>Beacon cadence</Text>
        <Text style={styles.value}>every {BEACON_INTERVAL_MS / 1000}s (PRD Step 6)</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Status lifecycle</Text>
        <View style={styles.flow}>
          {STATUS_FLOW.map((s) => {
            const active = s === status;
            return (
              <TouchableOpacity
                key={s}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setStatus(s as Status)}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{s}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <TouchableOpacity style={styles.beaconBtn} onPress={() => void sendBeaconNow()}>
        <Text style={styles.beaconText}>Send beacon now</Text>
      </TouchableOpacity>

      {lastSend ? (
        <Text style={styles.lastSend}>
          last send: {lastSend.detail} ({lastSend.channel ?? 'queued'})
        </Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 14, gap: 12 },
  card: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    gap: 4,
  },
  label: { color: colors.muted, fontSize: 11, textTransform: 'uppercase', marginTop: 8 },
  value: { color: colors.fg, fontSize: 16, fontWeight: '600' },
  flow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chip: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.bg,
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.muted, fontWeight: '600' },
  chipTextActive: { color: '#04122a' },
  beaconBtn: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  beaconText: { color: '#04122a', fontWeight: '700', fontSize: 15 },
  lastSend: { color: colors.muted, fontSize: 12, textAlign: 'center' },
});
