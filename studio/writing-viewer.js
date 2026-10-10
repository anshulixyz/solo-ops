/* Writing Viewer — markdown + track changes + undo + word count */

const STORAGE_KEY = 'marathon.writingViewer';
const LIBRARY_KEY = 'marathon.writingViewer.library';
const SNAPSHOT_KEY = 'marathon.writingViewer.snapshot'; // legacy migrate only
const THEME_KEY = 'marathon.writingViewer.theme';

const $ = (sel) => document.querySelector(sel);

let state = {
  view: 'draft', // draft | read | changes
  fontScale: 1,
  showNotes: true,
};

const history = { stack: [], index: -1, max: 80, locking: false };

/** @type {{ activeId: string, notes: { id: string, text: string, createdAt: number, updatedAt: number }[] }} */
let library = { activeId: '', notes: [] };

let listRenderTimer;

const EXAMPLE = `# The draft I'm wrestling with

> The best writing feels like you're thinking out loud — but on purpose.

This is the paragraph I'm shaping for a LinkedIn post about ~~building in public~~ ++shipping in public++.

I want it to land with founders who are tired of performative updates.

[[AI: tighten the second sentence — less preachy, more specific]]

## Alternate hook

++What if your "building in public" post is just another performance?++

---

Still figuring out the close. ~~Let me know what you think.~~ ++Tell me if you've felt this — genuinely curious.++
`;

/* ---- Theme (shared keys with writing viewer) ---- */
function initTheme() {
  try {
    const t = localStorage.getItem(THEME_KEY) ||
      (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', t);
    document.documentElement.style.colorScheme = t;
  } catch {
    document.documentElement.setAttribute('data-theme', 'light');
  }
}

function toggleTheme() {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  document.documentElement.style.colorScheme = next;
  try { localStorage.setItem(THEME_KEY, next); } catch {}
}

/* ---- Word count ---- */
function countWords(text) {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return 0;
  return t.split(' ').filter(Boolean).length;
}

function stripMarkupForCount(text) {
  return text
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/\[\[[^\]]*\]\]/g, '')
    .replace(/~~([^~]*)~~/g, '')
    .replace(/\+\+([^+]*)\+\+/g, '$1')
    .replace(/[#>*_`[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function analyzeText(raw) {
  const strikes = [...raw.matchAll(/~~([^~]+)~~/g)].map(m => m[1]);
  const inserts = [...raw.matchAll(/\+\+([^+]+)\+\+/g)].map(m => m[1]);
  const notes = [...raw.matchAll(/\[\[([^\]]+)\]\]/g)].map(m => m[1]);

  const clean = stripMarkupForCount(
    raw
      .replace(/~~[^~]*~~/g, '')
      .replace(/\[\[[^\]]*\]\]/g, '')
  );

  const withInserts = stripMarkupForCount(
    raw.replace(/\[\[[^\]]*\]\]/g, '')
  );

  return {
    totalWords: countWords(stripMarkupForCount(raw.replace(/\[\[[^\]]*\]\]/g, ''))),
    cleanWords: countWords(clean),
    draftWords: countWords(withInserts),
    chars: raw.length,
    strikes,
    inserts,
    notes,
  };
}

function updateStats() {
  const raw = $('#writingInput').value;
  const a = analyzeText(raw);
  $('#statClean').textContent = a.cleanWords;
  $('#statDraft').textContent = a.draftWords;
  $('#statChars').textContent = a.chars;
  $('#statNotes').textContent = a.notes.length;
  $('#statStrikes').textContent = a.strikes.length;
  return a;
}

