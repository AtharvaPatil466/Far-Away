import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import { SYNTHETIC_MAP_STATE } from '../../../lib/mapTypes'
import type { MapState, GpsReading } from '../../../lib/mapTypes'

// Team status colours
const STATUS_COLOUR: Record<string, string> = {
  active: '#22c55e',
  staged: '#f59e0b',
  distress: '#ef4444',
  offline: '#6b7280',
}

function makeTeamEl(team: GpsReading): HTMLDivElement {
  const el = document.createElement('div')
  el.style.cssText = `
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: ${STATUS_COLOUR[team.status] ?? '#6b7280'};
    border: 2px solid #fff;
    box-shadow: 0 0 6px rgba(0,0,0,0.6);
    cursor: pointer;
    transition: transform 0.6s ease;
  `
  el.title = `${team.team_id} — ${team.status}`
  return el
}

interface LiveMapProps {
  mapState?: MapState
  className?: string
}

export function LiveMap({ mapState, className }: LiveMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markersRef = useRef<Record<string, maplibregl.Marker>>({})
  const [mapReady, setMapReady] = useState(false)

  const state = mapState ?? SYNTHETIC_MAP_STATE

  // Initialise map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center: [85.8312, 19.8135], // [lon, lat] — Puri, Odisha
      zoom: 7,
      attributionControl: false,
    })

    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      'bottom-right'
    )

    map.on('load', () => {
      // ── Risk heatmap layer ──────────────────────────────────────────
      map.addSource('risk-cells', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })

      map.addLayer({
        id: 'risk-heatmap',
        type: 'heatmap',
        source: 'risk-cells',
        paint: {
          'heatmap-weight': ['get', 'probability'],
          'heatmap-intensity': 1.5,
          'heatmap-radius': 40,
          'heatmap-opacity': 0.7,
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            0, 'rgba(0,0,255,0)',
            0.3, 'rgba(0,255,255,0.5)',
            0.6, 'rgba(255,165,0,0.7)',
            1, 'rgba(255,0,0,0.9)',
          ],
        },
      })

      // ── Dispatch route lines ────────────────────────────────────────
      map.addSource('routes', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })

      map.addLayer({
        id: 'route-lines',
        type: 'line',
        source: 'routes',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 2.5,
          'line-opacity': 0.8,
          'line-dasharray': [4, 2],
        },
      })

      setMapReady(true)
    })

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
      markersRef.current = {}
    }
  }, [])

  // Update layers when state changes
  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    const map = mapRef.current

    // ── Risk heatmap ──────────────────────────────────────────────────
    const riskSource = map.getSource('risk-cells') as maplibregl.GeoJSONSource
    if (riskSource) {
      riskSource.setData({
        type: 'FeatureCollection',
        features: state.riskCells.map(cell => ({
          type: 'Feature',
          geometry: {
            type: 'Point',
            // IMPORTANT: Mapbox/MapLibre wants [lon, lat]
            coordinates: [cell.centroid.lon, cell.centroid.lat],
          },
          properties: {
            probability: cell.probability,
            zone: cell.zone ?? cell.cell_id,
          },
        })),
      })
    }

    // ── Routes ────────────────────────────────────────────────────────
    const routeSource = map.getSource('routes') as maplibregl.GeoJSONSource
    if (routeSource) {
      const ROUTE_COLOURS: Record<string, string> = {
        evacuation: '#f59e0b',
        rescue: '#3b82f6',
        supply: '#22c55e',
      }
      routeSource.setData({
        type: 'FeatureCollection',
        features: state.routes.map(r => ({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: r.waypoints.map(w => [w.lon, w.lat]),
          },
          properties: {
            team_id: r.team_id,
            color: ROUTE_COLOURS[r.route_type] ?? '#ffffff',
          },
        })),
      })
    }

    // ── Team markers ──────────────────────────────────────────────────
    const existingIds = new Set(Object.keys(markersRef.current))
    const newIds = new Set(Object.keys(state.teams))

    // Remove stale markers
    existingIds.forEach(id => {
      if (!newIds.has(id)) {
        markersRef.current[id].remove()
        delete markersRef.current[id]
      }
    })

    // Add or update markers
    Object.values(state.teams).forEach(team => {
      const lngLat: [number, number] = [team.location.lon, team.location.lat]
      if (markersRef.current[team.team_id]) {
        // Smooth position update
        markersRef.current[team.team_id].setLngLat(lngLat)
        // Update colour
        const el = markersRef.current[team.team_id].getElement()
        el.style.background = STATUS_COLOUR[team.status] ?? '#6b7280'
      } else {
        const el = makeTeamEl(team)
        const marker = new maplibregl.Marker({ element: el })
          .setLngLat(lngLat)
          .setPopup(
            new maplibregl.Popup({ offset: 12 }).setHTML(
              `<div style="color:#000;font-size:12px;font-weight:600">
                ${team.team_id}<br/>
                <span style="color:${STATUS_COLOUR[team.status]}">● ${team.status.toUpperCase()}</span>
              </div>`
            )
          )
          .addTo(map)
        markersRef.current[team.team_id] = marker
      }
    })
  }, [mapReady, state])

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: '100%', height: '100%', borderRadius: '8px', overflow: 'hidden' }}
    />
  )
}
