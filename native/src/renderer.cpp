#include "renderer.h"
#include <cstdio>

static const Vec3 SUN = normalize(Vec3(-0.26f, 0.30f, -0.92f));

UINT Renderer::block() { UINT b = gfx.allocSrv(SRV_TABLE); for (UINT i = 0; i < SRV_TABLE; i++) gfx.srvNull(b + i); return b; }

void Renderer::init(HWND hwnd, UINT w, UINT h, bool offscreen, const Quality& quality) {
  q = quality; W = w; H = h;
  gfx.init(hwnd, w, h, offscreen);
  { // Multisampling support.
    D3D12_FEATURE_DATA_MULTISAMPLE_QUALITY_LEVELS ms = {}; ms.Format = DXGI_FORMAT_R16G16B16A16_FLOAT;
    while (q.msaa > 1) { ms.SampleCount = q.msaa; if (SUCCEEDED(gfx.dev->CheckFeatureSupport(D3D12_FEATURE_MULTISAMPLE_QUALITY_LEVELS, &ms, sizeof ms)) && ms.NumQualityLevels > 0) break; q.msaa /= 2; }
    logf("MSAA %dx", q.msaa);
  }
  gfx.beginFrame();
  staticSrv = gfx.allocSrv(0);
  // The shadow map array (cleared to "nothing in shadow" until the shadow pass is drawn).
  float one = 1.0f;
  shadow = gfx.makeTexture(2048, 2048, DXGI_FORMAT_D32_FLOAT, 1, false, true, 4, 1, &one, true);
  blkNull = block();
  mainBlock = block(); gfx.srv2DArray(mainBlock, shadow.res.Get(), DXGI_FORMAT_R32_FLOAT, 4);
  for (UINT i = 0; i < 4; i++) gfx.cmd->ClearDepthStencilView(shadow.sliceDsv[i], D3D12_CLEAR_FLAG_DEPTH, 1.0f, 0, 0, nullptr);
  gfx.barrier(shadow, D3D12_RESOURCE_STATE_PIXEL_SHADER_RESOURCE);
  for (auto& b : userBlock) b = block();
  staticSrv = gfx.allocSrv(0);   // everything allocated after this point belongs to the resizable targets
  createTargets();
  // Pipelines.
  UINT S = (UINT)q.msaa;
  { PsoDesc d; d.file = "sky.hlsl"; d.numRT = 2; d.dsv = DXGI_FORMAT_D32_FLOAT; d.samples = S; d.depthWrite = false; d.cull = D3D12_CULL_MODE_NONE; psoSky = gfx.makePso(d); }
  { PsoDesc d; d.file = "water.hlsl"; d.numRT = 2; d.dsv = DXGI_FORMAT_D32_FLOAT; d.samples = S; d.cull = D3D12_CULL_MODE_NONE; psoWater = gfx.makePso(d); }
  auto post = [&](const char* entry, DXGI_FORMAT f, bool additive) {
    PsoDesc d; d.file = "post.hlsl"; d.vsEntry = "VSFull"; d.psEntry = entry; d.numRT = 1; d.rtv[0] = f; d.depth = false; d.depthWrite = false; d.cull = D3D12_CULL_MODE_NONE; d.blend = additive; d.additive = additive; return gfx.makePso(d);
  };
  psoBloomFirst = post("PSBloomFirst", DXGI_FORMAT_R16G16B16A16_FLOAT, false); psoBloomDown = post("PSBloomDown", DXGI_FORMAT_R16G16B16A16_FLOAT, false);
  psoBloomUp = post("PSBloomUp", DXGI_FORMAT_R16G16B16A16_FLOAT, true);
  psoAO = post("PSAO", DXGI_FORMAT_R8_UNORM, false); psoAOBlur = post("PSAOBlur", DXGI_FORMAT_R8_UNORM, false);
  psoComposite = post("PSComposite", ldrFormat, false);
  for (int inst = 0; inst < 2; inst++) for (int two = 0; two < 2; two++) {
    PsoDesc d; d.file = "mesh.hlsl"; d.numRT = 2; d.dsv = DXGI_FORMAT_D32_FLOAT; d.samples = S; d.layout = inst ? instancedLayout() : meshLayout(); if (inst) d.defines = { "INSTANCED" };
    d.cull = two ? D3D12_CULL_MODE_NONE : D3D12_CULL_MODE_BACK; psoMesh[inst][two] = gfx.makePso(d);
  }
  auto shadowPso = [&](const char* entry, std::vector<D3D12_INPUT_ELEMENT_DESC> layout) {
    PsoDesc d; d.file = "shadow.hlsl"; d.vsEntry = entry; d.psEntry = nullptr; d.numRT = 0; d.dsv = DXGI_FORMAT_D32_FLOAT; d.samples = 1; d.layout = layout; d.depthFunc = D3D12_COMPARISON_FUNC_LESS_EQUAL;
    d.cull = D3D12_CULL_MODE_NONE; d.depthBias = 1200; d.slopeBias = 2.5f; return gfx.makePso(d);
  };
  psoShMesh = shadowPso("VSMain", meshLayout()); psoShInst = shadowPso("VSInst", instancedLayout());
  psoShTerrain = shadowPso("VSTerrain", { { "POSITION", 0, DXGI_FORMAT_R32G32B32_FLOAT, 0, 0, D3D12_INPUT_CLASSIFICATION_PER_VERTEX_DATA, 0 }, { "NORMAL", 0, DXGI_FORMAT_R32G32B32_FLOAT, 0, 12, D3D12_INPUT_CLASSIFICATION_PER_VERTEX_DATA, 0 }, { "COLOR", 0, DXGI_FORMAT_R8G8B8A8_UNORM, 0, 24, D3D12_INPUT_CLASSIFICATION_PER_VERTEX_DATA, 0 } });
  terrain.init(gfx, S);
  float cam3[3] = { cam.pos.x, cam.pos.y, cam.pos.z }; (void)cam3;
}

