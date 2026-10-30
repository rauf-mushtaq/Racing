#include "hud.h"

void Hud::init(Renderer& r) {
  // The font atlas: printable ASCII drawn with GDI into a grey bitmap.
  const int AW = 512, AH = 256, CW = 32, CH = 40; std::vector<uint8_t> px((size_t)AW * AH, 0);
  BITMAPINFO bi = {}; bi.bmiHeader.biSize = sizeof(BITMAPINFOHEADER); bi.bmiHeader.biWidth = AW; bi.bmiHeader.biHeight = -AH; bi.bmiHeader.biPlanes = 1; bi.bmiHeader.biBitCount = 32; bi.bmiHeader.biCompression = BI_RGB;
  void* bits = nullptr; HDC dc = CreateCompatibleDC(nullptr); HBITMAP bmp = CreateDIBSection(dc, &bi, DIB_RGB_COLORS, &bits, nullptr, 0); SelectObject(dc, bmp);
  HFONT font = CreateFontA(-(int)fontPx, 0, 0, 0, FW_BOLD, FALSE, FALSE, FALSE, DEFAULT_CHARSET, OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, ANTIALIASED_QUALITY, DEFAULT_PITCH | FF_SWISS, "Segoe UI");
  SelectObject(dc, font); SetBkMode(dc, TRANSPARENT); SetTextColor(dc, RGB(255, 255, 255)); std::memset(bits, 0, (size_t)AW * AH * 4);
  for (int c = 32; c < 128; c++) {
    int k = c - 32, cx = (k % 16) * CW, cy = (k / 16) * CH; char ch = (char)c; SIZE sz = {}; GetTextExtentPoint32A(dc, &ch, 1, &sz);
    if (c != 32) TextOutA(dc, cx + 3, cy + 2, &ch, 1);
    Glyph& g = glyphs[k]; g.u0 = (cx + 1) / (float)AW; g.v0 = (cy + 1) / (float)AH; g.u1 = (cx + CW - 1) / (float)AW; g.v1 = (cy + CH - 1) / (float)AH; g.w = CW - 2; g.h = CH - 2; g.adv = (float)sz.cx; g.yoff = -(float)fontPx * 0.80f;
  }
  const uint32_t* src = (const uint32_t*)bits; for (int i = 0; i < AW * AH; i++) px[i] = (uint8_t)(src[i] >> 8 & 0xff);
  for (int y = AH - 6; y < AH; y++) for (int x = AW - 6; x < AW; x++) px[(size_t)y * AW + x] = 255;      // a solid white patch for plain shapes
  DeleteObject(font); DeleteObject(bmp); DeleteDC(dc);
  atlas = r.gfx.makeTextureData(AW, AH, DXGI_FORMAT_R8_UNORM, px.data(), 1);
  block = r.userBlock[0]; r.gfx.srv2D(block, atlas.res.Get(), DXGI_FORMAT_R8_UNORM);
  PsoDesc d; d.file = "hud.hlsl"; d.numRT = 1; d.rtv[0] = r.ldrFormat; d.depth = false; d.depthWrite = false; d.cull = D3D12_CULL_MODE_NONE; d.blend = true;
  d.layout = { { "POSITION", 0, DXGI_FORMAT_R32G32_FLOAT, 0, 0, D3D12_INPUT_CLASSIFICATION_PER_VERTEX_DATA, 0 }, { "TEXCOORD", 0, DXGI_FORMAT_R32G32_FLOAT, 0, 8, D3D12_INPUT_CLASSIFICATION_PER_VERTEX_DATA, 0 }, { "COLOR", 0, DXGI_FORMAT_R32G32B32A32_FLOAT, 0, 16, D3D12_INPUT_CLASSIFICATION_PER_VERTEX_DATA, 0 } };
  pso = r.gfx.makePso(d); ready = true;
}
static const float U0 = 508.5f / 512.0f, V0 = 252.5f / 256.0f;   // inside the white patch
void Hud::solid(float x0, float y0, float x1, float y1, const float c[4]) { quad(x0, y0, x1, y0, x1, y1, x0, y1, c); }
void Hud::quad(float ax, float ay, float bx, float by, float cx, float cy, float dx, float dy, const float c[4]) {
  V a = { ax, ay, U0, V0, c[0], c[1], c[2], c[3] }, b = a, cc = a, d = a; b.x = bx; b.y = by; cc.x = cx; cc.y = cy; d.x = dx; d.y = dy;
  verts.push_back(a); verts.push_back(b); verts.push_back(cc); verts.push_back(a); verts.push_back(cc); verts.push_back(d);
}
void Hud::arc(float cx, float cy, float r0, float r1, float a0, float a1, const float c[4], int segs) {
  for (int i = 0; i < segs; i++) {
    float t0 = a0 + (a1 - a0) * i / segs, t1 = a0 + (a1 - a0) * (i + 1) / segs;
    quad(cx + std::cos(t0) * r0, cy - std::sin(t0) * r0, cx + std::cos(t0) * r1, cy - std::sin(t0) * r1, cx + std::cos(t1) * r1, cy - std::sin(t1) * r1, cx + std::cos(t1) * r0, cy - std::sin(t1) * r0, c);
  }
}
void Hud::line(float x0, float y0, float x1, float y1, float w, const float c[4]) {
  float dx = x1 - x0, dy = y1 - y0, l = std::sqrt(dx * dx + dy * dy); if (l < 1e-4f) return; float nx = -dy / l * w * 0.5f, ny = dx / l * w * 0.5f;
  quad(x0 + nx, y0 + ny, x1 + nx, y1 + ny, x1 - nx, y1 - ny, x0 - nx, y0 - ny, c);
}
float Hud::textWidth(const std::string& s, float px) { float w = 0, k = px / fontPx; for (char ch : s) if (ch >= 32) w += glyphs[ch - 32].adv * k; return w; }
void Hud::text(const std::string& s, float x, float y, float px, const float c[4], int align) {
  float k = px / fontPx, w = textWidth(s, px); if (align == 1) x -= w / 2; else if (align == 2) x -= w;
  if (c[3] > 0.3f) { const float sh[4] = { 0, 0, 0, 0.55f * c[3] }; float o = std::max(1.2f, px * 0.05f); for (float dx : { -o, o }) for (float dy : { -o, o }) textRaw(s, x + dx, y + dy, px, sh); }   // a soft dark outline so text reads over the bright sky
  textRaw(s, x, y, px, c);
}
void Hud::textRaw(const std::string& s, float x, float y, float px, const float c[4]) {
  float k = px / fontPx;
  for (char ch : s) {
    if (ch < 32) continue; const Glyph& g = glyphs[ch - 32]; float x0 = x - 3 * k, y0 = y + g.yoff * k - 2 * k, x1 = x0 + g.w * k, y1 = y0 + g.h * k;
    V a = { x0, y0, g.u0, g.v0, c[0], c[1], c[2], c[3] }, b = { x1, y0, g.u1, g.v0, c[0], c[1], c[2], c[3] }, cc = { x1, y1, g.u1, g.v1, c[0], c[1], c[2], c[3] }, d = { x0, y1, g.u0, g.v1, c[0], c[1], c[2], c[3] };
    verts.push_back(a); verts.push_back(b); verts.push_back(cc); verts.push_back(a); verts.push_back(cc); verts.push_back(d); x += g.adv * k;
  }
}

