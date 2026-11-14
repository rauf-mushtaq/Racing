#include "SCPuppet.h"
#include "Animation/AnimSequence.h"
#include "Components/SkeletalMeshComponent.h"
#include "Engine/SkeletalMesh.h"
#include "Engine/World.h"
#include "GameFramework/Actor.h"
#include "ProceduralMeshComponent.h"
#include "SCImportData.h"
#include "SCMaterials.h"
#include "SCUtil.h"

namespace
{
	// A bone's place in the mesh's own space, in the rest pose (each bone's transform is given relative to its parent's).
	bool RestBone(const FReferenceSkeleton& Ref, const TCHAR* Name, FVector& Out)
	{
		const int32 I = Ref.FindBoneIndex(FName(Name));
		if (I == INDEX_NONE) return false;
		const TArray<FTransform>& Pose = Ref.GetRefBonePose();
		FTransform T = Pose[I];
		for (int32 P = Ref.GetParentIndex(I); P != INDEX_NONE; P = Ref.GetParentIndex(P)) T = T * Pose[P];
		Out = T.GetLocation();
		return true;
	}
}

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

bool USCPuppet::BuildReal(const FString& Key, float Bulk)
{
	AActor* Owner = GetOwner();
	if (!Owner || Body) return false;
	const FString Base = FString::Printf(TEXT("/Game/SunsetCity/People/%s/"), *Key);
	USkeletalMesh* SK = LoadObject<USkeletalMesh>(nullptr, *FString::Printf(TEXT("%sSK_%s.SK_%s"), *Base, *Key, *Key), nullptr, LOAD_Quiet | LOAD_NoWarn);
	if (!SK) return false;
	Clips.Init(nullptr, (int32)SCImport::ClipCount);
	for (int32 C = 0; C < (int32)SCImport::ClipCount; ++C)
	{
		const TCHAR* N = SCImport::ClipNames[C];
		Clips[C] = LoadObject<UAnimSequence>(nullptr, *FString::Printf(TEXT("%sA_%s.A_%s"), *Base, N, N), nullptr, LOAD_Quiet | LOAD_NoWarn);
	}
	if (!Clips[SCImport::ClipIdle] || !Clips[SCImport::ClipWalk])
	{
		UE_LOG(LogTemp, Warning, TEXT("[SunsetCity] %s was imported without its clips: using the jointed figure."), *Key);
		Clips.Reset();
		return false;
	}
	Frame = NewObject<USceneComponent>(Owner);
	Frame->SetupAttachment(this);
	Frame->RegisterComponent();
	Frame->SetRelativeScale3D(FVector(1.f + 0.16f * Bulk, 1.f + 0.16f * Bulk, 1.f + 0.05f * Bulk));     // (a big man: broader and a little taller)
	Body = NewObject<USkeletalMeshComponent>(Owner);
	Body->SetupAttachment(Frame);
	Body->SetSkeletalMeshAsset(SK);
	Body->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	Body->SetGenerateOverlapEvents(false);
	Body->SetCastShadow(true);
	Body->SetAnimationMode(EAnimationMode::AnimationSingleNode);
	Body->RegisterComponent();
	if (!Fit()) UE_LOG(LogTemp, Warning, TEXT("[SunsetCity] %s: its bones were not where expected; it is shown as imported."), *Key);
	RealHeight *= 1.f + 0.05f * Bulk;
	// A pistol for the hand (placed each frame where the right hand is, pointing where the person faces).
	USCMaterials* Mats = GetWorld() ? GetWorld()->GetSubsystem<USCMaterials>() : nullptr;
	SC::Mesh G;
	SC::Col steel = SC::Hex(0x1B1D20); steel.a = float(SC::MAT_METAL);
	SC::Col grip = SC::Hex(0x2A2522); grip.a = float(SC::MAT_LEATHER);
	G.Box({0.0, -1.3, -1.6}, {18.0, 1.3, 1.6}, steel, 63);
	G.Box({2.0, -1.2, -7.5}, {6.5, 1.2, -1.0}, grip, 63);
	Gun = SCU::MakeMesh(Owner, this, FVector::ZeroVector, false);
	SCU::FillMesh(Gun, G, Mats, false);
	Gun->SetVisibility(false);
	PlayClip(SCImport::ClipIdle, 0.f);
	return true;
}

