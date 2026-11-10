#include "SCWorld.h"
#include "Core/SCTerrain.h"
#include "Components/PointLightComponent.h"
#include "Engine/World.h"
#include "GameFramework/Pawn.h"
#include "HAL/PlatformTime.h"
#include "Kismet/GameplayStatics.h"
#include "ProceduralMeshComponent.h"
#include "SCDirector.h"
#include "SCEnvironment.h"
#include "SCMaterials.h"
#include "SCUtil.h"

ASCWorld::ASCWorld()
{
	PrimaryActorTick.bCanEverTick = true;
	USceneComponent* Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	SetRootComponent(Root);
}

bool ASCWorld::ValidKey(int32 I, int32 J)
{
	if (J < SC::kGridMin || J > SC::kGridMax) return false;
	return I == SC::kBeachChunk || (I >= SC::kGridMin && I <= SC::kGridMax);
}

UProceduralMeshComponent* ASCWorld::NewMesh(FChunk* C, const FVector& At, bool bCollision)
{
	UProceduralMeshComponent* M = SCU::MakeMesh(this, GetRootComponent(), At, bCollision);
	if (C) C->Comps.Add(M);
	return M;
}

void ASCWorld::BeginPlay()
{
	Super::BeginPlay();
	Mats = GetWorld()->GetSubsystem<USCMaterials>();
	for (int32 i = 0; i < StreetLights; ++i)
	{
		UPointLightComponent* L = NewObject<UPointLightComponent>(this);
		L->SetupAttachment(GetRootComponent());
		L->RegisterComponent();
		L->SetIntensityUnits(ELightUnits::Lumens);
		L->SetIntensity(5200.f);
		L->SetAttenuationRadius(1500.f);
		L->SetSourceRadius(12.f);
		L->SetLightColor(FLinearColor(1.f, 0.82f, 0.58f));
		L->SetCastShadows(false);
		L->SetVisibility(false);
		LampPool.Add(L);
	}
	BuildGlobal();
	BuildNow(SCU::V(SC::SpawnPoint()), 1);
}

void ASCWorld::BuildGlobal()
{
	// The sea, the sand that slopes down under it, the land beyond the last blocks (with a solid floor) and the hills; they never change, so they are made once.
	{
		UProceduralMeshComponent* Sea = NewMesh(nullptr, FVector::ZeroVector, false);
		SCU::FillMesh(Sea, SC::BuildSea(), Mats, false);
	}
	{
		SC::Mesh Sand = SC::BuildSand(-260000.0, 260000.0);
		Sand.SetMat(SC::MAT_SAND);
		UProceduralMeshComponent* M = NewMesh(nullptr, FVector::ZeroVector, true);
		M->bUseComplexAsSimpleCollision = true;
		SCU::FillMesh(M, Sand, Mats, true);
		// An invisible wall where the water is deepest, and a floor under everything else.
		SCU::AddBoxCollision(M, FVector(SC::kSeaWallX - 100.0, 0.0, 1000.0), FVector(200.0, 540000.0, 6000.0), 0.0);
	}
	{
		SC::Mesh Land;
		Land.Face({-84500.0, -260000.0, -30.0}, {344500.0, 0.0, 0.0}, {0.0, 520000.0, 0.0}, SC::Hex(0x7A8A55), 1000.0);      // faces up (Cross of its two edges is +Z)
		Land.SetMat(SC::MAT_LAWN);
		UProceduralMeshComponent* M = NewMesh(nullptr, FVector::ZeroVector, true);
		SCU::FillMesh(M, Land, Mats, false);
		SCU::AddBoxCollision(M, FVector(87750.0, 0.0, -130.0), FVector(344500.0, 520000.0, 200.0), 0.0);
	}
	{
		SC::Mesh Hills = SC::BuildHills();
		Hills.SetMat(SC::MAT_LAWN);
		UProceduralMeshComponent* M = NewMesh(nullptr, FVector::ZeroVector, false);
		SCU::FillMesh(M, Hills, Mats, false);
	}
}

