#include "settings.h"
#include <cstdio>
#include <cstdlib>
#include <cstring>

const char* const ACT_NAMES[ACT_COUNT] = { "Handbrake", "Shift up", "Shift down", "Camera", "Nitro", "Back on the road", "Menu", "Menu: select", "Machine guns", "Missile", "Bomb", "Oil slick", "Smoke screen", "Armour plate" };

void Settings::clearWheel() {
  steer = AxisBind(); throttle = AxisBind(); brake = AxisBind(); for (int& b : btn) b = -1;
  steerSens = 1.0f; steerLin = 1.0f; steerDead = 0.02f; pedalDead = 0.03f; pedalCurve = 1.0f;
}

bool Settings::load(const char* path) {
  FILE* f = fopen(path, "r"); if (!f) return false; char line[256];
  auto ax = [](AxisBind& a, const char* s) { sscanf(s, "%d %d %f %f %f", &a.dev, &a.axis, &a.rest, &a.full, &a.other); };
  while (fgets(line, sizeof line, f)) {
    char key[64]; char* val = line; if (sscanf(line, "%63s", key) != 1) continue; val += strlen(key); while (*val == ' ') val++;
    int i = 0; float x = 0;
    if (!strcmp(key, "vsync")) vsync = atoi(val) != 0; else if (!strcmp(key, "ao")) ao = atoi(val) != 0; else if (!strcmp(key, "shadows")) shadows = atoi(val) != 0;
    else if (!strcmp(key, "reflections")) reflections = atoi(val) != 0; else if (!strcmp(key, "msaa")) { msaa = atoi(val); if (msaa != 1 && msaa != 2 && msaa != 4) msaa = 4; }
    else if (!strcmp(key, "day")) day = atoi(val) != 0 ? 1 : 0; else if (!strcmp(key, "traffic")) { traffic = atoi(val); if (traffic < 0 || traffic > 3) traffic = 2; }
    else if (!strcmp(key, "wheelOn")) wheelOn = atoi(val) != 0;
    else if (!strcmp(key, "music")) { music = atoi(val); if (music < 0 || music > 2) music = 1; } else if (!strcmp(key, "volume")) { volume = atoi(val); if (volume < 0 || volume > 100) volume = 70; }
    else if (!strcmp(key, "track")) { musicTrack = val; while (!musicTrack.empty() && (musicTrack.back() == '\n' || musicTrack.back() == '\r')) musicTrack.pop_back(); }
    else if (!strcmp(key, "steer")) ax(steer, val); else if (!strcmp(key, "throttle")) ax(throttle, val); else if (!strcmp(key, "brake")) ax(brake, val);
    else if (!strcmp(key, "steerSens")) { x = (float)atof(val); if (x >= 0.3f && x <= 4.0f) steerSens = x; } else if (!strcmp(key, "steerLin")) { x = (float)atof(val); if (x >= 0.5f && x <= 2.5f) steerLin = x; }
    else if (!strcmp(key, "steerDead")) { x = (float)atof(val); if (x >= 0 && x <= 0.4f) steerDead = x; } else if (!strcmp(key, "pedalDead")) { x = (float)atof(val); if (x >= 0 && x <= 0.4f) pedalDead = x; }
    else if (!strcmp(key, "pedalCurve")) { x = (float)atof(val); if (x >= 0.5f && x <= 2.5f) pedalCurve = x; }
    else if (!strncmp(key, "btn", 3)) { i = atoi(key + 3); if (i >= 0 && i < ACT_COUNT) btn[i] = atoi(val); }
  }
  fclose(f); return true;
}

void Settings::save(const char* path) const {
  FILE* f = fopen(path, "w"); if (!f) return;
  fprintf(f, "music %d\nvolume %d\ntrack %s\n", music, volume, musicTrack.c_str());
  fprintf(f, "vsync %d\nao %d\nshadows %d\nreflections %d\nmsaa %d\nday %d\ntraffic %d\nwheelOn %d\n", vsync, ao, shadows, reflections, msaa, day, traffic, wheelOn);
  auto ax = [&](const char* k, const AxisBind& a) { fprintf(f, "%s %d %d %.5f %.5f %.5f\n", k, a.dev, a.axis, a.rest, a.full, a.other); };
  ax("steer", steer); ax("throttle", throttle); ax("brake", brake);
  fprintf(f, "steerSens %.3f\nsteerLin %.3f\nsteerDead %.3f\npedalDead %.3f\npedalCurve %.3f\n", steerSens, steerLin, steerDead, pedalDead, pedalCurve);
  for (int i = 0; i < ACT_COUNT; i++) fprintf(f, "btn%d %d\n", i, btn[i]);
  fclose(f);
}
