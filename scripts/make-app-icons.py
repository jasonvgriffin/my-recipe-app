#!/usr/bin/env python3
"""Generate the alternate launcher icons (v1.0.7 App icon picker) from flat SVG designs.

For every icon in assets/app-icons/icons.json except "default" (the Classic yellow bowl, which is the app's own
launcher icon and is left untouched) this writes into assets/app-icons/<id>/:
  foreground.png    432x432 adaptive-icon foreground (108dp at xxxhdpi), art inside the 66dp safe circle
  monochrome.png    432x432 themed-icon layer (Android 13+), same silhouette in white
  legacy.png        192x192 rounded-square icon (API < 26)
  legacy_round.png  192x192 round icon (API < 26)
  preview.png       160x160 round preview for Settings → Appearance → App icon
and renders a contact sheet of all icons (round + squircle) with labels.

Usage: python3 scripts/make-app-icons.py [--sheet /workspace/icon-options-1.0.7.png]
Needs: cairosvg, Pillow.
"""
import io
import json
import os
import sys

import cairosvg
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICONS = json.load(open(os.path.join(ROOT, 'assets/app-icons/icons.json')))

# ---- designs: SVG fragments in the 108x108 adaptive-icon space, centred on (54, 54) --------------------------------


def spoon(fill, outline, angle):
    """One spoon pointing up, rotated about the crossing point."""
    shape = (
        '<g transform="rotate({a} 0 6)">'
        '<ellipse cx="0" cy="-13" rx="6.6" ry="9.2"/>'
        '<path d="M-1.5,-5 L1.5,-5 L2.4,19.5 A2.4,2.4 0 0 1 -2.4,19.5 Z"/>'
        '</g>'
    ).format(a=angle)
    return (
        f'<g fill="{outline}" stroke="{outline}" stroke-width="3.2" stroke-linejoin="round">{shape}</g>'
        f'<g fill="{fill}">{shape}</g>'
    )


def design_spoons(c):
    # Two spoons slightly crossed: the right one drawn over the left with a background-colored gap.
    return f'<g transform="translate(54 52)">{spoon(c["fg2"], c["background"], -24)}{spoon(c["fg"], c["background"], 24)}</g>'


def design_chef_hat(c):
    return (
        '<g transform="translate(54 55)">'
        f'<g fill="{c["fg"]}">'
        '<circle cx="-10" cy="-7" r="8.5"/><circle cx="10" cy="-7" r="8.5"/><circle cx="0" cy="-12" r="10"/>'
        '<rect x="-12.5" y="-8" width="25" height="18" rx="2"/>'
        '</g>'
        f'<rect x="-13" y="10" width="26" height="8" rx="2.2" fill="{c["fg2"]}"/>'
        f'<path d="M-5,4 V-2 M0,4 V-4 M5,4 V-2" stroke="{c["line"]}" stroke-width="1.6" stroke-linecap="round"/>'
        '</g>'
    )


def design_whisk(c):
    wire = f'fill="none" stroke="{c["fg"]}" stroke-width="2.2" stroke-linecap="round"'
    return (
        '<g transform="translate(54 54) rotate(-28)">'
        f'<path d="M0,4 C-15,-6 -11,-25 0,-25 C11,-25 15,-6 0,4" {wire}/>'
        f'<path d="M0,4 C-8,-7 -6,-25 0,-25 C6,-25 8,-7 0,4" {wire}/>'
        f'<path d="M0,4 V-25" {wire}/>'
        f'<rect x="-3.4" y="3" width="6.8" height="4" rx="1.2" fill="{c["fg2"]}"/>'
        f'<rect x="-3" y="7" width="6" height="16" rx="3" fill="{c["fg"]}"/>'
        '</g>'
    )


