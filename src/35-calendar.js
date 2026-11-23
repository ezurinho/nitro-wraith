/* =============================================================================
 * 35. CALENDARIO
 *
 * Una cuenta que corre 24/7 durante semanas es una firma mas fuerte que un WPM
 * alto: los modelos de actividad humana tienen cola larga, picos periodicos y
 * dias de descanso, y un patron sin descanso ni ventana horaria es de los
 * primeros rasgos que separan bot de humano (docs/RESEARCH.md, seccion 4).
 *
 * Aqui viven dos cosas, ambas sin estado en disco:
 *
 *   - El dia de descanso. Se deriva de la fecha local con un hash, no de
 *     Math.random: el mismo dia da la misma respuesta en cualquier pestana y el
 *     test es fijo. Por defecto uno de cada siete.
 *   - La curva diurna. Un humano rinde menos de madrugada y algo menos por la
 *     noche; el rango (menos del 5%) sale de la literatura de tecleo real, no de
 *     una corazonada.
 *
 * Ninguna de las dos puede detener la cola: son un dato mas para el gate que ya
 * existe. La cola decide, el calendario solo dice si hoy y ahora toca.
 * ========================================================================== */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function calendarConf() {
  return (CONFIG && CONFIG.calendar) || {};
}

// Fecha local en formato YYYY-MM-DD. Local a proposito: el descanso depende del
// calendario del que teclea, no de UTC.
function localDayKey(at = Date.now()) {
  const date = new Date(at);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

// FNV-1a sobre la fecha, reducido a la semana. Barato, estable y sin dependencias:
// el mismo dia cae siempre en el mismo cubo.
function dayRoll(key) {
  const text = String(key || '');
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 7;
}

function restDaysPerWeek() {
  return clamp(Number(calendarConf().restDaysPerWeek) || 0, 0, 6);
}

// Con `restDaysPerWeek = 1` descansa uno de cada siete dias (y como el hash no
// mira el dia de la semana, caen repartidos: no siempre domingo, que tambien
// seria un patron).
function isRestDay(at = Date.now()) {
  const perWeek = restDaysPerWeek();
  if (perWeek <= 0) return false;
  return dayRoll(localDayKey(at)) < perWeek;
}

function nextMidnight(at = Date.now()) {
  const next = new Date(at);
  next.setHours(24, 0, 0, 0);
  return next.getTime();
}

// Puerta de descanso: mismo contrato que `activeGate` (key, label, left), para
// que la cola la trate como cualquier otra espera.
function restGate(at = Date.now()) {
  if (!isRestDay(at)) return null;
  return {
    key: 'rest',
    label: 'rest day',
    left: Math.max(0, nextMidnight(at) - at),
    nextText: '00:00',
    reason: 'rest day: the account does not race today',
  };
}

// Curva diurna, en coseno: 1 al mediodia temprano y 0.95 de madrugada. Los
// extremos se tocan a las 13:30 y a la 01:30, que es donde la literatura situa
// el mejor y el peor momento de tecleo.
function dayCurve(hour) {
  const hourOfDay = clamp(Number.isFinite(Number(hour)) ? Number(hour) : 12, 0, 24);
  const phase = (2 * Math.PI * (hourOfDay - 13.5)) / 24;
  const factor = 1 - ((1 - Math.cos(phase)) / 2) * 0.05;
  return Math.round(factor * 1000) / 1000;
}

function dayCurveAt(at = Date.now()) {
  const date = new Date(at);
  return dayCurve(date.getHours() + date.getMinutes() / 60);
}
