// Sunset City (Unreal Engine 5): touch controls, for an iPad or phone that plays the game through Pixel Streaming (see unreal/README.md) or any touch screen: a stick on the left to walk
// or to steer, drag anywhere else to look round, and buttons on the right (punch or fire, jump, use, kick, pistol; in a car: gas, handbrake, exit, brake, flip). The character and the car
// read it, the HUD draws it. Nothing here needs setting up in the editor: it polls the fingers each frame.
#pragma once

#include "CoreMinimal.h"

class APlayerController;

struct FSCTouchControls
{
	enum EButton : int32 { BtnAttack = 0, BtnJump, BtnUse, BtnKick, BtnGun, BtnCount };

	bool bActive = false;                                   // a finger has touched the screen: show the on-screen controls
	bool bInCar = false;                                    // (set by whoever is being steered, for the labels)
	FVector2D Move = FVector2D::ZeroVector;                 // the stick: x to the right, y forwards, each -1 .. 1
	FVector2D Look = FVector2D::ZeroVector;                 // how far a finger dragged this frame (pixels)
	bool bHeld[BtnCount] = {false, false, false, false, false};
	bool bPressed[BtnCount] = {false, false, false, false, false};           // went down this frame
	bool bStick = false;                                    // the stick is being used
	FVector2D StickBase = FVector2D::ZeroVector, StickKnob = FVector2D::ZeroVector;
	int32 ViewW = 1920, ViewH = 1080;

	/** Read the fingers (once a frame, whoever asks first). */
	void Update(APlayerController* PC);
	FVector2D ButtonCentre(int32 Button) const;
	float ButtonRadius() const { return 0.062f * (float)ViewH; }
	float StickRadius() const { return 0.10f * (float)ViewH; }

private:
	struct FFinger
	{
		bool bDown = false;
		int32 Role = 0;                                     // 1 stick, 2 look, 3 a button
		int32 Button = -1;
		FVector2D Last = FVector2D::ZeroVector;
	};
	FFinger Fingers[5];
	uint64 LastFrame = ~uint64(0);
};
