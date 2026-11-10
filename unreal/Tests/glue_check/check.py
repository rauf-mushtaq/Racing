#!/usr/bin/env python3
"""Syntax-check the Unreal-facing code (Source/SunsetCity/SC*.cpp) without Unreal.

It copies the module's sources to a temporary folder, gives every UCLASS the `Super` and `StaticClass` that GENERATED_BODY() would, replaces every engine header with
ue_stub.h (a small stand-in for the parts of Unreal's API that the code uses) and runs `g++ -fsyntax-only` on each .cpp, as C++20 (what Unreal 5.5 builds game code as) and
with a variable that hides another counted as an error (as Unreal's default build settings do). That catches typos, undeclared names, wrong argument counts and type mismatches
in OUR code. Then shadow_scan.py looks for names that hide a member of the real engine classes (which the stub does not have) and for file-local helpers that would collide when
Unreal compiles several files as one. None of this can tell whether Unreal's real headers declare things as the stub does, so a pass here is not a pass in Unreal.
Usage: python3 check.py        (needs python3 and g++)"""
import os, re, shutil, subprocess, sys, tempfile

here = os.path.dirname(os.path.abspath(__file__))
src = os.path.normpath(os.path.join(here, '..', '..', 'SunsetCity', 'Source', 'SunsetCity'))
out = tempfile.mkdtemp(prefix='sc_glue_check_')
inc = os.path.join(out, 'inc')
shutil.copytree(src, os.path.join(out, 'src'))
os.makedirs(inc)
shutil.copy(os.path.join(here, 'ue_stub.h'), os.path.join(inc, 'ue_stub.h'))
includes = set()
for root, _, files in os.walk(os.path.join(out, 'src')):
    for f in files:
        if not (f.endswith('.h') or f.endswith('.cpp')):
            continue
        p = os.path.join(root, f)
        t = open(p).read()
        if f.endswith('.h') and 'GENERATED_BODY' in t:
            parts = re.split(r'(GENERATED_BODY\(\))', t)
            res = ''
            for i, part in enumerate(parts):
                if part == 'GENERATED_BODY()':
                    prev = ''.join(parts[:i])
                    cm = list(re.finditer(r'class\s+(?:\w+_API\s+)?(\w+)\s*:\s*public\s+(\w+)', prev))[-1]
                    res += 'public: typedef %s Super; static UClass* StaticClass() { return nullptr; }' % cm.group(2)
                else:
                    res += part
            t = res
        t = re.sub(r'#include "[A-Za-z]+\.generated\.h"\n', '', t)
        open(p, 'w').write(t)
        for m in re.finditer(r'#include\s+"([^"]+)"', t):
            includes.add(m.group(1))
for i in includes:
    if os.path.exists(os.path.join(out, 'src', i)):
        continue
    path = os.path.join(inc, i)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, 'w').write('#include "ue_stub.h"\n')
open(os.path.join(inc, 'CoreMinimal.h'), 'w').write('#include "ue_stub.h"\n')
fail = 0
for f in sorted(os.listdir(os.path.join(out, 'src'))):
    if not f.endswith('.cpp'):
        continue
    cmd = ['g++', '-std=c++20', '-fsyntax-only', '-Wall', '-Wextra', '-Wshadow', '-Werror=shadow', '-Wno-unused-parameter', '-I', inc, '-I', os.path.join(out, 'src'), '-include', os.path.join(inc, 'ue_stub.h'), os.path.join(out, 'src', f)]
    r = subprocess.run(cmd, capture_output=True, text=True, cwd=out)
    print(('FAIL ' if r.returncode else 'ok   ') + f)
    for l in r.stderr.splitlines()[:40]:
        if 'error' in l or 'warning' in l or 'note' in l:
            print('    ' + l.replace(os.path.join(out, 'src') + os.sep, ''))
    fail += r.returncode != 0
shutil.rmtree(out, ignore_errors=True)
print('files that failed:', fail)
scan = subprocess.run([sys.executable, os.path.join(here, 'shadow_scan.py'), src], capture_output=True, text=True)
print((scan.stdout + scan.stderr).strip())
sys.exit(1 if fail or scan.returncode else 0)
