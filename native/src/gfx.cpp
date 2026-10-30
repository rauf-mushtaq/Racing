#include "gfx.h"
#include <cstdio>
#include <cstdarg>
#include <fstream>
#include <sstream>

static FILE* g_log = nullptr;
void logf(const char* fmt, ...) {
  char buf[2048]; va_list ap; va_start(ap, fmt); vsnprintf(buf, sizeof buf, fmt, ap); va_end(ap);
  fprintf(stderr, "%s\n", buf); fflush(stderr);
  if (!g_log) g_log = fopen("sunset_native.log", "w");
  if (g_log) { fprintf(g_log, "%s\n", buf); fflush(g_log); }
}
[[noreturn]] void gfxFatal(const char* what, HRESULT hr) {
  char msg[512]; snprintf(msg, sizeof msg, "Direct3D call failed (0x%08lx):\n%s\n\nSee sunset_native.log.", (unsigned long)hr, what);
  if (!GetEnvironmentVariableA("SUNSET_HEADLESS", nullptr, 0)) MessageBoxA(nullptr, msg, "Sunset City", MB_OK | MB_ICONERROR);
  ExitProcess(1);
}

// ---------------------------------------------------------------------------------------------
void Gfx::init(HWND hwnd, UINT w, UINT h, bool offscreenOnly) {
  width = w; height = h;
  if (GetEnvironmentVariableA("SUNSET_D3D_DEBUG", nullptr, 0)) { ComPtr<ID3D12Debug> dbg; if (SUCCEEDED(D3D12GetDebugInterface(IID_PPV_ARGS(&dbg)))) dbg->EnableDebugLayer(); }
  ComPtr<IDXGIFactory4> factory; HR(CreateDXGIFactory1(IID_PPV_ARGS(&factory)));
  // Pick the adapter with the most video memory that isn't the software fallback.
  ComPtr<IDXGIAdapter1> best; SIZE_T bestMem = 0;
  for (UINT i = 0;; i++) {
    ComPtr<IDXGIAdapter1> a; if (factory->EnumAdapters1(i, &a) == DXGI_ERROR_NOT_FOUND) break;
    DXGI_ADAPTER_DESC1 d; a->GetDesc1(&d);
    if (d.Flags & DXGI_ADAPTER_FLAG_SOFTWARE) continue;
    if (SUCCEEDED(D3D12CreateDevice(a.Get(), D3D_FEATURE_LEVEL_11_0, __uuidof(ID3D12Device), nullptr)) && d.DedicatedVideoMemory >= bestMem) { best = a; bestMem = d.DedicatedVideoMemory; }
  }
  if (best) { DXGI_ADAPTER_DESC1 d; best->GetDesc1(&d); char n[256]; WideCharToMultiByte(CP_UTF8, 0, d.Description, -1, n, 256, nullptr, nullptr); logf("GPU: %s (%.0f MB)", n, bestMem / 1048576.0); }
  HR(D3D12CreateDevice(best.Get(), D3D_FEATURE_LEVEL_11_0, IID_PPV_ARGS(&dev)));
  D3D12_COMMAND_QUEUE_DESC qd = {}; qd.Type = D3D12_COMMAND_LIST_TYPE_DIRECT;
  HR(dev->CreateCommandQueue(&qd, IID_PPV_ARGS(&queue)));
  for (int i = 0; i < FRAMES; i++) HR(dev->CreateCommandAllocator(D3D12_COMMAND_LIST_TYPE_DIRECT, IID_PPV_ARGS(&alloc[i])));
  HR(dev->CreateCommandList(0, D3D12_COMMAND_LIST_TYPE_DIRECT, alloc[0].Get(), nullptr, IID_PPV_ARGS(&cmd)));
  cmd->Close();
  HR(dev->CreateFence(0, D3D12_FENCE_FLAG_NONE, IID_PPV_ARGS(&fence)));
  fenceEvent = CreateEvent(nullptr, FALSE, FALSE, nullptr);
  auto heap = [&](D3D12_DESCRIPTOR_HEAP_TYPE t, UINT n, bool visible, ComPtr<ID3D12DescriptorHeap>& out, UINT& inc) {
    D3D12_DESCRIPTOR_HEAP_DESC d = {}; d.Type = t; d.NumDescriptors = n; d.Flags = visible ? D3D12_DESCRIPTOR_HEAP_FLAG_SHADER_VISIBLE : D3D12_DESCRIPTOR_HEAP_FLAG_NONE;
    HR(dev->CreateDescriptorHeap(&d, IID_PPV_ARGS(&out))); inc = dev->GetDescriptorHandleIncrementSize(t);
  };
  heap(D3D12_DESCRIPTOR_HEAP_TYPE_RTV, 128, false, rtvHeap, rtvInc);
  heap(D3D12_DESCRIPTOR_HEAP_TYPE_DSV, 64, false, dsvHeap, dsvInc);
  heap(D3D12_DESCRIPTOR_HEAP_TYPE_CBV_SRV_UAV, 2048, true, srvHeap, srvInc);
  { UINT si; heap(D3D12_DESCRIPTOR_HEAP_TYPE_SAMPLER, 4, true, sampHeap, si);   // s0 linear wrap, s1 linear clamp, s2 shadow comparison
    D3D12_CPU_DESCRIPTOR_HANDLE h = sampHeap->GetCPUDescriptorHandleForHeapStart();
    auto mk = [&](D3D12_FILTER f, D3D12_TEXTURE_ADDRESS_MODE m, D3D12_COMPARISON_FUNC c) { D3D12_SAMPLER_DESC d = {}; d.Filter = f; d.AddressU = d.AddressV = d.AddressW = m; d.MaxAnisotropy = 1; d.ComparisonFunc = c; d.MaxLOD = D3D12_FLOAT32_MAX; dev->CreateSampler(&d, h); h.ptr += si; };
    mk(D3D12_FILTER_MIN_MAG_MIP_LINEAR, D3D12_TEXTURE_ADDRESS_MODE_WRAP, D3D12_COMPARISON_FUNC_NEVER);
    mk(D3D12_FILTER_MIN_MAG_MIP_LINEAR, D3D12_TEXTURE_ADDRESS_MODE_CLAMP, D3D12_COMPARISON_FUNC_NEVER);
    mk(D3D12_FILTER_COMPARISON_MIN_MAG_LINEAR_MIP_POINT, D3D12_TEXTURE_ADDRESS_MODE_CLAMP, D3D12_COMPARISON_FUNC_LESS_EQUAL); }
  // The constant ring: one slice per frame in flight.
  D3D12_HEAP_PROPERTIES hp = { D3D12_HEAP_TYPE_UPLOAD }; D3D12_RESOURCE_DESC rd = {};
  rd.Dimension = D3D12_RESOURCE_DIMENSION_BUFFER; rd.Width = ringSize; rd.Height = 1; rd.DepthOrArraySize = 1; rd.MipLevels = 1; rd.SampleDesc.Count = 1; rd.Layout = D3D12_TEXTURE_LAYOUT_ROW_MAJOR;
  HR(dev->CreateCommittedResource(&hp, D3D12_HEAP_FLAG_NONE, &rd, D3D12_RESOURCE_STATE_GENERIC_READ, nullptr, IID_PPV_ARGS(&ring)));
  D3D12_RANGE none = { 0, 0 }; HR(ring->Map(0, &none, (void**)&ringPtr));
  createRootSig();
  // Null SRVs fill slot 0..7 so a pass that uses fewer textures is still valid.
  allocSrv(SRV_TABLE); for (UINT i = 0; i < SRV_TABLE; i++) srvNull(i);
  hasSwap = !offscreenOnly;
  if (hasSwap) {
    ComPtr<IDXGISwapChain1> sc; DXGI_SWAP_CHAIN_DESC1 sd = {};
    sd.Width = w; sd.Height = h; sd.Format = DXGI_FORMAT_R8G8B8A8_UNORM; sd.SampleDesc.Count = 1; sd.BufferUsage = DXGI_USAGE_RENDER_TARGET_OUTPUT; sd.BufferCount = FRAMES; sd.SwapEffect = DXGI_SWAP_EFFECT_FLIP_DISCARD;
    HR(factory->CreateSwapChainForHwnd(queue.Get(), hwnd, &sd, nullptr, nullptr, &sc));
    factory->MakeWindowAssociation(hwnd, DXGI_MWA_NO_ALT_ENTER);
    HR(sc.As(&swap)); createSwapTargets();
  }
  frameIdx = FRAMES - 1;
}

