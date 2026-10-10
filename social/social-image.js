/* =========================================================================
   social-image.js — resolve & display images (dataUrl + IndexedDB + folder)
   ========================================================================= */
(function (global) {
  'use strict';

  function folderPath(postId, name) {
    return 'social-assets/' + postId + '/' + encodeURIComponent(name).replace(/%2F/g, '/');
  }

  function dataUrlForEl(el) {
    var postId = el.getAttribute('data-asset-post') || '';
    var id = el.getAttribute('data-asset-preview')
      || el.getAttribute('data-asset-thumb')
      || el.getAttribute('data-asset-id');
    if (!id) return '';
    if (global.SocialImageStore) {
      var stored = SocialImageStore.get(id);
      if (stored) return stored;
    }
    if (!postId || !global.SocialModel) return '';
    return SocialModel.getAssetDataUrl(postId, id);
  }

  function applyToEl(el, url, name, onFail) {
    if (!url) {
      if (onFail) onFail();
      return;
    }
    if (el.classList.contains('tl-thumb') || el.classList.contains('pli-thumb') || el.classList.contains('cal-thumb')) {
      el.style.backgroundImage = 'url("' + url + '")';
      el.style.backgroundSize = 'cover';
      el.style.backgroundPosition = 'center';
      el.dataset.viewUrl = url;
      el.dataset.viewName = name || '';
      el.classList.add('has-img');
      el.style.cursor = 'zoom-in';
      el.onclick = function (e) {
        e.stopPropagation();
        e.preventDefault();
        global.SocialImage.openLightbox(url, name);
      };
      return;
    }
    var img = document.createElement('img');
    img.src = url;
    img.alt = name || '';
    img.loading = 'lazy';
    img.onclick = function (e) {
      e.stopPropagation();
      SocialImage.openLightbox(url, name);
    };
    img.onerror = function () {
      if (onFail) onFail();
    };
    el.innerHTML = '';
    el.appendChild(img);
    el.classList.add('clickable-preview');
  }

  function showMissing(el, name) {
    el.classList.add('img-missing');
    el.innerHTML = '<span class="img-ph">📁 ' + (name || 'image') + '</span>';
  }

  function resolveAndFill(el) {
    var id = el.getAttribute('data-asset-preview')
      || el.getAttribute('data-asset-thumb')
      || el.getAttribute('data-asset-id');
    if (!id) return Promise.resolve();

    var postId = el.getAttribute('data-asset-post') || '';
    var name = el.getAttribute('data-asset-name') || '';
    var localPath = name && postId ? folderPath(postId, name) : '';

    var stored = dataUrlForEl(el);
    if (stored) {
      applyToEl(el, stored, name);
      return Promise.resolve();
    }

    function tryLocal() {
      if (!localPath) {
        showMissing(el, name);
        return;
      }
      applyToEl(el, localPath, name, function () {
        showMissing(el, name);
      });
    }

    return SocialAssets.getURL(id).then(function (blobUrl) {
      if (blobUrl) {
        applyToEl(el, blobUrl, name);
        return;
      }
      tryLocal();
    }).catch(function () {
      tryLocal();
    });
  }

  global.SocialImage = {
    folderPath: folderPath,

    hydrateAll: function () {
      var els = document.querySelectorAll('[data-asset-preview],[data-asset-thumb],[data-asset-id]');
      var chain = Promise.resolve();
      for (var i = 0; i < els.length; i++) {
        (function (el) {
          chain = chain.then(function () { return resolveAndFill(el); });
        })(els[i]);
      }
      return chain;
    },

    openLightbox: function (url, name) {
      var lb = document.getElementById('imgLightbox');
      var img = document.getElementById('lightboxImg');
      var cap = document.getElementById('lightboxCap');
      if (!lb || !img) {
        window.open(url, '_blank');
        return;
      }
      img.src = url;
      if (cap) cap.textContent = name || '';
      lb.classList.add('open');
      document.body.style.overflow = 'hidden';
    },

    closeLightbox: function () {
      var lb = document.getElementById('imgLightbox');
      if (!lb) return;
      lb.classList.remove('open');
      document.body.style.overflow = '';
    }
  };

  global.closeLightbox = function () { SocialImage.closeLightbox(); };
})(window);
