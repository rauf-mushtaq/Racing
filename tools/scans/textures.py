#!/usr/bin/env python3
# Builds assets/scans/: photo-scanned surfaces from Poly Haven (polyhaven.com, CC0), as WebP, for the game's surfaces (src/scans.js swaps each of the
# game's drawn textures for its scan once it has loaded). Run from the repository root:   python3 tools/scans/textures.py [cache-dir]
# Each entry: the game's name -> (Poly Haven asset, which maps). d: the colour, n: the normal map (OpenGL), r: the roughness.
import json, os, sys, urllib.request
from PIL import Image
SCANS = {
    'grass': ('sparse_grass', 'd'), 'asphalt': ('asphalt_01', 'dnr'), 'concrete': ('concrete_pavement', 'dn'), 'sand': ('coast_sand_01', 'd'),
    'snow': ('snow_02', 'd'), 'rock': ('rock_face_03', 'd'), 'lake': ('mud_cracked_dry_03', 'd'), 'bark': ('bark_brown_02', 'dn'), 'palmbark': ('palm_tree_bark', 'dn'),
    # The walls of the buildings (textures.js facadeBase lays them into the wall of each front, round its windows).
    'wallbrick': ('red_brick_03', 'd'), 'wallplaster': ('painted_plaster_wall', 'd'), 'wallconcrete': ('concrete_wall_008', 'd'), 'wallstone': ('large_sandstone_blocks', 'd'),
}
# Inside (interior.js): the scan repeated to its real size over the 4 m one copy of an interior surface covers (from Poly Haven's measured size).
INSIDE = {
    'vinyl': 'floor_tiles_08', 'marble': 'marble_01', 'granite': 'granite_tile', 'rubber': 'rubber_tiles', 'gymfloor': 'rubber_tiles', 'flags': 'floor_tiles_02',
    'ashlar': 'white_sandstone_blocks_02', 'slab': 'concrete_floor_02', 'showroom': 'granite_tile', 'oak': 'oak_wood_planks', 'plaster': 'painted_plaster_wall',
    'brick': 'white_sandstone_blocks_02', 'concrete': 'concrete_wall_008',
}
KEYS = {'d': ('Diffuse', 'diff'), 'n': ('nor_gl', 'nor'), 'r': ('Rough', 'rough')}
cache = sys.argv[1] if len(sys.argv) > 1 else '/tmp/phcache'; out = 'assets/scans'; os.makedirs(out, exist_ok=True); os.makedirs(cache, exist_ok=True)
op = urllib.request.build_opener(); op.addheaders = [('User-Agent', 'texture-fetch/1.0')]; urllib.request.install_opener(op)
credits = []
for name, (pid, maps) in SCANS.items():
    files = None
    for m in maps:
        key, tag = KEYS[m]; src = f'{cache}/{pid}_{tag}_1k.jpg'
        if not os.path.exists(src):
            files = files or json.load(urllib.request.urlopen(f'https://api.polyhaven.com/files/{pid}', timeout=30))
            urllib.request.urlretrieve(files[key]['1k']['jpg']['url'], src)
        im = Image.open(src); im = im.convert('L') if m == 'r' else im.convert('RGB')
        im.resize((1024, 1024), Image.LANCZOS).save(f'{out}/{name}_{tag}.webp', 'WEBP', quality=88 if m == 'n' else 82, method=6)
    info = json.load(urllib.request.urlopen(f'https://api.polyhaven.com/info/{pid}', timeout=30))
    credits.append(f"{name}: \"{info['name']}\" ({pid}) by {', '.join(info['authors'])}")
catalog = json.load(urllib.request.urlopen('https://api.polyhaven.com/assets?t=textures', timeout=60))
done = {}
for name, pid in INSIDE.items():
    mm = (catalog[pid].get('dimensions') or [2000])[0]; n = max(1, round(4000 / mm))
    for m in 'dnr':
        key, tag = KEYS[m]; src = f'{cache}/{pid}_{tag}_1k.jpg'
        if not os.path.exists(src):
            files = done.get(pid) or json.load(urllib.request.urlopen(f'https://api.polyhaven.com/files/{pid}', timeout=30)); done[pid] = files
            urllib.request.urlretrieve(files[key]['1k']['jpg']['url'], src)
        im = Image.open(src); im = im.convert('L') if m == 'r' else im.convert('RGB'); t = 1024 // n; im = im.resize((t, t), Image.LANCZOS)
        big = Image.new(im.mode, (t * n, t * n))
        for i in range(n):
            for j in range(n): big.paste(im, (i * t, j * t))
        big.resize((1024, 1024), Image.LANCZOS).save(f'{out}/in_{name}_{tag}.webp', 'WEBP', quality=86 if m == 'n' else 80, method=6)
    if pid not in [c.split('(')[1].split(')')[0] for c in credits]:
        info = json.load(urllib.request.urlopen(f'https://api.polyhaven.com/info/{pid}', timeout=30)); credits.append(f"in_{name}: \"{info['name']}\" ({pid}) by {', '.join(info['authors'])}")
open(f'{out}/CREDITS.txt', 'w').write('Photo-scanned surfaces from Poly Haven (polyhaven.com/textures), CC0 (public domain):\n' + '\n'.join(credits) + '\n')
print('\n'.join(credits))
