#!/usr/bin/env python3
"""Three mistakes that compile anywhere else and stop an Unreal build, looked for in Source/SunsetCity without Unreal.

1. A local variable or a parameter with the name of a data member of the engine class it is in (a local called Mesh in a character, a parameter called
   Canvas in a HUD, Owner, Tags, Controller, Bounds ...). Visual C++ warns (C4458) and Unreal's default build settings make that warning an error.
2. A member variable of one of our classes with the name of a member of its engine base class (Unreal's header tool refuses a property that hides one).
3. Two .cpp files that each define a file-local helper of the same name (Unreal compiles several .cpp files as one, so they would collide).

The names of the engine's members are written out below from the engine's headers as remembered, for the base classes this project uses: a clean result
means none of THESE names is hidden, not that Unreal will find nothing. `--self-test` plants one of each mistake in a copy and checks they are found.
Usage: python3 shadow_scan.py [source folder]      (needs only python3)"""
import glob, os, re, shutil, sys, tempfile

ACTOR = """PrimaryActorTick bNetTemporary bNetStartup bOnlyRelevantToOwner bAlwaysRelevant bReplicateMovement bCallPreReplication bHidden bTearOff bForceNetAddressable bExchangedRoles
bNetLoadOnClient bNetUseOwnerRelevancy bRelevantForNetworkReplays bRelevantForLevelBounds bReplayRewindable bAllowTickBeforeBeginPlay bAutoDestroyWhenFinished bCanBeDamaged bBlockInput
bCollideWhenPlacing bFindCameraComponentWhenViewTarget bGenerateOverlapEventsDuringLevelStreaming bIgnoresOriginShifting bEnableAutoLODGeneration bIsEditorOnlyActor bActorSeamlessTraveled
bReplicates bCanBeInCluster bAllowReceiveTickEventOnDedicatedServer bActorEnableCollision bActorIsBeingDestroyed UpdateOverlapsMethodDuringLevelStreaming RemoteRole ReplicatedMovement
InitialLifeSpan CustomTimeDilation AttachmentReplication Owner NetDriverName Role NetDormancy SpawnCollisionHandlingMethod AutoReceiveInput InputPriority InputComponent NetCullDistanceSquared
NetTag NetUpdateFrequency MinNetUpdateFrequency NetPriority Instigator Children RootComponent Layers ParentComponent ActorGuid Tags OnTakeAnyDamage OnTakePointDamage OnTakeRadialDamage
OnActorBeginOverlap OnActorEndOverlap OnBeginCursorOver OnEndCursorOver OnClicked OnReleased OnInputTouchBegin OnInputTouchEnd OnInputTouchEnter OnInputTouchLeave OnActorHit OnDestroyed
OnEndPlay ReplicatedComponents OwnedComponents InstanceComponents BlueprintCreatedComponents TimerHandle_LifeSpanExpired PivotOffset HiddenEditorViews SpriteScale CreationTime""".split()
PAWN = """BaseEyeHeight AutoPossessPlayer AutoPossessAI AIControllerClass PlayerState Controller PreviousController LastHitBy bUseControllerRotationPitch bUseControllerRotationYaw
bUseControllerRotationRoll bCanAffectNavigationGeneration bInputEnabled bProcessingOutsideWorldBounds ControlInputVector LastControlInputVector OverrideInputComponentClass BlendedReplayViewPitch
RemoteViewPitch ReceiveControllerChangedDelegate ReceiveRestartedDelegate""".split()
CHARACTER = """Mesh CharacterMovement CapsuleComponent ArrowComponent BasedMovement ReplicatedBasedMovement AnimRootMotionTranslationScale BaseTranslationOffset BaseRotationOffset
ReplicatedServerLastTransformUpdateTimeStamp ReplayLastTransformUpdateTimeStamp ReplicatedMovementMode bInBaseReplication CrouchedEyeHeight bIsCrouched bProxyIsJumpForceApplied bPressedJump
bClientUpdating bClientWasFalling bClientResimulateRootMotion bClientResimulateRootMotionSources bSimGravityDisabled bClientCheckEncroachmentOnNetUpdate bServerMoveIgnoreRootMotion bWasJumping
JumpKeyHoldTime JumpForceTimeRemaining ProxyJumpForceStartedTime JumpMaxHoldTime JumpMaxCount JumpCurrentCount JumpCurrentCountPreJump NumActorOverlapEventsCounter OnReachedJumpApex
LandedDelegate MovementModeChangedDelegate OnCharacterMovementUpdated SavedRootMotion ClientRootMotionParams RootMotionRepMoves RepRootMotion MeshComponentName CharacterMovementComponentName
CapsuleComponentName""".split()
HUD = """WhiteColor GreenColor RedColor PlayerOwner bLostFocusPaused bShowHUD bShowDebugInfo CurrentTargetIndex bShowHitBoxDebugInfo bShowOverlays bEnableDebugTextShadow PostRenderedActors
LastHUDRenderTime RenderDelta DebugDisplay ToggledDebugCategories Canvas DebugCanvas DebugTextList ShowDebugTargetDesiredClass ShowDebugTargetActor HitBoxMap HitBoxHits HitBoxesOver
OnShowDebugInfo OnHUDPostRender""".split()
GAMEMODE = """OptionsString GameSessionClass GameStateClass PlayerControllerClass PlayerStateClass HUDClass DefaultPawnClass SpectatorClass ReplaySpectatorPlayerControllerClass
ServerStatReplicatorClass GameSession GameState ServerStatReplicator DefaultPlayerName bUseSeamlessTravel bStartPlayersAsSpectators bPauseable Pausers""".split()
ACOMP = """PrimaryComponentTick ComponentTags AssetUserData UCSSerializationIndex bNetAddressable bAutoRegister bAllowReregistration bTickInEditor bNeverNeedsRenderUpdate bAllowConcurrentTick
bAllowAnyoneToDestroyMe bAutoActivate bIsActive bEditableWhenInherited bNavigationRelevant bCanEverAffectNavigation bWantsInitializeComponent bIsEditorOnly CreationMethod OnComponentActivated
OnComponentDeactivated UCSModifiedProperties OwnerPrivate WorldPrivate bReplicates""".split()
SCOMP = """PhysicsVolume AttachParent AttachSocketName AttachChildren ClientAttachedChildren NetOldAttachSocketName NetOldAttachParent Bounds RelativeLocation RelativeRotation RelativeScale3D
ComponentVelocity bComponentToWorldUpdated bSkipUpdateOverlaps bAbsoluteLocation bAbsoluteRotation bAbsoluteScale bVisible bShouldBeAttached bShouldSnapLocationWhenAttached
bShouldSnapRotationWhenAttached bShouldSnapScaleWhenAttached bShouldUpdatePhysicsVolume bHiddenInGame bBoundsChangeTriggersStreamingDataRebuild bUseAttachParentBound bComputeFastLocalBounds
bComputeBoundsOnceForGame bComputedBoundsOnceForGame bIsNotRenderAttachmentRoot Mobility DetailMode PhysicsVolumeChangedDelegate TransformUpdated ComponentToWorld WorldRotationCache""".split()
BASES = {'AActor': ACTOR, 'AInfo': ACTOR, 'APawn': ACTOR + PAWN, 'ACharacter': ACTOR + PAWN + CHARACTER, 'AHUD': ACTOR + HUD, 'AGameModeBase': ACTOR + GAMEMODE, 'AGameMode': ACTOR + GAMEMODE,
         'UActorComponent': ACOMP, 'USceneComponent': ACOMP + SCOMP, 'UWorldSubsystem': [], 'UGameInstanceSubsystem': [], 'UObject': []}
