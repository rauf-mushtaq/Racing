// Real input, not calls into the game: a mouse without pointer lock, finger touches on the on-screen buttons (several at once), and a gamepad.
// Run: node tests/input.mjs     (needs the game's debug hooks: it opens index.html?debug)
import { check, open, step, finish } from './lib.mjs';

const G = (page, fn, arg) => page.evaluate(fn, arg);
async function toFoot(page, viaUi = false) {
  await page.evaluate(() => { window.__noRender = true; });
  if (viaUi) await page.touchscreen.tap(60, 120).catch(() => {});
  await page.evaluate(() => document.querySelector('button[data-m="free"]').click());
  await page.waitForFunction(() => window.__game.game.state === 'free', null, { timeout: 60000 });
  await step(page, 30);
  await page.evaluate(() => { const g = window.__game; g.car.vx = 0; g.car.vz = 0; g.leaveCar(); });
  await step(page, 120);
}
const hud = page => G(page, () => { const g = window.__game, a = g.arsenal; return { key: a.key, mag: a.hud.mag, reserve: a.hud.reserve, reloading: a.hud.reloading, gren: a.gren, aimToggle: a.aimToggle, aimK: +a.aimK.toFixed(2), drawn: a.drawn, x: g.walker.x, z: g.walker.z, yaw: g.footCam.yaw, onFoot: !!g.game.onFoot, cursor: g.game.cursorAim ? [+g.game.cursorAim.x.toFixed(2), +g.game.cursorAim.y.toFixed(2)] : null }; });

