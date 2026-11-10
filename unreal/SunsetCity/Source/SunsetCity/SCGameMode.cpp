#include "SCGameMode.h"
#include "Engine/World.h"
#include "GameFramework/PlayerStart.h"
#include "SCCharacter.h"
#include "SCDirector.h"
#include "SCEnvironment.h"
#include "SCHUD.h"
#include "SCUtil.h"
#include "SCVehicle.h"
#include "SCWorld.h"

ASCGameMode::ASCGameMode()
{
	DefaultPawnClass = ASCCharacter::StaticClass();
	HUDClass = ASCHUD::StaticClass();
}

AActor* ASCGameMode::ChoosePlayerStart_Implementation(AController* Player)
{
	if (!Start && GetWorld())
	{
		FActorSpawnParameters P;
		P.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
		Start = GetWorld()->SpawnActor<APlayerStart>(SCU::V(SC::SpawnPoint()) + FVector(0.f, 0.f, 30.f), FRotator(0.f, FMath::RadiansToDegrees(SC::SpawnYaw()), 0.f), P);
	}
	return Start;
}

void ASCGameMode::StartPlay()
{
	UWorld* W = GetWorld();
	if (W)
	{
		FActorSpawnParameters P;
		P.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
		Director = W->SpawnActor<ASCDirector>(FVector::ZeroVector, FRotator::ZeroRotator, P);
		Environment = W->SpawnActor<ASCEnvironment>(FVector::ZeroVector, FRotator::ZeroRotator, P);
		CityWorld = W->SpawnActor<ASCWorld>(FVector::ZeroVector, FRotator::ZeroRotator, P);
		if (Director) { Director->Env = Environment; Director->WorldActor = CityWorld; }
		// Your car: a red sports car at the kerb beside the plaza.
		HeroCar = W->SpawnActor<ASCVehicle>(SCU::V(SC::HeroCarSpot()) + FVector(0.f, 0.f, 80.f), FRotator::ZeroRotator, P);
		if (HeroCar) HeroCar->Setup(SC::CarKind::Sports, FLinearColor(SC::Hex(0xB01E26).r, SC::Hex(0xB01E26).g, SC::Hex(0xB01E26).b, 1.f), true);
	}
	Super::StartPlay();
}
