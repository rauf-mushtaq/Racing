# Credits for the web version's assets

| File | What | Author | Licence |
|---|---|---|---|
| `hdr/venice_sunset_1k.hdr`, `hdr/royal_esplanade_1k.hdr`, `hdr/moonless_golf_1k.hdr` | Photographic sky and street lighting, used only for the soft light and reflections on everything | Greg Zaal, Poly Haven (polyhaven.com), via the three.js examples | CC0 (public domain) |
| `cars/ferrari.glb` | Ferrari 458 Italia (geometry; the game paints it with its own materials) | vicent091036 on Sketchfab, via the three.js examples (`examples/models/gltf/ferrari.glb`) | Creative Commons Attribution (as published with the model; check the Sketchfab page before you redistribute the game) |
| `draco/` | The Draco mesh decoder that unpacks the car | Google, from the three.js package | Apache 2.0 |
| `people/*.glb` | The six playable people: Business_Male_01 (Agent), Male_Adult_06 (Street), Male_Adult_12 (Denim), Male_Adult_20 (Hoodie), Female_Adult_04 (Leather) and Female_Adult_08 (Tee). Converted from the original FBX files (one mesh level, welded vertices, textures resized to 1,024 pixels and the specular maps turned into roughness maps) | Microsoft Rocketbox Avatar Library, Microsoft (github.com/microsoft/Microsoft-Rocketbox) | MIT (`people/LICENSE-Rocketbox.txt`) |
| `people/ped_*.glb` | The people on the pavements near you: Male_Adult_01, 03, 08 and 15 and Female_Adult_01, 02, 07 and 09, converted the same way with 512-pixel textures | Microsoft Rocketbox Avatar Library, Microsoft | MIT (`people/LICENSE-Rocketbox.txt`) |
| `people/anims.json` | Recorded human motion: a breathing idle, a stroll, a walk, a jog, a run and a sprint, and a crouch pose (m_idle_breathe_01, m_walk_stroll_01, m_walk_neutral, m_run_slow_01, m_run_neutral, m_run_fast_01, m_crouch_idle), every bone and finger sampled at 30 frames a second and packed as 16-bit rotations | Microsoft Rocketbox Avatar Library (Assets/Animations), Microsoft | MIT (`people/LICENSE-Rocketbox.txt`) |
| `people/cop_*.glb` | The police officers: Police_Male_01 (blue uniform), Police_Male_03 (black uniform), Police_Male_06 (plain clothes, POLICE vest) and Police_Male_02 (SWAT), converted the same way with 512-pixel textures | Microsoft Rocketbox Avatar Library, Microsoft | MIT (`people/LICENSE-Rocketbox.txt`) |
| `fonts/` | Barlow and Barlow Condensed (latin subset, as woff2) | Jeremy Tribby, via the Fontsource packages | SIL Open Font License 1.1 (`fonts/LICENSE-Barlow-OFL.txt`) |
| `../vendor/three/` | three.js r160 (the module build and the addons the game uses: loaders, post-processing, cascaded shadow maps, sky) | three.js authors (threejs.org) | MIT (`vendor/three/LICENSE`) |
| `icon.svg`, `icon-*.png` | The app icon (a sun over a road) | Drawn for this game | Same licence as the game |
