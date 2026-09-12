# poly-home-3d

Home Assistant 的 3D 户型中控卡片。用 three.js 实时渲染一栋房子的模型，在模型上点灯、切场景、看温度。

![夜间](assets/night.jpg)
![白天](assets/day.jpg)

## 特点

- 模型是程序化生成的 glb，不是贴图。墙剖切到 1.2 m，门窗、玻璃、家具、底座都在里面。
- 房间、灯位、场景全部写在外部 JSON 里，改布局不用重新打包。
- 夜里按 `sun.sun` 自动切换：深蓝环境加暖色地面光池，灯位带光晕和光锥。
- 点房间推近镜头，双击回全屋，悬停出描边，点灯位开关灯。
- 自动识别 HA 侧栏布局和全屏布局，按整窗视觉中心取景并避让房间导航。
- 当前示例按扫地机器人地图重建为两室大客餐厨，地图没有标注尺寸，模型用于虚拟化展示。
- 图标内联在 `src/icons.js`，不依赖 `ha-icon`。

## 安装

HACS → 右上角菜单 → 自定义存储库 → 填 `https://github.com/lengjingxu/poly-home-3d`，类型选 **Dashboard** → 安装。

HACS 会自动注册资源 `/hacsfiles/poly-home-3d/poly-home-3d.js`。如果没自动加，在设置 → 仪表盘 → 资源里手动加一条模块类型。

手动安装：把 `dist/` 下的文件放进 `config/www/community/poly-home-3d/`，资源地址填 `/local/community/poly-home-3d/poly-home-3d.js`。

## 用法

```yaml
type: custom:poly-home-3d
config_url: /hacsfiles/poly-home-3d/floorplan.json
```

`config_url` 指向一份 JSON，房间、灯位、场景都写在里面。仓库里那份是示例，把它复制到 `config/www/` 下改，再把 `config_url` 指过去，升级卡片时不会被覆盖。

## 配置字段

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `title` / `subtitle` | `上海家庭` / 空 | 左上角品牌区文字 |
| `model` | 空 | glb 路径。写了 `config_url` 时按配置文件的地址解析 |
| `accent` / `background` | `#ffb066` / `#0a0b0e` | 主题色与底色 |
| `bloom` | `0.62` | 辉光强度 |
| `exposure` | `1.02` | 曝光 |
| `light_intensity` | `2.8` | 灯光强度 |
| `light_distance` | `6.0` | 灯位地面光池半径，米 |
| `pool_scale` | `1.0` | 光池整体缩放 |
| `shadows` | `true` | 阴影开关 |
| `show_rail` | `true` | 左栏房间导航开关 |
| `view_height` | `0.35` | 相机注视高度 |
| `ambient_entity` | `sun.sun` | 判昼夜的实体 |
| `camera` | 空 | 固定机位，不写就按包围盒自动取景 |

配置文件内部：

| 字段 | 说明 |
| --- | --- |
| `rooms[].name` | 房间名，用于左栏导航和地面标签 |
| `rooms[].rect` | `[x0, z0, x1, z1]`，单位米，与模型同一坐标系 |
| `rooms[].lights` | 该房间的灯实体，用于亮灯指示和单房间总开关 |
| `markers[]` | `entity` / `name` / `icon`（mdi 名）/ `x` `y` `z`；灯加 `"cone": true` 出光锥 |
| `scenes[]` | `name` / `icon` / `service` / `targets[]`，底部按钮 |

## 换模型

`model/build_model.py` 里 `ROOMS` 定义房间矩形，`WINDOWS` 定义窗洞，`furniture()` 摆家具，改完跑 `./build.sh` 重新生成。用别的建模软件导出的 glb 也可以，把 `model` 指过去就行，但房间 `rect` 要按新模型的坐标系重写。

## 本地开发

```bash
npm ci
./build.sh
python3 -m http.server 8899
open http://127.0.0.1:8899/preview.html
```

`preview.html` 用 `config/states.json` 当假状态，查询参数可以换环境：

- `sun=below_horizon|above_horizon` 夜或昼
- `lights=all|off` 全开或全关
- `shadows=0`、`bloom=1.2`、`rail=0` 覆盖配置
- `focus=客厅` 启动后推近某个房间

截图（headless Chrome）：

```bash
W=1240 H=700 node shoot.mjs 'http://127.0.0.1:8899/preview.html?lights=all' /tmp/shot.png 9000
```

## 许可

MIT
