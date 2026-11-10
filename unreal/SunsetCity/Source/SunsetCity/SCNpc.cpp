#include "SCNpc.h"
#include "Components/CapsuleComponent.h"
#include "Components/PointLightComponent.h"
#include "Engine/World.h"
#include "SCCharacter.h"
#include "SCDirector.h"
#include "SCPuppet.h"
#include "SCUtil.h"

namespace
{
	const uint32 SkinTones[] = {0xF1C7A5, 0xD9A37B, 0xC68863, 0x8D5A3B, 0x5E3A24, 0xEBB894};
	const uint32 Shirts[] = {0xD94F4F, 0x3F7FD0, 0xE8E4DA, 0x3FA06A, 0xE0B53A, 0x7A4FB0, 0x2B2D33, 0xE67E3A, 0x5FB7C9, 0xB03060};
	const uint32 Pants[] = {0x1B1E26, 0x3A4252, 0x6B5B45, 0x2A2A2E, 0x4A5A7A, 0x8A8F96};
	const uint32 Hairs[] = {0x15100C, 0x2A1B10, 0x4A3220, 0x8A6A3A, 0xB8A070, 0x6A6A6A};

	SC::BodyStyle StyleFor(SC::Archetype Kind, uint32 Seed)
	{
		SC::Rng R(Seed * 2654435761u + 17u);
		const SC::Col Skin = SC::Hex(SkinTones[R.I(6)]);
		SC::BodyStyle S;
		switch (Kind)
		{
		case SC::Archetype::Bruiser: S = SC::BruiserStyle(Skin, SC::Hex(Shirts[R.I(10)])); S.pants = SC::Hex(Pants[R.I(6)]); break;
		case SC::Archetype::Enforcer: S = SC::BruiserStyle(Skin, SC::Hex(0x111114)); S.pants = SC::Hex(0x15151A); break;
		case SC::Archetype::Cop:
			S.skin = Skin; S.shirt = SC::Hex(0x1C2D52); S.pants = SC::Hex(0x141C2C); S.shoes = SC::Hex(0x0A0A0C); S.hair = SC::Hex(Hairs[R.I(4)]); S.height = R.R(172, 188); break;
		default:
			S.skin = Skin; S.shirt = SC::Hex(Shirts[R.I(10)]); S.pants = SC::Hex(Pants[R.I(6)]); S.hair = SC::Hex(Hairs[R.I(6)]); S.height = R.R(160, 190);
			S.female = R.Chance(0.45); S.shortSleeves = R.Chance(0.5); if (S.female) S.height -= 8; break;
		}
		return S;
	}
}

ASCNpc::ASCNpc()
{
	PrimaryActorTick.bCanEverTick = true;
	Capsule = CreateDefaultSubobject<UCapsuleComponent>(TEXT("Capsule"));
	SetRootComponent(Capsule);
	Capsule->InitCapsuleSize(34.f, 89.f);
	Capsule->SetCollisionEnabled(ECollisionEnabled::QueryOnly);
	Capsule->SetCollisionObjectType(ECC_Pawn);
	Capsule->SetCollisionResponseToAllChannels(ECR_Ignore);
	Capsule->SetCollisionResponseToChannel(ECC_WorldStatic, ECR_Block);
	Capsule->SetCollisionResponseToChannel(ECC_WorldDynamic, ECR_Block);
	Capsule->SetCollisionResponseToChannel(ECC_Pawn, ECR_Block);
	Capsule->SetCollisionResponseToChannel(ECC_Visibility, ECR_Block);
	Capsule->SetCollisionResponseToChannel(ECC_Vehicle, ECR_Overlap);
	Puppet = CreateDefaultSubobject<USCPuppet>(TEXT("Puppet"));
	Puppet->SetupAttachment(Capsule);
	Flash = CreateDefaultSubobject<UPointLightComponent>(TEXT("Flash"));
	Flash->SetupAttachment(Capsule);
	Flash->SetVisibility(false);
}

void ASCNpc::Setup(SC::Archetype InKind, uint32 Seed)
{
	Kind = InKind;
	const SC::BodyStyle Style = StyleFor(Kind, Seed);
	HalfHeight = (float)Style.height * 0.5f;
	Capsule->SetCapsuleSize(34.f * (Kind == SC::Archetype::Bruiser || Kind == SC::Archetype::Enforcer ? 1.15f : 1.f), HalfHeight);
	Puppet->SetRelativeLocation(FVector(0.f, 0.f, -HalfHeight));
	Puppet->Build(Style);
	Brain = MakeUnique<SC::Brain>(Kind, Seed * 7919u + 3u);
	Flash->SetIntensityUnits(ELightUnits::Lumens);
	Flash->SetIntensity(6000.f);
	Flash->SetAttenuationRadius(500.f);
	Flash->SetLightColor(FLinearColor(1.f, 0.8f, 0.5f));
	Flash->SetRelativeLocation(FVector(70.f, 0.f, 20.f));
	Phase = (float)(Seed % 628) / 100.f;
}

