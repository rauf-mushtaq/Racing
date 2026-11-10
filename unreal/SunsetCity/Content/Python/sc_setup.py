"""Sunset City: one-click setup (run once, inside the Unreal Editor, after the first build).

    py "<project folder>/Content/Python/sc_setup.py"

Makes the empty map /Game/SunsetCity/Maps/Main (the game builds the city, the sky and the people itself, so the map needs nothing in it), builds the materials and imports the models."""
import os
import unreal

here = os.path.dirname(os.path.abspath(__file__))


def run(name):
    path = os.path.join(here, name)
    unreal.log('[SunsetCity] running ' + name)
    with open(path, 'r') as f:
        code = compile(f.read(), path, 'exec')
    exec(code, {'__name__': '__main__', '__file__': path})


def main():
    eal = unreal.EditorAssetLibrary
    if not eal.does_asset_exist('/Game/SunsetCity/Maps/Main'):
        if not eal.does_directory_exist('/Game/SunsetCity/Maps'):
            eal.make_directory('/Game/SunsetCity/Maps')
        try:
            unreal.EditorLevelLibrary.new_level('/Game/SunsetCity/Maps/Main')
            unreal.EditorLevelLibrary.save_current_level()
            unreal.log('[SunsetCity] made the map /Game/SunsetCity/Maps/Main')
        except Exception as e:  # noqa: BLE001
            unreal.log_warning('[SunsetCity] could not make the map (%s): use File > New Level > Empty Level, save it as Content/SunsetCity/Maps/Main.' % e)
    run('sc_build_materials.py')
    run('sc_import_assets.py')
    unreal.log('[SunsetCity] setup finished: press Play (the viewport must be focused for the mouse and keys).')


main()
