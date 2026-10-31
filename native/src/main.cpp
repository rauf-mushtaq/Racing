// Sunset City, native: window, the main loop, and command-line options for headless screenshots:
//   sunset.exe --shot out.bmp [--size WxH] [--msaa N] [--spawn coast|desert|alpine|south|city|runway]
//              [--cam chase|close|driver|hood|free] [--at x,z --height m --yaw deg --pitch deg]  (free camera)
//              [--drive seconds] [--steer v] [--color r,g,b] [--noao] [--noshadow] [--time s] [--model super|bond] [--guns]
//              [--escape] [--race N] [--fullscreen] [--vsync] [--simulate seconds]   (the last runs the game logic only and logs what happens)
//   sunset.exe --check-shaders [file]     compile every shader and list any errors
#include "renderer.h"
#include "world.h"
#include "game.h"
#include "hud.h"
#include <cstdio>
#include <cstdlib>
#include <string>

static void toggleFullscreen(HWND h) {   // borderless fullscreen on the monitor the window is on
  static RECT saved; static bool full = false; LONG st = GetWindowLong(h, GWL_STYLE);
  if (!full) { GetWindowRect(h, &saved); MONITORINFO mi = { sizeof mi }; GetMonitorInfo(MonitorFromWindow(h, MONITOR_DEFAULTTONEAREST), &mi); SetWindowLong(h, GWL_STYLE, (st & ~WS_OVERLAPPEDWINDOW) | WS_POPUP); SetWindowPos(h, HWND_TOP, mi.rcMonitor.left, mi.rcMonitor.top, mi.rcMonitor.right - mi.rcMonitor.left, mi.rcMonitor.bottom - mi.rcMonitor.top, SWP_FRAMECHANGED); }
  else { SetWindowLong(h, GWL_STYLE, (st & ~WS_POPUP) | WS_OVERLAPPEDWINDOW); SetWindowPos(h, nullptr, saved.left, saved.top, saved.right - saved.left, saved.bottom - saved.top, SWP_FRAMECHANGED | SWP_NOZORDER); }
  full = !full;
}
static LONG WINAPI crashFilter(EXCEPTION_POINTERS* e) {   // write where it went wrong into the log, so a crash can be reported and found
  logf("CRASH: exception 0x%08lx at %p (access address %p)", e->ExceptionRecord->ExceptionCode, e->ExceptionRecord->ExceptionAddress, e->ExceptionRecord->NumberParameters > 1 ? (void*)e->ExceptionRecord->ExceptionInformation[1] : nullptr);
  void* st[40]; USHORT n = CaptureStackBackTrace(0, 40, st, nullptr);
  for (USHORT i = 0; i < n; i++) { HMODULE m = nullptr; char name[260] = "?"; if (GetModuleHandleExA(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT, (LPCSTR)st[i], &m)) GetModuleFileNameA(m, name, sizeof name); logf("  #%u %p  %s +0x%llx", i, st[i], name, (unsigned long long)((char*)st[i] - (char*)m)); }
  ExitProcess(3);
}
static Input g_input; static Renderer* g_r = nullptr; static bool g_quit = false; static int g_mx = 0, g_my = 0;
static LRESULT CALLBACK WndProc(HWND h, UINT m, WPARAM w, LPARAM l) {
  switch (m) {
    case WM_CLOSE: case WM_DESTROY: g_quit = true; return 0;
    case WM_SIZE: if (g_r && w != SIZE_MINIMIZED) g_r->resize(LOWORD(l), HIWORD(l)); return 0;
    case WM_KEYDOWN:
      if (w < 256) g_input.keys[w] = true;
      if (w == VK_F11 && !(l & (1 << 30))) toggleFullscreen(h);
      return 0;
    case WM_KEYUP: if (w < 256) g_input.keys[w] = false; return 0;
    case WM_MOUSEWHEEL: g_input.wheel += (float)GET_WHEEL_DELTA_WPARAM(w) / 120.0f; return 0;
    case WM_LBUTTONDOWN: g_input.leftDown = true; return 0;
    case WM_LBUTTONUP: g_input.leftDown = false; return 0;
    case WM_RBUTTONDOWN: g_input.rightDown = true; SetCapture(h); g_mx = (short)LOWORD(l); g_my = (short)HIWORD(l); return 0;
    case WM_RBUTTONUP: g_input.rightDown = false; ReleaseCapture(); return 0;
    case WM_MOUSEMOVE: { int x = (short)LOWORD(l), y = (short)HIWORD(l); g_input.mx = x; g_input.my = y; if (g_input.rightDown) { g_input.mouseDX += (float)(x - g_mx); g_input.mouseDY += (float)(y - g_my); } g_mx = x; g_my = y; return 0; }
    case WM_KILLFOCUS: std::memset(g_input.keys, 0, sizeof g_input.keys); g_input.leftDown = false; return 0;
  }
  return DefWindowProc(h, m, w, l);
}
static std::string findShaders() {
  char exe[MAX_PATH]; GetModuleFileNameA(nullptr, exe, MAX_PATH); std::string dir = exe; dir = dir.substr(0, dir.find_last_of("\\/"));
  for (const char* rel : { "/shaders", "/../shaders", "/../../shaders", "/../../native/shaders", "/native/shaders" }) { std::string d = dir + rel; if (GetFileAttributesA((d + "/common.hlsli").c_str()) != INVALID_FILE_ATTRIBUTES) return d; }
  return dir + "/shaders";
}

