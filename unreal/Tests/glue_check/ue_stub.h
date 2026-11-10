// A stand-in for the parts of Unreal's API that the Sunset City glue uses, written from how the engine's headers declare them. It lets an ordinary compiler check the glue code for
// typos, wrong argument counts, undeclared names and type errors in everything that is OURS. It cannot check that the engine really declares what the stub says it does.
#pragma once
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <functional>
#include <initializer_list>
#include <memory>
#include <string>
#include <type_traits>
#include <utility>
#include <vector>
typedef int32_t int32; typedef uint32_t uint32; typedef uint8_t uint8; typedef uint64_t uint64; typedef int64_t int64; typedef wchar_t TCHAR;
#define TEXT(x) L##x
#define FORCEINLINE inline
#define UCLASS(...)
#define UPROPERTY(...)
#define UFUNCTION(...)
#define SUNSETCITY_API
#define PI 3.14159265358979f
#define MAX_int32 INT32_MAX
#define UE_LOG(...) ((void)0)
#define DECLARE_LOG_CATEGORY_EXTERN(a, b, c) extern int a;
#define DEFINE_LOG_CATEGORY(a) int a;
#define IMPLEMENT_PRIMARY_GAME_MODULE(a, b, c)
struct FName { FName() {} FName(const TCHAR*) {} bool operator==(const FName&) const { return true; } };
extern const FName NAME_None;
struct FString { std::wstring s; bool operator==(const FString& o) const { return s == o.s; } FString() {} FString(const TCHAR* p) : s(p ? p : L"") {} static FString Printf(const TCHAR*, ...) { return FString(); } bool IsEmpty() const { return s.empty(); } void Reset() { s.clear(); } FString& operator+=(const TCHAR* p) { s += p; return *this; } const TCHAR* operator*() const { return s.c_str(); } };
struct FVector;
struct FRotator;
namespace EAxis { enum Type { X, Y, Z }; }
struct FVector {
  double X = 0, Y = 0, Z = 0; static const FVector ZeroVector;
  FVector() {} FVector(double x, double y, double z) : X(x), Y(y), Z(z) {}
  FVector operator+(const FVector& o) const { return FVector(X + o.X, Y + o.Y, Z + o.Z); } FVector operator-(const FVector& o) const { return FVector(X - o.X, Y - o.Y, Z - o.Z); }
  FVector operator*(double s) const { return FVector(X * s, Y * s, Z * s); } FVector operator*(const FVector& o) const { return FVector(X * o.X, Y * o.Y, Z * o.Z); } FVector operator-() const { return FVector(-X, -Y, -Z); }
  FVector& operator+=(const FVector& o) { X += o.X; Y += o.Y; Z += o.Z; return *this; } FVector& operator*=(double s) { X *= s; Y *= s; Z *= s; return *this; }
  bool IsNearlyZero(double = 1e-4) const { return false; } double Size() const { return 0; } double Size2D() const { return 0; } double SizeSquared() const { return 0; }
  FVector GetSafeNormal() const { return *this; } FVector GetSafeNormal2D() const { return *this; } bool Normalize() { return true; } FRotator Rotation() const;
  FVector RotateAngleAxis(double, const FVector&) const { return *this; }
  static double DotProduct(const FVector&, const FVector&) { return 0; } static FVector CrossProduct(const FVector&, const FVector&) { return FVector(); }
  static double Dist(const FVector&, const FVector&) { return 0; } static double Dist2D(const FVector&, const FVector&) { return 0; } static double DistSquared(const FVector&, const FVector&) { return 0; }
};
struct FVector2D { double X = 0, Y = 0; FVector2D() {} FVector2D(double x, double y) : X(x), Y(y) {} };
struct FVector4 { double X = 0, Y = 0, Z = 0, W = 0; FVector4() {} FVector4(double x, double y, double z, double w) : X(x), Y(y), Z(z), W(w) {} };
struct FRotator { double Pitch = 0, Yaw = 0, Roll = 0; static const FRotator ZeroRotator; FRotator() {} FRotator(double p, double y, double r) : Pitch(p), Yaw(y), Roll(r) {} static double NormalizeAxis(double a) { return a; } };
inline FRotator FVector::Rotation() const { return FRotator(); }
struct FQuat { static const FQuat Identity; };
struct FTransform { FVector TransformPosition(const FVector& v) const { return v; } FVector GetUnitAxis(EAxis::Type) const { return FVector(); } };
struct FRotationMatrix { FRotationMatrix(const FRotator&) {} FVector GetUnitAxis(EAxis::Type) const { return FVector(); } };
struct FLinearColor { float R = 0, G = 0, B = 0, A = 1; static const FLinearColor White, Black; FLinearColor() {} FLinearColor(float r, float g, float b, float a = 1.f) : R(r), G(g), B(b), A(a) {} };
struct FIntPoint { int32 X = 0, Y = 0; FIntPoint() {} FIntPoint(int32 x, int32 y) : X(x), Y(y) {} bool operator==(const FIntPoint& o) const { return X == o.X && Y == o.Y; } bool operator!=(const FIntPoint& o) const { return !(*this == o); } };
struct FRandomStream { void Initialize(int32) {} float FRand() { return 0; } float FRandRange(float, float) { return 0; } int32 RandRange(int32 a, int32) { return a; } };
struct FMemory { static void* Memcpy(void* d, const void* s, size_t n) { return std::memcpy(d, s, n); } };
struct FPlatformTime { static double Seconds() { return 0; } };
struct FSoftObjectPath { bool IsValid() const { return false; } struct UObject* TryLoad() const; };
struct FMath {
  template <class T> static T Abs(T a) { return a < 0 ? -a : a; } template <class T> static T Min(T a, T b) { return a < b ? a : b; } template <class T> static T Max(T a, T b) { return a > b ? a : b; }
  template <class T> static T Clamp(T x, T lo, T hi) { return x < lo ? lo : x > hi ? hi : x; } template <class T> static T Square(T a) { return a * a; }
  template <class T, class U> static T Lerp(T a, T b, U t) { return T(a + (b - a) * t); }
  static float Sin(float a) { return std::sin(a); } static float Cos(float a) { return std::cos(a); } static double Sin(double a) { return std::sin(a); } static double Cos(double a) { return std::cos(a); }
  static float Sqrt(float a) { return std::sqrt(a); } static float Atan2(float a, float b) { return std::atan2(a, b); } static float Fmod(float a, float b) { return std::fmod(a, b); }
  static float DegreesToRadians(float a) { return a * 0.0174533f; } static float RadiansToDegrees(float a) { return a * 57.2958f; } static double DegreesToRadians(double a) { return a * 0.0174533; } static double RadiansToDegrees(double a) { return a * 57.2958; }
  static float SmoothStep(float, float, float x) { return x; } static float FInterpTo(float c, float, float, float) { return c; } static FRotator RInterpTo(const FRotator& c, const FRotator&, float, float) { return c; }
  static float FixedTurn(float c, float, float) { return c; } static float FindDeltaAngleDegrees(float, float) { return 0; } static double FloorToDouble(double a) { return std::floor(a); } static int32 RoundToInt(double a) { return int32(std::lround(a)); }
  static double Cos(int) = delete;
};
template <class T> struct TObjectPtr { T* p = nullptr; TObjectPtr() {} TObjectPtr(T* x) : p(x) {} TObjectPtr(std::nullptr_t) {} operator T*() const { return p; } T* operator->() const { return p; } T* Get() const { return p; } TObjectPtr& operator=(T* x) { p = x; return *this; } };
template <class T> struct TWeakObjectPtr { T* p = nullptr; TWeakObjectPtr() {} TWeakObjectPtr(T* x) : p(x) {} bool IsValid() const { return p != nullptr; } T* Get() const { return p; } T* operator->() const { return p; } TWeakObjectPtr& operator=(T* x) { p = x; return *this; } };
template <class T> struct TSubclassOf { struct UClass* c = nullptr; TSubclassOf() {} TSubclassOf(struct UClass* x) : c(x) {} };
template <class T> struct TArray {
  std::vector<T> v; using SizeType = int32;
  int32 Add(const T& x) { v.push_back(x); return int32(v.size()) - 1; } int32 Num() const { return int32(v.size()); } void SetNum(int32 n) { v.resize(size_t(n)); } void SetNumUninitialized(int32 n) { v.resize(size_t(n)); }
  void Reserve(int32 n) { v.reserve(size_t(n)); } T& operator[](int32 i) { return v[size_t(i)]; } const T& operator[](int32 i) const { return v[size_t(i)]; } T* GetData() { return v.data(); }
  void Init(const T& x, int32 n) { v.assign(size_t(n), x); } bool IsValidIndex(int32 i) const { return i >= 0 && i < Num(); } void RemoveAtSwap(int32 i) { v.erase(v.begin() + i); } void Reset() { v.clear(); }
  bool Contains(const T& x) const { return std::find(v.begin(), v.end(), x) != v.end(); } template <class P> void Sort(P p) { std::sort(v.begin(), v.end(), p); }
  typename std::vector<T>::iterator begin() { return v.begin(); } typename std::vector<T>::iterator end() { return v.end(); } typename std::vector<T>::const_iterator begin() const { return v.begin(); } typename std::vector<T>::const_iterator end() const { return v.end(); }
};
template <class K, class V> struct TPair { K Key; V Value; };
template <class K, class V> struct TMap {
  std::vector<TPair<K, V>> v;
  void Add(const K& k, const V& x) { for (auto& p : v) if (p.Key == k) { p.Value = x; return; } v.push_back({k, x}); }
  V* Find(const K& k) { for (auto& p : v) if (p.Key == k) return &p.Value; return nullptr; } const V* Find(const K& k) const { for (auto& p : v) if (p.Key == k) return &p.Value; return nullptr; }
  bool Contains(const K& k) const { return Find(k) != nullptr; } void Remove(const K& k) { for (size_t i = 0; i < v.size(); i++) if (v[i].Key == k) { v.erase(v.begin() + long(i)); return; } }
  typename std::vector<TPair<K, V>>::iterator begin() { return v.begin(); } typename std::vector<TPair<K, V>>::iterator end() { return v.end(); }
  typename std::vector<TPair<K, V>>::const_iterator begin() const { return v.begin(); } typename std::vector<TPair<K, V>>::const_iterator end() const { return v.end(); }
};
template <class T> struct TSet { std::vector<T> v; void Add(const T& x) { v.push_back(x); } bool Contains(const T& x) const { return std::find(v.begin(), v.end(), x) != v.end(); } };
template <class T> struct TSharedPtr { std::shared_ptr<T> p; TSharedPtr() {} TSharedPtr(std::shared_ptr<T> x) : p(x) {} T* Get() const { return p.get(); } T* operator->() const { return p.get(); } T& operator*() const { return *p; } };
template <class T> TSharedPtr<T> MakeShared() { return TSharedPtr<T>(std::make_shared<T>()); }
template <class T> struct TUniquePtr { std::unique_ptr<T> p; TUniquePtr() {} TUniquePtr(std::unique_ptr<T>&& x) : p(std::move(x)) {} T* operator->() const { return p.get(); } T* Get() const { return p.get(); } explicit operator bool() const { return bool(p); } };
template <class T, class... A> TUniquePtr<T> MakeUnique(A&&... a) { return TUniquePtr<T>(std::unique_ptr<T>(new T(std::forward<A>(a)...))); }
inline int32 GetTypeHash(const FIntPoint&) { return 0; }
// ---- objects ----
struct UWorld; struct FProperty; struct UClass; struct AActor;
struct FProperty { template <class T> void* ContainerPtrToValuePtr(const struct UObject*) const { return nullptr; } };
struct FDoubleProperty : FProperty { void SetPropertyValue(void*, double) {} }; struct FFloatProperty : FProperty { void SetPropertyValue(void*, float) {} }; struct FIntProperty : FProperty { void SetPropertyValue(void*, int32) {} };
struct FBoolProperty : FProperty { void SetPropertyValue(void*, bool) {} }; struct FByteProperty : FProperty { void SetPropertyValue(void*, uint8) {} };
struct FNumericProperty : FProperty { void SetIntPropertyValue(void*, int64) {} }; struct FEnumProperty : FProperty { FNumericProperty* GetUnderlyingProperty() { return nullptr; } };
template <class T> T* CastField(FProperty* p) { return static_cast<T*>(p); }
struct UClass { FProperty* FindPropertyByName(FName) { return nullptr; } };
struct UObject { virtual ~UObject() {} UClass* GetClass() const { return nullptr; } FString GetName() const { return FString(); } virtual UWorld* GetWorld() const { return nullptr; }
  template <class T> T* CreateDefaultSubobject(const TCHAR*) { return nullptr; } };
