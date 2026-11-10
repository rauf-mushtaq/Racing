#include "SCTouch.h"
#include "GameFramework/PlayerController.h"

namespace
{
	// Unreal 5 versions differ on whether the touch state is reported in floats or doubles: try the one and then the other.
	template <typename T>
	auto TryTouch(const APlayerController* PC, ETouchIndex::Type Finger, T& X, T& Y, bool& bDown, int) -> decltype(PC->GetInputTouchState(Finger, X, Y, bDown), bool())
	{
		PC->GetInputTouchState(Finger, X, Y, bDown);
		return true;
	}
	template <typename T>
	bool TryTouch(const APlayerController*, ETouchIndex::Type, T&, T&, bool&, long) { return false; }

	void ReadTouch(const APlayerController* PC, int32 Finger, FVector2D& P, bool& bDown)
	{
		double DX = 0.0, DY = 0.0;
		if (TryTouch<double>(PC, (ETouchIndex::Type)Finger, DX, DY, bDown, 0)) { P = FVector2D(DX, DY); return; }
		float FX = 0.f, FY = 0.f;
		if (TryTouch<float>(PC, (ETouchIndex::Type)Finger, FX, FY, bDown, 0)) P = FVector2D(FX, FY);
	}
}

FVector2D FSCTouchControls::ButtonCentre(int32 Button) const
{
	const float W = (float)ViewW, H = (float)ViewH;
	switch (Button)
	{
	case BtnAttack: return FVector2D(W - 0.15f * H, H - 0.22f * H);
	case BtnJump:   return FVector2D(W - 0.30f * H, H - 0.12f * H);
	case BtnUse:    return FVector2D(W - 0.30f * H, H - 0.32f * H);
	case BtnKick:   return FVector2D(W - 0.15f * H, H - 0.42f * H);
	default:        return FVector2D(W - 0.45f * H, H - 0.22f * H);
	}
}

void FSCTouchControls::Update(APlayerController* PC)
{
	if (!PC || LastFrame == GFrameCounter) return;
	LastFrame = GFrameCounter;
	PC->GetViewportSize(ViewW, ViewH);
	Look = FVector2D::ZeroVector;
	for (int32 B = 0; B < BtnCount; ++B) bPressed[B] = false;
	bool bHeldNow[BtnCount] = {false, false, false, false, false};
	bool bAnyStick = false;
	FVector2D MoveNow = FVector2D::ZeroVector;
	for (int32 K = 0; K < 5; ++K)
	{
		FVector2D P = FVector2D::ZeroVector;
		bool bDown = false;
		ReadTouch(PC, K, P, bDown);
		FFinger& F = Fingers[K];
		if (bDown && !F.bDown)                                          // a new finger: what did it land on?
		{
			bActive = true;
			F.bDown = true;
			F.Last = P;
			F.Role = 0;
			F.Button = -1;
			for (int32 B = 0; B < BtnCount && F.Role == 0; ++B)
			{
				if (FVector2D::Distance(P, ButtonCentre(B)) <= ButtonRadius() * 1.25f) { F.Role = 3; F.Button = B; bPressed[B] = true; }
			}
			if (F.Role == 0) F.Role = (P.X < 0.4 * (double)ViewW) ? 1 : 2;
			if (F.Role == 1) StickBase = P;
		}
		else if (!bDown && F.bDown)
		{
			F.bDown = false;
			F.Role = 0;
			F.Button = -1;
		}
		if (!F.bDown) continue;
		if (F.Role == 1)
		{
			bAnyStick = true;
			FVector2D D = P - StickBase;
			const double R = (double)StickRadius();
			if (D.Size() > R) D = D.GetSafeNormal() * R;
			StickKnob = StickBase + D;
			MoveNow = FVector2D(D.X / R, -D.Y / R);
		}
		else if (F.Role == 2) Look += P - F.Last;
		else if (F.Role == 3 && F.Button >= 0) bHeldNow[F.Button] = true;
		F.Last = P;
	}
	bStick = bAnyStick;
	Move = MoveNow;
	for (int32 B = 0; B < BtnCount; ++B) bHeld[B] = bHeldNow[B];
}
