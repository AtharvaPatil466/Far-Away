/**
 * DisasterMind field app root (PRD Step 6 / 8 / 10).
 *
 * Four tabs:
 *   Orders  — incoming DeploymentOrderMsg, accept/decline -> OrderAck
 *   Beacon  — 60s GPS beacon, idle->enroute->onsite->returning lifecycle
 *   Report  — site-over-capacity report -> autonomous reinforcement
 *   Outbox  — durable offline queue + Iridium-fallback indicator/toggles
 *
 * A global connectivity banner reflects the live channel (terrestrial /
 * Iridium fallback / offline) at the top of every screen.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { DeviceProvider, useDevice } from './src/state/device';
import OrdersScreen from './src/screens/OrdersScreen';
import BeaconScreen from './src/screens/BeaconScreen';
import OverCapacityScreen from './src/screens/OverCapacityScreen';
import OutboxScreen from './src/screens/OutboxScreen';
import { colors } from './src/ui/theme';

const Tab = createBottomTabNavigator();

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.bg,
    card: colors.panel,
    text: colors.fg,
    border: colors.border,
    primary: colors.accent,
  },
};

function ConnectivityBanner() {
  const { connectivity, outbox, iridiumFallbackActive, teamId } = useDevice();
  const offline = !connectivity.terrestrialOnline && !connectivity.iridiumEnabled;
  let bg: string = colors.ok;
  let label = `${teamId} · ONLINE`;
  if (offline) {
    bg = colors.crit;
    label = `${teamId} · OFFLINE · ${outbox.depth} queued`;
  } else if (iridiumFallbackActive || (!connectivity.terrestrialOnline && connectivity.iridiumEnabled)) {
    bg = colors.sat;
    label = `${teamId} · IRIDIUM FALLBACK`;
  }
  return (
    <View style={[styles.banner, { backgroundColor: bg }]}>
      <Text style={styles.bannerText}>{label}</Text>
    </View>
  );
}

function Shell() {
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ConnectivityBanner />
      <NavigationContainer theme={navTheme}>
        <Tab.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: colors.panel },
            headerTitleStyle: { color: colors.fg },
            tabBarActiveTintColor: colors.accent,
            tabBarInactiveTintColor: colors.muted,
            tabBarStyle: { backgroundColor: colors.panel, borderTopColor: colors.border },
          }}
        >
          <Tab.Screen name="Orders" component={OrdersScreen} />
          <Tab.Screen name="Beacon" component={BeaconScreen} />
          <Tab.Screen name="Report" component={OverCapacityScreen} />
          <Tab.Screen name="Outbox" component={OutboxScreen} />
        </Tab.Navigator>
      </NavigationContainer>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <DeviceProvider>
        <StatusBar style="light" />
        <Shell />
      </DeviceProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  banner: { paddingVertical: 6, alignItems: 'center' },
  bannerText: { color: '#04122a', fontWeight: '700', fontSize: 12, letterSpacing: 0.5 },
});