void Gfx::createSwapTargets() {
  for (UINT i = 0; i < FRAMES; i++) {
    HR(swap->GetBuffer(i, IID_PPV_ARGS(&backBuf[i])));
    backRtv[i] = rtvHeap->GetCPUDescriptorHandleForHeapStart(); backRtv[i].ptr += (SIZE_T)(120 + i) * rtvInc;   // slots 120.. are reserved for the swap chain
    dev->CreateRenderTargetView(backBuf[i].Get(), nullptr, backRtv[i]);
  }
}
void Gfx::resizeSwap(UINT w, UINT h) {
  if (!hasSwap || (w == width && h == height) || w == 0 || h == 0) return;
  waitIdle(); for (auto& b : backBuf) b.Reset();
  HR(swap->ResizeBuffers(FRAMES, w, h, DXGI_FORMAT_R8G8B8A8_UNORM, 0));
  width = w; height = h; createSwapTargets();
}

void Gfx::createRootSig() {
  // b0 frame constants, b1 per-draw constants, t0..t7 in a table, and the three samplers in a table.
  // (The samplers are a table rather than static samplers: it is just as valid, and the Vulkan
  // translation layer Wine uses has a tight limit on descriptor sets.)
  D3D12_DESCRIPTOR_RANGE range = { D3D12_DESCRIPTOR_RANGE_TYPE_SRV, SRV_TABLE, 0, 0, 0xffffffffu };
  D3D12_DESCRIPTOR_RANGE srange = { D3D12_DESCRIPTOR_RANGE_TYPE_SAMPLER, 3, 0, 0, 0xffffffffu };
  D3D12_ROOT_PARAMETER p[4] = {};
  p[0].ParameterType = D3D12_ROOT_PARAMETER_TYPE_CBV; p[0].Descriptor = { 0, 0 }; p[0].ShaderVisibility = D3D12_SHADER_VISIBILITY_ALL;
  p[1].ParameterType = D3D12_ROOT_PARAMETER_TYPE_CBV; p[1].Descriptor = { 1, 0 }; p[1].ShaderVisibility = D3D12_SHADER_VISIBILITY_ALL;
  p[2].ParameterType = D3D12_ROOT_PARAMETER_TYPE_DESCRIPTOR_TABLE; p[2].DescriptorTable = { 1, &range }; p[2].ShaderVisibility = D3D12_SHADER_VISIBILITY_ALL;
  p[3].ParameterType = D3D12_ROOT_PARAMETER_TYPE_DESCRIPTOR_TABLE; p[3].DescriptorTable = { 1, &srange }; p[3].ShaderVisibility = D3D12_SHADER_VISIBILITY_PIXEL;
  D3D12_ROOT_SIGNATURE_DESC rs = { 4, p, 0, nullptr, D3D12_ROOT_SIGNATURE_FLAG_ALLOW_INPUT_ASSEMBLER_INPUT_LAYOUT };
  ComPtr<ID3DBlob> blob, err;
  if (FAILED(D3D12SerializeRootSignature(&rs, D3D_ROOT_SIGNATURE_VERSION_1, &blob, &err))) { logf("root signature: %s", err ? (char*)err->GetBufferPointer() : "?"); gfxFatal("D3D12SerializeRootSignature", E_FAIL); }
  HR(dev->CreateRootSignature(0, blob->GetBufferPointer(), blob->GetBufferSize(), IID_PPV_ARGS(&rootSig)));
}

