// Pulled over. Something small (hitting a car, smashing a bin or a lamp post, knocking someone down with the car, beating someone up) no longer brings
// every police car in the city: one patrol car is sent, lights on. When it reaches you it signals you to pull over (on foot: to stay where you are).
// Stop, and it parks behind you and an officer walks up to your window. For something small it is a ticket, paid from your money there and then; for
// something worse, or with a record, or with a bag of stolen money in the car, or with no money to pay the fine (or refusing to), it is an arrest: out
// of the car, hands up, cuffs, and a few days in the cells (jail.js). Drive off, run, hit the officer, ram the patrol car or fire a gun, and the patrol
// car calls everyone: a chase with the whole force (police.js), as before.
//
//   respond   the patrol car is on its way (it knows where you are: the call gave your description)
//   signal    it is behind you, lights and siren: pull over (stop, and stay stopped) or stand still
//   park      you have stopped: it pulls in behind you
//   approach  the officer gets out and walks up to your window (or to you)
//   talk      what you did, then the ticket or the arrest: pay (or refuse), or go quietly
//   cuff      hands up, the officer behind you, the cuffs
//   leave     a ticket paid: the officer walks back, and the car drives off with its lights out
//   fled      it went wrong: the officer runs back to the car, which joins the chase
import { Walker } from './walker.js';
import { clamp, wrapAngle } from './util.js';

export const OFFENCES = {
  car:     { name: 'CARELESS DRIVING', why: 'You hit another car back there.', fine: 250, pts: 1 },
  break:   { name: 'CRIMINAL DAMAGE', why: 'You smashed up the street back there.', fine: 400, pts: 1 },
  ped:     { name: 'DANGEROUS DRIVING', why: 'You knocked a pedestrian down.', fine: 1200, pts: 2 },
  assault: { name: 'ASSAULT', why: 'You were seen beating someone up.', fine: 900, pts: 2 },
  loot:    { name: 'HANDLING STOLEN MONEY', why: 'And what is this bag of cash?', fine: 0, pts: 4 },
  refuse:  { name: 'REFUSING TO PAY A FINE', why: '', fine: 0, pts: 1 },
};
const ARREST_AT = 4;                                // the points (what you did, and your record) at which it is an arrest instead of a ticket
const TOO_MUCH = 7;                                 // and at which the patrol car stops being enough: everyone is called
const NOINP = { mx: 0, my: 0, sprint: false, jump: false, crouch: false };

// What a stop comes to: the charges, the points, the fine (if it is a fine) and the days (if it is an arrest).
export function verdictFor(charges, record = {}, cash = 0, loot = 0) {
  const list = Object.entries(charges).filter(([k, n]) => n > 0 && OFFENCES[k]).map(([k, n]) => ({ kind: k, n, ...OFFENCES[k] }));
  if (loot > 0 && !charges.loot) list.push({ kind: 'loot', n: 1, ...OFFENCES.loot });
  const priors = (record.arrests || 0) + 0.5 * (record.fines || 0);
  let pts = 0, fine = 0; for (const c of list) { pts += c.pts * Math.min(c.n, 3); fine += c.fine * Math.min(c.n, 3); }
  pts += Math.min(3, priors * 0.5);
  fine = Math.round(fine * (1 + 0.15 * Math.min(4, priors)) / 10) * 10;
  const arrest = pts >= ARREST_AT || (fine > 0 && cash < fine) || fine === 0;
  const days = clamp(Math.round(1 + pts * 0.7), 2, 7);
  return { list, pts, fine, arrest, days, broke: !(pts >= ARREST_AT) && fine > 0 && cash < fine };
}

export class TrafficStop {
  // env: { scene, police, walker, car, audio, toast(text, secs), settings, save(), onFoot(), carried(), obstacles(x, z), traffic,
  //        escalate(kind) (the whole force), arrest(verdict), getOut(), done() }
  constructor(env) {
    this.env = env; this.state = 'idle'; this.t = 0; this.charges = {}; this.c = null; this.off = null; this.offOut = false; this.verdict = null;
    this.stillT = 0; this.runT = 0; this.line = ''; this.hp = 60; this.added = {}; this.clock = 0; this.dead = false; this.spot = null; this._prompt = ''; this.el = null; this.lastSee = 0;
  }
  get active() { return this.state !== 'idle'; }
  get choosing() { return this.state === 'talk' && !!this.verdict; }
  get prompt() { return this._prompt; }
  get points() { return verdictFor(this.charges, this.record).pts; }
  get record() { return this.env.settings.record || (this.env.settings.record = { arrests: 0, fines: 0, days: 0 }); }
  T() { return this.env.onFoot() ? this.env.walker : this.env.car; }
  toast(t, s = 2) { this.env.toast(t, s); }

