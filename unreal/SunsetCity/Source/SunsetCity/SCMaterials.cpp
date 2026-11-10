#include "SCMaterials.h"
#include "Core/SCMesh.h"
#include "Engine/World.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Materials/MaterialInterface.h"
#include "SCUtil.h"

namespace
{
	struct FDef
	{
		int32 Mat;
		const TCHAR* Master;       // the master material's name (in /Game/SunsetCity/Materials)
		float R, G, B;             // tint
		float Rough, Metal, Spec;
		float Emissive;
		float Opacity;
	};

	// What each kind of surface is made of. The numbers are physically plausible values (roughness 0 mirror .. 1 chalk; specular 0.5 is the usual 4% reflectance).
	const FDef Defs[] = {
		{SC::MAT_PAINT,   TEXT("M_SC_CarPaint"), 1.f, 1.f, 1.f,       0.30f, 0.f,  0.5f, 0.f, 1.f},
		{SC::MAT_GLASS,   TEXT("M_SC_Glass"),    0.55f, 0.72f, 0.82f, 0.04f, 0.f,  0.6f, 0.f, 0.30f},
		{SC::MAT_TRIM,    TEXT("M_SC_Surface"),  1.f, 1.f, 1.f,       0.60f, 0.1f, 0.4f, 0.f, 1.f},
		{SC::MAT_LIGHT,   TEXT("M_SC_Glow"),     1.f, 1.f, 1.f,       0.30f, 0.f,  0.5f, 6.f, 1.f},
		{SC::MAT_CHROME,  TEXT("M_SC_Surface"),  0.9f, 0.9f, 0.92f,   0.10f, 1.f,  0.5f, 0.f, 1.f},
		{SC::MAT_TYRE,    TEXT("M_SC_Surface"),  1.f, 1.f, 1.f,       0.85f, 0.f,  0.3f, 0.f, 1.f},
		{SC::MAT_WALL,    TEXT("M_SC_Surface"),  1.f, 1.f, 1.f,       0.88f, 0.f,  0.35f, 0.f, 1.f},
		{SC::MAT_ROOF,    TEXT("M_SC_Surface"),  1.f, 1.f, 1.f,       0.80f, 0.f,  0.3f, 0.f, 1.f},
		{SC::MAT_STONE,   TEXT("M_SC_Surface"),  1.f, 1.f, 1.f,       0.80f, 0.f,  0.35f, 0.f, 1.f},
		{SC::MAT_ASPHALT, TEXT("M_SC_Surface"),  1.f, 1.f, 1.f,       0.92f, 0.f,  0.25f, 0.f, 1.f},
		{SC::MAT_LAWN,    TEXT("M_SC_Foliage"),  1.f, 1.f, 1.f,       0.95f, 0.f,  0.2f, 0.f, 1.f},
		{SC::MAT_SAND,    TEXT("M_SC_Surface"),  1.f, 1.f, 1.f,       0.95f, 0.f,  0.2f, 0.f, 1.f},
		{SC::MAT_WATER,   TEXT("M_SC_Water"),    0.04f, 0.32f, 0.42f, 0.05f, 0.f,  0.5f, 0.f, 1.f},
		{SC::MAT_FOLIAGE, TEXT("M_SC_Foliage"),  1.f, 1.f, 1.f,       0.65f, 0.f,  0.3f, 0.f, 1.f},
		{SC::MAT_BARK,    TEXT("M_SC_Surface"),  1.f, 1.f, 1.f,       0.92f, 0.f,  0.2f, 0.f, 1.f},
		{SC::MAT_WOOD,    TEXT("M_SC_Surface"),  1.f, 1.f, 1.f,       0.55f, 0.f,  0.35f, 0.f, 1.f},
		{SC::MAT_METAL,   TEXT("M_SC_Surface"),  1.f, 1.f, 1.f,       0.38f, 0.9f, 0.5f, 0.f, 1.f},
		{SC::MAT_FABRIC,  TEXT("M_SC_Surface"),  1.f, 1.f, 1.f,       0.90f, 0.f,  0.2f, 0.f, 1.f},
		{SC::MAT_GLOW,    TEXT("M_SC_Glow"),     1.f, 1.f, 1.f,       0.30f, 0.f,  0.5f, 3.5f, 1.f},
		{SC::MAT_LINE,    TEXT("M_SC_Surface"),  1.f, 1.f, 1.f,       0.55f, 0.f,  0.5f, 0.f, 1.f},
		{SC::MAT_TILE,    TEXT("M_SC_Surface"),  1.f, 1.f, 1.f,       0.12f, 0.f,  0.6f, 0.f, 1.f},
		{SC::MAT_WINDOW,  TEXT("M_SC_Window"),   0.50f, 0.66f, 0.78f, 0.05f, 0.f,  0.6f, 0.f, 0.55f},
		{SC::MAT_SKIN,    TEXT("M_SC_Skin"),     1.f, 1.f, 1.f,       0.50f, 0.f,  0.45f, 0.f, 1.f},
		{SC::MAT_CLOTH,   TEXT("M_SC_Surface"),  1.f, 1.f, 1.f,       0.88f, 0.f,  0.22f, 0.f, 1.f},
		{SC::MAT_HAIR,    TEXT("M_SC_Surface"),  1.f, 1.f, 1.f,       0.42f, 0.f,  0.5f, 0.f, 1.f},
		{SC::MAT_LEATHER, TEXT("M_SC_Surface"),  1.f, 1.f, 1.f,       0.40f, 0.f,  0.5f, 0.f, 1.f},
	};
}

