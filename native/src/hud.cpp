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

void Hud::draw(Renderer& r, Gfx& g, Texture& target, const Game& game, double time, double fps) {
  if (!ready) return; verts.clear();
  float W = (float)r.W, H = (float)r.H, S = std::min(W / 1600.0f, H / 900.0f) * 1.1f;   // everything scales with the window
  const float white[4] = { 0.96f, 0.96f, 0.98f, 0.95f }, dim[4] = { 0.96f, 0.96f, 0.98f, 0.55f }, accent[4] = { 1.0f, 0.55f, 0.18f, 1.0f }, panel[4] = { 0.03f, 0.03f, 0.05f, 0.62f }, rim[4] = { 1, 1, 1, 0.16f };
  const Vehicle& car = game.car; float R = 128.0f * S, cx = 30.0f * S + R, cy = H - 30.0f * S - R;
  // Gauge face.
  arc(cx, cy, 0, R, 0, 6.2832f, panel, 64); arc(cx, cy, R - 2.0f * S, R, 0, 6.2832f, rim, 64);
  const float a0 = 225.0f * 3.14159f / 180.0f, sweep = 270.0f * 3.14159f / 180.0f, redline = 8000.0f;
  auto ang = [&](float f) { return a0 - sweep * f; };
  float rpmF = clampf((float)car.rpm / redline, 0, 1);
  const float track[4] = { 1, 1, 1, 0.10f }; arc(cx, cy, R * 0.80f, R * 0.92f, ang(1.0f), ang(0.0f), track, 56);
  for (int i = 0; i < 48; i++) {   // the lit part of the arc, in segments that go from white to orange to red
    float f0 = rpmF * i / 48.0f, f1 = rpmF * (i + 1) / 48.0f, m = (f0 + f1) * 0.5f; float c[4] = { 1.0f, 1.0f - clampf((m - 0.55f) * 2.0f, 0, 1) * 0.45f - clampf((m - 0.82f) * 5, 0, 1) * 0.4f, 0.95f - clampf((m - 0.35f) * 2.5f, 0, 0.9f), 0.95f };
    if (m < 0.35f) { c[0] = 0.55f + m; c[1] = 0.9f; c[2] = 1.0f; }
    arc(cx, cy, R * 0.80f, R * 0.92f, ang(f0), ang(f1), c, 1);
  }
  for (int k = 0; k <= 8; k++) {   // ticks and numbers (thousands of rpm)
    float a = ang(k / 8.0f), c = std::cos(a), s = std::sin(a); const float* col = k >= 7 ? accent : white;
    line(cx + c * R * 0.93f, cy - s * R * 0.93f, cx + c * R * 0.99f, cy - s * R * 0.99f, 2.5f * S, col);
    text(std::to_string(k), cx + c * R * 0.68f, cy - s * R * 0.68f + 7.0f * S, 18.0f * S, dim, 1);
  }
  // Speed, units and gear.
  char sp[16]; snprintf(sp, sizeof sp, "%d", (int)std::round(game.speedKmh)); text(sp, cx, cy + 22.0f * S, 66.0f * S, white, 1); text("km/h", cx, cy + 46.0f * S, 18.0f * S, dim, 1);
  std::string gs = car.gear == -1 ? "R" : (car.speed() < 0.4 && car.gear == 1 && game.car.throttle < 0.05) ? "N" : std::to_string(car.gear); text(gs, cx, cy - 22.0f * S, 44.0f * S, accent, 1);
  // Assist lights and the nitro bar.
  const float onC[4] = { 1.0f, 0.78f, 0.1f, 1.0f }, offC[4] = { 1, 1, 1, 0.18f };
  text("ABS", cx - 40.0f * S, cy + 72.0f * S, 13.0f * S, car.absOn ? onC : offC, 1); text("ESP", cx, cy + 72.0f * S, 13.0f * S, car.espOn ? onC : offC, 1); text("TCS", cx + 40.0f * S, cy + 72.0f * S, 13.0f * S, car.tcsOn ? onC : offC, 1);
  float nx0 = cx - R * 0.55f, nx1 = cx + R * 0.55f, ny = cy + R + 10.0f * S; const float nb[4] = { 1, 1, 1, 0.15f }, nf[4] = { 0.25f, 0.85f, 1.0f, 0.95f };
  solid(nx0, ny, nx1, ny + 6.0f * S, nb); solid(nx0, ny, nx0 + (nx1 - nx0) * (float)car.nitro, ny + 6.0f * S, nf);
  // Top-right: frames per second, and a hint line that fades after a few seconds.
  char fp[32]; snprintf(fp, sizeof fp, "%d FPS", (int)std::round(fps)); text(fp, W - 20.0f * S, 34.0f * S, 18.0f * S, dim, 2);
  static const char* camNames[4] = { "WIDE CHASE", "CLOSE CHASE", "DRIVER", "HOOD" }; text(camNames[game.camMode], 24.0f * S, 40.0f * S, 20.0f * S, white, 0);
  if (time < 9.0) { float a = clampf((float)(9.0 - time), 0, 1); float hc[4] = { 1, 1, 1, 0.8f * a }; text("W / S  throttle, brake      A / D  steer      Space  handbrake      Shift  nitro      C  camera      R  reset      F11  fullscreen", W * 0.5f, H - 28.0f * S, 17.0f * S, hc, 1); }
  if (!verts.empty()) {
    UINT bytes = (UINT)(verts.size() * sizeof(V)); CBAlloc a = g.allocCB(bytes); std::memcpy(a.ptr, verts.data(), bytes);
    g.barrier(target, D3D12_RESOURCE_STATE_RENDER_TARGET); g.cmd->OMSetRenderTargets(1, &target.rtv, FALSE, nullptr); g.setViewport(r.W, r.H); g.cmd->SetPipelineState(pso.Get());
    struct DrawCB { float world[16]; float p[16]; } cb = {}; g.setDraw(g.cb(cb), block);
    D3D12_VERTEX_BUFFER_VIEW vb = { a.va, bytes, (UINT)sizeof(V) }; g.cmd->IASetVertexBuffers(0, 1, &vb); g.cmd->DrawInstanced((UINT)verts.size(), 1, 0, 0);
  }
}
