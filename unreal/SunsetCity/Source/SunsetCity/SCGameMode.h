// Sunset City (Unreal Engine 5): the game. When the level starts it makes the sky (ASCEnvironment), the city (ASCWorld) and the director (ASCDirector), puts you on the pavement of the
// plaza (ASCCharacter) and parks a sports car at the kerb. Nothing needs placing in the level: any empty map will do (Content/Python/sc_setup.py makes one called Main).
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "SCGameMode.generated.h"

class ASCDirector;
class ASCEnvironment;
class ASCWorld;
class ASCVehicle;
class APlayerStart;

UCLASS()
class SUNSETCITY_API ASCGameMode : public AGameModeBase
{
	GENERATED_BODY()

public:
	ASCGameMode();
	virtual void StartPlay() override;
	virtual AActor* ChoosePlayerStart_Implementation(AController* Player) override;

	UPROPERTY() TObjectPtr<ASCDirector> Director;
	UPROPERTY() TObjectPtr<ASCEnvironment> Environment;
	UPROPERTY() TObjectPtr<ASCWorld> CityWorld;
	UPROPERTY() TObjectPtr<ASCVehicle> HeroCar;
	UPROPERTY() TObjectPtr<APlayerStart> Start;
};
