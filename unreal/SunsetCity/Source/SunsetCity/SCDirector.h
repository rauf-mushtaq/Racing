// Sunset City (Unreal Engine 5): what is going on in the city. The director keeps the street populated (pedestrians on the pavements, one in eleven armed and one in sixteen a big
// muscular man), watches the player's crimes (Core/SCWanted.h: the stars), sends police on foot and in cars, arrests, hands out wallets, stands staff in the places you can walk
// into and lets you rob their tills. It also keeps the money. Everything else asks it through ASCDirector::Get().
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Core/SCBrain.h"
#include "Core/SCBuildings.h"
#include "Core/SCWanted.h"
#include "SCTouch.h"
#include "SCDirector.generated.h"

class ASCCharacter;
class ASCNpc;
class ASCVehicle;
class ASCWorld;
class ASCEnvironment;

UCLASS()
class SUNSETCITY_API ASCDirector : public AActor
{
	GENERATED_BODY()

public:
	ASCDirector();
	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;

	/** The director of the world that Ctx is in (null before the game mode has made one). */
	static ASCDirector* Get(const UObject* Ctx);

	UPROPERTY(EditAnywhere, Category = "Sunset") int32 MaxPedestrians = 22;
	UPROPERTY(EditAnywhere, Category = "Sunset") int32 Seed = 2026;

	SC::Wanted Wanted;
	int32 Money = 0;
	ASCCharacter* Player = nullptr;
	ASCWorld* WorldActor = nullptr;
	ASCEnvironment* Env = nullptr;
	TArray<TWeakObjectPtr<ASCNpc>> Npcs;
	TArray<TWeakObjectPtr<ASCVehicle>> Vehicles;
	FString Prompt;                                          // what pressing E would do right now ("" if nothing)
	FSCTouchControls Touch;                                  // the fingers on a touch screen (see SCTouch.h)

	void Commit(SC::Crime C, float Amount = 1.f);
	float NightAmount() const;
	ASCVehicle* NearestVehicle(const FVector& P, float MaxDist) const;
	ASCNpc* NearestLoot(const FVector& P, float MaxDist) const;
	bool TryRob(ASCCharacter* Who);
	void DismissPolice();

	/** The world has built (or dropped) a place you can walk into: its staff and its till. */
	void RegisterVenue(const FIntPoint& Key, SC::VenueKind Kind, const SC::VenueBuild& Build);
	void UnregisterVenue(const FIntPoint& Key);

private:
	struct FVenue
	{
		SC::VenueKind Kind = SC::VenueKind::None;
		FVector Till = FVector::ZeroVector;
		float Cooldown = 0.f;
		TArray<TWeakObjectPtr<ASCNpc>> Staff;
	};

	void KeepStreetsBusy();
	void KeepPolice(float Dt);
	void Arrest();
	ASCNpc* SpawnPedestrian(SC::Archetype Kind, const FVector& Near, float MinDist, float MaxDist);

	TMap<FIntPoint, FVenue> Venues;
	FRandomStream Rng;
	float PopTimer = 0.f, CopTimer = 0.f, CarTimer = 0.f, ArrestT = 0.f, PromptTimer = 0.f;
	uint32 SpawnCounter = 1;
};
