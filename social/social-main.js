/* =========================================================================
   social-main.js — wiring for social posting schedule board
   ========================================================================= */
(function (global) {
  'use strict';

  var selectedId = null;

  function render() {
    SocialView.render(selectedId);
  }

  function flash(msg) {
    var el = document.getElementById('flash');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(flash._t);
    flash._t = setTimeout(function () { el.classList.remove('show'); }, 2800);
  }

  function uid(prefix) {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function readFileAsDataURL(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = function () { reject(r.error || new Error('Could not read file')); };
      r.readAsDataURL(file);
    });
  }

  global.selectPost = function (id) {
    selectedId = id;
    render();
    var det = document.getElementById('detail');
    if (det) det.scrollTop = 0;
  };

  global.triggerFileUpload = function (kind) {
    if (!selectedId) {
      alert('Select a post in the Sequence list first (left panel).');
      return;
    }
    var input = document.getElementById(kind === 'reference' ? 'fileReference' : 'filePostImage');
    if (input) input.click();
  };

  global.triggerScreenshotUpload = function () {
    if (!selectedId) return;
    var input = document.getElementById('fileScreenshot');
    if (input) input.click();
  };

  global.updateField = function (id, field, value) {
    SocialModel.updatePost(id, (function () { var o = {}; o[field] = value; return o; })());
    render();
  };

  global.updateVideo = function (id, field, value) {
    var patch = { video: {} };
    patch.video[field] = value;
    SocialModel.updatePost(id, patch);
    render();
  };

  global.updatePosted = function (id, field, value) {
    var patch = { posted: {} };
    patch.posted[field] = value;
    SocialModel.updatePost(id, patch);
    render();
  };

  global.updatePostedStat = function (id, stat, value) {
    var patch = { posted: { stats: {} } };
    patch.posted.stats[stat] = value;
    SocialModel.updatePost(id, patch);
    render();
  };

  global.markPosted = function (id) {
    SocialModel.markPosted(id);
    flash('Marked as posted — add URL, stats & screenshot below.');
    render();
  };

  global.unmarkPosted = function (id) {
    if (!confirm('Undo posted? Goes back to draft — URL, stats & screenshot stay saved.')) return;
    SocialModel.unmarkPosted(id);
    flash('Unmarked — back to draft.');
    render();
  };

  global.togglePrep = function (postId, idx) {
    SocialModel.togglePrep(postId, idx);
    render();
  };

  global.addPrepItem = function (postId) {
    var inp = document.getElementById('newPrepText');
    var kind = document.getElementById('newPrepKind');
    if (!inp) return;
    SocialModel.addPrep(postId, inp.value, kind ? kind.value : 'other');
    inp.value = '';
    render();
  };

  global.removePrep = function (postId, idx) {
    SocialModel.removePrep(postId, idx);
    render();
  };

  global.addLinkItem = function (postId) {
    var url = document.getElementById('newLinkUrl');
    var kind = document.getElementById('newLinkKind');
    if (!url || !url.value.trim()) return;
    SocialModel.addLink(postId, url.value.trim(), url.value, kind ? kind.value : 'other');
    url.value = '';
    flash('Link added.');
    render();
  };

  global.removeLink = function (postId, linkId) {
    SocialModel.removeLink(postId, linkId);
    render();
  };

  global.uploadAssets = function (postId, kind, input) {
    var files = input && input.files;
    if (!files || !files.length) return;
    if (!SocialModel.getById(postId)) {
      alert('Post not found — select a post and try again.');
      return;
    }
    var fileList = Array.prototype.slice.call(files);
    if (input) input.value = '';

    var chain = Promise.resolve();
    fileList.forEach(function (file) {
      chain = chain.then(function () {
        var assetId = uid('a');
        return readFileAsDataURL(file).then(function (dataUrl) {
          SocialImageStore.set(assetId, dataUrl);
          SocialModel.addAssetMeta(postId, {
            id: assetId,
            name: file.name,
            kind: kind,
            mime: file.type || 'image/png',
            size: file.size
          });
          return SocialAssets.put(assetId, postId, file.name, file);
        });
      });
    });

    chain.then(function () {
      flash('Image attached — scroll up to see preview.');
      render();
    }).catch(function (e) {
      alert('Upload failed: ' + (e && e.message ? e.message : e));
    });
  };

  global.uploadPostedScreenshot = function (postId, input) {
    var file = input && input.files && input.files[0];
    if (input) input.value = '';
    if (!file) return;
    var assetId = uid('a');
    readFileAsDataURL(file).then(function (dataUrl) {
      SocialImageStore.set(assetId, dataUrl);
      return SocialAssets.put(assetId, postId, file.name, file).then(function () {
        SocialModel.setPostedScreenshot(postId, assetId, dataUrl);
        flash('Screenshot saved.');
        render();
      });
    }).catch(function (e) {
      alert('Upload failed: ' + (e && e.message ? e.message : e));
    });
  };

  global.removePostedScreenshot = function (postId) {
    var p = SocialModel.getById(postId);
    if (!p || !p.posted.screenshotId) return;
    var id = p.posted.screenshotId;
    SocialImageStore.remove(id);
    SocialModel.updatePost(postId, { posted: { screenshotId: '', screenshotDataUrl: '' } });
    SocialAssets.remove(id).then(render);
  };

  global.viewAsset = function (assetId, postId, name) {
    var dataUrl = SocialModel.getAssetDataUrl(postId, assetId);
    if (dataUrl) {
      SocialImage.openLightbox(dataUrl, name);
      return;
    }
    SocialAssets.getURL(assetId).then(function (url) {
      if (url) {
        SocialImage.openLightbox(url, name);
        return;
      }
      SocialImage.openLightbox(SocialImage.folderPath(postId, name), name);
    });
  };

  global.downloadAsset = function (assetId, name, postId) {
    var dataUrl = postId ? SocialModel.getAssetDataUrl(postId, assetId) : '';
    if (dataUrl) {
      SocialAssets.downloadDataUrl(dataUrl, name);
      flash('Downloaded.');
      return;
    }
    SocialAssets.downloadOriginal(assetId, name).then(function () {
      flash('Downloaded.');
    });
  };

  global.removeAsset = function (postId, assetId) {
    if (!confirm('Remove this image?')) return;
    SocialModel.removeAsset(postId, assetId).then(function () {
      flash('Image removed.');
      render();
    });
  };

  global.exportAssetsToFolder = function (postId) {
    var p = SocialModel.getById(postId);
    if (!p || !p.assets.length) {
      flash('No images to export.');
      return;
    }
    var i = 0;
    function next() {
      if (i >= p.assets.length) {
        flash('Downloaded ' + p.assets.length + ' file(s).');
        return;
      }
      var a = p.assets[i++];
      var dataUrl = SocialModel.getAssetDataUrl(postId, a.id);
      if (dataUrl) {
        SocialAssets.downloadDataUrl(dataUrl, a.name);
        setTimeout(next, 300);
      } else {
        SocialAssets.downloadOriginal(a.id, a.name).then(next);
      }
    }
    next();
  };

  global.addPost = function () {
    var dt = document.getElementById('newDatetime');
    var title = document.getElementById('newTitle');
    var id = SocialModel.addPost({
      datetime: dt && dt.value ? dt.value : new Date().toISOString().slice(0, 16),
      title: title && title.value.trim() ? title.value.trim() : 'New post'
    });
    if (title) title.value = '';
    selectedId = id;
    document.getElementById('addpanel').classList.remove('open');
    flash('Post added.');
    render();
  };

  global.toggleAdd = function () {
    document.getElementById('addpanel').classList.toggle('open');
    var dt = document.getElementById('newDatetime');
    if (dt && !dt.value) dt.value = new Date().toISOString().slice(0, 16);
  };

  global.deletePost = function (id) {
    if (!confirm('Delete this post, images, and prep work?')) return;
    SocialModel.deletePost(id).then(function () {
      if (selectedId === id) selectedId = null;
      flash('Post deleted.');
      render();
    });
  };

  global.exportState = function () {
    SocialModel.exportBundle().then(function (json) {
      var blob = new Blob([json], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'social-schedule-' + new Date().toISOString().slice(0, 10) + '.json';
      a.click();
      URL.revokeObjectURL(a.href);
      flash('Saved — posts + images included.');
    }).catch(function (e) {
      alert('Export failed: ' + e.message);
    });
  };

  global.importState = function (input) {
    var file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      SocialModel.importBundle(reader.result).then(function () {
        selectedId = SocialModel.getSorted()[0] ? SocialModel.getSorted()[0].id : null;
        flash('Schedule loaded (with images if included).');
        render();
      }).catch(function (e) {
        alert('Could not load file: ' + e.message);
      });
    };
    reader.readAsText(file);
  };

  // Destructive: a backup downloads first (same as the task board).
  global.loadTemplate = function () {
    if (!confirm('Load the sample posting arc?\n\nYour current schedule will be replaced. A backup file (with images) is downloaded first.')) return;
    SocialModel.exportBundle().then(function (json) {
      var blob = new Blob([json], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'social-backup-' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-') + '.json';
      a.click(); URL.revokeObjectURL(a.href);
      SocialModel.reset();
      selectedId = SocialModel.getSorted()[0] ? SocialModel.getSorted()[0].id : null;
      flash('Sample schedule loaded — backup downloaded.');
      render();
    });
  };
  global.clearBoard = function () {
    if (!confirm('Start with an empty schedule?\n\nA backup file is downloaded first.')) return;
    SocialModel.exportBundle().then(function (json) {
      var blob = new Blob([json], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'social-backup.json'; a.click(); URL.revokeObjectURL(a.href);
      SocialModel.replaceAll([]); selectedId = null; flash('Schedule cleared — backup downloaded.'); render();
    });
  };

  /* ---- sync: data/social.json (posts only; images stay in the browser and
          in Save file bundles) ---------------------------------------- */
  function registerSync() {
    Sync.register({
      file: Config.file('social'), key: SocialModel.KEY, label: 'schedule', isFresh: SocialModel.isFresh,
      read: function () { return { posts: SocialModel.getState() }; },
      apply: function (body) {
        if (!Array.isArray(body.posts)) return;
        SocialModel.replaceAll(body.posts, { silent: true });
        if (selectedId && !SocialModel.getById(selectedId)) selectedId = null;
        render();
      }
    });
    Sync.on(function (evt, d) {
      if (evt === 'applied' && d.file === Config.file('social')) flash('Schedule updated from data/' + d.file + '.');
      if (evt === 'linked') flash('Folder linked — the schedule now writes data/' + Config.file('social') + ' directly.');
    });
  }

  /* ---- command palette ------------------------------------------------ */
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function localDT(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  // "add Launch day @launch +3d 9:00 #launch" → post 3 days from now at 9:00
  function parseAddArg(arg) {
    var o = { postType: null, project: null };
    var d = new Date(); d.setHours(9, 0, 0, 0); d.setDate(d.getDate() + 1);
    var title = arg.replace(/(^|\s)@(\S+)/g, function (_, sp, p) { o.project = p; return sp; })
      .replace(/(^|\s)#(\S+)/g, function (_, sp, t) { o.postType = t.toLowerCase(); return sp; })
      .replace(/(^|\s)\+(\d+)d\b/g, function (_, sp, n) { d = new Date(); d.setHours(9, 0, 0, 0); d.setDate(d.getDate() + parseInt(n, 10)); return sp; })
      .replace(/(^|\s)(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/g, function (_, sp, day, hm) { d = new Date(day + 'T' + (hm || '09:00')); return sp; })
      .replace(/(^|\s)(\d{1,2}):(\d{2})\b/g, function (_, sp, h, m) { d.setHours(parseInt(h, 10), parseInt(m, 10), 0, 0); return sp; })
      .replace(/\s+/g, ' ').trim();
    o.title = title; o.datetime = localDT(d);
    return o;
  }
  function pick(q) {
    var m = SocialModel.find(q);
    if (!m.length) { flash('No post matches "' + q + '".'); return null; }
    if (m.length > 1) { flash(m.length + ' posts match "' + q + '" — be more specific.'); return null; }
    return m[0];
  }
  function registerPalette() {
    Palette.init({ root: '../' });
    Palette.register([
      { label: 'Add post', prefix: 'add', hint: 'add <title> @project #type +3d 17:30', keywords: 'new post schedule', run: function (arg) {
        var o = parseAddArg(arg); if (!o.title) { flash('Give the post a title.'); return; }
        var partial = { title: o.title, datetime: o.datetime };
        if (o.project) partial.project = o.project;
        if (o.postType) partial.postType = o.postType;
        selectedId = SocialModel.addPost(partial); render(); flash('Added "' + o.title + '" for ' + o.datetime.replace('T', ' ') + '.');
      } },
      { label: 'Mark as posted', prefix: 'posted', hint: 'posted <id or title>', keywords: 'done live', run: function (arg) {
        var p = pick(arg); if (p) { SocialModel.markPosted(p.id); selectedId = p.id; render(); flash('Posted: ' + p.title); }
      } },
      { label: 'Mark ready', prefix: 'ready', hint: 'ready <id or title>', run: function (arg) {
        var p = pick(arg); if (p) { SocialModel.updatePost(p.id, { status: 'ready' }); selectedId = p.id; render(); flash('Ready: ' + p.title); }
      } },
      { label: 'Open post', prefix: 'find', hint: 'find <title>', keywords: 'open select search', run: function (arg) {
        var p = pick(arg); if (p) { selectPost(p.id); }
      } },
      { label: 'Delete post', prefix: 'rm', hint: 'rm <id or title>', keywords: 'delete remove', run: function (arg) {
        var p = pick(arg); if (p) deletePost(p.id);
      } },
      { label: 'Next unposted', hint: 'view', keywords: 'upcoming', run: function () {
        var n = SocialModel.getSorted().find(function (p) { return p.status !== 'posted'; }); if (n) selectPost(n.id); else flash('Everything is posted.');
      } },
      { label: 'Open calendar', hint: 'nav', run: function () { location.href = 'social-calendar.html?ws=' + encodeURIComponent(Config.activeWs()); } },
      { label: 'Save schedule to file', hint: 'export', keywords: 'download json backup', run: global.exportState },
      { label: 'Load schedule from file', hint: 'import', keywords: 'upload', run: function () { document.getElementById('importFile').click(); } },
      { label: 'Load sample schedule', hint: 'template', keywords: 'reset example', run: global.loadTemplate },
      { label: 'Start with an empty schedule', hint: 'template', keywords: 'clear blank', run: global.clearBoard }
    ]);
    document.addEventListener('keydown', function (e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      var tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;
      if (Palette.isOpen()) return;
      if (e.key === 'n') { e.preventDefault(); var p = document.getElementById('addpanel'); if (!p.classList.contains('open')) toggleAdd(); document.getElementById('newTitle').focus(); }
      else if (e.key === '/') { e.preventDefault(); Palette.open(); }
    });
  }

  function bindFileInputs() {
    var postInp = document.getElementById('filePostImage');
    var refInp = document.getElementById('fileReference');
    var shotInp = document.getElementById('fileScreenshot');

    if (postInp) {
      postInp.addEventListener('change', function () {
        if (!selectedId || !this.files.length) return;
        uploadAssets(selectedId, 'post-image', this);
      });
    }
    if (refInp) {
      refInp.addEventListener('change', function () {
        if (!selectedId || !this.files.length) return;
        uploadAssets(selectedId, 'reference', this);
      });
    }
    if (shotInp) {
      shotInp.addEventListener('change', function () {
        if (!selectedId || !this.files.length) return;
        uploadPostedScreenshot(selectedId, this);
      });
    }
  }

  function init() {
    Config.applyDOM();
    SocialModel.init();
    SocialAssets.open().catch(function () {});
    bindFileInputs();
    registerSync();
    registerPalette();
    var params = new URLSearchParams(location.search);
    var fromGraph = params.get('id');
    var posts = SocialModel.getSorted();
    selectedId = (fromGraph && SocialModel.getById(fromGraph)) ? fromGraph : (posts.length ? posts[0].id : null);
    render();
    var note = document.getElementById('storeNote');
    if (note) {
      note.textContent = (Store.ok ? (SocialModel.isFresh() ? 'This is the sample posting arc — edit it or add your own.' : 'Auto-saves to browser') : 'Storage limited — use Save file')
        + ' · ⌘K for commands · n adds a post · images stay in this browser (Save file bundles them)';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