void ASCWorld::BuildGround(FChunk& C)
{
	const SC::V3 Shift{-C.Centre.X, -C.Centre.Y, 0.0};
	const bool bBeach = C.Plan.i == SC::kBeachChunk;
	SC::Mesh G = bBeach ? SC::BuildPromenade(C.Plan) : SC::BuildBlockGround(C.Plan);
	G.Translate(Shift);
	UProceduralMeshComponent* M = NewMesh(&C, C.Centre, true);
	SCU::FillMesh(M, G, Mats, false);
	if (bBeach)
	{
		const double Mid = (SC::kSandX + SC::kPromenadeX) * 0.5 - C.Centre.X, Wd = SC::kPromenadeX - SC::kSandX;
		SCU::AddBoxCollision(M, FVector(Mid, 0.0, (SC::kCurbH - 40.0) * 0.5), FVector(Wd, SC::kPitch, SC::kCurbH + 40.0), 0.0);
		const double RoadMid = (SC::kPromenadeX + C.Centre.X + SC::kPitch * 0.5) * 0.5 - C.Centre.X, RoadW = (C.Centre.X + SC::kPitch * 0.5) - SC::kPromenadeX;
		SCU::AddBoxCollision(M, FVector(RoadMid, 0.0, -20.0), FVector(RoadW, SC::kPitch, 40.0), 0.0);
	}
	else
	{
		SCU::AddBoxCollision(M, FVector(0.0, 0.0, -20.0), FVector(SC::kPitch, SC::kPitch, 40.0), 0.0);
		SCU::AddBoxCollision(M, FVector(0.0, 0.0, (SC::kCurbH - 40.0) * 0.5), FVector(C.Plan.half * 2.0, C.Plan.half * 2.0, SC::kCurbH + 40.0), 0.0);
		if (C.Plan.lawn)
		{
			const double In = (C.Plan.half - SC::kWalkW) * 2.0;
			SCU::AddBoxCollision(M, FVector(0.0, 0.0, (SC::kCurbH + 6.0 - 40.0) * 0.5), FVector(In, In, SC::kCurbH + 46.0), 0.0);
		}
	}
}

void ASCWorld::BuildBuilding(FChunk& C, int32 Index)
{
	const SC::BuildingSpec& B = C.Plan.buildings[(size_t)Index];
	const SC::V3 Shift{-C.Centre.X, -C.Centre.Y, 0.0};
	const FVector Mid((B.mn.x + B.mx.x) * 0.5 - C.Centre.X, (B.mn.y + B.mx.y) * 0.5 - C.Centre.Y, (B.mn.z + B.mx.z) * 0.5);
	if (B.style == SC::Style::Venue)
	{
		SC::VenueBuild VB = SC::BuildVenue(B);
		SC::Mesh Local = VB.mesh;
		Local.Translate(Shift);
		UProceduralMeshComponent* M = NewMesh(&C, C.Centre, true);
		SCU::FillMesh(M, Local, Mats, false);
		for (const auto& Box : VB.solids)
		{
			const FVector Lo = SCU::V(Box.first), Hi = SCU::V(Box.second);
			FVector Centre = (Lo + Hi) * 0.5;
			Centre.X -= C.Centre.X;
			Centre.Y -= C.Centre.Y;
			SCU::AddBoxCollision(M, Centre, Hi - Lo, 0.0);
		}
		// Real lights in the room (Lumen lights the room from them).
		for (const SC::V3& L : VB.lights)
		{
			UPointLightComponent* P = NewObject<UPointLightComponent>(this);
			P->SetupAttachment(GetRootComponent());
			P->RegisterComponent();
			P->SetWorldLocation(SCU::V(L));
			P->SetIntensityUnits(ELightUnits::Lumens);
			P->SetIntensity(B.venue == SC::VenueKind::Jeweller ? 700.f : 1100.f);
			P->SetAttenuationRadius(900.f);
			P->SetSourceRadius(25.f);
			P->SetLightColor(B.venue == SC::VenueKind::Jeweller ? FLinearColor(1.f, 0.86f, 0.66f) : FLinearColor(1.f, 0.96f, 0.88f));
			P->SetCastShadows(true);
			C.Comps.Add(P);
		}
		if (ASCDirector* D = ASCDirector::Get(this)) { D->RegisterVenue(C.Key, B.venue, VB); C.bHasVenue = true; }
		return;
	}
	SC::Mesh Local = SC::BuildBuilding(B);
	Local.Translate(Shift);
	UProceduralMeshComponent* M = NewMesh(&C, C.Centre, true);
	SCU::FillMesh(M, Local, Mats, false);
	SCU::AddBoxCollision(M, Mid, FVector(B.mx.x - B.mn.x, B.mx.y - B.mn.y, B.mx.z - B.mn.z), 0.0);
}

