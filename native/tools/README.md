# Model baker

`bake-model.mjs` turns a glTF/GLB car into the game's own `.scm` file (read by `src/carasset.cpp`). The game does not
read glTF, Draco or textures: everything is decoded, flattened and merged here, once.

```
cd native/tools
npm install
mkdir source
curl -L -o source/ferrari.glb    https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/gltf/ferrari.glb
curl -L -o source/CarConcept.glb https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/CarConcept/glTF-Binary/CarConcept.glb

node bake-model.mjs ferrari                      # -> ../assets/cars/ferrari.scm            (the supercar, wheels and steering wheel apart)
node bake-model.mjs carconcept                   # -> ../assets/cars/carconcept.scm         (the silver grand tourer)
node bake-model.mjs carconcept --traffic 24000   # -> ../assets/cars/carconcept_traffic.scm (one merged mesh for traffic and parked cars)
node bake-model.mjs carconcept --traffic 24000 --police   # -> carconcept_police.scm (with the livery)
node bake-model.mjs <model> --survey             # list every part in car space and its role, without writing anything
```

What it does to a model: applies the node transforms; turns the car to face +z; finds the four wheels (and, if the
source poses them steered or spun, straightens them); puts the tyres on y = 0 and the front axle where the physics
expects it; welds duplicate vertices; sorts every part into a material role (paint, glass, trim, chrome, lights, carbon,
tyre, rim, brake, interior, steering wheel); finds the steering wheel's pivot and axis; and writes the engine's 36-byte
vertex records. To add a car, add an entry to `MODELS` in the script (how to find its wheels, and which node or material
is which role), run `--survey`, then bake.

File format (`SCM1`, version 2, little endian): header (magic, version, part count, four wheels as centre x, y, z and
radius, body bounds, steering pivot and axis), then per part: role, wheel slot (-1 for the body), vertex count, index
count, `MeshVertex[]`, `uint32` indices.