template <class T> T* NewObject(UObject*) { return nullptr; }
enum { LOAD_None = 0, LOAD_Quiet = 1, LOAD_NoWarn = 2 };
template <class T> T* LoadObject(UObject*, const TCHAR*, const TCHAR* = nullptr, uint32 = 0) { return nullptr; }
template <class T, class U> T* Cast(U* p) { return dynamic_cast<T*>(p); }
inline UObject* FSoftObjectPath::TryLoad() const { return nullptr; }
struct FSubsystemCollectionBase {};
struct UWorldSubsystem : UObject { typedef UObject Super_; virtual bool ShouldCreateSubsystem(UObject*) const { return true; } virtual void Initialize(FSubsystemCollectionBase&) {} };
struct UMaterialInterface : UObject {};
struct UMaterialInstanceDynamic : UMaterialInterface { static UMaterialInstanceDynamic* Create(UMaterialInterface*, UObject*) { return nullptr; } void SetVectorParameterValue(FName, FLinearColor) {} void SetScalarParameterValue(FName, float) {} };
struct UStaticMesh : UObject {};
enum ECollisionChannel { ECC_WorldStatic, ECC_WorldDynamic, ECC_Pawn, ECC_Visibility, ECC_Vehicle };
namespace ECollisionEnabled { enum Type { NoCollision, QueryOnly, QueryAndPhysics }; }
enum ECollisionResponse { ECR_Ignore, ECR_Overlap, ECR_Block };
enum class ELightUnits : uint8 { Unitless, Candelas, Lumens };
enum class ETeleportType : uint8 { None, TeleportPhysics };
enum class ESpawnActorCollisionHandlingMethod : uint8 { AlwaysSpawn, AdjustIfPossibleButAlwaysSpawn };
enum EMovementMode { MOVE_None, MOVE_Walking };
enum ETickingGroup { TG_PrePhysics, TG_DuringPhysics };
enum class EReflectionMethod : uint8 { None, Lumen };
enum class EDynamicGlobalIlluminationMethod : uint8 { None, Lumen };
struct FKey {}; struct EKeys { static const FKey W, A, S, D, Up, Down, Left, Right, SpaceBar, LeftShift, LeftMouseButton, Q, E, F, R; };
struct FHitResult { bool bBlockingHit = false; float Distance = 0; FVector ImpactPoint; AActor* GetActor() const { return nullptr; } };
struct FOverlapResult { AActor* GetActor() const { return nullptr; } };
struct FCollisionQueryParams { void AddIgnoredActor(const AActor*) {} };
struct FCollisionShape { static FCollisionShape MakeSphere(float) { return FCollisionShape(); } };
struct FActorSpawnParameters { ESpawnActorCollisionHandlingMethod SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn; };
struct FBodyInstance { FVector COMNudge; };
struct FProcMeshTangent {};
struct FPostProcessSettings {
  bool bOverride_AutoExposureBias = false, bOverride_AutoExposureMinBrightness = false, bOverride_AutoExposureMaxBrightness = false, bOverride_BloomIntensity = false, bOverride_SceneFringeIntensity = false, bOverride_VignetteIntensity = false, bOverride_FilmGrainIntensity = false,
       bOverride_MotionBlurAmount = false, bOverride_ColorSaturation = false, bOverride_ColorContrast = false, bOverride_DynamicGlobalIlluminationMethod = false, bOverride_ReflectionMethod = false;
  float AutoExposureBias = 0, AutoExposureMinBrightness = 0, AutoExposureMaxBrightness = 0, BloomIntensity = 0, SceneFringeIntensity = 0, VignetteIntensity = 0, FilmGrainIntensity = 0, MotionBlurAmount = 0; FVector4 ColorSaturation, ColorContrast;
  EDynamicGlobalIlluminationMethod DynamicGlobalIlluminationMethod = EDynamicGlobalIlluminationMethod::None; EReflectionMethod ReflectionMethod = EReflectionMethod::None;
};
struct FActorTickFunction { bool bCanEverTick = false; ETickingGroup TickGroup = TG_PrePhysics; };
struct UActorComponent : UObject { void RegisterComponent() {} void DestroyComponent(bool = false) {} AActor* GetOwner() const { return nullptr; } };
struct USceneComponent : UActorComponent {
  void SetupAttachment(USceneComponent*, FName = FName()) {} void SetRelativeLocation(const FVector&) {} void SetRelativeRotation(const FRotator&) {} void SetRelativeLocationAndRotation(const FVector&, const FRotator&) {}
  void SetWorldLocation(const FVector&) {} void SetWorldRotation(const FRotator&) {} FVector GetComponentLocation() const { return FVector(); } FTransform GetComponentTransform() const { return FTransform(); } FVector GetForwardVector() const { return FVector(); }
  FRotator GetRelativeRotation() const { return FRotator(); } void SetVisibility(bool, bool = false) {} };
