'use strict';

/*
 * Pruebas del motor de cola fuera del navegador.
 *
 * Cubren la politica que decide cuando se puede correr y que ensena el garaje:
 * ventana de horas, topes diarios y de sesion, calendario de descanso y la
 * maquina de estado del panel pequeno. Se ejecuta el texto real de los
 * fragmentos en un contexto `vm`, asi que un cambio en `src/` que rompa una
 * decision rompe estas pruebas sin abrir Chrome.
 *
 *   npm run test:unit
 */

const assert = require('node:assert/strict');
const { loadFragment, test, summary } = require('./harness');

const policy = loadFragment('36-queue-policy.js', [
  'activeWindowAt', 'padHour', 'dailyCapsFor', 'sessionLimitReached',
  'timeLimitLeftFor', 'deriveGarageContext', 'garagePrimaryFor',
]);

const helpers = loadFragment('85-queue-helpers.js', [
  'shortWait', 'sessionClockText', 'boxRewardText',
]);

const calendarSandbox = {
  CONFIG: { calendar: { restDaysPerWeek: 1 } },
  clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
};
const calendar = loadFragment('35-calendar.js', [
  'isRestDay', 'restGate', 'nextMidnight', 'dayCurve', 'dayCurveAt',
  'localDayKey', 'dayRoll', 'restDaysPerWeek',
], calendarSandbox);

const HOUR = 3600000;
const MINUTE = 60000;

/* ------------------------------------------------------------------------- */
/* Ventana de horas activas                                                   */
/* ------------------------------------------------------------------------- */

function at(hour, minute = 0, day = 15) {
  return new Date(2026, 0, day, hour, minute, 0, 0).getTime();
}

test('an off window never blocks and says all day', () => {
  const win = policy.activeWindowAt({ on: false, start: 8, end: 17 }, at(3));
  assert.equal(win.on, false);
  assert.equal(win.open, true);
  assert.equal(win.allDay, true);
  assert.equal(win.msUntilOpen, 0);
  assert.equal(win.msUntilClose, 0);
});

test('start equal to end means the whole day', () => {
  const win = policy.activeWindowAt({ on: true, start: 8, end: 8 }, at(3));
  assert.equal(win.allDay, true);
  assert.equal(win.open, true);
  assert.equal(win.startText, '08:00');
  assert.equal(win.endText, '08:00');
});

test('inside a normal window reports the close countdown', () => {
  const win = policy.activeWindowAt({ on: true, start: 8, end: 17 }, at(10));
  assert.equal(win.open, true);
  assert.equal(win.msUntilClose, 7 * HOUR);
  assert.equal(win.msUntilOpen, 0);
});

test('before a normal window reports the open countdown', () => {
  const win = policy.activeWindowAt({ on: true, start: 8, end: 17 }, at(7, 30));
  assert.equal(win.open, false);
  assert.equal(win.msUntilOpen, 30 * MINUTE);
  assert.equal(win.msUntilClose, 0);
});

test('the end hour closes the window and waits for tomorrow', () => {
  const win = policy.activeWindowAt({ on: true, start: 8, end: 17 }, at(17));
  assert.equal(win.open, false);
  assert.equal(win.msUntilOpen, 15 * HOUR);
});

test('a window crossing midnight opens late and closes early', () => {
  const late = policy.activeWindowAt({ on: true, start: 22, end: 2 }, at(23));
  assert.equal(late.open, true);
  assert.equal(late.allDay, false);
  assert.equal(late.msUntilClose, 3 * HOUR);

  const early = policy.activeWindowAt({ on: true, start: 22, end: 2 }, at(1));
  assert.equal(early.open, true);
  assert.equal(early.msUntilClose, 1 * HOUR);

  const noon = policy.activeWindowAt({ on: true, start: 22, end: 2 }, at(12));
  assert.equal(noon.open, false);
  assert.equal(noon.msUntilOpen, 10 * HOUR);
});

test('hours outside 0..23 are clamped and padded', () => {
  const win = policy.activeWindowAt({ on: true, start: 25, end: -3 }, at(12));
  assert.equal(win.start, 23);
  assert.equal(win.end, 0);
  assert.equal(win.startText, '23:00');
  assert.equal(win.endText, '00:00');
  assert.equal(win.open, false);
  assert.equal(win.msUntilOpen, 11 * HOUR);
});

test('missing settings fall back to an open window', () => {
  const win = policy.activeWindowAt(undefined, at(12));
  assert.equal(win.on, false);
  assert.equal(win.open, true);
  assert.equal(policy.padHour(7), '07:00');
  assert.equal(policy.padHour(0), '00:00');
});

/* ------------------------------------------------------------------------- */
/* Topes diarios y de sesion                                                  */
/* ------------------------------------------------------------------------- */