void Renderer::createTargets() {
  UINT w = W, h = H, S = (UINT)q.msaa;
  for (Texture* t : { &msColor, &msViewDepth, &msDepth, &color, &viewDepth, &aoRaw, &aoBlur, &ldr }) gfx.releaseTexture(*t);
  for (auto& b : bloom) gfx.releaseTexture(b);
  gfx.srvRewind(staticSrv);
  float c0[4] = { 0, 0, 0, 0 }, cFar[4] = { 1e6f, 0, 0, 0 }, zero = 0.0f;
  msColor = gfx.makeTexture(w, h, DXGI_FORMAT_R16G16B16A16_FLOAT, S, true, false, 1, 1, c0);
  msViewDepth = gfx.makeTexture(w, h, DXGI_FORMAT_R32_FLOAT, S, true, false, 1, 1, cFar);
  msDepth = gfx.makeTexture(w, h, DXGI_FORMAT_D32_FLOAT, S, false, true, 1, 1, &zero, false);
  if (S > 1) { color = gfx.makeTexture(w, h, DXGI_FORMAT_R16G16B16A16_FLOAT, 1, false, false); viewDepth = gfx.makeTexture(w, h, DXGI_FORMAT_R32_FLOAT, 1, false, false); }
  UINT hw = std::max(2u, w / 2), hh = std::max(2u, h / 2);
  aoRaw = gfx.makeTexture(hw, hh, DXGI_FORMAT_R8_UNORM, 1, true, false); aoBlur = gfx.makeTexture(hw, hh, DXGI_FORMAT_R8_UNORM, 1, true, false);
  ldr = gfx.makeTexture(w, h, ldrFormat, 1, true, false, 1, 1, c0);
  nBloom = 5; UINT bw = hw, bh = hh;
  for (int i = 0; i < nBloom; i++) { bloom[i] = gfx.makeTexture(std::max(1u, bw), std::max(1u, bh), DXGI_FORMAT_R16G16B16A16_FLOAT, 1, true, false, 1, 1, c0); bw /= 2; bh /= 2; }
  sceneColor = S > 1 ? &color : &msColor; sceneDepth = S > 1 ? &viewDepth : &msViewDepth;
  blkColor = block(); gfx.srv2D(blkColor, sceneColor->res.Get(), DXGI_FORMAT_R16G16B16A16_FLOAT);
  blkDepth = block(); gfx.srv2D(blkDepth, sceneDepth->res.Get(), DXGI_FORMAT_R32_FLOAT);
  blkAO = blkDepth;
  blkAOBlur = block(); gfx.srv2D(blkAOBlur, sceneDepth->res.Get(), DXGI_FORMAT_R32_FLOAT); gfx.srv2D(blkAOBlur + 1, aoRaw.res.Get(), DXGI_FORMAT_R8_UNORM);
  for (int i = 0; i < nBloom; i++) { blkBloom[i] = block(); gfx.srv2D(blkBloom[i], bloom[i].res.Get(), DXGI_FORMAT_R16G16B16A16_FLOAT); }
  blkComposite = block(); gfx.srv2D(blkComposite, sceneColor->res.Get(), DXGI_FORMAT_R16G16B16A16_FLOAT); gfx.srv2D(blkComposite + 1, bloom[0].res.Get(), DXGI_FORMAT_R16G16B16A16_FLOAT); gfx.srv2D(blkComposite + 2, aoBlur.res.Get(), DXGI_FORMAT_R8_UNORM);
}

