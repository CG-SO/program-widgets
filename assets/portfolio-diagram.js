/* CGIAR portfolio connections diagram.
   URL parameters: focus=<program id> (program page view, that program in the centre),
   data=<path> (default data/portfolio.json), id=<iframe id for height messages>, panel=0 (diagram only). */
(function () {
  'use strict';
  var qs = new URLSearchParams(location.search);
  var P = { focus: qs.get('focus') || '', data: qs.get('data') || 'data/portfolio.json', id: qs.get('id') || 'portfolioDiagram', panel: qs.get('panel') !== '0' };
  var root = document.getElementById('pd');
  var C = 500, R_OUT = 380, R_IN = 215;
  var TYPE = { science: 'Science Program', scaling: 'Scaling Program', accelerator: 'Accelerator' };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function safeUrl(u) { return /^https?:\/\//i.test(u || '') ? u : ''; }
  function postHeight() { try { parent.postMessage({ type: 'cgiar-widget-height', id: P.id, height: Math.ceil(document.documentElement.scrollHeight) }, '*'); } catch (e) {} }

  fetch(P.data, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(P.data + ' (' + r.status + ')'); return r.json(); })
    .then(build).catch(function (e) { root.innerHTML = '<div class="w-error">Could not load the diagram data: ' + esc(e.message) + '</div>'; postHeight(); });

  function build(D) {
    var byId = {}; D.programs.forEach(function (p) { byId[p.id] = p; });
    var focus = byId[P.focus] ? P.focus : '';
    if (P.focus && !focus) console.warn('[portfolio-diagram] Unknown focus "' + P.focus + '".');
    var progs = D.programs.filter(function (p) { return p.type !== 'accelerator'; });
    var accs = D.programs.filter(function (p) { return p.type === 'accelerator'; });

    // Undirected links: drawn when either side lists the other.
    var conn = D.connections || {}, seen = {}, links = [];
    Object.keys(conn).forEach(function (a) { (conn[a] || []).forEach(function (b) {
      if (!byId[a] || !byId[b] || a === b) return; var k = [a, b].sort().join('|'); if (!seen[k]) { seen[k] = 1; links.push([a, b]); } }); });
    var nbrs = function (id) { var s = {}; links.forEach(function (l) { if (l[0] === id) s[l[1]] = 1; if (l[1] === id) s[l[0]] = 1; }); return Object.keys(s); };

    // Positions on a 1000 x 1000 stage.
    var pos = {};
    var outer = focus ? progs.filter(function (p) { return p.id !== focus; }) : progs;
    var R = focus ? R_OUT : 400;
    if (focus) pos[focus] = [C, C];
    outer.forEach(function (p, i) { var a = (-90 + i * 360 / outer.length) * Math.PI / 180; pos[p.id] = [C + R * Math.cos(a), C + R * Math.sin(a)]; });
    var inner = accs.filter(function (p) { return p.id !== focus; });
    inner.forEach(function (p, i) { var a = (-90 + 180 / inner.length + i * 360 / inner.length) * Math.PI / 180; pos[p.id] = [C + R_IN * Math.cos(a), C + R_IN * Math.sin(a)]; });

    // Program page view: the focus program's own list becomes the spokes. If it has no list yet, use who lists it.
    var spokeIds = focus ? ((conn[focus] && conn[focus].length) ? conn[focus].filter(function (x) { return byId[x] && x !== focus; }) : nbrs(focus)) : [];
    var mesh = links.filter(function (l) { return l[0] !== focus && l[1] !== focus; });
    var hubLabel = (D.hub && D.hub.label) || 'CGIAR portfolio';

    var S = { sel: focus || '', paused: false };
    var reduce = false; try { reduce = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

    function seg(a, b) { var A = pos[a] || [C, C], B = pos[b] || [C, C]; return 'M' + A[0].toFixed(1) + ' ' + A[1].toFixed(1) + 'L' + B[0].toFixed(1) + ' ' + B[1].toFixed(1); }
    function hiFor(id) {
      if (!id) return [];
      if (id === focus) return spokeIds.map(function (x) { return [focus, x]; });
      var out = mesh.filter(function (l) { return l[0] === id || l[1] === id; });
      if (focus && spokeIds.indexOf(id) >= 0) out.push([focus, id]);
      return out;
    }
    function render() {
      var hi = hiFor(S.sel), on = {};
      hi.forEach(function (l) { on[l[0]] = 1; on[l[1]] = 1; });
      if (S.sel) on[S.sel] = 1;
      var nodes = '';
      if (!focus) nodes += '<div class="pd-node pd-node--hub" style="left:50%;top:50%;cursor:default" aria-hidden="true">' + esc(hubLabel) + '</div>';
      else nodes += node(byId[focus], 'pd-node--hub', 0);
      inner.forEach(function (p, i) { nodes += node(p, 'pd-node--acc', 0.25 + i * 0.12); });
      outer.forEach(function (p, i) { nodes += node(p, p.type === 'scaling' ? 'pd-node--scaling' : '', 0.75 + i * 0.09); });
      function node(p, cls, delay) {
        var dim = S.sel && !on[p.id];
        var at = p.id === focus ? 'left:50%;top:50%;' : 'left:' + (pos[p.id][0] / 10).toFixed(2) + '%;top:' + (pos[p.id][1] / 10).toFixed(2) + '%;';
        return '<button type="button" class="pd-node ' + cls + (dim ? ' is-dim' : '') + '" data-id="' + esc(p.id) + '" aria-pressed="' + (S.sel === p.id) + '" style="' + at + 'animation-delay:' + delay + 's">' + esc(p.name) + '</button>';
      }
      var svg = '<svg viewBox="0 0 1000 1000" aria-hidden="true">' +
        '<circle class="pd-orbit" cx="500" cy="500" r="' + R_OUT + '"/><circle class="pd-orbit" cx="500" cy="500" r="' + R_IN + '"/>' +
        (focus ? '<path class="pd-line" d="' + spokeIds.map(function (x) { return seg(focus, x); }).join('') + '"/>' : '') +
        '<path class="pd-line pd-line--mesh" d="' + mesh.map(function (l) { return seg(l[0], l[1]); }).join('') + '"/>' +
        (hi.length ? '<path class="pd-hi" d="' + hi.map(function (l) { return seg(l[0], l[1]); }).join('') + '"/><path class="pd-flow" d="' + hi.map(function (l) { return seg(l[0], l[1]); }).join('') + '"/>' : '') +
        '</svg>';
      var stageCls = 'pd-stage' + (S.sel ? ' has-sel' : '');
      var html = '<div class="pd' + (S.paused || reduce ? ' pd-paused' : '') + '">' +
        '<div class="pd-stage-wrap">' + (D.title ? '<p class="w-eyebrow" style="max-width:640px;width:100%;margin:0 auto">' + esc(D.title) + '</p>' : '') +
        '<div class="' + stageCls + '" role="group" aria-label="' + esc(D.title || 'Program connections') + '">' + svg + nodes + '</div>' +
        '<div class="pd-foot"><ul class="pd-legend" aria-label="Legend">' +
          '<li><span class="pd-key"></span>Science Program</li><li><span class="pd-key pd-key--scaling"></span>Scaling Program</li><li><span class="pd-key pd-key--acc"></span>Accelerator</li>' +
          (focus ? '<li><span class="pd-key pd-key--hub"></span>' + esc(byId[focus].name) + ' (this program)</li>' : '') + '</ul>' +
          (reduce ? '' : '<button type="button" class="pd-btn" data-pause aria-pressed="' + S.paused + '">' + (S.paused ? 'Play motion' : 'Pause motion') + '</button>') + '</div></div>' +
        (P.panel ? '<aside class="pd-panel" aria-live="polite">' + panel() + '</aside>' : '') + '</div>' +
        '<div class="sr-only">' + summary() + '</div>';
      root.innerHTML = html;
      if (!render.done) { root.firstChild.classList.add('pd-anim'); render.done = true; }
      postHeight();
    }
    function panel() {
      if (!S.sel) return '<p class="pd-name" style="font-size:20px">' + esc((D.empty && D.empty.title) || 'How the portfolio connects') + '</p><p class="pd-desc">' + esc((D.empty && D.empty.text) || 'Select a program or accelerator to see who it works with.') + '</p>';
      var p = byId[S.sel], ids = S.sel === focus ? spokeIds : nbrs(S.sel);
      var pr = ids.filter(function (x) { return byId[x].type !== 'accelerator'; }), ac = ids.filter(function (x) { return byId[x].type === 'accelerator'; });
      var chips = function (arr) { return '<ul class="pd-links">' + arr.map(function (x) { return '<li><button type="button" class="pd-link" data-id="' + esc(x) + '">' + esc(byId[x].name) + '</button></li>'; }).join('') + '</ul>'; };
      var h = '<span class="pd-badge' + (p.type === 'scaling' ? ' pd-badge--scaling' : p.type === 'accelerator' ? ' pd-badge--acc' : '') + '">' + esc(TYPE[p.type] || '') + '</span>' +
        '<h2 class="pd-name">' + esc(p.name) + '</h2>' + (p.desc ? '<p class="pd-desc">' + esc(p.desc) + '</p>' : '') +
        '<div style="display:flex;flex-direction:column;gap:10px;padding-top:14px;border-top:1px solid var(--c-line)"><p class="w-eyebrow">' + esc(S.sel === focus ? ((D.labels && D.labels.focus) || 'We closely work with') : 'Connected to ' + ids.length) + '</p>' +
        (pr.length ? '<p class="w-label" style="color:var(--c-ink-muted)">Programs</p>' + chips(pr) : '') +
        (ac.length ? '<p class="w-label" style="color:var(--c-ink-muted)">Accelerators</p>' + chips(ac) : '') +
        (!ids.length ? '<p class="pd-desc">No connections listed yet.</p>' : '') + '</div>';
      if (S.sel !== focus && safeUrl(p.url)) h += '<a class="pd-cta" href="' + esc(p.url) + '" target="_top">Explore this ' + (p.type === 'accelerator' ? 'accelerator' : 'program') + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 12h17M14 6l6 6-6 6"/></svg></a>';
      if (focus && S.sel !== focus) h += '<button type="button" class="pd-btn" data-id="' + esc(focus) + '" style="align-self:flex-start">Back to ' + esc(byId[focus].name) + '</button>';
      return h;
    }
    function summary() {
      return esc(D.title || 'Program connections') + '. ' + D.programs.map(function (p) {
        var ids = p.id === focus ? spokeIds : nbrs(p.id);
        return esc(p.name) + ' (' + esc(TYPE[p.type]) + ') works with ' + (ids.length ? ids.map(function (x) { return esc(byId[x].name); }).join(', ') : 'no listed programs') + '.';
      }).join(' ');
    }
    root.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.hasAttribute('data-pause')) { S.paused = !S.paused; render(); return; }
      var id = b.getAttribute('data-id'); if (!id) return;
      S.sel = (S.sel === id && !b.classList.contains('pd-link')) ? (focus || '') : id;
      render();
      var t = root.querySelector('.pd-node[data-id="' + id + '"]'); if (t && b.classList.contains('pd-node')) t.focus();
    });
    window.addEventListener('resize', postHeight);
    render();
  }
})();