void ASCWorld::BuildProps(FChunk& C)
{
	const SC::V3 Shift{-C.Centre.X, -C.Centre.Y, 0.0};
	SC::Mesh All;
	std::vector<SC::SolidBox> Solids;
	for (const SC::PropSpec& P : C.Plan.props)
	{
		All.Append(SC::BuildProp(P));
		SC::SolidBox Box;
		if (SC::PropSolidBox(P, Box)) Solids.push_back(Box);
		if (P.kind == SC::PropKind::Lamp)
		{
			const SC::V3 H = SC::RotateZ(SC::LampHeadOffset(), P.yaw) * P.scale;
			C.Lamps.Add(FVector(P.pos.x + H.x, P.pos.y + H.y, H.z));
		}
	}
	for (const SC::PoolSpec& Pool : C.Plan.pools)
	{
		All.Append(SC::BuildPool(Pool));
		const double T = 40.0;
		const SC::V3 a = Pool.mn, b = Pool.mx;
		Solids.push_back({{(a.x + b.x) / 2, a.y + T / 2, Pool.rim / 2}, {b.x - a.x, T, Pool.rim}, 0.0});
		Solids.push_back({{(a.x + b.x) / 2, b.y - T / 2, Pool.rim / 2}, {b.x - a.x, T, Pool.rim}, 0.0});
		Solids.push_back({{a.x + T / 2, (a.y + b.y) / 2, Pool.rim / 2}, {T, b.y - a.y - 2 * T, Pool.rim}, 0.0});
		Solids.push_back({{b.x - T / 2, (a.y + b.y) / 2, Pool.rim / 2}, {T, b.y - a.y - 2 * T, Pool.rim}, 0.0});
	}
	if (All.Empty()) return;
	All.Translate(Shift);
	UProceduralMeshComponent* M = NewMesh(&C, C.Centre, true);
	SCU::FillMesh(M, All, Mats, false);
	for (const SC::SolidBox& S : Solids) SCU::AddBoxCollision(M, FVector(S.c.x - C.Centre.X, S.c.y - C.Centre.Y, S.c.z), SCU::V(S.size), S.yaw);
}

bool ASCWorld::Step(FChunk& C)
{
	const int32 NB = (int32)C.Plan.buildings.size();
	if (C.Stage == 0) BuildGround(C);
	else if (C.Stage <= NB) BuildBuilding(C, C.Stage - 1);
	else if (C.Stage == NB + 1) BuildProps(C);
	else { C.bDone = true; return true; }
	++C.Stage;
	return false;
}

void ASCWorld::Request(int32 I, int32 J)
{
	const FIntPoint Key(I, J);
	if (!ValidKey(I, J) || Chunks.Contains(Key)) return;
	TSharedPtr<FChunk> C = MakeShared<FChunk>();
	C->Key = Key;
	C->Plan = (I == SC::kBeachChunk) ? SC::MakeBeach(J, (uint32)CitySeed) : SC::MakeBlock(I, J, (uint32)CitySeed);
	C->Centre = SCU::V(C->Plan.center);
	Chunks.Add(Key, C);
}

void ASCWorld::Unload(const FIntPoint& Key)
{
	if (TSharedPtr<FChunk>* Found = Chunks.Find(Key))
	{
		for (const TWeakObjectPtr<UActorComponent>& W : (*Found)->Comps) if (W.IsValid()) W->DestroyComponent();
		if ((*Found)->bHasVenue) if (ASCDirector* D = ASCDirector::Get(this)) D->UnregisterVenue(Key);
		Chunks.Remove(Key);
	}
}

void ASCWorld::BuildNow(const FVector& Where, int32 Radius)
{
	const int32 CI = FMath::RoundToInt(Where.X / SC::kPitch), CJ = FMath::RoundToInt(Where.Y / SC::kPitch);
	for (int32 I = CI - Radius; I <= CI + Radius; ++I) for (int32 J = CJ - Radius; J <= CJ + Radius; ++J) Request(I, J);
	for (TPair<FIntPoint, TSharedPtr<FChunk>>& P : Chunks) while (!P.Value->bDone) Step(*P.Value);
}

