// Sunset City (Unreal Engine 5): a car. One rigid body with four rays for the wheels: each ray is a spring and a damper that holds the car up, and a tyre that grips sideways and
// pushes or brakes along the wheel (the classic raycast vehicle: everything is force on the body, applied where the wheel touches the road). The body is built from Core/SCCarBody.h
// (a lofted shell with glass, paint, lamps; a police car gets a light bar and a push bar), the wheels turn and steer. Drive with W A S D, Space is the handbrake, E gets out,
// R puts you back on your wheels. A police car (bAI) drives itself at a target. If you import the Ferrari scan (Content/Python/sc_import_assets.py) it can replace the built-in body.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Pawn.h"
#include "Core/SCCarBody.h"
#include "SCVehicle.generated.h"

class UBoxComponent;
class UCameraComponent;
class USpringArmComponent;
class UProceduralMeshComponent;
class UStaticMeshComponent;
class USpotLightComponent;
class UPointLightComponent;
class ASCCharacter;

UCLASS(Config = Game)
class SUNSETCITY_API ASCVehicle : public APawn
{
	GENERATED_BODY()

public:
	ASCVehicle();
	virtual void Tick(float DeltaSeconds) override;

	/** Choose what it is and build it. Call right after spawning. */
	void Setup(SC::CarKind InKind, const FLinearColor& Paint, bool bHero);
	void OnEntered(ASCCharacter* InDriver);
	void OnExited();

	/** The car's body (the physics root). */
	UPROPERTY(VisibleAnywhere, Category = "Sunset") TObjectPtr<UBoxComponent> Body;
	UPROPERTY(VisibleAnywhere, Category = "Sunset") TObjectPtr<USpringArmComponent> Arm;
	UPROPERTY(VisibleAnywhere, Category = "Sunset") TObjectPtr<UCameraComponent> Camera;

	/** The imported Ferrari to use for the hero car instead of the built-in body (leave empty for the built-in one). Set in Config/DefaultGame.ini. */
	UPROPERTY(Config, EditAnywhere, Category = "Sunset") FSoftObjectPath HeroCarMeshPath;

	UPROPERTY(EditAnywhere, Category = "Sunset|Handling") float MassKg = 1400.f;
	UPROPERTY(EditAnywhere, Category = "Sunset|Handling") float SpringK = 24000.f;          // force per cm of compression, per wheel
	UPROPERTY(EditAnywhere, Category = "Sunset|Handling") float Damper = 3600.f;
	UPROPERTY(EditAnywhere, Category = "Sunset|Handling") float EngineForce = 480000.f;     // per driven wheel
	UPROPERTY(EditAnywhere, Category = "Sunset|Handling") float BrakeForce = 520000.f;
	UPROPERTY(EditAnywhere, Category = "Sunset|Handling") float LateralStiffness = 4200.f;
	UPROPERTY(EditAnywhere, Category = "Sunset|Handling") float Grip = 1.15f;               // friction coefficient of the tyres
	UPROPERTY(EditAnywhere, Category = "Sunset|Handling") float MaxSpeed = 6200.f;          // cm/s (62 m/s, about 220 km/h)
	UPROPERTY(EditAnywhere, Category = "Sunset|Handling") float MaxSteerDegrees = 32.f;

	/** Drives itself at the target (the police). */
	bool bAI = false;
	TWeakObjectPtr<AActor> AITarget;
	float AIStopDistance = 1000.f;

	float SpeedKmh() const { return FMath::Abs(Forward) * 0.036f; }
	bool IsCruiser() const { return Kind == SC::CarKind::Cruiser; }

private:
	void ReadInput(float Dt);
	void Drive(float Dt);
	void UpdateLights(float Dt);
	void HitPeople();

	SC::CarKind Kind = SC::CarKind::Sports;
	SC::CarSpec Spec;
	FVector WheelLocal[4];
	bool bWheelFront[4] = {true, true, false, false};
	float WheelSide[4] = {1.f, -1.f, 1.f, -1.f};
	float WheelSpin[4] = {0.f, 0.f, 0.f, 0.f};
	float WheelDrop[4] = {0.f, 0.f, 0.f, 0.f};
	bool bGrounded[4] = {false, false, false, false};

	UPROPERTY() TObjectPtr<UProceduralMeshComponent> Shell;
	UPROPERTY() TArray<TObjectPtr<UProceduralMeshComponent>> WheelMesh;
	UPROPERTY() TObjectPtr<UStaticMeshComponent> ImportedBody;
	UPROPERTY() TArray<TObjectPtr<USpotLightComponent>> Headlight;
	UPROPERTY() TArray<TObjectPtr<UPointLightComponent>> PoliceLight;

	TObjectPtr<ASCCharacter> Driver;
	float Throttle = 0.f, BrakeInput = 0.f, Steer = 0.f, SteerTarget = 0.f, Handbrake = 0.f;
	float Forward = 0.f;                 // forward speed, cm/s
	float RideHeight = 55.f, SuspensionTravel = 38.f;
	float FlippedT = 0.f, StuckT = 0.f, ReverseT = 0.f, FlashClock = 0.f, HitCooldown = 0.f, SinceMouse = 99.f;
	bool bBuilt = false, bHero = false;
};
