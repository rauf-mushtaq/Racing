#include "wheel.h"
#include "game.h"
#include <windows.h>
#include <mmsystem.h>
#define DIRECTINPUT_VERSION 0x0800
#include <dinput.h>
#include <algorithm>
#include <cctype>
#include <cmath>
#include <cstdio>
#include <cstring>

static const char* const AXN_MM[8] = { "X", "Y", "Z", "R", "U", "V", "-", "-" };
static const char* const AXN_DI[8] = { "X", "Y", "Z", "Rx", "Ry", "Rz", "Slider 1", "Slider 2" };
static const int FAKE_ID = 15;

// --- DirectInput: the wheel's own API -----------------------------------------------------------------------------------------
struct AxCtx { IDirectInputDevice8A* d; bool has[8]; float mn[8], mx[8]; int sliders; };
struct DiOpen { GUID inst; IDirectInputDevice8A* d; WheelDev info; };
static IDirectInput8A* g_di = nullptr; static bool g_diTried = false; static std::vector<DiOpen> g_dis;

static bool diInit() {
  if (g_di) return true; if (g_diTried) return false; g_diTried = true;
  HMODULE m = LoadLibraryA("dinput8.dll"); if (!m) return false;
  typedef HRESULT(WINAPI * CreateFn)(HINSTANCE, DWORD, REFIID, LPVOID*, LPUNKNOWN);
  CreateFn c = (CreateFn)(void*)GetProcAddress(m, "DirectInput8Create"); if (!c) return false;
  return SUCCEEDED(c(GetModuleHandleA(nullptr), DIRECTINPUT_VERSION, IID_IDirectInput8A, (void**)&g_di, nullptr)) && g_di;
}
static BOOL CALLBACK diAxisCb(const DIDEVICEOBJECTINSTANCEA* o, void* p) {
  AxCtx* c = (AxCtx*)p; int i = -1;
  if (IsEqualGUID(o->guidType, GUID_XAxis)) i = 0; else if (IsEqualGUID(o->guidType, GUID_YAxis)) i = 1; else if (IsEqualGUID(o->guidType, GUID_ZAxis)) i = 2;
  else if (IsEqualGUID(o->guidType, GUID_RxAxis)) i = 3; else if (IsEqualGUID(o->guidType, GUID_RyAxis)) i = 4; else if (IsEqualGUID(o->guidType, GUID_RzAxis)) i = 5;
  else if (IsEqualGUID(o->guidType, GUID_Slider) && c->sliders < 2) i = 6 + c->sliders++;
  if (i < 0) return DIENUM_CONTINUE;
  DIPROPRANGE r = {}; r.diph.dwSize = sizeof r; r.diph.dwHeaderSize = sizeof(DIPROPHEADER); r.diph.dwHow = DIPH_BYID; r.diph.dwObj = o->dwType; r.lMin = 0; r.lMax = 65535;
  c->d->SetProperty(DIPROP_RANGE, &r.diph);
  DIPROPRANGE g = r; if (SUCCEEDED(c->d->GetProperty(DIPROP_RANGE, &g.diph)) && g.lMax > g.lMin) { c->mn[i] = (float)g.lMin; c->mx[i] = (float)g.lMax; }
  DIPROPDWORD w = {}; w.diph.dwSize = sizeof w; w.diph.dwHeaderSize = sizeof(DIPROPHEADER); w.diph.dwHow = DIPH_BYID; w.diph.dwObj = o->dwType;
  w.dwData = 0; c->d->SetProperty(DIPROP_DEADZONE, &w.diph); w.dwData = 10000; c->d->SetProperty(DIPROP_SATURATION, &w.diph);
  c->has[i] = true; return DIENUM_CONTINUE;
}
static BOOL CALLBACK diDevCb(const DIDEVICEINSTANCEA* i, void* p) { ((std::vector<DIDEVICEINSTANCEA>*)p)->push_back(*i); return DIENUM_CONTINUE; }

