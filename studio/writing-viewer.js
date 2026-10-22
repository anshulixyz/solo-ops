/* Writing Viewer — markdown + track changes + undo + word count + notes library.
   Storage: `marathon.writing` → { activeId, notes:[{id,text,images,files,createdAt,updatedAt}] }
   Mirrors to data/writing.json via core/sync.js. Theme lives in core/theme.js. */

const STORAGE_KEY = 'marathon.writingViewer';          // legacy single draft (migrate only)
const LIBRARY_KEY = Config.key('writing');
const LEGACY_LIBRARY_KEY = 'marathon.writingViewer.library';
const SNAPSHOT_KEY = 'marathon.writingViewer.snapshot'; // legacy migrate only
const SCALE_KEY = 'marathon.writing.scale';
let fresh = false;

const $ = (sel) => document.querySelector(sel);

let state = {
  view: 'draft', // draft | read | changes
  fontScale: 1,
  showNotes: true,
};

const history = { stack: [], index: -1, max: 80, locking: false };

/** @type {{ activeId: string, notes: { id: string, text: string, createdAt: number, updatedAt: number }[] }} */
let library = { activeId: '', notes: [] };
let wantedOpen = '';   // ?open=<id> waiting for the file

let listRenderTimer;

const EXAMPLE = MARATHON_TEMPLATES.NOTE;

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

