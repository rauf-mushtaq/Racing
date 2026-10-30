#include "music.h"
#include "gfx.h"
#include <windows.h>
#include <mmsystem.h>
#include <shellapi.h>
#include <algorithm>
#include <cstdio>

static const char* ALIAS = "sunsetmusic";
static bool mci(const std::string& cmd, std::string* reply = nullptr) {
  char buf[128] = {}; MCIERROR e = mciSendStringA(cmd.c_str(), buf, sizeof buf, nullptr);
  if (e != 0) { char msg[160] = {}; mciGetErrorStringA(e, msg, sizeof msg); logf("music: \"%s\" failed: %s", cmd.c_str(), msg); return false; }
  if (reply) *reply = buf; return true;
}
static std::string lower(std::string s) { for (char& c : s) c = (char)tolower((unsigned char)c); return s; }

void Music::scan() {
  tracks.clear(); if (dir.empty()) return; WIN32_FIND_DATAA fd; HANDLE h = FindFirstFileA((dir + "\\*.*").c_str(), &fd); if (h == INVALID_HANDLE_VALUE) return;
  do { if (fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) continue; std::string n = fd.cFileName, l = lower(n); size_t dot = l.find_last_of('.'); if (dot == std::string::npos) continue; std::string ext = l.substr(dot + 1);
    if (ext == "mp3" || ext == "wav" || ext == "wma" || ext == "mid" || ext == "midi" || ext == "m4a" || ext == "aac") tracks.push_back(n); } while (FindNextFileA(h, &fd));
  FindClose(h); std::sort(tracks.begin(), tracks.end(), [](const std::string& a, const std::string& b) { return lower(a) < lower(b); });
  logf("music: %zu file(s) in %s", tracks.size(), dir.c_str());
}
std::string Music::pick(const std::string& preferred) const {
  if (tracks.empty()) return ""; for (const auto& t : tracks) if (t == preferred) return t;
  for (const auto& t : tracks) { std::string l = lower(t); if (l.find("bond") != std::string::npos || l.find("007") != std::string::npos) return t; }
  return tracks[0];
}
bool Music::open(const std::string& name) {
  std::string path = dir + "\\" + name, l = lower(name), type; size_t dot = l.find_last_of('.'); std::string ext = dot == std::string::npos ? "" : l.substr(dot + 1);
  type = ext == "wav" ? " type waveaudio" : (ext == "mid" || ext == "midi") ? " type sequencer" : " type mpegvideo";
  if (!mci("open \"" + path + "\"" + type + " alias " + ALIAS)) return false;
  mci(std::string("set ") + ALIAS + " time format milliseconds"); isOpen = true; paused = false; lastVolume = -1; openName = name; logf("music: opened %s", name.c_str()); return true;
}
void Music::close() { if (!isOpen) return; mciSendStringA((std::string("stop ") + ALIAS).c_str(), nullptr, 0, nullptr); mciSendStringA((std::string("close ") + ALIAS).c_str(), nullptr, 0, nullptr); isOpen = false; paused = false; openName.clear(); }
Music::~Music() { close(); }

void Music::update(double dt, Want want, int volume, const std::string& preferred) {
  std::string name = pick(preferred);
  if (want == STOP || name.empty()) { close(); return; }
  if (isOpen && openName != name) close();                                          // another track was chosen
  if (!isOpen) {
    if (failedName == name) return;                                                  // do not keep trying a file that would not open
    if (!open(name)) { failedName = name; return; }
    failedName.clear(); mci(std::string("play ") + ALIAS + " from 0");
  }
  if (volume != lastVolume) { mci(std::string("setaudio ") + ALIAS + " volume to " + std::to_string(volume * 10)); lastVolume = volume; }
  if (want == PAUSE && !paused) { mci(std::string("pause ") + ALIAS); paused = true; }
  else if (want == PLAY && paused) { mci(std::string("resume ") + ALIAS); paused = false; }
  pollT -= dt; if (pollT <= 0 && !paused) { pollT = 0.5; std::string mode; if (mci(std::string("status ") + ALIAS + " mode", &mode) && mode == "stopped") mci(std::string("play ") + ALIAS + " from 0"); }   // loop
}
void Music::openFolder() const { if (!dir.empty()) ShellExecuteA(nullptr, "open", dir.c_str(), nullptr, nullptr, SW_SHOWNORMAL); }