struct UPrimitiveComponent : USceneComponent {
  FBodyInstance BodyInstance; void SetCollisionEnabled(ECollisionEnabled::Type) {} void SetCollisionProfileName(FName) {} void SetCollisionObjectType(ECollisionChannel) {} void SetCollisionResponseToAllChannels(ECollisionResponse) {}
  void SetCollisionResponseToChannel(ECollisionChannel, ECollisionResponse) {} void SetSimulatePhysics(bool) {} void SetLinearDamping(float) {} void SetAngularDamping(float) {} void SetMassOverrideInKg(FName, float, bool) {}
  FVector GetPhysicsLinearVelocity() const { return FVector(); } FVector GetPhysicsLinearVelocityAtPoint(const FVector&) const { return FVector(); } void SetPhysicsLinearVelocity(const FVector&) {} void SetPhysicsAngularVelocityInDegrees(const FVector&) {}
  void AddForce(const FVector&) {} void AddForceAtLocation(const FVector&, const FVector&) {} void SetMaterial(int32, UMaterialInterface*) {} void SetCastShadow(bool) {} };
struct UCapsuleComponent : UPrimitiveComponent { void InitCapsuleSize(float, float) {} void SetCapsuleSize(float, float, bool = true) {} };
struct UBoxComponent : UPrimitiveComponent { void SetBoxExtent(const FVector&) {} };
struct UStaticMeshComponent : UPrimitiveComponent { void SetStaticMesh(UStaticMesh*) {} };
struct UProceduralMeshComponent : UPrimitiveComponent { bool bUseAsyncCooking = false, bUseComplexAsSimpleCollision = false;
  void CreateMeshSection_LinearColor(int32, const TArray<FVector>&, const TArray<int32>&, const TArray<FVector>&, const TArray<FVector2D>&, const TArray<FLinearColor>&, const TArray<FProcMeshTangent>&, bool) {} void AddCollisionConvexMesh(TArray<FVector>) {} };