static bool diOpen(const DIDEVICEINSTANCEA& inst, HWND hwnd, DiOpen& out) {
  IDirectInputDevice8A* d = nullptr; if (FAILED(g_di->CreateDevice(inst.guidInstance, &d, nullptr)) || !d) return false;
  if (FAILED(d->SetDataFormat(&c_dfDIJoystick2)) || FAILED(d->SetCooperativeLevel(hwnd, DISCL_BACKGROUND | DISCL_NONEXCLUSIVE))) { d->Release(); return false; }
  AxCtx c = {}; c.d = d; for (int a = 0; a < 8; a++) { c.mn[a] = 0; c.mx[a] = 65535; }
  d->EnumObjects(diAxisCb, &c, DIDFT_AXIS);
  DIDEVCAPS caps = {}; caps.dwSize = sizeof caps; d->GetCapabilities(&caps);
  d->Acquire();
  out.inst = inst.guidInstance; out.d = d; WheelDev& w = out.info; w = WheelDev(); w.di = true; w.h = d; w.axName = AXN_DI;
  w.name = inst.tszProductName[0] ? inst.tszProductName : inst.tszInstanceName; w.buttons = (int)caps.dwButtons; w.pov = caps.dwPOVs > 0;
  for (int a = 0; a < 8; a++) { w.has[a] = c.has[a]; w.mn[a] = c.mn[a]; w.mx[a] = c.mx[a]; if (c.has[a]) w.axes++; }
  return true;
}
static void diScan(std::vector<WheelDev>& found, void* hwnd, std::string& note) {
  if (!hwnd) { note = "waiting for the window"; return; } if (!diInit()) { note = "not available"; return; }
  std::vector<DIDEVICEINSTANCEA> list; HRESULT hr = g_di->EnumDevices(DI8DEVCLASS_GAMECTRL, diDevCb, &list, DIEDFL_ATTACHEDONLY);
  if (FAILED(hr)) { char b[48]; snprintf(b, sizeof b, "error 0x%08lx", (unsigned long)hr); note = b; return; }
  for (size_t i = g_dis.size(); i-- > 0;) {                                            // forget the ones that were unplugged
    bool still = false; for (auto& l : list) if (IsEqualGUID(l.guidInstance, g_dis[i].inst)) still = true;
    if (!still) { g_dis[i].d->Unacquire(); g_dis[i].d->Release(); g_dis.erase(g_dis.begin() + (long)i); }
  }
  int failed = 0;
  for (auto& l : list) { bool have = false; for (auto& o : g_dis) if (IsEqualGUID(o.inst, l.guidInstance)) have = true;
    if (!have && (int)g_dis.size() < WheelInput::MAXDEV - 1) { DiOpen o; if (diOpen(l, (HWND)hwnd, o)) g_dis.push_back(o); else failed++; } }
  for (auto& o : g_dis) { WheelDev w = o.info; w.id = (int)found.size(); found.push_back(w); }
  note = std::to_string(g_dis.size()) + " found"; if (failed) note += ", " + std::to_string(failed) + " could not be opened";
}
static bool diRead(IDirectInputDevice8A* d, DIJOYSTATE2& js) {
  d->Poll(); HRESULT hr = d->GetDeviceState(sizeof js, &js);
  if (hr == DIERR_INPUTLOST || hr == DIERR_NOTACQUIRED) { d->Acquire(); d->Poll(); hr = d->GetDeviceState(sizeof js, &js); }
  return SUCCEEDED(hr);
}

// --- The Windows multimedia joystick API: the fallback ----------------------------------------------------------------------------
static std::string oemName(const JOYCAPSA& c) {                    // the name Windows shows in "Set up USB game controllers"
  char key[256]; snprintf(key, sizeof key, "System\\CurrentControlSet\\Control\\MediaProperties\\PrivateProperties\\Joystick\\OEM\\%s", c.szRegKey);
  HKEY h; std::string out = c.szPname;
  if (RegOpenKeyExA(HKEY_CURRENT_USER, key, 0, KEY_READ, &h) == ERROR_SUCCESS) { char buf[128] = {}; DWORD sz = sizeof buf - 1, type = 0; if (RegQueryValueExA(h, "OEMName", nullptr, &type, (LPBYTE)buf, &sz) == ERROR_SUCCESS && buf[0]) out = buf; RegCloseKey(h); }
  return out;
}
static std::string lower(std::string s) { for (char& c : s) c = (char)tolower((unsigned char)c); return s; }
static void mmScan(std::vector<WheelDev>& found, int& seen) {
  seen = 0; UINT n = std::min<UINT>(joyGetNumDevs(), 16);
  for (UINT id = 0; id < n; id++) {
    JOYINFOEX ji = {}; ji.dwSize = sizeof ji; ji.dwFlags = JOY_RETURNALL; if (joyGetPosEx(id, &ji) != JOYERR_NOERROR) continue;
    JOYCAPSA c = {}; if (joyGetDevCapsA(id, &c, sizeof c) != JOYERR_NOERROR) continue;
    seen++; WheelDev d; d.mmId = (int)id; d.name = oemName(c); d.axes = (int)c.wNumAxes; d.buttons = (int)c.wNumButtons; d.pov = (c.wCaps & JOYCAPS_HASPOV) != 0; d.axName = AXN_MM;
    bool dup = false; for (auto& f : found) if (f.di && lower(f.name) == lower(d.name)) dup = true;       // already read through DirectInput
    if (dup || (int)found.size() >= FAKE_ID) continue;
    d.id = (int)found.size();
    const UINT mn[6] = { c.wXmin, c.wYmin, c.wZmin, c.wRmin, c.wUmin, c.wVmin }, mx[6] = { c.wXmax, c.wYmax, c.wZmax, c.wRmax, c.wUmax, c.wVmax };
    const bool has[6] = { true, true, (c.wCaps & JOYCAPS_HASZ) != 0, (c.wCaps & JOYCAPS_HASR) != 0, (c.wCaps & JOYCAPS_HASU) != 0, (c.wCaps & JOYCAPS_HASV) != 0 };
    for (int a = 0; a < 6; a++) { d.mn[a] = (float)mn[a]; d.mx[a] = (float)mx[a]; d.has[a] = has[a] && mx[a] > mn[a]; }
    found.push_back(d);
  }
}

