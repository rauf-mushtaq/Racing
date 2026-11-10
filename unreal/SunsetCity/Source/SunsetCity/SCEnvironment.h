// Sunset City (Unreal Engine 5): the sky and the light. A sun that crosses the sky (and a moon that follows it), the physically based sky and its aerial perspective, volumetric clouds and
// fog, the sky light that picks the sky up as ambient light, and the camera's look (exposure, bloom, colour). The time of day runs on its own; the sun sets over the sea in the west.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "SCEnvironment.generated.h"

class USceneComponent;
class UDirectionalLightComponent;
class USkyAtmosphereComponent;
class USkyLightComponent;
class UExponentialHeightFogComponent;
class UVolumetricCloudComponent;
class UPostProcessComponent;
class USCMaterials;

UCLASS()
class SUNSETCITY_API ASCEnvironment : public AActor
{
	GENERATED_BODY()

public:
	ASCEnvironment();
	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;

	/** The hour of the day, 0 to 24 (17.2 is the golden hour). */
	UPROPERTY(EditAnywhere, Category = "Sunset")
	float TimeOfDay = 17.2f;

	/** Real minutes for a whole day and night. 0 freezes the time. */
	UPROPERTY(EditAnywhere, Category = "Sunset")
	float DayLengthMinutes = 24.f;

	/** 0 in daylight .. 1 at night. */
	float Night() const { return NightFactor; }
	float SunElevationDeg() const { return ElevationDeg; }
	void SetTime(float Hour);

private:
	void Apply();

	UPROPERTY(VisibleAnywhere, Category = "Sunset") TObjectPtr<USceneComponent> Root;
	UPROPERTY(VisibleAnywhere, Category = "Sunset") TObjectPtr<UDirectionalLightComponent> Sun;
	UPROPERTY(VisibleAnywhere, Category = "Sunset") TObjectPtr<UDirectionalLightComponent> Moon;
	UPROPERTY(VisibleAnywhere, Category = "Sunset") TObjectPtr<USkyAtmosphereComponent> Sky;
	UPROPERTY(VisibleAnywhere, Category = "Sunset") TObjectPtr<USkyLightComponent> SkyLight;
	UPROPERTY(VisibleAnywhere, Category = "Sunset") TObjectPtr<UExponentialHeightFogComponent> Fog;
	UPROPERTY(VisibleAnywhere, Category = "Sunset") TObjectPtr<UVolumetricCloudComponent> Clouds;
	UPROPERTY(VisibleAnywhere, Category = "Sunset") TObjectPtr<UPostProcessComponent> Post;

	float NightFactor = 0.f;
	float ElevationDeg = 10.f;
};
