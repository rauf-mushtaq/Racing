#include "SCDirector.h"
#include "Engine/World.h"
#include "GameFramework/GameModeBase.h"
#include "SCCharacter.h"
#include "SCEnvironment.h"
#include "SCGameMode.h"
#include "SCNpc.h"
#include "SCUtil.h"
#include "SCVehicle.h"
#include "SCWorld.h"

ASCDirector::ASCDirector()
{
	PrimaryActorTick.bCanEverTick = true;
}

ASCDirector* ASCDirector::Get(const UObject* Ctx)
{
	if (!Ctx) return nullptr;
	const UWorld* W = Ctx->GetWorld();
	ASCGameMode* GM = W ? W->GetAuthGameMode<ASCGameMode>() : nullptr;
	return GM ? GM->Director.Get() : nullptr;
}

void ASCDirector::BeginPlay()
{
	Super::BeginPlay();
	Rng.Initialize(Seed);
}

float ASCDirector::NightAmount() const
{
	return Env ? Env->Night() : 0.f;
}

void ASCDirector::Commit(SC::Crime C, float Amount)
{
	Wanted.Commit(C, Amount);
}

ASCVehicle* ASCDirector::NearestVehicle(const FVector& P, float MaxDist) const
{
	ASCVehicle* Best = nullptr;
	float BestD = MaxDist;
	for (const TWeakObjectPtr<ASCVehicle>& V : Vehicles)
	{
		if (!V.IsValid() || V->bAI) continue;
		const float D = FVector::Dist2D(V->GetActorLocation(), P);
		if (D < BestD) { BestD = D; Best = V.Get(); }
	}
	return Best;
}

ASCNpc* ASCDirector::NearestLoot(const FVector& P, float MaxDist) const
{
	ASCNpc* Best = nullptr;
	float BestD = MaxDist;
	for (const TWeakObjectPtr<ASCNpc>& N : Npcs)
	{
		if (!N.IsValid() || !N->HasWallet()) continue;
		const float D = FVector::Dist2D(N->GetActorLocation(), P);
		if (D < BestD) { BestD = D; Best = N.Get(); }
	}
	return Best;
}

bool ASCDirector::TryRob(ASCCharacter* Who)
{
	if (!Who) return false;
	for (TPair<FIntPoint, FVenue>& Pair : Venues)
	{
		FVenue& V = Pair.Value;
		if (V.Cooldown > 0.f || FVector::Dist(V.Till, Who->GetActorLocation()) > 330.f) continue;
		// Somebody has to be there to hand it over.
		ASCNpc* Clerk = nullptr;
		for (const TWeakObjectPtr<ASCNpc>& S : V.Staff) if (S.IsValid() && S->Kind == SC::Archetype::Civilian && !S->IsDead() && !S->IsKo()) { Clerk = S.Get(); break; }
		if (!Clerk) continue;
		static const int32 Loot[5] = {450, 700, 2600, 5200, 9000};      // petrol station, shop, jeweller, bank, museum
		const int32 K = FMath::Clamp((int32)V.Kind, 0, 4);
		Money += Loot[K] / 2 + (int32)Rng.FRandRange(0.f, (float)Loot[K] / 2.f);
		V.Cooldown = 240.f;
		Clerk->RaiseHands(20.f);
		Commit(SC::Crime::Robbery, 1.f);
		for (const TWeakObjectPtr<ASCNpc>& S : V.Staff) if (S.IsValid() && S.Get() != Clerk && S->Kind != SC::Archetype::Civilian) S->Provoke();   // the guards
		return true;
	}
	return false;
}

void ASCDirector::DismissPolice()
{
	for (const TWeakObjectPtr<ASCNpc>& N : Npcs) if (N.IsValid() && N->IsCop()) N->Dismiss();
	for (const TWeakObjectPtr<ASCVehicle>& V : Vehicles) if (V.IsValid() && V->IsCruiser()) V->bAI = false;
}

