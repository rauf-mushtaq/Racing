# Sunset City

An open-world street racer made with Three.js. Drive a V12 supercar through a California-style city of boulevards, palms, shops, apartments and glass towers, with hills, houses and the ocean around it. Play it on a bright, hazy afternoon (the default) or at golden hour with a pink smoke plume rising over the mountains (Settings → Time of day). It's a sister game to [MushtaqTrack](https://github.com/rauf-mushtaq/mushtaqtrack) and reuses what that game learned about car handling, iPad performance, and touch, gamepad and steering-wheel controls.

## Play

The game loads its modules from files, so it has to be served over HTTP, not opened as a file:

- **GitHub Pages:** in this repository go to Settings → Pages → Deploy from a branch → `main`, folder `/`. The game is then at `https://rauf-mushtaq.github.io/Racing/`.
- **On your computer:** run `python3 -m http.server` in this folder and open `http://localhost:8000`.

There's nothing to build or install. Three.js comes from a CDN, and every model, texture and sound is generated when the game starts.

## What's in it

- **The car:** the Vento SV, a made-up wedge-shaped, mid-engined V12 supercar (no real brands) with a big rear wing, arrowhead tail lights that brighten when you brake, and a centre exhaust that shoots a blue nitro flame. It has nine paint colours in the Garage.
- **A big city:** 25 × 25 roads, about 4.4 km across (nine times the area of the first version), streamed in around you as you drive so it never stops to load. Every fourth road is a six-lane boulevard with a palm-planted median and overhead signs. From the middle outwards: **downtown** towers (round, chamfered and rounded-corner towers with stepped tiers, stone plinths, tapered crowns and masts), **mid-rise** blocks of glass, offices, brick walk-ups and shops, **low-rise** neighbourhoods, and **suburbs** of detached houses with tiled hip roofs, lawns, driveways and hedges. There are parks with paths, car parks, billboards, traffic lights at every junction, power poles with wires, and hydrants, bins and benches along the kerbs. Street corners have rounded kerbs.
- **Around the city:** hills to the north and east covered in scrub, trees and white houses, the ocean and a beach to the west (with moving ripples), mountains in the haze, and fair-weather clouds.
- **Handling:** a four-wheel simulation. Each wheel has its own suspension (spring, damper, bump stop and anti-roll bars), so the body dives under braking, squats under power, rolls in corners and rocks over kerbs, and each tyre's grip comes from its own load. Each wheel spins on its own through an all-wheel-drive drivetrain (30/70 front/rear) with limited-slip differentials, so wheelspin and lock-ups are real. The tyres share their grip between braking or accelerating and cornering. Steering uses Ackermann geometry. The car does 0–100 km/h in about 3.3 seconds, has a top speed of about 340 km/h, and stops from 100 km/h in about 34 m. ABS works wheel by wheel, traction control trims the engine when a wheel spins up, and stability control (ESP) is there too. Each one lights up on the dial when it's acting; turn them off for wheelspin, locked brakes and slides. The gearbox is automatic or manual, and the handbrake starts drifts.
- **Traffic:** saloons, SUVs, hatchbacks and vans drive on the right in their lanes. They stop at red lights, follow each other, slow for turns, wait at junctions and brake for you, and if you hit one it gets knocked aside. Traffic stays around you wherever you go.
- **Events:** nine races against the clock through checkpoint gates, from the 4 km Boulevard Dash to the 10 km Grand Tour, with gold, silver and bronze medals and your best times saved. **Free Roam** has no clock.
- **The map:** a minimap in the corner, and a full-city map (Tab, M or the MAP button) where you click to set a waypoint. An arrow and a distance point you to it, and it's marked on the minimap.
- **HUD:** a round rev counter and speedometer with the gear in the middle, the ABS/ESP/TCS+ lights and a nitro gauge, a heading-up minimap, a checkpoint arrow and a race timer.
- **Cameras:** wide chase (the default), close chase, **driver view** (from the seat, with a dashboard, live rev and speed gauges, and a steering wheel that turns with yours), hood and bumper. Press C, the ◉ camera button, or ◉ CAM on touch. On a PC, drag the mouse to look around the car and use the wheel to zoom. Hold B to look back.
- **Day or sunset:** a bright, hazy afternoon (the default) or golden hour with a pink smoke plume rising over the mountains (Settings → Time of day).

## Graphics

Built to look sharp on a PC, and still run on a tablet. The game picks a tier for the device (Ultra on a PC with a good graphics card, High on integrated graphics, Medium on a tablet) and you can change it in Settings → Graphics.

| | Ultra | High | Medium | Low |
|---|---|---|---|---|
| Pixels | screen's own density, up to 2× | up to 1.5× | up to 1.25× | 1× |
| Anti-aliasing | 8× multisampling (and on foliage edges) | 4× | 2× | browser default |
| Shadows | 4 cascades of 4096, out to 650 m | 3 cascades of 2048 | one 2048 map | off |
| Car reflections | live, 256 px | live, 256 px | live, 128 px | off |
| Textures | 4× sharper facades | same | half size | half size |
| Draw distance | about 1.6 km | 1.2 km | 0.9 km | 0.9 km |

- **Sharp:** facade textures are drawn at about 64 pixels per metre, with window frames, sills, mullions and brickwork you can see up close; glass is shiny and metallic and reflects the sky; windows sit back in the wall (relief maps); there's grime at the foot of walls; ground textures don't visibly repeat; a sharpening pass adds crispness; and the render scale setting (75% to 150%) lets you trade speed for a supersampled image.
- **Not blocky:** towers are round, chamfered or rounded rather than boxes, with smooth shading round the curves; balconies are thin slabs with real railings; trees have leafy crowns; the street corners are rounded.
- **Lighting:** a physically based sky, real-time reflections on the car, cascaded shadows, bloom, a speed blur and a colour grade for each time of day. The resolution drops a little by itself if the frame rate falls, and rises again.

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
- `src/terrain.js`: hills, houses, trees, beach and ocean around the city
- `src/tod.js`: the Day and Sunset looks
- `src/textures.js`: every texture, drawn on canvases
- `src/hud.js`, `src/input.js`, `src/audio.js`, `src/fx.js`, `src/events.js`, `src/store.js`, `src/util.js`