void Hud::star(float cx, float cy, float r, const float c[4]) {
  float px[10], py[10]; for (int i = 0; i < 10; i++) { float a = -1.5708f + i * 0.62832f, rr = i % 2 ? r * 0.42f : r; px[i] = cx + std::cos(a) * rr; py[i] = cy + std::sin(a) * rr; }
  for (int i = 0; i < 10; i++) tri(cx, cy, px[i], py[i], px[(i + 1) % 10], py[(i + 1) % 10], c);
}
std::vector<std::string> Hud::wrap(const std::string& s, float maxW, float px) {
  std::vector<std::string> out; std::string line, word; auto flush = [&]() { if (line.empty()) line = word; else if (textWidth(line + " " + word, px) <= maxW) line += " " + word; else { out.push_back(line); line = word; } word.clear(); };
  for (char ch : s) { if (ch == ' ') { if (!word.empty()) flush(); } else word += ch; } if (!word.empty()) flush(); if (!line.empty()) out.push_back(line); return out;
}
static std::string fmtTime(double t) { int m = (int)(t / 60); double s = t - m * 60; char b[32]; snprintf(b, sizeof b, "%d:%05.2f", m, s); return b; }
static const float WHITE[4] = { 0.96f, 0.96f, 0.98f, 0.95f }, DIM[4] = { 0.96f, 0.96f, 0.98f, 0.55f }, ACCENT[4] = { 1.0f, 0.55f, 0.18f, 1.0f }, PANEL[4] = { 0.03f, 0.03f, 0.05f, 0.62f }, RIM[4] = { 1, 1, 1, 0.16f }, RED[4] = { 1.0f, 0.22f, 0.18f, 1.0f }, BLUE[4] = { 0.25f, 0.5f, 1.0f, 1.0f }, GREEN[4] = { 0.3f, 0.95f, 0.45f, 1.0f }, GOLD[4] = { 1.0f, 0.82f, 0.25f, 1.0f };

