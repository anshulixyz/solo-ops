/* =========================================================================
   social-view.js — visual timeline, sequence list, detail panel
   ========================================================================= */
(function (global) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function projHue(p) { return Config.projectHue(p); }

  function fmtDate(dt) {
    if (!dt) return '—';
    var d = new Date(dt);
    if (isNaN(d)) return dt;
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
      + ' · ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  function fmtShort(dt) {
    if (!dt) return '—';
    var d = new Date(dt);
    if (isNaN(d)) return dt;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      + ', ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  function typeLabel(t) {
    return { announcement: 'Announcement', launch: 'Launch', update: 'Update', thread: 'Thread', teaser: 'Teaser' }[t] || t;
  }

  function formatIcon(f) {
    if (f === 'video') return '🎬';
    if (f === 'text+video') return '📝🎬';
    return '📝';
  }

  function prepDone(prep) {
    if (!prep.length) return 0;
    return prep.filter(function (x) { return x.done; }).length;
  }

  function opts(arr, cur, labels) {
    return arr.map(function (v) {
      var label = labels && labels[v] ? labels[v] : v;
      return '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(label) + '</option>';
    }).join('');
  }

  var TYPE_LABELS = { announcement: 'Announcement', launch: 'Launch', update: 'Update', thread: 'Thread', teaser: 'Teaser' };
  var FORMAT_LABELS = { text: 'Text', video: 'Video', 'text+video': 'Text + video' };
  var STATUS_LABELS = { draft: 'Draft', ready: 'Ready', scheduled: 'Scheduled', posted: 'Posted' };
  var VIDEO_LABELS = { none: 'No video', idea: 'Idea', scripted: 'Scripted', recorded: 'Recorded', edited: 'Edited', ready: 'Ready' };
  var PREP_LABELS = { content: 'Content', video: 'Video', dev: 'Dev', design: 'Design', outreach: 'Outreach', other: 'Other' };
  var LINK_LABELS = { video: 'Video', post: 'Post', reference: 'Ref', other: 'Other' };

  function metaStripHTML(p) {
    return '<div class="meta-strip">'
      + '<input type="datetime-local" class="meta-when" value="' + esc(p.datetime) + '" title="Schedule" onchange="updateField(\'' + esc(p.id) + '\',\'datetime\',this.value)">'
      + '<select class="meta-sel" title="Type" onchange="updateField(\'' + esc(p.id) + '\',\'postType\',this.value)">' + opts(SocialModel.POST_TYPES, p.postType, TYPE_LABELS) + '</select>'
      + '<select class="meta-sel" title="Format" onchange="updateField(\'' + esc(p.id) + '\',\'format\',this.value)">' + opts(SocialModel.FORMATS, p.format, FORMAT_LABELS) + '</select>'
      + '<select class="meta-sel" title="Project" onchange="updateField(\'' + esc(p.id) + '\',\'project\',this.value)">' + opts(SocialModel.getProjects(), p.project) + '</select>'
      + '<select class="meta-sel meta-status' + (p.status === 'posted' ? ' is-posted' : '') + '" title="Status" onchange="updateField(\'' + esc(p.id) + '\',\'status\',this.value)">' + opts(SocialModel.STATUSES, p.status, STATUS_LABELS) + '</select>'
      + '</div>';
  }

  function timelineHTML(posts, selectedId) {
    if (!posts.length) {
      return '<div class="empty">No posts yet — add your first scheduled tweet.</div>';
    }
    var html = '';
    for (var i = 0; i < posts.length; i++) {
      var p = posts[i];
      var gap = i > 0 ? SocialModel.gapLabel(posts[i - 1].datetime, p.datetime) : '';
      if (gap) html += '<div class="tl-gap"><span>' + esc(gap) + '</span></div>';
      var sel = p.id === selectedId ? ' selected' : '';
      var done = prepDone(p.prep);
      var prepPct = p.prep.length ? Math.round((done / p.prep.length) * 100) : 0;
      var thumb = (p.assets || []).find(function (a) { return a.kind === 'post-image'; });
      html += '<button type="button" class="tl-item' + sel + (p.status === 'posted' ? ' tl-posted' : '') + '" onclick="selectPost(\'' + esc(p.id) + '\')">'
        + (thumb ? '<div class="tl-thumb" data-asset-thumb="' + esc(thumb.id) + '" data-asset-post="' + esc(p.id) + '" data-asset-name="' + esc(thumb.name) + '"></div>' : '')
        + '<div class="tl-when">' + esc(fmtShort(p.datetime)) + '</div>'
        + '<div class="tl-title">' + esc(p.title) + '</div>'
        + '<div class="tl-meta">'
        + '<span class="tag proj" style="--h:' + projHue(p.project) + '">' + esc(p.project) + '</span>'
        + '<span class="tl-badge">' + esc(typeLabel(p.postType)) + '</span>'
        + '<span class="tl-badge fmt">' + formatIcon(p.format) + '</span>'
        + '<span class="tl-badge st-' + esc(p.status) + '">' + esc(p.status) + '</span>'
        + (p.assets.length ? '<span class="tl-badge">📎 ' + p.assets.length + '</span>' : '')
        + (p.prep.length ? '<span class="tl-prep">' + done + '/' + p.prep.length + ' prep</span>' : '')
        + '</div>'
        + (p.prep.length ? '<div class="tl-bar"><i style="width:' + prepPct + '%"></i></div>' : '')
        + '</button>';
    }
    return html;
  }

  function postedLogHTML(posts) {
    var posted = posts.filter(function (p) { return p.status === 'posted'; });
    if (!posted.length) {
      return '<div class="empty small">No posted tweets yet — mark a post as posted to log engagement here.</div>';
    }
    return posted.map(function (p) {
      var s = p.posted.stats || {};
      var stats = ['views', 'likes', 'reposts', 'replies'].filter(function (k) { return s[k]; }).map(function (k) {
        return k + ': ' + esc(s[k]);
      }).join(' · ');
      return '<button type="button" class="posted-log-item" onclick="selectPost(\'' + esc(p.id) + '\')">'
        + '<div class="pli-title">' + esc(p.title) + '</div>'
        + '<div class="pli-when">' + esc(fmtShort(p.posted.postedAt || p.datetime)) + '</div>'
        + (p.posted.url ? '<a class="pli-link" href="' + esc(p.posted.url) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">View post ↗</a>' : '')
        + (stats ? '<div class="pli-stats">' + stats + '</div>' : '')
        + (p.posted.screenshotId ? '<div class="pli-thumb has-img" data-asset-thumb="' + esc(p.posted.screenshotId) + '" data-asset-post="' + esc(p.id) + '" data-asset-name="screenshot"></div>' : '')
        + '</button>';
    }).join('');
  }

  function assetsHTML(p) {
    if (!p.assets.length) {
      return '<div class="empty small">Attach post images here — original quality, ready to drag into X.</div>';
    }
    return '<div class="asset-grid">' + p.assets.map(function (a) {
      var folder = SocialAssets.folderPath(p.id, a.name);
      return '<div class="asset-card">'
        + '<div class="asset-preview clickable-preview" data-asset-preview="' + esc(a.id) + '" data-asset-post="' + esc(p.id) + '" data-asset-name="' + esc(a.name) + '"></div>'
        + '<div class="asset-info">'
        + '<div class="asset-name">' + esc(a.name) + '</div>'
        + '<div class="asset-meta">' + esc(a.kind) + ' · ' + Math.round((a.size || 0) / 1024) + ' KB</div>'
        + '<div class="asset-path" title="Save file here on your laptop">📁 ' + esc(folder) + '</div>'
        + '<div class="asset-actions">'
        + '<button type="button" class="mv" onclick="viewAsset(\'' + esc(a.id) + '\',\'' + esc(p.id) + '\',\'' + esc(a.name) + '\')">View</button>'
        + '<button type="button" class="mv" onclick="downloadAsset(\'' + esc(a.id) + '\',\'' + esc(a.name) + '\',\'' + esc(p.id) + '\')">Download</button>'
        + '<button type="button" class="mv" onclick="removeAsset(\'' + esc(p.id) + '\',\'' + esc(a.id) + '\')">Remove</button>'
        + '</div></div></div>';
    }).join('') + '</div>';
  }

  function linksHTML(p) {
    var rows = (p.links || []).map(function (l) {
      return '<div class="link-row">'
        + '<span class="link-kind">' + esc(l.kind) + '</span>'
        + '<a href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.label || l.url) + '</a>'
        + '<button type="button" class="cl-del" onclick="removeLink(\'' + esc(p.id) + '\',\'' + esc(l.id) + '\')">×</button>'
        + '</div>';
    }).join('');
    return (rows || '<div class="empty small">No links yet.</div>')
      + '<div class="inline-add link-add">'
      + '<input id="newLinkUrl" class="inline-inp grow" placeholder="https://…" onkeydown="if(event.key===\'Enter\')addLinkItem(\'' + esc(p.id) + '\')">'
      + '<select id="newLinkKind" class="meta-sel">' + opts(SocialModel.LINK_KINDS, 'reference', LINK_LABELS) + '</select>'
      + '<button type="button" class="btn compact" onclick="addLinkItem(\'' + esc(p.id) + '\')">Add</button>'
      + '</div>';
  }

  function postedSectionHTML(p) {
    if (p.status !== 'posted') {
      return '<section class="detail-section posted-prompt">'
        + '<button type="button" class="btn primary" onclick="markPosted(\'' + esc(p.id) + '\')">Mark as posted</button>'
        + '<span class="sec-hint" style="margin-left:10px">unlocks engagement log + screenshot</span>'
        + '</section>';
    }
    var s = p.posted.stats || {};
    var shotId = p.posted.screenshotId;
    return '<section class="detail-section posted-results">'
      + '<div class="section-head-row">'
      + '<h3>Posted results <span class="sec-hint">live post</span></h3>'
      + '<button type="button" class="btn ghost undo-btn" onclick="unmarkPosted(\'' + esc(p.id) + '\')">Undo posted</button>'
      + '</div>'
      + '<div class="inline-add posted-url-row">'
      + '<input class="inline-inp grow" value="' + esc(p.posted.url) + '" placeholder="Post URL — https://x.com/…" onchange="updatePosted(\'' + esc(p.id) + '\',\'url\',this.value)">'
      + '<input type="datetime-local" class="meta-when" value="' + esc(p.posted.postedAt) + '" title="Posted at" onchange="updatePosted(\'' + esc(p.id) + '\',\'postedAt\',this.value)">'
      + '</div>'
      + '<div class="stats-grid">'
      + ['views', 'likes', 'reposts', 'replies', 'bookmarks'].map(function (k) {
        return '<div class="df"><label>' + k + '</label><input value="' + esc(s[k]) + '" placeholder="—" onchange="updatePostedStat(\'' + esc(p.id) + '\',\'' + k + '\',this.value)"></div>';
      }).join('')
      + '</div>'
      + '<textarea class="notes-area" placeholder="Engagement notes, what worked…" onchange="updatePosted(\'' + esc(p.id) + '\',\'notes\',this.value)">' + esc(p.posted.notes) + '</textarea>'
      + '<h4 class="sub-h">Post screenshot</h4>'
      + (shotId ? '<div class="asset-card posted-shot"><div class="asset-preview clickable-preview" data-asset-preview="' + esc(shotId) + '" data-asset-post="' + esc(p.id) + '" data-asset-name="screenshot"></div>'
        + '<div class="asset-actions"><button type="button" class="mv" onclick="viewAsset(\'' + esc(shotId) + '\',\'' + esc(p.id) + '\',\'screenshot\')">View</button>'
        + '<button type="button" class="mv" onclick="removePostedScreenshot(\'' + esc(p.id) + '\')">Remove</button></div></div>'
        : '<div class="empty small">Upload a screenshot of the live post.</div>')
      + '<div class="upload-row">'
      + '<button type="button" class="btn" onclick="triggerScreenshotUpload()">+ Screenshot</button>'
      + '</div>'
      + '</section>';
  }

  function detailHTML(p) {
    if (!p) {
      return '<div class="detail-empty"><div class="de-icon">←</div><p>Select a post from the sequence to see copy, assets, video, and prep work.</p></div>';
    }

    var prepDoneN = prepDone(p.prep);
    var prepHtml = p.prep.map(function (item, idx) {
      return '<label class="cl-item' + (item.done ? ' done' : '') + '">'
        + '<span class="cl-box" onclick="event.preventDefault();togglePrep(\'' + esc(p.id) + '\',' + idx + ')">'
        + '<svg viewBox="0 0 10 10" fill="none"><path d="M2 5.5l2 2 4-4" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span>'
        + '<span class="cl-text">' + esc(item.text) + '</span>'
        + '<span class="prep-kind">' + esc(item.kind) + '</span>'
        + '<button type="button" class="cl-del" onclick="removePrep(\'' + esc(p.id) + '\',' + idx + ')">×</button>'
        + '</label>';
    }).join('');

    return ''
      + '<div class="detail-head">'
      + '<div class="detail-title-row">'
      + '<input class="detail-title" value="' + esc(p.title) + '" onchange="updateField(\'' + esc(p.id) + '\',\'title\',this.value)">'
      + '<button type="button" class="card-del" onclick="deletePost(\'' + esc(p.id) + '\')" title="Delete post">Delete</button>'
      + '</div>'
      + metaStripHTML(p)
      + '</div>'
      + (global.Story && Story.taskLine ? '<div class="detail-story" style="margin:8px 0 12px">' + Story.taskLine('post', p.id) + '</div>' : '')

      + postedSectionHTML(p)

      + '<section class="detail-section">'
      + '<h3>Copy <span class="sec-hint">tweet text</span></h3>'
      + '<textarea class="copy-area" placeholder="Write your tweet copy here…" onchange="updateField(\'' + esc(p.id) + '\',\'copy\',this.value)">' + esc(p.copy) + '</textarea>'
      + '<div class="char-count">' + (p.copy ? p.copy.length : 0) + ' chars</div>'
      + '</section>'

      + '<section class="detail-section">'
      + '<h3>Post images <span class="sec-hint">drag to X · saved original quality</span></h3>'
      + assetsHTML(p)
      + '<div class="upload-row">'
      + '<button type="button" class="btn primary" onclick="triggerFileUpload(\'post-image\')">+ Post image</button>'
      + '<button type="button" class="btn" onclick="triggerFileUpload(\'reference\')">+ Reference</button>'
      + '<button type="button" class="btn ghost" onclick="exportAssetsToFolder(\'' + esc(p.id) + '\')" title="Download all images for this post">Export to folder</button>'
      + '</div>'
      + '<div class="folder-hint">Images stored in browser · click preview to enlarge · or save to <code>social-assets/' + esc(p.id) + '/</code> on your laptop</div>'
      + '</section>'

      + '<section class="detail-section">'
      + '<h3>Links <span class="sec-hint">video · post · reference</span></h3>'
      + linksHTML(p)
      + '</section>'

      + (p.format === 'text' ? '' : '<section class="detail-section">'
      + '<h3>Video</h3>'
      + '<div class="inline-add">'
      + '<input class="inline-inp grow" value="' + esc(p.video.title) + '" placeholder="Clip title" onchange="updateVideo(\'' + esc(p.id) + '\',\'title\',this.value)">'
      + '<select class="meta-sel" title="Video status" onchange="updateVideo(\'' + esc(p.id) + '\',\'status\',this.value)">' + opts(SocialModel.VIDEO_STATUSES, p.video.status, VIDEO_LABELS) + '</select>'
      + '</div>'
      + '<input class="inline-inp full" value="' + esc(p.video.link) + '" placeholder="Video file link (Drive, Dropbox…)" onchange="updateVideo(\'' + esc(p.id) + '\',\'link\',this.value)">'
      + '<textarea class="notes-area compact" placeholder="Video notes…" onchange="updateVideo(\'' + esc(p.id) + '\',\'notes\',this.value)">' + esc(p.video.notes) + '</textarea>'
      + '</section>')

      + '<section class="detail-section">'
      + '<h3>Prep work <span class="sec-hint">' + prepDoneN + '/' + p.prep.length + ' done</span></h3>'
      + '<div class="checklist">' + (prepHtml || '<div class="empty small">No prep items — add dev, video, or content tasks below.</div>') + '</div>'
      + '<div class="inline-add">'
      + '<input id="newPrepText" class="inline-inp grow" placeholder="Add prep task…" onkeydown="if(event.key===\'Enter\')addPrepItem(\'' + esc(p.id) + '\')">'
      + '<select id="newPrepKind" class="meta-sel">' + opts(SocialModel.PREP_KINDS, 'content', PREP_LABELS) + '</select>'
      + '<button type="button" class="btn compact" onclick="addPrepItem(\'' + esc(p.id) + '\')">Add</button>'
      + '</div></section>'

      + '<section class="detail-section">'
      + '<h3>Notes</h3>'
      + '<textarea class="notes-area" placeholder="Internal notes — timing, dependencies…" onchange="updateField(\'' + esc(p.id) + '\',\'notes\',this.value)">' + esc(p.notes) + '</textarea>'
      + '</section>';
  }

  function summaryHTML(posts) {
    var ready = posts.filter(function (p) { return p.status === 'ready' || p.status === 'scheduled'; }).length;
    var posted = posts.filter(function (p) { return p.status === 'posted'; }).length;
    var next = posts.find(function (p) { return p.status !== 'posted'; });
    return ''
      + '<span><b>' + posts.length + '</b> posts</span><span>·</span>'
      + '<span><b>' + ready + '</b> ready</span><span>·</span>'
      + '<span><b>' + posted + '</b> posted</span>'
      + (next ? '<span class="next-up">Next: ' + esc(fmtShort(next.datetime)) + '</span>' : '');
  }

  function hydrateAssets() {
    if (global.SocialImage) return SocialImage.hydrateAll();
  }

  global.SocialView = {
    render: function (selectedId) {
      var posts = SocialModel.getSorted();
      var sel = selectedId ? SocialModel.getById(selectedId) : null;
      var tl = document.getElementById('timeline');
      var det = document.getElementById('detail');
      var sum = document.getElementById('summaryBar');
      var plog = document.getElementById('postedLog');
      if (tl) tl.innerHTML = timelineHTML(posts, selectedId);
      if (det) det.innerHTML = detailHTML(sel);
      if (sum) sum.innerHTML = summaryHTML(posts);
      if (plog) plog.innerHTML = postedLogHTML(posts);
      hydrateAssets();
    }
  };
})(window);