  // Something small was done: a patrol car is sent (main.js has started the police in their stop mode, with the car as `c`).
  begin(kind, c) {
    this.state = 'respond'; this.t = 0; this.charges = { [kind]: 1 }; this.added = { [kind]: this.clock || 0 }; this.c = c; this.offOut = false; this.verdict = null; this.dead = false; this.hp = 60;
    this.stillT = 0; this.runT = 0; this.lastSee = 0; this.say('');
    if (!this.off) { this.off = new Walker(this.env.scene, ['cop_blue', 'cop_black'][Math.random() < 0.5 ? 0 : 1], { lite: true }); }       // (made now, so the model has loaded by the time the car arrives)
    this.off.show(false); this.off.hands = 0;
    const O = OFFENCES[kind]; this.toast(`${O ? O.name : 'TROUBLE'}: A PATROL CAR IS ON ITS WAY`, 2.6);
    setTimeout(() => { if (this.state === 'respond') this.toast(this.env.onFoot() ? 'WHEN THE POLICE GET HERE, STAY WHERE YOU ARE' : 'WHEN THE POLICE FLASH YOU, PULL OVER (OR RUN FOR IT)', 3); }, 2700);
    this.panel(true);
  }
  // More trouble while the car is on its way (or here).
  add(kind) {
    if (!this.active || this.state === 'fled') return;
    const now = this.clock || 0, last = this.added[kind]; if (last != null && now - last < 5) return; this.added[kind] = now;      // (one smash of several cars is one charge)
    if (this.state === 'leave') { if (this.offOut) { this.off.show(false); this.offOut = false; } if (this.c) { this.c.held = false; this.c.dark = false; } this.state = 'signal'; this.t = 0; this.d0 = 0; this.charges = {}; this.verdict = null; this.panel(true); this.toast('THE OFFICER SAW THAT: PULL OVER', 2); }
    this.charges[kind] = (this.charges[kind] || 0) + 1; const O = OFFENCES[kind];
    if (verdictFor(this.charges, this.record).pts >= TOO_MUCH) { this.escalate('more'); return; }
    if (this.verdict) { this.verdict = this.decide(); this.choice(true); }            // (at the window: it changes what happens)
    if (O) this.toast('AND ' + O.name, 1.4);
  }
  decide() { return verdictFor(this.charges, this.record, this.env.settings.cash || 0, this.env.carried()); }

