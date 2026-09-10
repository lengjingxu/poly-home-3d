#!/usr/bin/env bash
# 构建 3D 卡片与模型，产物落进 dist/（HACS 从 dist/ 取文件）。
set -eo pipefail
cd "$(dirname "$0")"

[ -d node_modules ] || npm ci

python3 model/build_model.py
./node_modules/.bin/esbuild src/index.js --bundle --format=esm --minify \
  --loader:.css=text --outfile=dist/poly-home-3d.js

python3 - <<'PY'
import json, pathlib
cfg = json.loads(pathlib.Path("config/floorplan.json").read_text())
cfg["model"] = "poly-home.glb"
pathlib.Path("dist/floorplan.json").write_text(
    json.dumps(cfg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("dist/floorplan.json")
PY
cp model/poly-home.glb dist/poly-home.glb
ls -la dist/
