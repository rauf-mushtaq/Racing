#include "SCCharacter.h"
#include "Camera/CameraComponent.h"
#include "Camera/PlayerCameraManager.h"
#include "Components/CapsuleComponent.h"
#include "Engine/World.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/SpringArmComponent.h"
#include "InputCoreTypes.h"
#include "Math/RotationMatrix.h"
#include "SCDirector.h"
#include "SCNpc.h"
#include "SCPuppet.h"
#include "SCUtil.h"
#include "SCVehicle.h"

namespace
{
	// The blows: a jab and a cross (as the fighters have them), and a kick that knocks a man down.
	const SC::BlowDef& PlayerBlow(int32 Kind)
	{
		static const SC::BlowDef Defs[3] = {SC::BlowOf(0), SC::BlowOf(1), SC::BlowDef{0.55, 0.45, 185.0, 18.0, 1.0, SC::Blow::Kick}};
		return Defs[FMath::Clamp(Kind, 0, 2)];
	}
}

ASCCharacter::ASCCharacter()
{
	PrimaryActorTick.bCanEverTick = true;
	GetCapsuleComponent()->InitCapsuleSize(34.f, 90.f);
	GetCapsuleComponent()->SetCollisionResponseToChannel(ECC_Visibility, ECR_Block);
	bUseControllerRotationYaw = false;
	UCharacterMovementComponent* Move = GetCharacterMovement();
	Move->bOrientRotationToMovement = true;
	Move->RotationRate = FRotator(0.f, 540.f, 0.f);
	Move->JumpZVelocity = 430.f;
	Move->AirControl = 0.35f;
	Move->MaxWalkSpeed = WalkSpeed;
	Move->BrakingDecelerationWalking = 1800.f;

	Puppet = CreateDefaultSubobject<USCPuppet>(TEXT("Puppet"));
	Puppet->SetupAttachment(GetCapsuleComponent());
	Puppet->SetRelativeLocation(FVector(0.f, 0.f, -90.f));

	Arm = CreateDefaultSubobject<USpringArmComponent>(TEXT("Arm"));
	Arm->SetupAttachment(GetCapsuleComponent());
	Arm->SetRelativeLocation(FVector(0.f, 0.f, 50.f));
	Arm->TargetArmLength = 330.f;
	Arm->bUsePawnControlRotation = true;
	Arm->bDoCollisionTest = true;
	Arm->ProbeSize = 12.f;

	Camera = CreateDefaultSubobject<UCameraComponent>(TEXT("Camera"));
	Camera->SetupAttachment(Arm, USpringArmComponent::SocketName);
}

void ASCCharacter::BeginPlay()
{
	Super::BeginPlay();
	SC::BodyStyle Style;
	Style.skin = SC::Hex(0xD9A37B);
	Style.shirt = SC::Hex(0x2E6FA8);
	Style.pants = SC::Hex(0x1A1C22);
	Style.hair = SC::Hex(0x15100C);
	Style.shortSleeves = true;
	Puppet->Build(Style);
	Health = MaxHealth;
	if (ASCDirector* D = ASCDirector::Get(this)) D->Player = this;
}

void ASCCharacter::PossessedBy(AController* NewController)
{
	Super::PossessedBy(NewController);
	bCameraReady = false;
}

float ASCCharacter::HorizontalSpeed() const
{
	const FVector V = GetVelocity();
	return FMath::Sqrt(V.X * V.X + V.Y * V.Y);
}

void ASCCharacter::TakeHit(float Damage, bool bKnockdown, const FVector& Dir)
{
	if (Car || Health <= 0.f) return;
	Health -= Damage;
	HurtT = 0.f;
	BlowT = -1.f;
	if (Health <= 0.f)
	{
		Health = 0.f;
		DownT = 4.5f;
	}
	else if (bKnockdown)
	{
		DownT = 1.7f;
	}
	if (DownT > 0.f) LaunchCharacter(Dir.GetSafeNormal2D() * 260.f + FVector(0.f, 0.f, 120.f), true, true);
}

void ASCCharacter::Respawn(bool bPenalty)
{
	ASCDirector* D = ASCDirector::Get(this);
	if (D)
	{
		if (bPenalty) D->Money -= D->Money / 5;
		D->Wanted.Clear();
		D->DismissPolice();
	}
	Health = MaxHealth;
	DownT = DownAnim = 0.f;
	bGunDrawn = false;
	SetActorLocationAndRotation(SCU::V(SC::SpawnPoint()) + FVector(0.f, 0.f, 20.f), FRotator(0.f, FMath::RadiansToDegrees(SC::SpawnYaw()), 0.f), false, nullptr, ETeleportType::TeleportPhysics);
	GetCharacterMovement()->StopMovementImmediately();
}

