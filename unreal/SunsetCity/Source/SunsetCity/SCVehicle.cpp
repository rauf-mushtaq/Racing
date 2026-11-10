#include "SCVehicle.h"
#include "Camera/CameraComponent.h"
#include "Components/BoxComponent.h"
#include "Components/PointLightComponent.h"
#include "Components/SpotLightComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Engine/World.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/SpringArmComponent.h"
#include "InputCoreTypes.h"
#include "ProceduralMeshComponent.h"
#include "SCCharacter.h"
#include "SCDirector.h"
#include "SCMaterials.h"
#include "SCNpc.h"
#include "SCUtil.h"

ASCVehicle::ASCVehicle()
{
	PrimaryActorTick.bCanEverTick = true;
	PrimaryActorTick.TickGroup = TG_PrePhysics;
	Body = CreateDefaultSubobject<UBoxComponent>(TEXT("Body"));
	SetRootComponent(Body);
	Body->SetBoxExtent(FVector(225.f, 92.f, 40.f));
	Body->SetCollisionProfileName(TEXT("Vehicle"));
	Body->SetSimulatePhysics(true);
	Body->SetLinearDamping(0.05f);
	Body->SetAngularDamping(1.2f);
	Body->BodyInstance.COMNudge = FVector(0.f, 0.f, -22.f);
	Body->SetMassOverrideInKg(NAME_None, MassKg, true);

	Arm = CreateDefaultSubobject<USpringArmComponent>(TEXT("Arm"));
	Arm->SetupAttachment(Body);
	Arm->SetRelativeRotation(FRotator(-13.f, 0.f, 0.f));
	Arm->TargetArmLength = 640.f;
	Arm->SocketOffset = FVector(0.f, 0.f, 150.f);
	Arm->bUsePawnControlRotation = false;
	Arm->bInheritPitch = false;
	Arm->bInheritRoll = false;
	Arm->bInheritYaw = true;
	Arm->bEnableCameraLag = true;
	Arm->CameraLagSpeed = 9.f;
	Arm->bEnableCameraRotationLag = true;
	Arm->CameraRotationLagSpeed = 4.f;
	Camera = CreateDefaultSubobject<UCameraComponent>(TEXT("Camera"));
	Camera->SetupAttachment(Arm, USpringArmComponent::SocketName);
}

void ASCVehicle::Setup(SC::CarKind InKind, const FLinearColor& Paint, bool bInHero)
{
	if (bBuilt) return;
	bBuilt = true;
	Kind = InKind;
	bHero = bInHero;
	Spec = SC::MakeCarSpec(Kind, SC::Col{Paint.R, Paint.G, Paint.B, 1.f});
	Body->SetBoxExtent(FVector(Spec.L * 0.5f, Spec.W * 0.5f, 40.f));
	RideHeight = Spec.wheelR + 21.f;
	for (int32 i = 0; i < 4; ++i)
	{
		const float Fx = i < 2 ? 1.f : -1.f;
		WheelSide[i] = (i % 2 == 0) ? 1.f : -1.f;
		bWheelFront[i] = i < 2;
		WheelLocal[i] = FVector(Fx * (float)Spec.wheelbase * 0.5f, WheelSide[i] * (float)Spec.track * 0.5f, 0.f);
	}
	USCMaterials* Mats = GetWorld() ? GetWorld()->GetSubsystem<USCMaterials>() : nullptr;

	// The body (the car is built with its wheels on z = 0; the body's origin is RideHeight above the ground).
	Shell = SCU::MakeMesh(this, Body, FVector(0.f, 0.f, -RideHeight), false);
	SCU::FillMesh(Shell, SC::BuildCarBody(Spec), Mats, false);
	if (bHero && HeroCarMeshPath.IsValid())
	{
		if (UStaticMesh* SM = Cast<UStaticMesh>(HeroCarMeshPath.TryLoad()))
		{
			ImportedBody = NewObject<UStaticMeshComponent>(this);
			ImportedBody->SetupAttachment(Body);
			ImportedBody->SetStaticMesh(SM);
			ImportedBody->SetCollisionEnabled(ECollisionEnabled::NoCollision);
			ImportedBody->RegisterComponent();
			ImportedBody->SetRelativeLocation(FVector(0.f, 0.f, -RideHeight));
			Shell->SetVisibility(false);
		}
	}
	WheelMesh.SetNum(4);
	Headlight.SetNum(2);
	PoliceLight.SetNum(2);
	for (int32 i = 0; i < 4; ++i)
	{
		SC::Mesh W = SC::BuildWheel(Spec);
		if (WheelSide[i] < 0.f) W.MirrorY();
		WheelMesh[i] = SCU::MakeMesh(this, Body, WheelLocal[i] + FVector(0.f, 0.f, -(RideHeight - (float)Spec.wheelR)), false);
		SCU::FillMesh(WheelMesh[i], W, Mats, false);
	}
	// Lights: two headlights (on at night) and, on a police car, a red and a blue flasher.
	for (int32 i = 0; i < 2; ++i)
	{
		USpotLightComponent* L = NewObject<USpotLightComponent>(this);
		L->SetupAttachment(Body);
		L->RegisterComponent();
		L->SetRelativeLocation(FVector(Spec.L * 0.5f - 10.f, i == 0 ? -62.f : 62.f, -RideHeight + 66.f));
		L->SetIntensityUnits(ELightUnits::Lumens);
		L->SetIntensity(9000.f);
		L->SetOuterConeAngle(38.f);
		L->SetInnerConeAngle(14.f);
		L->SetAttenuationRadius(4500.f);
		L->SetLightColor(FLinearColor(1.f, 0.95f, 0.84f));
		L->SetVisibility(false);
		Headlight[i] = L;
	}
	if (IsCruiser())
	{
		for (int32 i = 0; i < 2; ++i)
		{
			UPointLightComponent* L = NewObject<UPointLightComponent>(this);
			L->SetupAttachment(Body);
			L->RegisterComponent();
			L->SetRelativeLocation(FVector(-20.f, i == 0 ? -30.f : 30.f, -RideHeight + (float)Spec.Top(0.53) + 22.f));
			L->SetIntensityUnits(ELightUnits::Lumens);
			L->SetIntensity(7000.f);
			L->SetAttenuationRadius(1800.f);
			L->SetLightColor(i == 0 ? FLinearColor(1.f, 0.08f, 0.05f) : FLinearColor(0.1f, 0.25f, 1.f));
			L->SetCastShadows(false);
			L->SetVisibility(false);
			PoliceLight[i] = L;
		}
	}
	if (ASCDirector* D = ASCDirector::Get(this)) D->Vehicles.Add(this);
}

