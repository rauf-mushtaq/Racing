// Sunset City (Unreal Engine 5): a person's body. Two kinds:
//  - a real person (BuildReal): one of the web version's photo-textured Rocketbox people (unreal/Import/people, imported by Content/Python/sc_import_assets.py),
//    a skeletal mesh that plays the web version's own movement, baked into clips by tools/unreal-import (its motion capture for standing, walking and running,
//    and its punches, kick, aiming, hands up, staggering and falling). Move picks the clip and the time in it each frame.
//  - the jointed figure (Build) that Core/SCRig.h describes, built from scene components and procedural meshes and posed by Apply: what is used if the real
//    people have not been imported.
// Everything that uses a puppet calls Build or BuildReal, then Apply and Move every frame (each ignores what is not its kind), and ShowGun.
#pragma once

#include "CoreMinimal.h"
#include "Components/SceneComponent.h"
#include "Core/SCRig.h"
#include "SCPuppet.generated.h"

class UProceduralMeshComponent;
class USkeletalMeshComponent;
class UAnimSequence;

/** What a person is doing this frame, for a real body (see USCPuppet::Move). */
struct FSCMotion
{
	float Dt = 0.f;
	float Speed = 0.f;               // cm/s over the ground
	SC::Blow Blow = SC::Blow::None;  // a punch or kick, and how far through it (0..1)
	float BlowK = 0.f;
	bool bAim = false;
	bool bHandsUp = false;
	bool bStagger = false;
	bool bDown = false;              // knocked down: DownK 0..1 through falling over
	float DownK = 0.f;
};

UCLASS(ClassGroup = (SunsetCity))
class SUNSETCITY_API USCPuppet : public USceneComponent
{
	GENERATED_BODY()

public:
	/** Build the jointed figure. Call once, when the owner is in the world. The origin of the puppet is on the ground under the feet. */
	void Build(const SC::BodyStyle& Style);
	/** Build a real person instead: Key names one of unreal/Import/people (e.g. "ped_f2", "cop_blue"). Bulk above 0 makes a broader, heavier man of him.
	 *  Returns false, having built nothing, if that person was not imported. The origin is on the ground under the feet, as for Build. */
	bool BuildReal(const FString& Key, float Bulk = 0.f);
	bool IsReal() const { return Body != nullptr; }
	/** Pose the jointed figure (the feet are planted first, so they never sink into the ground). Does nothing for a real person. */
	void Apply(SC::Pose Pose);
	/** Play what the person is doing on a real body. Does nothing for the jointed figure. */
	void Move(const FSCMotion& M);
	void SetShown(bool bShown);
	void ShowGun(bool bShow);
	USceneComponent* Joint(int32 J) const { return Joints.IsValidIndex(J) ? Joints[J].Get() : nullptr; }
	/** How tall the person stands, cm. */
	float Height() const { return Body ? RealHeight : (float)Rig.height; }

private:
	void PlayClip(int32 Clip, float Seconds);
	void PlaceGun();
	bool Fit();

	SC::Rig Rig;

	UPROPERTY()
	TArray<TObjectPtr<USceneComponent>> Joints;

	UPROPERTY()
	TArray<TObjectPtr<UProceduralMeshComponent>> Meshes;

	UPROPERTY()
	TObjectPtr<UProceduralMeshComponent> Gun;

	// The real person.
	UPROPERTY()
	TObjectPtr<USceneComponent> Frame;              // scaled for a big man; the body inside it is turned and scaled to stand upright, facing +X, feet on the ground

	UPROPERTY()
	TObjectPtr<USkeletalMeshComponent> Body;

	UPROPERTY()
	TArray<TObjectPtr<UAnimSequence>> Clips;

	UPROPERTY()
	TObjectPtr<UAnimSequence> Playing;

	float RealHeight = 178.f;
	float Clock = 0.f;
	float CyclePhase = 0.f;
	float StaggerT = 0.f;
	int32 Cycle = -1;
	bool bGunShown = false;
};
