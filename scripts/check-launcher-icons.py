#!/usr/bin/env python3
"""CI check (v1.0.6 app icon picker): reads `aapt2 dump xmltree --file AndroidManifest.xml <apk>` on stdin and
fails unless the launcher setup is safe:
  - MainActivity has NO MAIN/LAUNCHER filter, but keeps the myrecipeapp:// deep-link (incl. auth) filter;
  - one <activity-alias> per icon with MAIN/LAUNCHER, targeting MainActivity;
  - exactly one alias enabled in the manifest (the default), so a fresh install has one launcher entry.
Usage: aapt2 dump xmltree --file AndroidManifest.xml app.apk | python3 scripts/check-launcher-icons.py <count>"""
import re, sys

expected = int(sys.argv[1]) if len(sys.argv) > 1 else 6
lines = sys.stdin.read().splitlines()

def blocks(tag):
    """Yield (attrs text, body text) for each element named `tag` (aapt2 indents children)."""
    out = []
    for i, l in enumerate(lines):
        m = re.match(r'^(\s*)E: ' + re.escape(tag) + r'\b', l)
        if not m:
            continue
        ind = len(m.group(1)); body = []
        for l2 in lines[i + 1:]:
            m2 = re.match(r'^(\s*)E: ', l2)
            if m2 and len(m2.group(1)) <= ind:
                break
            body.append(l2)
        out.append('\n'.join(body))
    return out

def attr(body, name):
    m = re.search(r'A: [^\n]*:' + name + r'\([^)]*\)=(?:\(type [^)]*\))?"?([^"\s]+)', body)
    return m.group(1) if m else None

def own_attrs(body):
    # attributes before the first child element
    return body.split(' E: ')[0] if ' E: ' in body else body

errors = []
acts = [b for b in blocks('activity') if (attr(own_attrs(b), 'name') or '').endswith('.MainActivity')]
if len(acts) != 1:
    errors.append(f'expected one MainActivity, found {len(acts)}')
else:
    main = acts[0]
    if 'android.intent.category.LAUNCHER' in main:
        errors.append('MainActivity still has a LAUNCHER filter (duplicate launcher entries)')
    if 'myrecipeapp' not in main:
        errors.append('MainActivity lost the myrecipeapp:// deep-link filter')
aliases = blocks('activity-alias')
launchers = [a for a in aliases if 'android.intent.category.LAUNCHER' in a and 'LauncherIcon' in a]
if len(launchers) != expected:
    errors.append(f'expected {expected} launcher aliases, found {len(launchers)}')
enabled = []
for a in launchers:
    head = own_attrs(a)
    if not (attr(head, 'targetActivity') or '').endswith('.MainActivity'):
        errors.append('alias without MainActivity target')
    m = re.search(r':enabled\([^)]*\)=\(type 0x12\)0x([0-9a-f]+)', head)
    if m and int(m.group(1), 16) != 0:
        enabled.append(attr(head, 'name'))
if len(enabled) != 1 or not (enabled[0] or '').endswith('.LauncherIconDefault'):
    errors.append(f'expected only LauncherIconDefault enabled, found {enabled}')
if errors:
    print('\n'.join('::error::' + e for e in errors)); sys.exit(1)
print(f'Launcher icons OK: {len(launchers)} aliases, enabled: {enabled[0]}; deep links on MainActivity')
