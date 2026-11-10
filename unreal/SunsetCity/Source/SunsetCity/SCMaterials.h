// Sunset City (Unreal Engine 5): the materials. Every surface of the city is one of a few dozen kinds (stucco, glass, asphalt, paint, water, skin, ...), named in Core/SCMesh.h (Mat).
// Each kind is a dynamic instance of one of a handful of master materials that Content/Python/sc_build_materials.py builds in the editor (physically based: clear-coated car paint,
// refractive glass, single-layer water, subsurface skin, windows that light up at night). If the masters have not been built yet the instances fall back to the engine's own
// vertex-colour material, so the game still runs (flat-coloured) until you run the script.
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "SCMaterials.generated.h"

class UMaterialInterface;
class UMaterialInstanceDynamic;

UCLASS()
class SUNSETCITY_API USCMaterials : public UWorldSubsystem
{
	GENERATED_BODY()

public:
	virtual bool ShouldCreateSubsystem(UObject* Outer) const override;
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;

	/** The material for one of Core's Mat kinds. */
	UMaterialInterface* Get(int32 Mat) const;
	/** A private copy of that material to change (a car's own paint, say). */
	UMaterialInstanceDynamic* MakeVariant(int32 Mat);
	/** 0 by day .. 1 at night: windows, street lamps and signs light up. */
	void SetNight(float InNight);
	float GetNight() const { return Night; }

private:
	UMaterialInterface* LoadMaster(const TCHAR* Name) const;

	UPROPERTY()
	TMap<int32, TObjectPtr<UMaterialInstanceDynamic>> Mids;

	UPROPERTY()
	TObjectPtr<UMaterialInterface> Fallback;

	float Night = 0.f;
};