// ---------------------------------------------------------------------------------------------
void Gfx::collect() {
  UINT64 done = fence->GetCompletedValue();
  while (!garbage.empty() && garbage.front().first <= done) garbage.pop_front();
}
void Gfx::release(ComPtr<ID3D12Resource> r) { if (r) garbage.push_back({ fenceVal + 1, r }); }

void Gfx::beginFrame() {
  frameIdx = (frameIdx + 1) % FRAMES;
  if (fence->GetCompletedValue() < frameFence[frameIdx]) { fence->SetEventOnCompletion(frameFence[frameIdx], fenceEvent); WaitForSingleObject(fenceEvent, INFINITE); }
  collect();
  HR(alloc[frameIdx]->Reset()); HR(cmd->Reset(alloc[frameIdx].Get(), nullptr));
  ID3D12DescriptorHeap* heaps[] = { srvHeap.Get(), sampHeap.Get() }; cmd->SetDescriptorHeaps(2, heaps);
  ringOff = 0;
}
void Gfx::endFrame(bool present) {
  HR(cmd->Close()); ID3D12CommandList* l[] = { cmd.Get() }; queue->ExecuteCommandLists(1, l);
  if (present && hasSwap) { HRESULT hr = swap->Present(1, 0); if (FAILED(hr)) logf("Present failed 0x%08lx", (unsigned long)hr); }
  fenceVal++; HR(queue->Signal(fence.Get(), fenceVal)); frameFence[frameIdx] = fenceVal;
}
void Gfx::waitIdle() {
  fenceVal++; HR(queue->Signal(fence.Get(), fenceVal));
  fence->SetEventOnCompletion(fenceVal, fenceEvent); WaitForSingleObject(fenceEvent, INFINITE);
  for (auto& f : frameFence) f = std::min(f, fenceVal);
  collect();
}