void WheelInput::scan(bool force) {
  std::vector<WheelDev> found; std::string dn; int mmSeen = 0;
  diScan(found, hwnd, dn); mmScan(found, mmSeen);
  if (fakeOn) { WheelDev d; d.id = FAKE_ID; d.name = "Test wheel (simulated)"; d.axes = 6; d.buttons = 32; d.pov = true; d.axName = AXN_MM; for (int a = 0; a < 6; a++) { d.has[a] = true; d.mx[a] = 1; } found.push_back(d); }
  devices = found;
  status = "DirectInput: " + dn + ". Windows joystick API: " + (mmSeen ? std::to_string(mmSeen) + " found" : std::string("none")) + ".";
  std::string sig; for (auto& d : devices) sig += d.name + "|" + std::to_string(d.axes) + "|" + std::to_string(d.buttons) + ";";
  if (report && (force || sig != lastSig)) { lastSig = sig; writeReport(); }
}

void WheelInput::writeReport() const {
  FILE* f = fopen("sunset_wheel_report.txt", "w"); if (!f) return;
  fprintf(f, "Sunset City: what the game can see of your wheel and pedals\n%s\n\n", status.c_str());
  if (devices.empty()) fprintf(f, "No controllers found.\n\n");
  for (const WheelDev& d : devices) {
    fprintf(f, "Controller %d: %s%s\n  read through: %s\n  axes:", d.id + 1, d.name.c_str(), d.id == FAKE_ID ? " (simulated)" : "", d.di ? "DirectInput" : "Windows joystick API");
    for (int a = 0; a < 8; a++) if (d.has[a]) fprintf(f, " %s", d.axName ? d.axName[a] : "?");
    fprintf(f, "   buttons: %d   hat: %s\n  now:", d.buttons, d.pov ? "yes" : "no");
    const Sample& s = dev[d.id]; for (int a = 0; a < 8; a++) if (d.has[a]) fprintf(f, " %s=%.3f", d.axName ? d.axName[a] : "?", s.ax[a]);
    fprintf(f, "\n  buttons down:"); for (int b = 0; b < 64; b++) if ((s.btn >> b) & 1ull) fprintf(f, " %d", b + 1); fprintf(f, "\n\n");
  }
  if (S) fprintf(f, "Steering: %s\nThrottle: %s\nBrake: %s\n", describe(S->steer).c_str(), describe(S->throttle).c_str(), describe(S->brake).c_str());
  fclose(f);
}

void WheelInput::fake(const float ax[6], unsigned long long btn, int pov) {
  fakeOn = true; Sample& s = fakeS; s.ok = true; for (int a = 0; a < 6; a++) s.ax[a] = ax[a]; s.ax[6] = s.ax[7] = 0.5f; s.btn = btn; s.pov = pov; if (!dev[FAKE_ID].ok) dev[FAKE_ID] = fakeS;
  bool listed = false; for (auto& d : devices) if (d.id == FAKE_ID) listed = true; if (!listed) scan();
}

