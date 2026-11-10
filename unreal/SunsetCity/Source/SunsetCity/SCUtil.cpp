#include "SCUtil.h"
#include "ProceduralMeshComponent.h"
#include "GameFramework/Actor.h"
#include "SCMaterials.h"
#include "UObject/UnrealType.h"

bool SCU::SetNum(UObject* Obj, const TCHAR* Name, double Value)
{
	if (!Obj) return false;
	FProperty* P = Obj->GetClass()->FindPropertyByName(FName(Name));
	if (!P)
	{
		UE_LOG(LogSunset, Warning, TEXT("%s has no property called %s (this engine version names it differently); leaving it at its default."), *Obj->GetName(), Name);
		return false;
	}
	void* Addr = P->ContainerPtrToValuePtr<void>(Obj);
	if (FDoubleProperty* D = CastField<FDoubleProperty>(P)) { D->SetPropertyValue(Addr, Value); return true; }
	if (FFloatProperty* F = CastField<FFloatProperty>(P)) { F->SetPropertyValue(Addr, (float)Value); return true; }
	if (FIntProperty* I = CastField<FIntProperty>(P)) { I->SetPropertyValue(Addr, (int32)Value); return true; }
	if (FBoolProperty* B = CastField<FBoolProperty>(P)) { B->SetPropertyValue(Addr, Value != 0.0); return true; }
	if (FByteProperty* By = CastField<FByteProperty>(P)) { By->SetPropertyValue(Addr, (uint8)Value); return true; }
	if (FEnumProperty* E = CastField<FEnumProperty>(P)) { E->GetUnderlyingProperty()->SetIntPropertyValue(Addr, (int64)Value); return true; }
	UE_LOG(LogSunset, Warning, TEXT("%s.%s is not a number, so it was not set."), *Obj->GetName(), Name);
	return false;
}

UProceduralMeshComponent* SCU::MakeMesh(AActor* Owner, USceneComponent* Parent, const FVector& RelativeLocation, bool bCollision)
{
	UProceduralMeshComponent* C = NewObject<UProceduralMeshComponent>(Owner);
	C->bUseAsyncCooking = true;
	C->bUseComplexAsSimpleCollision = false;
	C->SetupAttachment(Parent ? Parent : Owner->GetRootComponent());
	if (bCollision)
	{
		C->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);
		C->SetCollisionProfileName(TEXT("BlockAll"));
	}
	else
	{
		C->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	}
	C->RegisterComponent();
	C->SetRelativeLocation(RelativeLocation);
	return C;
}

void SCU::FillMesh(UProceduralMeshComponent* Comp, const SC::Mesh& M, USCMaterials* Mats, bool bCollision)
{
	if (!Comp || M.Empty()) return;
	const uint64 Present = M.MaterialsPresent();
	int32 Section = 0;
	for (int32 Mat = 0; Mat < (int32)SC::MAT_COUNT; ++Mat)
	{
		if (!(Present & (uint64(1) << Mat))) continue;
		const SC::Mesh P = M.Part(Mat);
		const int32 N = (int32)P.P.size();
		TArray<FVector> Verts, Normals;
		TArray<FVector2D> UVs;
		TArray<FLinearColor> Cols;
		TArray<int32> Tris;
		TArray<FProcMeshTangent> Tangents;
		Verts.SetNumUninitialized(N); Normals.SetNumUninitialized(N); UVs.SetNumUninitialized(N); Cols.SetNumUninitialized(N);
		for (int32 i = 0; i < N; ++i)
		{
			const size_t k = (size_t)i;
			Verts[i] = FVector(P.P[k].x, P.P[k].y, P.P[k].z);
			Normals[i] = FVector(P.N[k].x, P.N[k].y, P.N[k].z);
			UVs[i] = FVector2D(P.UV[k].x, P.UV[k].y);
			Cols[i] = FLinearColor(P.C[k].r, P.C[k].g, P.C[k].b, 1.f);
		}
		Tris.SetNumUninitialized((int32)P.I.size());
		FMemory::Memcpy(Tris.GetData(), P.I.data(), P.I.size() * sizeof(int32));
		Comp->CreateMeshSection_LinearColor(Section, Verts, Tris, Normals, UVs, Cols, Tangents, bCollision);
		if (Mats) Comp->SetMaterial(Section, Mats->Get(Mat));
		++Section;
	}
}

void SCU::AddBoxCollision(UProceduralMeshComponent* Comp, const FVector& Centre, const FVector& Size, double YawRad)
{
	if (!Comp) return;
	const FVector H = Size * 0.5;
	const double C = FMath::Cos(YawRad), S = FMath::Sin(YawRad);
	TArray<FVector> Pts;
	for (int32 K = 0; K < 8; ++K)
	{
		const double X = (K & 1) ? H.X : -H.X, Y = (K & 2) ? H.Y : -H.Y, Z = (K & 4) ? H.Z : -H.Z;
		Pts.Add(Centre + FVector(X * C - Y * S, X * S + Y * C, Z));
	}
	Comp->AddCollisionConvexMesh(Pts);
}
