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
