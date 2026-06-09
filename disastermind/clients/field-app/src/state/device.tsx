/**
 * Device state container (PRD Step 6 / 8 / 10).
 *
 * Owns the single source of truth for the field device:
 *   - team identity (teamId / assetType) and simulated GPS location,
 *   - the current status in the idle->enroute->onsite->returning lifecycle,
 *   - the inbox of incoming DeploymentOrderMsg orders,
 *   - the transport stack (terrestrial -> Iridium fallback) and the durable
 *     offline OutboxQueue,
 *   - the dev connectivity toggles that make the offline / satellite-fallback
 *     path demonstrable in a simulator.
 *
 * Every outbound action (ack, beacon, over-capacity) is funnelled through the
 * OutboxQueue so it is durable and FIFO-ordered exactly as a real device would
 * behave when it loses terrestrial coverage.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Constants from 'expo-constants';

import {
  buildOrderAck,
  buildSiteOverCapacityReport,
  buildTeamStatusUpdate,
  deploymentOrderFromPayload,
  gpsBeaconEnvelope,
  orderAckEnvelope,
  overCapacityEnvelope,
  siteOverCapacityToReading,
  teamStatusToReading,
} from '../contracts/builders';
import {
  AckStatus,
  AssetType,
  DeploymentOrderMsg,
  LatLon,
  Status,
} from '../contracts/types';
import { IridiumTransport } from '../transport/iridium';
import { MockTransport } from '../transport/mock';
import { FlushOutcome, OutboxQueue, OutboxSnapshot } from '../transport/outbox';
import { createDefaultStore } from '../transport/storage';
import { TerrestrialTransport } from '../transport/terrestrial';
import { Transport } from '../transport/types';

/** 60-second GPS beacon cadence (PRD Step 6). */
export const BEACON_INTERVAL_MS = 60_000;

interface DeviceExtra {
  backendUrl: string;
  defaultTeamId: string;
  defaultAssetType: string;
}

function readExtra(): DeviceExtra {
  const extra = (Constants.expoConfig?.extra ?? {}) as Partial<DeviceExtra>;
  return {
    backendUrl: extra.backendUrl ?? '',
    defaultTeamId: extra.defaultTeamId ?? 'NDRF-01',
    defaultAssetType: extra.defaultAssetType ?? 'ndrf_team',
  };
}

/** A couple of seed orders so the Orders screen has content with no backend. */
function seedOrders(teamId: string): DeploymentOrderMsg[] {
  return [
    deploymentOrderFromPayload(
      {
        order_id: 'ORD-1001',
        team_id: teamId,
        site: 'Zone-7 / Marine Drive',
        priority: 1,
        reason: 'Mobility-impaired evacuation, rising inundation',
        channel: 'terrestrial',
        waypoints: [
          { lat: 19.0176, lon: 72.8561 },
          { lat: 19.0241, lon: 72.8410 },
        ],
        incident_id: 'INC-A-001',
      },
      'INC-A-001',
    ),
    deploymentOrderFromPayload(
      {
        order_id: 'ORD-1002',
        team_id: teamId,
        site: 'Zone-3 / Dadar shelter approach',
        priority: 3,
        reason: 'Stage boats at high-risk crossing',
        channel: 'terrestrial',
        waypoints: [{ lat: 19.0186, lon: 72.8440 }],
        incident_id: 'INC-A-001',
      },
      'INC-A-001',
    ),
  ];
}

export interface Connectivity {
  terrestrialOnline: boolean;
  iridiumEnabled: boolean;
}

export interface LastSend {
  channel: string | null;
  detail: string;
  at: string;
}

export interface DeviceContextValue {
  teamId: string;
  assetType: AssetType;
  location: LatLon;
  status: Status;
  orders: DeploymentOrderMsg[];
  outbox: OutboxSnapshot;
  connectivity: Connectivity;
  lastSend: LastSend | null;
  /** True while terrestrial is unreachable but Iridium delivered the last send. */
  iridiumFallbackActive: boolean;

  setStatus: (status: Status) => void;
  acceptOrder: (order: DeploymentOrderMsg) => Promise<void>;
  declineOrder: (order: DeploymentOrderMsg, note?: string) => Promise<void>;
  sendBeaconNow: () => Promise<void>;
  reportOverCapacity: (args: {
    site: string;
    shortfall: number;
    note?: string;
  }) => Promise<void>;
  setTerrestrialOnline: (online: boolean) => void;
  setIridiumEnabled: (enabled: boolean) => void;
  flushOutbox: () => Promise<void>;
}

const DeviceContext = createContext<DeviceContextValue | null>(null);

