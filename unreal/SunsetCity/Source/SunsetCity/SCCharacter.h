// Sunset City (Unreal Engine 5): you, on foot. Walk and sprint (W A S D, Shift), jump (Space), look with the mouse, punch (left mouse), kick (F), draw or holster the pistol (Q; then left
// mouse shoots), get in and out of a car, take a fallen man's wallet or rob a till (E). Hits knock you down; at nothing you are out and wake up at the start, a little poorer.
// The keyboard and the mouse are read directly (no input mapping assets needed).
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "Core/SCBrain.h"
#include "SCCharacter.generated.h"

class UCameraComponent;
class USpringArmComponent;
class USCPuppet;
class ASCVehicle;

UCLASS()
class SUNSETCITY_API ASCCharacter : public ACharacter
{
	GENERATED_BODY()

public:
	ASCCharacter();
	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;
	virtual void PossessedBy(AController* NewController) override;

	UPROPERTY(VisibleAnywhere, Category = "Sunset") TObjectPtr<UCameraComponent> Camera;
	UPROPERTY(VisibleAnywhere, Category = "Sunset") TObjectPtr<USpringArmComponent> Arm;
	UPROPERTY(VisibleAnywhere, Category = "Sunset") TObjectPtr<USCPuppet> Puppet;

	UPROPERTY(EditAnywhere, Category = "Sunset") float MaxHealth = 100.f;
	UPROPERTY(EditAnywhere, Category = "Sunset") float WalkSpeed = 220.f;
	UPROPERTY(EditAnywhere, Category = "Sunset") float SprintSpeed = 560.f;
	UPROPERTY(EditAnywhere, Category = "Sunset") float LookSensitivity = 0.6f;

	float Health = 100.f;
	bool bGunDrawn = false;

	bool IsDown() const { return DownT > 0.f; }
	bool IsAiming() const { return bGunDrawn && !IsDown() && Car == nullptr; }
	bool InCar() const { return Car != nullptr; }
	float HorizontalSpeed() const;
	FVector Chest() const { return GetActorLocation() + FVector(0.f, 0.f, 30.f); }

	/** Something hurt you: a punch, a bullet. */
	void TakeHit(float Damage, bool bKnockdown, const FVector& Dir);
	void EnterCar(ASCVehicle* V);
	void LeaveCar();
	/** Back to where you started (after being knocked out or arrested). */
	void Respawn(bool bPenalty);

private:
	void StartBlow(int32 Kind);
	void Strike(const SC::BlowDef& Def);
	void Shoot();
	void Interact();
	void BuildPose(float Dt, bool bMoving, float Speed);

	TObjectPtr<ASCVehicle> Car;
	bool bCameraReady = false;

	float DownT = 0.f, DownAnim = 0.f, HurtT = 99.f, ShotCooldown = 0.f, Phase = 0.f, Clock = 0.f, AimBlend = 0.f;
	int32 BlowKind = 0, NextPunch = 0;
	float BlowT = -1.f;
	bool bBlowHit = false;
};