  // ---- Every frame -------------------------------------------------------------------------------------------------------------------------------
  update(dt) {
    if (!this.active) return;
    const E = this.env, P = E.police, T = this.T(), foot = E.onFoot();
    if (P.stopCar && P.stopCar !== this.c && this.state !== 'fled') this.c = P.stopCar;           // (a new car, if the first crashed on the way)
    const c = this.c;
    this.t += dt; this.clock = (this.clock || 0) + dt;
    if (this.state === 'fled') { this.updateFled(dt); return; }
    if (!c || c.wreck || !P.active) { this.end(!c ? 'no car' : c.wreck ? 'wrecked' : 'police off'); E.done(); return; }
    const dx = T.x - c.x, dz = T.z - c.z, dist = Math.hypot(dx, dz), sp = T.speed || 0;
    const inside = !!E.walker.interior;
    // Hitting the patrol car with your own: that is assault on the police.
    if (P.rammed > 3.5) { this.escalate('ram'); return; }
    // Where the patrol car goes.
    const G = P.stopGoal || (P.stopGoal = { x: 0, z: 0, v: 0, park: false, hold: false });
    G.hold = false; G.park = false; G.respawn = this.state === 'respond';
    if (foot) { const k = dist > 0.1 ? Math.max(0, dist - 9) / dist : 0; G.x = c.x + dx * k; G.z = c.z + dz * k; G.v = 0; }           // (on foot: it pulls up about 9 m short of you)
    else { G.x = T.x - Math.sin(T.h) * 10; G.z = T.z - Math.cos(T.h) * 10; G.v = sp; }                                                // (in a car: 10 m behind you, at your speed)
    P.sirenOn = this.state === 'respond' || this.state === 'signal';
    if (c.sees) this.lastSee = 0; else this.lastSee += dt;

    switch (this.state) {
      case 'respond': {
        this.say(dist < 300 ? `PATROL CAR ${Math.round(dist)} M AWAY` : 'A PATROL CAR IS ON ITS WAY');
        if (inside) { if (this.t > 60) this.giveUp(); break; }                        // (gone into a building before they got here: they wait outside a while)
        if (c.sees && dist < (foot ? 45 : 60)) {
          this.state = 'signal'; this.t = 0; this.stillT = 0; this.runT = 0; this.d0 = dist;
          E.audio.beep && (E.audio.beep(980, 0.09, 0.25), setTimeout(() => E.audio.beep(740, 0.12, 0.25), 120));
          this.toast(foot ? 'POLICE: STAY WHERE YOU ARE' : 'POLICE: PULL OVER', 2.2);
        } else if (this.t > 110 && this.lastSee > 25) this.giveUp();
        break;
      }
      case 'signal': {
        if (inside) { this.escalate('hide'); return; }
        if (foot) {
          this.say('STAY WHERE YOU ARE'); this.meter(0);
          if (sp > 4.4) this.runT += dt; else this.runT = Math.max(0, this.runT - dt * 0.5);
          if ((this.runT > 2.2 && dist > this.d0 + 6) || dist > 75) { this.escalate('run'); return; }
          if (c.speed < 0.6 && dist < 16) this.getOut();
          else if (this.t > 25) this.getOut();
        } else {
          const left = Math.max(0, 15 - this.t); this.say(`PULL OVER: ${Math.ceil(left)} S`); this.meter(1 - left / 15);
          this.stillT = sp < 1.0 ? this.stillT + dt : 0;
          if (this.stillT > 0.8 && dist < 45) { this.state = 'park'; this.t = 0; this.spot = { x: T.x, z: T.z }; this.toast('YOU PULLED OVER: STAY IN THE CAR', 1.8); break; }
          if (this.t > 6 && !this.warned) { this.warned = true; this.toast('PULL OVER NOW', 1.4); }
          if (left <= 0 || dist > 120) { this.escalate('flee'); return; }
        }
        break;
      }
      case 'park': {
        G.x = T.x - Math.sin(T.h) * 8.5; G.z = T.z - Math.cos(T.h) * 8.5; G.v = 0; G.park = true; this.say('THE OFFICER IS PULLING IN BEHIND YOU'); this.meter(0);
        if (sp > 3 || Math.hypot(T.x - this.spot.x, T.z - this.spot.z) > 8) { this.escalate('flee'); return; }
        const near = dist < 24;
        if (near && ((c.speed < 0.6 && Math.hypot(G.x - c.x, G.z - c.z) < 4) || this.t > 7)) this.getOut();
        else if (!near && this.t > 12) { this.state = 'respond'; this.t = 0; }                      // (it lost you on the way in: it comes again)
        break;
      }
      case 'approach': case 'talk': case 'cuff': {
        G.hold = true;
        // Moving off is running.
        if (this.state !== 'cuff') {
          if (!foot && (sp > 2.5 || Math.hypot(T.x - this.spot.x, T.z - this.spot.z) > 6)) { this.escalate('flee'); return; }
          if (foot) { if (sp > 4.4) this.runT += dt; else this.runT = Math.max(0, this.runT - dt * 0.5); if (this.runT > 1.2 || Math.hypot(T.x - this.off.x, T.z - this.off.z) > 16) { this.escalate('run'); return; } }
          if (inside) { this.escalate('hide'); return; }
        }
        this.updateOfficer(dt, T, foot);
        break;
      }
      case 'leave': {
        P.sirenOn = false; c.dark = true; this.say('');
        if (this.offOut) { const door = this.doorOf(c), d = this.walkTo(dt, door.x, door.z, false); if (d < 1.0 || this.t > 9) { this.off.show(false); this.offOut = false; c.held = false; this.t = 0; } }
        else {
          G.x = c.x + Math.sin(c.h) * 60; G.z = c.z + Math.cos(c.h) * 60; G.v = 12;                       // (off along the road, lights out)
          if (dist > 90 || this.t > 10) { this.end('gone'); E.done(); }
        }
        break;
      }
    }
    this._prompt = this.state === 'talk' && this.verdict ? (this.verdict.arrest ? 'GO QUIETLY' : 'PAY $' + this.verdict.fine.toLocaleString('en-US')) : '';
  }

