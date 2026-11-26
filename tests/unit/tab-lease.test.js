'use strict';

/*
 * Dos pestañas, un origen.
 *
 * El fallo que se prueba es el read-check-write del lease: si A y B leen la
 * clave vacia a la vez, las dos pueden escribir y creerse dueñas. El claim
 * atomico mete la lectura y la escritura dentro de un Web Lock y sella el
 * lease con un token; la pestaña que pierde ve un token distinto y se aparta.
 *
 * Se ejecuta el fragmento real de `src/96-guard.js` en dos contextos `vm` que
 * comparten localStorage y el gestor de Web Locks, como dos pestañas del mismo
 * perfil. No hace falta Chrome: la carrera se reproduce de forma determinista.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const { loadFragment } = require('./harness');

const TAB_LEASE = 'nta:tabLease';

function createStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(String(key)) ? values.get(String(key)) : null;
    },
    setItem(key, value) {
      values.set(String(key), String(value));
    },
    removeItem(key) {
      values.delete(String(key));
    },
  };
}

function createLocks() {
  const held = new Set();
  return {
    request(name, options, callback) {
      return new Promise((resolve) => {
        const run = () => {
          held.add(name);
          Promise.resolve()
            .then(() => callback({ name }))
            .then((value) => {
              held.delete(name);
              resolve(value);
            });
        };
        if (!held.has(name)) {
          run();
          return;
        }
        if (options && options.ifAvailable) {
          resolve(callback(null));
          return;
        }
        // The production claim uses ifAvailable, so this branch is only here
        // to keep the fake honest for future callers.
        const wait = setInterval(() => {
          if (held.has(name)) return;
          clearInterval(wait);
          run();
        }, 0);
      });
    },
  };
}

function createTab(id, shared) {
  const win = { name: `nta-tab:${id}` };
  win.top = win;
  const api = loadFragment(
    '96-guard.js',
    [
      'claimTabLeaseAtomic',
      'claimTabLease',
      'releaseTabLease',
      'tabLeaseInfo',
      'tabLeaseOwned',
      'tabIdentity',
    ],
    {
      CONFIG: {
        guard: {
          tabLeaseStaleMs: 15000,
          instanceStaleMs: 8000,
          standbyHoldMs: 3000,
          samples: 5,
          absurdFactor: 3,
        },
      },
      session: { stopped: false },
      window: win,
      navigator: { locks: shared.locks },
      localStorage: shared.storage,
      crypto: webcrypto,
      log: () => {},
      beep: () => {},
      preciseSleep: () => Promise.resolve(),
      raceIsLive: () => false,
      setInterval: () => 0,
      clearInterval: () => {},
      setTimeout: () => 0,
    }
  );
  return { win, api };
}

test('two tabs cannot both claim the lease, and the loser cannot release the winner', async () => {
  const storage = createStorage();
  const locks = createLocks();
  const a = createTab('a', { storage, locks });
  const b = createTab('b', { storage, locks });

  // Both start with the same empty key. Only the tab inside the tab-lease lock
  // may write; the other gets null from ifAvailable and fails closed.
  const [aOwns, bOwns] = await Promise.all([
    a.api.claimTabLeaseAtomic('race', false),
    b.api.claimTabLeaseAtomic('race', false),
  ]);
  assert.equal(aOwns, true);
  assert.equal(bOwns, false);

  const first = JSON.parse(storage.getItem(TAB_LEASE));
  assert.equal(first.tab, a.api.tabIdentity());
  assert.match(first.token, /\S/);
  assert.equal(a.api.tabLeaseOwned(), true);
  assert.equal(b.api.tabLeaseOwned(), false);

  // A fresh lease still belongs to A: B cannot claim or delete it.
  assert.equal(await b.api.claimTabLeaseAtomic('race', false), false);
  assert.equal(b.api.releaseTabLease(), false);
  assert.equal(JSON.parse(storage.getItem(TAB_LEASE)).tab, a.api.tabIdentity());

  // Once A releases, the same B can claim with a new token.
  assert.equal(a.api.releaseTabLease(), true);
  assert.equal(storage.getItem(TAB_LEASE), null);
  assert.equal(await b.api.claimTabLeaseAtomic('race', false), true);
  assert.equal(b.api.tabLeaseOwned(), true);
  const second = JSON.parse(storage.getItem(TAB_LEASE));
  assert.equal(second.tab, b.api.tabIdentity());
  assert.notEqual(second.token, first.token);
});

test('a forced claim invalidates the previous token', async () => {
  const storage = createStorage();
  const locks = createLocks();
  const a = createTab('a', { storage, locks });
  const b = createTab('b', { storage, locks });

  assert.equal(await a.api.claimTabLeaseAtomic('typing', false), true);
  const oldToken = JSON.parse(storage.getItem(TAB_LEASE)).token;
  assert.equal(await b.api.claimTabLeaseAtomic('typing rescue', true), true);
  const newToken = JSON.parse(storage.getItem(TAB_LEASE)).token;
  assert.notEqual(newToken, oldToken);
  assert.equal(a.api.tabLeaseOwned(), false, 'the old owner token is stale');
  assert.equal(b.api.tabLeaseOwned(), true);
});