export function DeviceProvider({ children }: { children: React.ReactNode }) {
  const extra = useMemo(readExtra, []);
  const teamId = extra.defaultTeamId;
  const assetType = extra.defaultAssetType as AssetType;

  // Build the transport stack + durable outbox exactly once.
  const refs = useRef<{
    terrestrial: Transport;
    iridium: IridiumTransport;
    outbox: OutboxQueue;
  } | null>(null);
  if (refs.current === null) {
    const terrestrial: Transport = extra.backendUrl
      ? new TerrestrialTransport(extra.backendUrl)
      : new MockTransport(true);
    const iridium = new IridiumTransport();
    const outbox = new OutboxQueue(createDefaultStore(), terrestrial, iridium);
    refs.current = { terrestrial, iridium, outbox };
  }
  const { terrestrial, iridium, outbox } = refs.current;

  const [location, setLocation] = useState<LatLon>({ lat: 19.0760, lon: 72.8777 });
  const [status, setStatusState] = useState<Status>('idle');
  const [orders, setOrders] = useState<DeploymentOrderMsg[]>(() => seedOrders(teamId));
  const [outboxSnap, setOutboxSnap] = useState<OutboxSnapshot>(outbox.snapshot());
  const [connectivity, setConnectivity] = useState<Connectivity>({
    terrestrialOnline: true,
    iridiumEnabled: true,
  });
  const [lastSend, setLastSend] = useState<LastSend | null>(null);

  // Reflect every outbox mutation into React state for the UI.
  useEffect(() => {
    const unsubscribe = outbox.subscribe(setOutboxSnap);
    void outbox.load();
    return unsubscribe;
  }, [outbox]);

  const applyFlush = useCallback((outcome: FlushOutcome) => {
    if (outcome.sent > 0) {
      setLastSend({
        channel: outcome.lastChannel,
        detail:
          outcome.lastChannel === 'iridium'
            ? `delivered ${outcome.sent} via Iridium fallback`
            : `delivered ${outcome.sent} via terrestrial`,
        at: new Date().toISOString(),
      });
    } else if (outcome.remaining > 0) {
      setLastSend({
        channel: null,
        detail: `queued offline (${outcome.remaining} pending)`,
        at: new Date().toISOString(),
      });
    }
  }, []);

  // --- connectivity toggles ------------------------------------------------
  const setTerrestrialOnline = useCallback(
    (online: boolean) => {
      if (terrestrial instanceof MockTransport) {
        terrestrial.setOnline(online);
      } else if (terrestrial instanceof TerrestrialTransport) {
        terrestrial.setForcedOffline(!online);
      }
      setConnectivity((c) => ({ ...c, terrestrialOnline: online }));
      // Coming back online should drain anything that queued while offline.
      if (online) {
        void outbox.flush().then(applyFlush);
      }
    },
    [terrestrial, outbox, applyFlush],
  );

  const setIridiumEnabled = useCallback(
    (enabled: boolean) => {
      iridium.setEnabled(enabled);
      setConnectivity((c) => ({ ...c, iridiumEnabled: enabled }));
      if (enabled) {
        void outbox.flush().then(applyFlush);
      }
    },
    [iridium, outbox, applyFlush],
  );

  // --- status / GPS --------------------------------------------------------
  const setStatus = useCallback((next: Status) => setStatusState(next), []);

  const driftLocation = useCallback((): LatLon => {
    let next: LatLon = location;
    setLocation((prev) => {
      next = {
        lat: prev.lat + (Math.random() - 0.5) * 0.002,
        lon: prev.lon + (Math.random() - 0.5) * 0.002,
      };
      return next;
    });
    return next;
  }, [location]);

  // --- outbound actions ----------------------------------------------------
  const emitAck = useCallback(
    async (order: DeploymentOrderMsg, ackStatus: AckStatus, note: string) => {
      const ack = buildOrderAck({
        orderId: order.order_id,
        teamId: order.team_id || teamId,
        status: ackStatus,
        note,
        incidentId: order.incident_id ?? null,
      });
      const outcome = await outbox.enqueue(orderAckEnvelope(ack));
      applyFlush(outcome);
    },
    [outbox, teamId, applyFlush],
  );

  const acceptOrder = useCallback(
    async (order: DeploymentOrderMsg) => {
      setOrders((cur) => cur.filter((o) => o.order_id !== order.order_id));
      setStatusState('enroute');
      await emitAck(order, 'accepted', 'order accepted, en route');
    },
    [emitAck],
  );

  const declineOrder = useCallback(
    async (order: DeploymentOrderMsg, note = 'unable to accept') => {
      setOrders((cur) => cur.filter((o) => o.order_id !== order.order_id));
      await emitAck(order, 'rejected', note);
    },
    [emitAck],
  );

  const sendBeaconNow = useCallback(async () => {
    const loc = driftLocation();
    const update = buildTeamStatusUpdate({
      teamId,
      assetType,
      location: loc,
      status,
    });
    const outcome = await outbox.enqueue(
      gpsBeaconEnvelope(teamStatusToReading(update)),
    );
    applyFlush(outcome);
  }, [driftLocation, teamId, assetType, status, outbox, applyFlush]);

  const reportOverCapacity = useCallback(
    async (args: { site: string; shortfall: number; note?: string }) => {
      const report = buildSiteOverCapacityReport({
        teamId,
        site: args.site,
        shortfall: args.shortfall,
        note: args.note,
      });
      const reading = siteOverCapacityToReading(report, location, assetType);
      const outcome = await outbox.enqueue(overCapacityEnvelope(reading));
      applyFlush(outcome);
    },
    [teamId, location, assetType, outbox, applyFlush],
  );

  const flushOutbox = useCallback(async () => {
    const outcome = await outbox.flush();
    applyFlush(outcome);
  }, [outbox, applyFlush]);

  // --- 60-second GPS beacon (PRD Step 6) -----------------------------------
  useEffect(() => {
    const timer = setInterval(() => {
      void sendBeaconNow();
    }, BEACON_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [sendBeaconNow]);

  const iridiumFallbackActive =
    !connectivity.terrestrialOnline &&
    connectivity.iridiumEnabled &&
    lastSend?.channel === 'iridium';

  const value: DeviceContextValue = {
    teamId,
    assetType,
    location,
    status,
    orders,
    outbox: outboxSnap,
    connectivity,
    lastSend,
    iridiumFallbackActive,
    setStatus,
    acceptOrder,
    declineOrder,
    sendBeaconNow,
    reportOverCapacity,
    setTerrestrialOnline,
    setIridiumEnabled,
    flushOutbox,
  };

  return <DeviceContext.Provider value={value}>{children}</DeviceContext.Provider>;
}

export function useDevice(): DeviceContextValue {
  const ctx = useContext(DeviceContext);
  if (!ctx) {
    throw new Error('useDevice must be used within a DeviceProvider');
  }
  return ctx;
}