  // The officer steps out of the patrol car's door (the driver's side).
  doorOf(c) { return { x: c.x + Math.cos(c.h) * 1.45 + Math.sin(c.h) * 0.4, z: c.z - Math.sin(c.h) * 1.45 + Math.cos(c.h) * 0.4 }; }
  getOut() {
    const c = this.c, d = this.doorOf(c), T = this.T(); c.held = true;
    this.off.place(d.x, d.z, Math.atan2(T.x - d.x, T.z - d.z)); this.off.hands = 0; this.offOut = true; this.state = 'approach'; this.t = 0; this.runT = 0;
    this.spot = { x: T.x, z: T.z }; this.side = 1; this.best = 1e9; this.bestT = 0;
    this.env.audio.door && this.env.audio.door();
    this.say(this.env.onFoot() ? 'THE OFFICER IS COMING OVER' : 'THE OFFICER IS WALKING UP TO YOUR WINDOW');
  }
  // Walks (or runs) the officer toward a point; returns the distance left.
  walkTo(dt, x, z, run, face = null) {
    const o = this.off, ax = x - o.x, az = z - o.z, d = Math.hypot(ax, az), move = d > 0.3 ? 1 : 0;
    if (!move && face != null) o.h += wrapAngle(face - o.h) * Math.min(1, dt * 6);
    o.update(dt, move ? { mx: -ax / d, my: az / d, sprint: !!run && d > 2, jump: false, crouch: false } : NOINP, 0, this.env.obstacles);
    return d;
  }
  updateOfficer(dt, T, foot) {
    const o = this.off, yaw = Math.atan2(T.x - o.x, T.z - o.z);
    if (o.down > 0.3 || o.ragdoll) { o.update(dt, NOINP, 0, this.env.obstacles); return; }
    if (this.state === 'approach') {
      let tx, tz;
      if (foot) { const ex = o.x - T.x, ez = o.z - T.z, el = Math.hypot(ex, ez) || 1; tx = T.x + ex / el * 1.25; tz = T.z + ez / el * 1.25; }
      else { const k = this.side || 1; tx = T.x + k * Math.cos(T.h) * 1.55 + Math.sin(T.h) * 0.3; tz = T.z - k * Math.sin(T.h) * 1.55 + Math.cos(T.h) * 0.3; }      // (the driver's window; the other one if that side is blocked)
      const d = this.walkTo(dt, tx, tz, false, yaw);
      // Not getting any nearer (a car, a post in the way)? Round to the other side; and after a while he talks from where he is.
      if (d < (this.best ?? 1e9) - 0.3) { this.best = d; this.bestT = this.t; } else if (this.t - (this.bestT || 0) > 2.5 && !foot) { this.side = -(this.side || 1); this.best = 1e9; this.bestT = this.t; }
      if (d < 0.45 || (this.t > 14 && Math.hypot(T.x - o.x, T.z - o.z) < 9)) { this.state = 'talk'; this.t = 0; this.verdict = null; this.say(''); }
      return;
    }
    if (this.state === 'talk') {
      this.walkTo(dt, o.x, o.z, false, yaw);
      const main = Object.keys(this.charges)[0], O = OFFENCES[main];
      if (this.t < 2.4) this.say(foot ? 'OFFICER: Stay right there. Hands where I can see them.' : 'OFFICER: Engine off, please. Licence and registration.');
      else if (this.t < 4.6) this.say('OFFICER: ' + (O ? O.why : 'You know why I stopped you.'));
      else if (!this.verdict) {
        this.verdict = this.decide(); const V = this.verdict;
        if (V.list.some(c => c.kind === 'loot')) this.say('OFFICER: And what is in this bag? That is stolen money. You are under arrest.');
        else if (V.arrest) this.say(V.broke ? `OFFICER: That is a $${V.fine.toLocaleString('en-US')} fine and you cannot pay it. You are under arrest.` : 'OFFICER: That is too much for a ticket. You are under arrest.');
        else this.say(`OFFICER: That is a fixed penalty: $${V.fine.toLocaleString('en-US')}. Pay it now and you can go.`);
        this.choice(true);
      } else if (this.t > 26) {                                                         // (no answer: a fine left unpaid is an arrest; an arrest goes ahead)
        if (this.verdict.arrest) this.goQuietly(); else this.refuse();
      }
      return;
    }
    if (this.state === 'cuff') {
      const P = this.env.walker, bx = P.x - Math.sin(P.h) * 0.6, bz = P.z - Math.cos(P.h) * 0.6;
      const d = this.walkTo(dt, bx, bz, false, Math.atan2(P.x - o.x, P.z - o.z));
      P.hands = Math.min(1, P.hands + dt * 3);
      if (this.t > 1.2 && d < 0.5 && !this.cuffed) { this.cuffed = true; this.cuffT = this.t; this.toast('CUFFED', 1.2); this.env.audio.clang && this.env.audio.clang(1); }
      if ((this.cuffed && this.t > this.cuffT + 1.0) || this.t > 6) { const V = this.verdict; this.end('arrested'); this.env.arrest(V); }
    }
  }
  // At the window: pay the fine, or go quietly (the use button does whichever is offered).
  use() {
    if (!this.choosing) return false;
    if (this.verdict.arrest) this.goQuietly(); else this.pay(); return true;
  }
  pay() {
    const V = this.verdict, S = this.env.settings; if (!V || V.arrest) return;
    if ((S.cash || 0) < V.fine) { this.verdict = this.decide(); this.choice(true); return; }
    S.cash = (S.cash || 0) - V.fine; this.record.fines = (this.record.fines || 0) + 1; this.env.save();
    this.toast(`FINE PAID: $${V.fine.toLocaleString('en-US')}`, 2.2); this.env.audio.beep && this.env.audio.beep(660, 0.08, 0.2);
    this.say('OFFICER: Drive carefully.'); this.choice(false); this.state = 'leave'; this.t = 0; this.verdict = null;
  }
  refuse() {
    if (!this.verdict || this.verdict.arrest) return;
    this.charges.refuse = 1; this.verdict = this.decide(); this.verdict.arrest = true; this.verdict.days = Math.max(2, this.verdict.days);
    this.say('OFFICER: Have it your way. You are under arrest.'); this.choice(true);
  }
  goQuietly() {
    if (!this.verdict) return; this.choice(false);
    if (!this.env.onFoot()) this.env.getOut();
    const P = this.env.walker; P.hold = true; P.hands = 0; this.state = 'cuff'; this.t = 0; this.cuffed = false;
    this.say('OFFICER: Turn around. Hands up.'); this.toast('UNDER ARREST', 1.6);
  }

