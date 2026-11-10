using UnrealBuildTool;
using System.Collections.Generic;

public class SunsetCityTarget : TargetRules
{
	public SunsetCityTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Game;
		DefaultBuildSettings = BuildSettingsVersion.Latest;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
		ExtraModuleNames.Add("SunsetCity");
	}
}
