#!/usr/bin/env bash
set -euo pipefail

server_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
local_dir="$server_dir/.local-data"
translator="$local_dir/translate-venv/bin/libretranslate"

if [[ ! -x "$translator" ]]; then
  echo "Local LibreTranslate is not installed. See the Build 4C setup in README.md." >&2
  exit 1
fi

export XDG_DATA_HOME="$local_dir/translate-data"
export XDG_CONFIG_HOME="$local_dir/translate-config"
export XDG_CACHE_HOME="$local_dir/translate-cache"

exec "$translator" --host 127.0.0.1 --port 5001 --load-only en,hi,es --disable-web-ui --threads 2
