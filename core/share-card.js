/* =========================================================================
   core/share-card.js — "Share today": one clean card of today's plan.
   The model and the text version are pure (also require()d by the CLI for
   `share today`); the image side builds an SVG string, draws it to a canvas
   and hands out a PNG: Copy image → clipboard, Save as file → data/exports/
   through Sync.saveFile, Copy as text → the Markdown. Square 1080×1080,
   always the light palette (a dark card on a white timeline looks broken),
   system fonts only (an <img>-loaded SVG cannot see the page's web fonts),
   titles only — never notes, steps or ids. Global `ShareCard`.
   ========================================================================= */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.ShareCard = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  var SIZE = 1080, PAD = 72, MAX_LINES = 8, MIN_STREAK = 7;
  var FONT = "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function dayKey(s) { return String(s || '').slice(0, 10); }
  function timeOf(s) { s = String(s || ''); return s.length > 10 ? s.slice(11, 16) : ''; }
  function localD(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var PRI = { high: 0, medium: 1, low: 2 };

  /* ---- model: what goes on the card --------------------------------------
     input: { now, scope (title), tasks: [{ title, col, pri, tags, at, until, due }], streak }
     output: { weekday, date, scope, doing[], schedule[], next[], more, streak, empty } */
  function model(inp) {
    inp = inp || {}; var now = inp.now || new Date(); var tkey = localD(now); var tasks = inp.tasks || [];
    var nowStamp = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) + 'T' + pad(now.getHours()) + ':' + pad(now.getMinutes());
    var open = tasks.filter(function (t) { return t && t.col !== 'done' && t.title && !(t.until && t.until < nowStamp); });   // a meeting that ended is not "today's plan" any more
    var inSched = {};
    var sched = [];
    open.forEach(function (t) {
      if (t.at && dayKey(t.at) === tkey) { inSched[t.id || t.title] = 1; var a = timeOf(t.at), u = t.until && dayKey(t.until) === tkey ? timeOf(t.until) : ''; sched.push({ when: a ? (u ? a + '–' + u : a) : 'all day', sort: a ? '1' + a : '0', title: t.title, meeting: (t.tags || []).indexOf('meeting') >= 0 }); }
      else if (t.due && dayKey(t.due) === tkey) { inSched[t.id || t.title] = 1; sched.push({ when: 'due today', sort: '2', title: t.title, meeting: false }); }
    });
    sched.sort(function (a, b) { return a.sort < b.sort ? -1 : a.sort > b.sort ? 1 : 0; });
    function rank(t) { return t.pri in PRI ? PRI[t.pri] : 1; }
    var doing = open.filter(function (t) { return t.col === 'doing' && !inSched[t.id || t.title]; }).sort(function (a, b) { return rank(a) - rank(b); }).slice(0, 3).map(function (t) { return { title: t.title }; });
    var more = Math.max(0, sched.length - 5); sched = sched.slice(0, 5);
    var left = MAX_LINES - doing.length - sched.length;
    var next = left > 0 ? open.filter(function (t) { return t.col === 'todo' && !inSched[t.id || t.title] && !t.at && (t.tags || []).indexOf('meeting') < 0; }).sort(function (a, b) { return rank(a) - rank(b); }).slice(0, Math.min(3, left)).map(function (t) { return { title: t.title }; }) : [];
    var streak = inp.streak >= MIN_STREAK ? inp.streak : 0;
    return { weekday: now.toLocaleDateString(undefined, { weekday: 'long' }), date: now.toLocaleDateString(undefined, { day: 'numeric', month: 'long' }), scope: inp.scope || '',
      doing: doing, schedule: sched, next: next, more: more, streak: streak, empty: !doing.length && !sched.length && !next.length };
  }

  /* ---- text version (Markdown): the CLI prints the same ----------------- */
  function markdown(m) {
    var L = ['# Today · ' + m.weekday + ' ' + m.date + (m.scope ? ' · ' + m.scope : ''), ''];
    if (m.empty) { L.push('_Nothing planned yet._'); return L.join('\n'); }
    if (m.doing.length) { L.push('**Doing**'); m.doing.forEach(function (x) { L.push('- ' + x.title); }); L.push(''); }
    if (m.schedule.length) { L.push('**Schedule**'); m.schedule.forEach(function (x) { L.push('- ' + x.when + ' · ' + x.title); }); if (m.more) L.push('- + ' + m.more + ' more'); L.push(''); }
    if (m.next.length) { L.push('**Next up**'); m.next.forEach(function (x) { L.push('- ' + x.title); }); L.push(''); }
    if (m.streak) L.push('_Day ' + m.streak + ' in a row · Solo Ops_'); else L.push('_Solo Ops_');
    return L.join('\n');
  }

  // plain text for WhatsApp / Slack / iMessage (Markdown marks would show literally)
  function plain(m) {
    var L = ['Today · ' + m.weekday + ' ' + m.date + (m.scope ? ' · ' + m.scope : ''), ''];
    if (m.empty) { L.push('Nothing planned yet.'); return L.join('\n'); }
    if (m.doing.length) { L.push('Doing'); m.doing.forEach(function (x) { L.push('· ' + x.title); }); L.push(''); }
    if (m.schedule.length) { L.push('Schedule'); m.schedule.forEach(function (x) { L.push('· ' + x.when + ' · ' + x.title); }); if (m.more) L.push('· + ' + m.more + ' more'); L.push(''); }
    if (m.next.length) { L.push('Next up'); m.next.forEach(function (x) { L.push('· ' + x.title); }); L.push(''); }
    L.push(m.streak ? 'Day ' + m.streak + ' in a row · made with Solo Ops' : 'made with Solo Ops');
    return L.join('\n');
  }

  /* ---- image side (browser only) ---------------------------------------- */
  var measureCtx = null;
  function measure(text, font) {
    if (typeof document === 'undefined') return text.length * 18;
    if (!measureCtx) { var c = document.createElement('canvas'); measureCtx = c.getContext('2d'); }
    measureCtx.font = font; return measureCtx.measureText(text).width;
  }
  function fit(text, font, max) {   // one line, ellipsis when too long (SVG has no wrapping)
    text = String(text || '').replace(/\s+/g, ' ').trim(); if (measure(text, font) <= max) return text;
    var lo = 0, hi = text.length;
    while (lo < hi) { var mid = (lo + hi + 1) >> 1; if (measure(text.slice(0, mid) + '…', font) <= max) lo = mid; else hi = mid - 1; }
    return text.slice(0, lo).replace(/\s+$/, '') + '…';
  }
  function accent() {
    var a = ''; try { a = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(); } catch (e) { /* no DOM */ }
    return /^#[0-9a-f]{3,8}$/i.test(a) || /^(rgb|hsl)/.test(a) ? a : '#222222';
  }
  function svg(m) {
    var C = { bg: '#FBF8F3', panel: '#FFFFFF', ink: '#1F1D1A', muted: '#6E6860', faint: '#A9A39A', line: '#E8E2D9', accent: accent() };
    var W = SIZE, inner = W - PAD * 2; var y = PAD + 8; var out = [];
    out.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + W + '" viewBox="0 0 ' + W + ' ' + W + '">');
    out.push('<rect width="' + W + '" height="' + W + '" fill="' + C.bg + '"/>');
    out.push('<rect x="' + (PAD - 24) + '" y="' + (PAD - 24) + '" width="' + (W - PAD * 2 + 48) + '" height="' + (W - PAD * 2 + 48) + '" rx="28" fill="' + C.panel + '" stroke="' + C.line + '"/>');
    // header
    out.push('<text x="' + PAD + '" y="' + (y + 22) + '" font-family="' + FONT + '" font-size="22" font-weight="600" letter-spacing="3" fill="' + C.accent + '">' + esc((m.scope || 'TODAY').toUpperCase()) + '</text>');
    y += 86;
    out.push('<text x="' + PAD + '" y="' + y + '" font-family="' + FONT + '" font-size="64" font-weight="700" fill="' + C.ink + '">' + esc(m.weekday) + '</text>');
    y += 50;
    out.push('<text x="' + PAD + '" y="' + y + '" font-family="' + FONT + '" font-size="32" font-weight="400" fill="' + C.muted + '">' + esc(m.date) + '</text>');
    y += 44;
    out.push('<line x1="' + PAD + '" y1="' + y + '" x2="' + (W - PAD) + '" y2="' + y + '" stroke="' + C.line + '" stroke-width="2"/>');
    y += 30;
    var LINE_F = '500 34px ' + FONT, WHEN_F = '600 24px ' + FONT;
    function section(label, rows, withWhen) {
      if (!rows.length) return;
      y += 58; out.push('<text x="' + PAD + '" y="' + y + '" font-family="' + FONT + '" font-size="20" font-weight="700" letter-spacing="3" fill="' + C.faint + '">' + esc(label.toUpperCase()) + '</text>'); y += 14;
      rows.forEach(function (r) {
        y += 50; var x = PAD;
        if (withWhen) { out.push('<text x="' + x + '" y="' + y + '" font-family="' + FONT + '" font-size="24" font-weight="600" fill="' + C.accent + '">' + esc(r.when) + '</text>'); x += Math.max(150, measure(r.when, WHEN_F) + 28); }
        else { out.push('<circle cx="' + (x + 9) + '" cy="' + (y - 12) + '" r="7" fill="none" stroke="' + C.accent + '" stroke-width="3"/>'); x += 36; }
        out.push('<text x="' + x + '" y="' + y + '" font-family="' + FONT + '" font-size="34" font-weight="500" fill="' + C.ink + '">' + esc(fit(r.title, LINE_F, W - PAD - x)) + '</text>');
      });
    }
    section('Doing', m.doing, false);
    section('Schedule', m.schedule.concat(m.more ? [{ when: '', title: '+ ' + m.more + ' more' }] : []), true);
    section('Next up', m.next, false);
    // footer
    var fy = W - PAD + 2;
    out.push('<text x="' + PAD + '" y="' + fy + '" font-family="' + FONT + '" font-size="22" font-weight="600" fill="' + C.faint + '">made with Solo Ops</text>');
    if (m.streak) out.push('<text x="' + (W - PAD) + '" y="' + fy + '" text-anchor="end" font-family="' + FONT + '" font-size="22" font-weight="600" fill="' + C.accent + '">Day ' + m.streak + ' in a row</text>');
    out.push('</svg>');
    return out.join('');
  }
  function toPng(svgText, scale) {
    scale = scale || 2;
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' }));
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        try {
          var c = document.createElement('canvas'); c.width = SIZE * scale; c.height = SIZE * scale;
          var ctx = c.getContext('2d'); ctx.scale(scale, scale); ctx.drawImage(img, 0, 0, SIZE, SIZE);
          c.toBlob(function (b) { if (b) resolve(b); else reject(new Error('no png')); }, 'image/png');
        } catch (e) { reject(e); }
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('svg did not load')); };
      img.src = url;
    });
  }
  function canCopyImage() {
    try { return !!(navigator.clipboard && navigator.clipboard.write && typeof ClipboardItem === 'function' && (!ClipboardItem.supports || ClipboardItem.supports('image/png'))); } catch (e) { return false; }
  }
  // must be called synchronously inside the click handler (Safari drops the gesture after an await)
  function copyPng(blobPromise) {
    if (!canCopyImage()) return Promise.resolve('unsupported');
    try { return navigator.clipboard.write([new ClipboardItem({ 'image/png': blobPromise })]).then(function () { return 'copied'; }).catch(function () { return 'denied'; }); }
    catch (e) { return Promise.resolve('denied'); }
  }
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(function () { return true; }).catch(function () { return legacyCopy(text); });
    return Promise.resolve(legacyCopy(text));
  }
  function legacyCopy(text) { try { var ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); var ok = document.execCommand('copy'); ta.remove(); return ok; } catch (e) { return false; } }
  function fileName(m, scopeId) { var d = new Date(); return 'today-' + localD(d) + (scopeId && scopeId !== 'all' ? '-' + String(scopeId).replace(/[^A-Za-z0-9_-]/g, '-') : '') + '.png'; }

  /* ---- dialog ----------------------------------------------------------- */
  var SCOPE_KEY = 'marathon.share.scope'; var box = null;
  /* opts.data(scopeId) → { scope: title, tasks: [...] }   scopeId = workspace id | 'all'
     opts.scopes → [{ id, title }] (the active workspace first), opts.streak, opts.onPlan() */
  function open(opts) {
    opts = opts || {}; if (typeof document === 'undefined') return;
    var scopes = opts.scopes || [{ id: 'this', title: '' }];
    var saved = (typeof Store !== 'undefined' && Store.get(SCOPE_KEY)) || scopes[0].id;
    var scopeId = scopes.some(function (s) { return s.id === saved; }) ? saved : scopes[0].id;
    if (!box) { box = document.createElement('div'); box.className = 'share-dlg'; document.body.appendChild(box); box.addEventListener('click', function (e) { if (e.target === box) close(); }); }
    box.style.display = '';
    function draw() {
      var d = opts.data(scopeId) || { scope: '', tasks: [] }; var m = model({ now: new Date(), scope: d.scope, tasks: d.tasks, streak: opts.streak || 0 });
      var s = svg(m);
      box.innerHTML = '<div class="share-box" role="dialog" aria-label="Share today">' +
        '<div class="share-head"><b>Share today</b>' + (scopes.length > 1 ? '<span class="share-scope">' + scopes.map(function (x) { return '<button type="button" data-s="' + esc(x.id) + '" class="' + (x.id === scopeId ? 'on' : '') + '">' + esc(x.title) + '</button>'; }).join('') + '</span>' : '') + '<button type="button" class="share-x" aria-label="Close">×</button></div>' +
        (m.empty ? '<div class="share-empty"><p>Nothing planned yet' + (d.scope ? ' for ' + esc(d.scope) : '') + '.</p><p class="muted">Start a task on the board, give one a time, or let your agent plan the day.</p>' + (opts.onPlan ? '<button type="button" class="btn primary share-plan">Plan today with my agent</button>' : '') + '</div>'
          : '<div class="share-prev">' + s + '</div><div class="share-actions"><button type="button" class="btn primary share-copy">Copy image</button><button type="button" class="btn share-text">Copy as text</button><button type="button" class="guide-link share-save">Save as file</button></div><div class="share-status" aria-live="polite"></div>') +
        '</div>';
      var st = box.querySelector('.share-status'); function say(t) { if (st) st.textContent = t; }
      box.querySelector('.share-x').onclick = close;
      Array.prototype.forEach.call(box.querySelectorAll('.share-scope button'), function (b) { b.onclick = function () { scopeId = b.dataset.s; if (typeof Store !== 'undefined') Store.set(SCOPE_KEY, scopeId, { silent: true }); draw(); }; });
      var plan = box.querySelector('.share-plan'); if (plan) plan.onclick = function () { close(); opts.onPlan(); };
      var cp = box.querySelector('.share-copy'); if (cp) cp.onclick = function () {
        say('Copying…'); var p = toPng(s, 2);
        copyPng(p).then(function (r) {
          if (r === 'copied') { say('Copied. Paste it into a chat or a post.'); return; }
          return p.then(function (blob) { return save(blob); }).then(function (res) { say('Could not copy the image in this browser, so it was saved instead: ' + res.text + '.'); });
        }).catch(function () { say('Could not make the image.'); });
      };
      var tx = box.querySelector('.share-text'); if (tx) tx.onclick = function () { copyText(plain(m)).then(function (ok) { say(ok ? 'Text copied. Paste it into any chat.' : 'Could not copy.'); }); };
      var sv = box.querySelector('.share-save'); if (sv) sv.onclick = function () { say('Saving…'); toPng(s, 2).then(save).then(function (res) { say(res.text); }).catch(function () { say('Could not make the image.'); }); };
      function save(blob) { var name = fileName(m, scopeId); if (typeof Sync !== 'undefined' && Sync.saveFile) return Sync.saveFile(name, blob, 'image/png').then(function (res) { return { text: res.where === 'disk' ? 'saved as ' + name + ' in data/exports' : 'downloaded ' + name }; }); var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); return Promise.resolve({ text: 'Downloaded ' + name }); }
    }
    draw();
    document.addEventListener('keydown', onKey);
  }
  function onKey(e) { if (e.key === 'Escape') close(); }
  function close() { if (box) { box.style.display = 'none'; box.innerHTML = ''; } document.removeEventListener('keydown', onKey); }

  return { model: model, markdown: markdown, plain: plain, svg: svg, toPng: toPng, copyPng: copyPng, copyText: copyText, canCopyImage: canCopyImage, open: open, close: close, SIZE: SIZE, MAX_LINES: MAX_LINES };
});
