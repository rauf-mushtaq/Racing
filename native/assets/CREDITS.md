# Credits for the car models

The cars in `cars/` are other people's work, converted to the game's own format by `native/tools/bake-model.mjs`
(geometry only: the textures were not used, the game paints them with its own materials).

| File | Model | Author | Source | Licence |
|---|---|---|---|---|
| `ferrari.scm` | Ferrari 458 Italia (Spider) | vicent091036 | the three.js examples, `examples/models/gltf/ferrari.glb`; original on Sketchfab (model 57bf6cc56931426e87494f554df1dab6) | Creative Commons Attribution, as published with the model on Sketchfab. The licence text was not re-checked from here: check the Sketchfab page before you redistribute the game. |
| `carconcept.scm`, `carconcept_traffic.scm`, `carconcept_police.scm` | Car Concept | Eric Chadwick, Darmstadt Graphics Group GmbH, for the Khronos Group (2024) | [KhronosGroup/glTF-Sample-Assets](https://github.com/KhronosGroup/glTF-Sample-Assets), `Models/CarConcept` | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), stated in the file's own metadata |

The traffic and police versions of the concept car are simplified copies of the same model (merged into one mesh, with a
police livery added). Changes made to every model: converted to the game's format, wheels separated so they can spin and
steer, colours replaced by the game's materials, some small hidden parts simplified, and (for the concept car) the wheels
turned straight.
