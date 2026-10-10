/* Script Viewer — parse, render, teleprompter, scripts library.
   Storage: `marathon.scripts` → { activeId, scripts:[{id,title,text,createdAt,updatedAt}] }
   Mirrors to data/scripts.json via core/sync.js. Theme lives in core/theme.js. */

const KEY = 'marathon.scripts';
const LEGACY_TEXT_KEY = 'marathon.scriptViewer';
const SCALE_KEY = 'marathon.scripts.scale';

const $ = (sel) => document.querySelector(sel);

let state = {
  view: 'script',      // script | reader | phone
  fontScale: 1,
  prompterSpeed: 40,
  prompterRunning: false,
  prompterRAF: null,
};

const EXAMPLE = MARATHON_TEMPLATES.SCRIPT;

/** @type {{ activeId: string, scripts: { id: string, title: string, text: string, createdAt: number, updatedAt: number }[] }} */
let library = { activeId: '', scripts: [] };
let listTimer;
let fresh = false;

/* ---- Parser ---- */
function parseScript(text) {
  const lines = text.split('\n');
  const doc = {
    title: null,
    sections: [],
    spokenLines: [],
  };

  let current = null;
  let beatCounter = 0;
  let inFrontmatter = false;

  const ensureSection = (name, type) => {
    if (!current || current.name !== name) {
      current = { name, type, items: [] };
      doc.sections.push(current);
    }
    return current;
  };

  const addSpoken = (line) => {
    const clean = stripStageDirections(line).trim();
    if (clean) doc.spokenLines.push(clean);
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();

    if (!line) continue;

    // Title
    if (/^#\s+/.test(line) && !/^##/.test(line)) {
      doc.title = line.replace(/^#\s+/, '');
      continue;
    }

    // Section headers
    const secMatch = line.match(/^##\s+(.+)/i);
    if (secMatch) {
      const label = secMatch[1].trim();
      const lower = label.toLowerCase();

      if (/hook/i.test(lower)) {
        current = { name: label, type: 'hook', items: [] };
        doc.sections.push(current);
      } else if (/script|beats|voice/i.test(lower)) {
        current = { name: label, type: 'script', items: [] };
        doc.sections.push(current);
        beatCounter = 0;
      } else if (/insert|asset|b-?roll|visual/i.test(lower)) {
        current = { name: label, type: 'inserts', items: [] };
        doc.sections.push(current);
      } else if (/prep/i.test(lower)) {
        current = { name: label, type: 'prep', items: [] };
        doc.sections.push(current);
      } else if (/idea/i.test(lower)) {
        current = { name: label, type: 'idea', items: [] };
        doc.sections.push(current);
      } else {
        current = { name: label, type: 'generic', items: [] };
        doc.sections.push(current);
      }
      continue;
    }

    // Prep checkbox
    const prepMatch = line.match(/^[-*]\s+\[([ xX])\]\s+(.+)/);
    if (prepMatch) {
      const sec = ensureSection('Prep', 'prep');
      sec.items.push({ kind: 'prep', done: prepMatch[1].toLowerCase() === 'x', text: prepMatch[2] });
      continue;
    }

    // Insert line
    if (/^[-*]\s+/.test(line) && current?.type === 'inserts') {
      const text = line.replace(/^[-*]\s+/, '');
      current.items.push({ kind: 'insert', text });
      continue;
    }

    // Beat numbered
    const beatMatch = line.match(/^(\d+)[.)]\s+(.+)/);
    if (beatMatch) {
      const sec = current?.type === 'script' ? current : ensureSection('Script', 'script');
      beatCounter = parseInt(beatMatch[1], 10);
      const body = beatMatch[2];
      sec.items.push({ kind: 'beat', num: beatCounter, lines: [body] });
      addSpoken(body);
      continue;
    }

    // Character dialogue: ALL CAPS NAME:
    const charMatch = line.match(/^([A-Z][A-Z0-9\s'.-]{1,30}):\s*(.*)/);
    if (charMatch && charMatch[1].split(' ').every(w => /^[A-Z]/.test(w) || w === "'")) {
      const sec = current?.type === 'script' ? current : ensureSection('Script', 'script');
      const dlg = { kind: 'dialogue', character: charMatch[1], lines: [] };
      if (charMatch[2]) dlg.lines.push(charMatch[2]);
      sec.items.push(dlg);
      if (charMatch[2]) addSpoken(charMatch[2]);
      // Collect following dialogue lines
      while (i + 1 < lines.length) {
        const next = lines[i + 1].trim();
        if (!next || /^##/.test(next) || /^\d+[.)]/.test(next) || /^[A-Z][A-Z\s]+:/.test(next)) break;
        if (/^\(.+\)$/.test(next) || /^\[.+\]$/.test(next)) {
          sec.items.push({ kind: 'stage', text: next.replace(/^[(\[]|[)\]]$/g, '') });
          i++;
          continue;
        }
        dlg.lines.push(next);
        addSpoken(next);
        i++;
      }
      continue;
    }

    // Stage direction
    if (/^\(.+\)$/.test(line) || /^\[.+\]$/.test(line) || /^<!--.+-->$/.test(line)) {
      const sec = current || ensureSection('Notes', 'generic');
      sec.items.push({ kind: 'stage', text: line.replace(/^<!--\s*|\s*-->$/g, '').replace(/^[(\[]|[)\]]$/g, '') });
      continue;
    }

    // Insert anywhere
    if (/^insert\s*[:—-]/i.test(line) || /^b-?roll\s*[:—-]/i.test(line)) {
      const sec = current?.type === 'inserts' ? current : ensureSection('Inserts', 'inserts');
      sec.items.push({ kind: 'insert', text: line.replace(/^insert\s*[:—-]\s*/i, '').replace(/^b-?roll\s*[:—-]\s*/i, '') });
      continue;
    }

    // Bullet in script = sub-point
    if (/^[-*]\s+/.test(line)) {
      const text = line.replace(/^[-*]\s+/, '');
      if (current?.type === 'inserts') {
        current.items.push({ kind: 'insert', text });
      } else if (current?.type === 'script' && current.items.length) {
        const last = current.items[current.items.length - 1];
        if (last.kind === 'beat') last.lines.push(text);
        else {
          beatCounter++;
          current.items.push({ kind: 'beat', num: beatCounter, lines: [text] });
          addSpoken(text);
        }
      } else {
        const sec = ensureSection('Script', 'script');
        beatCounter++;
        sec.items.push({ kind: 'beat', num: beatCounter, lines: [text] });
        addSpoken(text);
      }
      continue;
    }

    // Hook content (first lines under hook section)
    if (current?.type === 'hook') {
      current.items.push({ kind: 'hook-text', text: line });
      addSpoken(line);
      continue;
    }

    // Idea section
    if (current?.type === 'idea') {
      current.items.push({ kind: 'text', text: line });
      continue;
    }

    // Generic script line
    if (current?.type === 'script') {
      beatCounter++;
      current.items.push({ kind: 'beat', num: beatCounter, lines: [line] });
      addSpoken(line);
      continue;
    }

    // Fallback: accumulate as paragraphs
    if (!current) {
      current = { name: 'Script', type: 'plain', items: [] };
      doc.sections.push(current);
    }
    if (current.type === 'plain') {
      current.items.push({ kind: 'para', text: line });
      addSpoken(line);
    } else {
      current.items.push({ kind: 'text', text: line });
      addSpoken(line);
    }
  }

  // Plain text fallback: no sections parsed
  if (!doc.sections.length && text.trim()) {
    const paras = text.trim().split(/\n\s*\n/).filter(Boolean);
    const sec = { name: 'Script', type: 'plain', items: [] };
    paras.forEach(p => {
      const t = p.replace(/\n/g, ' ').trim();
      sec.items.push({ kind: 'para', text: t });
      addSpoken(t);
    });
    doc.sections.push(sec);
  }

  return doc;
}

function stripStageDirections(text) {
  return text
    .replace(/\([^)]*\)/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ---- Render ---- */
function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function renderScript(doc) {
  if (!doc.sections.length && !doc.title) {
    return `<div class="empty-state">
      <div class="icon">🎬</div>
      <h2>Paste your script</h2>
      <p>Type or paste any script on the left. Supports hooks, numbered beats, dialogue, inserts, and plain text.</p>
    </div>`;
  }

  let html = '<div class="script-doc">';

  if (doc.title) {
    html += `<h2 class="script-title">${esc(doc.title)}</h2>`;
    html += `<div class="script-meta">${doc.spokenLines.length} spoken lines · ${countBeats(doc)} beats</div>`;
  }

  for (const sec of doc.sections) {
    if (sec.type === 'hook') {
      const hookText = sec.items.map(i => i.text).join(' ');
      if (hookText) {
        html += `<div class="section"><div class="section-label">Hook</div>
          <div class="hook-block"><span class="hook-tag">First 2 sec</span>
          <p class="hook-text">${esc(hookText)}</p></div></div>`;
      }
      continue;
    }

    if (sec.type === 'idea') {
      html += `<div class="section"><div class="section-label">${esc(sec.name)}</div>`;
      sec.items.forEach(i => { html += `<p class="beat-line" style="font-size:calc(20px * var(--script-size))">${esc(i.text)}</p>`; });
      html += '</div>';
      continue;
    }

    if (sec.type === 'prep') {
      html += `<div class="section"><div class="section-label">${esc(sec.name)}</div>`;
      sec.items.forEach(i => {
        html += `<div class="prep-item${i.done ? ' done' : ''}">
          <span class="prep-check">${i.done ? '✓' : '○'}</span><span>${esc(i.text)}</span></div>`;
      });
      html += '</div>';
      continue;
    }

    if (sec.type === 'inserts') {
      html += `<div class="section"><div class="section-label">${esc(sec.name)}</div>`;
      sec.items.forEach(i => {
        html += `<div class="insert-card"><span class="insert-icon">🎞</span><div>
          <div class="insert-label">On screen</div><div class="insert-text">${esc(i.text)}</div></div></div>`;
      });
      html += '</div>';
      continue;
    }

    if (sec.type === 'plain') {
      sec.items.forEach(i => {
        html += `<p class="para-block">${esc(i.text)}</p>`;
      });
      continue;
    }

    // Script / generic
    if (sec.items.length) {
      html += `<div class="section"><div class="section-label">${esc(sec.name)}</div>`;
      for (const item of sec.items) {
        html += renderItem(item);
      }
      html += '</div>';
    }
  }

  html += '</div>';
  return html;
}

function renderItem(item) {
  switch (item.kind) {
    case 'beat':
      return `<div class="beat"><div class="beat-num">${item.num}</div><div class="beat-body">
        ${item.lines.map(l => `<p class="beat-line">${esc(l)}</p>`).join('')}
      </div></div>`;
    case 'dialogue':
      return `<div class="dialogue-block"><div class="character-name">${esc(item.character)}</div>
        ${item.lines.map(l => `<p class="dialogue-line">${esc(l)}</p>`).join('')}
      </div>`;
    case 'stage':
      return `<p class="stage-dir">${esc(item.text)}</p>`;
    case 'insert':
      return `<div class="insert-card"><span class="insert-icon">🎞</span><div>
        <div class="insert-label">Insert</div><div class="insert-text">${esc(item.text)}</div></div></div>`;
    case 'text':
      return `<p class="beat-line">${esc(item.text)}</p>`;
    default:
      return '';
  }
}

function renderReader(doc) {
  if (!doc.spokenLines.length) {
    return `<div class="empty-state"><div class="icon">🎙</div><h2>No spoken lines yet</h2>
      <p>Add script beats or dialogue — inserts and stage directions are filtered out.</p></div>`;
  }
  let html = '<div class="script-doc reader-doc">';
  if (doc.title) html += `<h2 class="script-title">${esc(doc.title)}</h2>`;
  doc.spokenLines.forEach((line, i) => {
    html += `<p class="spoken-line">${esc(line)}</p>`;
  });
  html += '</div>';
  return html;
}

function countBeats(doc) {
  let n = 0;
  for (const sec of doc.sections) {
    n += sec.items.filter(i => i.kind === 'beat').length;
  }
  return n || doc.spokenLines.length;
}

/* ---- Teleprompter ---- */
function openPrompter(doc) {
  const overlay = $('#teleprompter');
  const scroll = $('#prompterScroll');
  let html = '<div class="prompter-gap"></div>';

  const hookSec = doc.sections.find(s => s.type === 'hook');
  if (hookSec) {
    const hookText = hookSec.items.map(i => i.text).join(' ');
    if (hookText) html += `<p class="prompter-line hook">${esc(hookText)}</p>`;
  }

  doc.spokenLines.forEach((line, i) => {
    if (hookSec) {
      const hookText = hookSec.items.map(it => it.text).join(' ');
      if (line === hookText) return;
    }
    html += `<p class="prompter-line" data-idx="${i}">${esc(line)}</p>`;
  });

  html += '<div class="prompter-gap"></div>';
  scroll.innerHTML = html;
  overlay.classList.add('active');
  scroll.scrollTop = 0;
  state.prompterRunning = false;
  updatePrompterBtn();
}

function closePrompter() {
  stopPrompter();
  $('#teleprompter').classList.remove('active');
}

function togglePrompter() {
  if (state.prompterRunning) stopPrompter();
  else startPrompter();
}

function startPrompter() {
  state.prompterRunning = true;
  updatePrompterBtn();
  const scroll = $('#prompterScroll');
  let last = performance.now();

  function tick(now) {
    if (!state.prompterRunning) return;
    const dt = (now - last) / 1000;
    last = now;
    scroll.scrollTop += state.prompterSpeed * dt;
    if (scroll.scrollTop >= scroll.scrollHeight - scroll.clientHeight - 2) {
      stopPrompter();
      return;
    }
    state.prompterRAF = requestAnimationFrame(tick);
  }
  state.prompterRAF = requestAnimationFrame(tick);
}

function stopPrompter() {
  state.prompterRunning = false;
  if (state.prompterRAF) cancelAnimationFrame(state.prompterRAF);
  state.prompterRAF = null;
  updatePrompterBtn();
}

function updatePrompterBtn() {
  const btn = $('#prompterPlayBtn');
  if (btn) btn.textContent = state.prompterRunning ? 'Pause' : 'Play';
}

/* ---- Library ---- */
function newId() { return `s_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`; }
function titleOf(text) {
  const m = text.match(/^#\s+(.+)/m);
  if (m) return m[1].trim().slice(0, 60);
  const line = text.split('\n').map((l) => l.trim()).find((l) => l && !/^#/.test(l));
  return line ? line.slice(0, 56) : 'Untitled script';
}
function normalizeLib(data) {
  const scripts = (data && Array.isArray(data.scripts) ? data.scripts : []).map((s) => ({
    id: s.id || newId(), title: s.title || titleOf(s.text || ''), text: s.text || '',
    createdAt: s.createdAt || Date.now(), updatedAt: s.updatedAt || Date.now(),
  }));
  let activeId = data && data.activeId;
  if (!scripts.some((s) => s.id === activeId)) activeId = scripts[0] ? scripts[0].id : '';
  return { activeId, scripts };
}
function loadLibrary() {
  const saved = Store.getJSON(KEY, null);
  if (saved && Array.isArray(saved.scripts) && saved.scripts.length) return normalizeLib(saved);
  const legacy = Store.get(LEGACY_TEXT_KEY);
  if (legacy && legacy.trim()) {
    const id = newId();
    return { activeId: id, scripts: [{ id, title: titleOf(legacy), text: legacy, createdAt: Date.now(), updatedAt: Date.now() }] };
  }
  fresh = true;
  return normalizeLib(MARATHON_TEMPLATES.scripts(new Date()));
}
function persistLibrary(opts) { Store.setJSON(KEY, library, opts); }
function getActive() { return library.scripts.find((s) => s.id === library.activeId); }
function flushActive() {
  const s = getActive(); const ta = $('#scriptInput');
  if (!s || !ta) return false;
  if (s.text === ta.value) return false;
  s.text = ta.value; s.title = titleOf(ta.value); s.updatedAt = Date.now();
  return true;
}
function fmtWhen(ts) {
  return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
function renderList() {
  const list = $('#scriptsList'); if (!list) return;
  const sorted = [...library.scripts].sort((a, b) => b.updatedAt - a.updatedAt);
  list.innerHTML = sorted.map((s) => {
    const doc = parseScript(s.text);
    const active = s.id === library.activeId ? ' active' : '';
    return `<button type="button" class="note-item${active}" data-id="${esc(s.id)}">
      <span class="note-item-title">${esc(s.title || titleOf(s.text))}</span>
      <span class="note-item-preview">${esc(doc.spokenLines[0] || 'Empty script')}</span>
      <span class="note-item-meta">${countBeats(doc)} beats · ${esc(fmtWhen(s.updatedAt))}</span>
    </button>`;
  }).join('');
  list.querySelectorAll('.note-item').forEach((b) => b.addEventListener('click', () => switchScript(b.dataset.id)));
}
function scheduleList() { clearTimeout(listTimer); listTimer = setTimeout(renderList, 350); }
function switchScript(id) {
  if (!id || id === library.activeId) return;
  flushActive();
  library.activeId = id;
  const s = getActive();
  $('#scriptInput').value = s ? s.text : '';
  persistLibrary();
  renderList();
  updatePreview({ skipSave: true });
}
function createScript(text) {
  flushActive();
  const id = newId();
  const t = text ?? '# New script\n\n## Hook\n\n## Script\n1. \n';
  library.scripts.unshift({ id, title: titleOf(t), text: t, createdAt: Date.now(), updatedAt: Date.now() });
  library.activeId = id;
  $('#scriptInput').value = t;
  persistLibrary(); renderList(); updatePreview({ skipSave: true });
  $('#scriptInput').focus();
}
function duplicateScript() {
  flushActive();
  const src = getActive(); if (!src) return;
  createScript(src.text);
}
function deleteScript() {
  const s = getActive(); if (!s) return;
  if (library.scripts.length <= 1) {
    if (!confirm('Clear this script?')) return;
    s.text = '# New script\n\n'; s.title = titleOf(s.text); s.updatedAt = Date.now();
    $('#scriptInput').value = s.text; persistLibrary(); renderList(); updatePreview({ skipSave: true }); return;
  }
  if (!confirm(`Delete "${s.title}"?`)) return;
  library.scripts = library.scripts.filter((x) => x.id !== s.id);
  library.activeId = library.scripts[0].id;
  $('#scriptInput').value = library.scripts[0].text;
  persistLibrary(); renderList(); updatePreview({ skipSave: true });
}

/* ---- Main update ---- */
let parsedDoc = null;

function updatePreview(opts = {}) {
  const text = $('#scriptInput').value;
  parsedDoc = parseScript(text);
  if (!opts.skipSave && flushActive()) { persistLibrary(); scheduleList(); }

  const preview = $('#preview');
  const pane = $('#previewPane');

  if (state.view === 'reader') {
    preview.innerHTML = renderReader(parsedDoc);
    pane.classList.remove('aspect-phone');
    preview.classList.remove('phone-frame');
  } else if (state.view === 'phone') {
    pane.classList.add('aspect-phone');
    preview.classList.add('phone-frame');
    preview.innerHTML = renderScript(parsedDoc);
  } else {
    pane.classList.remove('aspect-phone');
    preview.classList.remove('phone-frame');
    preview.innerHTML = renderScript(parsedDoc);
  }
}

function setView(view) {
  state.view = view;
  document.querySelectorAll('.view-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.view === view);
  });
  updatePreview({ skipSave: true });
}

function setFontScale(val) {
  state.fontScale = val;
  document.documentElement.style.setProperty('--script-size', val);
  Store.set(SCALE_KEY, String(val), { silent: true });
}

async function copyScript() {
  const text = $('#scriptInput').value.trim();
  if (!text) return;
  try { await navigator.clipboard.writeText(text); flash('Copied script — paste it into your agent chat'); }
  catch { flash('Copy failed — select the text and copy manually'); }
}
function flash(msg) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show');
  clearTimeout(flash._t); flash._t = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ---- Sync + palette ---- */
function registerSync() {
  Sync.register({
    file: 'scripts.json', key: KEY, label: 'scripts', isFresh: () => fresh || Store.isFresh(KEY),
    read: () => ({ activeId: library.activeId, scripts: library.scripts }),
    apply: (body) => {
      const incoming = normalizeLib(body);
      if (!incoming.scripts.length) return;
      const activeBefore = getActive();
      library = incoming;
      if (activeBefore && library.scripts.some((s) => s.id === activeBefore.id)) library.activeId = activeBefore.id;
      const s = getActive();
      if (s && $('#scriptInput').value !== s.text) $('#scriptInput').value = s.text;
      renderList(); updatePreview({ skipSave: true }); flash('Scripts updated from data/scripts.json');
    }
  });
}
function registerPalette() {
  Palette.init({ root: '../' });
  Palette.register([
    { label: 'New script', hint: 'script', keywords: 'add create', run: () => createScript() },
    { label: 'Duplicate script', hint: 'script', run: duplicateScript },
    { label: 'Delete script', hint: 'script', keywords: 'remove', run: deleteScript },
    { label: 'Open script', prefix: 'find', hint: 'find <title>', keywords: 'search switch', run: (q) => {
      const l = q.toLowerCase(); const m = library.scripts.filter((s) => (s.title || '').toLowerCase().includes(l));
      if (m.length === 1) switchScript(m[0].id); else flash(m.length ? 'Several scripts match — be more specific' : 'No script matches');
    } },
    { label: 'Load example script', hint: 'script', run: () => createScript(EXAMPLE) },
    { label: 'Start teleprompter', hint: 'view', keywords: 'prompter record', run: () => $('#teleprompterBtn').click() },
    { label: 'View: script', hint: 'view', run: () => setView('script') },
    { label: 'View: reader', hint: 'view', run: () => setView('reader') },
    { label: 'View: 9:16 phone', hint: 'view', run: () => setView('phone') },
    { label: 'Copy script for AI', hint: 'export', keywords: 'clipboard', run: copyScript },
    { label: 'Print', hint: 'export', run: () => window.print() },
    { label: 'Go to writing viewer', hint: 'nav', run: () => { location.href = 'writing-viewer.html'; } }
  ]);
}

/* ---- Init ---- */
function init() {
  Config.applyDOM();
  library = loadLibrary();
  persistLibrary({ silent: true });
  if (fresh) Store.markFresh(KEY);

  const input = $('#scriptInput');
  const active = getActive();
  input.value = active ? active.text : '';

  const scale = Store.get(SCALE_KEY) || Store.get(LEGACY_TEXT_KEY + '.scale');
  if (scale) {
    state.fontScale = parseFloat(scale) || 1;
    $('#fontScale').value = state.fontScale;
    setFontScale(state.fontScale);
  }

  renderList();
  input.addEventListener('input', debounce(updatePreview, 120));
  updatePreview({ skipSave: true });

  $('#fontScale').addEventListener('input', (e) => setFontScale(e.target.value));
  $('#prompterSpeed').addEventListener('input', (e) => { state.prompterSpeed = parseInt(e.target.value, 10); });

  document.querySelectorAll('.view-tab').forEach(tab => {
    tab.addEventListener('click', () => setView(tab.dataset.view));
  });

  $('#teleprompterBtn').addEventListener('click', () => {
    if (!parsedDoc) parsedDoc = parseScript(input.value);
    openPrompter(parsedDoc);
  });
  $('#closePrompter').addEventListener('click', closePrompter);
  $('#prompterPlayBtn').addEventListener('click', togglePrompter);

  $('#loadExample').addEventListener('click', () => createScript(EXAMPLE));
  $('#copyScriptBtn').addEventListener('click', copyScript);
  $('#clearScript').addEventListener('click', () => {
    if (confirm('Clear this script?')) { input.value = ''; updatePreview(); }
  });
  $('#newScriptBtn').addEventListener('click', () => createScript());
  $('#dupScriptBtn').addEventListener('click', duplicateScript);
  $('#delScriptBtn').addEventListener('click', deleteScript);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('#teleprompter').classList.contains('active')) closePrompter();
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key === 's') { e.preventDefault(); if (flushActive()) persistLibrary(); renderList(); flash('Script saved'); }
  });

  registerSync();
  registerPalette();
  if (fresh) flash('Sample scripts loaded — ⌘K for commands');
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

document.addEventListener('DOMContentLoaded', init);