CBAlloc Gfx::allocCB(UINT size) {
  UINT per = ringSize / FRAMES, aligned = (size + 255) & ~255u;
  if (ringOff + aligned > per) { logf("constant ring overflow"); ringOff = 0; }
  UINT off = frameIdx * per + ringOff; ringOff += aligned;
  return { ring->GetGPUVirtualAddress() + off, ringPtr + off };
}

Buffer Gfx::makeBuffer(const void* data, UINT size, UINT stride, UINT count) {
  Buffer b; b.size = size; b.stride = stride; b.count = count;
  D3D12_HEAP_PROPERTIES def = { D3D12_HEAP_TYPE_DEFAULT }, up = { D3D12_HEAP_TYPE_UPLOAD };
  D3D12_RESOURCE_DESC rd = {}; rd.Dimension = D3D12_RESOURCE_DIMENSION_BUFFER; rd.Width = size ? size : 4; rd.Height = 1; rd.DepthOrArraySize = 1; rd.MipLevels = 1; rd.SampleDesc.Count = 1; rd.Layout = D3D12_TEXTURE_LAYOUT_ROW_MAJOR;
  HR(dev->CreateCommittedResource(&def, D3D12_HEAP_FLAG_NONE, &rd, D3D12_RESOURCE_STATE_COPY_DEST, nullptr, IID_PPV_ARGS(&b.res)));
  ComPtr<ID3D12Resource> stage; HR(dev->CreateCommittedResource(&up, D3D12_HEAP_FLAG_NONE, &rd, D3D12_RESOURCE_STATE_GENERIC_READ, nullptr, IID_PPV_ARGS(&stage)));
  void* p = nullptr; D3D12_RANGE none = { 0, 0 }; HR(stage->Map(0, &none, &p)); std::memcpy(p, data, size); stage->Unmap(0, nullptr);
  cmd->CopyBufferRegion(b.res.Get(), 0, stage.Get(), 0, size);
  D3D12_RESOURCE_BARRIER br = {}; br.Type = D3D12_RESOURCE_BARRIER_TYPE_TRANSITION; br.Transition.pResource = b.res.Get(); br.Transition.Subresource = D3D12_RESOURCE_BARRIER_ALL_SUBRESOURCES;
  br.Transition.StateBefore = D3D12_RESOURCE_STATE_COPY_DEST; br.Transition.StateAfter = D3D12_RESOURCE_STATE_GENERIC_READ; cmd->ResourceBarrier(1, &br);
  release(stage);
  return b;
}

