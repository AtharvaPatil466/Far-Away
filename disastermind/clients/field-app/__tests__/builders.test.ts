/**
 * Contract builders must reproduce the EXACT wire shapes the Python backbone
 * consumes (disastermind/fieldapp/contracts.py). These assertions pin the
 * `to_reading()` output shapes and the OrderAck topic.
 */
import {
  buildOrderAck,
  buildSiteOverCapacityReport,
  buildTeamStatusUpdate,
  deploymentOrderFromPayload,
  orderAckEnvelope,
  siteOverCapacityToReading,
  teamStatusToReading,
} from '../src/contracts/builders';
import { FIELDAPP_ACK } from '../src/contracts/types';

describe('contract builders', () => {
  it('deploymentOrderFromPayload mirrors from_payload defaults', () => {
    const order = deploymentOrderFromPayload({ target_cell: 'Z-1' }, 'INC-1');
    expect(order.order_id).toBe('unknown');
    expect(order.team_id).toBe('unassigned');
    expect(order.site).toBe('Z-1');
    expect(order.priority).toBe(3);
    expect(order.channel).toBe('terrestrial');
    expect(order.incident_id).toBe('INC-1');
  });

  it('teamStatusToReading matches TeamStatusUpdate.to_reading()', () => {
    const u = buildTeamStatusUpdate({
      teamId: 'NDRF-01',
      assetType: 'ndrf_team',
      location: { lat: 19.1, lon: 72.9 },
      status: 'enroute',
      ts: '2026-06-08T00:00:00+00:00',
    });
    expect(teamStatusToReading(u)).toEqual({
      team_id: 'NDRF-01',
      asset_type: 'ndrf_team',
      location: { lat: 19.1, lon: 72.9 },
      status: 'enroute',
      assignment: null,
      ts: '2026-06-08T00:00:00+00:00',
    });
  });

  it('siteOverCapacityToReading carries site_over_capacity=true', () => {
    const r = buildSiteOverCapacityReport({
      teamId: 'NDRF-01',
      site: 'Zone-7',
      shortfall: 2,
      ts: '2026-06-08T00:00:00+00:00',
    });
    const reading = siteOverCapacityToReading(r, { lat: 19.1, lon: 72.9 }, 'ndrf_team');
    expect(reading).toEqual({
      team_id: 'NDRF-01',
      asset_type: 'ndrf_team',
      location: { lat: 19.1, lon: 72.9 },
      status: 'onsite',
      site: 'Zone-7',
      site_over_capacity: true,
      shortfall: 2,
      note: 'site over capacity',
      ts: '2026-06-08T00:00:00+00:00',
    });
  });

  it('orderAckEnvelope targets the fieldapp.order_ack topic', () => {
    const env = orderAckEnvelope(
      buildOrderAck({ orderId: 'O-1', teamId: 'NDRF-01', status: 'accepted' }),
    );
    expect(env.topic).toBe(FIELDAPP_ACK);
    expect(env.topic).toBe('fieldapp.order_ack');
    expect(env.body.status).toBe('accepted');
  });
});
