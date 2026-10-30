#include "wheel.h"
#include "game.h"
#include <windows.h>
#include <mmsystem.h>
#include <cmath>
#include <cstdio>

static const char* AXN[6] = { "X", "Y", "Z", "R", "U", "V" };
static const int FAKE_ID = 15;

static std::string oemName(const JOYCAPSA& c) {                    // the name Windows shows in "Set up USB game controllers"
  char key[256]; snprintf(key, sizeof key, "System\\CurrentControlSet\\Control\\MediaProperties\\PrivateProperties\\Joystick\\OEM\\%s", c.szRegKey);
  HKEY h; std::string out = c.szPname;
  if (RegOpenKeyExA(HKEY_CURRENT_USER, key, 0, KEY_READ, &h) == ERROR_SUCCESS) { char buf[128] = {}; DWORD sz = sizeof buf - 1, type = 0; if (RegQueryValueExA(h, "OEMName", nullptr, &type, (LPBYTE)buf, &sz) == ERROR_SUCCESS && buf[0]) out = buf; RegCloseKey(h); }
  return out;
}

void WheelInput::scan() {
  std::vector<WheelDev> found; UINT n = std::min<UINT>(joyGetNumDevs(), FAKE_ID);
  for (UINT id = 0; id < n; id++) {
    JOYINFOEX ji = {}; ji.dwSize = sizeof ji; ji.dwFlags = JOY_RETURNALL; if (joyGetPosEx(id, &ji) != JOYERR_NOERROR) continue;
    JOYCAPSA c = {}; if (joyGetDevCapsA(id, &c, sizeof c) != JOYERR_NOERROR) continue;
    WheelDev d; d.id = (int)id; d.name = oemName(c); d.axes = (int)c.wNumAxes; d.buttons = (int)c.wNumButtons; d.pov = (c.wCaps & JOYCAPS_HASPOV) != 0;
    const UINT mn[6] = { c.wXmin, c.wYmin, c.wZmin, c.wRmin, c.wUmin, c.wVmin }, mx[6] = { c.wXmax, c.wYmax, c.wZmax, c.wRmax, c.wUmax, c.wVmax };
    const bool has[6] = { true, true, (c.wCaps & JOYCAPS_HASZ) != 0, (c.wCaps & JOYCAPS_HASR) != 0, (c.wCaps & JOYCAPS_HASU) != 0, (c.wCaps & JOYCAPS_HASV) != 0 };
    for (int a = 0; a < 6; a++) { d.mn[a] = (float)mn[a]; d.mx[a] = (float)mx[a]; d.has[a] = has[a] && mx[a] > mn[a]; }
    found.push_back(d);
  }
  if (fakeOn) { WheelDev d; d.id = FAKE_ID; d.name = "Test wheel (simulated)"; d.axes = 6; d.buttons = 32; d.pov = true; for (int a = 0; a < 6; a++) { d.has[a] = true; d.mx[a] = 1; } found.push_back(d); }
  devices = found;
}

void WheelInput::fake(const float ax[6], unsigned btn, int pov) {
  fakeOn = true; Sample& s = fakeS; s.ok = true; for (int a = 0; a < 6; a++) s.ax[a] = ax[a]; s.btn = btn; s.pov = pov; if (!dev[FAKE_ID].ok) dev[FAKE_ID] = fakeS;
  bool listed = false; for (auto& d : devices) if (d.id == FAKE_ID) listed = true; if (!listed) scan();
}

