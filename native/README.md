# Sunset City — native (C++ and HLSL, Direct3D 12)

The same world as the web game, as a native Windows program: C++17, Direct3D 12 and HLSL shaders
(compiled when the game starts, shader model 5.0, so any Direct3D 12 graphics card runs them).

**Status: a vertical slice.** It has the whole 12 × 16 km world with its coast, snowy mountains, desert,
canyon and grassland; the 43 km ring motorway and spokes (lane markings, median barriers, guardrails,
bridges); pines, palms, cacti and rocks; the car with the same four-wheel physics as the web game;
cascaded shadows, ambient occlusion, bloom, haze and a golden-hour sky; and a gauge HUD.
Not ported yet: the city's buildings (its square is a paved grid for now), traffic, the races, the
bunkers and airfield buildings, the map screen, menus and sound.

## Play

Run `sunset.exe` (keep the `shaders` folder next to it). If you have no compiler installed, use the zip in
[`prebuilt/`](prebuilt/), or the `SunsetCityNative-win64` artifact of the *native-windows* GitHub Action.

| | Keyboard | Gamepad (Xbox) |
|---|---|---|
| Throttle / brake, reverse | W S or ↑ ↓ | RT / LT |
| Steer | A D or ← → | left stick |
| Handbrake | Space | A |
| Nitro | Shift or N | X |
| Camera (wide chase, close chase, driver, hood) | C | Y |
| Look round (hold) | right mouse button | right stick |
| Gear down / up | Q / E | LB / RB |
| Back on the road | R | Back |
| Fullscreen | F11 | |
| Quit | Esc | |

If something goes wrong the game writes `sunset_native.log` next to where you started it, and shows the
failing Direct3D call in a message box.

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
sunset.exe --shot out.bmp --drive 5 --cam chase|close|driver|hood|free      save a picture and exit
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
| `src/car.*`, `game.*`, `hud.*`, `main.cpp` | the car model, game loop and input, HUD, and the entry point |
| `shaders/*.hlsl` | sky, terrain, water, meshes, shadows, post-processing, HUD |

The world and the vehicle physics were checked against the JavaScript versions: heights, climate, road
profiles, 0–100 km/h in 3.24 s, 342 km/h top speed and a 35.9 m stop from 100 km/h all match.

## Honest notes

- It was developed without a Windows machine or a real graphics card: it is built with MinGW and rendered
  headless with Wine, vkd3d and a software Vulkan driver. Frame rates and any driver-specific problems on real
  hardware are untested. Please send the log and a screenshot if something looks wrong.
- Visual Studio's build was not run here either (the code compiles with GCC and Clang for Windows, and the
  *native-windows* GitHub Action builds it with MSVC).
