// Sunset City (Unreal Engine 5): the police. Crimes add heat; heat shows as one to five stars; while the player is out of sight it cools. What the stars ask for: how many officers on foot,
// how many police cars, how hard they try. (The same idea as the web version's chase; the numbers are the guesses of the web version, not measured.)
#pragma once
#include "SCMath.h"

namespace SC {

enum class Crime : int { Assault = 0, Gunshot, KnockedSomeoneDown, HitACar, KilledSomeone, Robbery };
struct Wanted {
  double heat = 0, unseen = 0, grace = 0, assaultN = 0, assaultT = -99, clock = 0; bool seen = false;
  int Stars() const { return heat <= 0.001 ? 0 : std::min(5, int(std::ceil(heat))); }
  bool Active() const { return heat > 0.001; }
  int WantedOfficers() const { return Stars() == 0 ? 0 : std::min(8, Stars() * 2); }
  int WantedCars() const { int s = Stars(); return s <= 1 ? 0 : std::min(4, s - 1); }
  // Something the player did (the police are told). One punch on a stranger is a scuffle nobody reports; a second within half a minute, or a blade, is assault.
  void Commit(Crime c, double amount = 1.0) {
    if (clock < grace) return;
    switch (c) {
      case Crime::Assault: if (clock - assaultT > 30) assaultN = 0; assaultT = clock; assaultN += amount; if (assaultN >= 2.0) { assaultN = 0; Add(0.9); } else if (Active()) Add(0.04 * amount); break;
      case Crime::Gunshot: Add(Active() ? 0.1 : 1.0); break;
      case Crime::KnockedSomeoneDown: Add(0.6); break;
      case Crime::HitACar: Add(0.4); break;
      case Crime::KilledSomeone: Add(1.5); break;
      case Crime::Robbery: Add(2.2 * amount); break;
    }
  }
  void Add(double a) { heat = std::min(5.99, heat + a); unseen = 0; }
  // Each tick: `inSight` is whether any officer can see the player. Hidden for long enough and the heat falls; at nothing the police give up (and leave the player alone for a moment).
  void Update(double dt, bool inSight) {
    clock += dt; seen = inSight;
    if (inSight) { unseen = 0; return; }
    unseen += dt; if (unseen > 10) heat = std::max(0.0, heat - dt * 0.06);
    if (heat <= 0.001 && unseen > 0) { heat = 0; }
  }
  void Clear(double graceSecs = 12) { heat = 0; unseen = 0; grace = clock + graceSecs; }
};

}  // namespace SC