bool USCPuppet::Fit()
{
	// Which way the imported person stands depends on how the importer turned glTF's axes and units: find it from the skeleton itself. Up is from the
	// feet to the head, forward is from the heels to the toes. Turn the body so they are +Z and +X, scale it if the units came out wrong, and stand it
	// on its lowest point.
	USkeletalMesh* SK = Body ? Body->GetSkeletalMeshAsset() : nullptr;
	if (!SK) return false;
	const FReferenceSkeleton& Ref = SK->GetRefSkeleton();
	FVector Head, LF, RF, LT, RT;
	if (!RestBone(Ref, TEXT("Bip01_Head"), Head) || !RestBone(Ref, TEXT("Bip01_L_Foot"), LF) || !RestBone(Ref, TEXT("Bip01_R_Foot"), RF) ||
		!RestBone(Ref, TEXT("Bip01_L_Toe0"), LT) || !RestBone(Ref, TEXT("Bip01_R_Toe0"), RT)) return false;
	const FVector Feet = (LF + RF) * 0.5f;
	FVector Up = (Head - Feet).GetSafeNormal();
	FVector Fwd = ((LT - LF) + (RT - RF)) * 0.5f;
	Fwd = (Fwd - Up * FVector::DotProduct(Fwd, Up)).GetSafeNormal();
	if (Up.IsNearlyZero() || Fwd.IsNearlyZero()) return false;
	const FQuat Q = FRotationMatrix::MakeFromXZ(Fwd, Up).ToQuat().Inverse();
	const float HeadUp = (float)FVector::DotProduct(Head - Feet, Up);                 // (the head bone stands about 1.6 m above the ankles)
	float S = 1.f;
	if (HeadUp > 1.f && (HeadUp < 100.f || HeadUp > 260.f)) S = 160.f / HeadUp;
	if (Q.RotateVector(LF - RF).Y > 0.f) UE_LOG(LogTemp, Warning, TEXT("[SunsetCity] %s is mirrored (its left foot is on its right)."), *SK->GetName());
	const FBox B = SK->GetBounds().GetBox();
	float MinZ = TNumericLimits<float>::Max(), MaxZ = -TNumericLimits<float>::Max();
	for (int32 i = 0; i < 8; ++i)
	{
		const FVector C((i & 1) ? B.Max.X : B.Min.X, (i & 2) ? B.Max.Y : B.Min.Y, (i & 4) ? B.Max.Z : B.Min.Z);
		const float Z = (float)Q.RotateVector(C * S).Z;
		MinZ = FMath::Min(MinZ, Z); MaxZ = FMath::Max(MaxZ, Z);
	}
	Body->SetRelativeRotation(Q);
	Body->SetRelativeScale3D(FVector(S));
	Body->SetRelativeLocation(FVector(0.f, 0.f, -MinZ));
	RealHeight = FMath::Clamp(MaxZ - MinZ, 120.f, 230.f);
	return true;
}

void USCPuppet::PlayClip(int32 C, float Seconds)
{
	if (!Body || !Clips.IsValidIndex(C)) return;
	UAnimSequence* A = Clips[C] ? Clips[C].Get() : Clips[SCImport::ClipIdle].Get();
	if (!A) return;
	if (A != Playing)
	{
		Body->PlayAnimation(A, SCImport::ClipLoops[C]);
		Body->SetPlayRate(0.f);                        // (the time in the clip is set here every frame, to follow the game)
		Playing = A;
	}
	Body->SetPosition(FMath::Clamp(Seconds, 0.f, (float)A->GetPlayLength()), false);
}

void USCPuppet::Move(const FSCMotion& M)
{
	if (!Body) return;
	using namespace SCImport;
	Clock += M.Dt;
	const auto Looping = [this](int32 C) { return ClipSeconds[C] > 0.f ? FMath::Fmod(Clock, ClipSeconds[C]) : 0.f; };
	StaggerT = M.bStagger && !M.bDown ? StaggerT + M.Dt : 0.f;
	if (M.bDown) PlayClip(ClipDown, M.DownK * ClipSeconds[ClipDown]);
	else if (M.bHandsUp) PlayClip(ClipHandsup, Looping(ClipHandsup));
	else if (M.bStagger) PlayClip(ClipStagger, FMath::Fmod(StaggerT, ClipSeconds[ClipStagger]));
	else if (M.Blow != SC::Blow::None)
	{
		const int32 C = M.Blow == SC::Blow::Jab ? ClipJab : M.Blow == SC::Blow::Cross ? ClipCross : M.Blow == SC::Blow::Hook ? ClipHook : ClipKick;
		PlayClip(C, FMath::Clamp(M.BlowK, 0.f, 1.f) * ClipSeconds[C]);
	}
	else if (M.bAim) PlayClip(ClipAim, Looping(ClipAim));
	else if (M.Speed > 20.f)
	{
		// The recorded cycle nearest this speed (keeping the one playing unless another is clearly nearer), run at its own cadence: the cycles all start with
		// the same foot in the same place, so changing from one to another keeps the step.
		const float V = M.Speed / 100.f;
		int32 Best = Ladder[0];
		float BestD = TNumericLimits<float>::Max();
		for (const EClip C : Ladder) { const float D = FMath::Abs(ClipSpeed[C] - V); if (D < BestD) { BestD = D; Best = C; } }
		if (Cycle >= 0 && Cycle != Best && FMath::Abs(ClipSpeed[Cycle] - V) < BestD + 0.3f) Best = Cycle;
		Cycle = Best;
		const float Stride = FMath::Max(0.2f, ClipSpeed[Best] * ClipSeconds[Best]);   // metres in one cycle (two steps)
		CyclePhase = FMath::Fmod(CyclePhase + V * M.Dt / Stride, 1.f);
		PlayClip(Best, CyclePhase * ClipSeconds[Best]);
	}
	else PlayClip(ClipIdle, Looping(ClipIdle));
	PlaceGun();
}

void USCPuppet::PlaceGun()
{
	if (!Body || !Gun || !bGunShown) return;
	const AActor* Owner = GetOwner();
	const FRotator R = Owner ? Owner->GetActorRotation() : GetComponentRotation();
	const FVector Hand = Body->GetBoneLocation(TEXT("Bip01_R_Hand"));
	Gun->SetWorldLocationAndRotation(Hand + R.Vector() * 4.f + FVector(0.f, 0.f, 2.f), R);
}

void USCPuppet::Apply(SC::Pose P)
{
	if (Body || Joints.Num() == 0) return;
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
	if (Body) Body->SetVisibility(bShown);
	if (Gun && !bShown) Gun->SetVisibility(false);
}

void USCPuppet::ShowGun(bool bShow)
{
	bGunShown = bShow;
	if (Gun) Gun->SetVisibility(bShow);
	if (bShow) PlaceGun();
}
