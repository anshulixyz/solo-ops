/* =========================================================================
   social-main.js — wiring for social posting schedule board
   ========================================================================= */
(function (global) {
  'use strict';

  var selectedId = null;
  var THEME_KEY = 'anshuli.runway.theme';

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

  global.resetBoard = function () {
    if (!confirm('Reset to the default 3-post schedule? Posts, images, and edits will be lost.')) return;
    SocialModel.reset();
    selectedId = SocialModel.getSorted()[0] ? SocialModel.getSorted()[0].id : null;
    flash('Reset to defaults.');
    render();
  };

  global.toggleTheme = function () {
    var cur = document.documentElement.getAttribute('data-theme') || 'light';
    var next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    document.documentElement.style.colorScheme = next;
    Store.set(THEME_KEY, next);
  };

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
    SocialModel.init();
    SocialAssets.open().catch(function () {});
    bindFileInputs();
    var params = new URLSearchParams(location.search);
    var fromGraph = params.get('id');
    var posts = SocialModel.getSorted();
    selectedId = (fromGraph && SocialModel.getById(fromGraph)) ? fromGraph : (posts.length ? posts[0].id : null);
    render();
    var note = document.getElementById('storeNote');
    if (note) {
      note.textContent = (Store.ok ? 'Auto-saves to browser' : 'Storage limited — use Save file')
        + ' · select a post, then + Post image';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
