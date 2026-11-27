#!/usr/bin/env python3
# The leaf cards for the trees (props.js: a card is a spray of leaves, seen from any side): photographed jacaranda fronds from Poly Haven's
# "Jacaranda Tree" scan (CC0), cut out with the scan's own alpha and laid round the middle of the card, the ones behind darker (they are in the
# shade of the ones in front), thinning towards the edge so the card's outline never shows. Writes assets/scans/leafcard.webp (RGBA).
#   python3 tools/scans/leaves.py <leaves_diff.jpg> <leaves_alpha.jpg>
# Also assets/scans/bushcard.webp: the same leaves smaller and denser, for the shrubs.
import sys, random, math
from PIL import Image, ImageEnhance, ImageFilter, ImageChops
diff, alpha = Image.open(sys.argv[1]).convert('RGB'), Image.open(sys.argv[2]).convert('L')
alpha = alpha.point(lambda v: 0 if v < 110 else 255)                             # (the scan's alpha is a JPEG: never quite 0 off the leaf)
rgba = diff.copy(); rgba.putalpha(alpha)
# The fronds: the separate pieces of the alpha (found on a small copy), each cut out.
small = alpha.resize((256, 256)); px = small.load(); seen = set(); boxes = []
for y in range(256):
    for x in range(256):
        if px[x, y] < 128 or (x, y) in seen: continue
        st = [(x, y)]; seen.add((x, y)); x0 = x1 = x; y0 = y1 = y; n = 0; comp = []
        while st:
            a, b = st.pop(); n += 1; comp.append((a, b)); x0, x1, y0, y1 = min(x0, a), max(x1, a), min(y0, b), max(y1, b)
            for c, d in ((a + 1, b), (a - 1, b), (a, b + 1), (a, b - 1)):
                if 0 <= c < 256 and 0 <= d < 256 and (c, d) not in seen and px[c, d] >= 128: seen.add((c, d)); st.append((c, d))
        if n > 150:
            m = Image.new('L', (256, 256), 0); mp = m.load()
            for a, b in comp: mp[a, b] = 255
            boxes.append(((x0 * 8, y0 * 8, (x1 + 1) * 8, (y1 + 1) * 8), m.filter(ImageFilter.MaxFilter(5))))
def cut(b, m):                                                                    # (only this frond: not the tips of its neighbours in its box)
    f = rgba.crop(b); k = m.crop(tuple(v // 8 for v in b)).resize(f.size, Image.NEAREST)
    f.putalpha(ImageChops.multiply(f.split()[3], k)); return f
fronds = [cut(b, m) for b, m in boxes]; print(len(fronds), 'fronds')
def card(name, size, nback, nfront, seed, spread):
    global S, out, rnd
    S = 1024; out = Image.new('RGBA', (S, S), (0, 0, 0, 0)); rnd = random.Random(seed)
    def put(k, shade, spread):
        f = fronds[rnd.randrange(len(fronds))]; L = S * size * (0.8 + rnd.random() * 0.5) / max(f.size)
        g = f.resize((max(1, int(f.width * L)), max(1, int(f.height * L))), Image.LANCZOS).rotate(rnd.random() * 360, expand=True, resample=Image.BICUBIC)
        rgb = ImageEnhance.Brightness(g.convert('RGB')).enhance(shade * (0.9 + rnd.random() * 0.25)); g = Image.merge('RGBA', (*rgb.split(), g.split()[3]))
        r = math.sqrt(rnd.random()) * S * spread; a = rnd.random() * 6.283
        out.alpha_composite(g, (int(S / 2 + math.cos(a) * r - g.width / 2), int(S / 2 + math.sin(a) * r - g.height / 2)))
    for k in range(nback): put(k, 0.5, spread * 0.9)                                         # (the ones behind, in their own shade)
    for k in range(nfront): put(k, 1.0, spread)
    # Thin out towards the edge (the card's square must never show) and keep hard alpha for alpha testing.
    a = out.split()[3].load()
    for y in range(S):
        for x in range(S):
            r = math.hypot(x - S / 2, y - S / 2) / (S / 2)
            if r > 0.92: a[x, y] = 0
    out = out.resize((512, 512), Image.LANCZOS)
    out.save(f'assets/scans/{name}.webp', 'WEBP', quality=86, method=6)
card('leafcard', 0.4, 22, 26, 7, 0.27)
card('bushcard', 0.2, 70, 90, 11, 0.32)
