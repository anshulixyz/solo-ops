/* =========================================================================
   view.js — rendering (DOM out only, no state mutation)
   Turns Model state into HTML: cards, collapse ring, tags, checklist, notes.
   Exposes a single global `View`. All interactive handlers live in main.js
   and are referenced by name from the generated markup.
   ========================================================================= */
(function (global) {
  'use strict';

  var CHECK_SVG = '<svg viewBox="0 0 12 12" fill="none"><path d="M2.5 6.5L5 9L9.5 3.5" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var CHEV_SVG = '<svg viewBox="0 0 12 12" fill="none"><path d="M4 2l4 4-4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function esc(s) {
    return (s || '').replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function handlerArg(s) {
    return encodeURIComponent(String(s || '')).replace(/'/g, '%27');
  }
  function projLabel(p) { return p || 'general'; }

  // projects use a curated hue where we have one, hashed otherwise — but they
  // render with a distinct treatment (neutral chip + dot), so hue collisions
  // with a tag never read as the same category.
  var PROJ_HUES = { openDM: 20, nextmillion: 190, general: 45 };
  function projHue(p) { return PROJ_HUES.hasOwnProperty(p) ? PROJ_HUES[p] : hueFor(p); }

  /* deterministic color per tag: curated hues for the known set, hashed hue
     for anything custom. Only the hue is emitted (as a CSS var); light/dark
     shading is handled in CSS so it follows theme toggles without re-render. */
  var TAG_HUES = { coding: 205, video: 20, demo: 145, outreach: 38, launch: 0, research: 270, content: 320, setup: 95 };
  function hueFor(tag) {
    if (TAG_HUES.hasOwnProperty(tag)) return TAG_HUES[tag];
    var h = 0, i;
    for (i = 0; i < tag.length; i++) { h = (h * 31 + tag.charCodeAt(i)) >>> 0; }
    return h % 360;
  }
  function progress(t) {
    var total = t.checklist.length;
    var done = t.checklist.filter(function (c) { return c.done; }).length;
    var pct = total ? Math.round(done / total * 100) : (t.col === 'done' ? 100 : 0);
    return { total: total, done: done, pct: pct };
  }

  /* circular progress ring shown when a card is collapsed */
  function ringHTML(t) {
    var p = progress(t);
    var R = 15, C = 2 * Math.PI * R;
    var off = C * (1 - p.pct / 100);
    var center = p.total ? p.pct : (t.col === 'done' ? '✓' : '·');
    return '<div class="ring-wrap" title="' + p.done + '/' + p.total + ' done">' +
      '<svg class="ring" viewBox="0 0 34 34">' +
      '<circle class="ring-bg" cx="17" cy="17" r="' + R + '"></circle>' +
      '<circle class="ring-fg" cx="17" cy="17" r="' + R + '" ' +
      'stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '"></circle>' +
      '</svg><span class="ring-num">' + center + '</span></div>';
  }

  function tagsHTML(t, editable) {
    var chips = t.tags.map(function (tag) {
      var rm = editable
        ? '<button class="x" title="Remove tag" onclick="event.stopPropagation();removeTag(\'' + t.id + '\',\'' + esc(tag) + '\')">×</button>'
        : '';
      return '<span class="tag hue" data-tag="' + esc(tag) + '" style="--h:' + hueFor(tag) + '">' + esc(tag) + rm + '</span>';
    }).join('');
    var adder = editable
      ? '<input class="tag-add" list="tagOptions" placeholder="+tag" ' +
        'onmousedown="event.stopPropagation()" onclick="event.stopPropagation()" ' +
        'onkeydown="if(event.key===\'Enter\'){addTagFromInput(\'' + t.id + '\',this);}">'
      : '';
    return chips + adder;
  }

  function prioritySelect(t) {
    var pri = Model.PRI_RANK.hasOwnProperty(t.pri) ? t.pri : 'medium';
    return '<select class="pri-select pri-' + pri + '" title="Set priority" aria-label="Priority" ' +
      'onmousedown="event.stopPropagation()" onclick="event.stopPropagation()" onchange="setPri(\'' + t.id + '\',this.value)">' +
      '<option value="high"' + (pri === 'high' ? ' selected' : '') + '>High</option>' +
      '<option value="medium"' + (pri === 'medium' ? ' selected' : '') + '>Med</option>' +
      '<option value="low"' + (pri === 'low' ? ' selected' : '') + '>Low</option>' +
      '</select>';
  }

  function checklistHTML(t) {
    var p = progress(t);
    var items = t.checklist.map(function (c, idx) {
      return '<div class="cl-item ' + (c.done ? 'done' : '') + '" onclick="toggleStep(\'' + t.id + '\',' + idx + ')">' +
        '<span class="cl-box">' + CHECK_SVG + '</span>' +
        '<span class="cl-text">' + esc(c.text) + '</span>' +
        '<button class="cl-del" onclick="event.stopPropagation();delStep(\'' + t.id + '\',' + idx + ')" title="Remove step">×</button>' +
        '</div>';
    }).join('');
    var meter = p.total
      ? '<div class="cl-meter"><div class="mbar"><i style="width:' + p.pct + '%"></i></div><span class="mtxt">' + p.done + '/' + p.total + '</span></div>'
      : '';
    return '<div class="checklist">' + meter + items +
      '<div class="cl-add">' +
      '<input placeholder="add a step…" onkeydown="if(event.key===\'Enter\'){addStep(\'' + t.id + '\',this.value); this.value=\'\';}">' +
      '<button onclick="var i=this.previousElementSibling; addStep(\'' + t.id + '\',i.value); i.value=\'\';">+</button>' +
      '</div></div>';
  }

  function notesHTML(t, open) {
    return '<div class="notes-panel ' + (open ? 'open' : '') + '">' +
      '<textarea placeholder="Rough ideas, links, half-thoughts… (autosaves)" ' +
      'oninput="onNotesInput(\'' + t.id + '\',this)">' + esc(t.notes) + '</textarea>' +
      '<div class="notes-hint">Private notes · saved to this browser</div></div>';
  }

  function footHTML(t, view) {
    var order = ['todo', 'doing', 'done'];
    var i = order.indexOf(t.col);
    var moves;
    if (view === 'board') {
      moves = '<div class="moves">' +
        '<button class="mv" onclick="move(\'' + t.id + '\',-1)" ' + (i <= 0 ? 'disabled' : '') + ' title="Move back">←</button>' +
        '<button class="mv" onclick="move(\'' + t.id + '\',1)" ' + (i >= 2 ? 'disabled' : '') + ' title="Move forward">→</button>' +
        '<button class="mv send-later" onclick="sendToLater(\'' + t.id + '\')" title="Park in Later">&rarr;&nbsp;Later</button>' +
        '<button class="mv send-bucket" onclick="sendToBucket(\'' + t.id + '\')" title="Move to Bucket List">&rarr;&nbsp;Bucket</button>' +
        '</div>';
    } else if (view === 'later') {
      moves = '<div class="moves">' +
        '<button class="mv send-todo" onclick="sendToBoard(\'' + t.id + '\')" title="Move to the board (To Do)">&rarr;&nbsp;To Do</button>' +
        '<button class="mv send-bucket" onclick="sendToBucket(\'' + t.id + '\')" title="Move to Bucket List">&rarr;&nbsp;Bucket</button>' +
        '</div>';
    } else {
      moves = '<button class="mv send-todo" onclick="sendToBoard(\'' + t.id + '\')" title="Move to the board (To Do)">&rarr;&nbsp;To Do</button>';
    }
    var notesBtn = '<button class="notes-btn ' + (t.notes ? 'has-notes' : '') + '" ' +
      'onclick="toggleNotes(\'' + t.id + '\')" title="Rough notes"><span class="dot"></span>notes</button>';
    return '<div class="card-foot"><div class="foot-left">' + moves + notesBtn + '</div>' +
      '<button class="card-del" onclick="delTask(\'' + t.id + '\')" title="Delete task">delete</button></div>';
  }

  function cardHTML(t, view, notesOpen) {
    var isDone = t.col === 'done';
    var body = '';
    if (!t.collapsed) {
      body = '<div class="card-body">' +
        (t.desc ? '<div class="card-desc">' + esc(t.desc) + '</div>' : '') +
        checklistHTML(t) +
        notesHTML(t, notesOpen) +
        footHTML(t, view) +
        '</div>';
    }
    return '<div class="card ' + (isDone ? 'done-card ' : '') + (t.collapsed ? 'collapsed' : '') + '" draggable="true" data-id="' + t.id + '">' +
      '<div class="card-head">' +
      '<button class="chev" onclick="event.stopPropagation();toggleCollapse(\'' + t.id + '\')" title="Collapse / expand" aria-label="Collapse or expand">' + CHEV_SVG + '</button>' +
      '<div class="card-head-main">' +
      '<div class="card-tags">' + prioritySelect(t) +
      '<span class="tag proj" style="--h:' + projHue(t.proj) + '">' + esc(projLabel(t.proj)) + '</span>' +
      tagsHTML(t, !t.collapsed) + '</div>' +
      '<div class="card-title">' + esc(t.title) + '</div>' +
      '</div>' +
      ringHTML(t) +
      '</div>' + body + '</div>';
  }

  function byPriority(a, b) {
    return (Model.PRI_RANK[a.pri] != null ? Model.PRI_RANK[a.pri] : 1) -
      (Model.PRI_RANK[b.pri] != null ? Model.PRI_RANK[b.pri] : 1);
  }

  /* ---- top-level render ---------------------------------------------- */
  function render(view, visible, selectedProjects, selectedTags, notesOpen) {
    var state = Model.getState();

    if (view === 'board') {
      ['todo', 'doing', 'done'].forEach(function (col) {
        var items = visible.filter(function (t) { return t.col === col; }).sort(byPriority);
        var zone = document.querySelector('.dropzone[data-col="' + col + '"]');
        zone.innerHTML = items.length
          ? items.map(function (t) { return cardHTML(t, view, notesOpen.has(t.id)); }).join('')
          : '<div class="empty">' + (col === 'done'
              ? 'Nothing finished yet.<br>Drag a card here when it ships.'
              : col === 'doing' ? 'Pull a card in to start.' : 'All clear.') + '</div>';
        document.getElementById('c-' + col).textContent = items.length;
      });
    } else {
      var targetCol = view === 'bucket' ? 'bucket' : 'later';
      var items = visible.filter(function (t) { return t.col === targetCol; }).sort(byPriority);
      var zone = document.querySelector('.parking-zone[data-col="' + targetCol + '"]');
      zone.innerHTML = items.length
        ? items.map(function (t) { return cardHTML(t, view, notesOpen.has(t.id)); }).join('')
        : '<div class="empty">' + (view === 'bucket' ? 'No video or demo ideas yet.' : 'No parked items.') + '</div>';
      document.getElementById('c-' + targetCol).textContent = items.length;
    }

    // counts + runway
    var board = state.filter(function (t) {
      return t.col === 'todo' || t.col === 'doing' || t.col === 'done';
    });
    var doneC = state.filter(function (t) { return t.col === 'done'; }).length;
    var totalB = board.length;
    var pct = totalB ? Math.round(doneC / totalB * 100) : 0;
    document.getElementById('doneN').textContent = doneC;
    document.getElementById('totalN').textContent = totalB;
    document.getElementById('pctN').textContent = pct;
    document.getElementById('barFill').style.width = pct + '%';
    document.getElementById('boardN').textContent = totalB;
    document.getElementById('laterN').textContent = state.filter(function (t) { return t.col === 'later'; }).length;
    document.getElementById('bucketN').textContent = state.filter(function (t) { return t.col === 'bucket'; }).length;

    renderFilters(selectedProjects);
    renderTagFilters(selectedTags);   // keep chips in sync with tags in use
  }

  // Tag filter chips: 'all' + every tag currently present on the board.
  function renderTagFilters(selectedTags) {
    var el = document.getElementById('tagFilters');
    if (!el) return;
    var set = {};
    Model.getState().forEach(function (t) {
      (t.tags || []).forEach(function (x) { set[x] = 1; });
    });
    var tags = Object.keys(set).sort();
    var html = '<button class="chip' + (selectedTags.size === 0 ? ' active' : '') + '" onclick="setTagFilter(\'all\')">all</button>';
    html += tags.map(function (tag) {
      return '<button class="chip tagchip' + (selectedTags.has(tag) ? ' active' : '') + '" ' +
        'style="--h:' + hueFor(tag) + '" onclick="setTagFilter(decodeURIComponent(\'' + handlerArg(tag) + '\'))">' + esc(tag) + '</button>';
    }).join('');
    el.innerHTML = html;
  }

  function renderFilters(selectedProjects) {
    var projs = ['all'].concat(Model.getProjects());
    document.getElementById('filters').innerHTML = projs.map(function (p) {
      if (p === 'all') return '<button class="chip' + (selectedProjects.size === 0 ? ' active' : '') + '" onclick="setFilter(\'all\')">all</button>';
      return '<button class="chip projchip' + (selectedProjects.has(p) ? ' active' : '') + '" ' +
        'style="--h:' + projHue(p) + '" onclick="setFilter(decodeURIComponent(\'' + handlerArg(p) + '\'))">' + esc(projLabel(p)) + '</button>';
    }).join('');
  }

  global.View = { render: render, renderFilters: renderFilters, renderTagFilters: renderTagFilters, hueFor: hueFor };
})(window);
