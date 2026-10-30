// Background music: plays an audio file the player has put in the music folder (MP3, WAV, WMA ...) through the Windows media control interface,
// looped, with a volume, and paused while the menu is open. The game ships no music of its own.
#pragma once
#include <string>
#include <vector>

class Music {
public:
  enum Want { STOP, PLAY, PAUSE };
  std::vector<std::string> tracks;                       // file names found in the folder
  std::string dir;
  void setFolder(const std::string& d) { dir = d; scan(); }
  void scan();
  std::string pick(const std::string& preferred) const;  // the file that will play: the preferred one if it exists, else one with "bond" or "007" in its name, else the first
  void update(double dt, Want want, int volume, const std::string& preferred);
  void openFolder() const;
  ~Music();
private:
  bool isOpen = false, paused = false; int lastVolume = -1; double pollT = 0; std::string openName, failedName;
  bool open(const std::string& name); void close();
};