DECL = r'(?:\b(?:const|auto|int32|uint8|float|double|bool|F\w+|U\w+\s*\*|A\w+\s*\*|T\w+<[^;{}()]*>|[A-Z]\w*)\s*[*&]*\s+|[*&>]\s*)([A-Za-z_]\w*)\s*(=(?!=)|;|\{|\[|,|\)\s*\{|:(?!:))'


def no_comments(s):
    return re.sub(r'//[^\n]*', lambda m: ' ' * len(m.group(0)), s)                       # (blanked, so that positions and line numbers stay)


def block(s, i):
    """The text of the { } block whose opening brace is just before position i."""
    d = 1; j = i
    while j < len(s) and d:
        d += s[j] == '{'; d -= s[j] == '}'; j += 1
    return s[i:j - 1]


def scan(src):
    out = []; note = []
    heads = sorted(glob.glob(os.path.join(src, '*.h'))); cpps = sorted(glob.glob(os.path.join(src, '*.cpp')))
    cls = {}
    for h in heads:
        for m in re.finditer(r'class\s+(?:\w+_API\s+)?(\w+)\s*:\s*public\s+(\w+)', open(h).read()):
            cls[m.group(1)] = m.group(2)

    def engine_base(c):
        n = 0
        while c in cls and n < 8:
            c = cls[c]; n += 1
        return c
    unknown = sorted({engine_base(c) for c in cls} - set(BASES))
    if unknown:
        note.append('engine base classes whose members are not listed here (nothing was checked for them): ' + ', '.join(unknown))

    # 1. locals and parameters in member functions
    funcs = 0
    for f in cpps + heads:
        s = no_comments(open(f).read()); name = os.path.basename(f)
        for m in re.finditer(r'\b(\w+)::(~?\w+)\s*\(([^)]*)\)\s*(?:const)?\s*(?::[^{;]*)?\{', s):
            c = m.group(1); base = engine_base(c)
            if c not in cls or base not in BASES:
                continue
            funcs += 1; risky = set(BASES[base])
            for pm in re.finditer(r'([A-Za-z_]\w*)\s*(?:=[^,]*)?(?:,|$)', m.group(3)):
                if pm.group(1) in risky:
                    out.append('%s: the parameter %s of %s::%s has the name of a member of %s' % (name, pm.group(1), c, m.group(2), base))
            for lm in re.finditer(DECL, block(s, m.end())):
                if lm.group(1) in risky:
                    out.append('%s:%d: the local %s in %s::%s has the name of a member of %s' % (name, s.count('\n', 0, m.end() + lm.start()) + 1, lm.group(1), c, m.group(2), base))

    # 2. our classes' own members, and the function bodies written inside the class
    members = 0
    for h in heads:
        s = no_comments(open(h).read()); name = os.path.basename(h)
        for m in re.finditer(r'class\s+(?:\w+_API\s+)?(\w+)\s*:\s*public\s+\w+\s*\{', s):
            c = m.group(1); base = engine_base(c)
            if base not in BASES:
                continue
            risky = set(BASES[base]); d = 0; top = ''; inner = ''
            for ch in block(s, m.end()):
                if ch == '{':
                    d += 1; top += ';' if d == 1 else ''
                elif ch == '}':
                    d -= 1
                elif d == 0:
                    top += ch
                else:
                    inner += ch
            for decl in top.split(';'):
                decl = re.sub(r'UPROPERTY\s*\([^)]*\)|UFUNCTION\s*\([^)]*\)|GENERATED_BODY\s*\(\)|public:|protected:|private:', ' ', decl).strip()
                if not decl or '(' in decl.split('=')[0]:
                    continue                                                             # (a function, not a variable)
                for nm in re.finditer(r'([A-Za-z_]\w*)\s*(?:\[[^\]]*\])?\s*(?:=[^,]*)?(?:,|$)', decl):
                    members += 1
                    if nm.group(1) in risky:
                        out.append('%s: the member %s::%s has the name of a member of %s' % (name, c, nm.group(1), base))
            for lm in re.finditer(DECL, inner):
                if lm.group(1) in risky:
                    out.append('%s: a local %s in a function written inside %s has the name of a member of %s' % (name, lm.group(1), c, base))

    # 3. file-local helpers of the same name in two .cpp files
    local = {}
    for f in cpps:
        s = no_comments(open(f).read()); name = os.path.basename(f); names = set()
        for m in re.finditer(r'\bnamespace\s*\{', s):
            d = 0; text = ''
            for ch in block(s, m.end()):
                if ch == '{':
                    d += 1; text += ';' if d == 1 else ''
                elif ch == '}':
                    d -= 1
                elif d == 0:
                    text += ch
            for decl in text.split(';'):
                decl = decl.strip()
                tm = re.search(r'\b(?:struct|class|enum(?:\s+class)?)\s+([A-Za-z_]\w*)', decl); fm = re.search(r'([A-Za-z_]\w*)\s*\(', decl); vm = re.search(r'([A-Za-z_]\w*)\s*(?:\[[^\]]*\])?\s*(?:=|$)', decl)
                got = tm or fm or vm
                if decl and got:
                    names.add(got.group(1))
        names |= {m.group(1) for m in re.finditer(r'^static\s+[^;{(=]*?\b([A-Za-z_]\w*)\s*(?:\(|=|\[|;)', s, re.M)}
        for n in names:
            local.setdefault(n, set()).add(name)
    for n, fs in sorted(local.items()):
        if len(fs) > 1:
            out.append('the file-local name %s is defined in %s: they collide when Unreal compiles those files as one' % (n, ' and '.join(sorted(fs))))
    return out, '%d member functions and %d member variables of %d classes, and %d file-local names, looked at' % (funcs, members, len(cls), len(local)), note


