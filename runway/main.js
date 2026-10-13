/* =========================================================================
   main.js — wiring & UI state
   Holds ephemeral UI state (current view, filters, which notes are open),
   defines the global handlers referenced by the markup, and owns drag & drop,
   import/export, sync registration, palette commands, shortcuts, and init.
   Theme lives in core/theme.js (global toggleTheme), sync in core/sync.js.
   ========================================================================= */
(function (global) {
  'use strict';

  var view = 'board';
  var selectedProjects = new Set(); // empty means all; selected projects match with OR
  var selectedTags = new Set();     // empty means all; selected tags match with OR
  var notesOpen = new Set();        // task ids whose notes panel is expanded
  var whenOpen = null;              // task id whose date popover is open

  // Add-panel tag picker state
  var pickerTags = Model.KNOWN_TAGS.slice();  // options shown as toggle chips
  var newTags = new Set();                    // selected for the next task

  /* single render entry point: re-render + rebind drag handlers */
  function taskMatchesFilters(t) {
    var projectMatch = selectedProjects.size === 0 || selectedProjects.has(t.proj);
    var tagMatch = selectedTags.size === 0 || (t.tags || []).some(function (tag) { return selectedTags.has(tag); });
    return projectMatch && tagMatch;
  }
  function filteredTasks() { return Model.getState().filter(taskMatchesFilters); }
  function render() {
    View.render(view, filteredTasks(), selectedProjects, selectedTags, notesOpen, whenOpen);
    bindDrag();
    updateCollapseAllLabel();
  }
  function fullRefresh() {
    selectedProjects.clear(); selectedTags.clear(); notesOpen.clear();
    renderProjectSelect(); renderTagDatalist(); render();
  }

  /* ---- view / filter / add panel ------------------------------------- */
  global.setView = function (v) {
    view = v;
    document.querySelectorAll('.tab').forEach(function (t) { t.classList.toggle('active', t.dataset.view === v); });
    document.getElementById('boardView').style.display = v === 'board' ? '' : 'none';
    document.getElementById('laterView').style.display = v === 'later' ? '' : 'none';
    document.getElementById('bucketView').style.display = v === 'bucket' ? '' : 'none';
    render();
  };
  global.setFilter = function (f) {
    if (f === 'all') selectedProjects.clear();
    else if (selectedProjects.has(f)) selectedProjects.delete(f);
    else selectedProjects.add(f);
    render();
  };
  global.setTagFilter = function (t) {
    if (t === 'all') selectedTags.clear();
    else if (selectedTags.has(t)) selectedTags.delete(t);
    else selectedTags.add(t);
    render();
  };
  global.toggleAdd = function (focus) {
    var p = document.getElementById('addpanel');
    p.classList.toggle('open');
    if (p.classList.contains('open') && focus !== false) document.getElementById('newTitle').focus();
  };

  /* ---- projects (add-panel select + add-new) ------------------------- */
  function escAttr(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function renderProjectSelect() {
    var sel = document.getElementById('newProj');
    if (!sel) return;
    var cur = sel.value;
    sel.innerHTML = Model.getProjects().map(function (p) { return '<option value="' + escAttr(p) + '">' + escAttr(p) + '</option>'; }).join('');
    if (cur) sel.value = cur;
  }
  function renderTagDatalist() {
    var dl = document.getElementById('tagOptions');
    if (!dl) return;
    var set = {};
    Model.KNOWN_TAGS.forEach(function (t) { set[t] = 1; });
    Model.getState().forEach(function (t) { (t.tags || []).forEach(function (x) { set[x] = 1; }); });
    dl.innerHTML = Object.keys(set).sort().map(function (t) { return '<option value="' + escAttr(t) + '"></option>'; }).join('');
  }
  global.addNewProject = function (input) {
    var name = Model.addProject(input.value);
    input.value = '';
    if (!name) return;
    renderProjectSelect();
    document.getElementById('newProj').value = name;
    View.renderFilters(selectedProjects);
    flash('Project "' + name + '" added.');
  };

  /* ---- add-panel tag picker ------------------------------------------ */
  function renderTagPicker() {
    var el = document.getElementById('newTagPick');
    if (!el) return;
    el.innerHTML = pickerTags.map(function (tag) {
      return '<button type="button" class="tp-chip hue ' + (newTags.has(tag) ? 'sel' : '') + '" ' +
        'style="--h:' + View.hueFor(tag) + '" onclick="toggleNewTag(\'' + escAttr(tag) + '\')">' + escAttr(tag) + '</button>';
    }).join('');
  }
  global.toggleNewTag = function (tag) {
    if (newTags.has(tag)) newTags.delete(tag); else newTags.add(tag);
    renderTagPicker();
  };
  global.addCustomNewTag = function (input) {
    var v = (input.value || '').trim().toLowerCase();
    if (!v) return;
    if (pickerTags.indexOf(v) === -1) pickerTags.push(v);
    newTags.add(v);
    input.value = '';
    renderTagPicker();
  };

  /* ---- task CRUD ----------------------------------------------------- */
  function createTask(t) {
    var task = Model.add({
      id: Model.newId(), title: t.title, proj: t.proj || Model.getProjects()[0], pri: t.pri || 'medium',
      col: t.col || 'todo', tags: t.tags || [], desc: t.desc || '', notes: '', collapsed: true, checklist: [],
      at: t.at || '', until: t.until || '', due: t.due || ''
    });
    if ((task.tags || []).indexOf('meeting') >= 0 && !task.at) flash('Meeting without a time. Click + date on the card, or write it like "tomorrow 15:00".');
    var targetView = task.col === 'later' ? 'later' : (task.col === 'bucket' ? 'bucket' : 'board');
    renderTagDatalist();
    if (targetView !== view) setView(targetView); else render();
    return task;
  }
  // the When field, or a date at the end of the title → at / until / due
  function whenFromInputs(title) {
    var out = { title: title, at: '', until: '', due: '' }; if (!window.When) return out;
    var ex = When.extract(title); if (ex.at || ex.due) out = ex;
    var wEl = document.getElementById('newWhen'); var w = wEl ? wEl.value.trim() : '';
    if (w) { var isDue = /^(due|by)\s+/i.test(w); var ex2 = When.extract('x ' + (isDue ? w : 'at ' + w)); if (ex2.at || ex2.due) { out.at = ex2.at || out.at; out.until = ex2.until || out.until; out.due = ex2.due || out.due; } else { var p = When.parse(w); if (p) { if (isDue) out.due = When.dayKey(p.stamp); else out.at = p.stamp; } else flash('Could not read "' + w + '" as a date. Try "tomorrow 14:00" or "due fri".'); } }
    return out;
  }
  global.addTask = function () {
    var title = document.getElementById('newTitle').value.trim();
    if (!title) return;
    var wh = whenFromInputs(title);
    createTask({
      title: wh.title,
      proj: document.getElementById('newProj').value,
      pri: document.getElementById('newPri').value,
      col: document.getElementById('newCol').value,
      tags: Array.from(newTags),
      at: wh.at, until: wh.until, due: wh.due
    });
    document.getElementById('newTitle').value = ''; var wIn = document.getElementById('newWhen'); if (wIn) wIn.value = '';
    newTags.clear();
    pickerTags = Model.KNOWN_TAGS.slice();
    renderTagPicker();
  };
  global.setPri = function (id, val) { Model.setPri(id, val); render(); };
  global.delTask = function (id) { Model.del(id); notesOpen.delete(id); if (whenOpen === id) whenOpen = null; render(); };
  /* ---- date popover on a card: when · until · due · meeting ---- */
  global.toggleWhen = function (id) { whenOpen = whenOpen === id ? null : id; if (whenOpen) { var t = Model.getState().find(function (x) { return x.id === id; }); if (t && t.collapsed) Model.update(id, { collapsed: false }); } render(); if (whenOpen) { var f = document.querySelector('.card[data-id="' + id + '"] .when-form input'); if (f) f.focus(); } };
  global.saveWhen = function (id, form) {
    var t = Model.getState().find(function (x) { return x.id === id; }); if (!t || !window.When) return false;
    var whenTxt = form.when.value.trim(), untilTxt = form.until.value.trim(), dueTxt = form.due.value.trim(); var patch = { at: '', until: '', due: '' };
    if (whenTxt) { var p = When.parse(whenTxt); if (!p) { flash('Could not read "' + whenTxt + '". Try "tomorrow 14:00" or "fri 10:00".'); return false; } patch.at = p.stamp; if (untilTxt) { patch.until = When.until(patch.at, untilTxt); if (!patch.until) { flash('The end time is before the start.'); return false; } } }
    if (dueTxt) { var d = When.parse(dueTxt); if (!d) { flash('Could not read the deadline "' + dueTxt + '".'); return false; } patch.due = When.dayKey(d.stamp); }
    var tags = (t.tags || []).slice(); var isM = tags.indexOf('meeting') >= 0; if (form.meeting.checked && !isM) tags.push('meeting'); if (!form.meeting.checked && isM) tags = tags.filter(function (x) { return x !== 'meeting'; }); patch.tags = tags;
    Model.update(id, patch); whenOpen = null; render(); flash(patch.at || patch.due ? 'Dated: ' + t.title : 'Date removed: ' + t.title); return false;
  };
  global.clearWhen = function (id) { var t = Model.getState().find(function (x) { return x.id === id; }); if (!t) return; Model.update(id, { at: '', until: '', due: '' }); whenOpen = null; render(); flash('Date removed: ' + t.title); };
  global.move = function (id, dir) { Model.move(id, dir); render(); };
  global.sendToBoard = function (id) { Model.moveTo(id, 'todo'); render(); flash('Moved to To Do.'); };
  global.sendToLater = function (id) { Model.moveTo(id, 'later'); render(); flash('Moved to Later.'); };
  global.sendToBucket = function (id) { Model.moveTo(id, 'bucket'); render(); flash('Moved to Bucket List.'); };

  /* ---- checklist ----------------------------------------------------- */
  global.toggleStep = function (id, idx) { Model.toggleStep(id, idx); render(); };
  global.addStep = function (id, text) { Model.addStep(id, text); render(); };
  global.delStep = function (id, idx) { Model.delStep(id, idx); render(); };

  /* ---- tags ---------------------------------------------------------- */
  global.addTagFromInput = function (id, input) { Model.addTag(id, input.value); input.value = ''; renderTagDatalist(); render(); };
  global.removeTag = function (id, tag) { Model.removeTag(id, tag); render(); };

  /* ---- collapse / expand --------------------------------------------- */
  global.toggleCollapse = function (id) { Model.toggleCollapse(id); render(); };
  global.toggleCollapseAll = function () {
    var anyExpanded = Model.getState().some(function (t) { return !t.collapsed; });
    Model.setCollapsedAll(anyExpanded);
    render();
  };
  function updateCollapseAllLabel() {
    var anyExpanded = Model.getState().some(function (t) { return !t.collapsed; });
    var btn = document.getElementById('collapseAllBtn');
    if (btn) btn.textContent = anyExpanded ? 'Collapse all' : 'Expand all';
  }

  /* ---- notes --------------------------------------------------------- */
  global.toggleNotes = function (id) {
    var t = Model.getState().find(function (x) { return x.id === id; });
    if (t && t.collapsed) Model.toggleCollapse(id);
    if (notesOpen.has(id)) notesOpen.delete(id); else notesOpen.add(id);
    render();
    if (notesOpen.has(id)) {
      var el = document.querySelector('.card[data-id="' + id + '"] .notes-panel textarea');
      if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    }
  };
  // silent save — no re-render, so the textarea keeps focus while typing
  global.onNotesInput = function (id, ta) {
    Model.setNotes(id, ta.value);
    var btn = ta.closest('.card').querySelector('.notes-btn');
    if (btn) btn.classList.toggle('has-notes', !!ta.value.trim());
  };

  /* ---- template / import / export ------------------------------------ */
  function timestamp() { return new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-'); }
  // data/exports/ when the server runs or the folder is linked, a download otherwise (core/sync.js)
  function downloadFile(content, filename, mimeType) {
    if (global.Sync && Sync.saveFile) return Sync.saveFile(filename, content, mimeType);
    var blob = new Blob([content], { type: mimeType });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    return Promise.resolve({ where: 'download', path: filename, text: 'Downloaded ' + filename });
  }
  // The file format is the same wrapper data/runway.json uses, so a saved
  // file can be dropped straight into data/ for the CLI and agents.
  function boardFile() {
    return { version: 1, updatedAt: new Date().toISOString(), projects: Model.getCustomProjects(), tasks: Model.getState() };
  }
  function downloadBoard() {
    return downloadFile(JSON.stringify(boardFile(), null, 2) + '\n', Model.BOARD + '-' + timestamp() + '.json', 'application/json');
  }

  function mdInline(value) {
    return String(value == null ? '' : value).replace(/\\/g, '\\\\').replace(/\r?\n/g, ' ').replace(/([`*_[\]<>#])/g, '\\$1');
  }
  function mdBlock(value) {
    var text = String(value == null ? '' : value).trim();
    if (!text) return '_None._';
    return text.split(/\r?\n/).map(function (line) { return '> ' + mdInline(line); }).join('\n');
  }
  function statusLabel(col) {
    return { todo: 'To Do', doing: 'Doing', done: 'Done', later: 'Later', bucket: 'Bucket List' }[col] || col;
  }
  function taskMarkdown(t) {
    var done = (t.checklist || []).filter(function (item) { return item.done; }).length;
    var total = (t.checklist || []).length;
    var pct = total ? Math.round(done / total * 100) : 0;
    var lines = [
      '### ' + mdInline(t.title), '',
      '- **Status:** ' + mdInline(statusLabel(t.col)),
      '- **Project:** ' + mdInline(t.proj || 'general'),
      '- **Priority:** ' + mdInline(t.pri || 'medium'),
      '- **Tags:** ' + ((t.tags || []).length ? t.tags.map(function (tag) { return '`' + mdInline(tag) + '`'; }).join(', ') : 'None'),
      '- **Checklist progress:** ' + done + '/' + total + ' (' + pct + '%)',
      '- **Task ID:** `' + mdInline(t.id) + '`', '',
      '**Description**', '', mdBlock(t.desc), '', '**Checklist**', ''
    ];
    if (total) t.checklist.forEach(function (item) { lines.push('- [' + (item.done ? 'x' : ' ') + '] ' + mdInline(item.text)); });
    else lines.push('_No checklist items._');
    lines.push('', '**Notes**', '', mdBlock(t.notes), '');
    return lines.join('\n');
  }
  global.exportMarkdown = function () {
    var allowed = view === 'board' ? ['todo', 'doing'] : [view === 'bucket' ? 'bucket' : 'later'];
    var tasks = filteredTasks().filter(function (t) { return allowed.indexOf(t.col) !== -1 && t.col !== 'done'; });
    if (!tasks.length) { flash('No visible non-Done tasks to export.'); return; }
    tasks.sort(function (a, b) {
      var colDiff = allowed.indexOf(a.col) - allowed.indexOf(b.col);
      return colDiff || (Model.PRI_RANK[a.pri] || 0) - (Model.PRI_RANK[b.pri] || 0);
    });
    var sections = [];
    allowed.forEach(function (col) {
      var group = tasks.filter(function (t) { return t.col === col; });
      if (group.length) sections.push('## ' + statusLabel(col) + '\n\n' + group.map(taskMarkdown).join('\n'));
    });
    var viewLabel = view === 'board' ? 'Board' : statusLabel(view);
    var markdown = [
      '# ' + Model.board().title + ' export', '',
      '- **Exported:** ' + new Date().toISOString(),
      '- **View:** ' + viewLabel,
      '- **Projects:** ' + (selectedProjects.size ? Array.from(selectedProjects).map(mdInline).join(', ') : 'All'),
      '- **Tags:** ' + (selectedTags.size ? Array.from(selectedTags).map(mdInline).join(', ') : 'All'),
      '- **Tasks:** ' + tasks.length,
      '- **Done tasks:** Excluded', '',
      sections.join('\n')
    ].join('\n');
    downloadFile(markdown, 'runway-' + view + '-' + timestamp() + '.md', 'text/markdown;charset=utf-8').then(function (r) { flash('Exported ' + tasks.length + ' task' + (tasks.length === 1 ? '' : 's') + ' to Markdown — ' + r.text.charAt(0).toLowerCase() + r.text.slice(1) + '.'); });
  };
  global.exportState = function () { downloadBoard().then(function (r) { flash(r.where === 'disk' ? 'Board copy saved to ' + r.path + '.' : 'Board copy downloaded.'); }); };

  // Both are destructive (replace everything), so a backup downloads first.
  global.loadTemplate = function () {
    if (!confirm('Load the sample board?\n\nYour current board will be replaced. A backup file is downloaded first, so you can restore it any time with "Load file".')) return;
    downloadBoard();
    Model.reset(); fullRefresh();
    flash('Sample board loaded — your previous board was downloaded as a backup.');
  };
  global.clearBoard = function () {
    if (!confirm('Start with an empty board?\n\nA backup of the current board is downloaded first.')) return;
    downloadBoard();
    Model.clearAll(); fullRefresh();
    flash('Board cleared — backup downloaded.');
  };
  global.importState = function (input) {
    var file = input.files && input.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var parsed = JSON.parse(e.target.result);
        var data = Sync.unwrap(parsed, 'tasks');
        if (!Array.isArray(data.tasks) || !data.tasks.every(function (t) { return t && t.id && t.title; })) throw new Error('shape');
        if (!confirm('Replace your current board with this saved file?')) { input.value = ''; return; }
        Model.replaceAll(data.tasks);
        if (Array.isArray(data.projects)) Model.setCustomProjects(data.projects);
        fullRefresh();
        setView(Model.getState().some(function (t) { return t.col === 'todo' || t.col === 'doing' || t.col === 'done'; })
          ? 'board' : (Model.getState().some(function (t) { return t.col === 'later'; }) ? 'later' : 'bucket'));
        flash('Board loaded from file.');
      } catch (err) {
        alert("That file didn't look like a saved board. Pick a file you exported with Save file, or data/runway.json.");
      }
      input.value = '';
    };
    reader.readAsText(file);
  };

  function flash(msg) {
    if (global.Sync) Sync.note(Config.boardFile(Model.BOARD), msg);
    var n = document.getElementById('storeNote');
    var prev = n.dataset.base || n.textContent;
    n.dataset.base = prev;
    n.textContent = msg; n.style.color = 'var(--green)';
    clearTimeout(n._t);
    n._t = setTimeout(function () { n.textContent = n.dataset.base; n.style.color = ''; }, 2600);
  }
  function setBaseNote(msg) {
    var n = document.getElementById('storeNote');
    n.dataset.base = msg; if (!n._t) n.textContent = msg;
  }

  /* ---- drag & drop --------------------------------------------------- */
  var dragId = null;
  function bindDrag() {
    document.querySelectorAll('.card').forEach(function (c) {
      c.addEventListener('dragstart', function (e) {
        if (e.target.closest('select, button, input, textarea')) { e.preventDefault(); return; }
        dragId = c.dataset.id; c.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move';
      });
      c.addEventListener('dragend', function () { c.classList.remove('dragging'); });
    });
    document.querySelectorAll('.col').forEach(function (col) {
      col.ondragover = function (e) { e.preventDefault(); col.classList.add('drag-over'); };
      col.ondragleave = function () { col.classList.remove('drag-over'); };
      col.ondrop = function (e) {
        e.preventDefault(); col.classList.remove('drag-over');
        if (dragId) { Model.moveTo(dragId, col.dataset.col); render(); }
        dragId = null;
      };
    });
  }

  /* ---- boards: switcher + create / rename / delete ------------------- */
  function renderBoards() {
    var sel = document.getElementById('boardSwitch'); if (!sel) return;
    var all = Config.boards();
    sel.innerHTML = all.map(function (b) { return '<option value="' + escAttr(b.id) + '"' + (b.id === Model.BOARD ? ' selected' : '') + '>' + escAttr(b.title) + '</option>'; }).join('');
    sel.style.display = all.length > 1 ? '' : 'none';
    var del = document.getElementById('deleteBoardBtn'); if (del) del.style.display = all.length > 1 ? '' : 'none';
    var from = document.getElementById('newBoardFrom');
    if (from) from.innerHTML = '<option value="blank">Blank</option><option value="sample">Sample sprint</option>' +
      all.map(function (b) { return '<option value="copy:' + escAttr(b.id) + '">Copy of ' + escAttr(b.title) + '</option>'; }).join('');
    Config.applyDOM({ board: Model.board() });
  }
  global.switchBoard = function (id) { location.href = location.pathname + '?ws=' + encodeURIComponent(Config.activeWs()) + '&board=' + encodeURIComponent(id); };
  global.toggleBoardPanel = function () {
    var p = document.getElementById('boardPanel'); p.classList.toggle('open');
    if (p.classList.contains('open')) document.getElementById('newBoardTitle').focus();
  };
  global.createBoard = function () {
    var title = document.getElementById('newBoardTitle').value.trim();
    var from = document.getElementById('newBoardFrom').value;
    if (!title) { flash('Give the board a name.'); return; }
    var id = Config.slug(title);
    if (!id || Config.RESERVED.indexOf(id) >= 0) { flash('Pick a different name.'); return; }
    if (Config.board(id)) { flash('A board called "' + title + '" already exists.'); return; }
    var b = Config.addBoard({ id: id, title: title, sprintLabel: 'Progress', milestones: [], focus: [] });
    var tasks = [];
    if (from === 'sample') tasks = Model.seed();
    else if (from.indexOf('copy:') === 0) tasks = (Store.getJSON(Config.boardKey(from.slice(5)), []) || []).map(function (t) { return Object.assign({}, t, { id: Model.newId() }); });
    Store.setJSON(Config.boardKey(b.id), Model.normalize(tasks));
    switchBoard(b.id);
  };
  global.renameBoard = function () {
    var cur = Model.board(); var title = prompt('Rename this board', cur.title);
    if (!title || !title.trim()) return;
    Config.updateBoard(Model.BOARD, { title: title.trim() }); renderBoards(); flash('Renamed.');
  };
  global.deleteBoard = function () {
    var cur = Model.board();
    if (Config.boards().length < 2) { flash('Keep at least one board.'); return; }
    if (!confirm('Delete the board "' + cur.title + '" and all its tasks?\n\nA backup downloads first.')) return;
    downloadBoard();
    Config.removeBoard(Model.BOARD);
    Store.setJSON(Model.KEY, []);
    var next = Config.boards()[0];
    if (next) switchBoard(next.id); else location.href = '../index.html?ws=' + encodeURIComponent(Config.activeWs());
  };

  /* ---- sync: data/<board>.json --------------------------------------- */
  function registerSync() {
    Sync.register({
      file: Config.boardFile(Model.BOARD), keys: [Model.KEY, Model.PROJ_KEY], label: 'board', app: Model.BOARD, isFresh: Model.isFresh,
      read: function () { return { projects: Model.getCustomProjects(), tasks: Model.getState() }; },
      apply: function (body) {
        if (Array.isArray(body.tasks)) Model.replaceAll(body.tasks, { silent: true });
        if (Array.isArray(body.projects)) Model.setCustomProjects(body.projects, { silent: true });
        renderProjectSelect(); renderTagDatalist(); render();
      }
    });
    Sync.on(function (evt, d) {
      if (evt === 'applied' && d.file === Config.boardFile(Model.BOARD)) flash('Board updated from data/' + d.file + '.');
      if (evt === 'applied' && d.file === 'boards.json') renderBoards();
      if (evt === 'linked') flash('Folder linked — the board now writes data/' + Config.boardFile(Model.BOARD) + ' directly.');
      if (evt === 'error') console.warn('sync', d);
    });
  }

  /* ---- command palette + shortcuts ----------------------------------- */
  // "add Fix the header @launch #video !high" → task in To Do
  function parseAddArg(arg) {
    var t = { tags: [] };
    var title = arg.replace(/(^|\s)@(\S+)/g, function (_, sp, p) { t.proj = Model.addProject(p) || p; return sp; })
      .replace(/(^|\s)#(\S+)/g, function (_, sp, tag) { t.tags.push(tag.toLowerCase()); return sp; })
      .replace(/(^|\s)!(high|medium|med|low)\b/gi, function (_, sp, p) { t.pri = p.toLowerCase() === 'med' ? 'medium' : p.toLowerCase(); return sp; })
      .replace(/(^|\s)>(todo|doing|done|later|bucket)\b/gi, function (_, sp, c) { t.col = c.toLowerCase(); return sp; })
      .replace(/\s+/g, ' ').trim();
    if (window.When) { var ex = When.extract(title); if (ex.at || ex.due) { title = ex.title; t.at = ex.at; t.until = ex.until; t.due = ex.due; } }
    t.title = title;
    return t;
  }
  function pick(q, verb) {
    var m = Model.find(q);
    if (!m.length) { flash('No task matches "' + q + '".'); return null; }
    if (m.length > 1) {
      var exact = m.filter(function (t) { return t.title.toLowerCase() === q.toLowerCase(); });
      if (exact.length === 1) return exact[0];
      flash(m.length + ' tasks match "' + q + '" — be more specific.'); return null;
    }
    return m[0];
  }
  function registerPalette() {
    Palette.init({ root: '../' });
    Palette.register([
      { label: 'Set a time or deadline', prefix: 'at', hint: 'at <task> <when> · tomorrow 14:00 · fri 10:00 · due 2026-10-20 · clear', keywords: 'date schedule meeting due when', run: function (arg) {
        var toks = arg.trim().split(/\s+/); var q = null, when = null, isDue = false;
        for (var n = Math.min(3, toks.length - 1); n >= 1 && !when; n--) { var tail = toks.slice(-n).join(' '); var m = tail.match(/^(?:due|by)\s+(.+)$/i); var probe = m ? m[1] : tail; if (probe.toLowerCase() === 'clear' || (window.When && When.parse(probe))) { q = toks.slice(0, -n).join(' '); when = probe; isDue = !!m; } }
        if (!when) { flash('Say which task and when: at Call with Sam tomorrow 14:00'); return; }
        var t = pick(q); if (!t) return; if (when.toLowerCase() === 'clear') { Model.update(t.id, { at: '', until: '', due: '' }); render(); flash('Date removed: ' + t.title); return; }
        var p = When.parse(when); if (isDue) Model.update(t.id, { due: When.dayKey(p.stamp) }); else Model.update(t.id, { at: p.stamp, until: '' }); render(); flash((isDue ? 'Due ' : 'At ') + When.label(isDue ? When.dayKey(p.stamp) : p.stamp) + ': ' + t.title);
      } },
      { label: 'Add task', prefix: 'add', hint: 'add <title> @proj #tag !high >later · a date at the end works: tomorrow 15:00, by fri', keywords: 'new create task', run: function (arg) {
        var t = parseAddArg(arg); if (!t.title) { flash('Give the task a title.'); return; }
        createTask(t); flash('Added "' + t.title + '".');
      } },
      { label: 'Mark done', prefix: 'done', hint: 'done <id or title>', keywords: 'finish complete', run: function (arg) {
        var t = pick(arg); if (t) { Model.moveTo(t.id, 'done'); render(); flash('Done: ' + t.title); }
      } },
      { label: 'Start task (move to Doing)', prefix: 'start', hint: 'start <id or title>', keywords: 'doing begin', run: function (arg) {
        var t = pick(arg); if (t) { Model.moveTo(t.id, 'doing'); render(); flash('Doing: ' + t.title); }
      } },
      { label: 'Move task', prefix: 'move', hint: 'move <id or title> <todo|doing|done|later|bucket>', run: function (arg) {
        var m = arg.match(/^(.*)\s+(todo|doing|done|later|bucket)$/i);
        if (!m) { flash('Usage: move <task> <column>'); return; }
        var t = pick(m[1].trim()); if (t) { Model.moveTo(t.id, m[2].toLowerCase()); render(); flash('Moved to ' + statusLabel(m[2].toLowerCase()) + ': ' + t.title); }
      } },
      { label: 'Find / expand task', prefix: 'find', hint: 'find <title>', keywords: 'search open', run: function (arg) {
        var t = pick(arg); if (!t) return;
        var v = t.col === 'later' ? 'later' : (t.col === 'bucket' ? 'bucket' : 'board');
        if (t.collapsed) Model.toggleCollapse(t.id);
        setView(v);
        var el = document.querySelector('.card[data-id="' + t.id + '"]'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } },
      { label: 'Delete task', prefix: 'rm', hint: 'rm <id or title>', keywords: 'delete remove', run: function (arg) {
        var t = pick(arg); if (t && confirm('Delete "' + t.title + '"?')) { Model.del(t.id); render(); flash('Deleted.'); }
      } },
      { label: 'Show board', hint: 'view', keywords: 'todo doing done', run: function () { setView('board'); } },
      { label: 'Show Later', hint: 'view', run: function () { setView('later'); } },
      { label: 'Show Bucket List', hint: 'view', run: function () { setView('bucket'); } },
      { label: 'Collapse / expand all', hint: 'view', run: function () { global.toggleCollapseAll(); } },
      { label: 'Clear filters', hint: 'view', run: function () { selectedProjects.clear(); selectedTags.clear(); render(); } },
      { label: 'Export visible tasks as Markdown', hint: 'export', keywords: 'md share', run: global.exportMarkdown },
      { label: 'Save board to file', hint: 'export', keywords: 'download json backup', run: global.exportState },
      { label: 'Load board from file', hint: 'import', keywords: 'upload json', run: function () { document.getElementById('importFile').click(); } },
      { label: 'Load sample board', hint: 'template', keywords: 'reset example', run: global.loadTemplate },
      { label: 'Start with an empty board', hint: 'template', keywords: 'clear blank', run: global.clearBoard },
      { label: 'Switch board', prefix: 'board', hint: 'board <name>', keywords: 'boards open', run: function (arg) {
        var l = arg.toLowerCase(); var m = Config.boards().filter(function (b) { return b.id === l || b.title.toLowerCase().indexOf(l) >= 0; });
        if (m.length === 1) switchBoard(m[0].id); else flash(m.length ? 'Several boards match.' : 'No board called "' + arg + '". Boards: ' + Config.boards().map(function (b) { return b.title; }).join(', '));
      } },
      { label: 'New board', hint: 'boards', keywords: 'create copy', run: function () { var p = document.getElementById('boardPanel'); if (!p.classList.contains('open')) toggleBoardPanel(); } },
      { label: 'Rename this board', hint: 'boards', run: global.renameBoard },
      { label: 'Delete this board', hint: 'boards', run: global.deleteBoard },
      { label: 'Go to social schedule', hint: 'nav', run: function () { location.href = '../social/social-board.html?ws=' + encodeURIComponent(Config.activeWs()); } }
    ]);
    document.addEventListener('keydown', function (e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      var tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;
      if (Palette.isOpen()) return;
      if (e.key === 'n') { e.preventDefault(); var p = document.getElementById('addpanel'); if (!p.classList.contains('open')) toggleAdd(); else document.getElementById('newTitle').focus(); }
      else if (e.key === '1') setView('board');
      else if (e.key === '2') setView('later');
      else if (e.key === '3') setView('bucket');
      else if (e.key === '/') { e.preventDefault(); Palette.open(); }
      else if (e.key === '?') { e.preventDefault(); flash('Shortcuts: n add · 1/2/3 views · / or ⌘K commands'); }
    });
  }

  // re-read the board from the Store (used after an agent reply is applied in the Guide)
  global.refreshBoard = function () { Model.replaceAll(Store.getJSON(Model.KEY, []) || [], { silent: true }); renderProjectSelect(); renderTagDatalist(); render(); };

  /* ---- init ---------------------------------------------------------- */
  function init() {
    Config.applyDOM({ board: Model.board() });
    renderBoards();
    renderTagPicker();
    renderProjectSelect();
    renderTagDatalist();
    render();
    registerSync();
    registerPalette();
    // ?id=<task>: expand, scroll to it and flash it (the Calendar links here)
    (function () { var id = new URLSearchParams(location.search).get('id'); if (!id) return; var t = Model.getState().find(function (x) { return x.id === id; }); if (!t) return; if (t.collapsed) { Model.update(id, { collapsed: false }); render(); }
      setTimeout(function () { var el = document.querySelector('.card[data-id="' + id + '"]'); if (!el) return; el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('flash'); setTimeout(function () { el.classList.remove('flash'); }, 2200); }, 150); })();
    if (location.hash === '#new' || !Config.boards().length) { toggleBoardPanel(); history.replaceState(null, '', location.pathname + location.search); }
    setBaseNote(Store.ok
      ? (Model.isFresh() ? 'This is the sample board. Add your own tasks, or load a file. ⌘K for commands.' : 'Saved in this browser · ⌘K for commands · n adds a task')
      : 'Heads up: storage is blocked here, so changes last only this session. Use Save file to keep your work.');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(window);
