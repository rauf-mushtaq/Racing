# Sunset City — native (C++ and HLSL, Direct3D 12)

The same world as the web game, as a native Windows program: C++17, Direct3D 12 and HLSL shaders
(compiled when the game starts, shader model 5.0, so any Direct3D 12 graphics card runs them).

**What is in it now**

- The whole 12 × 16 km world: coast, snowy mountains, desert, canyon, grassland, the 43 km ring motorway and its spokes.
- A procedural city on the 25 × 25 road grid: glass towers with spandrel panels and mullions, punched-window offices with
  pilasters, sills and cornices, shopfronts with awnings and sign bands, houses, roof equipment, neon blade signs, palms and
  street trees, street lamps, parked cars along the kerbs (all solid), pedestrians on the pavements.
- Wet streets: crosswalks, stop lines, worn lanes, kerbs and paving, puddles, and a real **planar reflection** of the city
  (buildings, traffic, your car, the sky and the sun) in the road.
- Traffic with signals (ported from the web game), motorway traffic, cars that get knocked about.
- **Races**: fifteen routes with checkpoint gates, timer, medals and saved best times.
- **Escape mode**: you drive a silver 1960s-style grand tourer with gadgets and the police chase you (see below).
- Live reflections: a cube of the surroundings (city, traffic, sky) is drawn from your car, one face every other frame, and the car's paint, its glass and the building windows reflect it. F7 turns reflections off (this and the wet-road mirror) if you need the frames.
- Surfaces: brick courses with mortar, recessed windows with frames, curtains, blinds and lit rooms, weathering streaks, speckled and cracked asphalt with worn paint, palms with real leaflets, leafy trees with ragged edges, and reflections that see the street and its buildings instead of an empty sky.
- Rendering: cascaded shadows, ambient occlusion, 4× MSAA HDR, bloom, depth of field, camera motion blur, haze,
  golden-hour sky and clouds, particles (smoke, fire, sparks, tracers).

Not ported from the web game: the bunkers and airfield buildings, grass tufts, the map screen, sound.

## Play

Run `sunset.exe` (keep the `shaders` folder next to it), or `play_fullscreen.bat`. If you have no compiler installed, use the
zip in [`prebuilt/`](prebuilt/), or the `SunsetCityNative-win64` artifact of the *native-windows* GitHub Action.
The menu opens when the game starts: pick **Escape the police**, **Races** or **Free roam**.

| | Keyboard | Gamepad (Xbox) |
|---|---|---|
| Throttle / brake, reverse | W S or ↑ ↓ | RT / LT |
| Steer | A D or ← → | left stick |
| Handbrake | Space | A |
| Nitro | Shift or N | X |
| Camera (wide chase, close chase, driver, hood) | C | Y |
| Look round (hold) | right mouse button | right stick |
| Gear down / up (free roam and races) | Q / E | LB / RB |
| Back on the road / restart | R | Back |
| Menu | Esc or Tab | Start |
| Fullscreen | F11 | |
| Stats overlay (fps, GPU time, draw calls) | F3 | |
| Vsync on/off, ambient occlusion, shadows, reflections | F4, F5, F6, F7 | |

**Escape mode gadgets** (the silver GT only): **F** or left mouse = machine guns (hold; they overheat), **G** = homing
missile, **B** = bomb dropped behind you (explodes when a car drives close), **O** = oil slick, **X** = smoke screen
(blocks the police's view), **V** = armour plate. On a pad: RB guns, B missile, LB bomb, D-pad up oil, down smoke, left armour.
The police see you or they don't: break line of sight and stay hidden to lose them. More heat brings more cars and heavy
pursuit trucks. You lose if you are wrecked or boxed in.

If something goes wrong the game writes `sunset_native.log` next to where you started it (including where it crashed), and
shows the failing Direct3D call in a message box. Best race times are saved in `sunset_native_saves.txt`.

**For a 1440p high-refresh display:** the game presents uncapped with tearing allowed when the display supports it (press F4
for vsync). Press F3 to see the real frame time and GPU time. If it is not fast enough, F5/F6/F7 turn ambient occlusion,
shadows and reflections off, and `--msaa 2` or `--msaa 1` lowers anti-aliasing.

## Build it

You need Windows 10 or 11, a Direct3D 12 graphics card, **Visual Studio 2022** (the "Desktop development with C++"
workload) and CMake (it comes with Visual Studio).

```
cmake -S native -B native/build -G "Visual Studio 17 2022" -A x64
cmake --build native/build --config Release
native\build\Release\sunset.exe
```

On Linux the same source cross-compiles with MinGW-w64 (`cmake -DCMAKE_TOOLCHAIN_FILE=native/cmake/mingw-w64.cmake`),
and runs under Wine (with vkd3d) for tests.

## Options (for testing)

```
sunset.exe --size 1920x1080 --msaa 4 --noao --noshadow
sunset.exe --spawn coast|desert|alpine|south|city|runway   where to start (default coast)
sunset.exe --escape | --race N | --model super|gt           start straight in a mode, or choose the car
sunset.exe --fullscreen --vsync                             borderless fullscreen; wait for the display
sunset.exe --shot out.bmp --drive 5 --cam chase|close|driver|hood|free      save a picture and exit
sunset.exe --simulate 60 --escape                           run the game logic only, log what the police do
sunset.exe --check-shaders                                  compile every shader and list errors
```

## How it is put together

| | |
|---|---|
| `src/gfx.*` | Direct3D 12: device, swap chain, descriptor heaps, buffers and textures, a constant ring, deferred release, runtime HLSL compile |
| `src/renderer.*` | the frame: 4 shadow cascades, the 4× MSAA HDR scene, resolve, ambient occlusion, bloom, composite (grade, sharpen, tone map) |
| `src/terrain.*` | streamed terrain in three levels of detail, built on worker threads |
| `src/scenery.*`, `props.*` | roads, barriers, bridges, and the plants and rocks, per 256 m tile |
| `src/world.*` | the world: height, climate, motorway network, ground queries (a port of `src/world.js`, same numbers) |
| `src/vehicle.*`, `collide.*` | car physics and collisions (a port of `vehicle.js`, same numbers) |
| `src/city.*` | the buildings and boulevard palms, as instanced boxes whose facades are drawn in the shader |
| `src/car.*`, `bond.*`, `shapes.*`, `vehicles.*` | the supercar, the gadget grand tourer, the modelling toolkit (design-curve body lofts, wire wheels), traffic and police vehicles |
| `src/traffic.*`, `peds.*`, `fx.*` | traffic and parked cars, pedestrians, particles |
| `src/events.*`, `escape.*` | the races, and the police chase with its weapons |
| `src/game.*`, `hud.*`, `main.cpp` | the game state, menu and input, HUD, and the entry point |
| `shaders/*.hlsl` | sky, terrain, water, meshes, shadows, post-processing, HUD |

The world and the vehicle physics were checked against the JavaScript versions: heights, climate, road
profiles, 0–100 km/h in 3.24 s, 342 km/h top speed and a 35.9 m stop from 100 km/h all match.

## Honest notes

- It was developed without a Windows machine or a real graphics card: it is built with MinGW and rendered
  headless with Wine, vkd3d and a software Vulkan driver. Frame rates and any driver-specific problems on real
  hardware are untested. Please send the log and a screenshot if something looks wrong.
- Visual Studio's build was not run here either (the code compiles with GCC and Clang for Windows, and the
  *native-windows* GitHub Action builds it with MSVC).
