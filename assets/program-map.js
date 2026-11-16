/* CGIAR program map engine.
   One engine, one data file for all programs. A program can have any mix of:
   global (true/false), regions (names or keys from data/regions.json), countries (ISO3) and tiers.
   URL parameters: program=<key in data file>, data=<path to data file>, id=<iframe id for height messages>, panel=0 (map only). */
(function () {
  'use strict';
  var qs = new URLSearchParams(location.search);
  var P = {
    program: qs.get('program') || (window.PM_CONFIG && window.PM_CONFIG.program) || '',
    data: qs.get('data') || (window.PM_CONFIG && window.PM_CONFIG.data) || 'data/program-maps.json',
    id: qs.get('id') || 'programMap',
    panel: qs.get('panel') !== '0'
  };
  var root = document.getElementById('pm');
  var file0 = {};
  var TIER_COLORS = ['#033529', '#1d7a5f', '#5cb89c', '#a3dcc8'];
  // Natural Earth splits some territories; shade them together with the listed country.
  var MERGE = { SOM: ['SOL'], CYP: ['CYN'], SRB: ['XKX'], MAR: ['ESH'] };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function safeUrl(u) { return /^https?:\/\//i.test(u || '') ? u : ''; }
  function postHeight() {
    try { parent.postMessage({ type: 'cgiar-widget-height', id: P.id, height: Math.ceil(document.body.getBoundingClientRect().height) }, '*'); } catch (e) {}
  }
  function fail(msg) { root.innerHTML = '<div class="w-error">' + esc(msg) + '</div>'; postHeight(); }
  function getJSON(u) { return fetch(u, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(u + ' (' + r.status + ')'); return r.json(); }); }

  Promise.all([getJSON(P.data), getJSON('data/regions.json'), getJSON('data/countries.geo.json')]).then(function (res) {
    var file = res[0], dict = res[1], geo = res[2];
    var cfg = file.programs ? file.programs[P.program] : file;
    if (!cfg) return fail('No map found for program "' + P.program + '" in ' + P.data + '.');
    file0 = file; build(cfg, file.defaults || {}, dict, geo);
  }).catch(function (e) { fail('Could not load the map data: ' + e.message); });

  function resolveRegions(list, dict) {
    var out = [];
    (list || []).forEach(function (raw) {
      var key = String(raw).trim(), low = key.toLowerCase();
      var k = dict.regions[key] || dict.groups[key] ? key : dict.aliases[low];
      if (!k) { console.warn('[program-map] Unknown region "' + key + '". Add it to data/regions.json aliases.'); out.push({ label: key, countries: [], unknown: true }); return; }
      var r = dict.regions[k], g = dict.groups[k], set = {};
      if (r) r.countries.forEach(function (c) { set[c] = 1; });
      if (g) {
        g.regions.forEach(function (rk) { dict.regions[rk].countries.forEach(function (c) { set[c] = 1; }); });
        (g.plus || []).forEach(function (c) { set[c] = 1; });
        (g.minus || []).forEach(function (c) { delete set[c]; });
      }
      out.push({ key: k, label: (typeof raw === 'string' && raw.trim()) || (r || g).label, countries: Object.keys(set) });
    });
    return out;
  }

  function build(cfg, defaults, dict, geo) {
    var names = {};
    geo.features.forEach(function (f) { names[f.id] = f.properties.name; });
    [file0.countryNames || {}, cfg.countryNames || {}].forEach(function (m) { Object.keys(m).forEach(function (k) { names[k] = m[k]; }); });
    var known = {}; geo.features.forEach(function (f) { known[f.id] = 1; });

    // Layers. Precedence on the map: tier > country > region.
    var regions = resolveRegions(cfg.regions, dict);
    var countries = (cfg.countries || []).filter(function (c) { if (!known[c]) console.warn('[program-map] ISO3 "' + c + '" is not in the boundaries file.'); return known[c]; });
    var tiers = (cfg.tiers || []).map(function (t, i) {
      return { label: t.label || ('Tier ' + (i + 1)), description: t.description || '', color: /^#[0-9a-f]{6}$/i.test(t.color || '') ? t.color : TIER_COLORS[Math.min(i, TIER_COLORS.length - 1)], countries: (t.countries || []).filter(function (c) { return known[c]; }) };
    });
    var role = {}; // iso -> {type, tier, region}
    regions.forEach(function (r, ri) { r.countries.forEach(function (c) { if (!role[c]) role[c] = { type: 'region', region: ri }; }); });
    countries.forEach(function (c) { role[c] = { type: 'country' }; });
    tiers.forEach(function (t, ti) { t.countries.forEach(function (c) { if (role[c] && role[c].type === 'tier') { console.warn('[program-map] ' + c + ' is in two tiers; the first wins.'); return; } role[c] = { type: 'tier', tier: ti }; }); });
    Object.keys(MERGE).forEach(function (iso) { if (role[iso]) MERGE[iso].forEach(function (m) { if (!role[m]) role[m] = role[iso]; }); });
    var onlyGlobal = cfg.global && !regions.length && !countries.length && !tiers.length;

    var S = { tier: -1, region: -1, sel: null };
    var hdr = cfg.header || {};
    var ui = Object.assign({ pill: '', disclaimer: 'Boundaries: Natural Earth', filterLabel: 'Filter by tier', allLabel: 'All tiers', regionsLabel: 'Regions', countriesLabel: 'Countries', globalLabel: 'Global' }, defaults.ui || {}, cfg.ui || {});

    root.innerHTML =
      '<div class="pm">' +
        '<div class="pm-map-wrap"><div class="pm-map" id="pm-map" aria-hidden="true"></div>' +
          (ui.pill ? '<span class="pm-pill">' + esc(ui.pill) + '</span>' : '') +
          '<span class="pm-attr">' + esc(ui.disclaimer) + '</span></div>' +
        (P.panel ? '<aside class="pm-panel" id="pm-panel" aria-live="polite"></aside>' : '') +
      '</div><div class="sr-only" id="pm-summary"></div>';

    var map = L.map('pm-map', { zoomControl: true, attributionControl: false, worldCopyJump: false, minZoom: 1, maxZoom: 7, zoomSnap: 0.25, scrollWheelZoom: false });
    map.zoomControl.setPosition('bottomright');

    var css = getComputedStyle(document.documentElement);
    function V(n) { return css.getPropertyValue(n).trim(); }
    var COL = { region: V('--map-region'), regionLine: V('--map-region-line'), country: V('--map-country'), select: V('--map-select') };
    function fillFor(iso) {
      var r = role[iso];
      if (!r) return onlyGlobal ? { f: '#cdeee4', s: '#9fd1c2' } : null;
      if (r.type === 'tier') return { f: tiers[r.tier].color, s: '#ffffff', dim: S.tier >= 0 && S.tier !== r.tier };
      if (r.type === 'country') return { f: COL.country, s: '#ffffff', dim: S.tier >= 0 };
      return { f: COL.region, s: COL.regionLine, dim: S.tier >= 0 || (S.region >= 0 && S.region !== r.region) };
    }
    function styleFor(feature) {
      var x = fillFor(feature.id), sel = S.sel === feature.id;
      if (!x) return { fillColor: '#ffffff', color: '#c8ccd0', weight: 0.6, fillOpacity: 1 };
      return { fillColor: x.f, color: sel ? COL.select : x.s, weight: sel ? 2.5 : 0.8, fillOpacity: x.dim ? 0.22 : 1, opacity: 1 };
    }
    function roleText(iso) {
      var r = role[iso]; if (!r) return '';
      if (r.type === 'tier') return tiers[r.tier].label + (tiers[r.tier].description ? ' · ' + tiers[r.tier].description : '');
      if (r.type === 'country') return ui.countriesLabel.replace(/s$/, '');
      return regions[r.region].label;
    }
    var layer = L.geoJSON(geo, {
      style: styleFor,
      onEachFeature: function (f, l) {
        if (!role[f.id]) return;
        l.bindTooltip(esc(names[f.id]) + ' · ' + esc(roleText(f.id)), { sticky: true, className: 'pm-tip', direction: 'top' });
        l.on('click', function () { select(S.sel === f.id ? null : f.id); });
      }
    }).addTo(map);

    // Small countries vanish at world zoom: add a dot so they stay visible and clickable.
    var dots = L.layerGroup().addTo(map);
    layer.eachLayer(function (l) {
      var id = l.feature.id; if (!role[id] || role[id].type === 'region') return;
      var b = l.getBounds(); if (!b.isValid()) return;
      var span = Math.max(b.getEast() - b.getWest(), b.getNorth() - b.getSouth());
      if (span > 1.6) return;
      var x = fillFor(id);
      var d = L.circleMarker(b.getCenter(), { radius: 5, color: '#ffffff', weight: 1.5, fillColor: x.f, fillOpacity: 1 });
      d.bindTooltip(esc(names[id]) + ' · ' + esc(roleText(id)), { className: 'pm-tip', direction: 'top' });
      d.on('click', function () { select(S.sel === id ? null : id); });
      d._pmId = id; dots.addLayer(d);
    });

    function boundsOf(isos) {
      var b = null;
      layer.eachLayer(function (l) { if (isos.indexOf(l.feature.id) >= 0) { var lb = l.getBounds(); if (lb.isValid()) b = b ? b.extend(lb) : L.latLngBounds(lb.getSouthWest(), lb.getNorthEast()); } });
      return b;
    }
    function fit(isos) {
      var b = isos && isos.length ? boundsOf(isos) : null;
      if (b) map.fitBounds(b, { padding: [24, 24], maxZoom: cfg.fitMaxZoom || 5 });
      else map.setView([15, 15], 1.5);
    }
    function allMapped() { return Object.keys(role); }

    function restyle() {
      layer.setStyle(styleFor);
      dots.eachLayer(function (d) { var x = fillFor(d._pmId); d.setStyle({ fillOpacity: x && x.dim ? 0.22 : 1, color: S.sel === d._pmId ? COL.select : '#ffffff' }); });
      if (P.panel) panel();
      postHeight();
    }
    function select(iso) { S.sel = iso; restyle(); }
    function pickTier(i) { S.tier = S.tier === i ? -1 : i; S.region = -1; S.sel = null; restyle(); fit(S.tier >= 0 ? tiers[S.tier].countries : allMapped()); }
    function pickRegion(i) { S.region = S.region === i ? -1 : i; S.tier = -1; S.sel = null; restyle(); fit(S.region >= 0 ? regions[S.region].countries : allMapped()); }

    var hint = ui.hint || [tiers.length ? 'Select a tier to highlight its countries.' : '', regions.some(function (r) { return !r.unknown; }) ? 'Select a region to highlight it.' : '', (tiers.length || countries.length) ? 'Select a country on the map to see its details.' : ''].filter(Boolean).join(' ');
    var globe = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/></svg>';
    function panel() {
      var el = document.getElementById('pm-panel'), h = '';
      h += '<div class="pm-head">' + (hdr.eyebrow ? '<p class="w-eyebrow">' + esc(hdr.eyebrow) + '</p>' : '') +
        '<h2 class="w-title">' + esc(hdr.title || 'Where we work') + '</h2>' + (hdr.subtitle ? '<p class="w-sub">' + esc(hdr.subtitle) + '</p>' : '') + '</div>';
      if (cfg.global) h += '<span class="pm-global">' + globe + esc(ui.globalLabel) + '</span>';
      if (tiers.length) {
        h += '<div class="pm-block"><div class="pm-row"><p class="w-label">' + esc(ui.filterLabel) + '</p><button type="button" class="pm-reset" data-all aria-pressed="' + (S.tier < 0) + '">' + esc(ui.allLabel) + '</button></div>';
        tiers.forEach(function (t, i) {
          h += '<button type="button" class="pm-tier' + (S.tier >= 0 && S.tier !== i ? ' is-dim' : '') + '" data-tier="' + i + '" aria-pressed="' + (S.tier === i) + '">' +
            '<span class="pm-row" style="width:100%"><span class="pm-tier-name"><span class="pm-sw" style="background:' + t.color + '"></span>' + esc(t.label) + '</span><span class="w-count">' + t.countries.length + ' countries</span></span>' +
            (t.description ? '<span class="pm-tier-desc">' + esc(t.description) + '</span>' : '') +
            '<span class="pm-list">' + t.countries.map(function (c) { return esc(names[c]); }).join(' · ') + '</span></button>';
        });
        h += '</div>';
      }
      if (countries.length) {
        h += '<div class="pm-block"><div class="pm-row"><p class="w-label"><span class="pm-sw pm-sw--country" style="vertical-align:-2px;margin-right:6px"></span>' + esc(ui.countriesLabel) + '</p><span class="w-count">' + countries.length + ' countries</span></div><ul class="pm-countries">' +
          countries.slice().sort(function (a, b) { return names[a].localeCompare(names[b]); }).map(function (c) { return '<li><button type="button" class="pm-country" data-iso="' + c + '" aria-pressed="' + (S.sel === c) + '">' + esc(names[c]) + '</button></li>'; }).join('') + '</ul></div>';
      }
      if (regions.length) {
        h += '<div class="pm-block"><p class="w-label"><span class="pm-sw pm-sw--region" style="vertical-align:-2px;margin-right:6px"></span>' + esc(ui.regionsLabel) + '</p><ul class="pm-chips">' +
          regions.map(function (r, i) { return '<li>' + (r.unknown ? '<span class="pm-chip is-unknown" title="Not on the map yet">' + esc(r.label) + '</span>' : '<button type="button" class="pm-chip" data-region="' + i + '" aria-pressed="' + (S.region === i) + '">' + esc(r.label) + '</button>') + '</li>'; }).join('') + '</ul></div>';
      }
      if (S.sel) {
        var lines = (cfg.countryInfo || {})[S.sel] || [];
        h += '<div class="pm-sel"><p class="w-label">' + esc(roleText(S.sel)) + '</p><p class="pm-sel-name" style="margin:0">' + esc(names[S.sel]) + '</p>' +
          (lines.length ? '<ul class="pm-sel-lines">' + lines.map(function (x) { return typeof x === 'string' ? '<li>' + esc(x) + '</li>' : (safeUrl(x.url) ? '<li><a href="' + esc(x.url) + '" target="_blank" rel="noopener">' + esc(x.text) + '</a></li>' : ''); }).join('') + '</ul>' : '') + '</div>';
      } else if (hint) {
        h += '<p class="pm-note">' + esc(hint) + '</p>';
      }
      el.innerHTML = h;
    }
    if (P.panel) {
      document.getElementById('pm-panel').addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) return;
        if (b.hasAttribute('data-all')) { S.tier = -1; S.region = -1; S.sel = null; restyle(); fit(allMapped()); }
        else if (b.dataset.tier) pickTier(+b.dataset.tier);
        else if (b.dataset.region) pickRegion(+b.dataset.region);
        else if (b.dataset.iso) select(S.sel === b.dataset.iso ? null : b.dataset.iso);
      });
    }
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && S.sel) select(null); });

    // Screen-reader summary of everything on the map.
    var sum = [];
    if (cfg.global) sum.push(ui.globalLabel + '.');
    tiers.forEach(function (t) { sum.push(t.label + (t.description ? ', ' + t.description : '') + ': ' + t.countries.map(function (c) { return names[c]; }).join(', ') + '.'); });
    if (countries.length) sum.push(ui.countriesLabel + ': ' + countries.map(function (c) { return names[c]; }).join(', ') + '.');
    if (regions.length) sum.push(ui.regionsLabel + ': ' + regions.map(function (r) { return r.label; }).join(', ') + '.');
    document.getElementById('pm-summary').textContent = (hdr.title || 'Where we work') + '. ' + sum.join(' ');

    if (hdr.title) document.title = hdr.title;
    restyle();
    fit(onlyGlobal ? [] : allMapped());
    window.addEventListener('resize', function () { map.invalidateSize(); postHeight(); });
    setTimeout(postHeight, 300);
  }
})();
