// Sunset City (Unreal Engine 5): the people. A pedestrian strolls round the pavement loop of his block; hit him and what he does depends on who he is (Core/SCBrain.h): an ordinary
// person runs; an armed one draws a pistol and shoots; a big muscular man charges and fights with his fists (jab, cross, a slow haymaker that knocks you down); a police officer
// chases, shoots and arrests. A knocked-out or shot man lies where he fell and has a wallet. The thinking is Core/SCBrain.h's (tested without the engine); this does the moving and drawing.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Core/SCBrain.h"
#include "SCNpc.generated.h"

class UCapsuleComponent;
class UPointLightComponent;
class USCPuppet;
class ASCCharacter;

UCLASS()
class SUNSETCITY_API ASCNpc : public AActor
{
	GENERATED_BODY()

public:
	ASCNpc();
	/** A person on a pavement loop, strolling from s centimetres along it. */
	void InitStroll(SC::Archetype InKind, uint32 Seed, const SC::WalkLoop& InLoop, float StartS);
	/** A person standing at a place (a clerk, a guard, an officer who has arrived). */
	void InitStation(SC::Archetype InKind, uint32 Seed, const FVector& Pos, float YawRad, bool bInStaff);
	virtual void Tick(float DeltaSeconds) override;

	/** Hurt. Returns true when this was the blow that finished him. */
	bool ReceiveHit(float Damage, bool bGun, bool bBlade, float Knock, bool bHead, const FVector& Dir, bool bCar);
	/** Turn him against whoever did it (a civilian runs, the others fight). */
	void Provoke();
	/** Send him away (an officer when the heat is over). */
	void Dismiss();
	void RaiseHands(float Seconds) { HandsUpT = Seconds; }

	bool IsDead() const { return Brain && Brain->IsDead(); }
	bool IsKo() const { return Brain && Brain->IsKo(); }
	bool IsCop() const { return Kind == SC::Archetype::Cop; }
	bool HasWallet() const { return Brain && !bWalletTaken && (Brain->IsKo() || Brain->IsDead()) && Brain->wallet > 0.0; }
	int32 TakeWallet();
	bool SeesPlayer() const { return bSees; }
	float ArrestProgress() const { return Brain ? (float)Brain->arrestT : 0.f; }

	SC::Archetype Kind = SC::Archetype::Civilian;
	bool bStaff = false;

private:
	enum class EMode : uint8 { Stroll, Station, Fight, Flee, Leave };
	void Setup(SC::Archetype InKind, uint32 Seed);
	void MoveBy(const FVector& Delta);
	void StickToGround(float DeltaSeconds);
	void Animate(float DeltaSeconds, bool bMoving, float Speed, const SC::BrainOut* Out);

	UPROPERTY(VisibleAnywhere, Category = "Sunset") TObjectPtr<UCapsuleComponent> Capsule;
	UPROPERTY(VisibleAnywhere, Category = "Sunset") TObjectPtr<USCPuppet> Puppet;
	UPROPERTY(VisibleAnywhere, Category = "Sunset") TObjectPtr<UPointLightComponent> Flash;

	TUniquePtr<SC::Brain> Brain;
	SC::Stroll Walker;
	EMode Mode = EMode::Stroll;
	float HalfHeight = 89.f, Clock = 0.f, Phase = 0.f, FleeT = 0.f, HandsUpT = 0.f, FlashT = 0.f, LosT = 0.f, GroundT = 0.f, DownAnim = 0.f, LeaveT = 0.f, StrollSpeed = 140.f;
	bool bSees = false, bWalletTaken = false, bLos = false, bGunOut = false;
};