void WheelInput::poll(double dt) {
  for (int d = 0; d < MAXDEV; d++) { prevBtn[d] = dev[d].btn; prevPov[d] = dev[d].pov; }
  scanT -= dt; if (scanT <= 0) { scan(); scanT = devices.empty() ? 5.0 : 10.0; }       // not too often: looking for devices can take a moment
  for (int d = 0; d < FAKE_ID; d++) dev[d].ok = false;
  for (const WheelDev& wd : devices) {
    if (wd.id == FAKE_ID) { dev[FAKE_ID] = fakeS; dev[FAKE_ID].ok = fakeOn; continue; }              // the simulated device reports what the test last set, seen at the next poll
    Sample& s = dev[wd.id];
    auto norm = [&](int a, double v) { return wd.has[a] ? (float)std::fmax(0.0, std::fmin(1.0, (v - wd.mn[a]) / (wd.mx[a] - wd.mn[a]))) : 0.5f; };
    if (wd.di) {
      DIJOYSTATE2 js; if (!diRead((IDirectInputDevice8A*)wd.h, js)) { s.ok = false; scanT = std::min(scanT, 1.0); continue; }
      const double v[8] = { (double)js.lX, (double)js.lY, (double)js.lZ, (double)js.lRx, (double)js.lRy, (double)js.lRz, (double)js.rglSlider[0], (double)js.rglSlider[1] };
      s.ok = true; for (int a = 0; a < 8; a++) s.ax[a] = norm(a, v[a]);
      s.btn = 0; for (int b = 0; b < 64; b++) if (js.rgbButtons[b] & 0x80) s.btn |= 1ull << b;
      s.pov = LOWORD(js.rgdwPOV[0]) == 0xFFFF ? -1 : (int)(js.rgdwPOV[0] / 100);
    } else {
      JOYINFOEX ji = {}; ji.dwSize = sizeof ji; ji.dwFlags = JOY_RETURNALL;
      if (joyGetPosEx((UINT)wd.mmId, &ji) != JOYERR_NOERROR) { s.ok = false; scanT = std::min(scanT, 1.0); continue; }
      const DWORD v[6] = { ji.dwXpos, ji.dwYpos, ji.dwZpos, ji.dwRpos, ji.dwUpos, ji.dwVpos };
      s.ok = true; for (int a = 0; a < 6; a++) s.ax[a] = norm(a, (double)v[a]); s.ax[6] = s.ax[7] = 0.5f;
      s.btn = ji.dwButtons; s.pov = (ji.dwPOV == JOY_POVCENTERED || ji.dwPOV > 36000) ? -1 : (int)(ji.dwPOV / 100);
    }
  }
}

// --- What the wheel is saying ------------------------------------------------------------------------------------------
float WheelInput::steerValue() const {
  const AxisBind& b = S->steer; if (!have(b)) return 0;
  float t = rawOf(b) - b.rest, dR = b.full - b.rest, dL = b.other - b.rest, n = 0;
  if (t * dR > 0) n = dR != 0 ? t / dR : 0; else if (t * dL > 0) n = dL != 0 ? -(t / dL) : 0;
  float a = std::fmin(1.0f, std::fabs(n)); a = std::fmax(0.0f, (a - S->steerDead) / (1.0f - S->steerDead)); a = std::pow(a, S->steerLin);
  return n < 0 ? -std::fmin(1.0f, a * S->steerSens) : std::fmin(1.0f, a * S->steerSens);
}
float WheelInput::pedal(const AxisBind& b) const {
  if (!have(b) || b.full == b.rest) return 0;
  float n = std::fmax(0.0f, std::fmin(1.0f, (rawOf(b) - b.rest) / (b.full - b.rest)));
  n = std::fmax(0.0f, (n - S->pedalDead) / (1.0f - S->pedalDead)); return std::pow(n, S->pedalCurve);
}
bool WheelInput::held(int act) const { int i = S->btn[act]; if (i < 0) return false; int d = i >> 6, b = i & 63; return d < MAXDEV && dev[d].ok && ((dev[d].btn >> b) & 1ull); }
bool WheelInput::pressed(int act) const { int i = S->btn[act]; if (i < 0) return false; int d = i >> 6, b = i & 63; return held(act) && !((prevBtn[d] >> b) & 1ull); }

std::string WheelInput::deviceName(int id) const { for (auto& d : devices) if (d.id == id) return d.name; return "device " + std::to_string(id + 1); }
std::string WheelInput::axisName(const AxisBind& b) const {
  for (auto& d : devices) if (d.id == b.dev && d.axName && b.axis >= 0 && b.axis < 8) return d.axName[b.axis];
  static const char* nm[8] = { "X", "Y", "Z", "R", "U", "V", "-", "-" }; return b.axis >= 0 && b.axis < 8 ? nm[b.axis] : "?";
}
std::string WheelInput::describe(const AxisBind& b) const {
  if (!b.valid()) return "not set"; std::string s = deviceName(b.dev) + ", axis " + axisName(b); if (!have(b)) s += " (not connected)"; return s;
}
std::string WheelInput::describeButton(int act) const {
  int i = S->btn[act]; if (i < 0) return "not set"; std::string s = "button " + std::to_string((i & 63) + 1); if (devices.size() > 1) s += " on " + deviceName(i >> 6); return s;
}

