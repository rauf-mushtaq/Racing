// A thin Direct3D 12 layer: device, swap chain, descriptor heaps, buffers and
// textures, a per-frame constant ring, deferred resource release, and HLSL that
// is compiled at start-up (shader model 5.0, so it runs on any Windows GPU).
#pragma once
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <d3d12.h>
#include <d3d12sdklayers.h>
#include <dxgi1_5.h>
#include <d3dcompiler.h>
#include <wrl/client.h>
#include <deque>
#include <map>
#include <string>
#include <vector>
#include "mathx.h"
using Microsoft::WRL::ComPtr;

void logf(const char* fmt, ...);
#define HR(x) do { HRESULT _hr = (x); if (FAILED(_hr)) { logf("D3D error 0x%08lx at %s:%d  %s", (unsigned long)_hr, __FILE__, __LINE__, #x); gfxFatal(#x, _hr); } } while (0)
[[noreturn]] void gfxFatal(const char* what, HRESULT hr);

constexpr int FRAMES = 3;
constexpr UINT SRV_TABLE = 8;   // t0..t7 in every shader

struct Buffer {
  ComPtr<ID3D12Resource> res; UINT size = 0, stride = 0, count = 0;
  D3D12_VERTEX_BUFFER_VIEW vbv() const { return { res->GetGPUVirtualAddress(), size, stride }; }
  D3D12_INDEX_BUFFER_VIEW ibv() const { return { res->GetGPUVirtualAddress(), size, DXGI_FORMAT_R32_UINT }; }
  explicit operator bool() const { return res != nullptr; }
};
struct Texture {
  ComPtr<ID3D12Resource> res; D3D12_RESOURCE_STATES state = D3D12_RESOURCE_STATE_COMMON;
  UINT w = 0, h = 0, slices = 1; DXGI_FORMAT fmt = DXGI_FORMAT_UNKNOWN; UINT samples = 1;
  D3D12_CPU_DESCRIPTOR_HANDLE rtv{}, dsv{};
  std::vector<D3D12_CPU_DESCRIPTOR_HANDLE> sliceDsv, sliceRtv;   // one view per array slice (shadow cascades, the reflection probe's faces)
};

struct PsoDesc {
  const char* file = nullptr; const char* vsEntry = "VSMain"; const char* psEntry = "PSMain";   // psEntry == nullptr: depth-only
  std::vector<D3D12_INPUT_ELEMENT_DESC> layout;
  UINT numRT = 1; DXGI_FORMAT rtv[2] = { DXGI_FORMAT_R16G16B16A16_FLOAT, DXGI_FORMAT_R32_FLOAT }; DXGI_FORMAT dsv = DXGI_FORMAT_UNKNOWN; UINT samples = 1;
  bool depth = true, depthWrite = true, blend = false, alphaToCoverage = false, additive = false, premult = false, rt1NoWrite = false;   // premult: blend ONE, 1 - src alpha; rt1NoWrite: leave the second target (view distance) alone
  D3D12_COMPARISON_FUNC depthFunc = D3D12_COMPARISON_FUNC_GREATER_EQUAL;   // reversed-Z
  D3D12_CULL_MODE cull = D3D12_CULL_MODE_BACK; int depthBias = 0; float slopeBias = 0;
  std::vector<std::string> defines;
};

struct CBAlloc { D3D12_GPU_VIRTUAL_ADDRESS va; void* ptr; };

class Gfx {
public:
  ComPtr<ID3D12Device> dev; ComPtr<ID3D12CommandQueue> queue; ComPtr<ID3D12GraphicsCommandList> cmd;
  ComPtr<IDXGISwapChain3> swap; ComPtr<ID3D12RootSignature> rootSig;
  UINT width = 0, height = 0, frameIdx = 0; bool hasSwap = false;
  bool tearing = false, vsync = false;                  // tearing: the display can take an uncapped present (variable refresh); vsync: wait for the refresh instead
  UINT draws = 0, shadowDraws = 0;                        // draw calls recorded this frame (reset in beginFrame)
  ComPtr<ID3D12Resource> backBuf[FRAMES]; D3D12_CPU_DESCRIPTOR_HANDLE backRtv[FRAMES];
  std::string shaderDir;

  void init(HWND hwnd, UINT w, UINT h, bool offscreenOnly);
  void resizeSwap(UINT w, UINT h);
  void beginFrame();        // waits for the frame slot, resets the list, binds heaps
  void endFrame(bool present);
  void waitIdle();
  UINT backIndex() const { return hasSwap ? swap->GetCurrentBackBufferIndex() : 0; }

