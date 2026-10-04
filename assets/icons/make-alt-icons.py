"""App icon picker (v1.0.6): renders the alternate launcher icons into assets/app-icons/<id>/ and the preview sheet.
Run from the repo root: python3 assets/icons/make-alt-icons.py [preview.png] (needs cairosvg + Pillow).
The bowl artwork and adaptive-icon geometry are exactly the default icon's (make-icons.py ADAPTIVE_SCALE =
1.12 * 72/108 in the 108dp canvas): launchers show the inner 72dp, so on a round launcher every option looks like
the v1.0.5 preview's round render.
Keep ICONS in sync with src/lib/app-icons.ts (ids, colors) — __tests__/app-icons.test.ts checks it."""
import io, json, os, sys
import cairosvg
from PIL import Image, ImageDraw

ICONS = json.load(open('assets/app-icons/icons.json'))
ADAPTIVE_SCALE = round(1.12 * 72 / 108, 4)

def bowl(g, l):
    s = ''.join(f'<path d="M{x},49 c-3,-3 3,-6 0,-9 c-3,-3 3,-6 0,-8" fill="none" stroke="{l}" stroke-width="2.6" stroke-linecap="round"/>' for x in (45, 54, 63))
    return s + f'<path d="M34,56 H74 A20 18 0 0 1 34,56 Z" fill="{g}"/><rect x="32" y="53" width="44" height="4.5" rx="2.25" fill="{g}"/><rect x="47" y="73" width="14" height="3.5" rx="1.75" fill="{g}"/>'

def svg(body, bg=None, scale=1.0):
    b = f'<rect width="108" height="108" fill="{bg}"/>' if bg else ''
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">{b}<g transform="translate(54 54) scale({scale}) translate(-54 -54)">{body}</g></svg>'

def png(s, px):
    return Image.open(io.BytesIO(cairosvg.svg2png(bytestring=s.encode(), output_width=px, output_height=px))).convert('RGBA')

def masked(img, shape):
    px = img.size[0]
    m = Image.new('L', (px, px), 0); d = ImageDraw.Draw(m)
    if shape == 'circle':
        # Launchers show the inner 72dp of the 108dp adaptive canvas; crop to it, then mask round.
        inset = round(px * 18 / 108); img = img.crop((inset, inset, px - inset, px - inset)).resize((px, px), Image.LANCZOS)
        d.ellipse((0, 0, px - 1, px - 1), fill=255)
    else:
        inset = round(px * 18 / 108); img = img.crop((inset, inset, px - inset, px - inset)).resize((px, px), Image.LANCZOS)
        d.rounded_rectangle((0, 0, px - 1, px - 1), radius=px // 4, fill=255)
    out = Image.new('RGBA', (px, px), (0, 0, 0, 0)); out.paste(img, (0, 0), m); return out

for ic in ICONS:
    d = f"assets/app-icons/{ic['id']}"; os.makedirs(d, exist_ok=True)
    fg = svg(bowl(ic['bowl'], ic['steam']), None, ADAPTIVE_SCALE)
    png(fg, 432).save(f'{d}/foreground.png', optimize=True)              # adaptive foreground (xxxhdpi 108dp)
    full = png(svg(bowl(ic['bowl'], ic['steam']), ic['background'], ADAPTIVE_SCALE), 432)
    masked(full, 'square').resize((192, 192), Image.LANCZOS).save(f'{d}/legacy.png', optimize=True)          # API < 26
    masked(full, 'circle').resize((192, 192), Image.LANCZOS).save(f'{d}/legacy_round.png', optimize=True)
    masked(full, 'circle').resize((160, 160), Image.LANCZOS).save(f'{d}/preview.png', optimize=True)         # in-app picker

if len(sys.argv) > 1:
    from PIL import ImageFont
    cell = 220; W = cell * len(ICONS); H = 2 * cell + 60
    sheet = Image.new('RGB', (W, H), '#F0F0F0'); dr = ImageDraw.Draw(sheet)
    try: font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 18)
    except Exception: font = ImageFont.load_default()
    for i, ic in enumerate(ICONS):
        full = png(svg(bowl(ic['bowl'], ic['steam']), ic['background'], ADAPTIVE_SCALE), 600)
        c = masked(full, 'circle').resize((180, 180), Image.LANCZOS); s = masked(full, 'square').resize((180, 180), Image.LANCZOS)
        sheet.paste(c, (i * cell + 20, 20), c); sheet.paste(s, (i * cell + 20, cell + 10), s)
        label = ic['label'] + (' (default)' if ic['id'] == 'default' else '')
        w = dr.textlength(label, font=font); dr.text((i * cell + (cell - w) / 2, 2 * cell + 20), label, fill='#222', font=font)
    sheet.save(sys.argv[1])