void Renderer::resize(UINT w, UINT h) {
  if (w == 0 || h == 0 || (w == W && h == H)) return;
  gfx.waitIdle(); gfx.resizeSwap(w, h); W = w; H = h;
  gfx.beginFrame(); createTargets(); gfx.endFrame(false); gfx.waitIdle();
}

void Renderer::fullscreen(Texture& target, ID3D12PipelineState* pso, UINT srvBlock, const float p0[4], UINT w, UINT h) {
  gfx.barrier(target, D3D12_RESOURCE_STATE_RENDER_TARGET);
  gfx.cmd->OMSetRenderTargets(1, &target.rtv, FALSE, nullptr);
  gfx.setViewport(w, h);
  gfx.cmd->SetPipelineState(pso);
  struct DrawCB { float world[16]; float p0[4], p1[4], p2[4], p3[4]; } cb = {}; std::memcpy(cb.p0, p0, 16);
  gfx.setDraw(gfx.cb(cb), srvBlock);
  gfx.cmd->DrawInstanced(3, 1, 0, 0);
}

void Renderer::frame(float dt) {
  (void)dt;
  gfx.beginFrame();
  // --- Camera and frame constants -----------------------------------------------------------------
  float yaw = cam.yaw * (float)PI / 180.0f, pitch = cam.pitch * (float)PI / 180.0f;
  forward = Vec3(std::sin(yaw) * std::cos(pitch), std::sin(pitch), -std::cos(yaw) * std::cos(pitch));
  view = lookAt(cam.pos, cam.pos + forward, Vec3(0, 1, 0));
  proj = perspectiveRZ(cam.fov * (float)PI / 180.0f, (float)W / (float)H, 0.1f, 30000.0f);
  viewProj = mul(proj, view); frustum = makeFrustum(viewProj);
  terrain.update(gfx, cam.pos); if (onBeginFrame) onBeginFrame(gfx, cam.pos);
  FrameCB f = {}; f.viewProj = viewProj; f.view = view;
  { // inverse of the view-projection (needed to turn pixels back into rays)
    Mat4 iv = Mat4::identity(); Vec3 r(view.m[0][0], view.m[0][1], view.m[0][2]), u(view.m[1][0], view.m[1][1], view.m[1][2]), b(view.m[2][0], view.m[2][1], view.m[2][2]);
    iv.m[0][0] = r.x; iv.m[1][0] = r.y; iv.m[2][0] = r.z; iv.m[0][1] = u.x; iv.m[1][1] = u.y; iv.m[2][1] = u.z; iv.m[0][2] = b.x; iv.m[1][2] = b.y; iv.m[2][2] = b.z;
    iv.m[0][3] = cam.pos.x; iv.m[1][3] = cam.pos.y; iv.m[2][3] = cam.pos.z;                       // view^-1 (rigid)
    float aspect = (float)W / (float)H, t = std::tan(cam.fov * (float)PI / 360.0f), zn = 0.1f, zf = 30000.0f;
    Mat4 ip; std::memset(ip.m, 0, sizeof ip.m);                                                    // proj^-1 for the reversed-Z projection
    ip.m[0][0] = aspect * t; ip.m[1][1] = t; ip.m[2][3] = -1; ip.m[3][2] = (zf - zn) / (zf * zn); ip.m[3][3] = 1.0f / zf;
    f.invViewProj = mul(iv, ip);
  }
  f.camPos[0] = cam.pos.x; f.camPos[1] = cam.pos.y; f.camPos[2] = cam.pos.z; f.camPos[3] = (float)time;
  f.sunDir[0] = SUN.x; f.sunDir[1] = SUN.y; f.sunDir[2] = SUN.z; f.sunDir[3] = exposure;
  const float k = 4.8f / 3.14159f; f.sunColor[0] = 1.0f * k; f.sunColor[1] = 0.552f * k; f.sunColor[2] = 0.262f * k;
  f.fogColor[0] = 0.76f; f.fogColor[1] = 0.50f; f.fogColor[2] = 0.29f; f.fogColor[3] = 0.0010f;
  f.fogParams[0] = 0.0026f; f.fogParams[1] = 0.00028f; f.fogParams[2] = 1.8f; f.fogParams[3] = 0.5f;
  f.screen[0] = (float)W; f.screen[1] = (float)H; f.screen[2] = 1.0f / W; f.screen[3] = 1.0f / H;
  f.cascade[0] = 14; f.cascade[1] = 45; f.cascade[2] = 140; f.cascade[3] = 420;
  computeCascades(f);
  f.params[0] = q.bloom; f.params[1] = q.ao ? 0.9f : 0.0f; f.params[2] = 0.02f; f.params[3] = 0.003f;
  f.params2[0] = q.sharpen; f.params2[1] = q.clarity; f.params2[2] = 0.28f; f.params2[3] = 0.12f;
  { Vec3 sp = cam.pos + SUN * 5000.0f; float cx = viewProj.m[0][0] * sp.x + viewProj.m[0][1] * sp.y + viewProj.m[0][2] * sp.z + viewProj.m[0][3], cy = viewProj.m[1][0] * sp.x + viewProj.m[1][1] * sp.y + viewProj.m[1][2] * sp.z + viewProj.m[1][3];
    float cw = viewProj.m[3][0] * sp.x + viewProj.m[3][1] * sp.y + viewProj.m[3][2] * sp.z + viewProj.m[3][3];
    f.sunScreen[0] = (cx / cw) * 0.5f + 0.5f; f.sunScreen[1] = -(cy / cw) * 0.5f + 0.5f; f.sunScreen[2] = clampf((dot(forward, SUN) - 0.15f) / 0.5f, 0, 1); }
  D3D12_GPU_VIRTUAL_ADDRESS frameVA = gfx.cb(f);

  // --- Shadows -----------------------------------------------------------------------------------------
  if (q.shadows) shadowPass(f);

  // --- The scene ----------------------------------------------------------------------------------------
  gfx.barrier(msColor, D3D12_RESOURCE_STATE_RENDER_TARGET); gfx.barrier(msViewDepth, D3D12_RESOURCE_STATE_RENDER_TARGET); gfx.barrier(msDepth, D3D12_RESOURCE_STATE_DEPTH_WRITE);
  D3D12_CPU_DESCRIPTOR_HANDLE rtvs[2] = { msColor.rtv, msViewDepth.rtv };
  gfx.cmd->OMSetRenderTargets(2, rtvs, FALSE, &msDepth.dsv);
  const float c0[4] = { 0, 0, 0, 0 }, cFar[4] = { 1e6f, 0, 0, 0 };
  gfx.cmd->ClearRenderTargetView(msColor.rtv, c0, 0, nullptr); gfx.cmd->ClearRenderTargetView(msViewDepth.rtv, cFar, 0, nullptr);
  gfx.cmd->ClearDepthStencilView(msDepth.dsv, D3D12_CLEAR_FLAG_DEPTH, 0.0f, 0, 0, nullptr);
  gfx.setViewport(W, H); gfx.bindCommon(frameVA);
  terrain.draw(gfx, frustum, mainBlock);
  if (drawWorld) drawWorld(*this, false, frustum);
  { // sea
    gfx.cmd->SetPipelineState(psoWater.Get()); struct DrawCB { float world[16]; float p[16]; } cb = {}; cb.world[0] = cb.world[5] = cb.world[10] = cb.world[15] = 1;
    gfx.setDraw(gfx.cb(cb), mainBlock); gfx.cmd->DrawInstanced(6, 1, 0, 0);
  }
  { // sky, last, only where nothing else was drawn
    gfx.cmd->SetPipelineState(psoSky.Get()); struct DrawCB { float world[16]; float p[16]; } cb = {}; cb.world[0] = cb.world[5] = cb.world[10] = cb.world[15] = 1;
    gfx.setDraw(gfx.cb(cb), mainBlock); gfx.cmd->DrawInstanced(3, 1, 0, 0);
  }
  // --- Resolve the multisampled targets ------------------------------------------------------------------------
  if (q.msaa > 1) {
    gfx.barrier(msColor, D3D12_RESOURCE_STATE_RESOLVE_SOURCE); gfx.barrier(msViewDepth, D3D12_RESOURCE_STATE_RESOLVE_SOURCE);
    gfx.barrier(color, D3D12_RESOURCE_STATE_RESOLVE_DEST); gfx.barrier(viewDepth, D3D12_RESOURCE_STATE_RESOLVE_DEST);
    gfx.cmd->ResolveSubresource(color.res.Get(), 0, msColor.res.Get(), 0, DXGI_FORMAT_R16G16B16A16_FLOAT);
    gfx.cmd->ResolveSubresource(viewDepth.res.Get(), 0, msViewDepth.res.Get(), 0, DXGI_FORMAT_R32_FLOAT);
  }
  gfx.barrier(*sceneColor, D3D12_RESOURCE_STATE_PIXEL_SHADER_RESOURCE); gfx.barrier(*sceneDepth, D3D12_RESOURCE_STATE_PIXEL_SHADER_RESOURCE);
  // --- Ambient occlusion ---------------------------------------------------------------------------------------------
  UINT hw = aoRaw.w, hh = aoRaw.h;
  if (q.ao) {
    float tanH = std::tan(cam.fov * (float)PI / 360.0f);
    float p0[4] = { 1.0f / hw, 1.0f / hh, 2.0f, tanH };
    fullscreen(aoRaw, psoAO.Get(), blkAO, p0, hw, hh); gfx.barrier(aoRaw, D3D12_RESOURCE_STATE_PIXEL_SHADER_RESOURCE);
    float p1[4] = { 1.0f / hw, 1.0f / hh, 0, 0 };
    fullscreen(aoBlur, psoAOBlur.Get(), blkAOBlur, p1, hw, hh);
  }
  gfx.barrier(aoBlur, D3D12_RESOURCE_STATE_PIXEL_SHADER_RESOURCE);
  // --- Bloom -----------------------------------------------------------------------------------------------------------------
  { float p[4] = { 1.0f / W, 1.0f / H, 0, 0 };
    fullscreen(bloom[0], psoBloomFirst.Get(), blkColor, p, bloom[0].w, bloom[0].h);
    for (int i = 0; i + 1 < nBloom; i++) { gfx.barrier(bloom[i], D3D12_RESOURCE_STATE_PIXEL_SHADER_RESOURCE); float pp[4] = { 1.0f / bloom[i].w, 1.0f / bloom[i].h, 0, 0 }; fullscreen(bloom[i + 1], psoBloomDown.Get(), blkBloom[i], pp, bloom[i + 1].w, bloom[i + 1].h); }
    for (int i = nBloom - 1; i >= 1; i--) {
      gfx.barrier(bloom[i], D3D12_RESOURCE_STATE_PIXEL_SHADER_RESOURCE); float pp[4] = { 1.0f / bloom[i].w, 1.0f / bloom[i].h, 1.0f, 0 };
      fullscreen(bloom[i - 1], psoBloomUp.Get(), blkBloom[i], pp, bloom[i - 1].w, bloom[i - 1].h);
    }
    gfx.barrier(bloom[0], D3D12_RESOURCE_STATE_PIXEL_SHADER_RESOURCE);
  }
  // --- Composite -----------------------------------------------------------------------------------------------------------------
  { float p[4] = { 0, 0, 0, 0 }; fullscreen(ldr, psoComposite.Get(), blkComposite, p, W, H); }
  if (drawHud) drawHud(gfx, ldr);
  // --- To the screen (and perhaps a file) ---------------------------------------------------------------------------------------
  bool shot = !shotPath.empty();
  if (shot) {
    gfx.barrier(ldr, D3D12_RESOURCE_STATE_COPY_SOURCE);
    D3D12_PLACED_SUBRESOURCE_FOOTPRINT fp = {}; fp.Footprint.Format = ldrFormat; fp.Footprint.Width = W; fp.Footprint.Height = H; fp.Footprint.Depth = 1; readPitch = (W * 4 + 255) & ~255u; fp.Footprint.RowPitch = readPitch;
    if (!readback) {
      D3D12_HEAP_PROPERTIES hp = { D3D12_HEAP_TYPE_READBACK }; D3D12_RESOURCE_DESC rd = {}; rd.Dimension = D3D12_RESOURCE_DIMENSION_BUFFER; rd.Width = (UINT64)readPitch * H; rd.Height = 1; rd.DepthOrArraySize = 1; rd.MipLevels = 1; rd.SampleDesc.Count = 1; rd.Layout = D3D12_TEXTURE_LAYOUT_ROW_MAJOR;
      HR(gfx.dev->CreateCommittedResource(&hp, D3D12_HEAP_FLAG_NONE, &rd, D3D12_RESOURCE_STATE_COPY_DEST, nullptr, IID_PPV_ARGS(&readback)));
    }
    D3D12_TEXTURE_COPY_LOCATION dst = {}, src = {}; dst.pResource = readback.Get(); dst.Type = D3D12_TEXTURE_COPY_TYPE_PLACED_FOOTPRINT; dst.PlacedFootprint = fp;
    src.pResource = ldr.res.Get(); src.Type = D3D12_TEXTURE_COPY_TYPE_SUBRESOURCE_INDEX; src.SubresourceIndex = 0;
    gfx.cmd->CopyTextureRegion(&dst, 0, 0, 0, &src, nullptr);
  }
  if (gfx.hasSwap) {
    UINT bi = gfx.backIndex(); ID3D12Resource* bb = gfx.backBuf[bi].Get();
    gfx.barrier(ldr, D3D12_RESOURCE_STATE_COPY_SOURCE);
    D3D12_RESOURCE_BARRIER b = {}; b.Type = D3D12_RESOURCE_BARRIER_TYPE_TRANSITION; b.Transition.pResource = bb; b.Transition.Subresource = D3D12_RESOURCE_BARRIER_ALL_SUBRESOURCES;
    b.Transition.StateBefore = D3D12_RESOURCE_STATE_PRESENT; b.Transition.StateAfter = D3D12_RESOURCE_STATE_COPY_DEST; gfx.cmd->ResourceBarrier(1, &b);
    gfx.cmd->CopyResource(bb, ldr.res.Get());
    std::swap(b.Transition.StateBefore, b.Transition.StateAfter); gfx.cmd->ResourceBarrier(1, &b);
  }
  gfx.endFrame(true);
  if (shot) { gfx.waitIdle(); saveShot(); shotPath.clear(); }
}