void ASCNpc::InitStroll(SC::Archetype InKind, uint32 Seed, const SC::WalkLoop& InLoop, float StartS)
{
	Setup(InKind, Seed);
	Walker.loop = InLoop;
	Walker.s = StartS;
	Walker.dir = (Seed & 1u) ? 1 : -1;
	Walker.speed = 120.f + (float)(Seed % 50);
	Walker.rng = SC::Rng(Seed + 99u);
	Mode = EMode::Stroll;
	if (Kind == SC::Archetype::Cop) Provoke();
}

void ASCNpc::InitStation(SC::Archetype InKind, uint32 Seed, const FVector& Pos, float YawRad, bool bInStaff)
{
	Setup(InKind, Seed);
	bStaff = bInStaff;
	SetActorLocationAndRotation(Pos, FRotator(0.f, FMath::RadiansToDegrees(YawRad), 0.f));
	Mode = EMode::Station;
	if (Kind == SC::Archetype::Cop) Provoke();
}

int32 ASCNpc::TakeWallet()
{
	if (!HasWallet()) return 0;
	bWalletTaken = true;
	return (int32)Brain->wallet;
}

bool ASCNpc::ReceiveHit(float Damage, bool bGun, bool bBlade, float Knock, bool bHead, const FVector& Dir, bool bCar)
{
	if (!Brain) return false;
	Provoke();
	return Brain->Hit(Damage, bGun, bBlade, Knock, bHead, SCU::V(Dir), bCar);
}

void ASCNpc::Provoke()
{
	if (Mode == EMode::Fight || Mode == EMode::Flee || Mode == EMode::Leave) return;
	if (Kind == SC::Archetype::Civilian) { Mode = EMode::Flee; FleeT = 9.f; }
	else Mode = EMode::Fight;
}

void ASCNpc::Dismiss()
{
	if (Mode == EMode::Leave) return;
	Mode = EMode::Leave;
	LeaveT = 0.f;
}

void ASCNpc::MoveBy(const FVector& Delta)
{
	if (Delta.IsNearlyZero()) return;
	FHitResult Hit;
	AddActorWorldOffset(Delta, true, &Hit);
	if (Hit.bBlockingHit)
	{
		// Slide along whatever is in the way (try each axis on its own).
		AddActorWorldOffset(FVector(Delta.X, 0.f, 0.f), true);
		AddActorWorldOffset(FVector(0.f, Delta.Y, 0.f), true);
	}
}

void ASCNpc::StickToGround(float DeltaSeconds)
{
	GroundT -= DeltaSeconds;
	if (GroundT > 0.f) return;
	GroundT = 0.2f;
	UWorld* W = GetWorld();
	if (!W) return;
	FCollisionQueryParams Q;
	Q.AddIgnoredActor(this);
	FHitResult H;
	const FVector P = GetActorLocation();
	if (W->LineTraceSingleByChannel(H, P + FVector(0.f, 0.f, 60.f), P - FVector(0.f, 0.f, 400.f), ECC_Visibility, Q))
	{
		SetActorLocation(FVector(P.X, P.Y, H.ImpactPoint.Z + HalfHeight));
	}
}

void ASCNpc::Animate(float DeltaSeconds, bool bMoving, float Speed, const SC::BrainOut* Out)
{
	const double Ht = (double)Puppet->Height();
	SC::Pose P;
	const bool bDown = Brain && (Brain->IsKo() || Brain->IsDead());
	bool bShowGun = false;
	if (bDown)
	{
		DownAnim = FMath::Min(1.f, DownAnim + DeltaSeconds * 2.f);
		P = SC::PoseDown(DownAnim, Ht);
	}
	else
	{
		DownAnim = 0.f;
		if (HandsUpT > 0.f) P = SC::PoseHandsUp(Clock, Ht);
		else if (Out && Brain && Brain->stun > 0.0) P = SC::PoseStagger(Clock, Ht);
		else if (Out && Out->blow != SC::Blow::None) P = SC::PoseBlow(Out->blow, Out->blowK, Brain->blow.hit, Ht);
		else if (Out && (Out->aiming || (Out->drawing && Out->drawK > 0.5))) { P = SC::PoseAim(Out->aimPitch, Ht); bShowGun = true; }
		else if (bMoving) { Phase += Speed * DeltaSeconds * 0.045f; P = SC::PoseWalk(Phase, FMath::Min(Speed / 430.f, 1.7f), Ht); }
		else P = SC::PoseStand(Clock, Ht);
		bShowGun = bShowGun || (bGunOut && Out != nullptr && Out->reloading);
	}
	Puppet->Apply(P);
	Puppet->ShowGun(bShowGun);
}