// An image's original reaches data/attachments/ after the draft has changed: when its upload finishes, or (no server,
// no linked folder) when core/attach.js writes it from this browser once a connection appears, often on another page.
// Link it to the draft as the page holds it now: a file pull or a pasted reply may have replaced the drafts meanwhile.
let pulledOnce = false;   // links found on their own wait for the file: one made on an older browser copy would be written over a newer file
let fileErrors = 0, fileErrorsAtPull = 0;   // a pull that hit an error on this page's file left the copy here as old as it was
const safeName = (s) => (window.Attach && Attach.safe ? Attach.safe(String(s)) : String(s));   // attachment names are made this way
function linkOriginal(name, rel) {
  const m = /^note-(.+)-(\d+)\.[^.]+$/.exec(safeName(name || ''));
  const src = m && rel ? library.notes.find((x) => safeName(x.id) === m[1]) : null;
  const img = src && (src.images || {})[m[2]];
  if (!img) return 0;   // not a draft's image, or one this draft does not have
  let linked = 0;
  library.notes.forEach((x) => {   // the draft, and a copy Duplicate made while the original was still waiting (the same image)
    if ((x.images || {})[m[2]] !== img || (x.files && typeof x.files === 'object' && x.files[m[2]])) return;   // an existing link stays
    if (!x.files || typeof x.files !== 'object') x.files = {};
    x.files[m[2]] = rel; linked++;
  });
  return linked ? `image ${m[2]} in "${noteTitle(src.text || '')}"` : '';   // for the change log
}
function linkSavedOriginals() {
  if (!pulledOnce || !window.Attach || !Attach.saved) return;
  const want = {};   // note-<id>-<n>. for each image without a link: only those are looked up
  library.notes.forEach((x) => Object.keys(x.images || {}).forEach((k) => { if (!(x.files && typeof x.files === 'object' && x.files[k])) want[safeName(`note-${x.id}-${k}`) + '.'] = 1; }));
  if (!Object.keys(want).length) return;
  Attach.saved((name) => want[name.slice(0, name.lastIndexOf('.') + 1)]).then((list) => {
    const done = list.map((x) => linkOriginal(x.name, x.file)).filter(Boolean);
    if (!done.length) return;
    if (window.Sync && Sync.note) Sync.note(Config.file('writing'), `linked the original${done.length > 1 ? 's' : ''} of ${done.join(', ')}`);   // one line for the save that carries them
    persistLibrary();
  });
}
let freshTimer;
function pullThenLink() {   // polls pause while the tab is hidden, so the copy here can be older than the file: pull first, then link
  clearTimeout(freshTimer);
  freshTimer = setTimeout(() => {
    if (!pulledOnce || !window.Sync || !Sync.pullAll || !(Sync.attachmentsAvailable && Sync.attachmentsAvailable())) return;
    const before = fileErrors;
    Sync.pullAll(false).then(() => { if (fileErrors === before) linkSavedOriginals(); });
  }, 300);
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
      const original = reader.result;
      note.images[String(n)] = original;
      const id = note.id;
      const finish = () => {
        if (!window.Attach) return;
        const name = `note-${id}-${n}.${Attach.ext(original, file.name)}`;
        Attach.thumb(original).then((t) => {
          const now = library.notes.find((x) => x.id === id);   // the draft as it is now, not the one the upload started from
          if (t && t !== original && now && now.images && now.images[String(n)] === original) { now.images[String(n)] = t; try { persistLibrary(); } catch {} }
          return Attach.put(name, original);
        }).then((r) => { if (r && r.file && linkOriginal(name, r.file)) { try { persistLibrary(); } catch {} } });   // part of the user's own edit: no log line of its own
      };
      finish();
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

function persistLibrary(opts) {
  try {
    Store.setJSON(LIBRARY_KEY, library, opts);
  } catch {
    showToast('Save failed — try removing large images');
  }
}

function normalizeLibrary(data) {
  const notes = (data && Array.isArray(data.notes) ? data.notes : []).filter((n) => n && typeof n === 'object' && !Array.isArray(n)).map((n) => ({
    ...n,   // what this page does not own rides along: files (the originals in data/attachments/), anything the CLI or an agent adds
    id: n.id || newNoteId(), text: n.text || '', images: n.images || {},
    createdAt: n.createdAt || Date.now(), updatedAt: n.updatedAt || Date.now(),
  }));
  let activeId = data && data.activeId;
  if (!notes.some((n) => n.id === activeId)) activeId = notes[0] ? notes[0].id : '';
  return { activeId, notes };
}

function loadLibrary() {
  if (LIBRARY_KEY === 'marathon.writing') Store.migrate(LEGACY_LIBRARY_KEY, LIBRARY_KEY);
  try {
    const data = Store.getJSON(LIBRARY_KEY, null);
    if (data && Array.isArray(data.notes)) return normalizeLibrary(data);   // empty is a choice, not "fresh"
  } catch {}

  const notes = [];
  let activeId = null;

  try {
    const draft = Store.get(STORAGE_KEY);
    if (draft?.trim()) {
      const id = newNoteId();
      notes.push({ id, text: draft, createdAt: Date.now(), updatedAt: Date.now() });
      activeId = id;
    }
  } catch {}

  try {
    const snapRaw = Store.get(SNAPSHOT_KEY);
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
    fresh = true;   // a first open starts with no notes; Example (and the sample project) show the markup
    return { activeId: '', notes: [] };
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
  let note = getActiveNote();
  const ta = $('#writingInput');
  if (!ta) return;
  if (!note) {   // typing with no note open starts one, so nothing typed is lost
    if (!ta.value.trim()) return;
    note = { id: newNoteId(), text: '', images: {}, createdAt: Date.now(), updatedAt: Date.now() };
    library.notes.unshift(note); library.activeId = note.id;
  }
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
  list.innerHTML = (window.Story && Story.suggestionsHtml ? Story.suggestionsHtml('note') : '') + sorted.map((n) => {
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
  const copy = {
    id,
    text: src.text,
    images: { ...(src.images || {}) },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  if (src.files && typeof src.files === 'object') copy.files = { ...src.files };   // the same originals on disk: the copy's [Image uploaded n] still finds them
  library.notes.unshift(copy);
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
  Store.set(SCALE_KEY, String(val), { silent: true });
}

function refreshPreview() {
  const raw = $('#writingInput').value;
  const mode = state.view === 'read' ? 'read' : state.view === 'changes' ? 'changes' : 'draft';
  const images = getActiveNote()?.images || {};
  const slot = $('#storySlot'); if (slot) slot.innerHTML = window.Story && Story.taskLine && library.activeId ? Story.taskLine('note', library.activeId) : '';   // "Task: …" with its pills, or "Connect with a task…", in the toolbar
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

/* ---- Sync + palette ---- */
// A pasted reply (Guide → Reply, core/apply.js) writes the browser copy directly. Take it before the file write
// (400 ms later) reads this page's library, or the old text goes back to the file. The Guide calls this after Apply.
window.refreshNotes = function () {
  const saved = Store.getJSON(LIBRARY_KEY, null); if (!saved || !Array.isArray(saved.notes)) return;
  library = normalizeLibrary(saved);
  const n = getActiveNote(); const ta = $('#writingInput');
  if (!n) { ta.value = ''; resetEditorHistory(''); } else if (ta.value !== n.text) { ta.value = n.text; resetEditorHistory(n.text); }
  renderNotesList(); refresh({ skipFlush: true });
};
function registerSync() {
  Sync.register({
    file: Config.file('writing'), key: LIBRARY_KEY, label: 'notes', isFresh: () => Store.isFresh(LIBRARY_KEY),   // the shared flag only: cleared by the first real write
    read: () => ({ activeId: library.activeId, notes: library.notes }),
    apply: (body) => {
      const incoming = normalizeLibrary(body);
      const before = getActiveNote();
      library = incoming;
      if (before && library.notes.some((n) => n.id === before.id)) library.activeId = before.id;
      if (wantedOpen && library.notes.some((n) => n.id === wantedOpen)) { library.activeId = wantedOpen; wantedOpen = ''; }
      persistLibrary({ silent: true });   // the browser copy must follow the file, or a reload brings the old notes back
      const n = getActiveNote();
      const ta = $('#writingInput');
      if (!n) { ta.value = ''; resetEditorHistory(''); } else if (ta.value !== n.text) { ta.value = n.text; resetEditorHistory(n.text); }
      renderNotesList(); refresh({ skipFlush: true }); showToast('Notes updated from data/' + Config.file('writing'));
    }
  });
}
function registerPalette() {
  Palette.init({ root: '../' });
  Palette.register([
    { label: 'New note', hint: 'note', keywords: 'add create', run: () => createNote() },
    { label: 'Duplicate note', hint: 'note', run: duplicateActiveNote },
    { label: 'Delete note', hint: 'note', keywords: 'remove', run: deleteActiveNote },
    { label: 'Open note', prefix: 'find', hint: 'find <title>', keywords: 'search switch', run: (q) => {
      const l = q.toLowerCase(); const m = library.notes.filter((n) => noteTitle(n.text).toLowerCase().includes(l));
      if (m.length === 1) switchNote(m[0].id); else showToast(m.length ? 'Several notes match — be more specific' : 'No note matches');
    } },
    { label: 'Load example note', hint: 'note', run: () => createNote(EXAMPLE) },
    { label: 'Copy for AI (with markup)', hint: 'export', keywords: 'clipboard agent', run: copyForAi },
    { label: 'Copy clean text', hint: 'export', keywords: 'clipboard final', run: () => copyText(buildPlainClean(getEditorSlice().text)) },
    { label: 'View: draft', hint: 'view', run: () => setView('draft') },
    { label: 'View: read', hint: 'view', run: () => setView('read') },
    { label: 'View: changes', hint: 'view', run: () => setView('changes') },
    { label: 'Undo', hint: 'edit', run: undo }, { label: 'Redo', hint: 'edit', run: redo },
    { label: 'Print', hint: 'export', run: () => window.print() },
    { label: 'Go to script viewer', hint: 'nav', run: () => { location.href = 'script-viewer.html?ws=' + encodeURIComponent(Config.activeWs()); } }
  ]);
}

function init() {
  Config.applyDOM();
  library = loadLibrary();
  if (fresh) library = Store.firstOpen(LIBRARY_KEY, library, () => normalizeLibrary(MARATHON_TEMPLATES.writing(new Date())));   // blank, or the sample when core/templates.js says so
  const wanted = window.Story && Story.openParam ? Story.openParam() : '';   // ?open=<id>: a link from another page
  if (wanted && library.notes.some((n) => n.id === wanted)) library.activeId = wanted; else if (wanted) wantedOpen = wanted;   // not in the browser copy yet: after the first pull
  if (fresh) Store.setJSON(LIBRARY_KEY, library, { silent: true }); else persistLibrary({ silent: true });   // a silent write keeps the first-open flag
  if (window.Story && Story.onWrite) Story.onWrite(() => refreshPreview());

  const ta = $('#writingInput');
  const active = getActiveNote();
  ta.value = active ? active.text : '';   // no note yet: the placeholder explains the markup; Example loads one

  pushHistory(ta.value);
  history.locking = false;
  renderNotesList();

  const scale = Store.get(SCALE_KEY) || Store.get(STORAGE_KEY + '.scale');
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
  registerSync();
  registerPalette();
  if (window.Attach && Attach.onFlushed) Attach.onFlushed(pullThenLink);   // an original reached the disk (flush marks it before it says so, so the look-up finds it)
  if (window.Sync && Sync.on) Sync.on((evt, d) => {
    if (evt === 'error' && d && d.file === Config.file('writing')) fileErrors++;
    if (evt === 'pulled' || evt === 'linked') { const clean = fileErrors === fileErrorsAtPull; fileErrorsAtPull = fileErrors; if (clean) { pulledOnce = true; linkSavedOriginals(); } }
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') pullThenLink(); });   // another tab may have written an original meanwhile

}

document.addEventListener('DOMContentLoaded', init);
