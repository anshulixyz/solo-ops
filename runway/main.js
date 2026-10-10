/* =========================================================================
   main.js — wiring & UI state
   Holds ephemeral UI state (current view, filter, which notes are open),
   defines the global handlers referenced by the markup, and owns drag & drop,
   theme, import/export, and init.
   ========================================================================= */
(function (global) {
  'use strict';

  var view = 'board';
  var selectedProjects = new Set(); // empty means all; selected projects match with OR
  var selectedTags = new Set();     // empty means all; selected tags match with OR
  var notesOpen = new Set();   // task ids whose notes panel is expanded
  var THEME_KEY = 'anshuli.runway.theme';

  // Add-panel tag picker state
  var pickerTags = Model.KNOWN_TAGS.slice();  // options shown as toggle chips
  var newTags = new Set();                    // selected for the next task

  /* single render entry point: re-render + rebind drag handlers */
  function taskMatchesFilters(t) {
    var projectMatch = selectedProjects.size === 0 || selectedProjects.has(t.proj);
    var tagMatch = selectedTags.size === 0 || (t.tags || []).some(function (tag) {
      return selectedTags.has(tag);
    });
    return projectMatch && tagMatch;
  }
  function filteredTasks() {
    return Model.getState().filter(taskMatchesFilters);
  }
  function render() {
    View.render(view, filteredTasks(), selectedProjects, selectedTags, notesOpen);
    bindDrag();
  }

  /* ---- view / filter / add panel ------------------------------------- */
  global.setView = function (v) {
    view = v;
    document.querySelectorAll('.tab').forEach(function (t) {
      t.classList.toggle('active', t.dataset.view === v);
    });
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
  global.toggleAdd = function () { document.getElementById('addpanel').classList.toggle('open'); };

  /* ---- projects (add-panel select + add-new) ------------------------- */
  function escAttr(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function renderProjectSelect() {
    var sel = document.getElementById('newProj');
    if (!sel) return;
    var cur = sel.value;
    sel.innerHTML = Model.getProjects().map(function (p) {
      return '<option value="' + escAttr(p) + '">' + escAttr(p) + '</option>';
    }).join('');
    if (cur) sel.value = cur;
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
        'style="--h:' + View.hueFor(tag) + '" onclick="toggleNewTag(\'' + tag + '\')">' + tag + '</button>';
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
  global.addTask = function () {
    var title = document.getElementById('newTitle').value.trim();
    if (!title) return;
    var t = {
      id: 't' + Date.now(),
      title: title,
      proj: document.getElementById('newProj').value,
      pri: document.getElementById('newPri').value,
      col: document.getElementById('newCol').value,
      tags: Array.from(newTags), desc: '', notes: '', collapsed: true, checklist: []
    };
    Model.add(t);
    document.getElementById('newTitle').value = '';
    newTags.clear();
    pickerTags = Model.KNOWN_TAGS.slice();
    renderTagPicker();
    var targetView = t.col === 'later' ? 'later' : (t.col === 'bucket' ? 'bucket' : 'board');
    if (targetView !== view) setView(targetView);
    else render();
  };
  global.setPri = function (id, val) { Model.setPri(id, val); render(); };
  global.delTask = function (id) { Model.del(id); notesOpen.delete(id); render(); };
  global.move = function (id, dir) { Model.move(id, dir); render(); };
  // Later → board: park a long-term item into the active To Do column.
  global.sendToBoard = function (id) { Model.moveTo(id, 'todo'); render(); flash('Moved to To Do.'); };
  // board → Later: send a board task to the long-term parking lot.
  global.sendToLater = function (id) { Model.moveTo(id, 'later'); render(); flash('Moved to Later.'); };
  // Any idea can be moved into the dedicated video/demo idea bucket.
  global.sendToBucket = function (id) { Model.moveTo(id, 'bucket'); render(); flash('Moved to Bucket List.'); };

  /* ---- checklist ----------------------------------------------------- */
  global.toggleStep = function (id, idx) { Model.toggleStep(id, idx); render(); };
  global.addStep = function (id, text) { Model.addStep(id, text); render(); };
  global.delStep = function (id, idx) { Model.delStep(id, idx); render(); };

  /* ---- tags ---------------------------------------------------------- */
  global.addTagFromInput = function (id, input) {
    Model.addTag(id, input.value);
    input.value = '';
    render();
  };
  global.removeTag = function (id, tag) { Model.removeTag(id, tag); render(); };

  /* ---- collapse / expand --------------------------------------------- */
  global.toggleCollapse = function (id) { Model.toggleCollapse(id); render(); };
  global.toggleCollapseAll = function () {
    // if anything is expanded, collapse everything; otherwise expand everything
    var anyExpanded = Model.getState().some(function (t) { return !t.collapsed; });
    Model.setCollapsedAll(anyExpanded);
    updateCollapseAllLabel();
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
    if (t && t.collapsed) Model.toggleCollapse(id);   // expand so the panel is visible
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

  /* ---- reset / import / export --------------------------------------- */

  function timestamp() {
    return new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  }
  function downloadFile(content, filename, mimeType) {
    var blob = new Blob([content], { type: mimeType });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }
  // Download the current board as a timestamped JSON file. Shared by the
  // Save-file button and the safety backup Reset takes before wiping state.
  function downloadBoard() {
    downloadFile(
      JSON.stringify(Model.getState(), null, 2),
      'runway-board-' + timestamp() + '.json',
      'application/json'
    );
  }

  function mdInline(value) {
    return String(value == null ? '' : value)
      .replace(/\\/g, '\\\\')
      .replace(/\r?\n/g, ' ')
      .replace(/([`*_[\]<>#])/g, '\\$1');
  }
  function mdBlock(value) {
    var text = String(value == null ? '' : value).trim();
    if (!text) return '_None._';
    return text.split(/\r?\n/).map(function (line) {
      return '> ' + mdInline(line);
    }).join('\n');
  }
  function statusLabel(col) {
    return { todo: 'To Do', doing: 'Doing', done: 'Done', later: 'Later', bucket: 'Bucket List' }[col] || col;
  }
  function taskMarkdown(t) {
    var done = (t.checklist || []).filter(function (item) { return item.done; }).length;
    var total = (t.checklist || []).length;
    var pct = total ? Math.round(done / total * 100) : 0;
    var lines = [
      '### ' + mdInline(t.title),
      '',
      '- **Status:** ' + mdInline(statusLabel(t.col)),
      '- **Project:** ' + mdInline(t.proj || 'general'),
      '- **Priority:** ' + mdInline(t.pri || 'medium'),
      '- **Tags:** ' + ((t.tags || []).length ? t.tags.map(function (tag) { return '`' + mdInline(tag) + '`'; }).join(', ') : 'None'),
      '- **Checklist progress:** ' + done + '/' + total + ' (' + pct + '%)',
      '- **Task ID:** `' + mdInline(t.id) + '`',
      '',
      '**Description**',
      '',
      mdBlock(t.desc),
      '',
      '**Checklist**',
      ''
    ];
    if (total) {
      t.checklist.forEach(function (item) {
        lines.push('- [' + (item.done ? 'x' : ' ') + '] ' + mdInline(item.text));
      });
    } else {
      lines.push('_No checklist items._');
    }
    lines.push('', '**Notes**', '', mdBlock(t.notes), '');
    return lines.join('\n');
  }

  global.exportMarkdown = function () {
    var allowed = view === 'board' ? ['todo', 'doing'] : [view === 'bucket' ? 'bucket' : 'later'];
    var tasks = filteredTasks().filter(function (t) { return allowed.indexOf(t.col) !== -1 && t.col !== 'done'; });
    if (!tasks.length) {
      flash('No visible non-Done tasks to export.');
      return;
    }
    tasks.sort(function (a, b) {
      var colDiff = allowed.indexOf(a.col) - allowed.indexOf(b.col);
      return colDiff || (Model.PRI_RANK[a.pri] || 0) - (Model.PRI_RANK[b.pri] || 0);
    });
    var sections = [];
    allowed.forEach(function (col) {
      var group = tasks.filter(function (t) { return t.col === col; });
      if (group.length) {
        sections.push('## ' + statusLabel(col) + '\n\n' + group.map(taskMarkdown).join('\n'));
      }
    });
    var viewLabel = view === 'board' ? 'Board' : statusLabel(view);
    var markdown = [
      '# Launch Runway Export',
      '',
      '- **Exported:** ' + new Date().toISOString(),
      '- **View:** ' + viewLabel,
      '- **Projects:** ' + (selectedProjects.size ? Array.from(selectedProjects).map(mdInline).join(', ') : 'All'),
      '- **Tags:** ' + (selectedTags.size ? Array.from(selectedTags).map(mdInline).join(', ') : 'All'),
      '- **Tasks:** ' + tasks.length,
      '- **Done tasks:** Excluded',
      '',
      sections.join('\n')
    ].join('\n');
    downloadFile(markdown, 'runway-' + view + '-' + timestamp() + '.md', 'text/markdown;charset=utf-8');
    flash('Exported ' + tasks.length + ' task' + (tasks.length === 1 ? '' : 's') + ' to Markdown.');
  };

  global.exportState = function () {
    downloadBoard();
    flash('Saved a backup of your board.');
  };

  // Reset is destructive (replaces everything with the seed), so we always
  // download a backup of the current board first — nothing is unrecoverable.
  global.resetBoard = function () {
    if (!confirm('Reset to the original task list?\n\nYour current board will be replaced. A backup file is downloaded first, so you can restore it any time with "Load file".')) return;
    downloadBoard();
    Model.reset(); selectedProjects.clear(); selectedTags.clear(); notesOpen.clear();
    renderProjectSelect(); render(); updateCollapseAllLabel();
    flash('Board reset — a backup of your previous board was downloaded.');
  };
  global.importState = function (input) {
    var file = input.files && input.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var data = JSON.parse(e.target.result);
        if (!Array.isArray(data) || !data.every(function (t) { return t && t.id && t.title; })) {
          throw new Error('shape');
        }
        if (!confirm('Replace your current board with this saved file?')) { input.value = ''; return; }
        Model.replaceAll(data); selectedProjects.clear(); selectedTags.clear(); notesOpen.clear();
        renderProjectSelect();
        setView(Model.getState().some(function (t) {
          return t.col === 'todo' || t.col === 'doing' || t.col === 'done';
        }) ? 'board' : (Model.getState().some(function (t) { return t.col === 'later'; }) ? 'later' : 'bucket'));
        updateCollapseAllLabel();
        flash('Board loaded from file.');
      } catch (err) {
        alert("That file didn't look like a saved board. Pick a file you exported with Save file.");
      }
      input.value = '';
    };
    reader.readAsText(file);
  };

  function flash(msg) {
    var n = document.getElementById('storeNote');
    var prev = n.textContent;
    n.textContent = msg; n.style.color = 'var(--green)';
    clearTimeout(n._t);
    n._t = setTimeout(function () { n.textContent = prev; n.style.color = ''; }, 2600);
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

  /* ---- theme --------------------------------------------------------- */
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    document.documentElement.style.colorScheme = t;
    Store.set(THEME_KEY, t);
  }
  global.toggleTheme = function () {
    var cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    applyTheme(cur === 'dark' ? 'light' : 'dark');
  };

  /* ---- init ---------------------------------------------------------- */
  function init() {
    applyTheme(Store.get(THEME_KEY) || document.documentElement.getAttribute('data-theme') || 'light');
    renderTagPicker();
    renderProjectSelect();
    render();
    updateCollapseAllLabel();
    document.getElementById('storeNote').textContent = Store.ok
      ? 'Saved to this browser. Open this file locally to keep your progress across sessions.'
      : 'Heads up: storage is blocked here, so changes last only this session. Download the file and open it in your browser to save progress.';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
