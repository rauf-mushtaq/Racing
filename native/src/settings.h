// What the player has chosen: graphics options and the steering wheel / pedals setup. Saved in sunset_native_settings.txt next to the game.
#pragma once
#include <string>

// Things a wheel button can do (the same names appear in the settings screen).
enum Act { ACT_HANDBRAKE, ACT_SHIFTUP, ACT_SHIFTDOWN, ACT_CAMERA, ACT_NITRO, ACT_RESET, ACT_MENU, ACT_SELECT, ACT_FIRE, ACT_MISSILE, ACT_BOMB, ACT_OIL, ACT_SMOKE, ACT_SHIELD, ACT_COUNT };
extern const char* const ACT_NAMES[ACT_COUNT];

// One axis of one joystick device, and what its raw value (0..1) was when it was at rest and when it was pushed all the way.
// A steering wheel uses rest = straight ahead, full = turned right, other = turned left.
struct AxisBind {
  int dev = -1, axis = -1; float rest = 0.5f, full = 1.0f, other = 0.0f;
  bool valid() const { return dev >= 0 && axis >= 0; }
};

struct Settings {
  // graphics
  bool vsync = false, ao = true, shadows = true, reflections = true; int msaa = 4; int day = 1;   // day: 1 midday, 0 golden hour
  int traffic = 2;
  int music = 1, volume = 70; std::string musicTrack;       // music: 0 off, 1 during the police chase, 2 always; the file name in the music folder (empty = pick one)
  // steering wheel and pedals
  bool wheelOn = true; int wheelVer = 2;                   // wheelVer: which numbering the saved bindings use (1 was the first release, whose devices and buttons are numbered differently)
  AxisBind steer, throttle, brake;
  int btn[ACT_COUNT];                                      // device * 64 + button, or -1 for none
  float steerSens = 1.0f, steerLin = 1.0f, steerDead = 0.02f, pedalDead = 0.03f, pedalCurve = 1.0f;

  Settings() { for (int& b : btn) b = -1; }
  void clearWheel();
  bool load(const char* path = "sunset_native_settings.txt");
  void save(const char* path = "sunset_native_settings.txt") const;
};
