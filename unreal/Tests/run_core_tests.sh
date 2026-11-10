#!/usr/bin/env bash
# Build and run the tests of the engine-independent core (needs g++ or clang++; no Unreal). Usage: unreal/Tests/run_core_tests.sh
set -euo pipefail
cd "$(dirname "$0")"
CXX="${CXX:-g++}"
"$CXX" -std=c++17 -O1 -Wall -Wextra -Wshadow -o core_tests core_tests.cpp
./core_tests