struct ULightComponent : USceneComponent { void SetIntensity(float) {} void SetLightColor(FLinearColor, bool = true) {} void SetCastShadows(bool) {} void SetIntensityUnits(ELightUnits) {} };
struct UPointLightComponent : ULightComponent { void SetAttenuationRadius(float) {} void SetSourceRadius(float) {} };
struct USpotLightComponent : UPointLightComponent { void SetOuterConeAngle(float) {} void SetInnerConeAngle(float) {} };
struct UDirectionalLightComponent : ULightComponent {};
struct USkyAtmosphereComponent : USceneComponent {};
struct USkyLightComponent : USceneComponent { void SetIntensity(float) {} };
struct UExponentialHeightFogComponent : USceneComponent { void SetFogDensity(float) {} void SetFogHeightFalloff(float) {} void SetVolumetricFog(bool) {} };
struct UVolumetricCloudComponent : USceneComponent { void SetMaterial(UMaterialInterface*) {} };
struct UPostProcessComponent : USceneComponent { FPostProcessSettings Settings; bool bUnbound = true; };
struct UCameraComponent : USceneComponent {};
struct USpringArmComponent : USceneComponent { static const FName SocketName; float TargetArmLength = 0, ProbeSize = 0, CameraLagSpeed = 0, CameraRotationLagSpeed = 0; FVector SocketOffset;
  bool bUsePawnControlRotation = false, bDoCollisionTest = false, bInheritPitch = false, bInheritYaw = false, bInheritRoll = false, bEnableCameraLag = false, bEnableCameraRotationLag = false; };