def design_cookbook(c):
    return (
        '<g transform="translate(54 54)">'
        f'<rect x="-14" y="-19" width="30" height="38" rx="3" fill="{c["fg2"]}"/>'  # page block
        f'<rect x="-16" y="-20" width="29" height="38" rx="3" fill="{c["fg"]}"/>'  # cover
        f'<rect x="-16" y="-20" width="6" height="38" rx="2.5" fill="{c["line"]}"/>'  # spine
        f'<path d="M13,-17 V16" stroke="{c["fg2"]}" stroke-width="1"/>'
        # emblem: a small bowl with one steam curl on the cover
        f'<g fill="{c["emblem"]}"><path d="M-6,-1 H10 A8,8 0 0 1 -6,-1 Z"/><rect x="-1" y="6" width="6" height="2" rx="1"/></g>'
        f'<path d="M2,-5 C0,-8 4,-10 2,-13" fill="none" stroke="{c["emblem"]}" stroke-width="1.8" stroke-linecap="round"/>'
        f'<rect x="-6" y="11" width="16" height="2" rx="1" fill="{c["emblem"]}" opacity="0.75"/>'
        '</g>'
    )


def design_pot(c):
    return (
        '<g transform="translate(54 56)">'
        f'<g fill="{c["fg"]}">'
        '<circle cx="0" cy="-17.5" r="2.8"/>'
        '<path d="M-16,-9 C-16,-15 -9,-16.5 0,-16.5 C9,-16.5 16,-15 16,-9 Z"/>'
        '<rect x="-19.5" y="-8" width="39" height="5" rx="2.5"/>'
        '<path d="M-16,-3 H16 V10 A5,5 0 0 1 11,15 H-11 A5,5 0 0 1 -16,10 Z"/>'
        '<rect x="-23" y="-2" width="9" height="4.5" rx="2.2"/><rect x="14" y="-2" width="9" height="4.5" rx="2.2"/>'
        '</g>'
        f'<rect x="-16" y="-3" width="32" height="2" fill="{c["line"]}" opacity="0.35"/>'
        '</g>'
    )


def design_fork_knife(c):
    fg = c['fg']
    return (
        '<g transform="translate(54 54)">'
        # fork
        f'<g fill="{fg}">'
        '<rect x="-15.5" y="-21" width="2.4" height="12" rx="1.2"/><rect x="-11.7" y="-21" width="2.4" height="12" rx="1.2"/>'
        '<rect x="-7.9" y="-21" width="2.4" height="12" rx="1.2"/>'
        '<path d="M-15.5,-11 H-5.5 V-8 C-5.5,-5 -7.5,-3.5 -8.6,-3 L-8,19 A2.5,2.5 0 0 1 -13,19 L-12.4,-3 C-13.5,-3.5 -15.5,-5 -15.5,-8 Z"/>'
        '</g>'
        # knife
        f'<path d="M9,-21 C14.5,-17 15.5,-7 14.5,1 L12.3,1 L12.8,19 A2.6,2.6 0 0 1 7.6,19 L8,-1 Z" fill="{fg}"/>'
        '</g>'
    )


DESIGNS = {
    'spoons': design_spoons,
    'chef_hat': design_chef_hat,
    'whisk': design_whisk,
    'cookbook': design_cookbook,
    'pot': design_pot,
    'fork_knife': design_fork_knife,
}


# Art is drawn ~44dp tall; scaled so its visual weight sits close to the Classic bowl inside the 66dp safe circle.
ART_SCALE = 0.9


def fg_svg(icon, mono=False):
    colors = dict(icon['colors'])
    colors['background'] = icon['background']
    if mono:
        # Themed icon (Android 13+): solid shapes white, details/gaps black → turned into transparent cut-outs below.
        colors = {k: ('#000000' if k in ('line', 'emblem', 'background') else '#FFFFFF') for k in colors}
        colors.setdefault('background', '#000000')
    body = DESIGNS[icon['design']](colors)
    body = f'<g transform="translate(54 54) scale({ART_SCALE}) translate(-54 -54)">{body}</g>'
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">{body}</svg>'


def mono_layer(icon, size):
    img = render(fg_svg(icon, mono=True), size)
    lum = img.convert('L')
    alpha = Image.composite(lum, Image.new('L', img.size, 0), img.getchannel('A'))
    from PIL import ImageChops
    alpha = ImageChops.multiply(alpha, img.getchannel('A'))
    out = Image.new('RGBA', img.size, (255, 255, 255, 0))
    out.putalpha(alpha)
    return out