/* ---- Inline markdown renderer (block + inline) ---- */
function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function renderInline(text, mode) {
  let s = esc(text);

  // Notes -> only in draft/changes
  s = s.replace(/\[\[([^\]]+)\]\]/g, (_, note) => {
    if (mode === 'read') return '';
    return `<span class="ch-note"><span class="ch-note-label">Note for AI</span>${esc(note)}</span>`;
  });

  // Track changes
  s = s.replace(/~~([^~]+)~~/g, (_, t) => {
    if (mode === 'read') return '';
    return `<span class="ch-strike">${esc(t)}</span>`;
  });
  s = s.replace(/\+\+([^+]+)\+\+/g, (_, t) => {
    if (mode === 'read') return esc(t);
    return `<span class="ch-insert">${esc(t)}</span>`;
  });

  s = s.replace(/\*\*([^*]+)\*\*/g, (_, t) => `<strong>${esc(t)}</strong>`);
  s = s.replace(/\*([^*]+)\*/g, (_, t) => `<em>${esc(t)}</em>`);
  s = s.replace(/`([^`]+)`/g, (_, t) => `<code>${esc(t)}</code>`);
  return s;
}

function parseBlocks(raw) {
  const lines = raw.split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trim = line.trim();

    if (!trim) { i++; continue; }

    // Uploaded image reference (pixels stored on the note, not in text)
    const imgRef = trim.match(/^\[Image uploaded (\d+)\]\s*$/i);
    if (imgRef) {
      blocks.push({ type: 'imageRef', num: imgRef[1] });
      i++;
      continue;
    }

    // External / legacy markdown image
    const imgM = trim.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/);
    if (imgM) {
      blocks.push({ type: 'image', alt: imgM[1], src: imgM[2] });
      i++;
      continue;
    }

    // HR
    if (/^---+$/.test(trim) || /^\*\*\*+$/.test(trim)) {
      blocks.push({ type: 'hr' });
      i++;
      continue;
    }

    // H1
    if (/^#\s+/.test(trim) && !/^##/.test(trim)) {
      blocks.push({ type: 'h1', text: trim.replace(/^#\s+/, '') });
      i++;
      continue;
    }

    // H2
    if (/^##\s+/.test(trim)) {
      blocks.push({ type: 'h2', text: trim.replace(/^##\s+/, '') });
      i++;
      continue;
    }

    // Quote
    if (/^>\s?/.test(trim)) {
      const quoteLines = [];
      let cite = '';
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        let q = lines[i].trim().replace(/^>\s?/, '');
        const citeM = q.match(/^—\s*(.+)$/) || q.match(/^--\s*(.+)$/);
        if (citeM && quoteLines.length) cite = citeM[1];
        else quoteLines.push(q);
        i++;
      }
      blocks.push({ type: 'quote', lines: quoteLines, cite });
      continue;
    }

    // Note-only line
    if (/^\[\[[^\]]+\]\]\s*$/.test(trim)) {
      blocks.push({ type: 'note', text: trim.slice(2, -2) });
      i++;
      continue;
    }

    // Paragraph (collect until blank)
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^#/.test(lines[i].trim()) &&
      !/^>/.test(lines[i].trim()) && !/^!\[/.test(lines[i].trim()) &&
      !/^\[Image uploaded \d+\]/i.test(lines[i].trim()) &&
      !/^---+$/.test(lines[i].trim())) {
      para.push(lines[i].trim());
      i++;
    }
    if (para.length) blocks.push({ type: 'p', lines: para, lead: blocks.length <= 2 });
  }

  return blocks;
}

function renderUploadedImage(src, num) {
  if (!src) {
    return `<div class="insert-card"><span class="insert-icon">🖼</span><div>
      <div class="insert-label">Image ${esc(num)}</div>
      <div class="insert-text">[Image uploaded ${esc(num)}] — not found; upload again or delete this line</div></div></div>`;
  }
  return `<figure class="write-figure"><img src="${esc(src)}" alt="Image uploaded ${esc(num)}" loading="lazy">
    <figcaption>Image uploaded ${esc(num)}</figcaption></figure>`;
}

function renderDocument(raw, mode, images = {}) {
  if (!raw.trim()) {
    return `<div class="empty-state"><div class="icon">✍️</div><h2>Start writing</h2>
      <p>Drafts, quotes, posts with images. Use <code>~~strike~~</code>, <code>++add++</code>, and <code>[[notes for AI]]</code>.</p></div>`;
  }

  const blocks = parseBlocks(raw);
  const a = analyzeText(raw);
  let html = `<div class="write-doc mode-${mode}">`;

  if (mode === 'changes' && (a.strikes.length || a.inserts.length || a.notes.length)) {
    html += `<div class="changes-summary"><h3>Change log</h3><ul>`;
    a.strikes.forEach(t => { html += `<li><span class="ch-strike">Removed</span>: ${esc(t)}</li>`; });
    a.inserts.forEach(t => { html += `<li><span class="ch-insert">Added</span>: ${esc(t)}</li>`; });
    a.notes.forEach(t => { html += `<li><span class="ch-note-label">Note</span>: ${esc(t)}</li>`; });
    html += `</ul></div>`;
  }

  let firstP = true;
  for (const b of blocks) {
    switch (b.type) {
      case 'h1':
        html += `<h1 class="write-title">${renderInline(b.text, mode)}</h1>`;
        break;
      case 'h2':
        html += `<h2 class="write-h2">${renderInline(b.text, mode)}</h2>`;
        firstP = true;
        break;
      case 'quote':
        html += `<blockquote class="write-quote"><p>${b.lines.map(l => renderInline(l, mode)).join('<br>')}</p>`;
        if (b.cite) html += `<cite>${esc(b.cite)}</cite>`;
        html += `</blockquote>`;
        break;
      case 'imageRef':
        html += renderUploadedImage(images[b.num], b.num);
        break;
      case 'image':
        html += `<figure class="write-figure"><img src="${esc(b.src)}" alt="${esc(b.alt)}" loading="lazy">`;
        if (b.alt) html += `<figcaption>${esc(b.alt)}</figcaption>`;
        html += `</figure>`;
        break;
      case 'hr':
        html += `<hr class="write-hr">`;
        break;
      case 'note':
        if (mode !== 'read') {
          html += `<div class="ch-note"><span class="ch-note-label">Note for AI</span>${esc(b.text)}</div>`;
        }
        break;
      case 'p':
        const cls = firstP && b.lead ? ' write-p lead' : ' write-p';
        firstP = false;
        html += `<p class="${cls.trim()}">${b.lines.map(l => renderInline(l, mode)).join('<br>')}</p>`;
        break;
    }
  }

  html += '</div>';
  return html;
}

/* ---- Export for AI (raw source: cuts, adds, notes stay inline) ---- */
function getEditorSlice() {
  const ta = $('#writingInput');
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const full = ta.value;
  if (end > start) {
    return { text: full.slice(start, end), scope: 'selection' };
  }
  return { text: full, scope: 'full' };
}

function buildAiExport(raw) {
  return raw.trim();
}

function buildPlainClean(raw) {
  return raw
    .replace(/~~[^~]*~~/g, '')
    .replace(/\+\+([^+]*)\+\+/g, '$1')
    .replace(/\[\[[^\]]*\]\]/g, '')
    .trim();
}

/* ---- Undo / redo ---- */
function pushHistory(text) {
  if (history.locking) return;
  if (history.index >= 0 && history.stack[history.index] === text) return;
  history.stack = history.stack.slice(0, history.index + 1);
  history.stack.push(text);
  if (history.stack.length > history.max) {
    history.stack.shift();
  } else {
    history.index++;
  }
  updateUndoButtons();
}

function undo() {
  if (history.index <= 0) return;
  history.locking = true;
  history.index--;
  const ta = $('#writingInput');
  ta.value = history.stack[history.index];
  history.locking = false;
  refresh();
}

function redo() {
  if (history.index >= history.stack.length - 1) return;
  history.locking = true;
  history.index++;
  const ta = $('#writingInput');
  ta.value = history.stack[history.index];
  history.locking = false;
  refresh();
}

function updateUndoButtons() {
  $('#undoBtn').disabled = history.index <= 0;
  $('#redoBtn').disabled = history.index >= history.stack.length - 1;
}

/* ---- Editor helpers ---- */
function wrapSelection(before, after) {
  const ta = $('#writingInput');
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const val = ta.value;
  const sel = val.slice(start, end);
  const replacement = before + sel + after;
  ta.value = val.slice(0, start) + replacement + val.slice(end);
  const c = start + before.length;
  ta.setSelectionRange(c, c + sel.length);
  ta.focus();
  onEdit();
}

function insertAtCursor(text) {
  const ta = $('#writingInput');
  const start = ta.selectionStart;
  const val = ta.value;
  ta.value = val.slice(0, start) + text + val.slice(start);
  ta.setSelectionRange(start + text.length, start + text.length);
  ta.focus();
  onEdit();
}

function strikeSelection() { wrapSelection('~~', '~~'); }
function insertMark() { wrapSelection('++', '++'); }
function noteSelection() { wrapSelection('[[', ']]'); }

function nextImageNum(note) {
  const nums = Object.keys(note.images || {})
    .map((k) => parseInt(k, 10))
    .filter((n) => !Number.isNaN(n));
  return nums.length ? Math.max(...nums) + 1 : 1;
}

function insertImage() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const note = getActiveNote();
      if (!note) return;
      if (!note.images) note.images = {};
      const n = nextImageNum(note);
      note.images[String(n)] = reader.result;
      insertAtCursor(`\n[Image uploaded ${n}]\n`);
      try {
        persistLibrary();
      } catch {}
      showToast(`Image uploaded ${n} — attach this file in chat`);
    };
    reader.readAsDataURL(file);
  };
  input.click();
}

/* ---- Clipboard ---- */
function showToast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast('Copied to clipboard');
  } catch {
    showToast('Copy failed — use the preview panel');
  }
}

function openCopyModal(text, scope) {
  const modal = $('#copyModal');
  const title = $('#copyModalTitle');
  if (title) {
    title.textContent = scope === 'selection' ? 'Copy selection for AI' : 'Copy for AI';
  }
  $('#copyPreview').value = text;
  modal.classList.add('open');
}

function updateCopyAiButton() {
  const ta = $('#writingInput');
  const btn = $('#copyAiBtn');
  if (!ta || !btn) return;
  const has = ta.selectionEnd > ta.selectionStart;
  btn.textContent = has ? 'Copy selection' : 'Copy for AI';
  btn.title = has
    ? 'Copy selection with ~~cuts~~, ++adds++, [[notes]] — paste into chat'
    : 'Copy full draft with all markup — paste into chat';
}

async function copyForAi() {
  const { text, scope } = getEditorSlice();
  const payload = buildAiExport(text);
  if (!payload) {
    showToast('Nothing to copy');
    return;
  }
  try {
    await navigator.clipboard.writeText(payload);
    showToast(scope === 'selection' ? 'Copied selection (with markup)' : 'Copied full draft (with markup)');
  } catch {
    openCopyModal(payload, scope);
  }
}

function closeCopyModal() {
  $('#copyModal').classList.remove('open');
}

/* ---- Notes library ---- */
function extractTitle(raw) {
  const m = raw.match(/^#\s+(.+)/m);
  return m ? m[1].trim().slice(0, 60) : '';
}

function formatNoteWhen(ts) {
  const d = new Date(ts);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function newNoteId() {
  return `n_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function noteTitle(text) {
  const h = extractTitle(text);
  if (h) return h;
  const line = text.split('\n').map((l) => l.trim()).find((l) => l && !/^#/.test(l));
  if (line) return line.replace(/[*_~[\]+]/g, '').slice(0, 56);
  return 'New note';
}

function notePreview(text) {
  const plain = stripMarkupForCount(text.replace(/\[\[[^\]]*\]\]/g, ''));
  return plain.slice(0, 90) || 'Empty note';
}

