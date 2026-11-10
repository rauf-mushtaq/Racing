// Sunset City (Unreal Engine 5): what is drawn over the picture: your health, your money, the stars, the clock, what E would do, the crosshair when you aim, the speed when you drive.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/HUD.h"
#include "SCHUD.generated.h"

UCLASS()
class SUNSETCITY_API ASCHUD : public AHUD
{
	GENERATED_BODY()

public:
	virtual void DrawHUD() override;
};