void WheelInput::poll(double dt) {
  for (int d = 0; d < MAXDEV; d++) { prevBtn[d] = dev[d].btn; prevPov[d] = dev[d].pov; }
  scanT -= dt; if (scanT <= 0) { scan(); scanT = devices.empty() ? 5.0 : 10.0; }       // not too often: looking for devices can take a moment
  for (int d = 0; d < FAKE_ID; d++) dev[d].ok = false;
  for (const WheelDev& wd : devices) {
    if (wd.id == FAKE_ID) { dev[FAKE_ID] = fakeS; dev[FAKE_ID].ok = fakeOn; continue; }              // the simulated device reports what the test last set, seen at the next poll
    JOYINFOEX ji = {}; ji.dwSize = sizeof ji; ji.dwFlags = JOY_RETURNALL; Sample& s = dev[wd.id];
    if (joyGetPosEx((UINT)wd.id, &ji) != JOYERR_NOERROR) { s.ok = false; scanT = 0; continue; }
    const DWORD v[6] = { ji.dwXpos, ji.dwYpos, ji.dwZpos, ji.dwRpos, ji.dwUpos, ji.dwVpos };
    s.ok = true; for (int a = 0; a < 6; a++) s.ax[a] = wd.has[a] ? std::fmax(0.0f, std::fmin(1.0f, ((float)v[a] - wd.mn[a]) / (wd.mx[a] - wd.mn[a]))) : 0.5f;
    s.btn = ji.dwButtons; s.pov = (ji.dwPOV == JOY_POVCENTERED || ji.dwPOV > 36000) ? -1 : (int)(ji.dwPOV / 100);
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
bool WheelInput::held(int act) const { int i = S->btn[act]; if (i < 0) return false; int d = i >> 5, b = i & 31; return d < MAXDEV && dev[d].ok && ((dev[d].btn >> b) & 1u); }
bool WheelInput::pressed(int act) const { int i = S->btn[act]; if (i < 0) return false; int d = i >> 5, b = i & 31; return held(act) && !((prevBtn[d] >> b) & 1u); }

std::string WheelInput::deviceName(int id) const { for (auto& d : devices) if (d.id == id) return d.name; return "device " + std::to_string(id + 1); }
std::string WheelInput::describe(const AxisBind& b) const {
  if (!b.valid()) return "not set"; std::string s = deviceName(b.dev) + ", axis " + AXN[b.axis]; if (!have(b)) s += " (not connected)"; return s;
}
std::string WheelInput::describeButton(int act) const {
  int i = S->btn[act]; if (i < 0) return "not set"; std::string s = "button " + std::to_string((i & 31) + 1); if (!devices.empty() && devices.size() > 1) s += " on " + deviceName(i >> 5); return s;
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
void WheelInput::finish(const std::string& msg) { binding = NONE; notice = msg; noticeT = 4.0; progress = 0; prompt.clear(); if (S && saveOnFinish) S->save(); }
void WheelInput::cancelBind() { if (binding == NONE) return; binding = NONE; prompt.clear(); progress = 0; notice = "Cancelled."; noticeT = 2.5; }
void WheelInput::prepare(const char* wait, const char* go) { waitText = wait; goText = go; t = 0; stableT = 0; snapped = false; locked = false; progress = 0; prompt = wait; }

void WheelInput::startBind(Bind what, int act) {
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
    for (int d = 0; d < MAXDEV; d++) { for (int a = 0; a < 6; a++) snapAx[d][a] = dev[d].ax[a]; snapBtn[d] = dev[d].btn; }
    snapped = true; t = 0; stableT = 0; locked = false; prompt = goText; return;
  }
  if (t > 25.0) { cancelBind(); notice = "Nothing moved, so nothing was set. Is the wheel plugged in?"; noticeT = 4; return; }
  if (binding == BUTTON) {
    for (int d = 0; d < MAXDEV; d++) if (dev[d].ok) { snapBtn[d] &= dev[d].btn; unsigned newly = dev[d].btn & ~snapBtn[d]; if (newly) {      // a button that was still held when we started counts again once it has been let go
      int bit = 0; while (!((newly >> bit) & 1u)) bit++;
      int code = d * 32 + bit; for (int& other : S->btn) if (other == code) other = -1; S->btn[bindAct] = code; finish(std::string(ACT_NAMES[bindAct]) + ": button " + std::to_string(bit + 1) + "."); return; } }
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
    float best = THR; for (int d = 0; d < MAXDEV; d++) for (int a = 0; a < 6; a++) { float delta = dev[d].ax[a] - snapAx[d][a]; if (std::fabs(delta) > best && allowed(d, a, delta)) { best = std::fabs(delta); lockDev = d; lockAxis = a; locked = true; } }
    if (locked) { lastV = dev[lockDev].ax[lockAxis]; stableT = 0; }
    progress = 0; return;
  }
  float v = dev[lockDev].ax[lockAxis], rest = snapAx[lockDev][lockAxis];
  if (std::fabs(v - lastV) < 0.006f) stableT += dt; else { stableT = 0; lastV = v; }
  if (std::fabs(v - rest) < THR * 0.7f) { locked = false; progress = 0; return; }                            // let go: look again
  progress = (float)std::fmin(1.0, stableT / 0.6); if (stableT < 0.6) return;
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
    w.startBind(WheelInput::BUTTON, ACT_HANDBRAKE); run(1.5); w.fake(ax, 1u << 4); run(0.2);
    check(S.btn[ACT_HANDBRAKE] == FAKE_ID * 32 + 4 && w.held(ACT_HANDBRAKE), "button: bound and held");
    w.startBind(WheelInput::BUTTON, ACT_NITRO); run(1.5); w.fake(ax, 0); run(0.2); w.fake(ax, 1u << 4); run(0.2);
    check(S.btn[ACT_NITRO] == FAKE_ID * 32 + 4 && S.btn[ACT_HANDBRAKE] == -1, "button: binding a used button moves it");
    w.fake(ax, 0); w.poll(0.01); w.fake(ax, 1u << 4); w.poll(0.01); check(w.pressed(ACT_NITRO), "button: a press is seen once");
    w.poll(0.01); check(!w.pressed(ACT_NITRO) && w.held(ACT_NITRO), "button: and then only held");
    w.fake(ax, 0); w.poll(0.01); w.startBind(WheelInput::STEER_LEFT); run(0.3); w.cancelBind(); check(w.binding == WheelInput::NONE, "wizard: can be cancelled");
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
  }
  logf("wheel self-test: %d failure(s)", fails); return fails;
}