void ASCVehicle::OnEntered(ASCCharacter* InDriver)
{
	Driver = InDriver;
	bAI = false;
}

void ASCVehicle::OnExited()
{
	Driver = nullptr;
	Throttle = 0.f; Steer = SteerTarget = 0.f; BrakeInput = 0.f; Handbrake = 1.f;
}

void ASCVehicle::ReadInput(float Dt)
{
	APlayerController* PC = Cast<APlayerController>(GetController());
	if (PC && Driver)
	{
		const bool bW = PC->IsInputKeyDown(EKeys::W) || PC->IsInputKeyDown(EKeys::Up), bS = PC->IsInputKeyDown(EKeys::S) || PC->IsInputKeyDown(EKeys::Down);
		const bool bA = PC->IsInputKeyDown(EKeys::A) || PC->IsInputKeyDown(EKeys::Left), bD = PC->IsInputKeyDown(EKeys::D) || PC->IsInputKeyDown(EKeys::Right);
		Throttle = 0.f; BrakeInput = 0.f;
		if (bW) { if (Forward < -150.f) BrakeInput = 1.f; else Throttle = 1.f; }
		if (bS) { if (Forward > 150.f) BrakeInput = 1.f; else Throttle = -0.7f; }
		Handbrake = PC->IsInputKeyDown(EKeys::SpaceBar) ? 1.f : 0.f;
		SteerTarget = (bD ? 1.f : 0.f) - (bA ? 1.f : 0.f);
		bool bExit = PC->WasInputKeyJustPressed(EKeys::E), bFlip = PC->WasInputKeyJustPressed(EKeys::R);
		float TouchLookX = 0.f, TouchLookY = 0.f;
		if (ASCDirector* Dir = ASCDirector::Get(this))
		{
			FSCTouchControls& T = Dir->Touch;
			T.bInCar = true;
			T.Update(PC);
			if (T.bActive)                                              // a touch screen: the stick steers, the buttons are the pedals
			{
				if (T.bStick) SteerTarget = FMath::Clamp((float)T.Move.X, -1.f, 1.f);
				if (T.bHeld[FSCTouchControls::BtnAttack]) { if (Forward < -150.f) BrakeInput = 1.f; else Throttle = 1.f; }
				if (T.bHeld[FSCTouchControls::BtnKick]) { if (Forward > 150.f) BrakeInput = 1.f; else Throttle = -0.7f; }
				if (T.bHeld[FSCTouchControls::BtnJump]) Handbrake = 1.f;
				bExit = bExit || T.bPressed[FSCTouchControls::BtnUse];
				bFlip = bFlip || T.bPressed[FSCTouchControls::BtnGun];
				TouchLookX = (float)T.Look.X * 0.25f;
				TouchLookY = (float)T.Look.Y * 0.25f;
			}
		}
		if (bExit) { Driver->LeaveCar(); return; }
		if (bFlip) { SetActorRotation(FRotator(0.f, GetActorRotation().Yaw, 0.f)); AddActorWorldOffset(FVector(0.f, 0.f, 120.f)); Body->SetPhysicsLinearVelocity(FVector::ZeroVector); Body->SetPhysicsAngularVelocityInDegrees(FVector::ZeroVector); }
		// Look round with the mouse for a moment; otherwise the camera swings in behind the car.
		float DX = 0.f, DY = 0.f;
		PC->GetInputMouseDelta(DX, DY);
		DX += TouchLookX; DY += TouchLookY;
		SinceMouse = (FMath::Abs(DX) + FMath::Abs(DY) > 0.f) ? 0.f : SinceMouse + Dt;
		Arm->SetRelativeRotation(FRotator(FMath::Clamp(Arm->GetRelativeRotation().Pitch - DY * 0.5, -50.0, 15.0), FMath::Clamp(Arm->GetRelativeRotation().Yaw + DX * 0.6, -150.0, 150.0), 0.0));
		if (SinceMouse > 1.5f) Arm->SetRelativeRotation(FMath::RInterpTo(Arm->GetRelativeRotation(), FRotator(-13.f, 0.f, 0.f), Dt, 2.5f));
	}
	else if (bAI && AITarget.IsValid())
	{
		const FVector To = AITarget->GetActorLocation() - GetActorLocation();
		const float Dist = To.Size2D();
		const float Err = FMath::FindDeltaAngleDegrees(GetActorRotation().Yaw, To.Rotation().Yaw);
		SteerTarget = FMath::Clamp(Err / 35.f, -1.f, 1.f);
		const float Want = FMath::Clamp(Dist * 0.45f, 0.f, 2900.f);
		Throttle = Forward < Want ? 0.9f : 0.f;
		BrakeInput = (Dist < AIStopDistance || Forward > Want + 400.f) ? 1.f : 0.f;
		if (Dist < AIStopDistance) Throttle = 0.f;
		Handbrake = 0.f;
		// Stuck against something: back out for a moment, steering the other way.
		if (Dist > AIStopDistance && FMath::Abs(Forward) < 80.f) StuckT += Dt; else StuckT = 0.f;
		if (StuckT > 1.6f) { ReverseT = 1.4f; StuckT = 0.f; }
		if (ReverseT > 0.f) { ReverseT -= Dt; Throttle = -0.8f; BrakeInput = 0.f; SteerTarget = -SteerTarget; }
	}
	else
	{
		Throttle = 0.f; SteerTarget = 0.f; BrakeInput = 0.f;
		if (!Driver) Handbrake = 1.f;
	}
	Steer = FMath::FInterpTo(Steer, SteerTarget, Dt, 7.f);
}

