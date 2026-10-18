import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSessionConnection } from '../apps/web/src/lib/sessionConnection.ts';

function fixture(getSession = async () => ({ data: { session: null }, error: null })) {
  const listeners = new Set();
  let subscriptions = 0;
  let removals = 0;
  const client = { auth: {
    getSession,
    onAuthStateChange(callback) {
      subscriptions++;
      listeners.add(callback);
      return { data: { subscription: { unsubscribe() { removals++; listeners.delete(callback); } } } };
    },
  } };
  return { client, emit(session) { for (const listener of listeners) listener('SIGNED_IN', session); },
    get subscriptions() { return subscriptions; }, get removals() { return removals; } };
}

test('failed import retries on the next auth action and installs a working subscription', async () => {
  const f = fixture();
  const seen = [];
  let attempts = 0;
  const connection = createSessionConnection(async () => {
    if (++attempts === 1) throw new Error('chunk unavailable');
    return f.client;
  }, (session) => seen.push(session));
  await assert.rejects(connection.connect(), /chunk unavailable/);
  await connection.connect();
  const signedIn = { user: { id: 'user-1' } };
  f.emit(signedIn);
  assert.deepEqual(seen, [null, signedIn]);
  assert.equal(attempts, 2);
  assert.equal(f.subscriptions, 1);
  connection.dispose();
  assert.equal(f.removals, 1);
});

test('concurrent actions and repeated successful connects share one listener', async () => {
  const f = fixture();
  const connection = createSessionConnection(async () => f.client, () => {});
  await Promise.all([connection.connect(), connection.connect(), connection.connect()]);
  await connection.connect();
  assert.equal(f.subscriptions, 1);
  connection.dispose();
  assert.equal(f.removals, 1);
});

test('failed session read removes its listener before a successful retry', async () => {
  let reads = 0;
  const f = fixture(async () => ++reads === 1
    ? { data: { session: null }, error: new Error('storage unavailable') }
    : { data: { session: null }, error: null });
  const connection = createSessionConnection(async () => f.client, () => {});
  await assert.rejects(connection.connect(), /storage unavailable/);
  assert.equal(f.removals, 1);
  await connection.connect();
  assert.equal(f.subscriptions, 2);
  connection.dispose();
  assert.equal(f.removals, 2);
});

test('late getSession cannot overwrite a newer sign-in event', async () => {
  let resolve;
  const f = fixture(() => new Promise((done) => { resolve = done; }));
  const seen = [];
  const connection = createSessionConnection(async () => f.client, (session) => seen.push(session));
  const ready = connection.connect();
  await Promise.resolve();
  const signedIn = { user: { id: 'new-user' } };
  f.emit(signedIn);
  resolve({ data: { session: null }, error: null });
  await ready;
  assert.deepEqual(seen, [signedIn]);
  connection.dispose();
});

test('unmount during import does not subscribe and a new mount can initialize', async () => {
  let resolve;
  const f = fixture();
  const seen = [];
  const first = createSessionConnection(() => new Promise((done) => { resolve = done; }), (value) => seen.push(value));
  const pending = first.connect();
  first.dispose();
  resolve(f.client);
  await assert.rejects(pending, /no disponible/);
  assert.equal(f.subscriptions, 0);
  assert.deepEqual(seen, []);
  const second = createSessionConnection(async () => f.client, (value) => seen.push(value));
  await second.connect();
  assert.equal(f.subscriptions, 1);
  second.dispose();
  f.emit({ user: { id: 'ignored' } });
  assert.deepEqual(seen, [null]);
});

test('unmount during session read removes the listener and suppresses the late snapshot', async () => {
  let resolve;
  const f = fixture(() => new Promise((done) => { resolve = done; }));
  const seen = [];
  const connection = createSessionConnection(async () => f.client, (value) => seen.push(value));
  const pending = connection.connect();
  await Promise.resolve();
  connection.dispose();
  resolve({ data: { session: { user: { id: 'stale' } } }, error: null });
  await pending;
  f.emit(null);
  assert.equal(f.removals, 1);
  assert.deepEqual(seen, []);
});
