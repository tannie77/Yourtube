"""Install the offline comment translation pairs used by YourTube."""

import os
from pathlib import Path

local_data = Path(__file__).resolve().parents[1] / ".local-data"
os.environ["XDG_DATA_HOME"] = str(local_data / "translate-data")
os.environ["XDG_CONFIG_HOME"] = str(local_data / "translate-config")
os.environ["XDG_CACHE_HOME"] = str(local_data / "translate-cache")

import argostranslate.package


PAIRS = [("en", code) for code in ("hi", "es", "fr", "ur")] + [(code, "en") for code in ("hi", "es", "fr", "ur")]

argostranslate.package.update_package_index()
available = argostranslate.package.get_available_packages()
installed = {(item.from_code, item.to_code) for item in argostranslate.package.get_installed_packages()}

for source, target in PAIRS:
    if (source, target) in installed:
        print(f"Already installed: {source} -> {target}", flush=True)
        continue
    package = next((item for item in available if item.from_code == source and item.to_code == target), None)
    if package is None:
        raise SystemExit(f"Model unavailable: {source} -> {target}")
    print(f"Installing {source} -> {target}...", flush=True)
    argostranslate.package.install_from_path(package.download())
    print(f"Installed {source} -> {target}", flush=True)