bool USCMaterials::ShouldCreateSubsystem(UObject* Outer) const
{
	if (!Super::ShouldCreateSubsystem(Outer)) return false;
	const UWorld* W = Cast<UWorld>(Outer);
	return W && W->IsGameWorld();
}

UMaterialInterface* USCMaterials::LoadMaster(const TCHAR* Name) const
{
	const FString Path = FString::Printf(TEXT("/Game/SunsetCity/Materials/%s.%s"), Name, Name);
	return LoadObject<UMaterialInterface>(nullptr, *Path, nullptr, LOAD_Quiet | LOAD_NoWarn);
}

void USCMaterials::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);
	Fallback = LoadObject<UMaterialInterface>(nullptr, TEXT("/Engine/EngineDebugMaterials/VertexColorMaterial.VertexColorMaterial"), nullptr, LOAD_Quiet | LOAD_NoWarn);
	if (!Fallback) Fallback = LoadObject<UMaterialInterface>(nullptr, TEXT("/Engine/BasicShapes/BasicShapeMaterial.BasicShapeMaterial"), nullptr, LOAD_Quiet | LOAD_NoWarn);
	TMap<FString, UMaterialInterface*> Masters;
	int32 Missing = 0;
	for (const FDef& D : Defs)
	{
		UMaterialInterface** Found = Masters.Find(D.Master);
		UMaterialInterface* Master = Found ? *Found : LoadMaster(D.Master);
		if (!Found) { Masters.Add(D.Master, Master); if (!Master) ++Missing; }
		UMaterialInterface* Parent = Master ? Master : Fallback.Get();
		if (!Parent) continue;
		UMaterialInstanceDynamic* Mid = UMaterialInstanceDynamic::Create(Parent, this);
		if (!Mid) continue;
		Mid->SetVectorParameterValue(TEXT("Tint"), FLinearColor(D.R, D.G, D.B, 1.f));
		Mid->SetScalarParameterValue(TEXT("Roughness"), D.Rough);
		Mid->SetScalarParameterValue(TEXT("Metallic"), D.Metal);
		Mid->SetScalarParameterValue(TEXT("Specular"), D.Spec);
		Mid->SetScalarParameterValue(TEXT("Emissive"), D.Emissive);
		Mid->SetScalarParameterValue(TEXT("Opacity"), D.Opacity);
		Mid->SetScalarParameterValue(TEXT("Night"), 0.f);
		Mids.Add(D.Mat, Mid);
	}
	if (Missing > 0)
	{
		UE_LOG(LogSunset, Warning, TEXT("%d of the master materials in /Game/SunsetCity/Materials are missing: the city will be drawn in flat vertex colours. Run Content/Python/sc_build_materials.py in the editor (see unreal/README.md)."), Missing);
	}
}

UMaterialInterface* USCMaterials::Get(int32 Mat) const
{
	if (const TObjectPtr<UMaterialInstanceDynamic>* M = Mids.Find(Mat)) return M->Get();
	return Fallback.Get();
}

UMaterialInstanceDynamic* USCMaterials::MakeVariant(int32 Mat)
{
	UMaterialInterface* Base = Get(Mat);
	return Base ? UMaterialInstanceDynamic::Create(Base, this) : nullptr;
}

void USCMaterials::SetNight(float InNight)
{
	Night = FMath::Clamp(InNight, 0.f, 1.f);
	for (const int32 Mat : {(int32)SC::MAT_WINDOW, (int32)SC::MAT_GLOW, (int32)SC::MAT_LIGHT})
	{
		if (const TObjectPtr<UMaterialInstanceDynamic>* M = Mids.Find(Mat)) (*M)->SetScalarParameterValue(TEXT("Night"), Night);
	}
}
