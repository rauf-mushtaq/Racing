// Sunset City (Unreal Engine 5): what people do. The pedestrians stroll round the pavement loops; a few of them are armed and a few are big, muscular men, and hit one and he is
// a fighter: the same behaviour as the web version (src/brawl.js), written so that it can be tested without the engine. A brain is given what its person can see this tick
// (where it is, where the player is, whether it can see him) and answers with what to do (which way to walk, whether to aim, shoot or swing); the Unreal side does the moving and the
// drawing and tells the brain when it has been hurt.
#pragma once
#include "SCCityPlan.h"
#include "SCRig.h"
#include <array>

namespace SC {

enum class Archetype : int { Civilian = 0, Armed, Bruiser, Enforcer, Cop };
inline const char* ArchetypeName(Archetype a) { switch (a) { case Archetype::Armed: return "armed"; case Archetype::Bruiser: return "bruiser"; case Archetype::Enforcer: return "enforcer"; case Archetype::Cop: return "cop"; default: return "civilian"; } }

struct BlowDef { double dur, hit, reach, dmg, knock; Blow pose; };
inline BlowDef BlowOf(int which) {                                // 0 jab, 1 cross, 2 haymaker (a long wind-up, and it knocks you down)
  static const BlowDef d[3] = {{0.34, 0.42, 150, 7, 0, Blow::Jab}, {0.42, 0.45, 160, 12, 0, Blow::Cross}, {0.70, 0.58, 175, 20, 1, Blow::Hook}};
  return d[which < 0 ? 0 : which > 2 ? 2 : which];
}
struct Stats { double hp = 100, walk = 140, run = 520; bool gun = false, flees = false, stagger = false; double walletLo = 0, walletHi = 0, bulk = 0; double gunDamage = 3.6, gunGap = 0.5, burstPause0 = 1.3, burstPause1 = 2.3, accuracy = 0.4; int burst = 2, mag = 8; double reload = 1.8; };
inline Stats StatsOf(Archetype a) {
  Stats s;
  switch (a) {
    case Archetype::Civilian: s.hp = 40; s.flees = true; break;
    case Archetype::Armed: s.hp = 62; s.gun = true; s.flees = true; s.stagger = true; s.walletLo = 40; s.walletHi = 180; s.run = 540; break;
    case Archetype::Bruiser: s.hp = 190; s.walletLo = 120; s.walletHi = 320; s.bulk = 1; s.run = 590; break;
    case Archetype::Enforcer: s.hp = 150; s.gun = true; s.walletLo = 200; s.walletHi = 520; s.bulk = 0.85; s.run = 570; break;
    case Archetype::Cop: s.hp = 80; s.gun = true; s.gunDamage = 4.6; s.gunGap = 0.36; s.burst = 3; s.burstPause0 = 1.0; s.burstPause1 = 1.9; s.accuracy = 0.5; s.mag = 12; s.run = 560; break;
  }
  return s;
}

struct BrainIn {
  double dt = 1.0 / 60; V3 self; double selfYaw = 0; V3 target;                      // the player
  bool targetDown = false, targetCrouch = false, targetInside = false, targetInCar = false; double targetSpeed = 0; bool los = true;
};
struct BrainOut {
  V3 move{0, 0, 0}; double speed = 0; bool sprint = false;
  bool face = false; double faceYaw = 0;                    // turn to this heading
  bool aiming = false; double aimPitch = 0; bool crouch = false;
  bool fired = false, shotHits = false; double shotDamage = 0, shotSpread = 0; bool firstShot = false;
  Blow blow = Blow::None; double blowK = 0; bool blowLanded = false; double blowDamage = 0; bool knockdown = false; V3 blowDir{0, 0, 0};
  bool reloading = false; double reloadK = 0;
  bool drawing = false; double drawK = 0;
  bool arresting = false;                                   // a police officer holding the player
  bool remove = false;                                      // gone: take the person away
};
enum class BState : int { Draw = 0, Fight, Flee, Leave, Ko, Dead };

class Brain {
 public:
  Archetype kind; Stats st; double hp; BState state = BState::Draw; Rng rng;
  double t = 0, drawT = 0.7, cd = 0.3, stun = 0, fleeT = 0, strafeT = 1, koT = 0, goneT = 0, leaveT = 0, fireT = 0.8, reloadT = 0, reloadTotal = 1, hurtT = 99, seen = 0;
  int shots = 0, mag = 8, combo = 0, strafe = 1; bool fired = false, paid = false, wantFire = false; double wallet = 0;
  // the blow being thrown
  bool swinging = false; BlowDef blow{}; double blowT = 0; bool blowDone = false; int blowKind = 0;
  V3 lastSeen{0, 0, 0}; V3 hitDir{0, 1, 0}; double arrestT = 0; bool rush = false;

  Brain(Archetype k, uint32_t seed) : kind(k), st(StatsOf(k)), hp(st.hp), rng(seed) { mag = st.mag; drawT = 0.55 + rng.R(0, 0.25); strafe = rng.Chance(0.5) ? 1 : -1; fireT = 0.7 + rng.R(0, 0.5); rush = k == Archetype::Cop && rng.Chance(0.35); }
  bool Alive() const { return state != BState::Dead && state != BState::Ko; }
  bool IsKo() const { return state == BState::Ko; }
  bool IsDead() const { return state == BState::Dead; }

