#!/usr/bin/env python3
"""程序化生成保利智家 3D 中控用的公寓模型（.glb）。

坐标：右手系，Y 向上，单位米。X 向东，Z 向南。
墙做 1.2 m 剖切（dollhouse），方便从上往下看进房间。
整体坐在一块深色底座上，像摆在桌上的建筑模型。
"""
from __future__ import annotations

import json
import math
import struct
from pathlib import Path

WALL_H = 1.20
WALL_T = 0.12
FLOOR_T = 0.12
PLINTH_T = 0.20
BAND_H = 0.02

MATERIALS = {
    "floor_wood":  {"color": (0.62, 0.44, 0.28), "rough": 0.58, "metal": 0.0},
    "floor_tile":  {"color": (0.78, 0.76, 0.72), "rough": 0.35, "metal": 0.0},
    "floor_rug":   {"color": (0.52, 0.40, 0.31), "rough": 0.95, "metal": 0.0},
    "wall":        {"color": (0.88, 0.86, 0.82), "rough": 0.92, "metal": 0.0},
    "wall_cap":    {"color": (0.96, 0.94, 0.91), "rough": 0.85, "metal": 0.0},
    "plinth":      {"color": (0.10, 0.10, 0.11), "rough": 0.55, "metal": 0.2},
    "wood_dark":   {"color": (0.35, 0.23, 0.15), "rough": 0.55, "metal": 0.0},
    "wood_light":  {"color": (0.62, 0.44, 0.27), "rough": 0.50, "metal": 0.0},
    "fabric":      {"color": (0.62, 0.58, 0.53), "rough": 0.98, "metal": 0.0},
    "fabric_dark": {"color": (0.40, 0.37, 0.35), "rough": 0.98, "metal": 0.0},
    "duvet":       {"color": (0.90, 0.87, 0.82), "rough": 0.98, "metal": 0.0},
    "stone":       {"color": (0.72, 0.71, 0.68), "rough": 0.25, "metal": 0.0},
    "white":       {"color": (0.90, 0.90, 0.88), "rough": 0.30, "metal": 0.1},
    "metal":       {"color": (0.60, 0.62, 0.65), "rough": 0.28, "metal": 0.9},
    "metal_dark":  {"color": (0.16, 0.16, 0.18), "rough": 0.40, "metal": 0.7},
    "glass":       {"color": (0.42, 0.52, 0.62), "rough": 0.06, "metal": 0.0},
    "screen":      {"color": (0.06, 0.06, 0.08), "rough": 0.15, "metal": 0.3},
    "plant":       {"color": (0.24, 0.38, 0.24), "rough": 0.88, "metal": 0.0},
    "ceramic":     {"color": (0.85, 0.80, 0.72), "rough": 0.35, "metal": 0.0},
    "art":         {"color": (0.72, 0.45, 0.28), "rough": 0.75, "metal": 0.0},
}