struct UCharacterMovementComponent : UActorComponent { bool bOrientRotationToMovement = false; FRotator RotationRate; float JumpZVelocity = 0, AirControl = 0, MaxWalkSpeed = 0, BrakingDecelerationWalking = 0;
  void StopMovementImmediately() {} void DisableMovement() {} void SetMovementMode(EMovementMode) {} bool IsMovingOnGround() const { return true; } };
struct AController; struct APlayerController; struct UCanvas { int32 SizeX = 0, SizeY = 0; };
struct AActor : UObject { FActorTickFunction PrimaryActorTick; void SetRootComponent(USceneComponent*) {} USceneComponent* GetRootComponent() const { return nullptr; } FVector GetActorLocation() const { return FVector(); }
  bool SetActorLocation(const FVector&) { return true; } bool SetActorRotation(const FRotator&) { return true; } bool SetActorLocationAndRotation(const FVector&, const FRotator&, bool = false, FHitResult* = nullptr, ETeleportType = ETeleportType::None) { return true; }
  void AddActorWorldOffset(const FVector&, bool = false, FHitResult* = nullptr) {} FRotator GetActorRotation() const { return FRotator(); } FVector GetActorForwardVector() const { return FVector(); } FVector GetActorRightVector() const { return FVector(); }
  bool Destroy() { return true; } void SetActorHiddenInGame(bool) {} void SetActorEnableCollision(bool) {} FVector GetVelocity() const { return FVector(); } virtual void BeginPlay() {} virtual void Tick(float) {} };