function persistLibrary() {
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(library));
  } catch {
    showToast('Save failed — try removing large images');
  }
}

function loadLibrary() {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data?.notes?.length && data.activeId) {
        data.notes.forEach((n) => {
          if (!n.images) n.images = {};
        });
        return data;
      }
    }
  } catch {}

  const notes = [];
  let activeId = null;

  try {
    const draft = localStorage.getItem(STORAGE_KEY);
    if (draft?.trim()) {
      const id = newNoteId();
      notes.push({ id, text: draft, createdAt: Date.now(), updatedAt: Date.now() });
      activeId = id;
    }
  } catch {}

  try {
    const snapRaw = localStorage.getItem(SNAPSHOT_KEY);
    if (snapRaw) {
      const snap = JSON.parse(snapRaw);
      if (snap?.text?.trim()) {
        const id = newNoteId();
        notes.push({
          id,
          text: snap.text,
          createdAt: snap.savedAt || Date.now(),
          updatedAt: snap.savedAt || Date.now(),
        });
        if (!activeId) activeId = id;
      }
    }
  } catch {}

  if (!notes.length) {
    const id = newNoteId();
    notes.push({ id, text: EXAMPLE, createdAt: Date.now(), updatedAt: Date.now() });
    activeId = id;
  }

  if (!activeId) activeId = notes[0].id;
  notes.forEach((n) => {
    if (!n.images) n.images = {};
  });
  return { activeId, notes };
}