void ASCVehicle::Drive(float Dt)
{
	UWorld* W = GetWorld();
	if (!W) return;
	const FTransform T = Body->GetComponentTransform();
	const FVector Up = T.GetUnitAxis(EAxis::Z), Fwd = T.GetUnitAxis(EAxis::X);
	const FVector Vel = Body->GetPhysicsLinearVelocity();
	Forward = FVector::DotProduct(Vel, Fwd);
	const float SteerDeg = Steer * FMath::Lerp(MaxSteerDegrees, 6.f, FMath::Clamp(FMath::Abs(Forward) / 3500.f, 0.f, 1.f));
	const float Reach = SuspensionTravel + (float)Spec.wheelR;
	FCollisionQueryParams Q;
	Q.AddIgnoredActor(this);
	for (int32 i = 0; i < 4; ++i)
	{
		const FVector Mount = T.TransformPosition(WheelLocal[i]);
		FHitResult Hit;
		bGrounded[i] = W->LineTraceSingleByChannel(Hit, Mount, Mount - Up * Reach, ECC_Visibility, Q);
		if (!bGrounded[i]) { WheelDrop[i] = FMath::FInterpTo(WheelDrop[i], SuspensionTravel, Dt, 6.f); continue; }
		const float Compression = Reach - Hit.Distance;
		WheelDrop[i] = Hit.Distance - (float)Spec.wheelR;
		const FVector PointVel = Body->GetPhysicsLinearVelocityAtPoint(Mount);
		const float Spring = FMath::Max(0.f, SpringK * Compression - Damper * (float)FVector::DotProduct(PointVel, Up));
		FVector Force = Up * Spring;
		const FVector WFwd = bWheelFront[i] ? Fwd.RotateAngleAxis(SteerDeg, Up) : Fwd;
		const FVector WRight = FVector::CrossProduct(Up, WFwd);
		const float Vlong = FVector::DotProduct(PointVel, WFwd), Vlat = FVector::DotProduct(PointVel, WRight);
		const float Mu = (!bWheelFront[i] && Handbrake > 0.5f) ? 0.38f : Grip;
		const float Limit = Mu * Spring;
		float Flat = FMath::Clamp(-Vlat * LateralStiffness, -Limit, Limit);
		float Flong = 0.f;
		if (!bWheelFront[i] && Throttle != 0.f && !(Throttle > 0.f && Forward > MaxSpeed)) Flong += Throttle * EngineForce;
		if (BrakeInput > 0.f) Flong += -FMath::Clamp(Vlong * 900.f, -BrakeForce, BrakeForce) * BrakeInput;
		if (!bWheelFront[i] && Handbrake > 0.5f) Flong += -FMath::Clamp(Vlong * 900.f, -BrakeForce, BrakeForce);
		Flong += -Vlong * 25.f;                                         // rolling resistance
		Flong = FMath::Clamp(Flong, -Limit * 1.2f, Limit * 1.2f);
		const float Len = FMath::Sqrt(Flat * Flat + Flong * Flong);
		if (Len > Limit && Len > 1.f) { const float K = Limit / Len; Flat *= K; Flong *= K; }
		Force += WFwd * Flong + WRight * Flat;
		Body->AddForceAtLocation(Force, Mount);
		WheelSpin[i] += (Vlong / FMath::Max(1.f, (float)Spec.wheelR)) * Dt;
	}
	Body->AddForce(-Vel * Vel.Size() * 0.004f);                         // air drag
	// Visuals: the wheels hang from their springs, turn with the road and steer.
	for (int32 i = 0; i < 4; ++i)
	{
		if (!WheelMesh[i]) continue;
		WheelMesh[i]->SetRelativeLocation(WheelLocal[i] + FVector(0.f, 0.f, -WheelDrop[i]));
		WheelMesh[i]->SetRelativeRotation(FRotator(-FMath::RadiansToDegrees(WheelSpin[i]), bWheelFront[i] ? SteerDeg : 0.f, 0.f));
	}
	// On its roof for a while: put it back on its wheels.
	if (Up.Z < 0.25f) FlippedT += Dt; else FlippedT = 0.f;
	if (FlippedT > 4.f) { SetActorRotation(FRotator(0.f, GetActorRotation().Yaw, 0.f)); AddActorWorldOffset(FVector(0.f, 0.f, 150.f)); FlippedT = 0.f; }
}

