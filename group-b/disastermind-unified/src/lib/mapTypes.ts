// ============================================================
// Group A WebSocket contract — map-relevant payload shapes
// Source: disastermind/api/FRONTEND_CONTRACT.md
// ============================================================

export interface GpsReading {
  location: { lat: number; lon: number }
  team_id: string
  status: 'active' | 'staged' | 'distress' | 'offline'
  timestamp: string
}

export interface RiskCell {
  centroid: { lat: number; lon: number }
  probability: number      // 0.0 – 1.0
  cell_id: string
  zone?: string
}

export interface Waypoint {
  lat: number
  lon: number
}

export interface DispatchRoute {
  team_id: string
  waypoints: Waypoint[]
  route_type: 'evacuation' | 'rescue' | 'supply'
}

export interface MapState {
  teams: Record<string, GpsReading>        // keyed by team_id
  riskCells: RiskCell[]
  routes: DispatchRoute[]
}

// ── SHAP feature explanations ─────────────────────────────────────────────────
export interface ShapFeature {
  label: string          // e.g. "River gauge 94%"
  value: number          // raw SHAP value (positive = increases risk)
  direction: 'up' | 'down'  // up = increases risk/urgency, down = decreases
}

export interface AgentDecisionShap {
  topFeatures: ShapFeature[]   // top 3 features only
  modelConfidence: number      // 0-1
}

// Synthetic SHAP data per agent type — used when Group A is offline
export const SYNTHETIC_SHAP: Record<string, AgentDecisionShap> = {
  'FLOOD-AI': {
    modelConfidence: 0.92,
    topFeatures: [
      { label: 'River gauge 94%', value: 0.38, direction: 'up' },
      { label: 'Rainfall 187mm/48h', value: 0.29, direction: 'up' },
      { label: 'Elevation 1.2m', value: 0.21, direction: 'up' },
    ],
  },
  'RESOURCE-AI': {
    modelConfidence: 0.87,
    topFeatures: [
      { label: 'Shelter at 88%', value: 0.31, direction: 'up' },
      { label: 'Boats available 6', value: 0.24, direction: 'down' },
      { label: 'ETA 14 min', value: 0.19, direction: 'up' },
    ],
  },
  'EVAC-AI': {
    modelConfidence: 0.89,
    topFeatures: [
      { label: 'Population at risk 14.2k', value: 0.42, direction: 'up' },
      { label: 'Route capacity 85%', value: 0.27, direction: 'down' },
      { label: 'Storm surge 2.1m', value: 0.33, direction: 'up' },
    ],
  },
  'COORD-AI': {
    modelConfidence: 0.84,
    topFeatures: [
      { label: 'Team proximity 2.1km', value: 0.28, direction: 'down' },
      { label: 'Zone 7 priority HIGH', value: 0.35, direction: 'up' },
      { label: 'Comms signal 72%', value: 0.18, direction: 'down' },
    ],
  },
  'ALERT-AI': {
    modelConfidence: 0.91,
    topFeatures: [
      { label: 'IMD alert Category 3', value: 0.44, direction: 'up' },
      { label: 'Landfall T-6h', value: 0.38, direction: 'up' },
      { label: 'Pop density HIGH', value: 0.29, direction: 'up' },
    ],
  },
}

// Fallback for unknown agent types
export const DEFAULT_SHAP: AgentDecisionShap = {
  modelConfidence: 0.80,
  topFeatures: [
    { label: 'Risk score 0.87', value: 0.35, direction: 'up' },
    { label: 'Confidence HIGH', value: 0.28, direction: 'up' },
    { label: 'Priority CRITICAL', value: 0.22, direction: 'up' },
  ],
}

// Synthetic fallback data — Odisha coast (Puri / Balasore / Cuttack)
export const SYNTHETIC_MAP_STATE: MapState = {
  teams: {
    'UNIT-A1': {
      team_id: 'UNIT-A1',
      location: { lat: 19.8135, lon: 85.8312 },
      status: 'active',
      timestamp: new Date().toISOString(),
    },
    'UNIT-A2': {
      team_id: 'UNIT-A2',
      location: { lat: 19.7950, lon: 85.8150 },
      status: 'active',
      timestamp: new Date().toISOString(),
    },
    'UNIT-B1': {
      team_id: 'UNIT-B1',
      location: { lat: 21.4942, lon: 86.9304 },
      status: 'staged',
      timestamp: new Date().toISOString(),
    },
    'UNIT-B2': {
      team_id: 'UNIT-B2',
      location: { lat: 21.5200, lon: 86.9100 },
      status: 'active',
      timestamp: new Date().toISOString(),
    },
    'UNIT-C1': {
      team_id: 'UNIT-C1',
      location: { lat: 20.4625, lon: 85.8828 },
      status: 'active',
      timestamp: new Date().toISOString(),
    },
  },
  riskCells: [
    { centroid: { lat: 19.82, lon: 85.83 }, probability: 0.92, cell_id: 'puri-1', zone: 'Zone 1' },
    { centroid: { lat: 19.79, lon: 85.80 }, probability: 0.85, cell_id: 'puri-2', zone: 'Zone 2' },
    { centroid: { lat: 19.75, lon: 85.77 }, probability: 0.78, cell_id: 'puri-3', zone: 'Zone 3' },
    { centroid: { lat: 21.50, lon: 86.93 }, probability: 0.71, cell_id: 'balasore-1', zone: 'Zone 4' },
    { centroid: { lat: 21.48, lon: 86.91 }, probability: 0.65, cell_id: 'balasore-2', zone: 'Zone 5' },
    { centroid: { lat: 20.45, lon: 85.88 }, probability: 0.55, cell_id: 'cuttack-1', zone: 'Zone 6' },
    { centroid: { lat: 20.47, lon: 85.90 }, probability: 0.88, cell_id: 'cuttack-2', zone: 'Zone 7' },
  ],
  routes: [
    {
      team_id: 'UNIT-A1',
      route_type: 'evacuation',
      waypoints: [
        { lat: 19.8135, lon: 85.8312 },
        { lat: 19.8200, lon: 85.8400 },
        { lat: 19.8300, lon: 85.8500 },
      ],
    },
    {
      team_id: 'UNIT-B2',
      route_type: 'rescue',
      waypoints: [
        { lat: 21.5200, lon: 86.9100 },
        { lat: 21.5100, lon: 86.9200 },
        { lat: 21.5000, lon: 86.9300 },
      ],
    },
  ],
}