void ASCNpc::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	Clock += DeltaSeconds;
	HandsUpT = FMath::Max(0.f, HandsUpT - DeltaSeconds);
	if (FlashT > 0.f) { FlashT -= DeltaSeconds; if (FlashT <= 0.f) Flash->SetVisibility(false); }
	ASCDirector* Dir = ASCDirector::Get(this);
	ASCCharacter* Pl = Dir ? Dir->Player : nullptr;
	if (!Brain) return;
	const FVector Loc = GetActorLocation();
	const float Dist = Pl ? FVector::Dist2D(Loc, Pl->GetActorLocation()) : 1.0e9f;

	// The body is down (knocked out or shot): the brain counts the seconds, and then he gets up and goes (or is taken away).
	if (Brain->IsKo() || Brain->IsDead())
	{
		SC::BrainIn In; In.dt = DeltaSeconds;
		const SC::BrainOut Out = Brain->Update(In);
		if (Out.remove) { Destroy(); return; }
		if (Brain->IsKo() || Brain->IsDead()) { Animate(DeltaSeconds, false, 0.f, nullptr); StickToGround(DeltaSeconds); return; }
	}

	// Line of sight to the player (a trace a few times a second).
	LosT -= DeltaSeconds;
	if (Pl && LosT <= 0.f)
	{
		LosT = 0.25f;
		FCollisionQueryParams Q; Q.AddIgnoredActor(this);
		FHitResult H;
		UWorld* W = GetWorld();
		bLos = !(W && W->LineTraceSingleByChannel(H, Loc + FVector(0.f, 0.f, 70.f), Pl->Chest(), ECC_Visibility, Q)) || H.GetActor() == Pl;
		bSees = bLos && Dist < 4500.f;
	}

	switch (Mode)
	{
	case EMode::Stroll:
	{
		Walker.Update(DeltaSeconds);
		SC::V2 Heading{1, 0};
		const SC::V2 P = Walker.Pos(&Heading);
		SetActorLocation(FVector(P.x, P.y, SC::kCurbH + HalfHeight));
		const float Target = FMath::RadiansToDegrees(FMath::Atan2((float)Heading.y, (float)Heading.x));
		SetActorRotation(FRotator(0.f, FMath::FixedTurn(GetActorRotation().Yaw, Target, 360.f * DeltaSeconds), 0.f));
		const bool bMoving = !Walker.idle;
		if (Dist < 6000.f || FMath::Fmod(Clock, 0.2f) < DeltaSeconds) Animate(DeltaSeconds, bMoving, bMoving ? Walker.speed : 0.f, nullptr);
		break;
	}
	case EMode::Station:
	{
		Animate(DeltaSeconds, false, 0.f, nullptr);
		break;
	}
	case EMode::Leave:
	{
		LeaveT += DeltaSeconds;
		if (LeaveT > 9.f) { Destroy(); return; }
		FVector Away = Pl ? (Loc - Pl->GetActorLocation()).GetSafeNormal2D() : GetActorForwardVector();
		MoveBy(Away * 160.f * DeltaSeconds);
		SetActorRotation(FRotator(0.f, Away.Rotation().Yaw, 0.f));
		StickToGround(DeltaSeconds);
		Animate(DeltaSeconds, true, 160.f, nullptr);
		break;
	}
	case EMode::Flee:
	{
		FleeT -= DeltaSeconds;
		if (FleeT <= 0.f) { Destroy(); return; }
		FVector Away = Pl ? (Loc - Pl->GetActorLocation()).GetSafeNormal2D() : GetActorForwardVector();
		if (Away.IsNearlyZero()) Away = GetActorForwardVector();
		MoveBy(Away * 520.f * DeltaSeconds);
		SetActorRotation(FRotator(0.f, FMath::FixedTurn(GetActorRotation().Yaw, Away.Rotation().Yaw, 720.f * DeltaSeconds), 0.f));
		StickToGround(DeltaSeconds);
		HandsUpT = 0.f;
		Animate(DeltaSeconds, true, 520.f, nullptr);
		break;
	}
	case EMode::Fight:
	{
		if (!Pl) { Animate(DeltaSeconds, false, 0.f, nullptr); break; }
		SC::BrainIn In;
		In.dt = DeltaSeconds;
		In.self = SCU::V(Loc);
		In.selfYaw = FMath::DegreesToRadians(GetActorRotation().Yaw);
		In.target = SCU::V(Pl->Chest());
		In.targetDown = Pl->IsDown();
		In.targetInCar = Pl->InCar() && Kind != SC::Archetype::Cop;
		In.targetSpeed = Pl->HorizontalSpeed();
		In.los = bLos;
		const SC::BrainOut Out = Brain->Update(In);
		if (Out.remove) { Destroy(); return; }
		bGunOut = Out.aiming || Out.drawing;
		MoveBy(FVector(Out.move.x, Out.move.y, 0.0) * (float)(Out.speed * DeltaSeconds));
		if (Out.face) SetActorRotation(FRotator(0.f, FMath::FixedTurn(GetActorRotation().Yaw, FMath::RadiansToDegrees((float)Out.faceYaw), 540.f * DeltaSeconds), 0.f));
		if (Out.fired)
		{
			Flash->SetVisibility(true);
			FlashT = 0.06f;
			if (Out.shotHits) Pl->TakeHit((float)Out.shotDamage, false, GetActorForwardVector());
		}
		if (Out.blowLanded) Pl->TakeHit((float)Out.blowDamage, Out.knockdown, SCU::V(Out.blowDir));
		StickToGround(DeltaSeconds);
		Animate(DeltaSeconds, Out.speed > 10.0, (float)Out.speed, &Out);
		break;
	}
	}
}