  // Hurt (a punch, a kick, a blade, a bullet, a car). Returns true when this is the blow that finishes him.
  bool Hit(double dmg, bool gun = false, bool blade = false, double knock = 0, bool head = false, V3 dir = {0, 1, 0}, bool car = false) {
    if (!Alive()) return false;
    hp -= dmg * (head ? 1.7 : 1.0); hurtT = 0; hitDir = dir; if (state == BState::Draw) state = BState::Fight;
    if (knock >= 0.9 && st.stagger && hp > 0) { stun = 0.9; CancelBlow(); }
    else if (dmg >= 12 && hp > 0 && !gun) { stun = std::max(stun, st.stagger ? 0.5 : 0.28); if (stun > 0.4) CancelBlow(); }
    if (hp <= 0) { hp = 0; CancelBlow(); fleeT = 0; bool lethal = gun || blade || car; state = lethal ? BState::Dead : BState::Ko; koT = 5 + rng.R(0, 2); goneT = 0;
      if (!paid && st.walletHi > 0) { paid = true; wallet = std::round((st.walletLo + rng.F() * (st.walletHi - st.walletLo)) / 5.0) * 5.0; } return true; }
    if (st.flees && !fleeT && hp < st.hp * 0.3 && rng.Chance(0.6)) { fleeT = 6 + rng.R(0, 3); CancelBlow(); }
    return false;
  }
  void CancelBlow() { swinging = false; }

  // One tick of thinking.
  BrainOut Update(const BrainIn& in) {
    BrainOut o; t += in.dt; hurtT += in.dt; stun = std::max(0.0, stun - in.dt);
    if (state == BState::Dead) { goneT += in.dt; if (goneT > 9) o.remove = true; return o; }
    if (state == BState::Ko) { koT -= in.dt; if (koT <= 0) { state = BState::Leave; leaveT = 0; } return o; }
    V3 d3 = in.target - in.self; double dx = d3.x, dy = d3.y, d = std::max(1e-3, std::hypot(dx, dy)); double yaw = std::atan2(dy, dx); V3 to{dx / d, dy / d, 0};
    const bool away = in.targetInside || in.targetInCar;
    if (away || state == BState::Leave) {                                                          // lost interest: wander off, then go
      leaveT += in.dt; if (leaveT > (away ? 8 : 6)) { o.remove = true; return o; }
      if (state == BState::Leave && !away) { o.move = to * -1.0; o.speed = st.walk; }
      return o;
    }
    if (in.los || d < 600) { lastSeen = in.target; seen = 0; } else seen += in.dt;
    if (state == BState::Draw) {
      drawT -= in.dt; o.drawing = true; o.drawK = Saturate(1.0 - drawT / 0.7); o.face = true; o.faceYaw = yaw; o.aiming = false;
      if (drawT <= 0) state = BState::Fight;
      return o;
    }
    bool reloading = reloadT > 0;
    if (st.gun && reloadT > 0) { reloadT -= in.dt; o.reloading = true; o.reloadK = Saturate(1 - reloadT / reloadTotal); if (reloadT <= 0) mag = st.mag; }
    V3 target = lastSeen; double tdx = target.x - in.self.x, tdy = target.y - in.self.y, td = std::max(1e-3, std::hypot(tdx, tdy)); V3 toTarget{tdx / td, tdy / td, 0};
    bool sprint = false; double move = 0; V3 dir = toTarget; double side = 0;
    if (state == BState::Flee || fleeT > 0) { fleeT -= in.dt; move = 1; sprint = true; dir = to * -1.0; if (fleeT <= 0) { state = BState::Leave; leaveT = 0; } state = fleeT > 0 ? BState::Flee : state; }
    else if (stun > 0) move = 0;
    else if (kind == Archetype::Armed) {
      if (!in.los && seen > 1.2) move = 1;
      else if (reloading) { move = 0; o.crouch = true; }
      else if (d > 1500) { move = 1; sprint = d > 2600; }
      else if (d < 550) { move = 0.8; dir = to * -1.0; }
      else { strafeT -= in.dt; if (strafeT <= 0) { strafe = -strafe; strafeT = 1 + rng.R(0, 2); } side = 0.35 * strafe; }
    } else if (kind == Archetype::Cop) {
      if (rush) { if (d > 150) { move = 1; sprint = d > 1500; } }
      else if (!in.los && seen > 1.5) move = 1;
      else if (reloading) { move = 0; o.crouch = true; }
      else if (d > 2400) move = 1;
      else if (d < 950) { move = 0.7; dir = to * -1.0; }
      else { strafeT -= in.dt; if (strafeT <= 0) { strafe = -strafe; strafeT = 1 + rng.R(0, 2.5); } side = 0.3 * strafe; }
    } else if (kind == Archetype::Enforcer) { if (d > 140) { move = 1; sprint = d > 1400 && !wantFire; } }
    else { if (d > 135) { move = 1; sprint = d > 500; } else { strafeT -= in.dt; if (strafeT <= 0) { strafe = -strafe; strafeT = 0.8 + rng.R(0, 1.6); } side = 0.25 * strafe; } }   // the bruiser: straight at you
    // The gun.
    bool aim = false;
    if (st.gun) {
      aim = fleeT <= 0 && stun <= 0 && in.los && d < 4000 && !reloading && (kind == Archetype::Armed || kind == Archetype::Cop || d > 220) && !(kind == Archetype::Cop && rush && d < 300);
      o.aiming = aim; o.aimPitch = Clamp(std::atan2(in.target.z - in.self.z, std::max(d, 200.0)), -0.8, 0.8); o.face = aim; o.faceYaw = yaw;
      if (aim) {
        fireT -= in.dt; wantFire = true;
        if (fireT <= 0) {
          o.fired = true; o.firstShot = !fired; fired = true; mag--;
          double p = st.accuracy - d / 8000.0 - (in.targetCrouch ? 0.1 : 0) - std::min(0.18, in.targetSpeed / 100.0 * 0.035); p = Clamp(p, 0.05, 0.6) * (t < 1.6 ? 0.5 : 1.0);
          o.shotHits = rng.F() < p; o.shotDamage = st.gunDamage; o.shotSpread = 70 + rng.R(0, 110);
          if (mag <= 0) { reloadT = reloadTotal = st.reload * (0.9 + rng.R(0, 0.3)); shots = 0; fireT = 0.3; }
          else if (++shots % st.burst == 0) fireT = Lerp(st.burstPause0, st.burstPause1, rng.F()); else fireT = st.gunGap;
        }
      } else wantFire = false;
    }
    // Fists: the bruiser, the enforcer once he is on you, and a rushing officer who has got hold of you.
    if ((!st.gun || kind == Archetype::Enforcer) && stun <= 0 && fleeT <= 0 && kind != Archetype::Cop) Fists(in, d, yaw, o);
    // Arrest: an officer right beside a player who is not running.
    if (kind == Archetype::Cop) { if (d < 280 && in.targetSpeed < 300 && !in.targetDown) { arrestT += in.dt; o.arresting = true; } else arrestT = std::max(0.0, arrestT - in.dt * 2); }
    // Out: how to move.
    V3 sd{-toTarget.y, toTarget.x, 0}; o.move = dir * move + sd * side; double ml = Len(o.move); if (ml > 1e-6) o.move = o.move * (1.0 / ml);
    o.speed = ml > 1e-6 ? (sprint ? st.run : st.walk * 1.8) : 0; if (swinging) o.speed *= 0.4; o.sprint = sprint;
    if (!o.face && (swinging || move > 0)) { o.face = true; o.faceYaw = swinging ? yaw : std::atan2(o.move.y, o.move.x); }
    if (swinging) { o.blow = blow.pose; o.blowK = Saturate(blowT / blow.dur); }
    return o;
  }

