using UnrealBuildTool;

public class SunsetCity : ModuleRules
{
	public SunsetCity(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core", "CoreUObject", "Engine", "InputCore", "ProceduralMeshComponent"
		});

		// The engine-independent code in Core/ is plain C++17 with the standard library; Unreal's own build turns off exceptions and RTTI, which it does not need.
		bEnableExceptions = false;
	}
}
