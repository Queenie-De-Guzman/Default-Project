import { esc } from '../ui.js';

const DEFAULTS = {
  narrationRate: 0.9, narrationVolume: 0.9, narrationLang: 'en-US', voiceURI: '',
  highlightStyle: 'word', highlightColor: '#fde68a', gameTheme: 'playful',
  animations: true, soundEffects: true, backgroundMusic: false,
  effectsVolume: 0.6, musicVolume: 0.3, masterMuted: false,
  fontSize: 'medium', highContrast: false, captions: true,
  defaultDifficulty: 'medium', defaultPoints: 10, defaultTimeLimit: 0,
  feedbackStyle: 'encouraging', character: 'owl', customSounds: {}
};

const THEMES = ['playful', 'nature', 'space', 'detective', 'classic'];
const FEEDBACK_STYLES = ['encouraging', 'neutral', 'detailed'];
const CHARACTERS = [
  ['owl', 'Professor Owl'], ['pixel', 'Coach Pixel'], ['captain', 'Captain Star'],
  ['maya', 'Ate Maya'], ['jun', 'Kuya Jun']
];
const LANGS = [['en-US', 'English (US)'], ['en-PH', 'English (Philippines)'], ['fil-PH', 'Filipino']];
const FONT_SIZES = [['small', 'Small'], ['medium', 'Medium'], ['large', 'Large'], ['extra-large', 'Extra large']];

function voices() {
  try { return typeof speechSynthesis !== 'undefined' ? speechSynthesis.getVoices() : []; }
  catch { return []; }
}

function applyDisplay(prefs) {
  const root = document.documentElement;
  root.dataset.fontSize = String(prefs.fontSize || DEFAULTS.fontSize);
  root.dataset.animations = prefs.animations === false ? 'off' : 'on';
  root.dataset.contrast = prefs.highContrast ? 'high' : 'normal';
  root.dataset.captions = prefs.captions === false ? 'off' : 'on';
}