class Group:
    """一个材质对应的一批三角形。"""

    def __init__(self) -> None:
        self.pos: list[float] = []
        self.nrm: list[float] = []
        self.idx: list[int] = []

    def add_quad(self, verts, normal) -> None:
        base = len(self.pos) // 3
        for v in verts:
            self.pos.extend(v)
            self.nrm.extend(normal)
        self.idx.extend([base, base + 1, base + 2, base, base + 2, base + 3])

    def add_box(self, cx, cy, cz, sx, sy, sz, rot_y=0.0) -> None:
        hx, hy, hz = sx / 2, sy / 2, sz / 2
        corners = [
            (-hx, -hy, -hz), (hx, -hy, -hz), (hx, hy, -hz), (-hx, hy, -hz),
            (-hx, -hy, hz), (hx, -hy, hz), (hx, hy, hz), (-hx, hy, hz),
        ]
        ca, sa = math.cos(rot_y), math.sin(rot_y)

        def place(p):
            x, y, z = p
            return (cx + x * ca + z * sa, cy + y, cz - x * sa + z * ca)

        v = [place(p) for p in corners]
        faces = [
            ((4, 5, 6, 7), (sa, 0, ca)),
            ((1, 0, 3, 2), (-sa, 0, -ca)),
            ((5, 1, 2, 6), (ca, 0, -sa)),
            ((0, 4, 7, 3), (-ca, 0, sa)),
            ((3, 7, 6, 2), (0, 1, 0)),
            ((0, 1, 5, 4), (0, -1, 0)),
        ]
        for idx, normal in faces:
            self.add_quad([v[i] for i in idx], normal)

    def add_cyl(self, cx, cy, cz, r, h, seg=14, cap=True) -> None:
        y0, y1 = cy - h / 2, cy + h / 2
        for i in range(seg):
            a0 = 2 * math.pi * i / seg
            a1 = 2 * math.pi * (i + 1) / seg
            x0, z0 = cx + r * math.cos(a0), cz + r * math.sin(a0)
            x1, z1 = cx + r * math.cos(a1), cz + r * math.sin(a1)
            self.add_quad(
                [(x0, y0, z0), (x1, y0, z1), (x1, y1, z1), (x0, y1, z0)],
                ((math.cos(a0) + math.cos(a1)) / 2, 0.0, (math.sin(a0) + math.sin(a1)) / 2),
            )
            if cap:
                self.add_quad(
                    [(cx, y1, cz), (x1, y1, z1), (x0, y1, z0), (cx, y1, cz)],
                    (0.0, 1.0, 0.0),
                )


class Model:
    def __init__(self) -> None:
        self.groups: dict[str, Group] = {}

    def g(self, material: str) -> Group:
        return self.groups.setdefault(material, Group())

    def box(self, material, cx, cy, cz, sx, sy, sz, rot_y=0.0) -> None:
        self.g(material).add_box(cx, cy, cz, sx, sy, sz, rot_y)

    def cyl(self, material, cx, cy, cz, r, h, seg=14) -> None:
        self.g(material).add_cyl(cx, cy, cz, r, h, seg)

    def slab(self, material, x0, z0, x1, z1, y0=0.0, thickness=FLOOR_T) -> None:
        self.box(material, (x0 + x1) / 2, y0 - thickness / 2, (z0 + z1) / 2,
                 x1 - x0, thickness, z1 - z0)

    def wall_run(self, material, axis, fixed, start, end, gaps, height=WALL_H) -> None:
        """axis='x' 表示墙沿 X 方向延伸（fixed 是 z），反之亦然。"""
        segments = []
        cursor = start
        for g0, g1 in sorted(gaps):
            if g0 > cursor:
                segments.append((cursor, g0))
            cursor = max(cursor, g1)
        if cursor < end:
            segments.append((cursor, end))
        for a, b in segments:
            if b - a < 0.01:
                continue
            length, mid = b - a, (a + b) / 2
            if axis == "x":
                self.box(material, mid, height / 2, fixed, length, height, WALL_T)
                self.box("wall_cap", mid, height + BAND_H / 2, fixed, length, BAND_H, WALL_T)
            else:
                self.box(material, fixed, height / 2, mid, WALL_T, height, length)
                self.box("wall_cap", fixed, height + BAND_H / 2, mid, WALL_T, BAND_H, length)


ROOMS = {
    "次卧二": (0.00, 0.00, 2.70, 3.20),
    "次卧一": (2.70, 0.00, 7.10, 2.30),
    "北次卧": (7.10, 0.00, 11.06, 2.30),
    "走廊":   (0.00, 3.20, 2.70, 6.30),
    "餐厅":   (2.70, 2.30, 7.10, 4.70),
    "厨房":   (7.10, 2.30, 11.06, 4.70),
    "客厅":   (2.70, 4.70, 7.10, 8.06),
    "玄关":   (0.00, 6.30, 2.70, 8.06),
    "主卧":   (7.10, 4.70, 11.06, 8.06),
}

# 外墙上开窗：墙 -> [(起, 止)]
WINDOWS = {
    ("z", -0.06): [(3.55, 5.25), (8.05, 10.15)],
    ("z", 8.06): [(0.55, 1.25), (3.35, 6.45), (8.10, 10.20)],
    ("x", -0.06): [(0.85, 2.25)],
    ("x", 11.06): [(2.95, 4.05), (5.60, 7.20)],
}
WINDOW_SILL = 0.34
WINDOW_HEAD = 1.02