  // Resources.
  Buffer makeBuffer(const void* data, UINT size, UINT stride, UINT count);   // default heap, filled through the current list
  Texture makeTexture(UINT w, UINT h, DXGI_FORMAT fmt, UINT samples, bool rt, bool ds, UINT slices = 1, UINT mips = 1, const float* clear = nullptr, bool shaderRes = true);
  void barrier(Texture& t, D3D12_RESOURCE_STATES to);
  void release(ComPtr<ID3D12Resource> r);   // freed once the GPU is done with the frames in flight
  void releaseBuffer(Buffer& b) { if (b.res) release(b.res); b = Buffer(); }
  void releaseTexture(Texture& t) { if (t.res) release(t.res); t = Texture(); }
  Texture makeTextureData(UINT w, UINT h, DXGI_FORMAT fmt, const void* data, UINT bytesPerPixel);   // a shader-readable texture filled from memory
  CBAlloc allocCB(UINT size);
  D3D12_VERTEX_BUFFER_VIEW dynVB(const void* data, UINT bytes, UINT stride) { CBAlloc a = allocCB(bytes); std::memcpy(a.ptr, data, bytes); return { a.va, bytes, stride }; }   // per-frame vertex/instance data from the constant ring
  // GPU time of the last finished frame, from timestamp queries.
  double gpuMs = 0; bool gpuTimer = false;
  void gpuStamp(bool end);
  template <class T> D3D12_GPU_VIRTUAL_ADDRESS cb(const T& v) { CBAlloc a = allocCB(sizeof(T)); std::memcpy(a.ptr, &v, sizeof(T)); return a.va; }

  // Descriptors.
  UINT allocSrv(UINT n);                    // contiguous shader-visible slots
  void srvRewind(UINT to) { srvUsed = to; }  // forget slots allocated after `to` (used when targets are rebuilt)
  void srvNull(UINT slot);
  void srv2D(UINT slot, ID3D12Resource* r, DXGI_FORMAT f, UINT mips = 1);
  void srv2DArray(UINT slot, ID3D12Resource* r, DXGI_FORMAT f, UINT slices);
  void srv2DMS(UINT slot, ID3D12Resource* r, DXGI_FORMAT f);
  D3D12_GPU_DESCRIPTOR_HANDLE srvGpu(UINT slot) const { D3D12_GPU_DESCRIPTOR_HANDLE h = srvHeap->GetGPUDescriptorHandleForHeapStart(); h.ptr += (UINT64)slot * srvInc; return h; }
  D3D12_CPU_DESCRIPTOR_HANDLE srvCpu(UINT slot) const { D3D12_CPU_DESCRIPTOR_HANDLE h = srvHeap->GetCPUDescriptorHandleForHeapStart(); h.ptr += (SIZE_T)slot * srvInc; return h; }
  void makeRtv(Texture& t, UINT mip = 0);
  UINT rtvMark() const { return rtvUsed; } UINT dsvMark() const { return dsvUsed; }       // descriptors allocated so far, so targets rebuilt on a resize reuse their slots
  void rtvRewind(UINT to) { rtvUsed = to; } void dsvRewind(UINT to) { dsvUsed = to; }
  void makeDsv(Texture& t);

  ComPtr<ID3D12PipelineState> makePso(const PsoDesc& d);
  ComPtr<ID3DBlob> compile(const char* file, const char* entry, const char* profile, const std::vector<std::string>& defines);
  bool tryCompile(const char* file, const char* entry, const char* profile);   // false instead of exiting (for --check-shaders)

  // Binding helpers: b0 frame constants, b1 draw constants, a table of t0..t7.
  void bindCommon(D3D12_GPU_VIRTUAL_ADDRESS frameCB);
  void setDraw(D3D12_GPU_VIRTUAL_ADDRESS drawCB, UINT firstSrvSlot);
  void setViewport(UINT w, UINT h);

private:
  ComPtr<ID3D12CommandAllocator> alloc[FRAMES]; ComPtr<ID3D12Fence> fence; HANDLE fenceEvent = nullptr; UINT64 fenceVal = 0, frameFence[FRAMES] = {};
  ComPtr<ID3D12DescriptorHeap> rtvHeap, dsvHeap, srvHeap, sampHeap; UINT rtvInc = 0, dsvInc = 0, srvInc = 0, rtvUsed = 0, dsvUsed = 0, srvUsed = 0;
  ComPtr<ID3D12Resource> ring; UINT8* ringPtr = nullptr; UINT ringSize = 24u << 20, ringOff = 0;
  std::deque<std::pair<UINT64, ComPtr<ID3D12Resource>>> garbage;
  std::map<std::string, ComPtr<ID3DBlob>> shaderCache;
  ComPtr<ID3D12QueryHeap> qHeap; ComPtr<ID3D12Resource> qRead; UINT64* qPtr = nullptr; UINT64 tsFreq = 0; bool stamped[FRAMES] = {};
  void collect();
  void createSwapTargets();
  void createRootSig();
};
