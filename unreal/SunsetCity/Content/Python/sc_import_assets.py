"""Sunset City: import the web version's people and cars (run inside the Unreal Editor, after the first build; sc_setup.py runs it).

    py "<project folder>/Content/Python/sc_import_assets.py"

The files are made from the web version's own code by tools/unreal-import/run.mjs and kept in <repo>/unreal/Import (see unreal/Import/manifest.json):
    people/<key>.glb      a Rocketbox person (skinned) with the web version's movement as 14 clips   ->  /Game/SunsetCity/People/<key>/SK_<key>, A_<clip>
    cars/<car>_<part>.glb the Ferrari and the police cruiser: body, wheel_left, wheel_right         ->  /Game/SunsetCity/Cars/<car>/SM_<car>_<part>
    SC_Axes.glb           a 1 x 2 x 3 m box: the game reads from it how glTF's axes were turned          ->  /Game/SunsetCity/Imported/SM_SC_Axes
Each file is imported into an emptied folder of its own, and what it made is renamed to those names, which the game loads (SCPuppet.cpp, SCVehicle.cpp).
check() says what is missing; sc_oneclick_setup.py fails the set-up if anything is."""
import json
import os
import re

import unreal

project = unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir())
IMPORT = os.path.normpath(os.path.join(project, '..', 'Import'))
eal = unreal.EditorAssetLibrary


def say(msg):
    unreal.log('[SunsetCity] ' + msg)


def manifest():
    with open(os.path.join(IMPORT, 'manifest.json'), 'r') as f:
        return json.load(f)


def make_task(filename, dest):
    t = unreal.AssetImportTask()
    t.set_editor_property('filename', filename)
    t.set_editor_property('destination_path', dest)
    t.set_editor_property('automated', True)
    t.set_editor_property('replace_existing', True)
    t.set_editor_property('save', True)
    return t


def fresh(folder):
    if eal.does_directory_exist(folder):
        eal.delete_directory(folder)
    eal.make_directory(folder)


def import_into(filename, folder):
    """Import one file into an emptied folder; returns the asset paths now in it."""
    fresh(folder)
    task = make_task(filename, folder)
    unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
    made = list(task.get_editor_property('imported_object_paths') or [])
    found = list(eal.list_assets(folder, recursive=True, include_folder=False) or [])
    if not made and not found:
        unreal.log_error('[SunsetCity] nothing was imported from %s (see the lines above for why)' % filename)
    return found


def object_path(asset_path):
    """'/Game/A/B.B' or '/Game/A/B' -> '/Game/A/B' (what rename_asset takes)."""
    return asset_path.split('.')[0]


def rename(asset_path, folder, name):
    dest = folder + '/' + name
    src = object_path(asset_path)
    if src == dest:
        return True
    if eal.does_asset_exist(dest):
        eal.delete_asset(dest)
    ok = eal.rename_asset(src, dest)
    if not ok:
        unreal.log_error('[SunsetCity] could not rename %s to %s' % (src, dest))
    return ok


def import_person(key, clips):
    folder = '/Game/SunsetCity/People/' + key
    found = import_into(os.path.join(IMPORT, 'people', key + '.glb'), folder)
    mesh = None
    anims = {}
    for p in found:
        a = eal.load_asset(p)
        if isinstance(a, unreal.SkeletalMesh):
            mesh = p
        elif isinstance(a, unreal.AnimSequence):
            name = object_path(p).split('/')[-1]
            for c in clips:
                if re.search(r'(^|[_\W])SC_' + re.escape(c) + r'($|[_\W])', name):
                    anims[c] = p
    if mesh:
        rename(mesh, folder, 'SK_' + key)
    for c, p in anims.items():
        rename(p, folder, 'A_' + c)
    say('%s: %s, %d of %d clips' % (key, 'skeletal mesh' if mesh else 'NO SKELETAL MESH', len(anims), len(clips)))


def import_car(car):
    folder = '/Game/SunsetCity/Cars/' + car
    fresh(folder)
    for part in ('body', 'wheel_left', 'wheel_right'):
        sub = folder + '/' + part
        found = import_into(os.path.join(IMPORT, 'cars', '%s_%s.glb' % (car, part)), sub)
        meshes = [p for p in found if isinstance(eal.load_asset(p), unreal.StaticMesh)]
        if meshes:
            rename(meshes[0], folder, 'SM_%s_%s' % (car, part))
        say('%s %s: %s' % (car, part, 'static mesh' if meshes else 'NO STATIC MESH'))


def import_axes():
    folder = '/Game/SunsetCity/Imported'
    sub = folder + '/Axes'
    found = import_into(os.path.join(IMPORT, 'SC_Axes.glb'), sub)
    meshes = [p for p in found if isinstance(eal.load_asset(p), unreal.StaticMesh)]
    if meshes:
        rename(meshes[0], folder, 'SM_SC_Axes')
        a = eal.load_asset(folder + '/SM_SC_Axes')
        b = a.get_bounding_box() if a else None
        if b:
            say('the axes box came in as min %s, max %s' % (b.min, b.max))


def check():
    """What the game needs and is not there (a list of paths; empty when all is well)."""
    m = manifest()
    clips = [c['name'] for c in m['clips']]
    missing = []
    for key in sorted(m['people']):
        folder = '/Game/SunsetCity/People/' + key
        for name in ['SK_' + key] + ['A_' + c for c in clips]:
            if not eal.does_asset_exist(folder + '/' + name):
                missing.append(folder + '/' + name)
    for car in sorted(m['cars']):
        for part in ('body', 'wheel_left', 'wheel_right'):
            p = '/Game/SunsetCity/Cars/%s/SM_%s_%s' % (car, car, part)
            if not eal.does_asset_exist(p):
                missing.append(p)
    if not eal.does_asset_exist('/Game/SunsetCity/Imported/SM_SC_Axes'):
        missing.append('/Game/SunsetCity/Imported/SM_SC_Axes')
    return missing


def main():
    if not os.path.isdir(IMPORT):
        unreal.log_error('[SunsetCity] %s is not there: the project should be <repo>/unreal/SunsetCity, with the files in <repo>/unreal/Import.' % IMPORT)
        return
    m = manifest()
    clips = [c['name'] for c in m['clips']]
    for old in ('/Game/SunsetCity/Imported/People', '/Game/SunsetCity/Imported/Ferrari'):        # (what an earlier version of this script imported)
        if eal.does_directory_exist(old):
            eal.delete_directory(old)
    import_axes()
    for key in sorted(m['people']):
        import_person(key, clips)
    for car in sorted(m['cars']):
        import_car(car)
    missing = check()
    say('imported %d people and %d cars; %s' % (len(m['people']), len(m['cars']), ('%d things missing: %s' % (len(missing), ', '.join(missing[:12]))) if missing else 'nothing missing'))


if __name__ == '__main__':
    main()
