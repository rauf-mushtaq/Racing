// Sunset City (Unreal Engine 5): a person's body. The figure that Core/SCRig.h describes (a pelvis, a spine, a neck, a head, two arms of three joints, two legs of three joints) is built
// as a tree of scene components, one per joint, with a procedural mesh at each; a pose (Core/SCRig.h: standing, walking, punching, aiming, ...) turns the joints. It is the stand-in for
// a MetaHuman or any skeletal mesh you want to put in its place (see unreal/README.md): everything that uses a puppet only calls Build, Apply and ShowGun.
#pragma once

#include "CoreMinimal.h"
#include "Components/SceneComponent.h"
#include "Core/SCRig.h"
#include "SCPuppet.generated.h"

class UProceduralMeshComponent;

UCLASS(ClassGroup = (SunsetCity))
class SUNSETCITY_API USCPuppet : public USceneComponent
{
	GENERATED_BODY()

public:
	/** Build the parts of the figure. Call once, when the owner is in the world. The origin of the puppet is on the ground under the feet. */
	void Build(const SC::BodyStyle& Style);
	/** Turn the joints to a pose (the feet are planted first, so they never sink into the ground). */
	void Apply(SC::Pose Pose);
	void SetShown(bool bShown);
	void ShowGun(bool bShow);
	USceneComponent* Joint(int32 J) const { return Joints.IsValidIndex(J) ? Joints[J].Get() : nullptr; }
	float Height() const { return (float)Rig.height; }

private:
	SC::Rig Rig;

	UPROPERTY()
	TArray<TObjectPtr<USceneComponent>> Joints;

	UPROPERTY()
	TArray<TObjectPtr<UProceduralMeshComponent>> Meshes;

	UPROPERTY()
	TObjectPtr<UProceduralMeshComponent> Gun;
};