try {
  // ---------------------------------------------------------------- mouse / trackpad without pointer lock
  console.log('mouse and trackpad (no pointer lock: an iPad with a trackpad has touch points, so the game does not ask for the lock)');
  {
    const { page, ctx, logs } = await open({ hasTouch: true });
    await toFoot(page);
    await page.keyboard.press('Digit1'); await step(page, 40);
    check('on foot with the pistol drawn', (await hud(page)).drawn);
    await page.mouse.move(520, 150); await page.mouse.move(540, 160); await step(page, 6);
    const c1 = await hud(page);
    check('the cursor is the crosshair (aim follows it, off centre)', !!c1.cursor && Math.abs(c1.cursor[0] - (540 / 844 * 2 - 1)) < 0.02, JSON.stringify(c1.cursor));
    const xh = await G(page, () => { const s = document.getElementById('xhair').style; return [s.left, s.top, document.body.classList.contains('cursoraim')]; });
    check('the on-screen crosshair sits under the cursor and the system cursor is hidden', xh[0].endsWith('%') && xh[2], JSON.stringify(xh));
    const m0 = c1.mag;
    await page.mouse.down(); await step(page, 8); await page.mouse.up(); await step(page, 4);
    const c2 = await hud(page);
    check('left button fires without pointer lock', c2.mag < m0, `${m0} -> ${c2.mag}`);
    await page.mouse.down({ button: 'right' }); await step(page, 40);
    const c3 = await hud(page);
    check('right button aims', c3.aimK > 0.8, 'aimK ' + c3.aimK);
    await page.mouse.up({ button: 'right' }); await step(page, 40);
    const y0 = (await hud(page)).yaw;
    await page.mouse.move(838, 200); await step(page, 40);
    const y1 = (await hud(page)).yaw;
    check('the cursor at the edge of the screen turns the camera', Math.abs(y1 - y0) > 0.15, `yaw ${y0.toFixed(2)} -> ${y1.toFixed(2)}`);
    await page.mouse.move(420, 195); await step(page, 5);
    const y2 = (await hud(page)).yaw; await step(page, 30); const y3 = (await hud(page)).yaw;
    check('and it stops turning when the cursor comes back', Math.abs(y3 - y2) < 0.02, `yaw ${y2.toFixed(3)} -> ${y3.toFixed(3)}`);
    await page.mouse.wheel(120, 0); await page.waitForTimeout(150); await step(page, 3);
    const y4 = (await hud(page)).yaw;
    check('a sideways two-finger swipe turns the camera', Math.abs(y4 - y3) > 0.1, `yaw ${y3.toFixed(2)} -> ${y4.toFixed(2)}`);
    check('no script errors with the mouse', logs.length === 0, logs.slice(0, 3).join(' | '));
    await ctx.close();
  }

  // ---------------------------------------------------------------- finger touches on the on-screen controls
  console.log('touch (844 x 390, like a phone; the same layout is used on a tablet)');
  {
    const { page, ctx, logs } = await open({ touch: true });
    const cdp = await ctx.newCDPSession(page);
    const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id, radiusX: 8, radiusY: 8, force: 1 })) });
    const centre = sel => page.evaluate(sel => { const r = document.querySelector(sel).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2, r.width, r.height]; }, sel);
    await toFoot(page);
    await page.evaluate(() => window.__game.input.emit('any'));
    check('touch buttons are shown on foot', await page.evaluate(() => { const t = document.getElementById('touch'); return !t.classList.contains('hidden') && getComputedStyle(document.getElementById('t-fire')).display !== 'none'; }));
    const overlaps = await page.evaluate(() => { const ids = ['t-fire', 't-aim', 't-swap', 't-reload', 't-nade', 't-jump', 't-sprint', 't-crouch']; const r = ids.map(i => [i, document.getElementById(i).getBoundingClientRect()]); const out = []; for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) { const a = r[i][1], b = r[j][1]; if (a.width && b.width && a.left < b.right - 2 && b.left < a.right - 2 && a.top < b.bottom - 2 && b.top < a.bottom - 2) out.push(r[i][0] + '/' + r[j][0]); } const off = r.filter(([, a]) => a.left < 0 || a.top < 0 || a.right > innerWidth || a.bottom > innerHeight).map(x => x[0]); return { out, off }; });
    check('no touch buttons overlap each other or hang off the screen', overlaps.out.length === 0 && overlaps.off.length === 0, JSON.stringify(overlaps));
    // GUN button: a tap draws the first gun
    let [x, y] = await centre('#t-swap'); await touch('touchStart', [[x, y, 0]]); await touch('touchEnd', []); await step(page, 40);
    check('tap GUN draws a weapon', (await hud(page)).drawn);
    // FIRE: a finger held on the button
    [x, y] = await centre('#t-fire'); const m0 = (await hud(page)).mag;
    await touch('touchStart', [[x, y, 0]]); await step(page, 10);
    check('FIRE button shows pressed while held', await page.evaluate(() => document.getElementById('t-fire').classList.contains('on')));
    await touch('touchEnd', []); await step(page, 3);
    const m1 = (await hud(page)).mag;
    check('holding FIRE shoots', m1 < m0, `${m0} -> ${m1}`);
    // Walk with the floating stick on the left while another finger holds FIRE (two fingers at once)
    const h0 = await hud(page); const mm0 = h0.mag;
    await touch('touchStart', [[120, 250, 1]]);
    await touch('touchMove', [[190, 250, 1]]); await step(page, 5);
    await touch('touchStart', [[190, 250, 1], [x, y, 2]]); await step(page, 30);
    const h1 = await hud(page);
    check('the stick walks while another finger fires', Math.hypot(h1.x - h0.x, h1.z - h0.z) > 1 && h1.mag < mm0, `moved ${Math.hypot(h1.x - h0.x, h1.z - h0.z).toFixed(1)} m, ammo ${mm0} -> ${h1.mag}`);
    await touch('touchEnd', []); await step(page, 5);
    const stopped = await hud(page); await step(page, 30); const stopped2 = await hud(page);
    check('lifting the fingers stops the walk', Math.hypot(stopped2.x - stopped.x, stopped2.z - stopped.z) < 0.4);
    // Look: a drag on the right half turns the camera
    const yaw0 = (await hud(page)).yaw;
    await touch('touchStart', [[560, 120, 3]]); for (let i = 1; i <= 6; i++) { await touch('touchMove', [[560 + i * 25, 120, 3]]); await step(page, 2); } await touch('touchEnd', []);
    const yaw1 = (await hud(page)).yaw;
    check('a drag on the right half turns the camera', Math.abs(yaw1 - yaw0) > 0.3, `yaw ${yaw0.toFixed(2)} -> ${yaw1.toFixed(2)}`);
    // RELOAD, AIM, NADE taps
    [x, y] = await centre('#t-reload'); await touch('touchStart', [[x, y, 0]]); await touch('touchEnd', []); await step(page, 3);
    check('tap RELOAD starts a reload', (await hud(page)).reloading);
    await step(page, 200);
    [x, y] = await centre('#t-aim'); await touch('touchStart', [[x, y, 0]]); await touch('touchEnd', []); await step(page, 40);
    const ha = await hud(page); check('tap AIM aims (and shows it is on)', ha.aimToggle && ha.aimK > 0.8, JSON.stringify([ha.aimToggle, ha.aimK]));
    [x, y] = await centre('#t-aim'); await touch('touchStart', [[x, y, 0]]); await touch('touchEnd', []); await step(page, 30);
    const g0 = (await hud(page)).gren;
    [x, y] = await centre('#t-nade'); await touch('touchStart', [[x, y, 0]]); await touch('touchEnd', []); await step(page, 5);
    const g1 = (await hud(page)).gren; check('tap NADE throws a grenade', g1 === g0 - 1, `${g0} -> ${g1}`);
    check('no script errors with touch', logs.length === 0, logs.slice(0, 3).join(' | '));
    await ctx.close();
  }

  // ---------------------------------------------------------------- gamepad (a fake standard controller, the way the browser reports one)
  console.log('gamepad');
  {
    const init = () => {
      const pad = { index: 0, id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)', connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })), vibrationActuator: null };
      window.__pad = pad; navigator.getGamepads = () => [pad, null, null, null];
      window.__press = (i, v = true) => { pad.buttons[i].pressed = !!v; pad.buttons[i].value = v ? 1 : 0; };
    };
    const { page, ctx, logs } = await open({ init });
    await toFoot(page);
    await step(page, 3);
    const tap = async i => { await page.evaluate(i => window.__press(i, true), i); await step(page, 3); await page.evaluate(i => window.__press(i, false), i); await step(page, 3); };
    await tap(3);       // Y: next gun
    await step(page, 40);
    check('Y draws a gun', (await hud(page)).drawn);
    const m0 = (await hud(page)).mag;
    await page.evaluate(() => window.__press(7, true)); await step(page, 8); await page.evaluate(() => window.__press(7, false)); await step(page, 3);
    check('right trigger fires', (await hud(page)).mag < m0);
    await page.evaluate(() => window.__press(4, true)); await step(page, 40);
    check('left bumper aims', (await hud(page)).aimK > 0.8);
    await page.evaluate(() => window.__press(4, false)); await step(page, 40);
    await tap(2);
    check('X reloads', (await hud(page)).reloading);
    await step(page, 200);
    const g0 = (await hud(page)).gren; await tap(11);
    check('right stick click throws a grenade', (await hud(page)).gren === g0 - 1);
    const p0 = await hud(page);
    await page.evaluate(() => { window.__pad.axes[1] = -1; }); await step(page, 60); await page.evaluate(() => { window.__pad.axes[1] = 0; });
    const p1 = await hud(page);
    check('left stick walks', Math.hypot(p1.x - p0.x, p1.z - p0.z) > 1.5, `moved ${Math.hypot(p1.x - p0.x, p1.z - p0.z).toFixed(1)} m`);
    const yaw0 = (await hud(page)).yaw; await page.evaluate(() => { window.__pad.axes[2] = 1; }); await step(page, 30); await page.evaluate(() => { window.__pad.axes[2] = 0; });
    check('right stick turns the camera', Math.abs((await hud(page)).yaw - yaw0) > 0.3);
    check('no script errors with the gamepad', logs.length === 0, logs.slice(0, 3).join(' | '));
    await ctx.close();
  }
} catch (e) {
  check('suite ran to the end', false, e.stack || String(e));
}
await finish();