static DXGI_FORMAT typelessOf(DXGI_FORMAT f) { return f == DXGI_FORMAT_D32_FLOAT ? DXGI_FORMAT_R32_TYPELESS : f; }
Texture Gfx::makeTexture(UINT w, UINT h, DXGI_FORMAT fmt, UINT samples, bool rt, bool ds, UINT slices, UINT mips, const float* clear, bool shaderRes) {
  Texture t; t.w = w; t.h = h; t.fmt = fmt; t.samples = samples; t.slices = slices;
  D3D12_HEAP_PROPERTIES hp = { D3D12_HEAP_TYPE_DEFAULT }; D3D12_RESOURCE_DESC rd = {};
  rd.Dimension = D3D12_RESOURCE_DIMENSION_TEXTURE2D; rd.Width = w; rd.Height = h; rd.DepthOrArraySize = (UINT16)slices; rd.MipLevels = (UINT16)mips;
  rd.Format = (ds && shaderRes) ? typelessOf(fmt) : fmt; rd.SampleDesc.Count = samples; rd.Layout = D3D12_TEXTURE_LAYOUT_UNKNOWN;
  if (rt) rd.Flags |= D3D12_RESOURCE_FLAG_ALLOW_RENDER_TARGET; if (ds) rd.Flags |= D3D12_RESOURCE_FLAG_ALLOW_DEPTH_STENCIL;
  D3D12_CLEAR_VALUE cv = {}; D3D12_CLEAR_VALUE* pcv = nullptr;
  if (rt || ds) { cv.Format = fmt; if (ds) { cv.DepthStencil.Depth = clear ? clear[0] : 0.0f; } else if (clear) { for (int i = 0; i < 4; i++) cv.Color[i] = clear[i]; } pcv = &cv; }
  t.state = ds ? D3D12_RESOURCE_STATE_DEPTH_WRITE : rt ? D3D12_RESOURCE_STATE_RENDER_TARGET : D3D12_RESOURCE_STATE_COMMON;
  HR(dev->CreateCommittedResource(&hp, D3D12_HEAP_FLAG_NONE, &rd, t.state, pcv, IID_PPV_ARGS(&t.res)));
  if (rt) makeRtv(t);
  if (ds) makeDsv(t);
  return t;
}
Texture Gfx::makeTextureData(UINT w, UINT h, DXGI_FORMAT fmt, const void* data, UINT bpp) {
  Texture t; t.w = w; t.h = h; t.fmt = fmt; D3D12_HEAP_PROPERTIES def = { D3D12_HEAP_TYPE_DEFAULT }, up = { D3D12_HEAP_TYPE_UPLOAD };
  D3D12_RESOURCE_DESC rd = {}; rd.Dimension = D3D12_RESOURCE_DIMENSION_TEXTURE2D; rd.Width = w; rd.Height = h; rd.DepthOrArraySize = 1; rd.MipLevels = 1; rd.Format = fmt; rd.SampleDesc.Count = 1; rd.Layout = D3D12_TEXTURE_LAYOUT_UNKNOWN;
  HR(dev->CreateCommittedResource(&def, D3D12_HEAP_FLAG_NONE, &rd, D3D12_RESOURCE_STATE_COPY_DEST, nullptr, IID_PPV_ARGS(&t.res)));
  UINT pitch = (w * bpp + 255) & ~255u; D3D12_RESOURCE_DESC bd = {}; bd.Dimension = D3D12_RESOURCE_DIMENSION_BUFFER; bd.Width = (UINT64)pitch * h; bd.Height = 1; bd.DepthOrArraySize = 1; bd.MipLevels = 1; bd.SampleDesc.Count = 1; bd.Layout = D3D12_TEXTURE_LAYOUT_ROW_MAJOR;
  ComPtr<ID3D12Resource> stage; HR(dev->CreateCommittedResource(&up, D3D12_HEAP_FLAG_NONE, &bd, D3D12_RESOURCE_STATE_GENERIC_READ, nullptr, IID_PPV_ARGS(&stage)));
  UINT8* p = nullptr; D3D12_RANGE none = { 0, 0 }; HR(stage->Map(0, &none, (void**)&p)); for (UINT y = 0; y < h; y++) std::memcpy(p + (size_t)y * pitch, (const UINT8*)data + (size_t)y * w * bpp, (size_t)w * bpp); stage->Unmap(0, nullptr);
  D3D12_TEXTURE_COPY_LOCATION dst = {}, src = {}; dst.pResource = t.res.Get(); dst.Type = D3D12_TEXTURE_COPY_TYPE_SUBRESOURCE_INDEX; src.pResource = stage.Get(); src.Type = D3D12_TEXTURE_COPY_TYPE_PLACED_FOOTPRINT;
  src.PlacedFootprint.Footprint = { fmt, w, h, 1, pitch }; cmd->CopyTextureRegion(&dst, 0, 0, 0, &src, nullptr);
  t.state = D3D12_RESOURCE_STATE_COPY_DEST; barrier(t, D3D12_RESOURCE_STATE_PIXEL_SHADER_RESOURCE); release(stage); return t;
}
void Gfx::makeRtv(Texture& t, UINT mip) {
  t.rtv = rtvHeap->GetCPUDescriptorHandleForHeapStart(); t.rtv.ptr += (SIZE_T)(rtvUsed++) * rtvInc;
  if (rtvUsed >= 120) { logf("out of RTV descriptors"); gfxFatal("rtv heap", E_FAIL); }
  D3D12_RENDER_TARGET_VIEW_DESC d = {}; d.Format = t.fmt;
  if (t.samples > 1) d.ViewDimension = D3D12_RTV_DIMENSION_TEXTURE2DMS; else { d.ViewDimension = D3D12_RTV_DIMENSION_TEXTURE2D; d.Texture2D.MipSlice = mip; }
  dev->CreateRenderTargetView(t.res.Get(), &d, t.rtv);
}
void Gfx::makeDsv(Texture& t) {
  auto one = [&](UINT slice) {
    D3D12_CPU_DESCRIPTOR_HANDLE h = dsvHeap->GetCPUDescriptorHandleForHeapStart(); h.ptr += (SIZE_T)(dsvUsed++) * dsvInc;
    D3D12_DEPTH_STENCIL_VIEW_DESC d = {}; d.Format = t.fmt;
    if (t.samples > 1) d.ViewDimension = D3D12_DSV_DIMENSION_TEXTURE2DMS;
    else if (t.slices > 1) { d.ViewDimension = D3D12_DSV_DIMENSION_TEXTURE2DARRAY; d.Texture2DArray = { 0, slice, 1 }; }
    else d.ViewDimension = D3D12_DSV_DIMENSION_TEXTURE2D;
    dev->CreateDepthStencilView(t.res.Get(), &d, h); return h;
  };
  if (t.slices > 1 && t.samples == 1) for (UINT i = 0; i < t.slices; i++) t.sliceDsv.push_back(one(i));
  t.dsv = (t.slices > 1 && t.samples == 1) ? t.sliceDsv[0] : one(0);
}
void Gfx::barrier(Texture& t, D3D12_RESOURCE_STATES to) {
  if (t.state == to) return;
  D3D12_RESOURCE_BARRIER b = {}; b.Type = D3D12_RESOURCE_BARRIER_TYPE_TRANSITION; b.Transition.pResource = t.res.Get(); b.Transition.Subresource = D3D12_RESOURCE_BARRIER_ALL_SUBRESOURCES;
  b.Transition.StateBefore = t.state; b.Transition.StateAfter = to; cmd->ResourceBarrier(1, &b); t.state = to;
}

