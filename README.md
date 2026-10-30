# Sunset City

An open-world street racer made with Three.js. Drive a V12 supercar through a California-style city of boulevards, palms, shops, apartments and glass towers, with hills, houses and the ocean around it. Play it on a bright, hazy afternoon (the default) or at golden hour with a pink smoke plume rising over the mountains (Settings → Time of day). It's a sister game to [MushtaqTrack](https://github.com/rauf-mushtaq/mushtaqtrack) and reuses what that game learned about car handling, iPad performance, and touch, gamepad and steering-wheel controls.

## Play

The game loads its modules from files, so it has to be served over HTTP, not opened as a file:

- **GitHub Pages:** in this repository go to Settings → Pages → Deploy from a branch → `main`, folder `/`. The game is then at `https://rauf-mushtaq.github.io/Racing/`.
- **On your computer:** run `python3 -m http.server` in this folder and open `http://localhost:8000`.

There's nothing to build or install. Three.js comes from a CDN, and every model, texture and sound is generated when the game starts.

## What's in it

- **The car:** the Vento SV, a made-up wedge-shaped, mid-engined V12 supercar (no real brands) with a big rear wing, arrowhead tail lights that brighten when you brake, and a centre exhaust that shoots a blue nitro flame. It has nine paint colours in the Garage.
- **Handling:** a four-wheel simulation. Each wheel has its own suspension (spring, damper, bump stop and anti-roll bars), so the body dives under braking, squats under power, rolls in corners and rocks over kerbs, and each tyre's grip comes from its own load. Each wheel spins on its own through an all-wheel-drive drivetrain (30/70 front/rear) with limited-slip differentials, so wheelspin and lock-ups are real. The tyres share their grip between braking or accelerating and cornering. Steering uses Ackermann geometry. The car does 0–100 km/h in about 3.3 seconds, has a top speed of about 340 km/h, and stops from 100 km/h in about 34 m. ABS works wheel by wheel, traction control trims the engine when a wheel spins up, and stability control (ESP) is there too. Each one lights up on the dial when it's acting; turn them off for wheelspin, locked brakes and slides. The gearbox is automatic or manual, and the handbrake starts drifts.
- **The city:** a 1.5 km grid with six-lane boulevards (palm-planted medians and overhead signs) and four-lane streets with crossings, lane markings and double yellow lines. Downtown has glass towers, around that are apartments with balconies behind hedges, and along the boulevards are low shops with signs. There are traffic lights at every junction, wooden power poles with sagging wires, leafy street trees, parks, car parks and billboards. Hydrants, bins and benches line the pavements. At sunset, lit windows, street lamps and signs glow through the bloom.
- **Around the city:** hills to the north and east covered in scrub, trees and white houses with tiled roofs, the ocean and a beach to the west, mountains in the haze, and fair-weather clouds.
- **Traffic:** saloons, SUVs, hatchbacks and vans drive on the right in their lanes. They stop at red lights, follow each other, slow for turns, wait at junctions and brake for you, and if you hit one it gets knocked aside.
- **Events:** six races against the clock through checkpoint gates (Boulevard Dash, Downtown Dash, Palm Zigzag, Crosstown, Ring Road and Grand Tour), with gold, silver and bronze medals and your best times saved. **Free Roam** has no clock.
- **HUD:** a round rev counter and speedometer with the gear in the middle, the ABS/ESP/TCS+ lights and a nitro gauge. There's also a heading-up minimap, a checkpoint arrow and a race timer.
- **Cameras:** wide chase (the default, high and further back), close chase, **driver view** (from the seat, with a dashboard, live rev and speed gauges, and a steering wheel that turns with yours), hood and bumper. Press C, the ◉ camera button at the top left, or ◉ CAM on touch. Hold B to look back.
- **Graphics:** a physically based sky; real-time reflections on the car (it reflects the street, buildings and traffic around it); cascaded shadows on High, so buildings shade the streets as far as you can see; facades with recessed windows in five styles (glass towers, modern banded offices, stucco apartments, brick walk-ups and shops); ground textures that don't visibly repeat; soft shadows under traffic; a sun glare by day; bloom, a speed blur and a colour grade for each time of day. High, Medium and Low settings are available, and the resolution adjusts itself to keep the frame rate up on tablets.

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
| Back on the road | R | Back | ↺ |
| Pause | Esc / P | Start | ❚❚ |

**Steering wheels** (Logitech, Thrustmaster, Fanatec and others): plug the wheel in and press a pedal so the browser sees it. Then go to Settings → Steering wheel & pedals → Set up and follow the prompts: turn the wheel right, press the throttle, press the brake, then pull the paddles. The set-up is saved in the browser.

## Files

- `index.html`: page, menus and HUD layout
- `src/main.js`: start-up, game loop, cameras, menus and races
- `src/vehicle.js`: car physics
- `src/collide.js`: collisions with the city and traffic
- `src/city.js`: city layout, meshes and collision data
- `src/carModel.js`: lofted car bodies for the hero car and traffic
- `src/traffic.js`: traffic drivers
- `src/sky.js`: sky, light, mountains, clouds and the plume
- `src/terrain.js`: hills, houses, trees, beach and ocean around the city
- `src/tod.js`: the Day and Sunset looks
- `src/textures.js`: every texture, drawn on canvases
- `src/hud.js`, `src/input.js`, `src/audio.js`, `src/fx.js`, `src/events.js`, `src/store.js`, `src/util.js`
