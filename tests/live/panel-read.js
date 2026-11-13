'use strict';

/*
 * La expresion que `npm run live` evalua en la pagina para leer el panel.
 *
 * Vive en su propio archivo para que el banco de pruebas evalue EXACTAMENTE la
 * misma cadena contra un DOM real: si el marco de la carrera cambia de forma o
 * el panel deja de estar donde estaba, la comprobacion falla aqui y no durante
 * una carrera de verdad.
 */

const PANEL_READ = `(() => {
  try {
    const frames = [...document.querySelectorAll('iframe')];
    const frame = frames.find((f) => /\\/race/.test(f.src || '')) || frames[0];
    const host = frame && frame.contentWindow.document.getElementById('nt-autotyper-panel');
    const shadow = host && host.shadowRoot;
    if (!shadow) return null;
    const text = (field) => {
      const el = shadow.querySelector('[data-field="' + field + '"]');
      return el ? (el.textContent || '').trim() : '';
    };
    return {
      version: text('ver'),
      races: text('races'),
      session: text('tanda'),
      dayXp: text('dayXp'),
      result: text('result'),
      delta: text('calDelta'),
      seasonName: text('seasonName'),
      seasonTier: text('seasonTier'),
      seasonXp: text('seasonXp'),
      seasonNext: text('seasonNext'),
      seasonRaces: text('seasonRaces'),
      seasonPace: text('seasonPace'),
      seasonEnds: text('seasonEnds'),
      seasonTag: text('seasonTag'),
    };
  } catch (error) {
    return null;
  }
})()`;

module.exports = { PANEL_READ };