function getActiveNote() {
  return library.notes.find((n) => n.id === library.activeId);
}

function flushActiveNote() {
  const note = getActiveNote();
  const ta = $('#writingInput');
  if (!note || !ta) return;
  note.text = ta.value;
  note.updatedAt = Date.now();
}

function resetEditorHistory(text) {
  history.stack = [text];
  history.index = 0;
  history.locking = false;
  updateUndoButtons();
}

function renderNotesList() {
  const list = $('#notesList');
  if (!list) return;

  const sorted = [...library.notes].sort((a, b) => b.updatedAt - a.updatedAt);
  list.innerHTML = sorted.map((n) => {
    const title = esc(noteTitle(n.text));
    const preview = esc(notePreview(n.text));
    const words = analyzeText(n.text).cleanWords;
    const when = formatNoteWhen(n.updatedAt);
    const active = n.id === library.activeId ? ' active' : '';
    return `<button type="button" class="note-item${active}" data-id="${esc(n.id)}">
      <span class="note-item-title">${title}</span>
      <span class="note-item-preview">${preview}</span>
      <span class="note-item-meta">${words}w · ${esc(when)}</span>
    </button>`;
  }).join('');

  list.querySelectorAll('.note-item').forEach((btn) => {
    btn.addEventListener('click', () => switchNote(btn.dataset.id));
  });
}

