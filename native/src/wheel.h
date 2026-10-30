// Steering wheels, pedals and other joysticks. Two ways to read them: DirectInput (what wheels like the Logitech G29 are built for: eight axes
// including sliders, up to 64 buttons) and the older Windows multimedia joystick API as a fallback. Nothing has to be configured by hand: in the
// settings screen you move the wheel or press the pedal and the game finds the axis itself, including pedals that read backwards and pedals that
// share one axis. Force feedback is not supported yet.
#pragma once
#include "settings.h"
#include <string>
#include <vector>

struct InputState;

struct WheelDev {
  int id = 0;                                           // the slot the game uses (bindings point at this)
  int mmId = -1;                                        // the Windows joystick number, for devices read through the multimedia API
  std::string name; int axes = 0, buttons = 0; bool pov = false, di = false; bool has[8] = {}; float mn[8] = {}, mx[8] = {};
  const char* const* axName = nullptr; void* h = nullptr;   // axis labels; the DirectInput device
};

class WheelInput {
public:
  static const int MAXDEV = 16, NAX = 8;
  struct Sample { bool ok = false; float ax[8] = {}; unsigned long long btn = 0; int pov = -1; };   // axes 0..1, buttons as a bit mask, hat in degrees or -1
  Settings* S = nullptr; void* hwnd = nullptr;          // the game window (DirectInput needs one)
  std::vector<WheelDev> devices; Sample dev[MAXDEV]; unsigned long long prevBtn[MAXDEV] = {}; int prevPov[MAXDEV];
  std::string status;                                   // what each API reported at the last scan, for the settings page
  bool report = false;                                  // write sunset_wheel_report.txt whenever the list of controllers changes (the game turns this on)
  WheelInput() { for (int& p : prevPov) p = -1; }

  void poll(double dt);                                 // read every connected device (rescans for new ones every couple of seconds)
  void scan(bool force = false);
  void apply(InputState& s, bool inMenu);               // merge the wheel into this frame's input (or, in the menus, the hat and a select button)
  void writeReport() const;
  // What the wheel is saying now, after the mapping.
  bool have(const AxisBind& b) const { return b.valid() && b.dev < MAXDEV && b.axis < NAX && dev[b.dev].ok; }
  float rawOf(const AxisBind& b) const { return dev[b.dev].ax[b.axis]; }
  float steerValue() const;                             // -1 full left .. +1 full right
  float throttleValue() const { return pedal(S->throttle); }
  float brakeValue() const { return pedal(S->brake); }
  bool held(int act) const; bool pressed(int act) const;
  std::string deviceName(int id) const;
  std::string axisName(const AxisBind& b) const;
  std::string describe(const AxisBind& b) const;        // "Logitech G29, axis X" or "not set"
  std::string describeButton(int act) const;

  // The binding wizard: asks for one movement and watches for it.
  enum Bind { NONE, STEER_LEFT, STEER_RIGHT, THROTTLE, BRAKE, BUTTON };
  Bind binding = NONE; int bindAct = 0; std::string prompt, notice; float progress = 0; double noticeT = 0;
  void startBind(Bind what, int act = 0); void cancelBind(); void updateBind(double dt);
  void startSetupAll();                                 // steering (left, right), throttle and brake one after the other
  // Testing without hardware: pretend a device (id 15) is plugged in and set what it reports.
  void fake(const float ax[6], unsigned long long btn, int pov = -1); bool fakeOn = false, saveOnFinish = true;

private:
  float pedal(const AxisBind& b) const;
  Sample fakeS;
  double scanT = 0, t = 0, stableT = 0; bool snapped = false, locked = false, chain = false; int lockDev = -1, lockAxis = -1; float lastV = 0, snapAx[MAXDEV][8] = {}; unsigned long long snapBtn[MAXDEV] = {};
  std::string lastSig = "?";                            // what the last report was written for
  void finish(const std::string& msg);
  void prepare(const char* wait, const char* go);
  const char* waitText = ""; const char* goText = "";
};

int wheelSelfTest();   // runs the mapping and the setup wizard against a simulated device; returns the number of failures (--selftest-wheel)
