"""Sunset City: bring the web version's models into the project (run once, inside the Unreal Editor).

    py "<project folder>/Content/Python/sc_import_assets.py"

Imports, from <repo>/assets:   cars/ferrari.glb  ->  /Game/SunsetCity/Imported/Ferrari
                               people/*.glb      ->  /Game/SunsetCity/Imported/People   (the Rocketbox people: pedestrians, officers; skeletal meshes)
and turns Nanite on for the static meshes it makes. To drive the Ferrari instead of the built-in car, put its path in Config/DefaultGame.ini (HeroCarMeshPath).

Notes: the Ferrari file is Draco-compressed; Unreal reads that if its glTF importer supports Draco (recent versions do). If it does not, decompress it first
(Blender: import and re-export as .glb; or `gltf-transform` / `gltf-pipeline`) and point DEFAULT_CAR below at the plain file. The people are not compressed."""
import os
import unreal

project = unreal.Paths.project_dir()
assets = os.path.normpath(os.path.join(project, '..', '..', 'assets'))
DEFAULT_CAR = os.path.join(assets, 'cars', 'ferrari.glb')
PEOPLE_DIR = os.path.join(assets, 'people')


def say(msg):
    unreal.log('[SunsetCity] ' + msg)


def make_task(filename, dest):
    t = unreal.AssetImportTask()
    t.set_editor_property('filename', filename)
    t.set_editor_property('destination_path', dest)
    t.set_editor_property('automated', True)
    t.set_editor_property('replace_existing', True)
    t.set_editor_property('save', True)
    return t


def main():
    tasks = []
    if os.path.exists(DEFAULT_CAR):
        tasks.append(make_task(DEFAULT_CAR, '/Game/SunsetCity/Imported/Ferrari'))
    else:
        unreal.log_warning('[SunsetCity] %s not found (the project lives in <repo>/unreal/SunsetCity, the models in <repo>/assets).' % DEFAULT_CAR)
    if os.path.isdir(PEOPLE_DIR):
        for f in sorted(os.listdir(PEOPLE_DIR)):
            if f.lower().endswith('.glb'):
                tasks.append(make_task(os.path.join(PEOPLE_DIR, f), '/Game/SunsetCity/Imported/People'))
    if not tasks:
        return
    unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks(tasks)
    ok = 0
    for t in tasks:
        paths = list(t.get_editor_property('imported_object_paths') or [])
        ok += 1 if paths else 0
        say('%s -> %s' % (os.path.basename(t.get_editor_property('filename')), paths if paths else 'NOTHING IMPORTED (see the Output Log above for why)'))
    say('%d of %d files imported.' % (ok, len(tasks)))
    # Nanite for the static meshes (virtualized geometry: the Ferrari's millions of triangles cost nothing extra).
    try:
        sub = unreal.get_editor_subsystem(unreal.StaticMeshEditorSubsystem)
        for p in unreal.EditorAssetLibrary.list_assets('/Game/SunsetCity/Imported', recursive=True, include_folder=False):
            a = unreal.EditorAssetLibrary.load_asset(p)
            if isinstance(a, unreal.StaticMesh):
                s = sub.get_nanite_settings(a)
                s.enabled = True
                sub.set_nanite_settings(a, s, True)
                say('Nanite on: ' + p)
    except Exception as e:  # noqa: BLE001
        unreal.log_warning('[SunsetCity] could not switch Nanite on from script (%s); open each static mesh and tick Enable Nanite.' % e)


main()