// --- Into the game --------------------------------------------------------------------------------------------------------
void WheelInput::apply(InputState& s, bool inMenu) {
  if (!S || !S->wheelOn || binding != NONE) return;
  if (inMenu) {
    for (int d = 0; d < MAXDEV; d++) if (dev[d].ok && dev[d].pov != prevPov[d] && dev[d].pov >= 0) {
      int p = dev[d].pov; if (p >= 315 || p < 45) s.up = true; else if (p < 135) s.right = true; else if (p < 225) s.down = true; else s.left = true; }
    if (pressed(ACT_SELECT)) s.enter = true; if (pressed(ACT_MENU)) s.menu = true; return;
  }
  if (have(S->steer)) { float v = steerValue(); if (v != 0) { s.steer = v; s.analog = true; } }
  float g = throttleValue(), b = brakeValue(); if (g > s.gas) s.gas = g; if (b > s.brake) s.brake = b;
  if (held(ACT_HANDBRAKE)) s.handbrake = true; if (held(ACT_NITRO)) s.nitro = true; if (held(ACT_FIRE)) s.fire = true;
  if (pressed(ACT_SHIFTUP)) s.shiftUp = true; if (pressed(ACT_SHIFTDOWN)) s.shiftDown = true; if (pressed(ACT_CAMERA)) s.cam = true; if (pressed(ACT_RESET)) s.reset = true; if (pressed(ACT_MENU)) s.menu = true;
  if (pressed(ACT_MISSILE)) s.missile = true; if (pressed(ACT_BOMB)) s.bomb = true; if (pressed(ACT_OIL)) s.oil = true; if (pressed(ACT_SMOKE)) s.smoke = true; if (pressed(ACT_SHIELD)) s.shield = true;
}

// --- The binding wizard ------------------------------------------------------------------------------------------------------
void WheelInput::finish(const std::string& msg) {
  Bind was = binding; binding = NONE; notice = msg; noticeT = 4.0; progress = 0; prompt.clear(); if (S && saveOnFinish) S->save();
  if (chain) { if (was == STEER_RIGHT) startBind(THROTTLE); else if (was == THROTTLE) startBind(BRAKE); else { chain = false; notice = "All set. " + msg; } }
}
void WheelInput::cancelBind() { if (binding == NONE) return; binding = NONE; chain = false; prompt.clear(); progress = 0; notice = "Cancelled."; noticeT = 2.5; }
void WheelInput::prepare(const char* wait, const char* go) { waitText = wait; goText = go; t = 0; stableT = 0; snapped = false; locked = false; progress = 0; prompt = wait; }
void WheelInput::startSetupAll() { chain = true; startBind(STEER_LEFT); if (binding == NONE) chain = false; }

void WheelInput::startBind(Bind what, int act) {
  if (devices.empty()) scan(true);
  if (devices.empty()) { binding = NONE; chain = false; notice = "No wheel found. Plug it in, then pick \"Look for controllers again\"."; noticeT = 6.0; return; }
  binding = what; bindAct = act; notice.clear();
  switch (what) {
    case STEER_LEFT: prepare("Hold the wheel straight ahead...", "Now turn the wheel all the way to the LEFT and hold it there."); break;
    case STEER_RIGHT: prepare("Let go and bring it back to straight...", "Now turn the wheel all the way to the RIGHT and hold it there."); break;
    case THROTTLE: prepare("Take your foot off all the pedals...", "Now press the THROTTLE pedal all the way down and hold it."); break;
    case BRAKE: prepare("Take your foot off all the pedals...", "Now press the BRAKE pedal all the way down and hold it."); break;
    case BUTTON: { static std::string tmp; tmp = std::string("Press the button for: ") + ACT_NAMES[act]; prepare("Let go of every button...", tmp.c_str()); break; }
    default: binding = NONE; break;
  }
}