struct AController : AActor { void SetControlRotation(const FRotator&) {} FRotator GetControlRotation() const { return FRotator(); } virtual void Possess(struct APawn*) {} };
struct APawn : AActor { AController* GetController() const { return nullptr; } void AddMovementInput(const FVector&, float = 1.f) {} void AddControllerYawInput(float) {} void AddControllerPitchInput(float) {} FRotator GetControlRotation() const { return FRotator(); }
  bool bUseControllerRotationYaw = false; virtual void PossessedBy(AController*) {} };
inline void dummy_possess() {}
struct ACharacter : APawn { UCapsuleComponent* GetCapsuleComponent() const { return nullptr; } UCharacterMovementComponent* GetCharacterMovement() const { return nullptr; } void Jump() {} void LaunchCharacter(const FVector&, bool, bool) {} };
struct APlayerCameraManager { float ViewPitchMin = 0, ViewPitchMax = 0; };
struct FInputModeGameOnly {};
struct APlayerController : AController { APlayerCameraManager* PlayerCameraManager = nullptr; bool IsInputKeyDown(FKey) const { return false; } bool WasInputKeyJustPressed(FKey) const { return false; } void GetInputMouseDelta(float&, float&) const {}
  void SetShowMouseCursor(bool) {} void SetInputMode(const FInputModeGameOnly&) {} void Possess(APawn*) override {} };
struct APlayerStart : AActor {};
struct AHUD : AActor { UCanvas* Canvas = nullptr; virtual void DrawHUD() {} void DrawText(const FString&, FLinearColor, float, float, UObject* = nullptr, float = 1.f, bool = false) {} void DrawRect(FLinearColor, float, float, float, float) {} APawn* GetOwningPawn() const { return nullptr; } };
struct AGameModeBase : AActor { TSubclassOf<APawn> DefaultPawnClass; TSubclassOf<AHUD> HUDClass; virtual void StartPlay() {} virtual AActor* ChoosePlayerStart_Implementation(AController*) { return nullptr; } };
struct UWorld : UObject {
  template <class T> T* GetSubsystem() const { return nullptr; } bool IsGameWorld() const { return true; } float GetTimeSeconds() const { return 0; } template <class T> T* GetAuthGameMode() const { return nullptr; }
  template <class T> T* SpawnActor(UClass*, const FVector&, const FRotator&, const FActorSpawnParameters& = FActorSpawnParameters()) { return nullptr; } template <class T> T* SpawnActor(const FVector&, const FRotator&, const FActorSpawnParameters& = FActorSpawnParameters()) { return nullptr; }
  bool LineTraceSingleByChannel(FHitResult&, const FVector&, const FVector&, ECollisionChannel, const FCollisionQueryParams&) const { return false; }
  bool SweepMultiByChannel(TArray<FHitResult>&, const FVector&, const FVector&, const FQuat&, ECollisionChannel, const FCollisionShape&, const FCollisionQueryParams&) const { return false; }
  bool OverlapMultiByChannel(TArray<FOverlapResult>&, const FVector&, const FQuat&, ECollisionChannel, const FCollisionShape&, const FCollisionQueryParams&) const { return false; } };
struct UGameplayStatics { static APawn* GetPlayerPawn(const UObject*, int32) { return nullptr; } };