void ASCCharacter::EnterCar(ASCVehicle* V)
{
	APlayerController* PC = Cast<APlayerController>(GetController());
	if (!PC || !V) return;
	Car = V;
	bGunDrawn = false;
	GetCharacterMovement()->StopMovementImmediately();
	SetActorHiddenInGame(true);
	SetActorEnableCollision(false);
	PC->Possess(V);
	V->OnEntered(this);
}

void ASCCharacter::LeaveCar()
{
	if (!Car) return;
	ASCVehicle* V = Car;
	APlayerController* PC = Cast<APlayerController>(V->GetController());
	const FRotator Yaw(0.f, V->GetActorRotation().Yaw, 0.f);
	const FVector Out = V->GetActorLocation() - V->GetActorRightVector() * 230.f + FVector(0.f, 0.f, 60.f);
	Car = nullptr;
	SetActorLocationAndRotation(Out, Yaw, false, nullptr, ETeleportType::TeleportPhysics);
	SetActorHiddenInGame(false);
	SetActorEnableCollision(true);
	GetCharacterMovement()->SetMovementMode(MOVE_Walking);
	if (PC)
	{
		PC->Possess(this);
		PC->SetControlRotation(Yaw);
	}
	V->OnExited();
}

void ASCCharacter::StartBlow(int32 Kind)
{
	if (BlowT >= 0.f || IsDown() || Car) return;
	BlowKind = Kind;
	BlowT = 0.f;
	bBlowHit = false;
}

void ASCCharacter::Strike(const SC::BlowDef& Def)
{
	UWorld* W = GetWorld();
	ASCDirector* D = ASCDirector::Get(this);
	if (!W || !D) return;
	const FVector Start = GetActorLocation(), Fwd = GetActorForwardVector();
	FCollisionQueryParams Q;
	Q.AddIgnoredActor(this);
	TArray<FHitResult> Hits;
	W->SweepMultiByChannel(Hits, Start, Start + Fwd * (float)Def.reach, FQuat::Identity, ECC_Pawn, FCollisionShape::MakeSphere(60.f), Q);
	TSet<ASCNpc*> Done;
	for (const FHitResult& H : Hits)
	{
		ASCNpc* N = Cast<ASCNpc>(H.GetActor());
		if (!N || Done.Contains(N)) continue;
		const FVector To = (N->GetActorLocation() - Start).GetSafeNormal2D();
		if (FVector::DotProduct(To, Fwd) < 0.45f) continue;
		Done.Add(N);
		const bool bFinished = N->ReceiveHit((float)Def.dmg * 1.4f, false, false, (float)Def.knock, false, Fwd, false);
		D->Commit(SC::Crime::Assault, 1.f);
		if (Def.knock > 0.5) D->Commit(SC::Crime::KnockedSomeoneDown, 1.f);
		if (bFinished && N->IsDead()) D->Commit(SC::Crime::KilledSomeone, 1.f);
	}
}

void ASCCharacter::Shoot()
{
	if (ShotCooldown > 0.f || !Camera) return;
	ShotCooldown = 0.2f;
	UWorld* W = GetWorld();
	ASCDirector* D = ASCDirector::Get(this);
	if (!W || !D) return;
	const FVector Start = Camera->GetComponentLocation(), Dir = Camera->GetForwardVector();
	FCollisionQueryParams Q;
	Q.AddIgnoredActor(this);
	FHitResult H;
	D->Commit(SC::Crime::Gunshot, 1.f);
	if (W->LineTraceSingleByChannel(H, Start, Start + Dir * 9000.f, ECC_Visibility, Q))
	{
		if (ASCNpc* N = Cast<ASCNpc>(H.GetActor()))
		{
			const bool bHead = H.ImpactPoint.Z > N->GetActorLocation().Z + 55.f;
			const bool bFinished = N->ReceiveHit(22.f, true, false, 0.f, bHead, Dir, false);
			if (bFinished && N->IsDead()) D->Commit(SC::Crime::KilledSomeone, 1.f);
		}
	}
}

void ASCCharacter::Interact()
{
	ASCDirector* D = ASCDirector::Get(this);
	if (!D) return;
	if (ASCNpc* Loot = D->NearestLoot(GetActorLocation(), 230.f))
	{
		D->Money += Loot->TakeWallet();
		return;
	}
	if (bGunDrawn && D->TryRob(this)) return;
	if (ASCVehicle* V = D->NearestVehicle(GetActorLocation(), 430.f)) EnterCar(V);
}

void ASCCharacter::BuildPose(float Dt, bool bMoving, float Speed)
{
	SC::Pose P;
	if (DownT > 0.f)
	{
		DownAnim = FMath::Min(1.f, DownAnim + Dt * 2.2f);
		P = SC::PoseDown(DownAnim, (double)Puppet->Height());
	}
	else
	{
		DownAnim = 0.f;
		if (BlowT >= 0.f)
		{
			const SC::BlowDef& Def = PlayerBlow(BlowKind);
			P = SC::PoseBlow(Def.pose, BlowT / (float)Def.dur, Def.hit, (double)Puppet->Height());
		}
		else if (IsAiming())
		{
			const float Pitch = FRotator::NormalizeAxis(GetControlRotation().Pitch);
			P = SC::PoseAim(FMath::DegreesToRadians(Pitch), (double)Puppet->Height());
		}
		else if (bMoving)
		{
			Phase += Speed * Dt * 0.045f;
			P = SC::PoseWalk(Phase, FMath::Min(Speed / 430.f, 1.7f), (double)Puppet->Height());
		}
		else
		{
			P = SC::PoseStand(Clock, (double)Puppet->Height());
		}
	}
	Puppet->Apply(P);
	Puppet->ShowGun(bGunDrawn && DownT <= 0.f);
}