 private:
  void Fists(const BrainIn& in, double d, double yaw, BrainOut& o) {
    cd = std::max(0.0, cd - in.dt);
    if (swinging) {
      blowT += in.dt; double k = Saturate(blowT / blow.dur); o.blow = blow.pose; o.blowK = k;
      if (!blowDone && k >= blow.hit) {
        blowDone = true; double ang = std::fabs(WrapAngle(std::atan2(in.target.y - in.self.y, in.target.x - in.self.x) - yaw));
        if (d <= blow.reach + 20 && ang < 0.9 && !in.targetDown) { o.blowLanded = true; o.blowDamage = blow.dmg * (in.targetCrouch ? 0.7 : 1.0); o.knockdown = blow.knock > 0; o.blowDir = {std::cos(yaw), std::sin(yaw), 0}; }
      }
      if (k >= 1) { swinging = false; cd = blowKind == 0 ? 0.2 + rng.R(0, 0.25) : 0.65 + rng.R(0, 0.6); }
      return;
    }
    if (cd <= 0 && d <= 175 && !in.targetDown) {
      int pick = combo == 1 ? 1 : std::array<int, 5>{0, 0, 1, 1, 2}[rng.I(5)]; blowKind = pick; blow = BlowOf(pick); combo = pick == 0 ? 1 : 0; swinging = true; blowT = 0; blowDone = false;
    }
  }
};

// A person strolling round a loop on the pavement.
struct Stroll {
  WalkLoop loop; double s = 0, speed = 140; int dir = 1; double idleT = 0; bool idle = false; Rng rng{1};
  void Update(double dt) {
    if (loop.length <= 0) return;
    if (idle) { idleT -= dt; if (idleT <= 0) idle = false; return; }
    if (rng.F() < dt * 0.02) { idle = true; idleT = 2 + rng.R(0, 6); return; }
    s += dir * speed * dt;
  }
  V2 Pos(V2* heading = nullptr) const { V2 h{1, 0}; V2 p = loop.At(s, &h); if (heading) *heading = dir > 0 ? h : V2{-h.x, -h.y}; return p; }
};

}  // namespace SC
