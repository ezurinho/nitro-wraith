
  /* ==========================================================================
   * 6. PACE
   * ========================================================================== */
  const LEFT_HAND = new Set('qwertasdfgzxcvb');
  const COMMON_BIGRAMS = new Set([
    'th', 'he', 'in', 'er', 'an', 're', 'on', 'at', 'en', 'nd', 'ti', 'es',
    'or', 'te', 'of', 'ed', 'is', 'it', 'al', 'ar', 'st', 'to', 'nt', 'ng',
    'se', 'ha', 'as', 'ou', 'io', 'le', 've', 'co', 'me', 'de', 'hi', 'ri',
    'ro', 'ic', 'ne', 'ea', 'ra', 'ce', 'li', 'ch', 'll', 'be', 'ma', 'si',
  ]);

  // `forWpm` permite medir la cadencia de un objetivo sin tocar la sesion: el
  // harness pregunta "a 196 WPM, cuanto pides por tecla?" y el motor responde
  // sin cambiar lo que esta tecleando la carrera en curso.
  function baseDelay(forWpm = profile.targetWPM) {
    // T is the time per CORRECT character that targetWPM implies.
    const correctMs = 60000 / (forWpm * 5);

    // A mistake costs a whole keystroke (which does not advance) plus the
    // correction pause. With p mistakes per correct character, T = d(1 + p) + p*c,
    // hence d = (T - p*c) / (1 + p). Without this the measured WPM drops ~8% at
    // 97% accuracy, because the old discount was a flat 1%.
    const p = clamp(1 - profile.accuracyGoal / 100, 0, 0.3);
    const correction = average(CONFIG.humanize.correctionMs);
    // trim: auto-calibration factor (see autocalibrate). 1 = as configured.
    // Mismo suelo que en autocalibrate y por el mismo motivo: como el trim
    // multiplica el retardo, el valor que puede pasarse del techo es el BAJO
    // (escribir mas rapido), no el alto. Un trim viejo y pequeno se sube hasta
    // el suelo en vez de dejarlo planificar por encima del techo.
    const trim = Math.max(session.trim, Math.max(0.9, profile.targetWPM / paceCap()));
    const motor = ((correctMs - p * correction) / (1 + p)) * trim;
    // Tras un susto (una DQ o un hueco del guardia) las siguientes carreras se
    // escriben un poco mas despacio: es lo que hace una persona a la que acaban
    // de descalificar, y ademas deja un margen extra bajo el techo.
    const careful = session.carefulRaces > 0 ? CONFIG.humanize.carefulFactor : 1;

    // Sin descuento fijo de pausas. Estaba medido sobre el texto de referencia
    // y restaba los mismos milisegundos a cualquier ritmo, asi que el motor
    // corria por encima del objetivo: medido con `paceSample`, 110 WPM pedidos
    // daban 119.7 y 196 daban 228.6. Ese error crecia con el ritmo (los mismos
    // 8.8 ms son el 8% de una tecla a 110 y el 14% a 196) y el trim no puede
    // absorberlo cuando pasa del 10%. Las pausas reales las añade `nextDelay`
    // tecla a tecla, asi que el presupuesto por caracter es el del objetivo.
    return Math.max(12, motor * careful);
  }

  // Log-logistic by inverse transform: X = (U/(1-U))^(1/beta). Free typing
  // intervals are asymmetric with a right tail, and the log-logistic fits better
  // than the log-normal (Gonzalez et al. 2021, "On the shape of timings
  // distributions in free-text keystroke dynamics").
  function logLogistic(beta) {
    let u = Math.random();
    while (u === 0 || u === 1) u = Math.random();

    return Math.pow(u / (1 - u), 1 / beta);
  }

  // Media de la log-logistica: (pi/beta)/sin(pi/beta). Se usa para reescalar la
  // cadencia al objetivo de WPM: cambia la forma, no la media.
  function logLogisticMean(beta) {
    return (Math.PI / beta) / Math.sin(Math.PI / beta);
  }

  // Fatigue: intervals grow slowly with time on task (+2% per hour, +6% cap).
  // Source: de Jong et al. 2020 (PLOS One): over two hours of real work the
  // inter-keystroke interval rises ~11.6 ms (~4%). Here it is a gentle drift that
  // resets when a session starts.
  let fatigueAt = 0;

  function fatigueFactor() {
    if (!fatigueAt) return 1;

    const { fatiguePerHour, fatigueMax } = CONFIG.humanize;
    const hours = (Date.now() - fatigueAt) / 3600000;
    const factor = 1 + hours * fatiguePerHour;

    // Un valor raro en la config no puede acabar en tecleo a maquina: si el
    // resultado no es un numero sano, la fatiga no se aplica.
    if (!Number.isFinite(factor) || !Number.isFinite(fatigueMax)) return 1;

    return clamp(factor, 1, fatigueMax);
  }

  // The same hand is slower than alternating hands; common digraphs are faster.
  // The same-hand/alternating ratio lands at 1.12/0.97 = ~1.15, inside the
  // +17-19% reported by Pinet et al. 2022 (beta = 0.16-0.17 in log-IKI for
  // unimanual transitions).
  function digraphFactor(previous, expected) {
    const a = (previous || '').toLowerCase();
    const b = (expected || '').toLowerCase();
    if (!/[a-z]/.test(a) || !/[a-z]/.test(b)) return 1;

    const { sameHandFactor, alternateHandFactor, commonBigramFactor } = CONFIG.humanize;
    let factor = LEFT_HAND.has(a) === LEFT_HAND.has(b) ? sameHandFactor : alternateHandFactor;
    if (COMMON_BIGRAMS.has(a + b)) factor *= commonBigramFactor;
    return factor;
  }

  // Per-word model: a longer word is typed slower per letter and its first key
  // costs more; from there on intervals shorten. All three are in the literature
  // (Pinet et al. 2022 for length, position and hand; Baus et al. 2013 for
  // word-initiation latency).
  function wordShapeFactor(pos, length) {
    const { wordLengthPerLetter, wordLengthClamp, wordStartFactors } = CONFIG.humanize;
    const lengthFactor = clamp(1 + wordLengthPerLetter * (length - 5), wordLengthClamp[0], wordLengthClamp[1]);

    if (pos === 0) return lengthFactor * wordStartFactors[0];
    if (pos === 1) return lengthFactor * wordStartFactors[1];
    return lengthFactor * wordStartFactors[2];
  }

  // Posicion dentro de la palabra y longitud de la palabra para el caracter
  // que toca: dos recorridos cortos (hasta el espacio anterior y hasta el
  // siguiente), sin tablas ni cache que mantener.
  function wordContext(content, index) {
    if (!content) return { pos: 0, length: 1 };

    let start = index;
    while (start > 0 && content[start - 1] !== ' ') start--;

    let end = index;
    while (end < content.length && content[end] !== ' ') end++;

    return { pos: index - start, length: Math.max(1, end - start) };
  }

  // Pausas al empezar palabra. La de "pensar" supera los 500 ms, que es el
  // umbral con el que la literatura clasifica un intervalo como pausa.
  function wordPause(previous) {
    if (previous !== ' ') return 0;
    const { wordPauseChance, wordPauseMs, hesitationChance, hesitationMs } = CONFIG.humanize;

    if (Math.random() < hesitationChance) return randInt(hesitationMs[0], hesitationMs[1]);
    if (Math.random() < wordPauseChance) return randInt(wordPauseMs[0], wordPauseMs[1]);
    return 0;
  }

  // Pausa tras un signo de puntuacion: el hueco que sigue a una coma o a un
  // final de frase es mas largo que un limite de palabra normal (Fuchs &
  // Krivokapic 2016). Se aplica al espacio que va despues del signo, que es
  // donde el mecanografo respira.
  function punctuationPause(content, index) {
    if (!content || index < 2 || content[index - 1] !== ' ') return 0;

    const before = content[index - 2];
    const { sentencePauseMs, commaPauseMs } = CONFIG.humanize;

    if (before === '.' || before === '!' || before === '?') return randInt(sentencePauseMs[0], sentencePauseMs[1]);
    if (before === ',') return randInt(commaPauseMs[0], commaPauseMs[1]);
    return 0;
  }

  // Texto de referencia: una leccion tipica de Nitro Type con palabras cortas,
  // largas, comas y finales de frase. Sobre el se mide, una sola vez, la
  // ganancia media del modelo (digrafo x palabra) y la pausa media por
  // caracter. Sin esa normalizacion, estas reglas moverian el WPM medido: la
  // escala se calcula para que la cadencia media siga siendo la del objetivo.
  const REFERENCE_TEXT = 'the quick brown fox jumps over the lazy dog, and the race keeps going while the clock runs. a steady pace wins races, but nobody types the same way twice. ';

  function modelStats(text) {
    const lengths = String(text).split(' ').map((word) => Math.max(1, word.length));
    const h = CONFIG.humanize;
    let gain = 0;
    let pause = 0;
    let wordIndex = -1;
    let pos = 0;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const previous = i > 0 ? text[i - 1] : '';

      if (previous === ' ' || i === 0) {
        wordIndex++;
        pos = 0;
      }

      gain += digraphFactor(previous, char) * wordShapeFactor(pos, lengths[wordIndex] || 1);
      pos++;

      if (previous === ' ') {
        pause += h.wordPauseChance * average(h.wordPauseMs)
          + h.hesitationChance * average(h.hesitationMs);

        const before = i >= 2 ? text[i - 2] : '';
        if (before === '.' || before === '!' || before === '?') pause += average(h.sentencePauseMs);
        else if (before === ',') pause += average(h.commaPauseMs);
      }
    }

    return { gain: gain / text.length, pausePerChar: pause / text.length };
  }

  const MODEL_STATS = modelStats(REFERENCE_TEXT);

  function nextDelay(content, index, forWpm = profile.targetWPM) {
    const expected = content ? content[index] || '' : '';
    const previous = content && index > 0 ? content[index - 1] : '';
    const { pos, length } = wordContext(content, index);

    // La cadencia base ya lleva descontadas las pausas esperadas. Aqui va todo
    // lo demas: la forma de la log-logistica (dividida por su media, que es
    // 1), la fatiga y la estructura del caracter (digrafo x palabra),
    // normalizada por la ganancia media del texto de referencia para que estas
    // reglas no muevan el WPM medido.
    const { shape } = CONFIG.humanize;
    const scale = (baseDelay(forWpm) / logLogisticMean(shape)) * fatigueFactor() / MODEL_STATS.gain;
    const delay = scale * digraphFactor(previous, expected) * wordShapeFactor(pos, length) * logLogistic(shape);

    // Nunca un intervalo no-finito: setTimeout(NaN) dispara al instante y eso
    // es tecleo a maquina (justo el fallo que encendio el guardia en las
    // pruebas del banco).
    if (!Number.isFinite(delay)) return baseDelay(forWpm);

    // La deuda del nitro se paga aqui: 1-2 ms por tecla no se notan, pero
    // suman exactamente el tiempo que costaria haber tecleado lo que salto.
    return clamp(delay + wordPause(previous) + punctuationPause(content, index) + session.nitroSpread, 10, 4000);
  }

  /* ==========================================================================
   * 7. ACCURACY
   * ========================================================================== */
  const WRONG_POOL = 'abcdefghijklmnopqrstuvwxyz';

  // Physical neighbours on a QWERTY. Human errors are not random letters: the
  // typical mistake is the key next to it (a finger slip), not a 'q' when typing
  // an 'l'. With uniform luck, 1 in 4 errors landed on the far side of the
  // keyboard, which is exactly what a hand never does.
  const KEY_NEIGHBORS = {
    q: 'wa', w: 'qeas', e: 'wrsd', r: 'etdf', t: 'ryfg', y: 'tugh', u: 'yihj',
    i: 'uojk', o: 'ipkl', p: 'ol',
    a: 'qwsz', s: 'awedxz', d: 'serfcx', f: 'drtgvc', g: 'ftyhbv', h: 'gyujnb',
    j: 'huikmn', k: 'jiolm', l: 'kop',
    z: 'asx', x: 'zsdc', c: 'xdfv', v: 'cfgb', b: 'vghn', n: 'bhjm', m: 'njk',
  };

  function wrongChar(expected) {
    const lower = (expected || '').toLowerCase();
    const neighbors = KEY_NEIGHBORS[lower];

    // 85% desliz a una tecla contigua; el resto, un caracter del pool. El
    // espacio y la puntuacion no tienen vecinos en el mapa y caen al pool.
    if (neighbors && Math.random() < 0.85) {
      return neighbors[randInt(0, neighbors.length - 1)];
    }

    let candidate = lower;
    while (candidate === lower) {
      candidate = WRONG_POOL[randInt(0, WRONG_POOL.length - 1)];
    }
    return candidate;
  }

  // Fixed mistake budget per race. The older version compared the target with the
  // OBSERVED accuracy, which can only fall: a few early mistakes pushed accuracy
  // below target and the controller switched itself off for good. Measured in the
  // game: 96-97% against a 98.7% target, with the pace paying for mistakes it had
  // not budgeted (-5.7% real WPM). Now exactly the mistakes that fit the target
  // are allowed and spread over the remaining characters.
  function rollError(content) {
    if (session.chars < 5) return false;                       // sin fallos al arrancar
    if (session.chars - session.lastErrorAt < 4) return false; // sin fallos pegados

    const chars = content ? content.length : 0;
    if (!chars) return false;

    if (!session.errorBudget) {
      session.errorBudget = Math.max(1, Math.round((1 - profile.accuracyGoal / 100) * chars));
      session.errors = 0;
    }
    if (session.errors >= session.errorBudget) return false;

    const remaining = Math.max(1, chars - session.chars);
    const rate = (session.errorBudget - session.errors) / remaining;

    if (Math.random() < rate) {
      session.errors++;
      return true;
    }
    return false;
  }

  /* ==========================================================================
   * 8. NITRO
   * ========================================================================== */
  function useNitro(app) {
    // Camino normal: el mismo que usa el tecleo, con el salto de linea que el
    // juego interpreta como nitro (Enter salta la palabra actual, una por
    // carrera desde el cambio de 2019).
    try {
      app.handleKeyPress('character', new KeyboardEvent('keypress', {
        key: '\n', bubbles: true, cancelable: true,
      }));
      return true;
    } catch {
      return false;
    }
  }

  // Si el juego no acepta el evento sintetico de `handleKeyPress`, Enter sigue
  // siendo la tecla real del nitro: se despacha el keydown/keyup que escucha el
  // documento. Solo se llama cuando el indice NO se movio, para no gastar dos
  // veces el nitro ni disparar el Enter de «race again» en los resultados.
  function pressNitroKey() {
    try {
      for (const type of ['keydown', 'keyup']) {
        document.dispatchEvent(new KeyboardEvent(type, {
          key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
          bubbles: true, cancelable: true,
        }));
      }
      return true;
    } catch {
      return false;
    }
  }

  // Tope del reparto del nitro: mas de esto por tecla se nota en la cadencia.
  // El mismo numero sirve para decidir si el nitro se gasta (ver shouldUseNitro).
  const NITRO_MAX_SPREAD = 25;

  // Ultima palabra que Auto nitro usaria en la carrera actual. Vive solo en
  // memoria: el panel la ensena antes de gastar el unico nitro, y se limpia al
  // gastarlo o al empezar otra carrera.
  let nitroPreview = null;

  // El nitro se gasta en la palabra MAS LARGA que deje leccion suficiente para
  // pagar el tiempo que regala. Se elige entre las palabras que quedan por
  // delante: si la mejor ya quedo atras (un fallo o un remontaje), no se anuncia
  // una palabra que el bot ya no puede saltar. La primera palabra se descarta:
  // shouldUseNitro no dispara en index 0.
  function nitroFits(content, index) {
    if (!content || index <= 0 || index >= content.length) return false;
    const length = wordContext(content, index).length;
    if (length < 4) return false;

    const left = content.length - (index + length);
    const perCharMs = 60000 / ((CONFIG.wpm.hardCap - 1) * 5);
    const planMs = 60000 / (profile.targetWPM * 5);
    // El precio del nitro es el tiempo que regala, a precio de techo
    // (length * perCharMs), y se reparte entre las teclas que quedan. Si el
    // ritmo planificado ya deja ese hueco de sobra (slack por encima del techo),
    // el regalo no cuesta nada y se usa: con un objetivo muy por debajo del
    // techo, exigirle el reparto de 25 ms por tecla apagaba el nitro del todo.
    const slack = Math.max(0, planMs - perCharMs);
    if (length * perCharMs <= left * slack) return true;
    const roomPerChar = Math.max(0, NITRO_MAX_SPREAD - slack);
    return roomPerChar > 0 && length * perCharMs <= left * roomPerChar;
  }

  function nitroTarget(content, from = 0, strategy = CONFIG.nitroStrategy) {
    if (!content) return -1;
    const start = Math.max(0, Number(from) || 0);
    const mode = normalizeNitroStrategy(strategy);

    let best = -1;
    let bestLength = 0;
    const re = /\S+/g;
    let match;

    while ((match = re.exec(content))) {
      const index = match.index;
      if (index <= 0 || index < start) continue;
      const length = match[0].length;
      // Una palabra de una o dos letras no amortiza el unico nitro de la
      // carrera: se reserva para una palabra de verdad, que es lo dificil.
      if (!nitroFits(content, index)) continue;
      if (mode === 'first') return index;
      if (mode === 'last') {
        best = index;
        continue;
      }
      if (length > bestLength) {
        bestLength = length;
        best = index;
      }
    }
    return best;
  }

  function shouldUseNitro(content, index) {
    const target = nitroTarget(content, index);
    const canTry = !session.nitroDone && session.nitroTries < 3;

    // La vista previa se calcula aunque el interruptor este apagado: asi TUNE
    // puede decir que saltaria si se enciende. Se apaga cuando el nitro ya se
    // gasto o cuando se agotaron los intentos, para no anunciar un salto que no
    // va a ocurrir.
    if (canTry && target >= 0) {
      const length = wordContext(content, target).length;
      const word = content.slice(target, target + length);
      nitroPreview = word ? { index: target, word, chars: length } : null;
    } else {
      nitroPreview = null;
    }

    if (!CONFIG.useNitro || !canTry) return false;
    if (index <= 0) return false;
    return target >= 0 && index === target;
  }

  /* ==========================================================================
   * 9. LOGS
   * ========================================================================== */
  function logStart() {
    log(`WPM sample ${profile.wpmSession}/${profile.wpm.length}: ${profile.targetWPM} WPM`);
    log(`Accuracy sample ${profile.accSession}/${profile.accuracy.length}: ${profile.accuracyGoal.toFixed(1)}%`);
    log(`LEGIT pace · ${baseDelay().toFixed(1)} ms/char base · trim x${session.trim.toFixed(2)} · mode AUTO`);
  }

  function logProgress(force = false) {
    const now = Date.now();
    if (!force && now - session.lastLogAt < 5000) return;
    session.lastLogAt = now;

    const wpm = wpmNow();
    if (!wpm) return;
    log(`WPM ${wpmInt(wpm)}/${profile.targetWPM} · accuracy ${accuracyNow().toFixed(1)}%/${profile.accuracyGoal.toFixed(1)}% · ${session.chars} keys`);
  }