void Renderer::saveShot() {
  void* p = nullptr; D3D12_RANGE r = { 0, (SIZE_T)readPitch * H }; HR(readback->Map(0, &r, &p));
  saveBMP(shotPath.c_str(), (const uint8_t*)p, W, H, readPitch); readback->Unmap(0, nullptr);
  logf("screenshot saved: %s (%ux%u)", shotPath.c_str(), W, H);
}
void saveBMP(const char* path, const uint8_t* rgba, UINT w, UINT h, UINT pitch) {
  FILE* f = fopen(path, "wb"); if (!f) return;
  UINT rowBytes = (w * 3 + 3) & ~3u, size = rowBytes * h; uint8_t hdr[54] = { 'B', 'M' };
  auto put32 = [&](int o, uint32_t v) { std::memcpy(hdr + o, &v, 4); };
  put32(2, 54 + size); put32(10, 54); put32(14, 40); put32(18, w); put32(22, h); hdr[26] = 1; hdr[28] = 24; put32(34, size);
  fwrite(hdr, 1, 54, f); std::vector<uint8_t> row(rowBytes);
  for (int y = (int)h - 1; y >= 0; y--) { const uint8_t* s = rgba + (size_t)y * pitch; for (UINT x = 0; x < w; x++) { row[x * 3] = s[x * 4 + 2]; row[x * 3 + 1] = s[x * 4 + 1]; row[x * 3 + 2] = s[x * 4]; } fwrite(row.data(), 1, rowBytes, f); }
  fclose(f);
}

