/**
 * Site-over-capacity report (PRD Step 6).
 *
 * The on-scene team reports its site is over capacity; this emits a
 * SiteOverCapacityReport (rendered as a gps_beacon reading carrying
 * site_over_capacity=true) so the Tier-2 coordinator autonomously requests
 * reinforcement. Routed through the durable outbox like every other emission.
 */
import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { useDevice } from '../state/device';
import { colors } from '../ui/theme';

export default function OverCapacityScreen() {
  const { reportOverCapacity, lastSend } = useDevice();
  const [site, setSite] = useState('Zone-7 / Marine Drive');
  const [shortfall, setShortfall] = useState('2');
  const [note, setNote] = useState('site over capacity');
  const [submitted, setSubmitted] = useState<string | null>(null);

  const submit = async () => {
    const n = Math.max(1, parseInt(shortfall, 10) || 1);
    await reportOverCapacity({ site, shortfall: n, note });
    setSubmitted(`reported shortfall ${n} at ${site}`);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.label}>Site</Text>
        <TextInput
          style={styles.input}
          value={site}
          onChangeText={setSite}
          placeholder="site / zone"
          placeholderTextColor={colors.muted}
        />
        <Text style={styles.label}>Shortfall (teams needed)</Text>
        <TextInput
          style={styles.input}
          value={shortfall}
          onChangeText={setShortfall}
          keyboardType="number-pad"
          placeholderTextColor={colors.muted}
        />
        <Text style={styles.label}>Note</Text>
        <TextInput
          style={styles.input}
          value={note}
          onChangeText={setNote}
          placeholderTextColor={colors.muted}
        />
        <TouchableOpacity style={styles.btn} onPress={() => void submit()}>
          <Text style={styles.btnText}>Report over capacity → request reinforcement</Text>
        </TouchableOpacity>
      </View>

      {submitted ? <Text style={styles.ok}>{submitted}</Text> : null}
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
    gap: 6,
  },
  label: { color: colors.muted, fontSize: 11, textTransform: 'uppercase', marginTop: 8 },
  input: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    color: colors.fg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  btn: {
    backgroundColor: colors.warn,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 14,
  },
  btnText: { color: '#1a1300', fontWeight: '700', fontSize: 14, textAlign: 'center' },
  ok: { color: colors.ok, fontSize: 13, textAlign: 'center' },
  lastSend: { color: colors.muted, fontSize: 12, textAlign: 'center' },
});