function scheduleNotesListRender() {
  clearTimeout(listRenderTimer);
  listRenderTimer = setTimeout(renderNotesList, 350);
}

function switchNote(id) {
  if (!id || id === library.activeId) return;
  flushActiveNote();
  persistLibrary();

  library.activeId = id;
  const note = getActiveNote();
  const ta = $('#writingInput');
  history.locking = true;
  ta.value = note?.text ?? '';
  history.locking = false;
  resetEditorHistory(ta.value);
  persistLibrary();
  renderNotesList();
  refresh({ skipFlush: true });
}

function createNote(initialText) {
  flushActiveNote();
  const id = newNoteId();
  const text = initialText ?? '# New note\n\n';
  library.notes.unshift({
    id,
    text,
    images: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  library.activeId = id;

  const ta = $('#writingInput');
  ta.value = text;
  resetEditorHistory(text);
  persistLibrary();
  renderNotesList();
  refresh({ skipFlush: true });
  ta.focus();
  showToast('New note');
}

function duplicateActiveNote() {
  flushActiveNote();
  const src = getActiveNote();
  if (!src) return;
  const id = newNoteId();
  library.notes.unshift({
    id,
    text: src.text,
    images: { ...(src.images || {}) },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  library.activeId = id;
  const ta = $('#writingInput');
  ta.value = src.text;
  resetEditorHistory(src.text);
  persistLibrary();
  renderNotesList();
  refresh({ skipFlush: true });
  showToast('Duplicated note');
}

function deleteActiveNote() {
  const id = library.activeId;
  const title = noteTitle(getActiveNote()?.text || '');

  if (library.notes.length <= 1) {
    if (!confirm('Clear this note and start fresh?')) return;
    const only = getActiveNote();
    if (only) {
      only.text = '# New note\n\n';
      only.updatedAt = Date.now();
      const ta = $('#writingInput');
      ta.value = only.text;
      resetEditorHistory(only.text);
      persistLibrary();
      renderNotesList();
      refresh({ skipFlush: true });
    }
    return;
  }

  if (!confirm(`Delete "${title}"?`)) return;

  flushActiveNote();
  library.notes = library.notes.filter((n) => n.id !== id);
  library.activeId = library.notes[0].id;

  const ta = $('#writingInput');
  ta.value = library.notes[0].text;
  resetEditorHistory(ta.value);
  persistLibrary();
  renderNotesList();
  refresh({ skipFlush: true });
  showToast('Note deleted');
}

/* ---- Main ---- */
function setView(view) {
  state.view = view;
  document.querySelectorAll('.view-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.view === view);
  });
  refreshPreview();
}

function setFontScale(val) {
  state.fontScale = val;
  document.documentElement.style.setProperty('--write-size', val);
  try { localStorage.setItem(STORAGE_KEY + '.scale', val); } catch {}
}

function refreshPreview() {
  const raw = $('#writingInput').value;
  const mode = state.view === 'read' ? 'read' : state.view === 'changes' ? 'changes' : 'draft';
  const images = getActiveNote()?.images || {};
  $('#preview').innerHTML = renderDocument(raw, mode, images);
}

function refresh(opts = {}) {
  if (!opts.skipFlush) {
    flushActiveNote();
    persistLibrary();
    scheduleNotesListRender();
  }
  updateStats();
  refreshPreview();
}

let editTimer;
function onEdit() {
  clearTimeout(editTimer);
  editTimer = setTimeout(() => {
    pushHistory($('#writingInput').value);
    refresh();
  }, 400);
}

function init() {
  initTheme();

  library = loadLibrary();
  persistLibrary();

  const ta = $('#writingInput');
  const active = getActiveNote();
  ta.value = active?.text ?? EXAMPLE;

  pushHistory(ta.value);
  history.locking = false;
  renderNotesList();

  const scale = localStorage.getItem(STORAGE_KEY + '.scale');
  if (scale) {
    $('#fontScale').value = scale;
    setFontScale(parseFloat(scale) || 1);
  }

  ta.addEventListener('input', onEdit);
  ta.addEventListener('select', updateCopyAiButton);
  ta.addEventListener('keyup', updateCopyAiButton);
  ta.addEventListener('mouseup', updateCopyAiButton);

  ta.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
    }
    if (mod && (e.key === 'Z' || (e.key === 'z' && e.shiftKey))) {
      e.preventDefault();
      redo();
    }
    if (mod && e.key === 's') {
      e.preventDefault();
      flushActiveNote();
      persistLibrary();
      renderNotesList();
      showToast('Note saved');
    }
    if (mod && e.shiftKey && (e.key === 'c' || e.key === 'C')) {
      e.preventDefault();
      copyForAi();
    }
  });

  $('#fontScale').addEventListener('input', (e) => setFontScale(e.target.value));

  document.querySelectorAll('.view-tab').forEach(tab => {
    tab.addEventListener('click', () => setView(tab.dataset.view));
  });

  $('#undoBtn').addEventListener('click', undo);
  $('#redoBtn').addEventListener('click', redo);
  $('#strikeBtn').addEventListener('click', strikeSelection);
  $('#insertBtn').addEventListener('click', insertMark);
  $('#noteBtn').addEventListener('click', noteSelection);
  $('#imageBtn').addEventListener('click', insertImage);

  $('#copyAiBtn').addEventListener('click', copyForAi);
  $('#copyAiPreviewBtn')?.addEventListener('click', () => {
    const { text, scope } = getEditorSlice();
    openCopyModal(buildAiExport(text), scope);
  });
  $('#copyCleanBtn').addEventListener('click', () => {
    const { text } = getEditorSlice();
    copyText(buildPlainClean(text));
  });
  $('#copyModalCopy').addEventListener('click', () => copyText($('#copyPreview').value));
  $('#copyModalClose').addEventListener('click', closeCopyModal);
  $('#copyModal').addEventListener('click', (e) => {
    if (e.target.id === 'copyModal') closeCopyModal();
  });

  $('#loadExample').addEventListener('click', () => {
    ta.value = EXAMPLE;
    pushHistory(ta.value);
    refresh();
  });

  $('#clearBtn').addEventListener('click', () => {
    if (confirm('Clear this note?')) {
      ta.value = '# New note\n\n';
      pushHistory(ta.value);
      refresh();
    }
  });

  $('#newNoteBtn').addEventListener('click', () => createNote());
  $('#dupNoteBtn').addEventListener('click', duplicateActiveNote);
  $('#delNoteBtn').addEventListener('click', deleteActiveNote);

  updateCopyAiButton();
  refresh({ skipFlush: true });
}

document.addEventListener('DOMContentLoaded', init);