// ---------------------------------------------------------------------------------------------------------------
// Cascaded shadows: each cascade is an orthographic box fitted round a slice of the camera frustum,
// snapped to whole shadow texels so the shadows don't crawl as the camera moves.
void Renderer::computeCascades(FrameCB& f) {
  const float starts[4] = { 0.1f, f.cascade[0], f.cascade[1], f.cascade[2] }, ext[4] = { 120, 200, 350, 700 }, worldBias[4] = { 0.035f, 0.07f, 0.16f, 0.45f };
  Vec3 right = normalize(cross(forward, Vec3(0, 1, 0))), up = cross(right, forward);
  float tanH = std::tan(cam.fov * (float)PI / 360.0f), tanW = tanH * (float)W / (float)H;
  for (int c = 0; c < 4; c++) {
    float n = starts[c], fa = f.cascade[c]; Vec3 centre, corners[8]; int k = 0;
    for (float d : { n, fa }) for (int sy = -1; sy <= 1; sy += 2) for (int sx = -1; sx <= 1; sx += 2) { corners[k] = cam.pos + forward * d + right * (sx * tanW * d) + up * (sy * tanH * d); centre += corners[k]; k++; }
    centre = centre * (1.0f / 8.0f); float R = 0; for (auto& p : corners) R = std::max(R, length(p - centre)); R = std::ceil(R * 16.0f) / 16.0f;
    float dist = R + ext[c]; Mat4 lv = lookAt(centre + SUN * dist, centre, Vec3(0, 1, 0));
    Vec3 lc = transformPoint(lv, centre); float texel = 2.0f * R / 2048.0f; lc.x = std::floor(lc.x / texel + 0.5f) * texel; lc.y = std::floor(lc.y / texel + 0.5f) * texel;
    float range = dist + R + 60.0f; cascadeVP[c] = mul(orthoRH(lc.x - R, lc.x + R, lc.y - R, lc.y + R, 0.0f, range), lv); f.shadowVP[c] = cascadeVP[c];
    f.shadowBias[c] = worldBias[c] / range; f.shadowTexel[c] = texel;
  }
}
void Renderer::shadowPass(const FrameCB& f) {
  gfx.barrier(shadow, D3D12_RESOURCE_STATE_DEPTH_WRITE);
  for (int c = 0; c < 4; c++) {
    FrameCB sf = f; sf.viewProj = cascadeVP[c]; D3D12_GPU_VIRTUAL_ADDRESS va = gfx.cb(sf);
    gfx.cmd->ClearDepthStencilView(shadow.sliceDsv[c], D3D12_CLEAR_FLAG_DEPTH, 1.0f, 0, 0, nullptr);
    gfx.cmd->OMSetRenderTargets(0, nullptr, FALSE, &shadow.sliceDsv[c]); gfx.setViewport(2048, 2048); gfx.bindCommon(va);
    Frustum fr = makeFrustum(cascadeVP[c]); inShadow = true;
    if (c < 3) terrain.draw(gfx, fr, blkNull, psoShTerrain.Get(), 1);
    if (drawWorld) drawWorld(*this, true, fr);
    inShadow = false;
  }
  gfx.barrier(shadow, D3D12_RESOURCE_STATE_PIXEL_SHADER_RESOURCE);
}
void Renderer::drawMeshMat(const GpuMesh& m, const Mat4& world, const Material& mat, const Buffer* inst, UINT instances) {
  if (!m.indexCount) return;
  struct DrawCB { Mat4 world; float p0[4], p1[4], p2[4], p3[4]; } cb = {}; cb.world = world;
  cb.p0[0] = mat.type; cb.p0[1] = mat.rough; cb.p0[2] = mat.metal; cb.p0[3] = mat.emissive; cb.p1[0] = mat.tint[0]; cb.p1[1] = mat.tint[1]; cb.p1[2] = mat.tint[2]; cb.p1[3] = 1; cb.p3[0] = mat.twoSided ? 1.0f : 0.0f;
  if (inShadow) { gfx.cmd->SetPipelineState((inst ? psoShInst : psoShMesh).Get()); gfx.setDraw(gfx.cb(cb), blkNull); }
  else { gfx.cmd->SetPipelineState(psoMesh[inst ? 1 : 0][mat.twoSided ? 1 : 0].Get()); gfx.setDraw(gfx.cb(cb), mainBlock); }
  drawMesh(gfx, m, instances, inst);
}
