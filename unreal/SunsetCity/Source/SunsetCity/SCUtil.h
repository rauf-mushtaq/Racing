// Sunset City (Unreal Engine 5): the small things every other file uses: conversions between the engine-independent Core/ types and Unreal's, turning a Core mesh into the sections
// of a procedural mesh component (one section per material), solid boxes for collision, and a way to set a property on an engine object by its name.
#pragma once

#include "CoreMinimal.h"
#include "Core/SCMath.h"
#include "Core/SCMesh.h"

DECLARE_LOG_CATEGORY_EXTERN(LogSunset, Log, All);

class AActor;
class UObject;
class USceneComponent;
class UProceduralMeshComponent;
class USCMaterials;

namespace SCU
{
	FORCEINLINE FVector V(const SC::V3& A) { return FVector(A.x, A.y, A.z); }
	FORCEINLINE SC::V3 V(const FVector& A) { return SC::V3{A.X, A.Y, A.Z}; }
	FORCEINLINE FLinearColor LC(const SC::Col& C) { return FLinearColor(C.r, C.g, C.b, C.a); }

	/** Set a number (or a true/false, or an enum) property of any object by its name. A compile-safe way to reach engine settings whose names move between versions: if the
	 *  property is not there it logs a warning and returns false instead of failing to build. */
	bool SetNum(UObject* Obj, const TCHAR* Name, double Value);

	/** A procedural mesh component attached to Parent (or the owner's root) at a place relative to it, ready to be filled. */
	UProceduralMeshComponent* MakeMesh(AActor* Owner, USceneComponent* Parent, const FVector& RelativeLocation, bool bCollision = false);

	/** Fill a component from a Core mesh: one section for each material in it (the alpha of the vertex colours says which), with the material from Mats if given. */
	void FillMesh(UProceduralMeshComponent* Comp, const SC::Mesh& M, USCMaterials* Mats, bool bCollision = false);

	/** Add a solid box (turned about the vertical axis) to a component's collision. */
	void AddBoxCollision(UProceduralMeshComponent* Comp, const FVector& Centre, const FVector& Size, double YawRad);
}