const checked = (value) => value ? 'checked' : '';
const selected = (a, b) => String(a) === String(b) ? 'selected' : '';
const num = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export async function customizePage(ctx) {
  const prefs = { ...DEFAULTS, ...(await ctx.api('/api/preferences')) };
  const allVoices = voices();

  return {
    title: 'Customization Center',
    html: `<div class="stack">
      <div class="notice notice-info"><span>🎨</span><div><strong>Your teaching defaults.</strong> These settings apply to narration, reading highlights and generated games. They are saved to your account, not to individual stories or materials.</div></div>
      <form id="cust-form" class="stack">
        <div class="card card-pad">
          <div class="section-head"><h2>Read aloud & narration</h2><span class="chip chip-indigo">Voice</span></div>
          <div class="form-grid">
            <label class="field">Voice <select name="voiceURI"><option value="">Browser default</option>${allVoices.map((v) =>
              `<option value="${esc(v.voiceURI)}" ${selected(prefs.voiceURI, v.voiceURI)}>${esc(v.name)} (${esc(v.lang)})</option>`).join('')}</select></label>
            <label class="field">Language <select name="narrationLang">${LANGS.map(([value, label]) =>
              `<option value="${value}" ${selected(prefs.narrationLang, value)}>${esc(label)}</option>`).join('')}</select></label>
            <label class="field">Reading speed <span class="muted tiny">${esc(Number(prefs.narrationRate).toFixed(1))}×</span>
              <input type="range" name="narrationRate" min="0.5" max="1.5" step="0.1" value="${esc(prefs.narrationRate)}"></label>
            <label class="field">Narration volume <span class="muted tiny">${Math.round(Number(prefs.narrationVolume) * 100)}%</span>
              <input type="range" name="narrationVolume" min="0" max="1" step="0.05" value="${esc(prefs.narrationVolume)}"></label>
            <label class="field checkbox"><input type="checkbox" name="captions" ${checked(prefs.captions)}> Show captions while reading</label>
          </div>
        </div>
        <div class="card card-pad">
          <div class="section-head"><h2>Reading & display</h2><span class="chip chip-indigo">Accessibility</span></div>
          <div class="form-grid">
            <label class="field">Highlight style <select name="highlightStyle">
              <option value="word" ${selected(prefs.highlightStyle, 'word')}>Word-by-word</option>
              <option value="sentence" ${selected(prefs.highlightStyle, 'sentence')}>Whole sentence</option></select></label>
            <label class="field">Highlight color <input type="color" name="highlightColor" value="${esc(prefs.highlightColor || DEFAULTS.highlightColor)}"></label>
            <label class="field">Font size <select name="fontSize">${FONT_SIZES.map(([value, label]) =>
              `<option value="${value}" ${selected(prefs.fontSize, value)}>${esc(label)}</option>`).join('')}</select></label>
            <label class="field checkbox"><input type="checkbox" name="highContrast" ${checked(prefs.highContrast)}> High contrast</label>
            <label class="field checkbox"><input type="checkbox" name="animations" ${checked(prefs.animations)}> Animations</label>
          </div>
        </div>
        <div class="card card-pad">
          <div class="section-head"><h2>Game sound</h2><span class="chip chip-indigo">Audio</span></div>
          <div class="form-grid">
            <label class="field checkbox"><input type="checkbox" name="masterMuted" ${checked(prefs.masterMuted)}> Mute everything</label>
            <label class="field checkbox"><input type="checkbox" name="soundEffects" ${checked(prefs.soundEffects)}> Sound effects</label>
            <label class="field">Effects volume <span class="muted tiny">${Math.round(Number(prefs.effectsVolume) * 100)}%</span>
              <input type="range" name="effectsVolume" min="0" max="1" step="0.05" value="${esc(prefs.effectsVolume)}"></label>
            <label class="field checkbox"><input type="checkbox" name="backgroundMusic" ${checked(prefs.backgroundMusic)}> Background music</label>
            <label class="field">Music volume <span class="muted tiny">${Math.round(Number(prefs.musicVolume) * 100)}%</span>
              <input type="range" name="musicVolume" min="0" max="1" step="0.05" value="${esc(prefs.musicVolume)}"></label>
          </div>
        </div>
        <div class="card card-pad">
          <div class="section-head"><h2>Game defaults</h2><span class="chip chip-indigo">Generation</span></div>
          <div class="form-grid">
            <label class="field">Difficulty <select name="defaultDifficulty">${['easy', 'medium', 'hard'].map((d) =>
              `<option value="${d}" ${selected(prefs.defaultDifficulty, d)}>${d[0].toUpperCase() + d.slice(1)}</option>`).join('')}</select></label>
            <label class="field">Points per item <input type="number" name="defaultPoints" min="1" value="${esc(prefs.defaultPoints)}"></label>
            <label class="field">Time limit (seconds; 0 = none) <input type="number" name="defaultTimeLimit" min="0" value="${esc(prefs.defaultTimeLimit)}"></label>
            <label class="field">Feedback style <select name="feedbackStyle">${FEEDBACK_STYLES.map((f) =>
              `<option value="${f}" ${selected(prefs.feedbackStyle, f)}>${f[0].toUpperCase() + f.slice(1)}</option>`).join('')}</select></label>
            <label class="field">Guide character <select name="character">${CHARACTERS.map(([value, label]) =>
              `<option value="${value}" ${selected(prefs.character, value)}>${esc(label)}</option>`).join('')}</select></label>
            <label class="field">Game theme <select name="gameTheme">${THEMES.map((t) =>
              `<option value="${t}" ${selected(prefs.gameTheme, t)}>${t[0].toUpperCase() + t.slice(1)}</option>`).join('')}</select></label>
            <label class="field full">Custom sounds (JSON mapping of event names to sound URLs)
              <textarea name="customSounds" rows="3" spellcheck="false">${esc(JSON.stringify(prefs.customSounds || {}, null, 2))}</textarea></label>
          </div>
        </div>
        <div class="row wrap"><button class="btn btn-primary btn-lg" type="submit" id="cust-save">Save preferences</button>
          <span class="muted small">Changes take effect on the next reader or game screen you open.</span></div>
      </form>
    </div>`,
    mount(el) {
      applyDisplay(prefs);
      const form = el.querySelector('#cust-form');
      form.addEventListener('input', (e) => {
        const name = e.target.name;
        const span = e.target.parentElement?.querySelector('.muted.tiny');
        if (!span || !name) return;
        if (['narrationRate'].includes(name)) span.textContent = `${Number(e.target.value).toFixed(1)}×`;
        else if (['narrationVolume', 'effectsVolume', 'musicVolume'].includes(name)) span.textContent = `${Math.round(Number(e.target.value) * 100)}%`;
      });
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(form).entries());
        let customSounds;
        try {
          customSounds = JSON.parse(data.customSounds || '{}');
          if (!customSounds || typeof customSounds !== 'object' || Array.isArray(customSounds)) throw new Error('Use an object of sound names and URLs.');
        } catch (error) {
          ctx.toast(`Custom sounds: ${error.message}`, 'error');
          return;
        }
        const body = {
          narrationRate: num(data.narrationRate, DEFAULTS.narrationRate),
          narrationVolume: num(data.narrationVolume, DEFAULTS.narrationVolume),
          narrationLang: data.narrationLang || DEFAULTS.narrationLang,
          voiceURI: data.voiceURI || '',
          highlightStyle: data.highlightStyle || DEFAULTS.highlightStyle,
          highlightColor: data.highlightColor || DEFAULTS.highlightColor,
          gameTheme: data.gameTheme || DEFAULTS.gameTheme,
          animations: Boolean(data.animations),
          soundEffects: Boolean(data.soundEffects),
          backgroundMusic: Boolean(data.backgroundMusic),
          effectsVolume: num(data.effectsVolume, DEFAULTS.effectsVolume),
          musicVolume: num(data.musicVolume, DEFAULTS.musicVolume),
          masterMuted: Boolean(data.masterMuted),
          fontSize: data.fontSize || DEFAULTS.fontSize,
          highContrast: Boolean(data.highContrast),
          captions: Boolean(data.captions),
          defaultDifficulty: data.defaultDifficulty || DEFAULTS.defaultDifficulty,
          defaultPoints: num(data.defaultPoints, DEFAULTS.defaultPoints),
          defaultTimeLimit: num(data.defaultTimeLimit, DEFAULTS.defaultTimeLimit),
          feedbackStyle: data.feedbackStyle || DEFAULTS.feedbackStyle,
          character: data.character || DEFAULTS.character,
          customSounds
        };
        const button = form.querySelector('#cust-save');
        button.disabled = true; button.textContent = 'Saving…';
        try {
          const saved = await ctx.api('/api/preferences', { method: 'PUT', body });
          Object.assign(prefs, saved);
          applyDisplay(saved);
          ctx.toast('Preferences saved.', 'success');
        } catch (error) { ctx.toast(error.message, 'error'); }
        finally { button.disabled = false; button.textContent = 'Save preferences'; }
      });
    }
  };
}

export default customizePage;
