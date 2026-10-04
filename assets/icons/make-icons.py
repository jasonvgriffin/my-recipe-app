"""Regenerates the app icon SVGs (assets/icons) and PNGs (assets/images). Run from the repo root: python3 assets/icons/make-icons.py (needs cairosvg).
Android mipmaps are generated from these PNGs by `expo prebuild` (app.json icon / adaptiveIcon)."""
import cairosvg
# v1.0.5 (Jason): the bowl is bright yellow (was green #66BB6A); steam and background unchanged.
G='#FFD60A'; L='#ECEFEC'; BG='#16211A'
def bowl(g,l):
    s=''.join(f'<path d="M{x},49 c-3,-3 3,-6 0,-9 c-3,-3 3,-6 0,-8" fill="none" stroke="{l}" stroke-width="2.6" stroke-linecap="round"/>' for x in (45,54,63))
    return s+f'<path d="M34,56 H74 A20 18 0 0 1 34,56 Z" fill="{g}"/><rect x="32" y="53" width="44" height="4.5" rx="2.25" fill="{g}"/><rect x="47" y="73" width="14" height="3.5" rx="1.75" fill="{g}"/>'
def svg(body,bg=None,scale=1.0):
    b=f'<rect width="108" height="108" fill="{bg}"/>' if bg else ''
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">{b}<g transform="translate(54 54) scale({scale}) translate(-54 -54)">{body}</g></svg>'
out={
 'icon.svg':svg(bowl(G,L),BG,1.45),
 'android-icon-foreground.svg':svg(bowl(G,L),None,1.12),
 'android-icon-background.svg':svg('',BG),
 'android-icon-monochrome.svg':svg(bowl('#FFFFFF','#FFFFFF'),None,1.12),
 'splash-icon.svg':svg(bowl(G,L),None,1.6),
}
for n,s in out.items():
    open('assets/icons/'+n,'w').write(s)
sizes={'icon':1024,'android-icon-foreground':1024,'android-icon-background':1024,'android-icon-monochrome':1024,'splash-icon':1024}
for n,px in sizes.items():
    cairosvg.svg2png(bytestring=out[n+'.svg'].encode(),write_to=f'assets/images/{n}.png',output_width=px,output_height=px)
cairosvg.svg2png(bytestring=out['icon.svg'].encode(),write_to='assets/images/favicon.png',output_width=48,output_height=48)