UINT Gfx::allocSrv(UINT n) { UINT s = srvUsed; srvUsed += n; if (srvUsed > 2048) gfxFatal("srv heap full", E_FAIL); return s; }
void Gfx::srvNull(UINT slot) {
  D3D12_SHADER_RESOURCE_VIEW_DESC d = {}; d.Format = DXGI_FORMAT_R8G8B8A8_UNORM; d.ViewDimension = D3D12_SRV_DIMENSION_TEXTURE2D; d.Shader4ComponentMapping = D3D12_DEFAULT_SHADER_4_COMPONENT_MAPPING; d.Texture2D.MipLevels = 1;
  dev->CreateShaderResourceView(nullptr, &d, srvCpu(slot));
}
void Gfx::srv2D(UINT slot, ID3D12Resource* r, DXGI_FORMAT f, UINT mips) {
  D3D12_SHADER_RESOURCE_VIEW_DESC d = {}; d.Format = f; d.ViewDimension = D3D12_SRV_DIMENSION_TEXTURE2D; d.Shader4ComponentMapping = D3D12_DEFAULT_SHADER_4_COMPONENT_MAPPING; d.Texture2D.MipLevels = mips;
  dev->CreateShaderResourceView(r, &d, srvCpu(slot));
}
void Gfx::srv2DArray(UINT slot, ID3D12Resource* r, DXGI_FORMAT f, UINT slices) {
  D3D12_SHADER_RESOURCE_VIEW_DESC d = {}; d.Format = f; d.ViewDimension = D3D12_SRV_DIMENSION_TEXTURE2DARRAY; d.Shader4ComponentMapping = D3D12_DEFAULT_SHADER_4_COMPONENT_MAPPING;
  d.Texture2DArray.MipLevels = 1; d.Texture2DArray.ArraySize = slices; dev->CreateShaderResourceView(r, &d, srvCpu(slot));
}
void Gfx::srv2DMS(UINT slot, ID3D12Resource* r, DXGI_FORMAT f) {
  D3D12_SHADER_RESOURCE_VIEW_DESC d = {}; d.Format = f; d.ViewDimension = D3D12_SRV_DIMENSION_TEXTURE2DMS; d.Shader4ComponentMapping = D3D12_DEFAULT_SHADER_4_COMPONENT_MAPPING;
  dev->CreateShaderResourceView(r, &d, srvCpu(slot));
}