def build_floors(m: Model) -> None:
    tile = {"厨房"}
    for name, (x0, z0, x1, z1) in ROOMS.items():
        m.slab("floor_tile" if name in tile else "floor_wood", x0, z0, x1, z1)
    m.slab("plinth", -0.26, -0.26, 11.26, 8.26, y0=-FLOOR_T, thickness=PLINTH_T)


def build_walls(m: Model) -> None:
    def gaps(axis, fixed):
        return WINDOWS.get((axis, fixed), [])

    m.wall_run("wall", "x", -0.06, -0.06, 11.06, gaps("x", -0.06))
    m.wall_run("wall", "x", 8.06, -0.06, 11.06, [(1.00, 2.05)] + gaps("x", 8.06))
    m.wall_run("wall", "z", -0.06, -0.06, 8.06, gaps("z", -0.06))
    m.wall_run("wall", "z", 11.06, -0.06, 8.06, gaps("z", 11.06))

    m.wall_run("wall", "x", 3.20, 0.00, 2.60, [(0.95, 1.85)])
    m.wall_run("wall", "x", 2.30, 2.80, 11.00, [(4.10, 5.00), (9.10, 10.00)])
    m.wall_run("wall", "x", 4.70, 7.20, 11.00, [])
    m.wall_run("wall", "z", 2.70, -0.06, 2.30, [])
    m.wall_run("wall", "z", 2.70, 3.30, 8.06, [(4.80, 5.80)])
    m.wall_run("wall", "z", 7.10, -0.06, 2.30, [])
    m.wall_run("wall", "z", 7.10, 2.40, 8.06, [(3.00, 3.90), (6.30, 7.20)])


def build_windows(m: Model) -> None:
    """把外墙洞口补上玻璃和窗框。"""
    frame_t = 0.05
    for (axis, fixed), spans in WINDOWS.items():
        for a, b in spans:
            mid = (a + b) / 2
            length = b - a
            h = WINDOW_HEAD - WINDOW_SILL
            cy = WINDOW_SILL + h / 2
            if axis == "x":
                m.box("glass", mid, cy, fixed, length - 0.04, h - 0.04, 0.03)
                m.box("metal_dark", mid, WINDOW_SILL - frame_t / 2, fixed, length, frame_t, 0.16)
                m.box("metal_dark", mid, WINDOW_HEAD + frame_t / 2, fixed, length, frame_t, 0.16)
                for x in (a, mid, b):
                    m.box("metal_dark", x, cy, fixed, frame_t, h, 0.16)
            else:
                m.box("glass", fixed, cy, mid, 0.03, h - 0.04, length - 0.04)
                m.box("metal_dark", fixed, WINDOW_SILL - frame_t / 2, mid, 0.16, frame_t, length)
                m.box("metal_dark", fixed, WINDOW_HEAD + frame_t / 2, mid, 0.16, frame_t, length)
                for z in (a, mid, b):
                    m.box("metal_dark", fixed, cy, z, 0.16, h, frame_t)


def build_door_frames(m: Model) -> None:
    """门洞两侧的竖向门套。"""
    jambs = [
        ("x", 3.20, 0.95), ("x", 3.20, 1.85),
        ("x", 2.30, 4.10), ("x", 2.30, 5.00), ("x", 2.30, 9.10), ("x", 2.30, 10.00),
        ("z", 2.70, 4.80), ("z", 2.70, 5.80),
        ("z", 7.10, 3.00), ("z", 7.10, 3.90), ("z", 7.10, 6.30), ("z", 7.10, 7.20),
        ("x", 8.06, 1.00), ("x", 8.06, 2.05),
    ]
    for axis, fixed, at in jambs:
        if axis == "x":
            m.box("wood_light", at, WALL_H / 2, fixed, 0.07, WALL_H, WALL_T + 0.02)
        else:
            m.box("wood_light", fixed, WALL_H / 2, at, WALL_T + 0.02, WALL_H, 0.07)