def render(svg, size):
    png = cairosvg.svg2png(bytestring=svg.encode(), output_width=size, output_height=size)
    return Image.open(io.BytesIO(png)).convert('RGBA')


def composed(icon, size, shape):
    """Background + foreground. Legacy/preview icons crop the 108dp canvas to the middle 72dp like a launcher mask."""
    canvas = 108
    view = 72 if shape != 'full' else 108
    off = (canvas - view) / 2
    fg = fg_svg(icon).replace('viewBox="0 0 108 108"', f'viewBox="{off} {off} {view} {view}"')
    art = render(fg, size)
    bg = Image.new('RGBA', (size, size), icon['background'])
    bg.alpha_composite(art)
    mask = Image.new('L', (size * 4, size * 4), 0)
    d = ImageDraw.Draw(mask)
    if shape == 'round':
        d.ellipse((0, 0, size * 4 - 1, size * 4 - 1), fill=255)
    else:
        d.rounded_rectangle((0, 0, size * 4 - 1, size * 4 - 1), radius=int(size * 4 * 0.22), fill=255)
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    out.paste(bg, (0, 0), mask.resize((size, size), Image.LANCZOS))
    return out


def write_icon(icon):
    out = os.path.join(ROOT, 'assets/app-icons', icon['id'])
    os.makedirs(out, exist_ok=True)
    render(fg_svg(icon), 432).save(os.path.join(out, 'foreground.png'), optimize=True)
    mono_layer(icon, 432).save(os.path.join(out, 'monochrome.png'), optimize=True)
    composed(icon, 192, 'square').save(os.path.join(out, 'legacy.png'), optimize=True)
    composed(icon, 192, 'round').save(os.path.join(out, 'legacy_round.png'), optimize=True)
    composed(icon, 160, 'round').save(os.path.join(out, 'preview.png'), optimize=True)


def font(size, bold=True):
    for p in ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' if bold else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf']:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def contact_sheet(path):
    cell, pad = 200, 30
    w = len(ICONS) * cell + pad * 2
    h = 560
    sheet = Image.new('RGB', (w, h), '#F1F1F1')
    d = ImageDraw.Draw(sheet)
    d.text((pad, 14), 'My Recipe App 1.0.7 — app icons (top: round, middle: squircle, bottom: themed/monochrome)', fill='#333', font=font(18))
    for i, icon in enumerate(ICONS):
        x = pad + i * cell + 20
        dir_ = os.path.join(ROOT, 'assets/app-icons', icon['id'])
        round_ = Image.open(os.path.join(dir_, 'legacy_round.png')).resize((160, 160), Image.LANCZOS)
        square = Image.open(os.path.join(dir_, 'legacy.png')).resize((160, 160), Image.LANCZOS)
        sheet.paste(round_, (x, 50), round_)
        sheet.paste(square, (x, 225), square)
        mono_src = os.path.join(dir_, 'monochrome.png')
        if icon['id'] == 'default':
            mono_src = os.path.join(ROOT, 'assets/images/android-icon-monochrome.png')
        if os.path.exists(mono_src):
            m = Image.open(mono_src).convert('RGBA')
            k = m.size[0] / 6  # middle 72 of 108dp
            mono = m.crop((int(k), int(k), int(m.size[0] - k), int(m.size[0] - k))).resize((80, 80), Image.LANCZOS)
            disc = Image.new('RGBA', (80, 80), (0, 0, 0, 0))
            ImageDraw.Draw(disc).ellipse((0, 0, 79, 79), fill='#3A4A3D')
            tint = Image.new('RGBA', (80, 80), '#CFE8D2')
            disc.paste(tint, (0, 0), mono.getchannel('A'))
            sheet.paste(disc, (x + 40, 400), disc)
        label = icon['label'] + (' (default)' if icon['id'] == 'default' else '')
        tw = d.textlength(label, font=font(17))
        d.text((x + 80 - tw / 2, 500), label, fill='#222', font=font(17))
    sheet.save(path)


def main():
    for icon in ICONS:
        if icon['id'] == 'default':
            continue
        write_icon(icon)
    if '--sheet' in sys.argv:
        contact_sheet(sys.argv[sys.argv.index('--sheet') + 1])


if __name__ == '__main__':
    main()