test('daily caps stay free when both limits are zero', () => {
  const daily = policy.dailyCapsFor({ races: 12, xp: 9000 }, { raceCap: 0, xpCap: 0 });
  assert.equal(daily.raceHit, false);
  assert.equal(daily.xpHit, false);
  assert.equal(daily.warn, false);
  assert.equal(daily.races, 12);
  assert.equal(daily.xp, 9000);
});

test('daily caps hit exactly at the limit and warn at eighty percent', () => {
  const under = policy.dailyCapsFor({ races: 79, xp: 39999 }, { raceCap: 100, xpCap: 50000 });
  assert.equal(under.raceHit, false);
  assert.equal(under.xpHit, false);
  assert.equal(under.warn, false);

  const warning = policy.dailyCapsFor({ races: 80, xp: 0 }, { raceCap: 100, xpCap: 0 });
  assert.equal(warning.warn, true);
  assert.equal(warning.raceHit, false);

  const hit = policy.dailyCapsFor({ races: 100, xp: 50000 }, { raceCap: 100, xpCap: 50000 });
  assert.equal(hit.raceHit, true);
  assert.equal(hit.xpHit, true);
});

test('daily caps coerce garbage and negative counts to zero', () => {
  const daily = policy.dailyCapsFor({ races: -5, xp: 'abc' }, { raceCap: '200', xpCap: undefined });
  assert.equal(daily.races, 0);
  assert.equal(daily.xp, 0);
  assert.equal(daily.raceCap, 200);
  assert.equal(daily.xpCap, 0);
  assert.equal(daily.raceHit, false);
});

test('the session race limit stops at the exact race', () => {
  assert.equal(policy.sessionLimitReached({ races: 9, raceLimit: 10 }, {}), false);
  assert.equal(policy.sessionLimitReached({ races: 10, raceLimit: 10 }, {}), true);
  assert.equal(policy.sessionLimitReached({ races: 50, raceLimit: 0 }, {}), false);
});

test('the time limit only counts from the first race of the tanda', () => {
  const start = at(10);
  assert.equal(policy.sessionLimitReached(
    { timeLimit: 30, tandaStartedAt: start }, {}, start + 29 * MINUTE), false);
  assert.equal(policy.sessionLimitReached(
    { timeLimit: 30, tandaStartedAt: start }, {}, start + 30 * MINUTE), true);
  assert.equal(policy.sessionLimitReached(
    { timeLimit: 30, tandaStartedAt: 0 }, {}, start + 300 * MINUTE), false);
});

test('session xp limit and daily caps both stop the queue', () => {
  assert.equal(policy.sessionLimitReached({ xp: 999, xpLimit: 1000 }, {}), false);
  assert.equal(policy.sessionLimitReached({ xp: 1000, xpLimit: 1000 }, {}), true);
  assert.equal(policy.sessionLimitReached({}, { raceHit: true }), true);
  assert.equal(policy.sessionLimitReached({}, { xpHit: true }), true);
  assert.equal(policy.sessionLimitReached({}, undefined), false);
});

test('time left mirrors the limit math', () => {
  assert.equal(policy.timeLimitLeftFor({ timeLimit: 0, tandaStartedAt: 0 }, at(10)), null);
  assert.equal(policy.timeLimitLeftFor({ timeLimit: 30, tandaStartedAt: 0 }, at(10)), 30 * MINUTE);
  assert.equal(policy.timeLimitLeftFor(
    { timeLimit: 30, tandaStartedAt: at(10) }, at(10) + 10 * MINUTE), 20 * MINUTE);
  assert.equal(policy.timeLimitLeftFor(
    { timeLimit: 30, tandaStartedAt: at(10) }, at(10) + 99 * MINUTE), 0);
});

/* ------------------------------------------------------------------------- */
/* Maquina de estado del garaje                                               */
/* ------------------------------------------------------------------------- */

test('the garage context follows one priority order', () => {
  assert.equal(policy.deriveGarageContext({ social: true, banned: true }).key, 'read');
  assert.equal(policy.deriveGarageContext({ banned: true }).key, 'banned');
  assert.equal(policy.deriveGarageContext({}).key, 'signin');
  assert.equal(policy.deriveGarageContext({ signed: true, offline: true }).key, 'offline');
  assert.equal(policy.deriveGarageContext({ signed: true, activeStop: true, reason: 'limit hit' }).key, 'stopped');
  assert.equal(policy.deriveGarageContext({ signed: true, activeStop: true }).detail, 'Resume when you are ready.');
  assert.equal(policy.deriveGarageContext({ signed: true, banCleared: true }).key, 'cleared');
  assert.equal(policy.deriveGarageContext({ signed: true, hasRetry: true, retryText: '2m' }).detail, 'Retry in 2m.');
  assert.equal(policy.deriveGarageContext({ signed: true, gates: [{ label: 'rest day', leftText: '6h' }] }).detail, 'Clears in 6h.');
  assert.equal(policy.deriveGarageContext({ signed: true, boxReady: true }).key, 'reward');
  assert.equal(policy.deriveGarageContext({ signed: true }).key, 'stopped');
  assert.equal(policy.deriveGarageContext({ signed: true, armed: true }).key, 'ready');
});

