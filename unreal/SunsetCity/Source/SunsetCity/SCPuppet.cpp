#include "SCPuppet.h"
#include "Engine/World.h"
#include "ProceduralMeshComponent.h"
#include "SCMaterials.h"
#include "SCUtil.h"

void USCPuppet::Build(const SC::BodyStyle& Style)
{
	AActor* Owner = GetOwner();
	UWorld* W = GetWorld();
	if (!Owner || !W) return;
	USCMaterials* Mats = W->GetSubsystem<USCMaterials>();
	Rig = SC::MakeRig(Style);
	Joints.Init(nullptr, (int32)SC::J_COUNT);
	for (const SC::Part& Pt : Rig.parts)
	{
		USceneComponent* Parent = (Pt.parent == Pt.joint) ? static_cast<USceneComponent*>(this) : Joints[(int32)Pt.parent].Get();
		USceneComponent* J = NewObject<USceneComponent>(Owner);
		J->SetupAttachment(Parent);
		J->RegisterComponent();
		J->SetRelativeLocation(SCU::V(Pt.offset));
		Joints[(int32)Pt.joint] = J;
		UProceduralMeshComponent* M = SCU::MakeMesh(Owner, J, FVector::ZeroVector, false);
		SCU::FillMesh(M, Pt.mesh, Mats, false);
		Meshes.Add(M);
	}
	// A pistol in the right hand: barrel along the hand's own -Z (which points forwards when the arm is raised), the grip hanging below it.
	if (USceneComponent* Wrist = Joint((int32)SC::J_WRR))
	{
		SC::Mesh G;
		SC::Col steel = SC::Hex(0x1B1D20); steel.a = float(SC::MAT_METAL);
		SC::Col grip = SC::Hex(0x2A2522); grip.a = float(SC::MAT_LEATHER);
		G.Box({-1.6, -1.3, -26.0}, {1.6, 1.3, -8.0}, steel, 63);
		G.Box({-7.0, -1.2, -13.0}, {-1.0, 1.2, -8.5}, grip, 63);
		G.Box({-1.0, -0.6, -28.0}, {1.0, 0.6, -26.0}, steel, 63);
		Gun = SCU::MakeMesh(Owner, Wrist, FVector(0.0, 0.0, -(0.035 * Rig.height)), false);
		SCU::FillMesh(Gun, G, Mats, false);
		Gun->SetVisibility(false);
	}
}

void USCPuppet::Apply(SC::Pose P)
{
	if (Joints.Num() == 0) return;
	SC::PlantFeet(Rig, P);
	for (const SC::Part& Pt : Rig.parts)
	{
		const int32 j = (int32)Pt.joint;
		USceneComponent* J = Joints[j].Get();
		if (!J) continue;
		if (j == (int32)SC::J_ROOT)
		{
			J->SetRelativeLocationAndRotation(SCU::V(Pt.offset + P.rootOffset), FRotator(SC::Deg(P.rootPitch), SC::Deg(P.rootYaw), -SC::Deg(P.rootRoll)));
		}
		else
		{
			// The roll of Core/SCRig.h swings a limb out to +Y; Unreal's positive roll tips the right side down, so it is passed negated.
			J->SetRelativeRotation(FRotator(SC::Deg(P.pitch[j]), SC::Deg(P.yaw[j]), -SC::Deg(P.roll[j])));
		}
	}
}

void USCPuppet::SetShown(bool bShown)
{
	for (UProceduralMeshComponent* M : Meshes) if (M) M->SetVisibility(bShown);
	if (Gun && !bShown) Gun->SetVisibility(false);
}

void USCPuppet::ShowGun(bool bShow)
{
	if (Gun) Gun->SetVisibility(bShow);
}
