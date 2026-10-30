// Sunset City, native: window, the main loop, and command-line options for headless screenshots:
//   sunset.exe --shot out.bmp [--size WxH] [--msaa N] [--spawn coast|desert|alpine|south|city|runway]
//              [--cam chase|close|driver|hood|free] [--at x,z --height m --yaw deg --pitch deg]  (free camera)
//              [--drive seconds] [--steer v] [--color r,g,b] [--noao] [--noshadow] [--time s]
//   sunset.exe --check-shaders [file]     compile every shader and list any errors
#include "renderer.h"
#include "world.h"
#include "game.h"
#include "hud.h"
#include <cstdio>
#include <cstdlib>
#include <string>

static Input g_input; static Renderer* g_r = nullptr; static bool g_quit = false; static int g_mx = 0, g_my = 0;
static LRESULT CALLBACK WndProc(HWND h, UINT m, WPARAM w, LPARAM l) {
  switch (m) {
    case WM_CLOSE: case WM_DESTROY: g_quit = true; return 0;
    case WM_SIZE: if (g_r && w != SIZE_MINIMIZED) g_r->resize(LOWORD(l), HIWORD(l)); return 0;
    case WM_KEYDOWN:
      if (w < 256) g_input.keys[w] = true; if (w == VK_ESCAPE) g_quit = true;
      if (w == VK_F11 && !(l & (1 << 30))) {   // borderless fullscreen on the monitor the window is on
        static RECT saved; static bool full = false; LONG st = GetWindowLong(h, GWL_STYLE);
        if (!full) { GetWindowRect(h, &saved); MONITORINFO mi = { sizeof mi }; GetMonitorInfo(MonitorFromWindow(h, MONITOR_DEFAULTTONEAREST), &mi); SetWindowLong(h, GWL_STYLE, (st & ~WS_OVERLAPPEDWINDOW) | WS_POPUP); SetWindowPos(h, HWND_TOP, mi.rcMonitor.left, mi.rcMonitor.top, mi.rcMonitor.right - mi.rcMonitor.left, mi.rcMonitor.bottom - mi.rcMonitor.top, SWP_FRAMECHANGED); }
        else { SetWindowLong(h, GWL_STYLE, (st & ~WS_POPUP) | WS_OVERLAPPEDWINDOW); SetWindowPos(h, nullptr, saved.left, saved.top, saved.right - saved.left, saved.bottom - saved.top, SWP_FRAMECHANGED | SWP_NOZORDER); }
        full = !full;
      }
      return 0;
    case WM_KEYUP: if (w < 256) g_input.keys[w] = false; return 0;
    case WM_MOUSEWHEEL: g_input.wheel += (float)GET_WHEEL_DELTA_WPARAM(w) / 120.0f; return 0;
    case WM_RBUTTONDOWN: g_input.rightDown = true; SetCapture(h); g_mx = (short)LOWORD(l); g_my = (short)HIWORD(l); return 0;
    case WM_RBUTTONUP: g_input.rightDown = false; ReleaseCapture(); return 0;
    case WM_MOUSEMOVE: { int x = (short)LOWORD(l), y = (short)HIWORD(l); if (g_input.rightDown) { g_input.mouseDX += (float)(x - g_mx); g_input.mouseDY += (float)(y - g_my); } g_mx = x; g_my = y; return 0; }
    case WM_KILLFOCUS: std::memset(g_input.keys, 0, sizeof g_input.keys); return 0;
  }
  return DefWindowProc(h, m, w, l);
}
static std::string findShaders() {
  char exe[MAX_PATH]; GetModuleFileNameA(nullptr, exe, MAX_PATH); std::string dir = exe; dir = dir.substr(0, dir.find_last_of("\\/"));
  for (const char* rel : { "/shaders", "/../shaders", "/../../shaders", "/../../native/shaders", "/native/shaders" }) { std::string d = dir + rel; if (GetFileAttributesA((d + "/common.hlsli").c_str()) != INVALID_FILE_ATTRIBUTES) return d; }
  return dir + "/shaders";
}

