#include "SCHUD.h"
#include "Engine/Canvas.h"
#include "GameFramework/Pawn.h"
#include "SCCharacter.h"
#include "SCDirector.h"
#include "SCEnvironment.h"
#include "SCVehicle.h"

void ASCHUD::DrawHUD()
{
	Super::DrawHUD();
	if (!Canvas) return;
	ASCDirector* D = ASCDirector::Get(this);
	if (!D || !D->Player) return;
	const float W = (float)Canvas->SizeX, H = (float)Canvas->SizeY;
	ASCCharacter* P = D->Player;

	// Health.
	const float Frac = FMath::Clamp(P->Health / FMath::Max(1.f, P->MaxHealth), 0.f, 1.f);
	DrawRect(FLinearColor(0.f, 0.f, 0.f, 0.55f), 28.f, H - 58.f, 272.f, 30.f);
	DrawRect(FLinearColor(0.85f - 0.55f * Frac, 0.25f + 0.6f * Frac, 0.22f, 0.95f), 32.f, H - 54.f, 264.f * Frac, 22.f);
	DrawText(TEXT("HEALTH"), FLinearColor::White, 34.f, H - 82.f, nullptr, 1.2f, false);

	// Money and the clock.
	DrawText(FString::Printf(TEXT("$%d"), D->Money), FLinearColor(0.55f, 1.f, 0.6f), W - 230.f, 28.f, nullptr, 2.4f, false);
	if (D->Env)
	{
		const int32 Hour = (int32)D->Env->TimeOfDay, Min = (int32)((D->Env->TimeOfDay - Hour) * 60.f);
		DrawText(FString::Printf(TEXT("%02d:%02d"), Hour, Min), FLinearColor(1.f, 1.f, 1.f, 0.85f), W - 230.f, 74.f, nullptr, 1.6f, false);
	}

	// The stars.
	const int32 Stars = D->Wanted.Stars();
	if (Stars > 0)
	{
		FString S;
		for (int32 i = 0; i < 5; ++i) S += (i < Stars) ? TEXT("* ") : TEXT("- ");
		const bool bFlash = D->Wanted.seen && FMath::Fmod((float)D->GetWorld()->GetTimeSeconds(), 0.6f) < 0.3f;
		DrawText(TEXT("WANTED"), FLinearColor(1.f, 0.5f, 0.5f), W - 230.f, 112.f, nullptr, 1.2f, false);
		DrawText(S, bFlash ? FLinearColor(0.4f, 0.55f, 1.f) : FLinearColor(1.f, 0.82f, 0.2f), W - 230.f, 132.f, nullptr, 2.6f, false);
	}

	// What E does; the crosshair; the speed.
	if (!D->Prompt.IsEmpty()) DrawText(D->Prompt, FLinearColor::White, W * 0.5f - 90.f, H * 0.72f, nullptr, 1.7f, false);
	if (P->IsAiming()) { DrawRect(FLinearColor::White, W * 0.5f - 1.f, H * 0.5f - 9.f, 2.f, 18.f); DrawRect(FLinearColor::White, W * 0.5f - 9.f, H * 0.5f - 1.f, 18.f, 2.f); }
	if (P->IsDown()) DrawText(P->Health <= 0.f ? TEXT("WASTED") : TEXT("knocked down"), FLinearColor(1.f, 0.3f, 0.3f), W * 0.5f - 90.f, H * 0.4f, nullptr, 3.f, false);
	if (ASCVehicle* V = Cast<ASCVehicle>(GetOwningPawn())) DrawText(FString::Printf(TEXT("%d km/h"), (int32)V->SpeedKmh()), FLinearColor::White, W - 260.f, H - 90.f, nullptr, 2.4f, false);
	else DrawText(TEXT("WASD move   Shift run   Space jump   LMB punch   F kick   Q pistol   E use"), FLinearColor(1.f, 1.f, 1.f, 0.55f), 28.f, 24.f, nullptr, 1.1f, false);
}