void ASCDirector::RegisterVenue(const FIntPoint& Key, SC::VenueKind Kind, const SC::VenueBuild& Build)
{
	UnregisterVenue(Key);
	FVenue V;
	V.Kind = Kind;
	V.Till = SCU::V(Build.tillPos);
	UWorld* W = GetWorld();
	if (!W) return;
	uint32 K = 1;
	for (const SC::VenueSpot& Sp : Build.spots)
	{
		FActorSpawnParameters P;
		P.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
		ASCNpc* N = W->SpawnActor<ASCNpc>(ASCNpc::StaticClass(), SCU::V(Sp.pos) + FVector(0.f, 0.f, 100.f), FRotator::ZeroRotator, P);
		if (!N) continue;
		const SC::Archetype Kind2 = Sp.role == 1 ? SC::Archetype::Enforcer : SC::Archetype::Civilian;
		N->InitStation(Kind2, (uint32)(Key.X * 977 + Key.Y * 131) + K++, SCU::V(Sp.pos) + FVector(0.f, 0.f, 100.f), (float)Sp.yaw, true);
		V.Staff.Add(N);
		Npcs.Add(N);
	}
	Venues.Add(Key, V);
}

void ASCDirector::UnregisterVenue(const FIntPoint& Key)
{
	if (FVenue* V = Venues.Find(Key))
	{
		for (const TWeakObjectPtr<ASCNpc>& S : V->Staff) if (S.IsValid()) S->Destroy();
		Venues.Remove(Key);
	}
}

ASCNpc* ASCDirector::SpawnPedestrian(SC::Archetype Kind, const FVector& Near, float MinDist, float MaxDist)
{
	UWorld* W = GetWorld();
	if (!W || !WorldActor) return nullptr;
	FVector Pos;
	SC::WalkLoop Loop;
	float S = 0.f;
	if (!WorldActor->RandomLoopPoint(Near, MinDist, MaxDist, Rng, Pos, Loop, S)) return nullptr;
	FActorSpawnParameters P;
	P.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	ASCNpc* N = W->SpawnActor<ASCNpc>(ASCNpc::StaticClass(), Pos + FVector(0.f, 0.f, 100.f), FRotator::ZeroRotator, P);
	if (!N) return nullptr;
	N->InitStroll(Kind, (uint32)Seed * 31u + SpawnCounter++, Loop, S);
	Npcs.Add(N);
	return N;
}

void ASCDirector::KeepStreetsBusy()
{
	if (!Player) return;
	const FVector Where = Player->GetActorLocation();
	int32 Count = 0;
	for (int32 i = Npcs.Num() - 1; i >= 0; --i)
	{
		ASCNpc* N = Npcs[i].Get();
		if (!N) { Npcs.RemoveAtSwap(i); continue; }
		if (N->bStaff || N->IsCop()) continue;
		if (FVector::Dist2D(N->GetActorLocation(), Where) > 12000.f) { N->Destroy(); Npcs.RemoveAtSwap(i); continue; }
		++Count;
	}
	if (Count < MaxPedestrians)
	{
		// One in eleven is armed and one in sixteen is a big muscular man; now and then a hired heavy with a gun.
		const float R = Rng.FRand();
		SC::Archetype K = SC::Archetype::Civilian;
		if (R < 1.f / 11.f) K = SC::Archetype::Armed;
		else if (R < 1.f / 11.f + 1.f / 16.f) K = SC::Archetype::Bruiser;
		else if (R < 1.f / 11.f + 1.f / 16.f + 1.f / 70.f) K = SC::Archetype::Enforcer;
		SpawnPedestrian(K, Where, 2200.f, 8000.f);
	}
}