  // The officer: something that can be hit (melee.js, as an 'actor').
  targets() {
    if (!this.offOut || this.dead) return null;
    const o = this.off, self = this;
    return [{ get x() { return o.x; }, get z() { return o.z; }, alive: true, hit(dmg, info) { self.struck(dmg, info); } }];
  }
  struck(dmg, info) {
    const o = this.off, d = info.dir || { x: 0, z: 1 }, k = 3.5 * (1 + 0.15 * (info.power || 0)) + (info.lethal ? 3 : 0);
    this.hp -= dmg; if (this.hp <= 0 || info.lethal) { this.dead = true; o.knockDown(d.x * k, d.z * k, { at: 'head' }); o.downT = 1e9; this.toast('OFFICER DOWN', 1.2); }
    else if ((info.knock || 0) > 0.6) o.knockDown(d.x * k, d.z * k, { at: /kick|roundhouse/.test(info.kind) ? 'chest' : 'head' });
    else o.flinch(d.x, d.z, 0.8, true);
    if (this.state !== 'fled') this.escalate(this.dead ? 'kill' : 'officer');
  }

  // ---- Going wrong: everyone is called --------------------------------------------------------------------------------------------------------------
  escalate(kind) {
    const was = this.state; if (was === 'fled' || was === 'idle') return;
    const T = this.T(); this.why = { kind, was, speed: +(T.speed || 0).toFixed(2), moved: this.spot ? +Math.hypot(T.x - this.spot.x, T.z - this.spot.z).toFixed(2) : null, rammed: +(this.env.police.rammed || 0).toFixed(2) };      // (what set it off: for the tests)
    const P = this.env.walker; P.hold = false; P.hands = 0; this.choice(false); this.say('');
    const why = { flee: 'FAILING TO STOP', run: 'RUNNING FROM THE POLICE', ram: 'RAMMING A POLICE CAR', officer: 'ASSAULTING AN OFFICER', kill: 'OFFICER DOWN', gun: 'SHOTS FIRED', hide: 'RUNNING FROM THE POLICE', more: 'ONE CRIME TOO MANY', robbery: 'A ROBBERY' }[kind] || 'TROUBLE';
    this.toast(why + ': ALL UNITS', 2.2);
    const c = this.c;
    if (this.offOut && c && !c.wreck && !this.dead) { this.state = 'fled'; this.t = 0; c.waitOff = true; c.deployed = true; c.held = true; }        // (the officer runs back to his car, which then gives chase)
    else { this.state = 'fled'; this.t = 0; if (c) { c.held = false; c.deployed = true; } if (!this.dead) { this.off.show(false); this.offOut = false; } }
    this.panel(false);
    this.env.escalate(kind);
  }
  updateFled(dt) {
    const c = this.c, o = this.off;
    if (!this.offOut) { this.state = 'idle'; return; }
    if (this.dead) { o.update(dt, NOINP, 0, this.env.obstacles); if (c) c.waitOff = false; if (this.t > 12) { o.show(false); this.offOut = false; this.state = 'idle'; } return; }
    if (!c || c.wreck || !this.env.police.active) { o.show(false); this.offOut = false; this.state = 'idle'; return; }
    const door = this.doorOf(c);
    if (o.down > 0.3 || o.ragdoll) { o.update(dt, NOINP, 0, this.env.obstacles); return; }
    const d = this.walkTo(dt, door.x, door.z, true);
    if (d < 1.0 || this.t > 10) { o.show(false); this.offOut = false; c.waitOff = false; c.held = false; this.state = 'idle'; }
  }
  giveUp() { this.toast('THE POLICE GAVE UP LOOKING FOR YOU', 2.2); this.end('gave up'); this.env.done(); }
  end(why = 'ended') {
    if (this.state !== 'idle') this.ended = why;                                       // (why the last one ended: for the tests)
    if (this.off) { this.off.show(false); this.off.hands = 0; }
    const P = this.env.walker; if (this.state === 'cuff' || this.state === 'talk' || this.state === 'approach') { P.hold = false; }
    this.offOut = false; this.state = 'idle'; this.verdict = null; this.charges = {}; this._prompt = ''; this.spot = null; this.warned = false;
    if (this.env.police) { this.env.police.stopGoal = null; this.env.police.rammed = 0; }
    this.choice(false); this.panel(false);
  }

