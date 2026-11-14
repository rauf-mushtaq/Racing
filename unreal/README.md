# Sunset City, Unreal Engine 5 version (the "file version")

An Unreal Engine 5 project of the same game: the city, its people, its cars and its police, with **Lumen** (global illumination and reflections, hardware ray tracing on a card that has it), **virtual shadow maps**, a **physically based sky** with volumetric clouds and fog, and physically based materials (clear-coated paint, refractive glass, single-layer water, subsurface skin, windows that light up at night). Nothing is placed in the editor: the city is **made by the game as you move** from a seed, block by block.

> **Read this first: it has not been compiled or run.** There is no Unreal Engine where this was written. What *was* done here: the whole engine-independent core (the city plan, every mesh, the car, the people's poses, the fighters' brains, the police) is plain C++ that compiles with g++ and clang++ and has **105 automatic checks** (`Tests/run_core_tests.sh`), and its geometry was drawn and looked at (buildings, props, cars, people, a shop's inside). The Unreal-facing code (`Source/SunsetCity/SC*.cpp`) was checked against a *stand-in* for Unreal's API (`Tests/glue_check/`), which finds typos, wrong argument counts and type mistakes in our own code but cannot know whether Unreal's real headers say the same, so **expect a few compile errors on the first build and some things that do not behave on the first run** (physics tuning, camera, materials). Copy the errors (Visual Studio's Error List, or the editor's Output Log) back and they get fixed. Nothing here has been seen on a real GPU.

## The easy way: one double-click (Windows)

1. On the PC, open the game's site (`https://rauf-mushtaq.github.io/Racing/`), tap **UNREAL ENGINE** at the bottom of the menu and press **Download SunsetCity.bat** (it is `unreal/SunsetCity.bat` here). Double-click the file. If Windows says *"Windows protected your PC"*, click **More info**, then **Run anyway**.
2. **The first time** it does whatever is missing, in order, and says what it is doing in its window:
   - **Visual Studio Build Tools 2022** (Microsoft's free C++ compiler, about 6 GB) if there is no Visual Studio 2022 with C++: it installs by itself after you press **Yes** when Windows asks.
   - **Unreal Engine** if there is none (5.4 or later; 5.5 is what the game was written for): Epic only gives it out through the **Epic Games Launcher** and an Epic account, so the script installs the launcher (one more **Yes**), opens it, says what to click (sign in, Unreal Engine > Library > + > 5.5 > Install) and waits; it carries on by itself when Unreal is installed.
   - It then downloads the game's files, **builds the code**, opens the editor with no window to **set up the map, materials and models** (`Content/Python/sc_oneclick_setup.py`, which runs `sc_setup.py`), **packages `SunsetCity.exe`**, puts **"Sunset City"** and **"Sunset City on iPad"** icons on the desktop and in the Start menu, and starts the game. Expect an hour or two of a busy PC the first time (mostly shaders), and about 30 GB of space for the game besides Unreal's own 50 or so. The PC is kept awake while it works.
3. **After that, one click:** the "Sunset City" icon starts the game straight away. Each time, it first asks GitHub whether the game has changed; if it has, it downloads only what changed and redoes only the steps that need it (new code: build and package; new set-up scripts or models: set up and package).
4. **If a step fails** (expect the first build to: see the top of this page), the window says so, and everything needed to fix it (the error lines, the end of the log, the PC's Windows, graphics card, Visual Studio and Unreal versions) goes into **`Sunset City - send this to Claude.txt` on the desktop**, which opens, and is copied as well: paste it into the chat. When the fix is in, double-click again: it fetches it and carries on from the step that failed. Meanwhile, if an older version was ever built, that one starts.

**"Sunset City on iPad"** does the same and then streams instead (see Pixel Streaming below): it fetches Unreal's streaming web server the first time and shows, first, the address to type on the iPad.

Everything goes in `C:\SunsetCity` (the game in `game`, an untouched copy of the downloaded files in `source`, logs in `logs`, what has been done in `state.json`). `SunsetCity.bat -Rebuild` does every step again. The work is done by `tools/SunsetCity.ps1`, which `SunsetCity.bat` downloads fresh each time, so fixes to the script arrive by themselves too.

**How this was tested:** on a real Windows machine (GitHub's, by `Tests/oneclick/test_oneclick.ps1`, in the `windows-oneclick` workflow), with a **stand-in engine**: Unreal cannot be installed there, so its `Build.bat`, `RunUAT.bat` and editor are small programs that note how they were called and act out success or failure. Everything else is the real thing: `cmd.exe` running the `.bat` files, Windows PowerShell 5.1 running the script, the Visual Studio check, the download of the game from GitHub, the desktop icons, `Play_Streaming.bat` and `Package_Windows.bat`. About 60 checks: the first run does every step in order with the right command lines and starts the game; the second does nothing but start it (in about a second); a change to the code rebuilds without setting up again, and the other way round; a failed build, set-up or packaging leaves a report with the error lines and starts the last version that worked; a fix then carries on; an editor that ignores `-ExecutePythonScript` gets the commandlet way instead; an editor that has finished but stays open is closed ten minutes later, and a step that prints nothing for an hour is stopped as stuck and reported (the waits are cut to seconds in the test); no Unreal gives a report; the iPad icon starts the signalling server and the game with the streaming flags and shows the right address; a newer `SunsetCity.bat` replaces the old one. The Visual Studio and Epic installer downloads are checked to answer, and the workflow can be started by hand to install Visual Studio Build Tools for real with the script's own options (`Tests/oneclick/test_install_vs.ps1`): on 14 November 2026 that installed Build Tools 2022 with the 14.38 compiler Unreal 5.5 prefers and a Windows SDK, in 4 minutes on GitHub's machine, and the script's own check found it. **What is not tested:** the real Unreal Engine steps (whether the code compiles, the editor runs the set-up, the cook works), installing the Epic Games Launcher, and anything on your PC.

## By hand

The steps the script does, if you would rather do them yourself (or the script cannot).

### What you need

- Windows 10/11, **Unreal Engine 5.5** (5.4 to 5.6 should do: Launcher, or `Epic Games` > Unreal Engine > Library), **Visual Studio 2022** with the "Game development with C++" workload (with a Windows 10/11 SDK).
- A DirectX 12 card (Shader Model 6). For Lumen to see the procedural geometry you want **hardware ray tracing** (RTX 20-series or newer; the settings are already on in `Config/DefaultEngine.ini`). 16 GB of RAM or more.

### Build and run

1. Put the `unreal/SunsetCity` folder somewhere on the PC (or clone the repository). Right-click `SunsetCity.uproject` > **Generate Visual Studio project files**.
2. Open `SunsetCity.sln`, set the configuration to **Development Editor** and the platform to **Win64**, build `SunsetCity` (Build > Build Solution). Fix any compile errors (see the note above).
3. Double-click `SunsetCity.uproject` (the editor opens; the first time it compiles shaders for a while).
4. In the editor, open the **Output Log** (Window > Output Log), and in its command line type
   `py "C:/path/to/SunsetCity/Content/Python/sc_setup.py"`
   This makes the empty map `Main` (the game builds everything itself, the map needs nothing in it), **builds the materials** (`sc_build_materials.py`) and **imports the models** from `../../assets` (`sc_import_assets.py`). If a step fails it says so and carries on. You can run each script on its own too.
5. Press **Play** (Alt+P), click in the viewport so it has the mouse and keyboard. To make a standalone `.exe`: Platforms > Windows > Package Project.

### A game file (SunsetCity.exe)

After steps 1 to 4 once (so the materials and the map exist), run **`Package_Windows.bat`** (double-click it; Unreal and Visual Studio must be installed; if Unreal is not in `C:\Program Files\Epic Games\UE_5.5`, set `UE_ROOT` first). It cooks and packages the game into `unreal\Packaged\Windows\SunsetCity.exe`: a file you can copy to another Windows PC with a graphics card and run.

Without step 4's material script the game still runs, drawn in flat vertex colours with no lighting detail (the engine's own vertex-colour material is the fallback).

## Play it in a browser or on an iPad: Pixel Streaming (the "web version" that uses Unreal)

Unreal Engine cannot run inside a web page, and it cannot run on an iPad itself (its web export was removed in Unreal 5, and an iPad's graphics chip could not run this anyway). What does work is **Pixel Streaming**, Unreal's own way of putting a game in a browser: the game runs on **your PC** (the RTX card draws it, with Lumen and ray tracing), the picture is sent to the browser as video over the network, and the browser sends your touches, keys and mouse back. The iPad is only the screen and the controller.

The **"Sunset City on iPad"** icon (from the one-click file above) does steps 1 and 2. By hand:

1. On the PC, once: build and set up the project (steps 1 to 4 above) and run **`Package_Windows.bat`**. If Unreal's Pixel Streaming web server is not installed (Unreal 5.4 and later do not ship it), run `Engine\Plugins\Media\PixelStreaming\Resources\WebServers\get_ps_servers.bat` from your Unreal folder once.
2. Each time: run **`Play_Streaming.bat`**. It starts the game (with no window of its own, 1920 x 1080) and Unreal's signalling web server, shows the address to type, such as `http://192.168.1.20` (first the one on the network the PC really uses, the one with a router, then every other address it has: virtual networks such as WSL's or VirtualBox's have addresses too) and then waits. Leave its window open while you play; when you have finished, press a key in it and it closes the game and the server again. The first time, Windows asks whether to let them through its firewall: say yes for private networks, or the iPad cannot reach the PC.
3. On the iPad (or a phone, or another PC) on the **same Wi-Fi**, open that address in Safari or Chrome, or open **`unreal.html`** of the web version (it is the "UNREAL ENGINE" item at the bottom of the web version's menu) and type the address into it. Tap the picture.
4. Play. On a touch screen the game draws its own controls (below); a keyboard and mouse or trackpad on the iPad work as on the PC.

Away from home: the iPad has to reach the PC, which a free private network such as Tailscale does without opening anything to the internet. The web version's page is served over https, so it can open your PC's address but cannot show it inside itself.

**Not run here, so treat it as untested:** the plugin name, the command-line flags and the signalling server's script names differ between Unreal versions (`PixelStreaming` in 5.5; 5.6 and later call the newer plugin `PixelStreaming2`, enable that one instead and its flags are `-PixelStreamingConnectionURL=`); `Play_Streaming.bat` passes all three spellings and looks for the usual script names, and says what to do when it cannot find them. Both `.bat` files have now been run on a real Windows machine with the stand-in engine described above (they start the right things with the right flags and show the right address); Unreal's real signalling server and a real stream have not been tried. Video quality depends on the Wi-Fi (5 GHz and a wired PC are best; expect a few tens of milliseconds of delay).

### Touch controls (when a finger touches the picture)

| | |
|---|---|
| **left side** of the screen | a stick: walk (push it far to run); in a car, left and right steer |
| **drag anywhere else** | look round (in a car, look round the car) |
| **PUNCH** (fire when the pistol is out) | in a car: **GAS** |
| **JUMP** | in a car: **HAND BRAKE** |
| **USE** | get in or out of a car, take a wallet, rob a till |
| **KICK** | in a car: **BRAKE** and reverse |
| **PISTOL** | draw or put away the pistol (in a car: **FLIP** the car back onto its wheels) |

## Controls

| | |
|---|---|
| **W A S D**, mouse | walk, look. **Shift** run, **Space** jump |
| **left mouse** | punch (a jab, then a cross); with the pistol out it shoots. **F** kick (it knocks a man down) |
| **Q** | draw or put away your pistol (aim with the mouse; the camera moves over your shoulder) |
| **E** | get in a car, get out, take a fallen man's wallet, rob a till (pistol out, standing at the counter, when somebody is there to hand it over) |
| in a car | **W S** accelerator/brake/reverse, **A D** steer, **Space** handbrake, **R** back on your wheels, **E** get out, mouse look round |

Hit someone and he reacts: an ordinary person runs; **about 1 in 11 people is armed** (draws a pistol and shoots at you, ducks and reloads); **about 1 in 16 is a big muscular man** who charges and fights with his fists (jab, cross, a slow haymaker that knocks you down); now and then a hired heavy has a gun *and* muscle. Hurt people, shoot, rob a till or hit a car and you get stars; **police on foot and in cars** come (one to five stars; hidden for long enough, the heat falls), and an officer who gets a hand on you for a few seconds **arrests** you (you lose a sixth of your money and start again at the plaza). Being knocked out costs a fifth.

## What is in it (where to look)

`Source/SunsetCity/Core/` is **plain C++17 with no Unreal in it** (units are Unreal's: centimetres, X forward, Y right, Z up; triangles wind the way Unreal wants), tested by `Tests/core_tests.cpp`:

| file | what it is |
|---|---|
| `SCMath.h`, `SCMesh.h` | vectors, colours (sRGB hex turned into linear), a repeatable random generator and noise; a mesh builder (boxes, cones, spheres, prisms, limbs between two points) whose faces are checked to point outwards; every quad carries its material in the alpha of its colour |
| `SCCityPlan.h` | the city: a 13 x 13 block grid (130 m pitch) of downtown towers, mid-rises, houses with pools, parks, a beach hotel, the plaza, five places you can walk into, and the beach with its promenade; street furniture, parked cars, pavement loops for the pedestrians |
| `SCBuildings.h`, `SCProps.h` | the buildings (glass towers, podiums, mid-rises with balconies, awnings and air-conditioners, houses with porches, shutters, garages and gabled roofs, the balconied hotel), the ground (road, pavement, kerbs, lane lines, crossings), pools, and palms, trees, bushes, lamps, hydrants, benches, signals, parked cars, umbrellas, loungers, a lifeguard tower, the fountain, petrol pumps |
| `SCVenue.h` | the inside of the petrol station, shop, jeweller, bank and museum: shelves with goods, counters, a vault door, safe-deposit boxes, pedestals and paintings, ceiling lights (real lights in the engine) and where the staff stand |
| `SCCarBody.h` | the cars: a lofted body (nose, bonnet, screen, roof, tail) with glass, pillars, paint, sills, lamps, number plates; a police car's light bar and push bar; wheels |
| `SCRig.h` | a person (build from `BodyStyle`: tall, short, big and muscular), and poses: stand, walk, run, jab, cross, haymaker, kick, aim, hands up, stagger, knocked down |
| `SCBrain.h`, `SCWanted.h` | what people do (strolling, the armed man's draw-aim-shoot-reload, the bruiser's charge and blows, the officer's chase and arrest, wallets) and the police stars |
| `SCTerrain.h` | the sand that slopes under the sea, and the hills |

`Source/SunsetCity/SC*.cpp` is the Unreal glue (the part that has *not* been compiled):

| file | what it does |
|---|---|
| `SCGameMode` | on start makes the sky, the city and the director; puts you on the plaza's pavement and parks a red sports car at the kerb |
| `SCWorld` | streams the city: builds the blocks round you (nearest first, a few milliseconds a frame, ground first), drops the ones far behind; the sea, the sand, the land and the hills; solid boxes for buildings and props; real lights in rooms; the street lamps nearest you light up at night |
| `SCEnvironment` | the sun and moon crossing the sky (sunset over the sea in the west), the sky atmosphere, volumetric clouds and fog, the sky light, exposure, bloom, colour; the clock |
| `SCMaterials`, `SCUtil` | one material instance for each kind of surface (see `Core/SCMesh.h` `Mat`), night parameter; turns a Core mesh into a procedural mesh with one section per material |
| `SCCharacter`, `SCPuppet` | you: movement, camera, fighting, shooting, health; the jointed body (a scene component per joint, a mesh per part) |
| `SCNpc` | pedestrians, fighters, staff, officers: stroll, react, fight (using `SCBrain.h`), lie down, have a wallet |
| `SCVehicle` | a car: a rigid body with four raycast wheels (spring, damper, tyre grip and drive forces), the body and wheels from `SCCarBody.h`, headlights, a police car's flashing lights, running people over; police cars drive themselves at you |
| `SCDirector` | keeps about 22 people on the pavements near you (1 in 11 armed, 1 in 16 a big man), the stars, police on foot and in cars, arrests, wallets, the staff and tills of the places you can walk into, the money |
| `SCHUD` | health, money, clock, stars, "E" prompts, crosshair, speed, and the touch controls |
| `SCTouch` | the fingers on a touch screen (a stick, a look area, buttons) read each frame; used by the character and the car |

Handling, population and streaming numbers are `UPROPERTY` fields (the car's springs and grip, `LoadRadius`, `MaxPedestrians`, the day length) so they can be changed in the editor; the car's numbers are guesses and will want tuning.

## Honest notes

- **Not compiled, not run** (see the top). The one-click script and the two `.bat` files have been run on Windows, but only with a stand-in for Unreal (see "The easy way"). The touch controls (`SCTouch.*`) are the newest and the least checked part of the game: the touch code was syntax-checked against the stand-in like the rest, but how Pixel Streaming reports a finger (as touch events or as a mouse) depends on the frontend and version, so if the controls do not appear on the iPad, send back what you see. It was written against the Unreal 5.4 to 5.6 API from memory of the headers; settings whose names move between versions are set by name at run time (`SCU::SetNum`) so a missing one only logs a warning.
- **The geometry is procedural and stylised.** The buildings are boxy with believable detail (window frames, sills, balconies, awnings, cornices, roof plant), the cars are lofted shells, the people are jointed ellipsoids and cylinders, not scanned or MetaHuman-quality. This is the foundation and a generator; **it will not look like GTA 6**, which is the work of hundreds of artists. What makes the picture read as real here is the lighting and materials Unreal gives it (Lumen, VSM, the physical sky, clear coat, subsurface, refraction).
- **Procedural meshes are not Nanite, and software Lumen cannot see them** (no mesh distance fields): the project turns hardware ray tracing on for Lumen so it can. On a card without it, set `r.Lumen.HardwareRayTracing=False` in `Config/DefaultEngine.ini` and expect flatter light.
- **Streaming is the game's own** (nearest blocks first, a few ms a frame), not World Partition: the world is generated, not authored, so there is nothing for World Partition to partition. About 340 to 700 MB of RAM for the loaded blocks (7 x 7 at the default; `LoadRadius` 2 is about half).
- **Cars:** a raycast vehicle, not the Chaos Vehicle plugin (that needs skeletal mesh and asset setup in the editor). The numbers are guesses; it may be too grippy or too floaty. The Ferrari scan (`assets/cars/ferrari.glb`, Draco-compressed) can replace the built-in sports car body: import it with `sc_import_assets.py` and put its path in `Config/DefaultGame.ini` (`HeroCarMeshPath`). It will need its wheels hidden or positioned; the built-in wheels and physics are used either way.
- **People:** the Rocketbox people from the web version import as skeletal meshes (`Content/Imported/People`) but nothing animates them yet (they need an animation blueprint or retargeting to the UE5 mannequin: the next step). The game uses the built-in jointed figure until then. A MetaHuman (Quixel Bridge, free) is the way to real faces and hair: replace `USCPuppet` with a skeletal mesh component and drive it with the same `SC::Pose` angles, or retarget a locomotion set.
- **No sound** (no recordings were made or licensed); no traffic on the streets (only parked cars, your car and the police); no swimming (the sea is walkable to a depth where an invisible wall stops you; pools are raised basins); a robbery needs a pistol out and a clerk alive.
- **Not in the web version's league yet:** the web version has the bunkers, the wider map, races, the police helicopter and gadget car, the touch controls; this version has the city, the people, the fights, the police, the cars, the rooms and the light.

## Making it look better (the path to realism)

1. **Real light first:** get Lumen with hardware ray tracing working (`r.Lumen.HardwareRayTracing`), then tune `ASCEnvironment` (time of day, exposure) and the post settings in `SCEnvironment.cpp`.
2. **Better materials:** the masters in `sc_build_materials.py` are a starting point: add detail normal maps (Quixel Megascans via Fab/Bridge are free to Unreal users) for stucco, asphalt, brick, pavement, sand; parallax for the windows.
3. **Better meshes:** swap the generated buildings/props for kits (Fab, Megascans) and make them **Nanite** static meshes; bake the generated chunks to static meshes with the Geometry Script plugin so Lumen's surface cache sees them.
4. **Better people:** MetaHumans, **Mass AI** for crowds, retargeted locomotion, ragdolls for knock-downs.
5. **Better cars:** the Chaos Vehicle plugin with the Ferrari as a skeletal mesh, an interior, sound (MetaSounds engine audio), Niagara smoke and sparks, rain and wet-road materials.

## Tests

`Tests/run_core_tests.sh` builds and runs the core's 105 checks (needs g++ or clang++; no Unreal): meshes are clean and face outwards, the city plan is sane (nothing overlaps, everything is inside its block, doors face the plaza), every building, prop, room, pool and piece of ground is a clean mesh with the glass facing out, there is a clear way in from every door, the car and the people are the right shape, the fighters behave, the police stars behave.
`Tests/oneclick/test_oneclick.ps1` runs the one-click script on Windows with a stand-in engine (see "The easy way"; it needs Windows, and is run by the `windows-oneclick` workflow on every change to `unreal/`).
`Tests/glue_check/check.py` copies the Unreal-facing code, gives it a stand-in Unreal API (`ue_stub.h`) and syntax-checks it with g++ as C++20 (what Unreal 5.5 builds game code as), with a variable that hides another counted as an error (as Unreal's default build settings do). It then runs `shadow_scan.py`, which looks for three things that compile anywhere else and stop an Unreal build: a local or a parameter named like a member of the real engine class it is in (`Mesh` in a character, `Canvas` in a HUD, `Owner`, `Tags`, `Bounds` ...), a member of one of our classes named like a member of its engine base, and file-local helpers of the same name in two files (Unreal compiles several files as one). The scan plants one of each mistake in a copy first and checks that it finds them. Needs only Python and g++. A pass is still not a pass in Unreal: the stand-in is my reading of Unreal's API, and the list of engine member names is written out from memory.
