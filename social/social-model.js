/* =========================================================================
   social-model.js — Twitter / X posting schedule
   Post shape:
     { id, datetime, title, postType, format, project, copy,
       video:{title,status,notes,link},
       links:[{id,label,url,kind}],
       assets:[{id,name,kind,mime,size}],  // blobs in IndexedDB
       prep:[{text,done,kind}], notes, status,
       posted:{url,postedAt,stats:{views,likes,reposts,replies,bookmarks},notes,screenshotId} }
   ========================================================================= */
(function (global) {
  'use strict';

  var KEY = Config.key('social');
  var EXPORT_VER = 2;
  var POST_TYPES = (Config.get('social.postTypes') || ['announcement', 'launch', 'update', 'thread', 'teaser']).slice();
  var FORMATS = ['text', 'video', 'text+video'];
  var PROJECTS = Config.projectNames();
  var PREP_KINDS = (Config.get('social.prepKinds') || ['content', 'video', 'dev', 'design', 'outreach', 'other']).slice();

  // one-time migration from the pre-open-source key
  if (KEY === 'marathon.social.v3') Store.migrate('anshuli.social.v2', KEY);
  var STATUSES = ['draft', 'ready', 'scheduled', 'posted'];
  var VIDEO_STATUSES = ['none', 'idea', 'scripted', 'recorded', 'edited', 'ready'];
  var LINK_KINDS = ['video', 'post', 'reference', 'other'];
  var ASSET_KINDS = ['post-image', 'reference', 'posted-screenshot'];

  var state = null;

  function uid(prefix) {
    prefix = prefix || 'p';
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
  function esc(s) { return String(s == null ? '' : s); }

  function normalizeStats(s) {
    s = s || {};
    return {
      views: esc(s.views),
      likes: esc(s.likes),
      reposts: esc(s.reposts),
      replies: esc(s.replies),
      bookmarks: esc(s.bookmarks)
    };
  }

  function normalizePosted(p) {
    if (!p) return { url: '', postedAt: '', stats: normalizeStats({}), notes: '', screenshotId: '', screenshotDataUrl: '' };
    return {
      url: esc(p.url),
      postedAt: esc(p.postedAt),
      stats: normalizeStats(p.stats),
      notes: esc(p.notes),
      screenshotId: esc(p.screenshotId),
      screenshotDataUrl: p.screenshotDataUrl || ''
    };
  }

  function normalizeLink(l) {
    return {
      id: l.id || uid('l'),
      label: esc(l.label),
      url: esc(l.url),
      kind: LINK_KINDS.indexOf(l.kind) >= 0 ? l.kind : 'other'
    };
  }

  function normalizeAsset(a) {
    return {
      id: a.id || uid('a'),
      name: esc(a.name),
      kind: ASSET_KINDS.indexOf(a.kind) >= 0 ? a.kind : 'post-image',
      mime: esc(a.mime || 'image/png'),
      size: a.size || 0
    };
  }

  function normalizePost(p) {
    return {
      id: p.id || uid('p'),
      datetime: p.datetime || new Date().toISOString().slice(0, 16),
      title: esc(p.title),
      postType: POST_TYPES.indexOf(p.postType) >= 0 ? p.postType : (POST_TYPES[2] || POST_TYPES[0]),
      format: FORMATS.indexOf(p.format) >= 0 ? p.format : 'text',
      project: (typeof p.project === 'string' && p.project.trim()) ? p.project.trim() : PROJECTS[0],
      copy: esc(p.copy),
      video: {
        title: esc((p.video && p.video.title) || ''),
        status: VIDEO_STATUSES.indexOf(p.video && p.video.status) >= 0 ? p.video.status : 'none',
        notes: esc((p.video && p.video.notes) || ''),
        link: esc((p.video && p.video.link) || '')
      },
      links: Array.isArray(p.links) ? p.links.map(normalizeLink) : [],
      assets: Array.isArray(p.assets) ? p.assets.map(normalizeAsset) : [],
      prep: Array.isArray(p.prep) ? p.prep.map(function (x) {
        return {
          text: esc(x.text),
          done: !!x.done,
          kind: PREP_KINDS.indexOf(x.kind) >= 0 ? x.kind : 'other'
        };
      }) : [],
      notes: esc(p.notes),
      status: STATUSES.indexOf(p.status) >= 0 ? p.status : 'draft',
      posted: normalizePosted(p.posted)
    };
  }

  function seed() { return MARATHON_TEMPLATES.social(new Date()).posts.map(normalizePost); }

  // config projects + anything already used on a post (first wins)
  function getProjects() {
    var seen = {}, out = [];
    PROJECTS.concat((state || []).map(function (p) { return p.project; })).forEach(function (p) {
      if (p && !seen[p]) { seen[p] = 1; out.push(p); }
    });
    return out;
  }

  // find by id, or by case-insensitive title substring (palette + CLI parity)
  function find(q) {
    q = String(q || '').trim(); if (!q) return [];
    var exact = state.filter(function (p) { return p.id === q; }); if (exact.length) return exact;
    var l = q.toLowerCase();
    return state.filter(function (p) { return p.title.toLowerCase().indexOf(l) >= 0; });
  }

  var fresh = false;
  function persist(opts) {
    Store.set(KEY, JSON.stringify(state), opts);
  }

  function load() {
    var raw = Store.get(KEY);
    if (raw) {
      try {
        var parsed = JSON.parse(raw);
        parsed.forEach(function (p) {
          (p.assets || []).forEach(function (a) {
            if (a.dataUrl && global.SocialImageStore) SocialImageStore.set(a.id, a.dataUrl);
          });
          if (p.posted && p.posted.screenshotDataUrl && p.posted.screenshotId && global.SocialImageStore) {
            SocialImageStore.set(p.posted.screenshotId, p.posted.screenshotDataUrl);
          }
        });
        state = parsed.map(normalizePost);
        return;
      } catch (e) { /* fall through */ }
    }
    fresh = true;
    state = seed();
    persist({ silent: true });
    Store.markFresh(KEY);
  }

  function sorted() {
    return state.slice().sort(function (a, b) {
      return a.datetime.localeCompare(b.datetime);
    });
  }

  function gapLabel(prevDt, curDt) {
    if (!prevDt || !curDt) return '';
    var a = new Date(prevDt);
    var b = new Date(curDt);
    var hrs = Math.round((b - a) / 3600000);
    if (hrs < 24) return hrs + 'h apart';
    var days = Math.round(hrs / 24);
    return days + (days === 1 ? ' day apart' : ' days apart');
  }

  function allAssetIds() {
    var ids = [];
    state.forEach(function (p) {
      (p.assets || []).forEach(function (a) { ids.push(a.id); });
      if (p.posted && p.posted.screenshotId) ids.push(p.posted.screenshotId);
    });
    return ids.filter(function (id, i, arr) { return arr.indexOf(id) === i; });
  }

  global.SocialModel = {
    KEY: KEY,
    EXPORT_VER: EXPORT_VER,
    POST_TYPES: POST_TYPES,
    FORMATS: FORMATS,
    PROJECTS: PROJECTS,
    PREP_KINDS: PREP_KINDS,
    STATUSES: STATUSES,
    VIDEO_STATUSES: VIDEO_STATUSES,
    LINK_KINDS: LINK_KINDS,
    ASSET_KINDS: ASSET_KINDS,

    init: load,
    isFresh: function () { return fresh || Store.isFresh(KEY); },
    getProjects: getProjects,
    find: find,
    getState: function () { return state; },
    replaceAll: function (posts, opts) { state = (posts || []).map(normalizePost); persist(opts); return state; },
    getSorted: sorted,
    getPosted: function () { return sorted().filter(function (p) { return p.status === 'posted'; }); },
    getById: function (id) {
      return state.find(function (p) { return p.id === id; }) || null;
    },

    getAssetDataUrl: function (postId, assetId) {
      if (!assetId) return '';
      var stored = global.SocialImageStore ? SocialImageStore.get(assetId) : '';
      if (stored) return stored;
      var p = global.SocialModel.getById(postId);
      if (!p) return '';
      if (p.posted && p.posted.screenshotId === assetId && p.posted.screenshotDataUrl) {
        return p.posted.screenshotDataUrl;
      }
      var a = (p.assets || []).find(function (x) { return x.id === assetId; });
      return (a && a.dataUrl) ? a.dataUrl : '';
    },

    gapLabel: gapLabel,
    allAssetIds: allAssetIds,

    addPost: function (partial) {
      var p = normalizePost(Object.assign({
        title: 'New post',
        datetime: new Date().toISOString().slice(0, 16),
        copy: '',
        prep: [],
        links: [],
        assets: []
      }, partial || {}));
      state.push(p);
      persist();
      return p.id;
    },

    updatePost: function (id, patch) {
      var i = state.findIndex(function (p) { return p.id === id; });
      if (i < 0) return;
      var merged = Object.assign({}, state[i], patch);
      if (patch.video) merged.video = Object.assign({}, state[i].video, patch.video);
      if (patch.posted) merged.posted = Object.assign({}, state[i].posted, patch.posted);
      if (patch.posted && patch.posted.stats) {
        merged.posted.stats = Object.assign({}, state[i].posted.stats, patch.posted.stats);
      }
      state[i] = normalizePost(merged);
      persist();
    },

    markPosted: function (id) {
      var p = global.SocialModel.getById(id);
      if (!p) return;
      global.SocialModel.updatePost(id, {
        status: 'posted',
        posted: {
          postedAt: p.posted.postedAt || new Date().toISOString().slice(0, 16)
        }
      });
    },

    unmarkPosted: function (id) {
      var p = global.SocialModel.getById(id);
      if (!p || p.status !== 'posted') return;
      global.SocialModel.updatePost(id, { status: 'draft' });
    },

    addLink: function (postId, label, url, kind) {
      var p = global.SocialModel.getById(postId);
      if (!p || !url.trim()) return;
      p.links.push(normalizeLink({ label: label || url, url: url.trim(), kind: kind || 'other' }));
      persist();
    },

    removeLink: function (postId, linkId) {
      var p = global.SocialModel.getById(postId);
      if (!p) return;
      p.links = p.links.filter(function (l) { return l.id !== linkId; });
      persist();
    },

    addAssetMeta: function (postId, asset) {
      var p = global.SocialModel.getById(postId);
      if (!p) return null;
      var a = normalizeAsset(asset);
      p.assets.push(a);
      persist();
      return a.id;
    },

    removeAsset: function (postId, assetId) {
      var p = global.SocialModel.getById(postId);
      if (!p) return;
      p.assets = p.assets.filter(function (a) { return a.id !== assetId; });
      if (p.posted.screenshotId === assetId) {
        p.posted.screenshotId = '';
        p.posted.screenshotDataUrl = '';
      }
      if (global.SocialImageStore) SocialImageStore.remove(assetId);
      persist();
      return SocialAssets.remove(assetId);
    },

    setPostedScreenshot: function (postId, assetId, dataUrl) {
      global.SocialModel.updatePost(postId, {
        posted: { screenshotId: assetId, screenshotDataUrl: dataUrl || '' }
      });
    },

    deletePost: function (id) {
      var p = global.SocialModel.getById(id);
      var assetIds = (p && p.assets || []).map(function (a) { return a.id; });
      if (p && p.posted && p.posted.screenshotId) assetIds.push(p.posted.screenshotId);
      state = state.filter(function (p) { return p.id !== id; });
      persist();
      return SocialAssets.removeForPost(id, assetIds);
    },

    togglePrep: function (postId, idx) {
      var p = global.SocialModel.getById(postId);
      if (!p || !p.prep[idx]) return;
      p.prep[idx].done = !p.prep[idx].done;
      persist();
    },

    addPrep: function (postId, text, kind) {
      var p = global.SocialModel.getById(postId);
      if (!p || !text.trim()) return;
      p.prep.push({ text: text.trim(), done: false, kind: kind || 'other' });
      persist();
    },

    removePrep: function (postId, idx) {
      var p = global.SocialModel.getById(postId);
      if (!p) return;
      p.prep.splice(idx, 1);
      persist();
    },

    reset: function () {
      state = seed();
      persist();
      if (global.SocialImageStore) SocialImageStore.clear();
    },

    exportBundle: function () {
      var ids = allAssetIds();
      return SocialAssets.exportAll(ids).then(function (assets) {
        return JSON.stringify({
          version: EXPORT_VER,
          exportedAt: new Date().toISOString(),
          posts: state,
          assets: assets,
          imageData: global.SocialImageStore ? SocialImageStore.exportAll() : {}
        }, null, 2);
      });
    },

    importBundle: function (raw) {
      var parsed = JSON.parse(raw);
      if (parsed.version >= 2 && parsed.posts) {
        state = parsed.posts.map(normalizePost);
        persist();
        if (global.SocialImageStore && parsed.imageData) {
          SocialImageStore.importAll(parsed.imageData);
        }
        return SocialAssets.importAll(parsed.assets || {}).then(function () { return state.length; });
      }
      if (Array.isArray(parsed)) {
        state = parsed.map(normalizePost);
        persist();
        return Promise.resolve(state.length);
      }
      // data/social.json wrapper
      if (parsed && Array.isArray(parsed.posts)) {
        state = parsed.posts.map(normalizePost);
        persist();
        return Promise.resolve(state.length);
      }
      throw new Error('Unrecognized file format');
    }
  };
})(window);
