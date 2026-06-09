# DisasterMind — Field App (React Native / Expo)

The device-side app NDRF/SDRF teams carry in the field. It implements the device
contract in [`disastermind/fieldapp/contracts.py`](../../disastermind/fieldapp/contracts.py)
**as-is** — every emission reproduces the exact wire JSON the coordination
backbone consumes.

## Screens ↔ PRD step ↔ contract

| Tab | PRD step | Contract / behaviour |
|-----|----------|----------------------|
| **Orders** | Step 8 | Renders `DeploymentOrderMsg` orders. **Accept** → `OrderAck{status:"accepted"}`; **Decline** → `OrderAck{status:"rejected"}`, published on topic `fieldapp.order_ack`. |
| **Beacon** | Step 6 | 60-second GPS beacon emitting `TeamStatusUpdate.to_reading()` inside a `{kind:"gps_beacon", readings:[…]}` frame; walks the `idle → enroute → onsite → returning` lifecycle. |
| **Report** | Step 6 | `SiteOverCapacityReport.to_reading()` carrying `site_over_capacity=true` so the Tier-2 coordinator autonomously requests reinforcement. |
| **Outbox** | Step 8 / 10 | Durable offline queue with terrestrial → **Iridium satellite** fallback and an online/offline indicator. Toggle the links to demonstrate fallback and offline queueing. |

Every outbound message flows through the durable [`OutboxQueue`](src/transport/outbox.ts):
it tries the terrestrial channel first, falls back to the simulated
[`IridiumTransport`](src/transport/iridium.ts), and—if both are down—persists the
message FIFO to `AsyncStorage` and drains it automatically when a link returns
(PRD Step 10 "field app works offline, satellite messaging fallback active").

## Run

```bash
cd clients/field-app
npm install
npm run web        # or: npm run ios / npm run android (Expo Go or a simulator)
npm run typecheck  # tsc --noEmit
npm test           # jest: outbox + contract-builder unit tests
```

The app runs **fully standalone** with no backend (a `MockTransport` stands in for
terrestrial). To point the terrestrial channel at a real ingest endpoint, set:

```bash
EXPO_PUBLIC_BACKEND_URL=http://<host>:8000 npm run web
# optional identity overrides:
EXPO_PUBLIC_TEAM_ID=SDRF-04 EXPO_PUBLIC_ASSET_TYPE=boat npm run web
```

The terrestrial transport probes `GET {BACKEND_URL}/health` for reachability and
`POST {BACKEND_URL}/ingest/{topic}` with the exact contract JSON body. The Python
backend ships no device-ingest REST route today, so without a URL the app uses the
mock transport and the offline/Iridium path is exercised via the Outbox toggles.

## Layout

```
clients/field-app/
  App.tsx                  root: tabs + global connectivity banner
  index.ts                 Expo entry (registerRootComponent)
  app.config.ts            Expo config (EXPO_PUBLIC_BACKEND_URL etc.)
  src/
    contracts/             TS mirror of the Python device contracts + builders
    transport/             terrestrial · iridium · mock · durable OutboxQueue
    state/device.tsx       device store: identity, GPS, status, transports, outbox
    screens/               Orders · Beacon · Report(over-capacity) · Outbox
    ui/theme.ts            shared dark palette
  __tests__/               outbox + builders unit tests
```

> Node artifacts (`node_modules/`, `.expo/`, `dist/`) are git-ignored locally.