void WheelInput::updateBind(double dt) {
  if (noticeT > 0) noticeT -= dt;
  if (binding == NONE || !S) return;
  t += dt; const float THR = 0.28f;
  if (!snapped) {                                                                       // a moment to let go of everything, then remember how things rest
    if (t < 1.1) { progress = 0; return; }
    for (int d = 0; d < MAXDEV; d++) { for (int a = 0; a < NAX; a++) snapAx[d][a] = dev[d].ax[a]; snapBtn[d] = dev[d].btn; }
    snapped = true; t = 0; stableT = 0; locked = false; prompt = goText; return;
  }
  if (t > 30.0) { cancelBind(); notice = "Nothing moved, so nothing was set. Is the wheel plugged in?"; noticeT = 5; return; }
  if (binding == BUTTON) {
    for (int d = 0; d < MAXDEV; d++) if (dev[d].ok) { snapBtn[d] &= dev[d].btn; unsigned long long newly = dev[d].btn & ~snapBtn[d]; if (newly) {      // a button that was still held when we started counts again once it has been let go
      int bit = 0; while (!((newly >> bit) & 1ull)) bit++;
      int code = d * 64 + bit; for (int& other : S->btn) if (other == code) other = -1; S->btn[bindAct] = code; finish(std::string(ACT_NAMES[bindAct]) + ": button " + std::to_string(bit + 1) + "."); return; } }
    return;
  }
  // an axis: find the one that moved the most, wait until it stays still while held there
  auto allowed = [&](int d, int a, float delta) {
    if (!dev[d].ok) return false;
    const AxisBind& st = S->steer, &th = S->throttle;
    if (binding == STEER_RIGHT) return d == st.dev && a == st.axis && delta * (st.other - st.rest) < 0;          // the opposite direction on the same axis
    if (binding == STEER_LEFT) return true;
    if (st.valid() && d == st.dev && a == st.axis) return false;                                                  // not the wheel itself
    if (binding == BRAKE && th.valid() && d == th.dev && a == th.axis) return delta * (th.full - th.rest) < 0;  // pedals sharing one axis: the other way
    return true;
  };
  if (!locked) {
    float best = THR; for (int d = 0; d < MAXDEV; d++) for (int a = 0; a < NAX; a++) { float delta = dev[d].ax[a] - snapAx[d][a]; if (std::fabs(delta) > best && allowed(d, a, delta)) { best = std::fabs(delta); lockDev = d; lockAxis = a; locked = true; } }
    if (locked) { lastV = dev[lockDev].ax[lockAxis]; stableT = 0; }
    progress = 0; return;
  }
  float v = dev[lockDev].ax[lockAxis], rest = snapAx[lockDev][lockAxis];
  if (std::fabs(v - lastV) < 0.012f) stableT += dt; else { stableT = 0; lastV = v; }
  if (std::fabs(v - rest) < THR * 0.7f) { locked = false; progress = 0; return; }                            // let go: look again
  progress = (float)std::fmin(1.0, stableT / 0.5); if (stableT < 0.5) return;
  AxisBind b; b.dev = lockDev; b.axis = lockAxis; b.rest = rest;
  switch (binding) {
    case STEER_LEFT: b.other = v; b.full = rest + (rest - v); S->steer = b; startBind(STEER_RIGHT); break;
    case STEER_RIGHT: S->steer.full = v; finish("Steering set: " + describe(S->steer) + "."); break;
    case THROTTLE: b.full = v; S->throttle = b; finish("Throttle set: " + describe(b) + "."); break;
    case BRAKE: { b.full = v; bool shared = S->throttle.valid() && S->throttle.dev == b.dev && S->throttle.axis == b.axis; S->brake = b; finish(std::string("Brake set: ") + describe(b) + (shared ? " (shares the axis with the throttle)." : ".")); break; }
    default: break;
  }
}