test('only an action that can run is highlighted', () => {
  const reward = policy.deriveGarageContext({ signed: true, boxReady: true });
  const stopped = policy.deriveGarageContext({ signed: true });
  const retry = policy.deriveGarageContext({ signed: true, hasRetry: true });
  const ready = policy.deriveGarageContext({ signed: true, armed: true });

  assert.equal(policy.garagePrimaryFor(reward, { box: true }), 'box');
  assert.equal(policy.garagePrimaryFor(reward, {}), '');
  assert.equal(policy.garagePrimaryFor(stopped, { resume: true }), 'resume');
  assert.equal(policy.garagePrimaryFor(retry, { retry: true }), 'retry');
  assert.equal(policy.garagePrimaryFor(ready, { race: true }), 'race');
  assert.equal(policy.garagePrimaryFor(ready, {}), '');
});

/* ------------------------------------------------------------------------- */
/* Calendario                                                                 */
/* ------------------------------------------------------------------------- */

test('the rest day is stable for the whole date', () => {
  const early = calendar.isRestDay(at(0, 1));
  const late = calendar.isRestDay(at(23, 59));
  assert.equal(early, late);
  assert.equal(calendar.localDayKey(at(10)), '2026-01-15');
  assert.equal(calendar.dayRoll('2026-01-15'), calendar.dayRoll('2026-01-15'));
});

test('rest day count can be turned off', () => {
  calendarSandbox.CONFIG.calendar.restDaysPerWeek = 0;
  assert.equal(calendar.restDaysPerWeek(), 0);
  for (let day = 1; day <= 10; day += 1) {
    assert.equal(calendar.isRestDay(at(12, 0, day)), false);
    assert.equal(calendar.restGate(at(12, 0, day)), null);
  }
  calendarSandbox.CONFIG.calendar.restDaysPerWeek = 1;
  assert.equal(calendar.restDaysPerWeek(), 1);
});

test('a rest gate waits for the next midnight', () => {
  const probe = at(12);
  const gate = calendar.restGate(probe);
  if (calendar.isRestDay(probe)) {
    assert.equal(gate.key, 'rest');
    assert.equal(gate.nextText, '00:00');
    assert.equal(gate.left, calendar.nextMidnight(probe) - probe);
  } else {
    assert.equal(gate, null);
  }
});

test('next midnight is the start of the following local day', () => {
  const next = new Date(calendar.nextMidnight(at(10)));
  assert.equal(next.getDate(), 16);
  assert.equal(next.getHours(), 0);
  assert.equal(next.getMinutes(), 0);
});

test('the daytime curve peaks at 13:30 and bottoms at 01:30', () => {
  assert.equal(calendar.dayCurve(13.5), 1);
  assert.equal(calendar.dayCurve(1.5), 0.95);
  const noon = calendar.dayCurve(12);
  assert.ok(noon > 0.95 && noon <= 1, `noon ${noon}`);
  assert.equal(calendar.dayCurve('nope'), calendar.dayCurve(12));
  const fromClock = calendar.dayCurveAt(at(13, 30));
  assert.ok(Math.abs(fromClock - 1) < 0.001, `clock ${fromClock}`);
});

/* ------------------------------------------------------------------------- */
/* Helpers de la cola                                                        */
/* ------------------------------------------------------------------------- */

test('wait text rounds to the unit that reads best', () => {
  assert.equal(helpers.shortWait(10000), 'less than a minute');
  assert.equal(helpers.shortWait(5 * MINUTE), '5 min');
  assert.equal(helpers.shortWait(90 * MINUTE), '2 h');
});

test('the session clock never shows negative or ragged time', () => {
  assert.equal(helpers.sessionClockText(-5000), '0s');
  assert.equal(helpers.sessionClockText(45000), '45s');
  assert.equal(helpers.sessionClockText(5 * MINUTE + 3000), '5m 03s');
  assert.equal(helpers.sessionClockText(2 * HOUR + 5 * MINUTE), '2h 05m');
});

test('reward text formats the three reward shapes', () => {
  assert.equal(helpers.boxRewardText(null), 'reward received');
  assert.equal(helpers.boxRewardText({ type: 'money', value: 1500 }), '$1,500');
  assert.equal(helpers.boxRewardText({ type: 'nitros', value: 12 }), '12 nitros');
  assert.equal(helpers.boxRewardText({ type: 'car', value: 7 }), 'car #7');
  assert.equal(helpers.boxRewardText({}), 'reward received');
});

summary('queue policy');