int main(int argc, char** argv) {
  std::string shotPath, spawn = "coast", camName, shaderFilter; UINT W = 1600, H = 900; int msaa = 4, frames = 4;
  double autoExit = 0; bool offscreen = false, aoOff = false, shadowOff = false, checkShaders = false, freeCam = false; double ax = 0, az = 0, driveS = 0, steerV = 0, carX = 0, carZ = 0, carH = 0; bool hasCar = false;
  float ah = 3, yaw = 90, pitch = -4, tod = 0, color[3] = { 0.85f, 0.20f, 0.03f }; bool hasAt = false, hasOrbit = false; double orbYaw = 0, orbDist = 7, orbH = 1.6;
  for (int i = 1; i < argc; i++) {
    std::string a = argv[i]; auto next = [&]() { return i + 1 < argc ? std::string(argv[++i]) : std::string(); };
    if (a == "--shot") shotPath = next(); else if (a == "--size") sscanf(next().c_str(), "%ux%u", &W, &H); else if (a == "--msaa") msaa = atoi(next().c_str());
    else if (a == "--frames") frames = atoi(next().c_str()); else if (a == "--offscreen") offscreen = true; else if (a == "--noao") aoOff = true; else if (a == "--noshadow") shadowOff = true;
    else if (a == "--spawn") spawn = next(); else if (a == "--cam") camName = next(); else if (a == "--drive") driveS = atof(next().c_str()); else if (a == "--steer") steerV = atof(next().c_str());
    else if (a == "--at") { hasAt = true; sscanf(next().c_str(), "%lf,%lf", &ax, &az); } else if (a == "--yaw") yaw = (float)atof(next().c_str()); else if (a == "--pitch") pitch = (float)atof(next().c_str());
    else if (a == "--height") ah = (float)atof(next().c_str()); else if (a == "--time") tod = (float)atof(next().c_str());
    else if (a == "--car") { hasCar = true; sscanf(next().c_str(), "%lf,%lf,%lf", &carX, &carZ, &carH); } else if (a == "--color") sscanf(next().c_str(), "%f,%f,%f", &color[0], &color[1], &color[2]);
    else if (a == "--orbit") { hasOrbit = true; sscanf(next().c_str(), "%lf,%lf,%lf", &orbYaw, &orbDist, &orbH); }
    else if (a == "--seconds") autoExit = atof(next().c_str());
    else if (a == "--check-shaders") { checkShaders = true; if (i + 1 < argc && argv[i + 1][0] != '-') shaderFilter = next(); }
  }
  if (!shotPath.empty() || offscreen || checkShaders) SetEnvironmentVariableA("SUNSET_HEADLESS", "1");
  SetProcessDPIAware();   // render at the real pixel size on scaled displays
  logf("Sunset City (native) starting"); worldInit();
  Renderer R; R.gfx.shaderDir = findShaders(); logf("shaders: %s", R.gfx.shaderDir.c_str());
  if (checkShaders) {
    struct E { const char* f; const char* e; const char* p; std::vector<std::string> d; };
    const E list[] = { {"sky.hlsl","VSMain","vs_5_0",{}}, {"sky.hlsl","PSMain","ps_5_0",{}}, {"terrain.hlsl","VSMain","vs_5_0",{}}, {"terrain.hlsl","PSMain","ps_5_0",{}}, {"water.hlsl","VSMain","vs_5_0",{}}, {"water.hlsl","PSMain","ps_5_0",{}},
      {"post.hlsl","VSFull","vs_5_0",{}}, {"post.hlsl","PSBloomFirst","ps_5_0",{}}, {"post.hlsl","PSBloomDown","ps_5_0",{}}, {"post.hlsl","PSBloomUp","ps_5_0",{}}, {"post.hlsl","PSComposite","ps_5_0",{}}, {"post.hlsl","PSAO","ps_5_0",{}}, {"post.hlsl","PSAOBlur","ps_5_0",{}},
      {"mesh.hlsl","VSMain","vs_5_0",{}}, {"mesh.hlsl","VSMain","vs_5_0",{"INSTANCED"}}, {"mesh.hlsl","PSMain","ps_5_0",{}}, {"shadow.hlsl","VSMain","vs_5_0",{}}, {"shadow.hlsl","VSInst","vs_5_0",{}}, {"shadow.hlsl","VSTerrain","vs_5_0",{}}, {"hud.hlsl","VSMain","vs_5_0",{}}, {"hud.hlsl","PSMain","ps_5_0",{}} };
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
  HWND hwnd = CreateWindowA("SunsetCityWnd", "Sunset City", WS_OVERLAPPEDWINDOW | WS_VISIBLE, CW_USEDEFAULT, CW_USEDEFAULT, rc.right - rc.left, rc.bottom - rc.top, nullptr, nullptr, wc.hInstance, nullptr);
  Quality q; q.msaa = msaa; q.ao = !aoOff; q.shadows = !shadowOff;
  R.init(hwnd, W, H, offscreen, q); R.time = tod;
  Game G; G.init(R); std::memcpy(G.color, color, sizeof color);
  Hud hud; hud.init(R); double fpsShown = 60;
  R.onBeginFrame = [&](Gfx& g, Vec3 cam) { G.scenery.update(g, cam); };
  R.drawHud = [&](Gfx& g, Texture& t) { hud.draw(R, g, t, G, R.time, fpsShown); };
  if (hasCar) G.spawn("manual", carX, carZ, carH); else G.spawn(spawn);
  if (camName == "close") G.camMode = 1; else if (camName == "driver") G.camMode = 2; else if (camName == "hood") G.camMode = 3; else if (camName == "free") freeCam = true;
  InputState in; in.steer = steerV;
  auto driveFor = [&](double seconds) { InputState d; d.gas = 1; d.steer = steerV; for (double t = 0; t < seconds; t += 1.0 / 60.0) G.update(R, 1.0 / 60.0, d); };
  if (driveS > 0) driveFor(driveS); else for (int i = 0; i < 90; i++) G.update(R, 1.0 / 60.0, in);
  if (freeCam || hasAt) { R.cam.pos = Vec3((float)ax, (float)heightAt(ax, az) + ah, (float)az); R.cam.yaw = yaw; R.cam.pitch = pitch; freeCam = true; }
  if (hasOrbit) {   // a camera circling the car (angle measured from straight ahead, clockwise seen from above)
    double h = G.car.h + orbYaw * PI / 180.0; Vec3 c((float)G.car.x, (float)G.car.bodyY() + 0.7f, (float)G.car.z);
    R.cam.pos = c + Vec3((float)(std::sin(h) * orbDist), (float)orbH, (float)(std::cos(h) * orbDist)); Vec3 f = normalize(c - R.cam.pos);
    R.cam.yaw = (float)(std::atan2(f.x, -f.z) * 180 / PI); R.cam.pitch = (float)(std::asin(f.y) * 180 / PI); R.cam.fov = 45; freeCam = true;
  }
  Vec3 loadAt = R.cam.pos; R.terrain.loadNow(R.gfx, loadAt); G.scenery.loadNow(R.gfx, loadAt); R.finishInit();
  g_r = &R;
  if (!shotPath.empty()) {
    for (int i = 0; i < frames; i++) {
      if (!freeCam) G.update(R, 1.0 / 60.0, in);
      if (i == frames - 1) R.requestShot(shotPath);
      R.frame(1.0f / 60.0f); R.time += 1.0 / 60.0; MSG m; while (PeekMessage(&m, nullptr, 0, 0, PM_REMOVE)) { TranslateMessage(&m); DispatchMessage(&m); }
    }
    return 0;
  }
  LARGE_INTEGER fq, t0; QueryPerformanceFrequency(&fq); QueryPerformanceCounter(&t0); double last = 0, fpsT = 0; int fcount = 0;
  long totalFrames = 0; bool resized = false;
  while (!g_quit) {
    MSG m; while (PeekMessage(&m, nullptr, 0, 0, PM_REMOVE)) { TranslateMessage(&m); DispatchMessage(&m); }
    LARGE_INTEGER t; QueryPerformanceCounter(&t); double now = (double)(t.QuadPart - t0.QuadPart) / fq.QuadPart, dt = std::min(0.1, now - last); last = now;
    if (autoExit > 0) { if (now > autoExit) break; if (!resized && now > autoExit * 0.5) { resized = true; SetWindowPos(hwnd, nullptr, 0, 0, 640 + 16, 360 + 39, SWP_NOMOVE | SWP_NOZORDER); } }   // test: run for a while, resizing half way
    totalFrames++;
    InputState s = g_input.read(); G.update(R, dt, s); R.time = now; R.frame((float)dt);
    fcount++; fpsT += dt; if (fpsT > 1.0) { char title[200]; fpsShown = fcount / fpsT; snprintf(title, sizeof title, "Sunset City (native)  %.0f fps  %.0f km/h  gear %d", fpsShown, G.speedKmh, G.car.gear); SetWindowTextA(hwnd, title); fcount = 0; fpsT = 0; }
  }
  R.gfx.waitIdle(); logf("ran %ld frames in the main loop", totalFrames);
  return 0;
}