// --- A test that needs no wheel ---------------------------------------------------------------------------------------------
int wheelSelfTest() {
  int fails = 0; auto check = [&](bool ok, const char* what) { logf("%s: %s", ok ? "PASS" : "FAIL", what); if (!ok) fails++; };
  auto closeTo = [](float a, float b, float tol = 0.03f) { return std::fabs(a - b) <= tol; };
  {   // a wheel on X, pedals on Z and R that read 1.0 at rest and 0.0 when pressed (the way many wheels report them)
    Settings S; WheelInput w; w.S = &S; w.saveOnFinish = false; float ax[6] = { 0.5f, 0.5f, 1.0f, 1.0f, 0.5f, 0.5f }; w.fake(ax, 0);
    auto run = [&](double secs) { for (double t = 0; t < secs; t += 1.0 / 60.0) { w.poll(1.0 / 60.0); w.updateBind(1.0 / 60.0); } };
    run(0.1);
    w.startBind(WheelInput::STEER_LEFT); run(1.5); ax[0] = 0.1f; w.fake(ax, 0); run(1.2);
    check(w.binding == WheelInput::STEER_RIGHT && S.steer.axis == 0 && closeTo(S.steer.other, 0.1f), "steering: left extreme found on axis X");
    ax[0] = 0.5f; w.fake(ax, 0); run(1.5); ax[0] = 0.9f; w.fake(ax, 0); run(1.2);
    check(w.binding == WheelInput::NONE && closeTo(S.steer.full, 0.9f) && closeTo(S.steer.rest, 0.5f), "steering: right extreme found, wizard finished");
    ax[0] = 0.5f; w.fake(ax, 0); w.poll(0.01); check(closeTo(w.steerValue(), 0.0f, 0.001f), "steering: centre is zero");
    ax[0] = 0.9f; w.fake(ax, 0); w.poll(0.01); check(closeTo(w.steerValue(), 1.0f, 0.001f), "steering: full right is +1");
    ax[0] = 0.1f; w.fake(ax, 0); w.poll(0.01); check(closeTo(w.steerValue(), -1.0f, 0.001f), "steering: full left is -1");
    ax[0] = 0.7f; w.fake(ax, 0); w.poll(0.01); check(w.steerValue() > 0.4f && w.steerValue() < 0.55f, "steering: halfway is about half");
    ax[0] = 0.5f; w.fake(ax, 0); w.startBind(WheelInput::THROTTLE); run(1.5); ax[2] = 0.0f; w.fake(ax, 0); run(1.0);
    check(w.binding == WheelInput::NONE && S.throttle.axis == 2 && closeTo(S.throttle.rest, 1.0f) && closeTo(S.throttle.full, 0.0f), "throttle: an inverted pedal axis is found and its rest value learned");
    ax[2] = 1.0f; w.fake(ax, 0); w.poll(0.01); check(w.throttleValue() == 0.0f, "throttle: released reads zero");
    ax[2] = 0.5f; w.fake(ax, 0); w.poll(0.01); check(closeTo(w.throttleValue(), 0.5f, 0.03f), "throttle: half pressed reads half");
    ax[2] = 1.0f; w.fake(ax, 0); w.startBind(WheelInput::BRAKE); run(1.5); ax[3] = 0.0f; w.fake(ax, 0); run(1.0);
    check(S.brake.axis == 3 && closeTo(S.brake.full, 0.0f), "brake: found on its own axis");
    ax[2] = 0.0f; ax[3] = 1.0f; w.fake(ax, 0); w.poll(0.01); InputState in; w.apply(in, false); check(in.gas > 0.95 && in.brake == 0, "apply: throttle down gives gas only");
    ax[2] = 1.0f; ax[3] = 0.0f; w.fake(ax, 0); w.poll(0.01); InputState in2; w.apply(in2, false); check(in2.brake > 0.95 && in2.gas == 0, "apply: brake down gives brake only");
    ax[0] = 0.8f; ax[3] = 1.0f; w.fake(ax, 0); w.poll(0.01); InputState in3; in3.steer = -1; w.apply(in3, false); check(in3.steer > 0.5 && in3.analog, "apply: the wheel overrides the keyboard and marks the steering analog");
    w.startBind(WheelInput::BUTTON, ACT_HANDBRAKE); run(1.5); w.fake(ax, 1ull << 4); run(0.2);
    check(S.btn[ACT_HANDBRAKE] == FAKE_ID * 64 + 4 && w.held(ACT_HANDBRAKE), "button: bound and held");
    w.startBind(WheelInput::BUTTON, ACT_NITRO); run(1.5); w.fake(ax, 0); run(0.2); w.fake(ax, 1ull << 4); run(0.2);
    check(S.btn[ACT_NITRO] == FAKE_ID * 64 + 4 && S.btn[ACT_HANDBRAKE] == -1, "button: binding a used button moves it");
    w.fake(ax, 0); w.poll(0.01); w.fake(ax, 1ull << 4); w.poll(0.01); check(w.pressed(ACT_NITRO), "button: a press is seen once");
    w.poll(0.01); check(!w.pressed(ACT_NITRO) && w.held(ACT_NITRO), "button: and then only held");
    w.fake(ax, 0); w.poll(0.01); w.startBind(WheelInput::BUTTON, ACT_CAMERA); run(1.5); w.fake(ax, 1ull << 40); run(0.2);
    check(S.btn[ACT_CAMERA] == FAKE_ID * 64 + 40 && w.held(ACT_CAMERA), "button: numbers above 32 work (wheels with many buttons)");
    w.fake(ax, 0); w.poll(0.01); w.startBind(WheelInput::STEER_LEFT); run(0.3); w.cancelBind(); check(w.binding == WheelInput::NONE, "wizard: can be cancelled");
  }
  {   // one pass through steering, throttle and brake
    Settings S; WheelInput w; w.S = &S; w.saveOnFinish = false; float ax[6] = { 0.5f, 0.5f, 1.0f, 1.0f, 0.5f, 0.5f }; w.fake(ax, 0);
    auto run = [&](double secs) { for (double t = 0; t < secs; t += 1.0 / 60.0) { w.poll(1.0 / 60.0); w.updateBind(1.0 / 60.0); } };
    run(0.1); w.startSetupAll(); run(1.5); ax[0] = 0.05f; w.fake(ax, 0); run(1.0); ax[0] = 0.5f; w.fake(ax, 0); run(1.5); ax[0] = 0.95f; w.fake(ax, 0); run(1.0);
    check(w.binding == WheelInput::THROTTLE && S.steer.valid() && closeTo(S.steer.full, 0.95f), "set up everything: steering done, throttle asked for next");
    ax[0] = 0.5f; w.fake(ax, 0); run(1.5); ax[2] = 0.0f; w.fake(ax, 0); run(1.0);
    check(w.binding == WheelInput::BRAKE && S.throttle.axis == 2, "set up everything: throttle done, brake asked for next");
    ax[2] = 1.0f; w.fake(ax, 0); run(1.5); ax[3] = 0.0f; w.fake(ax, 0); run(1.0);
    check(w.binding == WheelInput::NONE && S.brake.axis == 3 && S.steer.valid() && S.throttle.valid(), "set up everything: all three set, wizard ends");
  }
  {   // a wheel with its pedals on the extra axes (Rx, Ry, sliders)
    Settings S; WheelInput w; w.S = &S; w.saveOnFinish = false; float ax[6] = { 0.5f, 0.5f, 0.5f, 1.0f, 1.0f, 0.5f }; w.fake(ax, 0);
    auto run = [&](double secs) { for (double t = 0; t < secs; t += 1.0 / 60.0) { w.poll(1.0 / 60.0); w.updateBind(1.0 / 60.0); } };
    run(0.1); w.startBind(WheelInput::THROTTLE); run(1.5); ax[4] = 0.0f; w.fake(ax, 0); run(1.0);
    check(S.throttle.axis == 4 && closeTo(S.throttle.full, 0.0f), "throttle: found on a higher axis");
  }
  {   // no controller at all: the wizard says so straight away instead of waiting
    Settings S; WheelInput w; w.S = &S; w.saveOnFinish = false; w.startBind(WheelInput::THROTTLE);
    check(!w.devices.empty() || (w.binding == WheelInput::NONE && !w.notice.empty()), "no controller: the wizard does not wait for nothing");
  }
  {   // pedals that share one axis: throttle one way, brake the other (the default of several wheels)
    Settings S; WheelInput w; w.S = &S; w.saveOnFinish = false; float ax[6] = { 0.5f, 0.5f, 0.5f, 0.5f, 0.5f, 0.5f }; w.fake(ax, 0);
    auto run = [&](double secs) { for (double t = 0; t < secs; t += 1.0 / 60.0) { w.poll(1.0 / 60.0); w.updateBind(1.0 / 60.0); } };
    run(0.1); w.startBind(WheelInput::THROTTLE); run(1.5); ax[1] = 0.0f; w.fake(ax, 0); run(1.0);
    check(S.throttle.axis == 1 && closeTo(S.throttle.full, 0.0f) && closeTo(S.throttle.rest, 0.5f), "shared axis: throttle found");
    ax[1] = 0.5f; w.fake(ax, 0); w.startBind(WheelInput::BRAKE); run(1.5); ax[1] = 0.0f; w.fake(ax, 0); run(1.5);
    check(w.binding == WheelInput::BRAKE, "shared axis: pressing the throttle again is not taken for the brake");
    ax[1] = 1.0f; w.fake(ax, 0); run(1.2);
    check(w.binding == WheelInput::NONE && S.brake.axis == 1 && closeTo(S.brake.full, 1.0f), "shared axis: the other direction is the brake");
    ax[1] = 0.25f; w.fake(ax, 0); w.poll(0.01); check(closeTo(w.throttleValue(), 0.5f, 0.03f) && w.brakeValue() == 0.0f, "shared axis: a quarter turn up is half throttle");
    ax[1] = 0.75f; w.fake(ax, 0); w.poll(0.01); check(closeTo(w.brakeValue(), 0.5f, 0.03f) && w.throttleValue() == 0.0f, "shared axis: a quarter turn down is half brake");
  }
  {   // settings survive a save and a load
    Settings a; a.steer = { 3, 0, 0.5f, 0.95f, 0.05f }; a.throttle = { 3, 2, 1.0f, 0.0f, 0 }; a.btn[ACT_NITRO] = 70; a.steerSens = 1.7f; a.vsync = true; a.msaa = 2; a.day = 0; a.save("selftest_settings.tmp");
    Settings b; b.load("selftest_settings.tmp"); remove("selftest_settings.tmp");
    check(b.steer.dev == 3 && closeTo(b.steer.full, 0.95f, 0.001f) && b.throttle.axis == 2 && b.btn[ACT_NITRO] == 70 && closeTo(b.steerSens, 1.7f, 0.001f) && b.vsync && b.msaa == 2 && b.day == 0, "settings: saved and loaded back");
    FILE* f = fopen("selftest_old.tmp", "w"); if (f) { fprintf(f, "vsync 1\nsteer 0 0 0.5 1 0\nbtn4 33\n"); fclose(f); }
    Settings c; c.load("selftest_old.tmp"); remove("selftest_old.tmp");
    check(c.vsync && !c.steer.valid() && c.btn[4] == -1, "settings: wheel setup from the old numbering is dropped, the rest kept");
  }
  logf("wheel self-test: %d failure(s)", fails); return fails;
}
