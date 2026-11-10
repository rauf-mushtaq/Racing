using UnrealBuildTool;
using System.Collections.Generic;

public class SunsetCityEditorTarget : TargetRules
{
	public SunsetCityEditorTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Editor;
		DefaultBuildSettings = BuildSettingsVersion.Latest;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
		ExtraModuleNames.Add("SunsetCity");
	}
}
