// Sunset City (Unreal Engine 5): the city itself. It is not placed in the editor: it is made, block by block, as you move. Each block of the grid (and each stretch of the beach) is
// worked out from its place and a seed (Core/SCCityPlan.h), turned into meshes (Core/SCBuildings.h, Core/SCProps.h) and given collision; blocks near you are built, a few at a time
// so the game does not stutter, and blocks far behind are thrown away. The sea, the sand under it, the land beyond the city and the hills are made once.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Core/SCBuildings.h"
#include "SCWorld.generated.h"

class UPointLightComponent;
class UProceduralMeshComponent;
class USCMaterials;

UCLASS()
class SUNSETCITY_API ASCWorld : public AActor
{
	GENERATED_BODY()

public:
	ASCWorld();
	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;

	/** How many blocks round you are built (3 gives a 7 by 7 square of blocks, about 900 m across). */
	UPROPERTY(EditAnywhere, Category = "Sunset") int32 LoadRadius = 3;
	/** Blocks further than this are thrown away. */
	UPROPERTY(EditAnywhere, Category = "Sunset") int32 KeepRadius = 4;
	/** How long each frame may spend building the city. */
	UPROPERTY(EditAnywhere, Category = "Sunset") float FrameBudgetMs = 5.f;
	UPROPERTY(EditAnywhere, Category = "Sunset") int32 CitySeed = 2026;
	/** How many street lamps shine at night at once (the ones nearest you). */
	UPROPERTY(EditAnywhere, Category = "Sunset") int32 StreetLights = 14;

	/** Build everything within Radius blocks of Where right now (so there is ground under the player at the start). */
	void BuildNow(const FVector& Where, int32 Radius);
	/** A point on a pavement loop of a loaded block, between MinDist and MaxDist from Near, with the loop and the distance along it. */
	bool RandomLoopPoint(const FVector& Near, float MinDist, float MaxDist, FRandomStream& Rng, FVector& OutPos, SC::WalkLoop& OutLoop, float& OutS) const;

private:
	struct FChunk
	{
		FIntPoint Key;
		FVector Centre = FVector::ZeroVector;
		SC::BlockPlan Plan;
		int32 Stage = 0;
		bool bDone = false;
		bool bHasVenue = false;
		TArray<TWeakObjectPtr<UActorComponent>> Comps;
		TArray<FVector> Lamps;
	};

	static bool ValidKey(int32 I, int32 J);
	void Request(int32 I, int32 J);
	void Unload(const FIntPoint& Key);
	bool Step(FChunk& C);
	void BuildGround(FChunk& C);
	void BuildBuilding(FChunk& C, int32 Index);
	void BuildProps(FChunk& C);
	void BuildGlobal();
	void UpdateLamps();
	UProceduralMeshComponent* NewMesh(FChunk* C, const FVector& At, bool bCollision);

	TMap<FIntPoint, TSharedPtr<FChunk>> Chunks;
	UPROPERTY() TObjectPtr<USCMaterials> Mats;
	UPROPERTY() TArray<TObjectPtr<UPointLightComponent>> LampPool;
	FIntPoint LastKey = FIntPoint(9999, 9999);
	float LampTimer = 0.f;
};