void ASCVehicle::HitPeople()
{
	if (HitCooldown > 0.f || FMath::Abs(Forward) < 260.f) return;
	UWorld* W = GetWorld();
	ASCDirector* D = ASCDirector::Get(this);
	if (!W || !D) return;
	const FVector Front = GetActorLocation() + GetActorForwardVector() * (Forward >= 0.f ? Spec.L * 0.5f : -Spec.L * 0.5f);
	TArray<FOverlapResult> Over;
	FCollisionQueryParams Q;
	Q.AddIgnoredActor(this);
	W->OverlapMultiByChannel(Over, Front, FQuat::Identity, ECC_Pawn, FCollisionShape::MakeSphere(110.f), Q);
	for (const FOverlapResult& R : Over)
	{
		if (ASCNpc* N = Cast<ASCNpc>(R.GetActor()))
		{
			const bool bFinished = N->ReceiveHit(FMath::Min(180.f, FMath::Abs(Forward) * 0.05f), false, false, 1.f, false, GetActorForwardVector(), true);
			if (Driver) { D->Commit(SC::Crime::HitACar, 1.f); if (bFinished && N->IsDead()) D->Commit(SC::Crime::KilledSomeone, 1.f); }
			HitCooldown = 0.5f;
		}
		else if (ASCCharacter* C = Cast<ASCCharacter>(R.GetActor()))
		{
			if (C != Driver.Get()) { C->TakeHit(FMath::Min(60.f, FMath::Abs(Forward) * 0.03f), true, GetActorForwardVector()); HitCooldown = 0.5f; }
		}
	}
}

void ASCVehicle::UpdateLights(float Dt)
{
	ASCDirector* D = ASCDirector::Get(this);
	const bool bDark = D && D->NightAmount() > 0.45f;
	for (int32 i = 0; i < 2; ++i) if (Headlight[i]) Headlight[i]->SetVisibility(bDark);
	if (IsCruiser() && (bAI || Driver))
	{
		FlashClock += Dt;
		const bool bRed = FMath::Fmod(FlashClock, 0.36f) < 0.18f;
		if (PoliceLight[0]) PoliceLight[0]->SetVisibility(bRed);
		if (PoliceLight[1]) PoliceLight[1]->SetVisibility(!bRed);
	}
}

void ASCVehicle::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	if (!bBuilt) return;
	HitCooldown = FMath::Max(0.f, HitCooldown - DeltaSeconds);
	ReadInput(DeltaSeconds);
	Drive(DeltaSeconds);
	HitPeople();
	UpdateLights(DeltaSeconds);
}
