# Sunset City

An open-world street racer at golden hour, made with Three.js. Drive a V12 supercar through a city of boulevards, palms, neon shop signs and glass towers, with a pink smoke plume rising over the mountains behind. It's a sister game to [MushtaqTrack](https://github.com/rauf-mushtaq/mushtaqtrack) and reuses what that game learned about car handling, iPad performance, and touch, gamepad and steering-wheel controls.

## Play

The game loads its modules from files, so it has to be served over HTTP, not opened as a file:

- **GitHub Pages:** in this repository go to Settings → Pages → Deploy from a branch → `main`, folder `/`. The game is then at `https://rauf-mushtaq.github.io/Racing/`.
- **On your computer:** run `python3 -m http.server` in this folder and open `http://localhost:8000`.

There's nothing to build or install. Three.js comes from a CDN, and every model, texture and sound is generated when the game starts.

## What's in it

- **The car:** the Vento SV, a made-up wedge-shaped, mid-engined V12 supercar (no real brands) with a big rear wing, arrowhead tail lights that brighten when you brake, and a centre exhaust that shoots a blue nitro flame. It has nine paint colours in the Garage.
- **Handling:** a two-axle tyre model with load transfer, a friction circle, all-wheel drive and a six-speed gearbox. It does 0–100 km/h in about 3.2 seconds and has a top speed of about 335 km/h. ABS, traction control (TCS+) and stability control (ESP) work like the real systems, and each one lights up on the dial when it's acting. Turn them off for wheelspin, locked brakes and slides. The gearbox is automatic or manual, and the handbrake starts drifts.
- **The city:** a 1.5 km grid with six-lane boulevards (palm-planted medians and overhead signs) and four-lane streets with crossings and lane markings. Downtown has glass towers, around that are apartments, and along the boulevards are low shops with lit signs. There are parks, car parks and billboards. Lit windows, street lamps and signs glow through the bloom.
- **Traffic:** saloons, SUVs, hatchbacks and vans drive on the right in their lanes. They follow each other, slow for turns, wait at junctions and brake for you, and if you hit one it gets knocked aside.
- **Events:** six races against the clock through checkpoint gates (Boulevard Dash, Downtown Dash, Palm Zigzag, Crosstown, Ring Road and Grand Tour), with gold, silver and bronze medals and your best times saved. **Free Roam** has no clock.
- **HUD:** a round rev counter and speedometer with the gear in the middle, the ABS/ESP/TCS+ lights and a nitro gauge. There's also a heading-up minimap, a checkpoint arrow and a race timer.
- **Cameras:** chase, far chase, hood and bumper. Hold B to look back.
- **Graphics:** a physically based sky, image-based reflections on the paint and glass, soft shadows, bloom, a speed blur and a warm colour grade. High, Medium and Low settings are available, and the resolution adjusts itself to keep the frame rate up on tablets.

## Controls

| | Keyboard | Gamepad | Touch |
|---|---|---|---|
| Throttle | W / ↑ | RT | GAS |
| Brake / reverse | S / ↓ | LT | BRAKE |
| Steer | A D / ← → | Left stick | ◀ ▶ or tilt |
| Handbrake | Space | A | DRIFT |
| Nitro | Shift / N | X | NOS |
| Shift down / up (manual) | Q / E | LB / RB | |
| Camera | C | Y | ◉ |
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
- `src/textures.js`: every texture, drawn on canvases
- `src/hud.js`, `src/input.js`, `src/audio.js`, `src/fx.js`, `src/events.js`, `src/store.js`, `src/util.js`
