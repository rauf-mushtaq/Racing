#!/bin/sh
# Builds the scanned models in assets/scans/ from Poly Haven's CC0 photo-scans (polyhaven.com/models): download the 1k glTF, weld, simplify to a few
# thousand triangles at most, textures down to 512 px as WebP, Draco-compressed meshes. Needs gltf-transform (npm i -g @gltf-transform/cli).
#   sh tools/scans/models.sh <work-dir>      (run from the repository root)
set -e
W=${1:-/tmp/phmodels}; mkdir -p "$W"
model() {   # model <poly haven id> <output name> <simplify ratio>
  python3 - "$1" "$W" <<'PY'
import json, sys, os, urllib.request
op = urllib.request.build_opener(); op.addheaders = [('User-Agent', 'texture-fetch/1.0')]; urllib.request.install_opener(op)
k, W = sys.argv[1], sys.argv[2]; g = json.load(urllib.request.urlopen(f'https://api.polyhaven.com/files/{k}'))['gltf']['1k']['gltf']
for u, p in [(g['url'], os.path.basename(g['url']))] + [(v['url'], p) for p, v in g['include'].items()]:
    p = f'{W}/{k}/{p}'; os.makedirs(os.path.dirname(p), exist_ok=True)
    if not os.path.exists(p): urllib.request.urlretrieve(u, p)
PY
  gltf-transform weld "$W/$1/$1_1k.gltf" "$W/$2.w.glb"
  gltf-transform simplify "$W/$2.w.glb" "$W/$2.s.glb" --ratio "$3" --error 0.01
  gltf-transform resize "$W/$2.s.glb" "$W/$2.r.glb" --width 512 --height 512
  gltf-transform webp "$W/$2.r.glb" "$W/$2.p.glb"
  gltf-transform draco "$W/$2.p.glb" "assets/scans/$2.glb"
}
model namaqualand_boulder_02 rock 0.004
model fire_hydrant hydrant 0.03
model painted_wooden_bench bench 1
model quiver_tree_01 quiver 0.03
model sofa_02 sofa 1
model dining_chair_02 chair 0.08