void ASCCharacter::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	Clock += DeltaSeconds;
	APlayerController* PC = Cast<APlayerController>(GetController());
	if (!PC) return;
	if (!bCameraReady && PC->PlayerCameraManager)
	{
		PC->PlayerCameraManager->ViewPitchMin = -60.f;
		PC->PlayerCameraManager->ViewPitchMax = 50.f;
		PC->SetShowMouseCursor(false);
		PC->SetInputMode(FInputModeGameOnly());
		bCameraReady = true;
	}
	HurtT += DeltaSeconds;
	ShotCooldown = FMath::Max(0.f, ShotCooldown - DeltaSeconds);
	if (HurtT > 8.f && Health > 0.f && Health < MaxHealth) Health = FMath::Min(MaxHealth, Health + 2.f * DeltaSeconds);
	if (DownT > 0.f)
	{
		DownT -= DeltaSeconds;
		if (DownT <= 0.f && Health <= 0.f) { Respawn(true); return; }
	}

	// Look.
	float DX = 0.f, DY = 0.f;
	PC->GetInputMouseDelta(DX, DY);
	AddControllerYawInput(DX * LookSensitivity);
	AddControllerPitchInput(-DY * LookSensitivity);

	// Move (relative to where the camera looks).
	const bool bDown = IsDown();
	const float Fw = (PC->IsInputKeyDown(EKeys::W) ? 1.f : 0.f) - (PC->IsInputKeyDown(EKeys::S) ? 1.f : 0.f);
	const float Rt = (PC->IsInputKeyDown(EKeys::D) ? 1.f : 0.f) - (PC->IsInputKeyDown(EKeys::A) ? 1.f : 0.f);
	const FRotator YawRot(0.f, GetControlRotation().Yaw, 0.f);
	FVector Wish = FRotationMatrix(YawRot).GetUnitAxis(EAxis::X) * Fw + FRotationMatrix(YawRot).GetUnitAxis(EAxis::Y) * Rt;
	const bool bAiming = IsAiming();
	const bool bSprint = PC->IsInputKeyDown(EKeys::LeftShift) && !bAiming && BlowT < 0.f;
	GetCharacterMovement()->MaxWalkSpeed = bSprint ? SprintSpeed : (BlowT >= 0.f || bAiming ? WalkSpeed * 0.6f : WalkSpeed);
	if (!bDown && !Wish.IsNearlyZero())
	{
		Wish.Normalize();
		AddMovementInput(Wish, 1.f);
	}
	if (!bDown && PC->WasInputKeyJustPressed(EKeys::SpaceBar)) Jump();
	// While aiming the body faces where the camera looks; otherwise it turns the way it walks.
	GetCharacterMovement()->bOrientRotationToMovement = !bAiming;
	bUseControllerRotationYaw = bAiming;
	AimBlend = FMath::FInterpTo(AimBlend, bAiming ? 1.f : 0.f, DeltaSeconds, 8.f);
	Arm->TargetArmLength = FMath::Lerp(330.f, 210.f, AimBlend);
	Arm->SocketOffset = FVector(0.f, 55.f * AimBlend, 60.f);

	// Fight, shoot, use.
	if (!bDown)
	{
		if (PC->WasInputKeyJustPressed(EKeys::Q)) bGunDrawn = !bGunDrawn;
		if (PC->WasInputKeyJustPressed(EKeys::E)) Interact();
		if (bGunDrawn)
		{
			if (PC->IsInputKeyDown(EKeys::LeftMouseButton)) Shoot();
		}
		else
		{
			if (PC->WasInputKeyJustPressed(EKeys::LeftMouseButton)) StartBlow(NextPunch++ % 2);
			if (PC->WasInputKeyJustPressed(EKeys::F)) StartBlow(2);
		}
	}
	if (BlowT >= 0.f)
	{
		const SC::BlowDef& Def = PlayerBlow(BlowKind);
		BlowT += DeltaSeconds;
		if (!bBlowHit && BlowT / (float)Def.dur >= (float)Def.hit) { bBlowHit = true; Strike(Def); }
		if (BlowT >= (float)Def.dur) BlowT = -1.f;
	}

	const float Speed = HorizontalSpeed();
	BuildPose(DeltaSeconds, Speed > 30.f && GetCharacterMovement()->IsMovingOnGround(), Speed);
}
