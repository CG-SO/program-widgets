/* CGIAR program "Our goals" figures.
   URL parameters: program=<program id>, data=<path> (default data/program-goals.json),
   id=<iframe id for height messages>, bg=0 (transparent background, no padding). */
(function () {
  'use strict';
  var qs = new URLSearchParams(location.search);
  var P = { program: qs.get('program') || '', data: qs.get('data') || 'data/program-goals.json', id: qs.get('id') || 'programGoals', bg: qs.get('bg') !== '0' };
  var root = document.getElementById('pg');

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function postHeight() { try { parent.postMessage({ type: 'cgiar-widget-height', id: P.id, height: Math.ceil(document.body.getBoundingClientRect().height) }, '*'); } catch (e) {} }
  function fail(msg) { root.className = ''; root.innerHTML = '<div class="w-error">' + esc(msg) + '</div>'; postHeight(); }

  fetch(P.data, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(P.data + ' (' + r.status + ')'); return r.json(); })
    .then(function (file) {
      var g = (file.programs || {})[P.program];
      if (!g || !g.items || !g.items.length) {
        console.warn('[program-goals] No goals for program "' + P.program + '".');
        return fail('No goals found for program "' + P.program + '".');
      }
      build(g);
    })
    .catch(function (e) { fail('Could not load the goals data: ' + e.message); });

  function build(g) {
    var n = Math.min(g.items.length, 4);
    root.className = 'pg' + (P.bg ? ' pg--panel' : '');
    root.innerHTML =
      '<h2 class="pg-title">' + esc(g.title) + '</h2>' +
      (g.intro ? '<p class="pg-intro">' + esc(g.intro) + '</p>' : '') +
      '<div class="pg-clip"><ul class="pg-list pg-list--n' + n + '">' +
      g.items.map(function (it) {
        return '<li class="pg-item' + (it.fact ? '' : ' pg-item--text') + '">' +
          (it.fact ? '<p class="pg-fact">' + esc(it.fact) + '</p>' : '') +
          (it.headline ? '<p class="pg-headline">' + esc(it.headline) + '</p>' : '') +
          (it.text ? '<p class="pg-text">' + esc(it.text) + '</p>' : '') +
          '</li>';
      }).join('') +
      '</ul></div>';
    postHeight();
    window.addEventListener('resize', postHeight);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(postHeight);
  }
})();
