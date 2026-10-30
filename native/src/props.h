// Procedural plants and rocks shared by every instance: pines, snowy pines, broadleaf trees, palms,
// saguaro cacti, boulders and shrubs.
#pragma once
#include "mesh.h"
enum PropKind { P_PINE, P_SNOWPINE, P_TREE, P_PALM, P_CACTUS, P_ROCK, P_SHRUB, P_COUNT };
struct PropSet { GpuMesh mesh[P_COUNT]; };
void buildProps(Gfx& g, PropSet& out);
MeshData blobMesh(Vec3 centre, Vec3 radii, int seg, uint32_t col, float noiseAmp, int seed);
