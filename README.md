# Sunset City

An open-world street racer made with Three.js. Drive a V12 supercar through a California-style city of boulevards, palms, shops, apartments and glass towers, then out along motorways into a 12 × 16 km world: a coastline, snow-capped mountains, desert and canyons, grassland, a dry-lake airfield and two secret military bunkers you can drive into. It's lit at golden hour by default, with the sun low and backlit through the haze. It's a browser game with generated models and textures, so it aims for the *mood* of a modern open-world racer rather than matching a big studio's assets. It's a sister game to [MushtaqTrack](https://github.com/rauf-mushtaq/mushtaqtrack) and reuses what that game learned about car handling, iPad performance, and touch, gamepad and steering-wheel controls.

## Native version (C++ and HLSL)

A native Windows version of this game, written in C++ with Direct3D 12 and HLSL shaders, is in [`native/`](native/): the world, a detailed wet city with reflections, traffic, pedestrians, races, and an escape-the-police mode with a gadget car (see its README). It has more than the web version in some ways (the police mode, reflections) and less in others (bunkers, map, sound). The web version below stays as it is until the native one has been tested on real hardware.

## Play

The game loads its modules from files, so it has to be served over HTTP, not opened as a file:

- **GitHub Pages:** in this repository go to Settings → Pages → Deploy from a branch → `main`, folder `/`. The game is then at `https://rauf-mushtaq.github.io/Racing/`.
- **On your computer:** run `python3 -m http.server` in this folder and open `http://localhost:8000`.

There's nothing to build or install. Three.js comes from a CDN, and every model, texture and sound is generated when the game starts.

## What's in it

- **The car:** the Vento SV, a made-up wedge-shaped, mid-engined V12 supercar (no real brands) with a big rear wing, arrowhead tail lights that brighten when you brake, and a centre exhaust that shoots a blue nitro flame. It has nine paint colours in the Garage.
- **A big city:** 25 × 25 roads, about 4.4 km across (nine times the area of the first version), streamed in around you as you drive so it never stops to load. Every fourth road is a six-lane boulevard with a palm-planted median and overhead signs. From the middle outwards: **downtown** towers (round, chamfered and rounded-corner towers with stepped tiers, stone plinths, tapered crowns and masts), **mid-rise** blocks of glass, offices, brick walk-ups and shops, **low-rise** neighbourhoods, and **suburbs** of detached houses with tiled hip roofs, lawns, driveways and hedges. There are parks with paths, car parks, billboards, traffic lights at every junction, power poles with wires, and hydrants, bins and benches along the kerbs. Street corners have rounded kerbs.
- **The wider world:** about 12 × 16 km, streamed in as you drive. **Coast** to the west (beach, rippling sea, palm trees), **snowy mountains** to the north (pine forests, snow-laden pines, white peaks and a ski lodge), **desert** to the east (dunes, saguaro cacti, boulders, red sandstone mesas and a canyon with bridges over it, and a roadside gas station), and **grassland** to the south (trees, scrub and a wind farm). Cliffs are textured from the side, and desert rock is banded like sandstone.
- **Motorways:** a 43 km ring motorway plus four spokes out of the city, with lane markings, a concrete median barrier, steel guardrails (solid to the car), bridge parapets and piers. The roads are graded to climb passes and cross the canyon, and the valley is carved around them. Motorway traffic includes box trucks and buses, in both directions.
- **Secret places:** two hidden bunkers, **Site 7** under a snowy mountain and **Site 12** in a red mesa. Each has a hazard-striped apron, a restricted-area sign, blast doors, a tunnel and a lit hangar with crates, drums, a jet and a truck, and a hidden service road leading to it. There's also the **Dry Lake Airfield** on a flat lakebed, with a runway you can drive down, hangars, a control tower, radar, fuel tanks, jets and a fenced perimeter with a gate. Drive up to one to discover it. It then shows on the map, and your discoveries are saved.
- **Handling:** a four-wheel simulation. Each wheel has its own suspension (spring, damper, bump stop and anti-roll bars), so the body dives under braking, squats under power, rolls in corners and rocks over kerbs, and each tyre's grip comes from its own load. Each wheel spins on its own through an all-wheel-drive drivetrain (30/70 front/rear) with limited-slip differentials, so wheelspin and lock-ups are real. The tyres share their grip between braking or accelerating and cornering. Steering uses Ackermann geometry. The car does 0–100 km/h in about 3.3 seconds, has a top speed of about 340 km/h, and stops from 100 km/h in about 34 m. ABS works wheel by wheel, traction control trims the engine when a wheel spins up, and stability control (ESP) is there too. Each one lights up on the dial when it's acting; turn them off for wheelspin, locked brakes and slides. The gearbox is automatic or manual, and the handbrake starts drifts.
- **Traffic:** saloons, SUVs, hatchbacks and vans drive on the right in their lanes. They stop at red lights, follow each other, slow for turns, wait at junctions and brake for you, and if you hit one it gets knocked aside. Traffic stays around you wherever you go.
- **Events:** fifteen races against the clock through checkpoint gates, with gold, silver and bronze medals and your best times saved. Nine are in the city, from the 4 km Boulevard Dash to the 10 km Grand Tour. Six are open country: Desert Highway, Mountain Pass, Coast Highway, Southern Freeway, Runway Run (down the airfield's runway) and the full 43 km Grand Ring. **Free Roam** has no clock.
- **The map:** a minimap in the corner (it shows the motorways once you leave the city), and a full world map (Tab, M or the MAP button) with the terrain, motorways and any secret places you've found, where you click to set a waypoint. An arrow and a distance point you to it, and it's marked on the minimap.
- **HUD:** a round rev counter and speedometer with the gear in the middle, the ABS/ESP/TCS+ lights and a nitro gauge, a heading-up minimap, a checkpoint arrow and a race timer.
- **Cameras:** wide chase (the default), close chase, **driver view** (from the seat, with a dashboard, live rev and speed gauges, and a steering wheel that turns with yours), hood and bumper. Press C, the ◉ camera button, or ◉ CAM on touch. On a PC, drag the mouse to look around the car and use the wheel to zoom. Hold B to look back.
- **Time of day:** **Golden Hour** (the default: low backlit sun, long shadows, light shafts and a warm film-style grade), a bright **Day**, or **Sunset** with a pink smoke plume (Settings → Time of day).

## Graphics

Built to look sharp on a PC, and still run on a tablet. The game picks a tier for the device (Ultra on a PC with a good graphics card, High on integrated graphics, Medium on a tablet) and you can change it in Settings → Graphics.

| | Ultra | High | Medium | Low |
|---|---|---|---|---|
| Pixels | screen's own density, up to 2× | up to 1.5× | up to 1.5× | 1× |
| Anti-aliasing | 8× multisampling (and on foliage edges) | 4× | 2× | browser default |
| Shadows | 4 cascades of 4096, out to 650 m | 3 cascades of 2048 | one 2048 map | off |
| Car reflections | live, 256 px | live, 256 px | live, 128 px | off |
| Textures | full size | full size | ¾ size | half size |
| Ambient occlusion | yes | yes | no | no |
| Grass around the car | 75 m, dense | 62 m | 46 m, lighter | none |
| Draw distance | about 1.6 km | 1.2 km | 0.9 km | 0.9 km |

- **Sharp:** facade textures are drawn at about 64 pixels per metre, with window frames, sills, mullions and brickwork you can see up close; glass is shiny and metallic and reflects the sky; windows sit back in the wall (relief maps); there's grime at the foot of walls; ground textures don't visibly repeat; a sharpening pass adds crispness; and the render scale setting (75% to 150%) lets you trade speed for a supersampled image.
- **Atmosphere:** distance fades through a haze that thins with height (valleys are misty, peaks are clear), turns cooler and bluer away from the sun, and glows warm and bright when you look towards it, so the world layers up into depth like film footage.
- **Ground detail:** sand, gravel, snow and grass have fine grit and relief that catches the low sun, and snow has a faint sheen. Cliffs are textured from the side. Roads are glossy enough to streak with the sun. Close to the car, a field of grass tufts sways in the wind, dense on grassland and sparse and dry in the desert.
- **Contact shading:** on Ultra and High, screen-space ambient occlusion darkens the creases where tyres meet the road, kerbs, building bases, trunks and rocks meet the ground. A clarity pass adds local contrast, and there's a faint lens fringe towards the corners.
- **Not blocky:** towers are round, chamfered or rounded rather than boxes, with smooth shading round the curves; balconies are thin slabs with real railings; trees have leafy crowns; the street corners are rounded.
- **Lighting:** a physically based sky, real-time reflections on the car, cascaded shadows, bloom, a speed blur and a colour grade for each time of day. The resolution drops a little by itself if the frame rate falls, and rises again.

## Honest notes

- The graphics are procedural: every texture, tree and building is generated in code, with no photo scans or hand-modelled assets, so close up it looks like a good browser game, not a AAA one.
- It was tested here in headless Chrome with software rendering, which is far slower than a real GPU. Frame rates on real Ultra/High hardware, and on an iPad, are not measured. If it stutters, lower Settings → Graphics or Render scale.
- Streaming the world builds geometry as you drive, so a fast drive across a biome border on a slow device can show a brief hitch or pop-in.

## PC extras

Fullscreen (F), a mouse-look camera, the city map, an FPS counter (Settings), render scale, and a steering wheel set-up.

## Controls

| | Keyboard | Gamepad | Touch |
|---|---|---|---|
| Throttle | W / ↑ | RT | GAS |
| Brake / reverse | S / ↓ | LT | BRAKE |
| Steer | A D / ← → | Left stick | ◀ ▶ or tilt |
| Handbrake | Space | A | DRIFT |
| Nitro | Shift / N | X | NOS |
| Shift down / up (manual) | Q / E | LB / RB | |
| Camera | C | Y | ◉ CAM |
| City map | Tab / M | | MAP |
| Fullscreen | F | | |
| Look around | mouse drag | | |
| Back on the road | R | Back | ↺ |
| Pause | Esc / P | Start | ❚❚ |

**Steering wheels** (Logitech, Thrustmaster, Fanatec and others): plug the wheel in and press a pedal so the browser sees it. Then go to Settings → Steering wheel & pedals → Set up and follow the prompts: turn the wheel right, press the throttle, press the brake, then pull the paddles. The set-up is saved in the browser.

## Files

- `index.html`: page, menus and HUD layout
- `src/main.js`: start-up, game loop, cameras, menus and races
- `src/vehicle.js`: car physics
- `src/collide.js`: collisions with the city and traffic
- `src/city.js`: the city: layout, streamed regions, buildings, houses and collision data
- `src/geom.js`: geometry builder and footprint helpers (extrude, round, chamfer, loft)
- `src/props.js`: trees, palms, lamps, poles, signals and other street furniture
- `src/quality.js`: the Ultra / High / Medium / Low tiers
- `src/carModel.js`: lofted car bodies for the hero car and traffic
- `src/traffic.js`: traffic drivers
- `src/sky.js`: sky, light, mountains, clouds and the plume
- `src/atmos.js`: the height-aware, sun-aware haze (it replaces three.js's fog shader)
- `src/ao.js`: screen-space ambient occlusion from the depth buffer
- `src/grass.js`: the streamed field of grass tufts around the car
- `src/world.js`: the world: height, biomes, the motorway network and road profiles, ground and surface queries, bunkers and the airfield
- `src/terrain.js`: the streamed terrain (a coarse whole-world mesh plus fine tiles), biome and cliff shading, and the sea
- `src/roads.js`: motorway, bridge, runway and service-road ribbons, median barriers and guardrails
- `src/scatter.js`: pines, cacti, rocks, scrub, trees and palms placed on each terrain tile
- `src/structures.js`: the bunkers, airfield, gas station, ski lodge and wind farm
- `src/tod.js`: the Golden Hour, Day and Sunset looks
- `src/textures.js`: every texture, drawn on canvases
- `src/hud.js`, `src/input.js`, `src/audio.js`, `src/fx.js`, `src/events.js`, `src/store.js`, `src/util.js`
