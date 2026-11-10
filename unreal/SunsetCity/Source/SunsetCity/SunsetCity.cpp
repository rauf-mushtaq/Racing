// The module: registers Sunset City with the engine, and the log category the rest of the code writes to.
#include "Modules/ModuleManager.h"
#include "SCUtil.h"

DEFINE_LOG_CATEGORY(LogSunset);

IMPLEMENT_PRIMARY_GAME_MODULE(FDefaultGameModuleImpl, SunsetCity, "SunsetCity");