  // ---- On the screen: the police panel (what is happening, the time to pull over), and at the window the ticket or the arrest --------------------------
  panel(on) {
    if (typeof document === 'undefined') return;
    if (!this.el) {
      style();
      const el = document.createElement('div'); el.id = 'stopcard'; el.className = 'hidden';
      el.innerHTML = '<div class="sc-lights"><i></i><i></i></div><div class="sc-head"><b>POLICE</b><span id="sc-charge"></span></div><div class="sc-line" id="sc-line"></div><div class="sc-meter hidden" id="sc-meter"><em></em></div><div class="sc-choice hidden" id="sc-choice"></div>';
      (document.getElementById('hud') || document.body).appendChild(el); this.el = el;
      el.addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (!b) return; e.stopPropagation(); if (b.dataset.act === 'pay') this.pay(); else if (b.dataset.act === 'refuse') this.refuse(); else if (b.dataset.act === 'go') this.goQuietly(); });
      el.addEventListener('touchstart', e => { if (e.target.closest('[data-act]')) e.stopPropagation(); }, { passive: true });
    }
    this.el.classList.toggle('hidden', !on);
    if (on) this.renderCharge();
  }
  renderCharge() { if (!this.el) return; const n = Object.keys(this.charges).filter(k => OFFENCES[k]).map(k => OFFENCES[k].name); document.getElementById('sc-charge').textContent = n.join(' · '); }
  say(t) { this.line = t; if (this.el && this._said !== t) { this._said = t; document.getElementById('sc-line').textContent = t; this.renderCharge(); } }
  meter(f) { if (!this.el) return; const m = document.getElementById('sc-meter'); m.classList.toggle('hidden', !(f > 0)); if (f > 0) m.firstElementChild.style.width = clamp(f, 0, 1) * 100 + '%'; }
  choice(on) {
    if (!this.el) return; const el = document.getElementById('sc-choice'); el.classList.toggle('hidden', !on); if (!on) return;
    const V = this.verdict, money = '$' + (V.fine || 0).toLocaleString('en-US'), items = V.list.map(c => `<li>${c.name}${c.n > 1 ? ' ×' + c.n : ''}</li>`).join('');
    el.innerHTML = V.arrest
      ? `<div class="sc-ticket arrest"><b>UNDER ARREST</b><ul>${items}</ul><p>About <em>${V.days} days</em> in the cells.</p><div class="sc-btns"><button data-act="go">GO QUIETLY (F)</button></div><small>Or run for it: every police car in the city will come after you.</small></div>`
      : `<div class="sc-ticket"><b>FIXED PENALTY NOTICE</b><ul>${items}</ul><p>Fine: <em>${money}</em> &nbsp;·&nbsp; you have $${(this.env.settings.cash || 0).toLocaleString('en-US')}</p><div class="sc-btns"><button data-act="pay">PAY ${money} (F)</button><button data-act="refuse" class="no">REFUSE</button></div><small>Refuse and you are arrested. Drive off and it is a chase.</small></div>`;
  }
}

