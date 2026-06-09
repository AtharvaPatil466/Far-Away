// Map view of dispatches / field orders.
//
// Plots every plottable order extracted from dispatch & field-order bus
// messages (see lib/geo.ordersFromMessages). Uses vector CircleMarkers +
// Polylines (no marker image assets), so the map still renders meaningfully on
// its dark canvas even when OpenStreetMap tiles cannot load (offline).
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer } from "react-leaflet";
import type { LatLngExpression } from "leaflet";

import type { Message } from "../api/types";
import { isEscalationish } from "../api/types";
import { orderAnchor, ordersFromMessages, type PlottedOrder } from "../lib/geo";

// India-centred default view.
const DEFAULT_CENTER: LatLngExpression = [22.0, 79.0];
const DEFAULT_ZOOM = 5;

function color(priority: number): string {
  if (priority <= 1) return "#f85149"; // CRITICAL
  if (priority === 2) return "#d29922"; // HIGH
  return "#58a6ff";
}

function isDispatchTopic(topic: string): boolean {
  return /dispatch|field_order|routing_plan/i.test(topic) || isEscalationish(topic);
}

function OrderLayer({ order }: { order: PlottedOrder }) {
  const c = color(order.priority);
  const line: LatLngExpression[] = order.waypoints.map((w) => [w.lat, w.lon]);
  const dest = orderAnchor(order);
  return (
    <>
      {order.waypoints.length > 1 ? (
        <Polyline positions={line} pathOptions={{ color: c, weight: 2, opacity: 0.7 }} />
      ) : null}
      {order.waypoints.map((w, i) => (
        <CircleMarker
          key={`${order.key}:wp:${i}`}
          center={[w.lat, w.lon]}
          radius={i === order.waypoints.length - 1 ? 7 : 4}
          pathOptions={{ color: c, fillColor: c, fillOpacity: 0.6 }}
        />
      ))}
      <CircleMarker
        center={[dest.lat, dest.lon]}
        radius={8}
        pathOptions={{ color: c, fillColor: c, fillOpacity: 0.2 }}
      >
        <Popup>
          <b>{order.site ?? order.topic}</b>
          <br />
          {order.priorityLabel} · {order.topic}
          <br />
          {order.team ? `team ${order.team}` : ""}
          {order.incidentId ? ` · ${order.incidentId}` : ""}
          {order.reason ? (
            <>
              <br />
              {order.reason}
            </>
          ) : null}
        </Popup>
      </CircleMarker>
    </>
  );
}

export function DispatchMap({ messages }: { messages: Message[] }) {
  const dispatchMsgs = messages.filter((m) => isDispatchTopic(m.topic));
  const orders = ordersFromMessages(dispatchMsgs);

  return (
    <section className="panel full">
      <h2>
        Dispatch map <span className="count">{orders.length}</span>
      </h2>
      <div className="map-wrap">
        <MapContainer center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} scrollWheelZoom>
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {orders.map((o) => (
            <OrderLayer key={o.key} order={o} />
          ))}
        </MapContainer>
      </div>
      <div className="map-legend">
        <span>
          <span className="sw" style={{ background: "#f85149" }} />
          CRITICAL
        </span>
        <span>
          <span className="sw" style={{ background: "#d29922" }} />
          HIGH
        </span>
        <span>
          <span className="sw" style={{ background: "#58a6ff" }} />
          other · large dot = destination
        </span>
        {orders.length === 0 ? (
          <span className="empty">no geo-tagged dispatches yet</span>
        ) : null}
      </div>
    </section>
  );
}
