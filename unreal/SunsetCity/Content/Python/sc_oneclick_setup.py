"""Sunset City: the set-up step of the one-click Windows script (unreal/tools/SunsetCity.ps1).

The script starts the editor with no window (UnrealEditor-Cmd.exe <project> -ExecutePythonScript=<this file>, or failing that
-run=pythonscript -script=<this file>), which closes again by itself when this has run. This runs sc_setup.py (the map, the
materials, the models), checks that the map the game starts on is there, saves anything left unsaved, and writes how it went to the
file named by the SC_SETUP_RESULT environment variable: a first line "OK" and a summary, or "FAILED" and why. The script reads it."""
import os
import traceback

import unreal

here = os.path.dirname(os.path.abspath(__file__))
MAP = '/Game/SunsetCity/Maps/Main'


def result_path():
    p = os.environ.get('SC_SETUP_RESULT')
    if p:
        return p
    return os.path.join(here, '..', '..', 'Saved', 'SunsetCity_setup_result.txt')


def write_result(text):
    path = result_path()
    try:
        folder = os.path.dirname(path)
        if folder and not os.path.isdir(folder):
            os.makedirs(folder)
        with open(path, 'w') as f:
            f.write(text)
    except Exception as e:  # noqa: BLE001
        unreal.log_error('[SunsetCity] could not write the set-up result to %s: %s' % (path, e))


def run_setup():
    path = os.path.join(here, 'sc_setup.py')
    with open(path, 'r') as f:
        code = compile(f.read(), path, 'exec')
    exec(code, {'__name__': '__main__', '__file__': path})


def main():
    unreal.log('[SunsetCity] one-click set-up starting')
    try:
        run_setup()
        eal = unreal.EditorAssetLibrary
        if not eal.does_asset_exist(MAP):
            raise RuntimeError('the map %s was not made (look for the [SunsetCity] lines above for why)' % MAP)
        try:
            unreal.EditorLoadingAndSavingUtils.save_dirty_packages(True, True)
        except Exception as e:  # noqa: BLE001
            unreal.log_warning('[SunsetCity] could not save everything at the end: %s' % e)
        made = eal.list_assets('/Game/SunsetCity', recursive=True, include_folder=False) or []
        write_result('OK\n%d assets in /Game/SunsetCity\n' % len(made))
        unreal.log('[SunsetCity] one-click set-up finished: %d assets in /Game/SunsetCity' % len(made))
    except Exception:  # noqa: BLE001
        text = traceback.format_exc()
        unreal.log_error('[SunsetCity] one-click set-up FAILED:\n' + text)
        write_result('FAILED\n' + text)


main()