void ASCDirector::KeepPolice(float Dt)
{
	if (!Player) return;
	const FVector Where = Player->GetActorLocation();
	int32 Cops = 0, Cars = 0;
	for (const TWeakObjectPtr<ASCNpc>& N : Npcs) if (N.IsValid() && N->IsCop() && !N->IsDead() && !N->IsKo()) ++Cops;
	for (const TWeakObjectPtr<ASCVehicle>& V : Vehicles) if (V.IsValid() && V->IsCruiser() && V->bAI) ++Cars;
	CopTimer -= Dt;
	CarTimer -= Dt;
	if (CopTimer <= 0.f && Cops < Wanted.WantedOfficers())
	{
		CopTimer = 1.6f;
		SpawnPedestrian(SC::Archetype::Cop, Where, 3500.f, 6500.f);
	}
	UWorld* W = GetWorld();
	if (CarTimer <= 0.f && Cars < Wanted.WantedCars() && W)
	{
		CarTimer = 4.f;
		// On the road a block or so away: snap to the nearest street running one way or the other.
		FVector Pos = Where + FVector(Rng.FRandRange(-1.f, 1.f), Rng.FRandRange(-1.f, 1.f), 0.f).GetSafeNormal() * Rng.FRandRange(9000.f, 14000.f);
		const bool bAlongX = Rng.FRand() < 0.5f;
		const double Road = (FMath::FloorToDouble((bAlongX ? Pos.Y : Pos.X) / SC::kPitch) + 0.5) * SC::kPitch + 300.0;
		(bAlongX ? Pos.Y : Pos.X) = Road;
		Pos.X = FMath::Clamp(Pos.X, -SC::kWorldHalf, SC::kWorldHalf);
		Pos.Y = FMath::Clamp(Pos.Y, -SC::kWorldHalf, SC::kWorldHalf);
		Pos.Z = 90.f;
		FActorSpawnParameters P;
		P.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AdjustIfPossibleButAlwaysSpawn;
		const FRotator Face = (Where - Pos).Rotation();
		if (ASCVehicle* Car = W->SpawnActor<ASCVehicle>(ASCVehicle::StaticClass(), Pos, FRotator(0.f, Face.Yaw, 0.f), P))
		{
			Car->Setup(SC::CarKind::Cruiser, FLinearColor::Black, false);
			Car->bAI = true;
			Car->AITarget = Player;
		}
	}
	// The heat is over: officers and cars go home.
	if (!Wanted.Active()) DismissPolice();
	for (int32 i = Vehicles.Num() - 1; i >= 0; --i)
	{
		ASCVehicle* V = Vehicles[i].Get();
		if (!V) { Vehicles.RemoveAtSwap(i); continue; }
		if (V->IsCruiser() && !V->bAI && FVector::Dist2D(V->GetActorLocation(), Where) > 25000.f) { V->Destroy(); Vehicles.RemoveAtSwap(i); }
	}
}

void ASCDirector::Arrest()
{
	if (!Player) return;
	Money -= Money / 6;
	Wanted.Clear();
	DismissPolice();
	Player->Respawn(false);
}

void ASCDirector::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	if (!Player) return;
	// Officers can see you (and one who is holding you for long enough has arrested you).
	bool bSeen = false;
	float Arrest01 = 0.f;
	for (const TWeakObjectPtr<ASCNpc>& N : Npcs)
	{
		if (!N.IsValid() || !N->IsCop()) continue;
		if (N->SeesPlayer()) bSeen = true;
		Arrest01 = FMath::Max(Arrest01, N->ArrestProgress());
	}
	Wanted.Update(DeltaSeconds, bSeen);
	if (Arrest01 > 2.6f && !Player->InCar() && !Player->IsDown()) { Arrest(); return; }

	for (TPair<FIntPoint, FVenue>& Pair : Venues) Pair.Value.Cooldown = FMath::Max(0.f, Pair.Value.Cooldown - DeltaSeconds);
	PopTimer -= DeltaSeconds;
	if (PopTimer <= 0.f) { PopTimer = 0.5f; KeepStreetsBusy(); }
	KeepPolice(DeltaSeconds);

	// What E would do (for the screen).
	PromptTimer -= DeltaSeconds;
	if (PromptTimer <= 0.f)
	{
		PromptTimer = 0.15f;
		Prompt.Reset();
		const FVector P = Player->GetActorLocation();
		if (!Player->InCar())
		{
			if (NearestLoot(P, 230.f)) Prompt = TEXT("E   take his wallet");
			else if (Player->bGunDrawn)
			{
				for (const TPair<FIntPoint, FVenue>& Pair : Venues) if (Pair.Value.Cooldown <= 0.f && FVector::Dist(Pair.Value.Till, P) < 330.f) { Prompt = TEXT("E   rob the till"); break; }
			}
			if (Prompt.IsEmpty() && NearestVehicle(P, 430.f)) Prompt = TEXT("E   get in");
		}
	}
}
