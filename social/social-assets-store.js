/* =========================================================================
   social-assets-store.js — image blobs (IndexedDB + in-memory fallback)
   ========================================================================= */
(function (global) {
  'use strict';

  var DB_NAME = 'marathon.social.assets';
  var DB_VER = 1;
  var STORE = 'blobs';
  var db = null;
  var mem = {};
  var idbOk = null;

  function openDB() {
    return new Promise(function (resolve, reject) {
      if (idbOk === false) return reject(new Error('IndexedDB unavailable'));
      if (db) return resolve(db);
      if (!global.indexedDB) {
        idbOk = false;
        return reject(new Error('IndexedDB not available'));
      }
      var req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = function (e) {
        var d = e.target.result;
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
      };
      req.onsuccess = function (e) {
        db = e.target.result;
        idbOk = true;
        resolve(db);
      };
      req.onerror = function () {
        idbOk = false;
        reject(req.error || new Error('IndexedDB open failed'));
      };
      req.onblocked = function () {
        idbOk = false;
        reject(new Error('IndexedDB blocked'));
      };
    });
  }

  function memPut(id, postId, name, blob) {
    mem[id] = { postId: postId, name: name, mime: blob.type || 'image/png', blob: blob };
    return id;
  }

  function memGet(id) {
    return mem[id] || null;
  }

  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () {
        var s = r.result;
        resolve(s.indexOf(',') >= 0 ? s.split(',')[1] : s);
      };
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }

  function base64ToBlob(b64, mime) {
    var bin = atob(b64);
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime || 'application/octet-stream' });
  }

  global.SocialAssets = {
    open: openDB,
    idbAvailable: function () { return idbOk !== false; },

    put: function (id, postId, name, blob) {
      memPut(id, postId, name, blob);
      return openDB().then(function (d) {
        return new Promise(function (resolve, reject) {
          var tx = d.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).put({ postId: postId, name: name, mime: blob.type || 'image/png', blob: blob }, id);
          tx.oncomplete = function () { resolve(id); };
          tx.onerror = function () {
            resolve(id);
          };
        });
      }).catch(function () {
        return id;
      });
    },

    get: function (id) {
      return openDB().then(function (d) {
        return new Promise(function (resolve, reject) {
          var req = d.transaction(STORE, 'readonly').objectStore(STORE).get(id);
          req.onsuccess = function () { resolve(req.result || memGet(id)); };
          req.onerror = function () { resolve(memGet(id)); };
        });
      }).catch(function () {
        return memGet(id);
      });
    },

    getURL: function (id) {
      return global.SocialAssets.get(id).then(function (rec) {
        if (!rec || !rec.blob) return null;
        try {
          return URL.createObjectURL(rec.blob);
        } catch (e) {
          return null;
        }
      });
    },

    remove: function (id) {
      delete mem[id];
      return openDB().then(function (d) {
        return new Promise(function (resolve) {
          var tx = d.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).delete(id);
          tx.oncomplete = resolve;
          tx.onerror = resolve;
        });
      }).catch(function () {});
    },

    removeForPost: function (postId, assetIds) {
      var chain = Promise.resolve();
      assetIds.forEach(function (id) {
        chain = chain.then(function () { return global.SocialAssets.remove(id); });
      });
      return chain;
    },

    exportAll: function (assetIds) {
      var out = {};
      var chain = Promise.resolve();
      assetIds.forEach(function (id) {
        chain = chain.then(function () {
          return global.SocialAssets.get(id).then(function (rec) {
            if (!rec) return;
            return blobToBase64(rec.blob).then(function (b64) {
              out[id] = { postId: rec.postId, name: rec.name, mime: rec.mime, data: b64 };
            });
          });
        });
      });
      return chain.then(function () { return out; });
    },

    importAll: function (assetsMap) {
      var ids = Object.keys(assetsMap || {});
      var chain = Promise.resolve();
      ids.forEach(function (id) {
        chain = chain.then(function () {
          var a = assetsMap[id];
          if (!a || !a.data) return;
          var blob = base64ToBlob(a.data, a.mime);
          return global.SocialAssets.put(id, a.postId, a.name, blob);
        });
      });
      return chain;
    },

    downloadOriginal: function (id, name) {
      return global.SocialAssets.get(id).then(function (rec) {
        if (!rec) return;
        var url = URL.createObjectURL(rec.blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = name || rec.name || 'image';
        a.click();
        setTimeout(function () { URL.revokeObjectURL(url); }, 500);
      });
    },

    downloadDataUrl: function (dataUrl, name) {
      var a = document.createElement('a');
      a.href = dataUrl;
      a.download = name || 'image';
      a.click();
    },

    folderPath: function (postId, name) {
      return 'social-assets/' + postId + '/' + name;
    }
  };
})(window);