def build_doors(m: Model) -> None:
    """开着的门扇，给剖切模型一点生活感。"""
    leaves = [
        (1.02, 8.00, 0.95, -0.62),
        (2.70, 5.10, 1.00, 1.15),
        (7.10, 3.40, 0.90, -1.25),
        (7.10, 6.60, 1.00, 1.20),
        (3.20, 1.40, 0.90, -1.05),
        (9.55, 2.30, 0.90, 0.55),
    ]
    for x, z, width, angle in leaves:
        m.box("wood_light", x, WALL_H / 2 - 0.02, z, width, WALL_H - 0.06, 0.04, rot_y=angle)


def bed(m: Model, x, z, w, l, rot=0.0) -> None:
    """床：床架 + 床垫 + 被子 + 两只枕头 + 床头板。"""
    m.box("wood_light", x, 0.13, z, w, 0.26, l, rot)
    m.box("duvet", x, 0.36, z, w - 0.08, 0.20, l - 0.10, rot)
    m.box("fabric_dark", x, 0.50, z + l / 2 - 0.32, w - 0.06, 0.12, 0.62, rot)
    head = -l / 2 + 0.03
    ca, sa = math.cos(rot), math.sin(rot)
    for dx in (-w / 4, w / 4):
        px = x + dx * ca + head * sa
        pz = z - dx * sa + head * ca
        m.box("white", px, 0.52, pz, w / 2 - 0.14, 0.14, 0.34, rot)
    hx = x + (head - 0.03) * sa
    hz = z + (head - 0.03) * ca
    m.box("wood_dark", hx, 0.46, hz, w + 0.04, 0.92, 0.06, rot)


def sofa(m: Model, x, z, w, d=0.92) -> None:
    m.box("fabric", x, 0.20, z, w, 0.34, d)
    m.box("fabric_dark", x, 0.52, z + d / 2 - 0.10, w, 0.40, 0.20)
    for side in (-1, 1):
        m.box("fabric_dark", x + side * (w / 2 - 0.10), 0.38, z, 0.20, 0.36, d)
    for i in (-1, 0, 1):
        m.box("duvet", x + i * w / 3.4, 0.40, z - 0.06, w / 3.8, 0.10, d - 0.32)


def table(m: Model, x, z, w, d, h=0.40, top="wood_light", leg="wood_dark") -> None:
    m.box(top, x, h, z, w, 0.05, d)
    for sx in (-1, 1):
        for sz in (-1, 1):
            m.box(leg, x + sx * (w / 2 - 0.08), h / 2, z + sz * (d / 2 - 0.08), 0.06, h, 0.06)


def chair(m: Model, x, z, rot=0.0) -> None:
    m.box("fabric", x, 0.22, z, 0.42, 0.08, 0.42, rot)
    ca, sa = math.cos(rot), math.sin(rot)
    bx = x + 0.18 * sa
    bz = z + 0.18 * ca
    m.box("fabric_dark", bx, 0.38, bz, 0.42, 0.42, 0.06, rot)
    for sx in (-1, 1):
        for sz in (-1, 1):
            m.box("wood_dark", x + sx * 0.17, 0.09, z + sz * 0.17, 0.04, 0.18, 0.04, rot)


def plant(m: Model, x, z, h=0.46, r=0.30) -> None:
    m.cyl("ceramic", x, 0.10, z, 0.15, 0.20, 12)
    m.box("plant", x, 0.20 + h / 2, z, r, h, r * 0.9)
    m.box("plant", x, 0.28 + h, z, r * 0.6, h * 0.6, r * 0.55)


def rug(m: Model, x0, z0, x1, z1) -> None:
    m.slab("floor_rug", x0, z0, x1, z1, y0=0.012, thickness=0.012)


def wardrobe(m: Model, x, z, w, d, h=1.05) -> None:
    m.box("wood_dark", x, h / 2, z, w, h, d)
    m.box("wood_light", x, h / 2, z + d / 2 + 0.01, w - 0.06, h - 0.08, 0.02)
    m.box("metal", x, h * 0.55, z + d / 2 + 0.03, w - 0.06, 0.02, 0.03)


