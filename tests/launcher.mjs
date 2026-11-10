// The way from the web version to the Unreal one: the UNREAL ENGINE item in the menu, and the page it opens (unreal.html), which sends this device to the
// address of the PC that is streaming the game. Checks that the menu item looks like the others and opens the page, that Connect goes to the address that
// was typed (adding http://, keeping a port, keeping https://), that the address is remembered, that nonsense is refused with a message, and that the page
// itself asks nothing of any other site.
// What answers at that address (Unreal's own streaming page, on your PC) is not part of this project and is not tested here: the answers below are made up.
import { check, open, finish, BASE } from './lib.mjs';

try {
  const { page: P, ctx, logs, external } = await open({ w: 1180, h: 820, touch: true, debug: false });      // (an iPad held sideways)

  console.log('the menu item');
  const link = P.locator('a.mbtn[href="unreal.html"]');
  check('the menu has an UNREAL ENGINE item', await link.count() === 1 && /UNREAL ENGINE/.test(await link.textContent()));
  const look = await P.evaluate(() => {
    const a = document.querySelector('a.mbtn[href="unreal.html"]'), b = document.querySelector('button.mbtn[data-m="controls"]'), ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect(), ca = getComputedStyle(a), cb = getComputedStyle(b);
    return { w: [ra.width, rb.width], h: [ra.height, rb.height], left: [ra.left, rb.left], font: [ca.fontSize + ' ' + ca.fontWeight, cb.fontSize + ' ' + cb.fontWeight], color: [ca.color, cb.color], line: ca.textDecorationLine, below: ra.top >= rb.bottom - 1, onScreen: ra.bottom <= innerHeight + 1 };
  });
  check('it looks like the other items (same size, place, font and colour, no underline) and is on the screen below them',
    Math.abs(look.w[0] - look.w[1]) < 1.5 && Math.abs(look.h[0] - look.h[1]) < 1.5 && Math.abs(look.left[0] - look.left[1]) < 1.5 && look.font[0] === look.font[1] && look.color[0] === look.color[1] && look.line === 'none' && look.below && look.onScreen, JSON.stringify(look));
  await Promise.all([P.waitForURL(/unreal\.html$/, { timeout: 30000 }), link.click()]);
  check('it opens the page that connects to the PC', /unreal\.html$/.test(P.url()) && /Unreal/.test(await P.title()), P.url());

  console.log('the page');
  check('the page asks nothing of any other site', external.length === 0, external.slice(0, 3).join(', '));
  check('it has a box for the address and a Connect button, and does not scroll sideways', await P.locator('#addr').count() === 1 && await P.locator('#go').count() === 1 && await P.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
  const here = BASE + 'unreal.html', said = () => P.evaluate(() => document.getElementById('msg').textContent);
  await P.click('#go'); await P.waitForTimeout(250);
  check('Connect with nothing typed says so and goes nowhere', /Type the address/.test(await said()) && P.url() === here, (await said()) + ' ' + P.url());
  await P.fill('#addr', '192.168.1.20 (the address'); await P.click('#go'); await P.waitForTimeout(250);
  check('something that is not an address is refused with a message, and goes nowhere', /does not look like an address/.test(await said()) && P.url() === here, (await said()) + ' ' + P.url());

  // Addresses on a home network do not exist here: whatever is asked of them is answered with an empty page, and noted.
  const asked = [];
  await ctx.route(u => /^(192\.168\.1\.20|my-pc\.example)$/.test(u.hostname), r => { asked.push(r.request().url()); return r.fulfill({ status: 200, contentType: 'text/html', body: '<title>the stream</title>' }); });
  await P.fill('#addr', '  192.168.1.20  ');
  await Promise.all([P.waitForURL('http://192.168.1.20/', { timeout: 15000 }), P.press('#addr', 'Enter')]);
  check('an address typed with spaces round it, and Enter: the browser is sent to http:// that address', P.url() === 'http://192.168.1.20/' && (await P.title()) === 'the stream', P.url());
  await P.goto(here);
  check('back on the page, the address is remembered', (await P.inputValue('#addr')) === '192.168.1.20', await P.inputValue('#addr'));
  await P.fill('#addr', '192.168.1.20:8888');
  await Promise.all([P.waitForURL('http://192.168.1.20:8888/', { timeout: 15000 }), P.click('#go')]);
  check('a port is kept', P.url() === 'http://192.168.1.20:8888/', P.url());
  await P.goto(here); await P.fill('#addr', 'https://my-pc.example');
  await Promise.all([P.waitForURL('https://my-pc.example/', { timeout: 15000 }), P.click('#go')]);
  check('an address that starts with https:// is left as it is', P.url() === 'https://my-pc.example/', P.url());
  check('the three addresses that were typed were asked for, and nothing else was',
    ['http://192.168.1.20/', 'http://192.168.1.20:8888/', 'https://my-pc.example/'].every(u => asked.includes(u)) && external.every(u => /^https?:\/\/(192\.168\.1\.20(:8888)?|my-pc\.example)\//.test(u)), 'asked: ' + asked.join(', ') + '   left the page for: ' + external.join(', '));

  console.log('and back');
  await P.goto(here);
  await Promise.all([P.waitForURL(u => /index\.html$/.test(u.pathname), { timeout: 30000 }), P.click('a[href="index.html"]')]);
  await P.waitForSelector('button[data-m="free"]', { state: 'visible', timeout: 240000 });
  check('"Back to the web version" returns to the game', true);
  check('no script errors', logs.length === 0, logs.slice(0, 3).join(' | '));
} catch (e) { console.error(e); const { check: c } = await import('./lib.mjs'); c('test ran to the end', false, String(e && e.message)); }
await finish();