void ASCWorld::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	APawn* Pawn = UGameplayStatics::GetPlayerPawn(this, 0);
	if (!Pawn) return;
	const FVector Where = Pawn->GetActorLocation();
	const int32 CI = FMath::RoundToInt(Where.X / SC::kPitch), CJ = FMath::RoundToInt(Where.Y / SC::kPitch);
	if (FIntPoint(CI, CJ) != LastKey)
	{
		LastKey = FIntPoint(CI, CJ);
		for (int32 I = CI - LoadRadius; I <= CI + LoadRadius; ++I) for (int32 J = CJ - LoadRadius; J <= CJ + LoadRadius; ++J) Request(I, J);
		TArray<FIntPoint> Drop;
		for (const TPair<FIntPoint, TSharedPtr<FChunk>>& P : Chunks) if (FMath::Abs(P.Key.X - CI) > KeepRadius || FMath::Abs(P.Key.Y - CJ) > KeepRadius) Drop.Add(P.Key);
		for (const FIntPoint& K : Drop) Unload(K);
	}
	// Build what is missing, nearest first, for a few milliseconds a frame.
	const double Start = FPlatformTime::Seconds();
	do
	{
		FChunk* Best = nullptr;
		int32 BestD = MAX_int32;
		for (const TPair<FIntPoint, TSharedPtr<FChunk>>& P : Chunks)
		{
			if (P.Value->bDone) continue;
			const int32 D = FMath::Abs(P.Key.X - CI) + FMath::Abs(P.Key.Y - CJ);
			if (D < BestD) { BestD = D; Best = P.Value.Get(); }
		}
		if (!Best) break;
		Step(*Best);
	} while ((FPlatformTime::Seconds() - Start) * 1000.0 < FrameBudgetMs);

	LampTimer -= DeltaSeconds;
	if (LampTimer <= 0.f) { LampTimer = 0.5f; UpdateLamps(); }
}

void ASCWorld::UpdateLamps()
{
	ASCDirector* D = ASCDirector::Get(this);
	const bool bNight = D && D->NightAmount() > 0.2f;
	APawn* Pawn = UGameplayStatics::GetPlayerPawn(this, 0);
	if (!bNight || !Pawn)
	{
		for (UPointLightComponent* L : LampPool) if (L) L->SetVisibility(false);
		return;
	}
	const FVector Where = Pawn->GetActorLocation();
	TArray<FVector> Near;
	for (const TPair<FIntPoint, TSharedPtr<FChunk>>& P : Chunks) for (const FVector& L : P.Value->Lamps) if (FVector::DistSquared(L, Where) < FMath::Square(30000.0)) Near.Add(L);
	Near.Sort([&Where](const FVector& A, const FVector& B) { return FVector::DistSquared(A, Where) < FVector::DistSquared(B, Where); });
	for (int32 i = 0; i < LampPool.Num(); ++i)
	{
		UPointLightComponent* L = LampPool[i];
		if (!L) continue;
		if (i < Near.Num()) { L->SetWorldLocation(Near[i] - FVector(0.f, 0.f, 10.f)); L->SetVisibility(true); }
		else L->SetVisibility(false);
	}
}

bool ASCWorld::RandomLoopPoint(const FVector& Near, float MinDist, float MaxDist, FRandomStream& Rng, FVector& OutPos, SC::WalkLoop& OutLoop, float& OutS) const
{
	TArray<const FChunk*> Cands;
	for (const TPair<FIntPoint, TSharedPtr<FChunk>>& P : Chunks) if (P.Value->Stage >= 1 && P.Value->Plan.loop.length > 0.0) Cands.Add(P.Value.Get());
	if (Cands.Num() == 0) return false;
	for (int32 Try = 0; Try < 16; ++Try)
	{
		const FChunk* C = Cands[Rng.RandRange(0, Cands.Num() - 1)];
		const float S = Rng.FRandRange(0.f, (float)C->Plan.loop.length);
		const SC::V2 P = C->Plan.loop.At(S);
		const FVector Pos(P.x, P.y, SC::kCurbH);
		const float D = FVector::Dist2D(Pos, Near);
		if (D >= MinDist && D <= MaxDist) { OutPos = Pos; OutLoop = C->Plan.loop; OutS = S; return true; }
	}
	return false;
}