def self_test(src):
    tmp = tempfile.mkdtemp(prefix='sc_shadow_test_')
    try:
        for h in glob.glob(os.path.join(src, '*.h')):
            shutil.copy(h, tmp)
        open(os.path.join(tmp, 'PlantedA.cpp'), 'w').write('''#include "SCCharacter.h"
namespace { float Helper(float X) { return X; } }
void ASCCharacter::PlantedA(float Dt)
{
	USkeletalMeshComponent* Mesh = nullptr;      // hides ACharacter::Mesh
	const FVector Owner = FVector::ZeroVector;   // hides AActor::Owner
}
void ASCHUD::PlantedB(UCanvas* Canvas, int32 X) { }       // hides AHUD::Canvas
void USCPuppet::PlantedC() { FBoxSphereBounds Bounds; }   // hides USceneComponent::Bounds
''')
        open(os.path.join(tmp, 'PlantedB.cpp'), 'w').write('#include "SCNpc.h"\nnamespace { float Helper(float X) { return X * 2; } }\n')
        h = os.path.join(tmp, 'SCNpc.h'); t = open(h).read()
        t = re.sub(r'(class\s+(?:\w+_API\s+)?ASCNpc\s*:\s*public\s+\w+\s*\{)', r'\1\n\tTArray<FName> Tags;      // hides AActor::Tags\n', t, count=1); open(h, 'w').write(t)
        found, _, _ = scan(tmp)
        want = ['local Mesh', 'local Owner', 'parameter Canvas', 'local Bounds', 'member ASCNpc::Tags', 'file-local name Helper']
        missed = [w for w in want if not any(w in f for f in found)]
        return missed, found
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    src = args[0] if args else os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'SunsetCity', 'Source', 'SunsetCity'))
    missed, planted = self_test(src)
    if missed:
        print('FAIL the scan did not find the mistakes planted to test it: ' + ', '.join(missed)); sys.exit(2)
    if '--self-test' in sys.argv:
        print('ok   the scan finds all %d planted mistakes' % len(planted))
        for p in planted:
            print('     ' + p)
        sys.exit(0)
    found, looked, notes = scan(src)
    for f in found:
        print('FAIL ' + f)
    for n in notes:
        print('note ' + n)
    print(('%d names that would stop an Unreal build' % len(found)) if found else 'ok   no engine member is hidden and no file-local name is defined twice (%s; the scan found the %d mistakes planted to test it)' % (looked, len(planted)))
    sys.exit(1 if found else 0)
