#include "SCEnvironment.h"
#include "Components/DirectionalLightComponent.h"
#include "Components/ExponentialHeightFogComponent.h"
#include "Components/PostProcessComponent.h"
#include "Components/SkyAtmosphereComponent.h"
#include "Components/SkyLightComponent.h"
#include "Components/VolumetricCloudComponent.h"
#include "Engine/World.h"
#include "Materials/MaterialInterface.h"
#include "SCMaterials.h"
#include "SCUtil.h"

ASCEnvironment::ASCEnvironment()
{
	PrimaryActorTick.bCanEverTick = true;
	Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	SetRootComponent(Root);
	Sun = CreateDefaultSubobject<UDirectionalLightComponent>(TEXT("Sun"));
	Sun->SetupAttachment(Root);
	Moon = CreateDefaultSubobject<UDirectionalLightComponent>(TEXT("Moon"));
	Moon->SetupAttachment(Root);
	Sky = CreateDefaultSubobject<USkyAtmosphereComponent>(TEXT("Sky"));
	Sky->SetupAttachment(Root);
	SkyLight = CreateDefaultSubobject<USkyLightComponent>(TEXT("SkyLight"));
	SkyLight->SetupAttachment(Root);
	Fog = CreateDefaultSubobject<UExponentialHeightFogComponent>(TEXT("Fog"));
	Fog->SetupAttachment(Root);
	Clouds = CreateDefaultSubobject<UVolumetricCloudComponent>(TEXT("Clouds"));
	Clouds->SetupAttachment(Root);
	Post = CreateDefaultSubobject<UPostProcessComponent>(TEXT("Post"));
	Post->SetupAttachment(Root);
}

void ASCEnvironment::BeginPlay()
{
	Super::BeginPlay();

	// The sun and the moon are the two lights the sky atmosphere is lit by (by name, so a version of the engine that calls them something else only loses the sky's lighting, not the build).
	SCU::SetNum(Sun, TEXT("bUsedAsAtmosphereSunLight"), 1);
	SCU::SetNum(Sun, TEXT("AtmosphereSunLightIndex"), 0);
	SCU::SetNum(Moon, TEXT("bUsedAsAtmosphereSunLight"), 1);
	SCU::SetNum(Moon, TEXT("AtmosphereSunLightIndex"), 1);
	SCU::SetNum(Sun, TEXT("LightSourceAngle"), 0.5357);
	SCU::SetNum(Moon, TEXT("LightSourceAngle"), 0.5);
	Sun->SetCastShadows(true);
	Moon->SetCastShadows(true);
	Moon->SetLightColor(FLinearColor(0.62f, 0.72f, 1.0f));
	SCU::SetNum(SkyLight, TEXT("bRealTimeCapture"), 1);

	Fog->SetFogDensity(0.010f);
	Fog->SetFogHeightFalloff(0.35f);
	Fog->SetVolumetricFog(true);
	SCU::SetNum(Fog, TEXT("VolumetricFogScatteringDistribution"), 0.35);
	SCU::SetNum(Fog, TEXT("VolumetricFogExtinctionScale"), 1.0);

	if (UMaterialInterface* CloudMat = LoadObject<UMaterialInterface>(nullptr, TEXT("/Engine/EngineSky/VolumetricClouds/m_SimpleVolumetricCloud_Inst.m_SimpleVolumetricCloud_Inst"), nullptr, LOAD_Quiet | LOAD_NoWarn))
	{
		Clouds->SetMaterial(CloudMat);
	}

	// How the picture looks: filmic exposure that adapts between sun and shade, a little bloom and fringing, gentle colour, motion blur, Lumen for the light that bounces and for reflections.
	FPostProcessSettings& S = Post->Settings;
	Post->bUnbound = true;
	S.bOverride_AutoExposureBias = true;            S.AutoExposureBias = 0.4f;
	S.bOverride_AutoExposureMinBrightness = true;   S.AutoExposureMinBrightness = 0.05f;
	S.bOverride_AutoExposureMaxBrightness = true;   S.AutoExposureMaxBrightness = 8.0f;
	S.bOverride_BloomIntensity = true;              S.BloomIntensity = 0.55f;
	S.bOverride_SceneFringeIntensity = true;        S.SceneFringeIntensity = 0.15f;
	S.bOverride_VignetteIntensity = true;           S.VignetteIntensity = 0.35f;
	S.bOverride_FilmGrainIntensity = true;          S.FilmGrainIntensity = 0.04f;
	S.bOverride_MotionBlurAmount = true;            S.MotionBlurAmount = 0.35f;
	S.bOverride_ColorSaturation = true;             S.ColorSaturation = FVector4(1.06, 1.06, 1.06, 1.0);
	S.bOverride_ColorContrast = true;               S.ColorContrast = FVector4(1.04, 1.04, 1.04, 1.0);
	S.bOverride_DynamicGlobalIlluminationMethod = true; S.DynamicGlobalIlluminationMethod = EDynamicGlobalIlluminationMethod::Lumen;
	S.bOverride_ReflectionMethod = true;            S.ReflectionMethod = EReflectionMethod::Lumen;

	Apply();
}

void ASCEnvironment::SetTime(float Hour)
{
	TimeOfDay = FMath::Fmod(Hour + 24.f, 24.f);
	Apply();
}

void ASCEnvironment::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	if (DayLengthMinutes > 0.f) TimeOfDay = FMath::Fmod(TimeOfDay + DeltaSeconds * 24.f / (DayLengthMinutes * 60.f), 24.f);
	Apply();
}

void ASCEnvironment::Apply()
{
	// The sun rises in the east (+X), is highest in the south (+Y) at noon, and sets over the sea in the west (-X).
	const float Ang = (TimeOfDay - 6.f) / 12.f * PI;
	ElevationDeg = 72.f * FMath::Sin(Ang);
	const float El = FMath::DegreesToRadians(ElevationDeg);
	const FVector ToSun(FMath::Cos(El) * FMath::Cos(Ang), FMath::Cos(El) * FMath::Sin(Ang), FMath::Sin(El));
	Sun->SetWorldRotation((-ToSun).Rotation());
	Moon->SetWorldRotation(ToSun.Rotation());
	const float Day = FMath::SmoothStep(-4.f, 6.f, ElevationDeg);
	Sun->SetIntensity(10.f * Day);
	Moon->SetIntensity(0.35f * (1.f - Day));
	NightFactor = 1.f - FMath::SmoothStep(-8.f, 3.f, ElevationDeg);
	SkyLight->SetIntensity(FMath::Lerp(0.35f, 1.f, Day));

	if (UWorld* W = GetWorld())
	{
		if (USCMaterials* M = W->GetSubsystem<USCMaterials>()) M->SetNight(NightFactor);
	}
}