void Gfx::bindCommon(D3D12_GPU_VIRTUAL_ADDRESS frameCB) {
  cmd->SetGraphicsRootSignature(rootSig.Get()); cmd->SetGraphicsRootConstantBufferView(0, frameCB);
  cmd->SetGraphicsRootDescriptorTable(3, sampHeap->GetGPUDescriptorHandleForHeapStart());
  cmd->IASetPrimitiveTopology(D3D_PRIMITIVE_TOPOLOGY_TRIANGLELIST);
}
void Gfx::setDraw(D3D12_GPU_VIRTUAL_ADDRESS drawCB, UINT firstSrvSlot) {
  cmd->SetGraphicsRootConstantBufferView(1, drawCB); cmd->SetGraphicsRootDescriptorTable(2, srvGpu(firstSrvSlot));
}
void Gfx::setViewport(UINT w, UINT h) {
  D3D12_VIEWPORT vp = { 0, 0, (float)w, (float)h, 0, 1 }; D3D12_RECT sc = { 0, 0, (LONG)w, (LONG)h };
  cmd->RSSetViewports(1, &vp); cmd->RSSetScissorRects(1, &sc);
}

// ---------------------------------------------------------------------------------------------
// Shaders: HLSL source files compiled at start-up with the system's d3dcompiler_47.
struct FileInclude : ID3DInclude {
  std::string dir; std::vector<std::string> keep;
  HRESULT STDMETHODCALLTYPE Open(D3D_INCLUDE_TYPE, LPCSTR name, LPCVOID, LPCVOID* data, UINT* bytes) override {
    std::ifstream f(dir + "/" + name, std::ios::binary); if (!f) return E_FAIL;
    std::stringstream ss; ss << f.rdbuf(); keep.push_back(ss.str()); *data = keep.back().data(); *bytes = (UINT)keep.back().size(); return S_OK;
  }
  HRESULT STDMETHODCALLTYPE Close(LPCVOID) override { return S_OK; }
};
ComPtr<ID3DBlob> Gfx::compile(const char* file, const char* entry, const char* profile, const std::vector<std::string>& defines) {
  std::string key = std::string(file) + "|" + entry + "|" + profile; for (auto& d : defines) key += "|" + d;
  auto it = shaderCache.find(key); if (it != shaderCache.end()) return it->second;
  std::ifstream f(shaderDir + "/" + file, std::ios::binary);
  if (!f) { logf("cannot open shader %s/%s", shaderDir.c_str(), file); gfxFatal("shader file missing", E_FAIL); }
  std::stringstream ss; ss << f.rdbuf(); std::string src = ss.str();
  std::vector<D3D_SHADER_MACRO> macros; for (auto& d : defines) macros.push_back({ d.c_str(), "1" }); macros.push_back({ nullptr, nullptr });
  FileInclude inc; inc.dir = shaderDir;
  ComPtr<ID3DBlob> code, err;
  HRESULT hr = D3DCompile(src.data(), src.size(), file, macros.data(), &inc, entry, profile, D3DCOMPILE_ENABLE_STRICTNESS | D3DCOMPILE_PACK_MATRIX_ROW_MAJOR | D3DCOMPILE_OPTIMIZATION_LEVEL2, 0, &code, &err);
  if (err && err->GetBufferSize()) logf("%s [%s %s]: %s", file, entry, profile, (char*)err->GetBufferPointer());
  if (FAILED(hr)) { if (GetEnvironmentVariableA("SUNSET_NOFATAL", nullptr, 0)) return nullptr; gfxFatal((std::string("HLSL compile failed: ") + file + " " + entry).c_str(), hr); }
  shaderCache[key] = code; return code;
}
bool Gfx::tryCompile(const char* file, const char* entry, const char* profile) { return compile(file, entry, profile, {}) != nullptr; }
ComPtr<ID3D12PipelineState> Gfx::makePso(const PsoDesc& d) {
  ComPtr<ID3DBlob> vs = compile(d.file, d.vsEntry, "vs_5_0", d.defines), ps;
  if (d.psEntry) ps = compile(d.file, d.psEntry, "ps_5_0", d.defines);
  D3D12_GRAPHICS_PIPELINE_STATE_DESC p = {}; p.pRootSignature = rootSig.Get();
  p.VS = { vs->GetBufferPointer(), vs->GetBufferSize() }; if (ps) p.PS = { ps->GetBufferPointer(), ps->GetBufferSize() };
  p.InputLayout = { d.layout.data(), (UINT)d.layout.size() };
  p.PrimitiveTopologyType = D3D12_PRIMITIVE_TOPOLOGY_TYPE_TRIANGLE;
  p.RasterizerState.FillMode = D3D12_FILL_MODE_SOLID; p.RasterizerState.CullMode = d.cull; p.RasterizerState.FrontCounterClockwise = TRUE;
  p.RasterizerState.DepthBias = d.depthBias; p.RasterizerState.SlopeScaledDepthBias = d.slopeBias; p.RasterizerState.DepthClipEnable = TRUE;
  p.BlendState.AlphaToCoverageEnable = d.alphaToCoverage;
  for (UINT i = 0; i < d.numRT; i++) {
    auto& rt = p.BlendState.RenderTarget[i]; rt.RenderTargetWriteMask = D3D12_COLOR_WRITE_ENABLE_ALL;
    if (d.blend && i == 0) { rt.BlendEnable = TRUE; rt.SrcBlend = d.additive ? D3D12_BLEND_ONE : D3D12_BLEND_SRC_ALPHA; rt.DestBlend = d.additive ? D3D12_BLEND_ONE : D3D12_BLEND_INV_SRC_ALPHA; rt.BlendOp = D3D12_BLEND_OP_ADD;
      rt.SrcBlendAlpha = D3D12_BLEND_ONE; rt.DestBlendAlpha = D3D12_BLEND_INV_SRC_ALPHA; rt.BlendOpAlpha = D3D12_BLEND_OP_ADD; }
    p.RTVFormats[i] = d.rtv[i];
  }
  p.NumRenderTargets = d.numRT; p.DSVFormat = d.dsv;
  p.DepthStencilState.DepthEnable = d.depth; p.DepthStencilState.DepthWriteMask = d.depthWrite ? D3D12_DEPTH_WRITE_MASK_ALL : D3D12_DEPTH_WRITE_MASK_ZERO; p.DepthStencilState.DepthFunc = d.depthFunc;
  p.SampleMask = 0xFFFFFFFF; p.SampleDesc.Count = d.samples;
  ComPtr<ID3D12PipelineState> pso; HR(dev->CreateGraphicsPipelineState(&p, IID_PPV_ARGS(&pso)));
  return pso;
}
