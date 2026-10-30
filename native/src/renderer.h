// Frame rendering: shadow cascades, the HDR scene (4x MSAA), resolve, ambient occlusion, bloom,
// and the final composite (grade, sharpen, tone mapping) into an 8-bit target that is copied to
// the swap chain (or read back for a screenshot).
#pragma once
#include "gfx.h"
#include "terrain.h"
#include "mesh.h"
#include <functional>

struct FrameCB {
  Mat4 viewProj, view, invViewProj, shadowVP[4];
  float camPos[4], sunDir[4], sunColor[4], fogColor[4], fogParams[4], screen[4], cascade[4], params[4], params2[4], sunScreen[4], shadowBias[4], shadowTexel[4], weather[4];
  Mat4 prevViewProj;
};
struct CamState { Vec3 pos; float yaw = 0, pitch = 0, fov = 60.0f; };  // yaw: 0 = north (-z), 90 = east; degrees

struct Quality { int msaa = 4; bool ao = true, shadows = true, reflections = true, dof = true; float bloom = 0.22f; float sharpen = 0.22f, clarity = 0.16f; };
// How a mesh is shaded: type 0 plain, 1 car paint, 2 road, 3 glass, 4 emissive, 5 foliage (see mesh.hlsl).
struct Material { float type = 0, rough = 0.8f, metal = 0, emissive = 0; float tint[3] = { 1, 1, 1 }; bool twoSided = false; };

class Renderer {
public:
  Gfx gfx; Terrain terrain; Quality q;
  CamState cam; double time = 0; float exposure = 0.80f; float wet = 0.14f, focusDist = 7.0f;   // wet: how soaked the streets are
  Mat4 prevViewProj = Mat4::identity(); bool havePrev = false;
  Mat4 view, proj, viewProj; Vec3 forward; Frustum frustum;
  UINT W = 0, H = 0; UINT statDraws = 0, statShadowDraws = 0;   // draw calls in the last frame (all, and the part spent on shadow cascades)
  std::function<void(Renderer&, bool, const Frustum&)> drawWorld;   // everything that isn't terrain, sea or sky; called for each shadow cascade and for the scene
  std::function<void(Gfx&, Vec3)> onBeginFrame;                       // called each frame after the command list is open (streaming uploads)
  bool inShadow = false, inReflection = false;                                               // true while drawWorld is being called for a shadow cascade
  void drawMeshMat(const GpuMesh& m, const Mat4& world, const Material& mat, const Buffer* inst = nullptr, UINT instances = 1);
  void drawMeshInst(const GpuMesh& m, const Material& mat, const D3D12_VERTEX_BUFFER_VIEW& inst, UINT instances);   // instances from per-frame data (see Gfx::dynVB)
  void drawParticles(const D3D12_VERTEX_BUFFER_VIEW& v, UINT n);
  std::function<void(Renderer&)> drawFx;                                // particles: called after the sky, in the scene pass

  void init(HWND hwnd, UINT w, UINT h, bool offscreen, const Quality& quality);
  void finishInit() { gfx.endFrame(false); gfx.waitIdle(); }   // submits the set-up commands recorded by init and the first terrain uploads
  void resize(UINT w, UINT h);
  void frame(float dt);
  void requestShot(const std::string& path) { shotPath = path; }
  std::function<void(Gfx&, Texture&)> drawHud;                  // drawn on the final image
  UINT mainBlock = 0, userBlock[8] = {};                         // user blocks survive resizes (the HUD's font atlas lives in one)
                                            // descriptor block used by scene shaders (t0 = shadow map)
  DXGI_FORMAT ldrFormat = DXGI_FORMAT_R8G8B8A8_UNORM;
private:
  ComPtr<ID3D12PipelineState> psoMesh[2][2], psoShMesh, psoShInst, psoShTerrain;   // mesh[instanced][twoSided]
  ComPtr<ID3D12PipelineState> psoMeshR[2][2], psoSkyR, psoFx, psoSky, psoWater, psoBloomFirst, psoBloomDown, psoBloomUp, psoAO, psoAOBlur, psoComposite, psoDof;
  Texture dofTex, reflColor, reflVD, reflDepth, msColor, msViewDepth, msDepth, color, viewDepth, shadow, aoRaw, aoBlur, ldr, bloom[5];
  Texture* sceneColor = nullptr; Texture* sceneDepth = nullptr; int nBloom = 5;
  UINT blkNull = 0, blkColor = 0, blkDepth = 0, blkAO = 0, blkAOBlur = 0, blkComposite = 0, blkCompositeDof = 0, blkDof = 0, blkBloom[5] = {}, staticSrv = 0;
  Buffer dummy; ComPtr<ID3D12Resource> readback; UINT readPitch = 0;
  std::string shotPath; bool shadowCleared = false;
  Mat4 cascadeVP[4]; void computeCascades(FrameCB& f);
  void shadowPass(const FrameCB& f);
  void reflectionPass(const FrameCB& f);
  void createTargets();
  UINT block();
  void fullscreen(Texture& target, ID3D12PipelineState* pso, UINT srvBlock, const float p0[4], UINT w, UINT h);
  void saveShot();
};
void saveBMP(const char* path, const uint8_t* rgba, UINT w, UINT h, UINT pitch);
