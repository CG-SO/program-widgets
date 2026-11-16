#!/usr/bin/env python3
"""Convert the "CGIAR program connections" workbook into the two widget data files.

    python3 tools/sheet_to_json.py CGIAR_program_connections.xlsx

Reads these tabs (names must not change):
  Programs        id, type, name, page URL, short description for the diagram panel
  Connections     the Y matrix ("works closely with")
  Map data        "Says Global" and "Regions (as on the page)"
  Map countries   one row per program + country, with ISO3, Tier and "Keep on map?"
  Map tiers       optional tier labels, descriptions and colours per program

Writes data/portfolio.json (diagram) and data/program-maps.json (maps), then prints a report.
Needs: pip install openpyxl
"""
import json, re, sys, os, datetime
from openpyxl import load_workbook

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', 'data')
TYPES = {'science program': 'science', 'scaling program': 'scaling', 'accelerator': 'accelerator', 'genebanks': 'accelerator'}


def rows(ws, header_row):
    head = [str(c.value or '').strip() for c in ws[header_row]]
    for r in ws.iter_rows(min_row=header_row + 1, values_only=True):
        if not any(v not in (None, '') for v in r):
            continue
        yield {head[i]: (r[i] if i < len(r) else None) for i in range(len(head)) if head[i]}


def find_header(ws, first):
    for i in range(1, 12):
        if str(ws.cell(i, 1).value or '').strip() == first or str(ws.cell(i, 2).value or '').strip() == first:
            return i
    raise SystemExit('Header row not found in tab "%s"' % ws.title)


def txt(v):
    return re.sub(r'\s+', ' ', str(v or '')).strip()


def main(path):
    wb = load_workbook(path, data_only=True)
    warn = []

    # Programs
    ws = wb['Programs']
    progs = []
    for r in rows(ws, find_header(ws, 'ID')):
        if not txt(r.get('ID')):
            continue
        progs.append({'id': txt(r['ID']), 'name': txt(r['Name']), 'type': TYPES.get(txt(r['Type']).lower(), 'science'),
                      'url': txt(r.get('Page on cgiar.org')), 'desc': txt(r.get('Short description (diagram panel)'))})
    by_name = {p['name']: p for p in progs}

    # Connections matrix
    ws = wb['Connections']
    hr = find_header(ws, '#')
    head = [txt(c.value) for c in ws[hr]]
    cols = [(i, by_name[h]['id']) for i, h in enumerate(head) if h in by_name]
    conn = {}
    for r in ws.iter_rows(min_row=hr + 1, values_only=True):
        name = txt(r[2]) if len(r) > 2 else ''
        if name not in by_name:
            continue
        conn[by_name[name]['id']] = [pid for i, pid in cols if txt(r[i]).upper() == 'Y' and pid != by_name[name]['id']]

    portfolio = {
        'title': "Interlinked support across CGIAR's portfolio",
        'hub': {'label': 'CGIAR Research Portfolio'},
        'updated': datetime.date.today().isoformat(),
        'source': os.path.basename(path),
        'programs': progs,
        'connections': conn,
    }

    # Maps
    ws = wb['Map data']
    md = {}
    for r in rows(ws, find_header(ws, '#')):
        name = txt(r.get('Program / accelerator'))
        if name not in by_name:
            continue
        reg = txt(r.get('Regions (as on the page)'))
        regions = [] if reg.lower() in ('', '(none)') else [re.sub(r'^and\s+', '', x.strip(), flags=re.I) for x in re.split(r'[;,.]', reg) if x.strip()]
        md[name] = {'global': txt(r.get('Says "Global"')).lower() == 'yes', 'regions': regions}

    tiers_meta = {}
    if 'Map tiers' in wb.sheetnames:
        ws = wb['Map tiers']
        for r in rows(ws, find_header(ws, 'Program / accelerator')):
            name, tier = txt(r.get('Program / accelerator')), txt(r.get('Tier'))
            if name and tier:
                tiers_meta.setdefault(name, {})[tier] = {'description': txt(r.get('Description')), 'color': txt(r.get('Colour (optional, hex)'))}

    ws = wb['Map countries']
    per, cnames = {}, {}
    for r in rows(ws, find_header(ws, '#')):
        if re.fullmatch(r'[A-Z]{3}', txt(r.get('ISO3')).upper()) and txt(r.get('Standard name')):
            cnames[txt(r.get('ISO3')).upper()] = txt(r.get('Standard name'))
        name, iso = txt(r.get('Program / accelerator')), txt(r.get('ISO3')).upper()
        if name not in by_name or txt(r.get('Keep on map?')).upper() == 'N':
            continue
        if not re.fullmatch(r'[A-Z]{3}', iso):
            warn.append('%s: no ISO3 for "%s"' % (name, txt(r.get('As written on the page'))))
            continue
        per.setdefault(name, []).append((iso, txt(r.get('Tier'))))

    maps = {'countryNames': None, 'defaults': {'ui': {}}, 'programs': {}}
    for p in progs:
        m = md.get(p['name'], {'global': False, 'regions': []})
        entries = per.get(p['name'], [])
        tier_order, tiered, plain = [], {}, []
        for iso, t in entries:
            if t:
                if t not in tiered:
                    tier_order.append(t)
                    tiered[t] = []
                tiered[t].append(iso)
            else:
                plain.append(iso)
        tier_order.sort(key=lambda t: [int(x) if x.isdigit() else x for x in re.split(r'(\d+)', t)])
        meta = tiers_meta.get(p['name'], {})
        cfg = {
            'header': {'eyebrow': 'CGIAR · ' + p['name'], 'title': 'Where we work'},
            'global': m['global'],
            'regions': m['regions'],
            'countries': plain,
            'tiers': [{'label': t, 'description': meta.get(t, {}).get('description', ''), 'color': meta.get(t, {}).get('color', ''), 'countries': tiered[t]} for t in tier_order],
        }
        if not (cfg['global'] or cfg['regions'] or cfg['countries'] or cfg['tiers']):
            warn.append('%s: nothing to show on the map' % p['name'])
        maps['programs'][p['id']] = cfg

    maps['countryNames'] = dict(sorted(cnames.items()))
    os.makedirs(DATA, exist_ok=True)
    with open(os.path.join(DATA, 'portfolio.json'), 'w', encoding='utf-8') as f:
        json.dump(portfolio, f, ensure_ascii=False, indent=2)
    with open(os.path.join(DATA, 'program-maps.json'), 'w', encoding='utf-8') as f:
        json.dump(maps, f, ensure_ascii=False, indent=2)

    # Check region names against the dictionary so typos show up before publishing.
    with open(os.path.join(DATA, 'regions.json'), encoding='utf-8') as f:
        d = json.load(f)
    for pid, cfg in maps['programs'].items():
        for r in cfg['regions']:
            if r not in d['regions'] and r not in d['groups'] and r.lower() not in d['aliases']:
                warn.append('%s: region "%s" is not in data/regions.json (shown as a dashed chip, not shaded)' % (pid, r))

    print('Wrote data/portfolio.json (%d programs) and data/program-maps.json' % len(progs))
    for pid, cfg in maps['programs'].items():
        print('  %-38s global=%-5s regions=%d countries=%d tiers=%s' % (pid, cfg['global'], len(cfg['regions']), len(cfg['countries']), [len(t['countries']) for t in cfg['tiers']]))
    if warn:
        print('\nCheck these:')
        for w in warn:
            print('  - ' + w)


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    main(sys.argv[1])
