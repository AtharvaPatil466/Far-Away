/**
 * OutboxQueue behaviour: terrestrial-first with Iridium fallback, durable FIFO
 * queueing when offline, and automatic drain on reconnect (PRD Step 8 / 10).
 */
import { orderAckEnvelope, buildOrderAck } from '../src/contracts/builders';
import { IridiumTransport } from '../src/transport/iridium';
import { MockTransport } from '../src/transport/mock';
import { OutboxQueue } from '../src/transport/outbox';
import { MemoryStore } from '../src/transport/storage';

function envelope(orderId: string) {
  return orderAckEnvelope(
    buildOrderAck({ orderId, teamId: 'NDRF-01', status: 'accepted' }),
  );
}

describe('OutboxQueue', () => {
  it('delivers over terrestrial when reachable', async () => {
    const terrestrial = new MockTransport(true);
    const iridium = new IridiumTransport(0, true);
    const outbox = new OutboxQueue(new MemoryStore(), terrestrial, iridium);

    const outcome = await outbox.enqueue(envelope('A'));
    expect(outcome.sent).toBe(1);
    expect(outcome.lastChannel).toBe('terrestrial');
    expect(outbox.depth()).toBe(0);
    expect(terrestrial.delivered).toHaveLength(1);
  });

  it('falls back to Iridium when terrestrial is down', async () => {
    const terrestrial = new MockTransport(false); // terrestrial unreachable
    const iridium = new IridiumTransport(0, true);
    const outbox = new OutboxQueue(new MemoryStore(), terrestrial, iridium);

    const outcome = await outbox.enqueue(envelope('A'));
    expect(outcome.sent).toBe(1);
    expect(outcome.usedIridium).toBe(true);
    expect(outcome.lastChannel).toBe('iridium');
    expect(terrestrial.delivered).toHaveLength(0);
  });

  it('queues durably when both channels are down, then drains on reconnect (FIFO)', async () => {
    const store = new MemoryStore();
    const terrestrial = new MockTransport(false);
    const iridium = new IridiumTransport(0, false); // modem disabled
    const outbox = new OutboxQueue(store, terrestrial, iridium);

    await outbox.enqueue(envelope('A'));
    await outbox.enqueue(envelope('B'));
    expect(outbox.depth()).toBe(2);

    // Persisted durably: a fresh queue over the same store recovers both.
    const recovered = new OutboxQueue(store, terrestrial, iridium);
    await recovered.load();
    expect(recovered.depth()).toBe(2);

    // Terrestrial returns -> drains in FIFO order.
    terrestrial.setOnline(true);
    const outcome = await recovered.flush();
    expect(outcome.sent).toBe(2);
    expect(recovered.depth()).toBe(0);
    expect(terrestrial.delivered.map((m) => m.body.order_id)).toEqual(['A', 'B']);
  });
});