void Hud::gauge(const Game& game, const Perf& perf) {
  (void)perf; const Vehicle& car = game.car; float R = 128.0f * S, cx = 30.0f * S + R, cy = H - 30.0f * S - R;
  arc(cx, cy, 0, R, 0, 6.2832f, PANEL, 64); arc(cx, cy, R - 2.0f * S, R, 0, 6.2832f, RIM, 64);
  const float a0 = 225.0f * 3.14159f / 180.0f, sweep = 270.0f * 3.14159f / 180.0f, redline = (float)car.s.redline; int nt = (int)std::ceil(redline / 1000.0f);
  auto ang = [&](float f) { return a0 - sweep * f; };
  float rpmF = clampf((float)car.rpm / (nt * 1000.0f), 0, 1), redF = redline / (nt * 1000.0f);
  const float track[4] = { 1, 1, 1, 0.10f }; arc(cx, cy, R * 0.80f, R * 0.92f, ang(1.0f), ang(0.0f), track, 56);
  for (int i = 0; i < 48; i++) {
    float f0 = rpmF * i / 48.0f, f1 = rpmF * (i + 1) / 48.0f, m = (f0 + f1) * 0.5f / redF; float c[4] = { 1.0f, 1.0f - clampf((m - 0.55f) * 2.0f, 0, 1) * 0.45f - clampf((m - 0.82f) * 5, 0, 1) * 0.4f, 0.95f - clampf((m - 0.35f) * 2.5f, 0, 0.9f), 0.95f };
    if (m < 0.35f) { c[0] = 0.55f + m; c[1] = 0.9f; c[2] = 1.0f; }
    arc(cx, cy, R * 0.80f, R * 0.92f, ang(f0), ang(f1), c, 1);
  }
  for (int k = 0; k <= nt; k++) {
    float a = ang((float)k / nt), c = std::cos(a), s = std::sin(a); const float* col = k >= nt - 1 ? ACCENT : WHITE;
    line(cx + c * R * 0.93f, cy - s * R * 0.93f, cx + c * R * 0.99f, cy - s * R * 0.99f, 2.5f * S, col);
    text(std::to_string(k), cx + c * R * 0.68f, cy - s * R * 0.68f + 7.0f * S, 18.0f * S, DIM, 1);
  }
  char sp[16]; snprintf(sp, sizeof sp, "%d", (int)std::round(game.speedKmh)); text(sp, cx, cy + 22.0f * S, 66.0f * S, WHITE, 1); text("km/h", cx, cy + 46.0f * S, 18.0f * S, DIM, 1);
  std::string gs = car.gear == -1 ? "R" : (car.speed() < 0.4 && car.gear == 1 && car.throttle < 0.05) ? "N" : std::to_string(car.gear); text(gs, cx, cy - 22.0f * S, 44.0f * S, ACCENT, 1);
  const float onC[4] = { 1.0f, 0.78f, 0.1f, 1.0f }, offC[4] = { 1, 1, 1, 0.18f };
  text("ABS", cx - 40.0f * S, cy + 72.0f * S, 13.0f * S, car.absOn ? onC : offC, 1); text("ESP", cx, cy + 72.0f * S, 13.0f * S, car.espOn ? onC : offC, 1); text("TCS", cx + 40.0f * S, cy + 72.0f * S, 13.0f * S, car.tcsOn ? onC : offC, 1);
  float nx0 = cx - R * 0.55f, nx1 = cx + R * 0.55f, ny = cy + R + 10.0f * S; const float nb[4] = { 1, 1, 1, 0.15f }, nf[4] = { 0.25f, 0.85f, 1.0f, 0.95f };
  solid(nx0, ny, nx1, ny + 6.0f * S, nb); solid(nx0, ny, nx0 + (nx1 - nx0) * (float)car.nitro, ny + 6.0f * S, nf);
}
void Hud::raceHud(const Renderer& r, const Game& g) {
  const Route& rt = g.route; if (rt.cps.empty()) return;
  if (g.state == State::Countdown) { int n = (int)std::ceil(g.countT - 0.4); if (n > 0) { char b[8]; snprintf(b, sizeof b, "%d", n); float a = clampf((float)(g.countT - 0.4 - (n - 1)) * 1.4f, 0.2f, 1.0f); float c[4] = { 1, 1, 1, a }; text(b, W * 0.5f, H * 0.42f, 150.0f * S, c, 1); } text(rt.ev->name, W * 0.5f, H * 0.2f, 40.0f * S, WHITE, 1); text("Get ready", W * 0.5f, H * 0.2f + 36.0f * S, 22.0f * S, DIM, 1); }
  // Timer and progress.
  float px = W * 0.5f; const float p[4] = { 0.03f, 0.03f, 0.05f, 0.55f }; solid(px - 150 * S, 14 * S, px + 150 * S, 98 * S, p);
  text(fmtTime(g.raceT), px, 62.0f * S, 48.0f * S, WHITE, 1); char b[96]; snprintf(b, sizeof b, "GATE %d / %d", std::min(g.nextCp + 1, (int)rt.cps.size()), (int)rt.cps.size()); text(b, px, 88.0f * S, 16.0f * S, DIM, 1);
  if (g.state == State::Race && g.nextCp < (int)rt.cps.size()) {   // an arrow to the next gate
    const Checkpoint& cp = rt.cps[g.nextCp]; double dx = cp.x - g.car.x, dz = cp.z - g.car.z, bearing = std::atan2(dx, -dz), rel = bearing - r.cam.yaw * PI / 180.0; float cx = px, cy = 150.0f * S, k = 26.0f * S;
    float s = (float)std::sin(rel), c = (float)std::cos(rel); auto P = [&](float x, float y, float* ox, float* oy) { *ox = cx + x * c - y * s; *oy = cy - (x * s + y * c); };
    float ax, ay, bx, by, cx2, cy2, dx2, dy2; P(0, k, &ax, &ay); P(-k * 0.7f, -k * 0.7f, &bx, &by); P(0, -k * 0.25f, &cx2, &cy2); P(k * 0.7f, -k * 0.7f, &dx2, &dy2);
    const float ac[4] = { 0.3f, 0.9f, 1.0f, 0.95f }; tri(ax, ay, bx, by, cx2, cy2, ac); tri(ax, ay, cx2, cy2, dx2, dy2, ac);
    snprintf(b, sizeof b, "%d m", (int)std::hypot(dx, dz)); text(b, cx, cy + 46.0f * S, 20.0f * S, WHITE, 1);
    double best = g.bestFor(rt.ev->id); if (best >= 0) text("BEST " + fmtTime(best), W - 24.0f * S, 70.0f * S, 18.0f * S, DIM, 2);
  }
  if (g.state == State::Finished) {
    float x0 = W * 0.5f - 280 * S, x1 = W * 0.5f + 280 * S, y0 = H * 0.24f, y1 = H * 0.24f + 400 * S; solid(x0, y0, x1, y1, PANEL);
    text("FINISH", W * 0.5f, y0 + 62 * S, 64.0f * S, WHITE, 1); text(rt.ev->name, W * 0.5f, y0 + 100 * S, 24.0f * S, DIM, 1); text(fmtTime(g.raceT), W * 0.5f, y0 + 170 * S, 78.0f * S, ACCENT, 1);
    static const char* mn[4] = { "No medal this time", "BRONZE MEDAL", "SILVER MEDAL", "GOLD MEDAL" }; const float* mc = g.lastMedal == 3 ? GOLD : g.lastMedal == 2 ? WHITE : g.lastMedal == 1 ? ACCENT : DIM; text(mn[g.lastMedal], W * 0.5f, y0 + 214 * S, 30.0f * S, mc, 1);
    if (g.newBest) text("NEW BEST", W * 0.5f, y0 + 248 * S, 22.0f * S, GREEN, 1);
    text("Gold  " + fmtTime(rt.medals.gold), W * 0.5f, y0 + 296 * S, 20.0f * S, GOLD, 1); text("Silver  " + fmtTime(rt.medals.silver), W * 0.5f, y0 + 324 * S, 20.0f * S, WHITE, 1); text("Bronze  " + fmtTime(rt.medals.bronze), W * 0.5f, y0 + 352 * S, 20.0f * S, ACCENT, 1);
    text("R  race again        Esc  menu", W * 0.5f, y1 - 14 * S, 18.0f * S, DIM, 1);
  }
}
void Hud::escapeHud(const Renderer& r, const Game& g) {
  (void)r; const PoliceChase& e = g.escape; bool flashRed = std::fmod(g.clock * 3.6, 1.0) < 0.5;
  if (e.damageFlash > 0.02f) { float c[4] = { 0.9f, 0.05f, 0.03f, (float)e.damageFlash * 0.16f }; solid(0, 0, W, H, c); }
  // Wanted stars and the "lose them" bar.
  float sx = 34.0f * S, sy = 92.0f * S; int stars = e.stars(); float frac = (float)(e.heat - std::floor(e.heat));
  for (int i = 0; i < 5; i++) { const float off[4] = { 1, 1, 1, 0.16f }; float c[4]; bool on = i < stars; if (on) { const float* base = e.spotted ? (flashRed ? RED : BLUE) : WHITE; std::memcpy(c, base, sizeof c); } else std::memcpy(c, off, sizeof c); star(sx + i * 34.0f * S, sy, 14.0f * S, c); }
  if (stars < 5) { float c[4] = { 1, 1, 1, 0.5f }; solid(sx - 14 * S, sy + 22 * S, sx - 14 * S + 5 * 34 * S * frac, sy + 25 * S, c); }
  float bw = 380.0f * S, bx = W * 0.5f - bw / 2, by = 30.0f * S; const float tr[4] = { 1, 1, 1, 0.14f }; solid(bx, by, bx + bw, by + 12 * S, tr);
  float prog = clampf((float)(e.hidden / e.hiddenNeeded), 0, 1); const float* pc = e.spotted ? RED : GREEN; solid(bx, by, bx + bw * prog, by + 12 * S, pc);
  text(e.spotted ? "SPOTTED - BREAK LINE OF SIGHT" : "HIDDEN - KEEP OUT OF SIGHT", W * 0.5f, by + 40 * S, 20.0f * S, e.spotted ? RED : GREEN, 1);
  // Integrity.
  float hx = W * 0.5f - 190.0f * S, hy = H - 150.0f * S; float hp = clampf((float)e.health / 100.0f, 0, 1); const float hb[4] = { 1, 1, 1, 0.15f }; float hc[4] = { 1.0f - hp * 0.7f, 0.3f + hp * 0.65f, 0.25f, 0.95f };
  solid(hx, hy, hx + 380 * S, hy + 10 * S, hb); solid(hx, hy, hx + 380 * S * hp, hy + 10 * S, hc); text("INTEGRITY", hx, hy - 6 * S, 14.0f * S, DIM, 0);
  if (e.shieldT > 0) text("ARMOUR UP", hx + 380 * S, hy - 6 * S, 14.0f * S, BLUE, 2);
  // The gadgets.
  struct G { const char* key; const char* name; float fill; std::string note; bool ready; const float* col; } gs[6] = {
    { "F", "GUNS", (float)e.gunHeat, e.jammed ? "JAM" : "", !e.jammed, RED }, { "G", "MISSILE", e.ammoMissile / 6.0f, "x" + std::to_string(e.ammoMissile), e.ammoMissile > 0, ACCENT }, { "B", "BOMB", e.ammoBomb / 4.0f, "x" + std::to_string(e.ammoBomb), e.ammoBomb > 0, ACCENT },
    { "O", "OIL", 1.0f - (float)(e.cdOil / 7.0), "", e.cdOil <= 0, WHITE }, { "X", "SMOKE", 1.0f - (float)(e.cdSmoke / 14.0), "", e.cdSmoke <= 0, WHITE }, { "V", "ARMOUR", e.shieldT > 0 ? (float)(e.shieldT / 6.0) : 1.0f - (float)(e.cdShield / 15.0), "", e.cdShield <= 0 && e.shieldT <= 0, BLUE } };
  float gw = 92.0f * S, gx0 = W * 0.5f - gw * 3, gy0 = H - 118.0f * S;
  for (int i = 0; i < 6; i++) {
    float x0 = gx0 + i * gw + 4 * S, x1 = x0 + gw - 8 * S, y0 = gy0, y1 = gy0 + 86 * S; solid(x0, y0, x1, y1, PANEL);
    const float* kc = gs[i].ready ? WHITE : DIM; text(gs[i].key, x0 + 10 * S, y0 + 26 * S, 22.0f * S, gs[i].ready ? ACCENT : DIM, 0); text(gs[i].name, (x0 + x1) * 0.5f, y0 + 54 * S, 15.0f * S, kc, 1);
    if (!gs[i].note.empty()) text(gs[i].note, x1 - 8 * S, y0 + 26 * S, 18.0f * S, kc, 2);
    const float tr2[4] = { 1, 1, 1, 0.14f }; solid(x0 + 8 * S, y1 - 14 * S, x1 - 8 * S, y1 - 8 * S, tr2); float fc[4] = { gs[i].col[0], gs[i].col[1], gs[i].col[2], gs[i].ready ? 1.0f : 0.5f }; solid(x0 + 8 * S, y1 - 14 * S, x0 + 8 * S + (x1 - x0 - 16 * S) * clampf(gs[i].fill, 0, 1), y1 - 8 * S, fc);
  }
  // Radar: the police relative to your heading.
  float rr = 92.0f * S, rx = W - rr - 30.0f * S, ry = 170.0f * S; arc(rx, ry, 0, rr, 0, 6.2832f, PANEL, 48); arc(rx, ry, rr - 1.5f * S, rr, 0, 6.2832f, RIM, 48); arc(rx, ry, rr * 0.5f - 1, rr * 0.5f, 0, 6.2832f, RIM, 32);
  double sh = std::sin(g.car.h), ch = std::cos(g.car.h); const double RANGE = 320;
  for (const Cop& c : e.cops) {
    if (c.wreck) continue; double dx = c.x - g.car.x, dz = c.z - g.car.z, fwd = dx * sh + dz * ch, rgt = -(dx * ch - dz * sh); double d = std::hypot(fwd, rgt); double k = d > RANGE ? RANGE / d : 1.0;
    float px2 = rx + (float)(rgt * k / RANGE) * rr * 0.92f, py2 = ry - (float)(fwd * k / RANGE) * rr * 0.92f; const float* cc = std::fmod(g.clock * 3.6 + c.flash, 1.0) < 0.5 ? RED : BLUE; float rd = (c.kind ? 6.0f : 4.5f) * S; solid(px2 - rd, py2 - rd, px2 + rd, py2 + rd, cc);
  }
  tri(rx, ry - 8 * S, rx - 6 * S, ry + 6 * S, rx + 6 * S, ry + 6 * S, WHITE);
  if (g.state == State::EscapeOver) {
    float x0 = W * 0.5f - 290 * S, x1 = W * 0.5f + 290 * S, y0 = H * 0.22f, y1 = y0 + 400 * S; solid(x0, y0, x1, y1, PANEL);
    const char* title = e.result == PoliceChase::ESCAPED ? "YOU LOST THEM" : e.result == PoliceChase::BUSTED ? "BUSTED" : "WRECKED"; const float* tc = e.result == PoliceChase::ESCAPED ? GREEN : RED;
    text(title, W * 0.5f, y0 + 76 * S, 66.0f * S, tc, 1); char b[128];
    snprintf(b, sizeof b, "Time  %s", fmtTime(e.time).c_str()); text(b, W * 0.5f, y0 + 150 * S, 28.0f * S, WHITE, 1); snprintf(b, sizeof b, "Highest heat  %d star%s", e.maxStars, e.maxStars == 1 ? "" : "s"); text(b, W * 0.5f, y0 + 190 * S, 24.0f * S, WHITE, 1);
    snprintf(b, sizeof b, "Police vehicles destroyed  %d", e.kills); text(b, W * 0.5f, y0 + 228 * S, 24.0f * S, WHITE, 1); snprintf(b, sizeof b, "Civilian cars wrecked  %d", e.civilians); text(b, W * 0.5f, y0 + 266 * S, 24.0f * S, WHITE, 1);
    text("R  try again        Esc  menu", W * 0.5f, y1 - 20 * S, 18.0f * S, DIM, 1);
  }
}
void Hud::wheelPanel(const Game& g, float x, float y) {
  const WheelInput& w = g.wheel; float pw = 330.0f * S; const float bg[4] = { 0.02f, 0.02f, 0.04f, 0.72f }, track[4] = { 0.25f, 0.25f, 0.3f, 0.9f }, green[4] = { 0.25f, 0.85f, 0.35f, 1 }, red[4] = { 0.95f, 0.25f, 0.2f, 1 }, orange[4] = { 1.0f, 0.55f, 0.18f, 1 }, blue[4] = { 0.35f, 0.65f, 1.0f, 1 };
  float ph = 330.0f * S; solid(x, y, x + pw, y + ph, bg); float cx = x + 16 * S, bw = pw - 32 * S, yy = y + 30 * S;
  text("LIVE INPUT", cx, yy, 20.0f * S, WHITE, 0); yy += 26 * S;
  if (w.devices.empty()) { for (auto& l : wrap("No wheel or controller found. Plug the wheel and pedals into USB, then pick \"Look for controllers again\".", bw, 17.0f * S)) { text(l, cx, yy, 17.0f * S, DIM, 0); yy += 22 * S; } return; }
  for (size_t i = 0; i < w.devices.size() && i < 2; i++) { auto lines = wrap(w.devices[i].name, bw, 16.0f * S); text(lines.empty() ? "" : lines[0], cx, yy, 16.0f * S, DIM, 0); yy += 21 * S; }
  yy += 6 * S;
  auto bar = [&](const char* label, float v, bool centred, const float col[4], bool known) {
    text(label, cx, yy, 16.0f * S, known ? WHITE : DIM, 0); float by = yy + 8 * S, bh = 14 * S; solid(cx, by, cx + bw, by + bh, track);
    if (known) { if (centred) { float mid = cx + bw / 2; if (v >= 0) solid(mid, by, mid + v * bw / 2, by + bh, col); else solid(mid + v * bw / 2, by, mid, by + bh, col); solid(mid - 1 * S, by - 3 * S, mid + 1 * S, by + bh + 3 * S, WHITE); } else solid(cx, by, cx + v * bw, by + bh, col); }
    yy += 42 * S;
  };
  bool wheelOk = g.settings.wheelOn;
  bar("Steering", w.steerValue(), true, orange, wheelOk && w.have(g.settings.steer));
  bar("Throttle", w.throttleValue(), false, green, wheelOk && w.have(g.settings.throttle));
  bar("Brake", w.brakeValue(), false, red, wheelOk && w.have(g.settings.brake));
  // the raw axes of the first controller: move something and watch which one follows
  const WheelInput::Sample& s0 = w.dev[w.devices[0].id]; text("Raw axes of the first controller", cx, yy, 15.0f * S, DIM, 0); yy += 8 * S; static const char* nm[6] = { "X", "Y", "Z", "R", "U", "V" };
  for (int a = 0; a < 6; a++) { if (!w.devices[0].has[a]) continue; float by = yy + 4 * S; text(nm[a], cx, by + 11 * S, 14.0f * S, DIM, 0); solid(cx + 22 * S, by + 2 * S, cx + bw, by + 10 * S, track); solid(cx + 22 * S, by + 2 * S, cx + 22 * S + s0.ax[a] * (bw - 22 * S), by + 10 * S, blue); yy += 14 * S; }
}
void Hud::menu(const Game& g) {
  const float veil[4] = { 0.02f, 0.02f, 0.04f, 0.58f }; solid(0, 0, W, H, veil);
  float pw = 640.0f * S, x0 = W * 0.5f - pw / 2, ytop = 90.0f * S; if (g.menuPage == 4 && W * 0.5f + pw / 2 + 30 * S + 330 * S > W) x0 = 24.0f * S;   // leave room for the live panel on a narrow window
  text(g.menuTitle, g.menuPage == 4 ? x0 + pw / 2 : W * 0.5f, ytop, 60.0f * S, WHITE, 1);
  int n = (int)g.menuItems.size(), vis = std::min(n, 11), first = std::max(0, std::min(g.menuSel - vis / 2, n - vis)); float ih = 44.0f * S, y = ytop + 40.0f * S;
  g.menuHits.clear();
  for (int i = first; i < first + vis; i++) {
    bool sel = i == g.menuSel; const float hl[4] = { 1.0f, 0.55f, 0.18f, 0.9f }, nm[4] = { 0.03f, 0.03f, 0.05f, 0.55f }; solid(x0, y, x0 + pw, y + ih - 4 * S, sel ? hl : nm); g.menuHits.push_back({ x0, y, x0 + pw, y + ih - 4 * S, i });
    const float dk[4] = { 0.05f, 0.04f, 0.04f, 1.0f }; text(g.menuItems[i].label, x0 + 22.0f * S, y + ih * 0.66f, 24.0f * S, sel ? dk : WHITE, 0);
    if (g.menuItems[i].adjust && sel) { text("<", x0 + pw - 54 * S, y + ih * 0.66f, 24.0f * S, dk, 0); text(">", x0 + pw - 26 * S, y + ih * 0.66f, 24.0f * S, dk, 0); }
    y += ih;
  }
  if (first > 0) text("...", x0 + pw / 2, ytop + 34.0f * S, 20.0f * S, DIM, 1); if (first + vis < n) text("...", x0 + pw / 2, y + 6.0f * S, 20.0f * S, DIM, 1);
  if (!g.menuItems.empty()) { auto lines = wrap(g.menuItems[g.menuSel].detail, pw, 19.0f * S); float yy = y + 34.0f * S; for (auto& l : lines) { text(l, x0 + pw / 2, yy, 19.0f * S, DIM, 1); yy += 25.0f * S; } }
  if (g.menuPage == 4) wheelPanel(g, x0 + pw + 30 * S, ytop + 40 * S);
  const WheelInput& w = g.wheel;
  if (w.noticeT > 0 && !w.notice.empty()) { const float nc[4] = { 0.55f, 1.0f, 0.6f, 1.0f }; text(w.notice, W * 0.5f, H - 78.0f * S, 21.0f * S, nc, 1); }
  text(g.menuPage >= 2 ? "Up / Down  choose      Left / Right  change      Enter or click  select      Esc  back" : "Up / Down  choose      Enter or click  select      Esc  back", W * 0.5f, H - 40.0f * S, 18.0f * S, DIM, 1);
  if (w.binding != WheelInput::NONE) {                                                    // the setup wizard: what to do now, and whether it has been seen
    const float box[4] = { 0.03f, 0.03f, 0.06f, 0.94f }, edge[4] = { 1.0f, 0.55f, 0.18f, 1 }, track[4] = { 0.25f, 0.25f, 0.3f, 1 }, ok[4] = { 0.3f, 0.9f, 0.4f, 1 };
    float bw = std::min(W - 40 * S, 820.0f * S), bx = W * 0.5f - bw / 2, by = H * 0.5f - 90.0f * S; solid(bx - 3 * S, by - 3 * S, bx + bw + 3 * S, by + 183.0f * S, edge); solid(bx, by, bx + bw, by + 180.0f * S, box);
    auto lines = wrap(w.prompt, bw - 60 * S, 28.0f * S); float yy = by + 52 * S; for (auto& l : lines) { text(l, W * 0.5f, yy, 28.0f * S, WHITE, 1); yy += 36 * S; }
    solid(bx + 30 * S, by + 132 * S, bx + bw - 30 * S, by + 146 * S, track); solid(bx + 30 * S, by + 132 * S, bx + 30 * S + w.progress * (bw - 60 * S), by + 146 * S, ok);
    text("Esc  cancel", W * 0.5f, by + 170 * S, 17.0f * S, DIM, 1);
  }
}
void Hud::toasts(const Game& g) {
  float y = (g.inEscapeHud() ? 160.0f : 230.0f) * S;
  for (auto it = g.toasts.rbegin(); it != g.toasts.rend(); ++it) { float a = clampf((float)(3.2 - it->age) * 1.5f, 0, 1) * clampf((float)it->age * 8.0f, 0, 1); float c[4] = { 1, 1, 1, 0.95f * a }; text(it->text, W * 0.5f, y, 30.0f * S, c, 1); y += 36.0f * S; }
}
void Hud::statsPanel(const Perf& p) {
  float x = 24.0f * S, y = 74.0f * S, w = 300.0f * S; const float bg[4] = { 0.02f, 0.02f, 0.03f, 0.7f }; solid(x - 10 * S, y - 22 * S, x + w, y + 7 * 24.0f * S, bg); char b[160];
  snprintf(b, sizeof b, "%.0f fps    %.2f ms    worst %.1f ms", p.fps, p.frameMs, p.worstMs); text(b, x, y, 18.0f * S, WHITE, 0); y += 24 * S;
  snprintf(b, sizeof b, "GPU %.2f ms", p.gpuMs); text(p.gpuMs > 0 ? b : "GPU timing n/a", x, y, 18.0f * S, WHITE, 0); y += 24 * S;
  snprintf(b, sizeof b, "%u draws (%u in shadows)", p.draws, p.shadowDraws); text(b, x, y, 18.0f * S, WHITE, 0); y += 24 * S;
  snprintf(b, sizeof b, "%ux%u  MSAA %dx", p.W, p.H, p.msaa); text(b, x, y, 18.0f * S, WHITE, 0); y += 24 * S;
  snprintf(b, sizeof b, "present: %s", p.vsync ? "vsync" : (p.tearing ? "uncapped (tearing)" : "uncapped")); text(b, x, y, 18.0f * S, WHITE, 0); y += 24 * S;
  snprintf(b, sizeof b, "F4 vsync   F5 AO %s   F6 shadows %s   F7 reflections %s", p.ao ? "on" : "off", p.shadows ? "on" : "off", p.refl ? "on" : "off"); text(b, x, y, 16.0f * S, DIM, 0);
}
void Hud::draw(Renderer& r, Gfx& g, Texture& target, const Game& game, double time, const Perf& perf) {
  if (!ready) return; verts.clear(); W = (float)r.W; H = (float)r.H; S = std::min(W / 1600.0f, H / 900.0f) * 1.1f;   // everything scales with the window
  if (game.state != State::Menu) gauge(game, perf);
  static const char* camNames[4] = { "WIDE CHASE", "CLOSE CHASE", "DRIVER", "HOOD" };
  if (game.state != State::Menu) text(camNames[game.camMode], 24.0f * S, 40.0f * S, 20.0f * S, WHITE, 0);
  char fp[32]; snprintf(fp, sizeof fp, "%d FPS", (int)std::round(perf.fps)); text(fp, W - 20.0f * S, 34.0f * S, 18.0f * S, DIM, 2);
  if (game.inRaceHud()) raceHud(r, game); if (game.inEscapeHud()) escapeHud(r, game);
  if (game.state != State::Menu) toasts(game);
  if (game.showStats) statsPanel(perf);
  if (time < 9.0 && (game.state == State::Free)) { float a = clampf((float)(9.0 - time), 0, 1); float hc[4] = { 1, 1, 1, 0.8f * a }; text("W / S  throttle, brake      A / D  steer      Space  handbrake      Shift  nitro      C  camera      R  reset      Esc  menu and settings (wheel setup)      T  time of day      F3  stats", W * 0.5f, H - 28.0f * S, 17.0f * S, hc, 1); }
  if (game.state == State::Escape && game.escape.time < 14) { float a = clampf((float)(14.0 - game.escape.time), 0, 1); float hc[4] = { 1, 1, 1, 0.85f * a }; text("F guns (hold, or left mouse)      G missile      B bomb      O oil      X smoke      V armour      Shift nitro      Esc menu", W * 0.5f, H - 28.0f * S + 0.0f, 17.0f * S, hc, 1); }
  if (game.state == State::Menu) menu(game);
  if (!verts.empty()) {
    UINT bytes = (UINT)(verts.size() * sizeof(V)); CBAlloc a = g.allocCB(bytes); std::memcpy(a.ptr, verts.data(), bytes);
    g.barrier(target, D3D12_RESOURCE_STATE_RENDER_TARGET); g.cmd->OMSetRenderTargets(1, &target.rtv, FALSE, nullptr); g.setViewport(r.W, r.H); g.cmd->SetPipelineState(pso.Get());
    struct DrawCB { float world[16]; float p[16]; } cb = {}; g.setDraw(g.cb(cb), block);
    D3D12_VERTEX_BUFFER_VIEW vb = { a.va, bytes, (UINT)sizeof(V) }; g.cmd->IASetVertexBuffers(0, 1, &vb); g.cmd->DrawInstanced((UINT)verts.size(), 1, 0, 0);
  }
}
