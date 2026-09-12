#!/usr/bin/env bash
# 构建 3D 卡片与模型，产物落进 dist/（HACS 从 dist/ 取文件）。
set -eo pipefail
cd "$(dirname "$0")"

[ -d node_modules ] || npm ci

python3 model/build_model.py
./node_modules/.bin/esbuild src/index.js --bundle --format=esm --minify \
  --loader:.css=text --outfile=dist/poly-home-3d.js

python3 - <<'PY'
import hashlib
import json
import pathlib

cfg = json.loads(pathlib.Path("config/floorplan.json").read_text())
model = pathlib.Path("model/poly-home.glb")
version = hashlib.sha1(model.read_bytes()).hexdigest()[:10]
cfg["model"] = "poly-home.glb?v=" + version
pathlib.Path("dist/floorplan.json").write_text(
    json.dumps(cfg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("dist/floorplan.json")
PY
cp model/poly-home.glb dist/poly-home.glb
ls -la dist/