static std::string findMusic() {                                    // the music folder next to the game (made if it is not there, so there is somewhere to put a song)
  char exe[MAX_PATH]; GetModuleFileNameA(nullptr, exe, MAX_PATH); std::string dir = exe; dir = dir.substr(0, dir.find_last_of("\\/"));
  for (const char* rel : { "/music", "/../music", "/../../music", "/../../native/music", "/native/music" }) { std::string d = dir + rel; if (GetFileAttributesA(d.c_str()) != INVALID_FILE_ATTRIBUTES) return d; }
  std::string d = dir + "/music"; CreateDirectoryA(d.c_str(), nullptr); return d;
}
static std::string findAssets() {
  char exe[MAX_PATH]; GetModuleFileNameA(nullptr, exe, MAX_PATH); std::string dir = exe; dir = dir.substr(0, dir.find_last_of("\\/"));
  for (const char* rel : { "/assets", "/../assets", "/../../assets", "/../../native/assets", "/native/assets" }) { std::string d = dir + rel; if (GetFileAttributesA(d.c_str()) != INVALID_FILE_ATTRIBUTES) return d; }
  return dir + "/assets";
}

int main(int argc, char** argv) {
  std::string shotPath, spawn = "coast", camName, shaderFilter; UINT W = 1600, H = 900; int msaa = 4, frames = 4;
  int modelKind = 0, raceIdx = -1, menuPage = -1; bool gunsOut = false, startEscape = false, startFull = false, vsyncOn = false; double simSeconds = 0, autoExit = 0, showYaw = 2.5; bool offscreen = false, aoOff = false, shadowOff = false, checkShaders = false, freeCam = false; double ax = 0, az = 0, driveS = 0, steerV = 0, carX = 0, carZ = 0, carH = 0; bool hasCar = false;
  bool selfTestWheel = false, fakeWheel = false, wizardShot = false; int showcaseN = -1; float dayArg = 1.0f; float ah = 3, yaw = 90, pitch = -4, tod = 0, color[3] = { 0.50f, 0.012f, 0.02f }; bool hasAt = false, hasOrbit = false; double orbYaw = 0, orbDist = 7, orbH = 1.6;
  bool testRun = false; for (int i = 1; i < argc; i++) if (!strcmp(argv[i], "--shot") || !strcmp(argv[i], "--simulate") || !strcmp(argv[i], "--check-shaders") || !strcmp(argv[i], "--selftest-wheel")) testRun = true;
  Settings saved; if (!testRun) saved.load();                    // what the player chose last time (the command line below still wins; test runs ignore it)
  msaa = saved.msaa; vsyncOn = saved.vsync; aoOff = !saved.ao; shadowOff = !saved.shadows; dayArg = saved.day ? 1.0f : 0.0f;
  for (int i = 1; i < argc; i++) {
    std::string a = argv[i]; auto next = [&]() { return i + 1 < argc ? std::string(argv[++i]) : std::string(); };
    if (a == "--shot") shotPath = next(); else if (a == "--size") sscanf(next().c_str(), "%ux%u", &W, &H); else if (a == "--msaa") msaa = atoi(next().c_str());
    else if (a == "--frames") frames = atoi(next().c_str()); else if (a == "--offscreen") offscreen = true; else if (a == "--noao") aoOff = true; else if (a == "--noshadow") shadowOff = true;
    else if (a == "--spawn") spawn = next(); else if (a == "--cam") camName = next(); else if (a == "--drive") driveS = atof(next().c_str()); else if (a == "--steer") steerV = atof(next().c_str());
    else if (a == "--at") { hasAt = true; sscanf(next().c_str(), "%lf,%lf", &ax, &az); } else if (a == "--yaw") yaw = (float)atof(next().c_str()); else if (a == "--pitch") pitch = (float)atof(next().c_str());
    else if (a == "--height") ah = (float)atof(next().c_str()); else if (a == "--time") tod = (float)atof(next().c_str()); else if (a == "--day") dayArg = (float)atof(next().c_str());
    else if (a == "--car") { hasCar = true; sscanf(next().c_str(), "%lf,%lf,%lf", &carX, &carZ, &carH); } else if (a == "--color") sscanf(next().c_str(), "%f,%f,%f", &color[0], &color[1], &color[2]);
    else if (a == "--showcase") showcaseN = atoi(next().c_str()); else if (a == "--showyaw") showYaw = atof(next().c_str()) * PI / 180.0; else if (a == "--orbit") { hasOrbit = true; sscanf(next().c_str(), "%lf,%lf,%lf", &orbYaw, &orbDist, &orbH); }
    else if (a == "--seconds") autoExit = atof(next().c_str()); else if (a == "--model") { std::string m = next(); modelKind = (m == "bond" || m == "gt") ? 1 : 0; } else if (a == "--guns") gunsOut = true;
    else if (a == "--escape") startEscape = true; else if (a == "--race") raceIdx = atoi(next().c_str()); else if (a == "--fullscreen") startFull = true; else if (a == "--vsync") vsyncOn = true; else if (a == "--simulate") simSeconds = atof(next().c_str()); else if (a == "--menu") menuPage = atoi(next().c_str());
    else if (a == "--selftest-wheel") selfTestWheel = true; else if (a == "--fakewheel") fakeWheel = true; else if (a == "--wizard") wizardShot = true; else if (a == "--check-shaders") { checkShaders = true; if (i + 1 < argc && argv[i + 1][0] != '-') shaderFilter = next(); }
  }
  if (!shotPath.empty() || offscreen || checkShaders) SetEnvironmentVariableA("SUNSET_HEADLESS", "1");
  SetProcessDPIAware();   // render at the real pixel size on scaled displays
  SetUnhandledExceptionFilter(crashFilter);
  logf("Sunset City (native) starting"); worldInit();
  Renderer R; R.gfx.shaderDir = findShaders(); logf("shaders: %s", R.gfx.shaderDir.c_str()); R.gfx.assetDir = findAssets(); logf("assets: %s", R.gfx.assetDir.c_str());
  if (checkShaders) {
    struct E { const char* f; const char* e; const char* p; std::vector<std::string> d; };
    const E list[] = { {"sky.hlsl","VSMain","vs_5_0",{}}, {"sky.hlsl","PSMain","ps_5_0",{}}, {"terrain.hlsl","VSMain","vs_5_0",{}}, {"terrain.hlsl","PSMain","ps_5_0",{}}, {"water.hlsl","VSMain","vs_5_0",{}}, {"water.hlsl","PSMain","ps_5_0",{}},
      {"post.hlsl","VSFull","vs_5_0",{}}, {"post.hlsl","PSBloomFirst","ps_5_0",{}}, {"post.hlsl","PSBloomDown","ps_5_0",{}}, {"post.hlsl","PSBloomUp","ps_5_0",{}}, {"post.hlsl","PSComposite","ps_5_0",{}}, {"post.hlsl","PSDof","ps_5_0",{}}, {"post.hlsl","PSAO","ps_5_0",{}}, {"post.hlsl","PSAOBlur","ps_5_0",{}},
      {"mesh.hlsl","VSMain","vs_5_0",{}}, {"mesh.hlsl","VSMain","vs_5_0",{"INSTANCED"}}, {"mesh.hlsl","PSMain","ps_5_0",{}}, {"shadow.hlsl","VSMain","vs_5_0",{}}, {"shadow.hlsl","VSInst","vs_5_0",{}}, {"shadow.hlsl","VSTerrain","vs_5_0",{}}, {"hud.hlsl","VSMain","vs_5_0",{}}, {"hud.hlsl","PSMain","ps_5_0",{}}, {"fx.hlsl","VSMain","vs_5_0",{}}, {"fx.hlsl","PSMain","ps_5_0",{}} };
    SetEnvironmentVariableA("SUNSET_NOFATAL", "1"); int bad = 0;
    for (auto& e : list) {
      if (!shaderFilter.empty() && std::string(e.f).find(shaderFilter) == std::string::npos) continue;
      if (GetFileAttributesA((R.gfx.shaderDir + "/" + e.f).c_str()) == INVALID_FILE_ATTRIBUTES) continue;
      if (R.gfx.compile(e.f, e.e, e.p, e.d)) logf("ok      %s %s", e.f, e.e); else { bad++; logf("FAILED  %s %s", e.f, e.e); }
    }
    logf("%d shader(s) failed", bad); return bad ? 1 : 0;
  }
  WNDCLASSA wc = {}; wc.lpfnWndProc = WndProc; wc.hInstance = GetModuleHandle(nullptr); wc.lpszClassName = "SunsetCityWnd"; wc.hCursor = LoadCursor(nullptr, IDC_ARROW); RegisterClassA(&wc);
  RECT rc = { 0, 0, (LONG)W, (LONG)H }; AdjustWindowRect(&rc, WS_OVERLAPPEDWINDOW, FALSE);
  if (selfTestWheel) return wheelSelfTest() == 0 ? 0 : 1;
  HWND hwnd = CreateWindowA("SunsetCityWnd", "Sunset City", WS_OVERLAPPEDWINDOW | WS_VISIBLE, CW_USEDEFAULT, CW_USEDEFAULT, rc.right - rc.left, rc.bottom - rc.top, nullptr, nullptr, wc.hInstance, nullptr);
  Quality q; q.msaa = msaa; q.ao = !aoOff; q.shadows = !shadowOff;
  R.init(hwnd, W, H, offscreen, q); R.time = tod; R.day = R.dayTarget = dayArg; R.q.reflections = saved.reflections; R.q.softShadows = saved.softShadows; R.q.autoExposure = saved.autoExposure; R.q.bounce = saved.bounce;
  Game G; G.useSaved = !testRun; G.musicOn = !testRun; G.wheel.hwnd = hwnd; G.wheel.report = !testRun; G.init(R); G.music.setFolder(findMusic()); std::memcpy(G.color, color, sizeof color);
  if (fakeWheel) { Settings& st = G.settings; st.steer = { 15, 0, 0.5f, 1.0f, 0.0f }; st.throttle = { 15, 2, 1.0f, 0.0f, 0 }; st.brake = { 15, 3, 1.0f, 0.0f, 0 }; st.btn[ACT_HANDBRAKE] = 15 * 32 + 4; st.btn[ACT_SHIFTUP] = 15 * 32 + 1;
    float ax[6] = { 0.74f, 0.5f, 0.45f, 0.93f, 0.5f, 0.5f }; G.wheel.fake(ax, 0x5); G.wheel.poll(0.0); }   // for screenshots of the settings page
  Hud hud; hud.init(R); Perf perf; perf.msaa = R.q.msaa;
  R.onBeginFrame = [&](Gfx& g, Vec3 cam) { G.scenery.update(g, cam); G.prepare(g, R.frustum); };
  R.drawHud = [&](Gfx& g, Texture& t) { perf.draws = R.statDraws; perf.shadowDraws = R.statShadowDraws; perf.gpuMs = g.gpuMs; perf.W = R.W; perf.H = R.H; perf.vsync = g.vsync; perf.tearing = g.tearing; perf.ao = R.q.ao; perf.shadows = R.q.shadows; perf.refl = R.q.reflections; hud.draw(R, g, t, G, R.time, perf); };
  R.gfx.vsync = vsyncOn;
  G.setCarKind(modelKind); if (gunsOut) { G.bondState.gunOut = 1; G.bondState.shield = 1; }
  if (startEscape) G.startEscape(); else if (raceIdx >= 0) G.startRace(raceIdx); else if (hasCar) G.spawn("manual", carX, carZ, carH); else G.spawn(spawn);
  if (camName == "close") G.camMode = 1; else if (camName == "driver") G.camMode = 2; else if (camName == "hood") G.camMode = 3; else if (camName == "free") freeCam = true;
  InputState in; in.steer = steerV;
  auto driveFor = [&](double seconds) { InputState d; d.gas = 1; d.steer = steerV; for (double t = 0; t < seconds; t += 1.0 / 60.0) G.update(R, 1.0 / 60.0, d); };
  if (driveS > 0) driveFor(driveS); else if (!startEscape && raceIdx < 0) for (int i = 0; i < 90; i++) G.update(R, 1.0 / 60.0, in);
  if (freeCam || hasAt) { R.cam.pos = Vec3((float)ax, (float)heightAt(ax, az) + ah, (float)az); R.cam.yaw = yaw; R.cam.pitch = pitch; freeCam = true; }
  if (hasOrbit) {   // a camera circling the car (angle measured from straight ahead, clockwise seen from above)
    double h = G.car.h + orbYaw * PI / 180.0; Vec3 c((float)G.car.x, (float)G.car.bodyY() + 0.7f, (float)G.car.z);
    R.cam.pos = c + Vec3((float)(std::sin(h) * orbDist), (float)orbH, (float)(std::cos(h) * orbDist)); Vec3 f = normalize(c - R.cam.pos);
    R.cam.yaw = (float)(std::atan2(f.x, -f.z) * 180 / PI); R.cam.pitch = (float)(std::asin(f.y) * 180 / PI); R.cam.fov = 45; freeCam = true;
  }
  if (showcaseN >= 0) {   // a model on the ground 9 m ahead of the car, seen from the front three-quarter
    G.showcase = showcaseN; double fx = std::sin(G.car.h), fz = std::cos(G.car.h); G.showAt = Vec3((float)(G.car.x + fx * 9), 0, (float)(G.car.z + fz * 9));
    float dist = showcaseN == 8 ? 4.2f : showcaseN == 5 ? 15.0f : showcaseN == 4 ? 11.5f : showcaseN == 3 ? 8.0f : 6.5f; Vec3 c(G.showAt.x, (float)heightAt(G.showAt.x, G.showAt.z) + (showcaseN == 8 ? 1.0f : showcaseN >= 4 ? 1.6f : 0.8f), G.showAt.z);
    Vec3 pos = c + Vec3((float)(std::sin(G.car.h + showYaw) * dist), showcaseN == 8 ? 0.6f : 1.4f, (float)(std::cos(G.car.h + showYaw) * dist)); Vec3 f = normalize(c - pos);
    R.cam.pos = pos; R.cam.yaw = (float)(std::atan2(f.x, -f.z) * 180 / PI); R.cam.pitch = (float)(std::asin(f.y) * 180 / PI); R.cam.fov = 40; freeCam = true;
  }
  if (menuPage >= 0) { G.menuFrom = State::Free; G.openMenu(); if (menuPage > 0) G.runMenuActionPublic(menuPage); }
  if (wizardShot) { G.wheel.startBind(WheelInput::THROTTLE); for (int i = 0; i < 100; i++) { G.wheel.poll(1.0 / 60.0); G.wheel.updateBind(1.0 / 60.0); } }
  Vec3 loadAt = R.cam.pos; R.terrain.loadNow(R.gfx, loadAt); G.scenery.loadNow(R.gfx, loadAt); R.finishInit();
  g_r = &R;
  if (simSeconds > 0) {   // the game logic only: scripted driving and weapons, with a log of what the police and the world do
    double t = 0; int tick = 0; const double DT = 1.0 / 60.0; PoliceChase& E = G.escape;
    while (t < simSeconds) {
      InputState d; if (raceIdx >= 0) { if (G.state == State::Race && G.nextCp < (int)G.route.cps.size()) { const Checkpoint& cp = G.route.cps[G.nextCp]; double err = wrapAngle(std::atan2(cp.x - G.car.x, cp.z - G.car.z) - G.car.h); d.steer = clampd(-err * 2.5, -1, 1); d.gas = G.car.speed() < 28 ? 1.0 : 0.0; d.brake = G.car.speed() > 33 ? 1.0 : 0.0; }
        G.update(R, DT, d); t += DT; tick++; if (tick % 240 == 0) logf("t=%5.1f state=%d gate %d/%zu raceT=%.1f car=(%.0f,%.0f) v=%.1f", t, (int)G.state, G.nextCp, G.route.cps.size(), G.raceT, G.car.x, G.car.z, G.car.speed()); if (G.state == State::Finished) { logf("race finished in %.2f s, medal %d (gold %.1f)", G.raceT, G.lastMedal, G.route.medals.gold); break; } continue; }
      d.gas = t < 20 ? 0.5 : 1.0; d.brake = (t > 24 && t < 29) ? 1.0 : 0.0; if (d.brake > 0) d.gas = 0; d.steer = 0; d.nitro = t > 30;
      d.fire = (t > 3 && t < 6) || (t > 25 && t < 28); d.missile = (tick == 60 * 7) || (tick == 60 * 9); d.bomb = (tick == 60 * 11) || (tick == 60 * 26); d.oil = tick == 60 * 13; d.smoke = tick == 60 * 15; d.shield = tick == 60 * 17;
      G.update(R, DT, d); t += DT; tick++;
      if (tick % 240 == 0) { int alive = 0; double nearD = 1e9; for (auto& c : E.cops) if (!c.wreck) { alive++; nearD = std::min(nearD, std::hypot(c.x - G.car.x, c.z - G.car.z)); }
        logf("t=%5.1f car=(%7.1f,%7.1f) v=%5.1f hp=%5.1f stars=%d spotted=%d hidden=%4.1f/%4.1f cops=%d nearest=%6.1f kills=%d civ=%d missiles=%zu bombs=%zu fx=%zu result=%d state=%d", t, G.car.x, G.car.z, G.car.speed(), E.health, E.stars(), (int)E.spotted, E.hidden, E.hiddenNeeded, alive, nearD, E.kills, E.civilians, E.missiles.size(), E.bombs.size(), G.fx.count(), (int)E.result, (int)G.state); }
      if (G.state == State::EscapeOver && t > 2) break;
    }
    logf("simulation finished: result %d after %.1f s, %d police vehicles destroyed", (int)E.result, E.time, E.kills); R.gfx.waitIdle(); ExitProcess(0);
  }
  if (!shotPath.empty()) {
    for (int i = 0; i < frames; i++) {
      if (!freeCam) G.update(R, 1.0 / 60.0, in);
      if (i == frames - 1) R.requestShot(shotPath);
      R.frame(1.0f / 60.0f); R.time += 1.0 / 60.0; if (i == frames - 1) logf("draw calls: %u (%u of them for the shadow cascades)", R.statDraws, R.statShadowDraws); MSG m; while (PeekMessage(&m, nullptr, 0, 0, PM_REMOVE)) { TranslateMessage(&m); DispatchMessage(&m); }
    }
    R.gfx.waitIdle(); ExitProcess(0);
  }
  if (startFull) toggleFullscreen(hwnd);
  if (autoExit == 0 && !startEscape && raceIdx < 0) G.openMenu();
  LARGE_INTEGER fq, t0; QueryPerformanceFrequency(&fq); QueryPerformanceCounter(&t0); double last = 0, fpsT = 0, worst = 0; int fcount = 0;
  long totalFrames = 0; bool resized = false;
  while (!g_quit && !G.quit) {
    MSG m; while (PeekMessage(&m, nullptr, 0, 0, PM_REMOVE)) { TranslateMessage(&m); DispatchMessage(&m); }
    LARGE_INTEGER t; QueryPerformanceCounter(&t); double now = (double)(t.QuadPart - t0.QuadPart) / fq.QuadPart, raw = now - last, dt = std::min(0.1, raw); last = now;
    if (autoExit > 0) { if (now > autoExit) break; if (!resized && now > autoExit * 0.5) { resized = true; SetWindowPos(hwnd, nullptr, 0, 0, 640 + 16, 360 + 39, SWP_NOMOVE | SWP_NOZORDER); } }   // test: run for a while, resizing half way
    totalFrames++;
    InputState s = g_input.read();
    G.wheel.poll(dt); G.wheel.updateBind(dt); G.wheel.apply(s, G.state == State::Menu);
    if (s.vsync) { R.gfx.vsync = !R.gfx.vsync; } if (s.ao) R.q.ao = !R.q.ao; if (s.shadows) R.q.shadows = !R.q.shadows; if (s.refl) R.q.reflections = !R.q.reflections; if (s.tod) R.dayTarget = R.dayTarget > 0.5f ? 0.0f : 1.0f;
    if (s.vsync || s.ao || s.shadows || s.refl || s.tod) { Settings& st = G.settings; st.vsync = R.gfx.vsync; st.ao = R.q.ao; st.shadows = R.q.shadows; st.reflections = R.q.reflections; st.day = R.dayTarget > 0.5f ? 1 : 0; st.save(); }
    G.update(R, dt, s); R.time = now; R.frame((float)dt);
    worst = std::max(worst, raw * 1000.0); fcount++; fpsT += raw;
    if (fpsT > 0.5) { perf.fps = fcount / fpsT; perf.frameMs = fpsT * 1000.0 / fcount; perf.worstMs = worst; char title[200]; snprintf(title, sizeof title, "Sunset City (native)  %.0f fps  %.0f km/h", perf.fps, G.speedKmh); SetWindowTextA(hwnd, title); fcount = 0; fpsT = 0; worst = 0; }
  }
  R.gfx.waitIdle(); logf("ran %ld frames in the main loop", totalFrames);
  ExitProcess(0);   // skip the destructors: worker threads and GPU objects are torn down by the system
}
