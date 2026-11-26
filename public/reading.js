// Tiny, dependency-free wrapper around the Web Speech API.
// Nothing happens until a caller explicitly invokes speak() (always from a user
// gesture in the reader), so browsers' autoplay restrictions are respected.
// If Web Speech is missing, every method is a harmless no-op.

const LANGUAGE_FALLBACKS = {
  fil: ['fil-PH', 'fil', 'tl-PH', 'tl', 'en-US', 'en'],
  en: ['en-US', 'en-GB', 'en', 'fil-PH', 'fil']
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));

function synth() {
  if (typeof window === 'undefined') return null;
  return window.speechSynthesis || window.webkitSpeechSynthesis || null;
}

function Utterance() {
  if (typeof window === 'undefined') return null;
  const Ctor = window.SpeechSynthesisUtterance || window.webkitSpeechSynthesisUtterance;
  if (!Ctor) return null;
  try { return new Ctor(); } catch { return null; }
}

function codeFor(lang) {
  const value = String(lang || '').toLowerCase();
  if (/^(fil|tl|tagalog|pilipino)/.test(value)) return 'fil';
  return 'en';
}

function fallbackCodes(lang) {
  const explicit = String(lang || '');
  const codes = [...(LANGUAGE_FALLBACKS[codeFor(lang)] || LANGUAGE_FALLBACKS.en)];
  if (explicit && !codes.some((c) => c.toLowerCase() === explicit.toLowerCase())) codes.unshift(explicit);
  return codes;
}

function allVoices() {
  const s = synth();
  if (!s || typeof s.getVoices !== 'function') return [];
  try { return s.getVoices() || []; } catch { return []; }
}

function matchVoices(voices, codes) {
  const found = [];
  const seen = new Set();
  codes.forEach((code) => {
    const wanted = String(code).toLowerCase();
    const base = wanted.split('-')[0];
    const exact = voices.filter((v) => String(v.lang || '').toLowerCase() === wanted);
    const related = voices.filter((v) => {
      const lang = String(v.lang || '').toLowerCase();
      return lang !== wanted && lang.split('-')[0] === base;
    });
    [...exact, ...related].forEach((v) => {
      if (!seen.has(v)) { seen.add(v); found.push(v); }
    });
  });
  return found;
}

let current = null;
let paused = false;
let generation = 0;

export const readingSpeech = {
  supported() {
    return Boolean(synth()) && Boolean(typeof window !== 'undefined' &&
      (window.SpeechSynthesisUtterance || window.webkitSpeechSynthesisUtterance));
  },

  // Voices for a language, including friendly fallbacks (e.g. fil-PH -> fil -> tl -> en).
  voices(lang = 'en-US') {
    return matchVoices(allVoices(), fallbackCodes(lang));
  },

  speak({
    text = '',
    lang = 'en-US',
    rate = 1,
    pitch = 1,
    volume = 1,
    voiceURI = '',
    onBoundary,
    onEnd,
    onError
  } = {}) {
    const s = synth();
    const utterance = Utterance();
    const body = String(text ?? '').trim();
    if (!s || !utterance || !body) return false;

    readingSpeech.stop();
    const token = generation;

    utterance.text = body;
    utterance.lang = String(lang || 'en-US');
    utterance.rate = clamp(rate, 0.1, 10);
    utterance.pitch = clamp(pitch, 0, 2);
    utterance.volume = clamp(volume, 0, 1);

    const voice = voiceURI
      ? allVoices().find((v) => v.voiceURI === voiceURI || String(v.name) === voiceURI)
      : matchVoices(allVoices(), fallbackCodes(lang))[0];
    if (voice) {
      try { utterance.voice = voice; } catch { /* keep the requested lang instead */ }
    }

    utterance.onboundary = (event) => {
      if (current !== utterance || token !== generation) return;
      if (typeof onBoundary !== 'function') return;
      const charIndex = Math.max(0, Number(event?.charIndex) || 0);
      const charLength = Math.max(1, Number(event?.charLength) || 1);
      try {
        onBoundary({
          charIndex,
          charLength,
          name: event?.name || 'word',
          word: body.slice(charIndex, charIndex + charLength),
          text: body
        });
      } catch { /* listener errors must not break narration */ }
    };
    utterance.onend = () => {
      if (current !== utterance || token !== generation) return;
      current = null;
      paused = false;
      if (typeof onEnd === 'function') onEnd();
    };
    utterance.onerror = (event) => {
      if (current !== utterance || token !== generation) return;
      current = null;
      paused = false;
      if (typeof onError === 'function') onError(event);
      else if (typeof onEnd === 'function') onEnd();
    };

    current = utterance;
    paused = false;
    try {
      s.speak(utterance);
      return true;
    } catch {
      current = null;
      return false;
    }
  },

  pause() {
    const s = synth();
    if (!s || !current || paused) return false;
    try { s.pause(); paused = true; return true; } catch { return false; }
  },

  resume() {
    const s = synth();
    if (!s || !current || !paused) return false;
    try { s.resume(); paused = false; return true; } catch { return false; }
  },

  stop() {
    generation += 1;
    const hadUtterance = Boolean(current);
    current = null;
    paused = false;
    const s = synth();
    if (s) { try { s.cancel(); } catch { /* ignore */ } }
    return hadUtterance;
  },

  isPaused() { return paused; },
  isSpeaking() { return Boolean(current) && !paused; }
};

export default readingSpeech;