def counter(m: Model, x0, z0, x1, z1, h=0.86) -> None:
    m.box("white", (x0 + x1) / 2, h / 2 - 0.02, (z0 + z1) / 2, x1 - x0, h - 0.04, z1 - z0)
    m.box("stone", (x0 + x1) / 2, h, (z0 + z1) / 2, x1 - x0 + 0.03, 0.05, z1 - z0 + 0.03)


def furniture(m: Model) -> None:

    # 客厅
    rug(m, 3.50, 5.10, 6.70, 7.30)
    sofa(m, 4.60, 7.20, 2.40)
    table(m, 4.60, 6.10, 1.10, 0.62, 0.36)
    m.box("ceramic", 4.60, 0.43, 6.10, 0.22, 0.09, 0.22)
    m.box("wood_dark", 4.60, 0.24, 4.90, 1.90, 0.36, 0.42)
    m.box("screen", 4.60, 0.80, 4.72, 1.48, 0.84, 0.05)
    m.box("metal_dark", 4.60, 0.42, 4.72, 0.30, 0.10, 0.16)
    plant(m, 6.55, 7.55, 0.42)
    m.cyl("wood_light", 6.55, 0.26, 5.20, 0.24, 0.52, 14)
    m.cyl("ceramic", 6.55, 0.55, 5.20, 0.16, 0.06, 14)
    m.box("art", 4.10, 0.80, 2.36, 0.76, 0.56, 0.03)

    # 餐厅
    table(m, 4.90, 3.40, 1.60, 0.92, 0.40)
    for dx in (-0.56, 0.56):
        chair(m, 4.90 + dx, 2.78)
        chair(m, 4.90 + dx, 4.02, math.pi)
    m.box("wood_dark", 3.20, 0.30, 3.40, 0.36, 0.60, 1.20)
    m.cyl("ceramic", 4.90, 0.48, 3.40, 0.14, 0.10, 14)

    # 厨房
    counter(m, 7.32, 2.52, 8.70, 3.08)
    counter(m, 7.32, 3.08, 7.88, 4.48)
    counter(m, 9.70, 2.52, 10.88, 3.08)
    m.box("metal", 8.20, 0.90, 2.80, 0.56, 0.04, 0.42)
    m.box("metal_dark", 9.20, 0.92, 2.80, 0.62, 0.05, 0.44)
    m.box("white", 10.42, 0.88, 4.05, 0.68, 1.76, 0.72)
    m.box("metal", 10.42, 0.92, 4.05, 0.02, 1.60, 0.70)
    m.box("white", 7.45, 0.52, 3.90, 0.30, 0.80, 0.80)

    # 玄关
    m.box("wood_dark", 0.90, 0.50, 7.72, 1.60, 1.00, 0.38)
    m.box("wood_light", 0.90, 1.02, 7.72, 1.64, 0.04, 0.42)
    m.box("fabric", 2.20, 0.24, 6.85, 0.48, 0.44, 1.10)
    m.box("art", 1.90, 0.78, 8.02, 0.60, 0.44, 0.03)

    # 走廊
    m.box("wood_light", 0.70, 0.40, 4.60, 1.00, 0.80, 0.28)
    m.cyl("ceramic", 0.70, 0.88, 4.60, 0.13, 0.16, 14)

    # 主卧
    bed(m, 9.20, 6.20, 1.86, 2.10)
    m.cyl("wood_light", 7.95, 0.24, 5.35, 0.20, 0.48, 14)
    m.cyl("ceramic", 7.95, 0.55, 5.35, 0.13, 0.22, 14)
    m.cyl("wood_light", 10.45, 0.24, 5.35, 0.20, 0.48, 14)
    m.cyl("ceramic", 10.45, 0.55, 5.35, 0.13, 0.22, 14)
    wardrobe(m, 10.20, 7.55, 1.30, 0.58)
    rug(m, 8.20, 7.10, 10.00, 7.60)

    # 次卧一
    bed(m, 4.00, 1.15, 1.50, 1.95)
    table(m, 3.05, 0.55, 0.42, 0.42, 0.46)
    table(m, 6.55, 1.15, 0.60, 1.35, 0.72)
    chair(m, 6.10, 1.15, -math.pi / 2)
    wardrobe(m, 6.40, 0.36, 1.20, 0.48)

    # 次卧二
    bed(m, 1.05, 1.35, 1.24, 1.94)
    table(m, 2.28, 0.60, 0.44, 0.44, 0.48)
    wardrobe(m, 2.30, 2.55, 0.52, 1.10)

    # 北次卧
    bed(m, 8.30, 1.10, 1.24, 1.92)
    table(m, 9.55, 0.72, 0.50, 1.10, 0.70)
    chair(m, 9.20, 1.55, -math.pi / 2)
    wardrobe(m, 10.55, 1.40, 0.50, 1.30)


