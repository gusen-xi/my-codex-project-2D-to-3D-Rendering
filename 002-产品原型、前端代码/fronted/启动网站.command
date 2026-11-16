#!/bin/zsh
cd "${0:A:h}"
prototype_python="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3"
if [[ ! -x "$prototype_python" ]]; then
  prototype_python="$(command -v python3)"
fi
"$prototype_python" scripts/launch.py