let styled = false;
function style() {
  if (styled || typeof document === 'undefined') return; styled = true;
  const s = document.createElement('style'); s.textContent = `
  #stopcard { position: absolute; left: 50%; top: calc(max(14px, env(safe-area-inset-top)) + 42px); transform: translateX(-50%); width: min(420px, calc(100vw - 32px)); padding: 0 0 10px; border-radius: 12px; overflow: hidden; background: rgba(8,12,24,0.78); border: 1px solid rgba(255,255,255,0.2); color: #fff; font: 600 13px Barlow, sans-serif; pointer-events: none; z-index: 6; }
  #stopcard.hidden, #stopcard .hidden { display: none; }
  #stopcard .sc-lights { display: flex; height: 5px; } #stopcard .sc-lights i { flex: 1; animation: scflash 0.6s steps(1) infinite; } #stopcard .sc-lights i:first-child { background: #ff2a2a; } #stopcard .sc-lights i:last-child { background: #2a6bff; animation-delay: 0.3s; }
  @keyframes scflash { 0% { opacity: 1; } 50% { opacity: 0.15; } }
  #stopcard .sc-head { display: flex; gap: 10px; align-items: baseline; padding: 8px 12px 0; } #stopcard .sc-head b { font: 800 italic 18px 'Barlow Condensed', sans-serif; letter-spacing: 0.06em; color: #9cc2ff; } #stopcard .sc-head span { opacity: 0.8; font-size: 12px; letter-spacing: 0.04em; }
  #stopcard .sc-line { padding: 4px 12px 0; font-size: 14px; min-height: 18px; }
  #stopcard .sc-meter { margin: 6px 12px 0; height: 6px; border-radius: 3px; background: rgba(255,255,255,0.15); overflow: hidden; } #stopcard .sc-meter em { display: block; height: 100%; background: linear-gradient(90deg, #ffb02a, #ff3a2a); }
  #stopcard .sc-ticket { margin: 8px 12px 0; padding: 10px 12px; border-radius: 10px; background: #f4f1e6; color: #1b1b1f; pointer-events: auto; } #stopcard .sc-ticket.arrest { background: #2a0e10; color: #fff; border: 1px solid #ff5a4a; }
  #stopcard .sc-ticket b { font: 800 16px 'Barlow Condensed', sans-serif; letter-spacing: 0.08em; } #stopcard .sc-ticket ul { margin: 4px 0; padding-left: 18px; } #stopcard .sc-ticket p { margin: 4px 0; } #stopcard .sc-ticket em { font-style: normal; font-weight: 800; }
  #stopcard .sc-btns { display: flex; gap: 8px; margin: 8px 0 4px; } #stopcard button { flex: 1; font: 800 italic 16px 'Barlow Condensed', sans-serif; border: 0; border-radius: 8px; padding: 10px; background: #1f5fd6; color: #fff; cursor: pointer; } #stopcard button.no { background: #6b6f78; flex: 0.6; }
  #stopcard .sc-ticket small { opacity: 0.7; font-size: 11px; }`;
  document.head.appendChild(s);
}