def export_glb(model: Model, path: Path) -> None:
    buffer = bytearray()
    buffer_views = []
    accessors = []
    materials = []
    primitives = []

    def add_view(data: bytes, target: int) -> int:
        while len(buffer) % 4:
            buffer.append(0)
        offset = len(buffer)
        buffer.extend(data)
        buffer_views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(data), "target": target})
        return len(buffer_views) - 1

    for name, spec in MATERIALS.items():
        materials.append({
            "name": name,
            "pbrMetallicRoughness": {
                "baseColorFactor": [spec["color"][0], spec["color"][1], spec["color"][2], 1.0],
                "metallicFactor": spec["metal"],
                "roughnessFactor": spec["rough"],
            },
            "doubleSided": False,
        })

    for name, group in model.groups.items():
        if not group.idx:
            continue
        pos = struct.pack("<%df" % len(group.pos), *group.pos)
        nrm = struct.pack("<%df" % len(group.nrm), *group.nrm)
        idx = struct.pack("<%dI" % len(group.idx), *group.idx)
        vertices = len(group.pos) // 3
        mins = [min(group.pos[i::3]) for i in range(3)]
        maxs = [max(group.pos[i::3]) for i in range(3)]
        pos_view = add_view(pos, 34962)
        nrm_view = add_view(nrm, 34962)
        idx_view = add_view(idx, 34963)
        accessors.append({"bufferView": pos_view, "componentType": 5126, "count": vertices,
                          "type": "VEC3", "min": mins, "max": maxs})
        pos_acc = len(accessors) - 1
        accessors.append({"bufferView": nrm_view, "componentType": 5126, "count": vertices, "type": "VEC3"})
        nrm_acc = len(accessors) - 1
        accessors.append({"bufferView": idx_view, "componentType": 5125, "count": len(group.idx), "type": "SCALAR"})
        idx_acc = len(accessors) - 1
        primitives.append({
            "attributes": {"POSITION": pos_acc, "NORMAL": nrm_acc},
            "indices": idx_acc,
            "material": list(MATERIALS).index(name),
            "mode": 4,
        })

    gltf = {
        "asset": {"version": "2.0", "generator": "poly-home-3d-model"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": "Apartment"}],
        "meshes": [{"name": "Apartment", "primitives": primitives}],
        "materials": materials,
        "accessors": accessors,
        "bufferViews": buffer_views,
        "buffers": [{"byteLength": len(buffer)}],
    }

    json_chunk = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    json_chunk += b" " * ((4 - len(json_chunk) % 4) % 4)
    bin_chunk = bytes(buffer) + b"\x00" * ((4 - len(buffer) % 4) % 4)
    total = 12 + 8 + len(json_chunk) + 8 + len(bin_chunk)
    out = bytearray()
    out += b"glTF" + struct.pack("<II", 2, total)
    out += struct.pack("<I", len(json_chunk)) + b"JSON" + json_chunk
    out += struct.pack("<I", len(bin_chunk)) + b"BIN\x00" + bin_chunk
    path.write_bytes(out)
    tris = sum(len(g.idx) for g in model.groups.values()) // 3
    print(f"{path}  {len(out)/1024:.1f} KB  {tris} 三角形  {len(model.groups)} 种材质")


def main() -> None:
    model = Model()
    build_floors(model)
    build_walls(model)
    build_windows(model)
    build_door_frames(model)
    furniture(model)
    build_doors(model)
    out = Path(__file__).with_name("poly-home.glb")
    export_glb(model, out)


if __name__ == "__main__":
    main()

