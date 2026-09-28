import * as T from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
const scene=new T.Scene();scene.background=new T.Color('#e1dfd8');
const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.toneMapping=T.ACESFilmicToneMapping;document.querySelector('#view').append(renderer.domElement);
const camera=new T.PerspectiveCamera(36,1,.1,100),controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.maxPolarAngle=Math.PI/2-.03;controls.minDistance=6;controls.maxDistance=60;
scene.add(new T.HemisphereLight(0xffffff,0xb3b8c0,.8));const sun=new T.DirectionalLight(0xfff7e8,3.2);sun.position.set(-4,16,8);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-12,right:12,top:12,bottom:-12});sun.shadow.bias=-.0002;sun.shadow.normalBias=.025;sun.shadow.radius=3;scene.add(sun);
const pmrem=new T.PMREMGenerator(renderer),studio=new RoomEnvironment();
const environment=pmrem.fromScene(studio,.04);scene.environment=environment.texture;scene.environmentIntensity=.45;studio.dispose();pmrem.dispose();
const fill=new T.DirectionalLight(0xd6e2ff,1.2);fill.position.set(8,7,-6);scene.add(fill);
const home=new T.Group(),walls=new T.Group(),furniture=new T.Group();scene.add(home);home.add(walls,furniture);const picks=[];
// Deterministic, embedded textures: no remote images or HDR files.
function texture(kind){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  const context=canvas.getContext('2d'),pixels=context.createImageData(256,256);
  for(let y=0;y<256;y++)for(let x=0;x<256;x++){
    const noise=(Math.sin(x*127.1+y*311.7)*43758.5453)%1;
    const grain=kind==='wood'?Math.sin(x*.45+Math.sin(y*.035)*2)*16+Math.sin(x*1.9+y*.008)*7:noise*14;
    const value=kind==='wood'?177+grain:128+grain;
    const i=(y*256+x)*4;pixels.data[i]=value;pixels.data[i+1]=value;pixels.data[i+2]=value;pixels.data[i+3]=255;
  }
  context.putImageData(pixels,0,0);const t=new T.CanvasTexture(canvas);t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(kind==='wood'?3:10,kind==='wood'?1:10);return t;
}
const grain=texture('wood'),micro=texture('micro');
const mat=c=>new T.MeshStandardMaterial({color:c,roughness:.72});
const plaster=mat('#f0eee7'),wood=new T.MeshStandardMaterial({color:'#b48b62',map:grain,bumpMap:grain,bumpScale:.008,roughness:.47});
const dark=mat('#191b1e'),black=new T.MeshStandardMaterial({color:'#202226',roughness:.32});
const linen=new T.MeshStandardMaterial({color:'#ede9df',roughness:.95,bumpMap:micro,bumpScale:.007});
const wine=mat('#8d292c'),stone=mat('#c8c7c2');
const chrome=new T.MeshStandardMaterial({color:'#e7ecf2',metalness:1,roughness:.13});
const silver=new T.MeshStandardMaterial({color:'#cbd0d8',metalness:.95,roughness:.24});
const mirror=new T.MeshStandardMaterial({color:'#e7ebef',metalness:1,roughness:.035});
const leather=new T.MeshPhysicalMaterial({color:'#16181b',roughness:.37,clearcoat:.25,clearcoatRoughness:.32,bumpMap:micro,bumpScale:.003});
const blue=new T.MeshStandardMaterial({color:'#174caf',roughness:1,bumpMap:micro,bumpScale:.018});
const glass=new T.MeshPhysicalMaterial({color:'#b8d1d5',transparent:true,opacity:.22,roughness:.08,depthWrite:false});
// Source drawing origin (264,282); 84.4 pixels per metre. No geographic orientation inferred.
const CEILING=2.6; /* Assumed ceiling height. */ const X=p=>(p-264)/84.4-6.25,Z=p=>(p-282)/84.4-3.7;
function box(x,z,w,d,h,m,y=0,g=furniture,name=''){const o=new T.Mesh(new T.BoxGeometry(w,h,d),m);o.position.set(x,y+h/2,z);o.castShadow=true;o.receiveShadow=true;g.add(o);if(name){o.userData.name=name;picks.push(o);}return o;}
function rect(a,b,c,d,h,m,y=0,g=furniture,name=''){return box(X((a+c)/2),Z((b+d)/2),(c-a)/84.4,(d-b)/84.4,h,m,y,g,name);}
function cyl(x,z,r,h,m,y=0){const o=new T.Mesh(new T.CylinderGeometry(r,r,h,32),m);o.position.set(X(x),y+h/2,Z(z));o.castShadow=true;o.receiveShadow=true;furniture.add(o);return o;}
function wall(a,b,c,d){rect(a,b,c,d,1.15,plaster,0,walls);rect(a-1,b-1,c+1,d+1,.025,linen,1.15,walls);}
function floor(a,b,c,d,m,y=0){rect(a,b,c,d,.13,m,y-.13,home);}
floor(248,270,1319,980,wood);floor(1152,142,1319,282,stone);floor(890,922,1319,1054,stone,.006);
floor(264,282,417,551,stone,.004);floor(644,282,795,551,stone,.004);floor(795,282,1319,660,stone,.004);
const joint=mat('#806e59');for(let py=565;py<975;py+=19)rect(264,py,790,py+.32,.002,joint,.002,home);
const ground=new T.Mesh(new T.PlaneGeometry(200,200),mat('#e1dfd8'));ground.rotation.x=-Math.PI/2;ground.position.y=-.18;ground.receiveShadow=true;scene.add(ground);
// Dressing/primary bedroom and study/living room connections have no walls or doors. Exterior and interior walls are split at the drawing's door/window openings.
[[248,270,264,654],[248,710,264,922],[248,970,805,984],[264,270,292,286],[391,270,427,286],[622,270,654,286],[744,270,844,286],[844,270,1167,286],[1152,142,1168,282],[1152,134,1180,150],[1273,134,1320,150],[1304,142,1320,922],[264,908,314,924],[527,908,580,924],[753,908,806,924],[806,908,892,924],[980,908,998,924],[1250,908,1320,924],[884,922,900,1054],[1304,922,1320,1054],[407,286,424,552],[634,286,651,552],[784,286,801,552],[264,545,329,559],[398,545,424,559],[642,545,665,559],[730,545,801,559],[544,650,560,910],[784,650,801,705],[784,744,801,910],[560,649,707,665]].forEach(v=>wall(...v));
function windowLine(a,b,c,d){rect(a,b,c,d,.65,glass,.18,home);rect(a,b,c,d,.035,dark,.18,home);rect(a,b,c,d,.035,dark,.83,home);const horizontal=c-a>d-b,length=horizontal?c-a:d-b;for(let n=0;n<=length;n+=length/4)rect(horizontal?a+n:a,horizontal?b:b+n,horizontal?a+n+3:c,horizontal?d:b+n+3,.65,dark,.18,home);}
[[424,274,630,280],[280,958,528,964],[572,958,774,964],[250,657,257,708],[808,909,980,916],[999,910,1248,917],[899,1044,1303,1050],[292,275,390,280],[653,275,744,280]].forEach(v=>windowLine(...v));
function cabinet(a,b,c,d,name,h=1.05,m=black,face='south'){ if(h>=1.12)h=CEILING;
  rect(a,b,c,d,h-.07,m,.07,furniture,name);
  rect(a+3,b+3,c-3,d-3,.07,dark,0);
  const along=face==='south',span=along?c-a:d-b,count=Math.max(2,Math.round(span/43));
  for(let i=1;i<count;i++){
    const at=(along?a:b)+span*i/count;
    if(along)rect(at-.45,d,at+.45,d+.5,h-.13,dark,.1);
    else{const edge=face==='west'?a-.5:c;rect(edge,at-.45,edge+.5,at+.45,h-.13,dark,.1);}
  }
}
function mirrorFront(a,b,c,d,h,face){ h=CEILING;
  const span=d-b,count=Math.max(2,Math.round(span/44));
  for(let i=0;i<count;i++){
    const edge=face==='west'?a-.65:c;
    rect(edge,b+span*i/count+1.5,edge+.65,b+span*(i+1)/count-1.5,h-.15,mirror,.1,furniture,'银色镜面柜门');
  }
}
cabinet(426,294,622,342,'衣帽间 · 黑色飘窗柜',.55);
cabinet(426,344,480,543,'衣帽间 · 黑色镜面衣柜',1.5,black,'east');mirrorFront(426,344,480,543,1.5,'east');
cabinet(581,344,633,467,'衣帽间 · 黑色镜面衣柜',1.5,black,'west');mirrorFront(581,344,633,467,1.5,'west');
cabinet(277,556,328,682,'主卧 · 黑色衣柜',1.5,black,'east');cabinet(416,908,525,956,'主卧 · 黑色飘窗柜',.55);
cabinet(562,658,714,704.4,'次卧 · 木纹衣柜 1800 × 550',1.5,wood);
cabinet(562,695,608.4,855.4,'次卧 · 木纹衣柜 1900 × 550',1.5,wood,'east');
rect(778,674,783,903,CEILING,wood,0,furniture,'次卧 · 木纹墙板');
for(let y=687;y<900;y+=34)rect(777.5,y,778,y+.6,CEILING-.07,dark,.035);
const floatingWhite=new T.MeshStandardMaterial({color:'#f2f1eb',roughness:.35});
rect(808,660,867,837,1.15,floatingWhite,CEILING-1.15,furniture,'书房 · 悬空白色柜（下方留空 1.45 m）');
for(let y=698;y<837;y+=39)rect(867,y,867.5,y+.55,1.08,dark,CEILING-1.12);
cabinet(1004,295,1105,352,'厨房 · 黑色冰箱柜',1.65);cabinet(1107,295,1172,352,'厨房 · 黑色零食柜',1.4);
cabinet(1277,154,1310,409,'玄关 · 到顶镜面薄柜',1.12,black,'west');
rect(1169,159,1171,268,CEILING,mirror,0,furniture,'玄关 · 银色镜面墙');
rect(1275,157,1275.4,407,CEILING-.12,mirror,.08,furniture,'玄关 · 银色镜面墙');
for(let y=169;y<265;y+=32)rect(1168.8,y,1171.3,y+.5,CEILING,chrome);
cabinet(1276,418,1310,653,'餐厅 · 黑色展示柜',1.3,black,'west');
cabinet(1256,437,1310,604,'餐厅 · 凸出银色餐边柜',.68,silver,'west');
rect(1255,436,1311,605,.035,chrome,.75);
cabinet(807,294,859,548,'厨房 · 黑色操作台',.86,black,'east');rect(806,293,860,549,.04,silver,.86);rect(813,319,852,348,.025,dark,.88);rect(816,322,849,345,.026,mat('#aab7b7'),.889);cyl(848,318,.025,.22,dark,.88);
rect(922,448,1019,536,.9,wine,0,furniture,'厨房 · 磨砂酒红岛台');rect(919,445,1022,539,.04,wine,.9);rect(1022,454,1124,529,.05,black,.76,furniture,'餐桌 · 按图示轮廓估算');
for(const [x,y] of [[1040,440],[1091,440],[1040,543],[1091,543]]){
  soft(x-15,y-15,x+15,y+15,.065,leather,.43,'餐厅 · 黑皮金属餐椅');
  const back=y<480?y-14:y+14;
  soft(x-15,back-2,x+15,back+2,.28,leather,.56);
  for(const dx of [-14,14]){tube([x+dx,.04,y-14],[x+dx,.47,y-14],.012);tube([x+dx,.04,y+14],[x+dx,.85,y+14],.012);tube([x+dx,.04,y-14],[x+dx,.04,y+14],.012);}
}
function bed(a,b,c,d,name,rotate=false){rect(a,b,c,d,.25,wood,0,furniture,name);soft(a+3,b+3,c-3,d-3,.2,linen,.25);rect(a+4,b+5,c-4,b+36,.09,mat('#8c9586'),.46);if(rotate){rect(a+4,b+8,a+30,d-8,.11,linen,.5);rect(a,b,a+4,d,.85,wood);}else{rect(a+8,b+8,a+47,b+31,.12,linen,.48);rect(c-47,b+8,c-8,b+31,.12,linen,.48);}}
bed(292,724,478,871,'主卧 · 床（图示轮廓估算）',true);// Wall-to-wall tatami platform, with the annotated sleeping surface.
rect(560,857,784,958.28,.25,wood,0,furniture,'次卧 · 通墙榻榻米平台');
soft(580,860,748.8,958,.2,linen,.25,'次卧 · 1200 × 2000 寝具');
soft(590,867,642,891,.12,linen,.45);soft(677,867,730,891,.12,linen,.45);
// LC3-inspired rounded leather cushions and external tubular steel frame.
rect(1000,695,1246,887,.027,blue,0,furniture,'客厅 · 蓝色地毯');
function soft(a,b,c,d,h,m,y,name){
  const w=(c-a)/84.4,depth=(d-b)/84.4;
  const mesh=new T.Mesh(new RoundedBoxGeometry(w,h,depth,3,Math.min(.065,h/3)),m);
  mesh.position.set(X((a+c)/2),y+h/2,Z((b+d)/2));mesh.castShadow=true;mesh.receiveShadow=true;furniture.add(mesh);
  if(name){mesh.userData.name=name;picks.push(mesh);}return mesh;
}
function tube(a,b,r=.017){
  const start=new T.Vector3(X(a[0]),a[1],Z(a[2])),end=new T.Vector3(X(b[0]),b[1],Z(b[2]));
  const direction=end.clone().sub(start),mesh=new T.Mesh(new T.CylinderGeometry(r,r,direction.length(),12),chrome);
  mesh.position.copy(start).add(end).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),direction.normalize());mesh.castShadow=true;furniture.add(mesh);
}
soft(1009,711,1075,864,.15,leather,.13,'客厅 · LC3 黑皮金属框沙发（比例示意）');
for(let i=0;i<3;i++){
  const z=720+i*45;soft(1022,z,1073,z+42,.22,leather,.31,'LC3 · 黑色皮革坐垫');
  soft(1008,z,1023,z+42,.42,leather,.4);
}
soft(1009,707,1075,723,.45,leather,.28);soft(1009,855,1075,872,.45,leather,.28);
for(const x of [1007,1077]){
  for(const z of [706,873])tube([x,.08,z],[x,.73,z]);
  tube([x,.23,706],[x,.23,873]);
}
for(const z of [706,873]){tube([1007,.68,z],[1077,.68,z]);tube([1007,.24,z],[1077,.24,z]);}
tube([1007,.68,706],[1007,.68,873]);
rect(952,696,989,855,.055,black,.74,furniture,'书房 · 书桌');for(const y of [707,844])rect(958,y,983,y+4,.74,dark);rect(883,755,916,793,.43,linen);rect(884,757,888,790,.4,wood,.43);
const lounge=soft(1102,655,1177,704,.16,leather,.35,'客厅 · 黑皮休闲椅（形态示意）');
soft(1102,639,1177,657,.52,leather,.35);
for(const x of [1100,1179]){tube([x,.13,642],[x,.13,705]);tube([x,.13,648],[x,.75,648]);tube([x,.13,701],[x,.54,701]);tube([x,.54,648],[x,.54,701]);}
rect(1105,740,1184,812,.055,stone,.35,furniture,'客厅 · 茶几');rect(1136,764,1152,785,.35,dark);cabinet(1275,664,1310,901,'客厅 · 电视墙',.35,dark);rect(1300,719,1305,855,.85,mat('#202a2b'),.5,furniture,'电视');
rect(812,845,860,900,.06,wood,0,furniture,'书房 · 猫爬架');for(const [x,y,h] of [[822,858,.9],[850,883,.6]]){cyl(x,y,.045,h,wood);rect(x-13,y-13,x+13,y+13,.045,linen,h);}
function bathroom(a){rect(a+12,299,a+125,396,.018,mat('#aebeb8'));windowLine(a+12,399,a+125,403);rect(a+14,432,a+45,460,.36,linen,0,furniture,'卫生间 · 坐便器');const seat=cyl(a+30,456,.19,.12,linen,.3);seat.scale.z=1.3;rect(a+10,490,a+63,542,.76,black,0,furniture,'卫生间 · 洗手台');cyl(a+35,512,.22,.1,linen,.76);cyl(a+35,512,.15,.015,mat('#8d9f9e'),.865);cyl(a+35,496,.018,.18,dark,.82);cyl(a+100,314,.035,1.4,dark);cyl(a+100,314,.12,.04,dark,1.4);}bathroom(264);bathroom(647);
cabinet(1248,936,1298.64,986.64,'阳台 · 洗衣机 600 × 600',.85,linen);const drum=new T.Mesh(new T.CylinderGeometry(.21,.21,.025,36),dark);drum.rotation.z=Math.PI/2;drum.position.set(X(1246),.44,Z(965));furniture.add(drum);cabinet(1251,995,1291,1039,'阳台 · 扫地机基站',.45,stone);cyl(1266,1025,.16,.09,dark);
const reflectionTargets=[];
for(const [x,z] of [[530,430],[1220,225]]){
  const target=new T.WebGLCubeRenderTarget(128,{generateMipmaps:true,minFilter:T.LinearMipmapLinearFilter});
  const probe=new T.CubeCamera(.1,40,target);probe.position.set(X(x),.9,Z(z));
  probe.update(renderer,scene);reflectionTargets.push(target);
}
for(const mesh of picks){
  if(mesh.material!==mirror)continue;
  const material=mirror.clone();material.envMap=reflectionTargets[mesh.position.x>X(1000)?1:0].texture;mesh.material=material;
}
const rooms=[['主卧',378,788,'横向轴线 3400 mm'],['衣帽间',527,436,'横向轴线 2700 mm'],['主卫',344,455,'横向轴线 1800 mm'],['公卫',720,454,'横向轴线 1800 mm'],['次卧',681,776,'横向轴线 2900 mm'],['书房',895,814,'横向轴线 2300 mm'],['客厅',1160,820,'右侧横向轴线 3900 mm'],['餐厨',1126,558,'开放式客餐厨'],['玄关',1229,261,'右上入户，薄柜靠右'],['阳台',1085,1006,'外挑阳台，家政区靠右']];
const labelLayer=document.querySelector('#labels');for(const [name,x,y,desc]of rooms){const el=document.createElement('button');el.className='label';el.textContent=name;el.onclick=()=>{document.querySelector('#detail').textContent=name+' · '+desc;controls.target.set(X(x),0,Z(y));camera.position.set(X(x)+3,7,Z(y)+6);};labelLayer.append(el);el.anchor=new T.Vector3(X(x),.14,Z(y));}
function reset(top=false){controls.target.set(0,0,.2);camera.position.set(top?0:-12,top?24:16,top?.21:17);controls.update();}reset();
for(const b of document.querySelectorAll('[data-view]'))b.onclick=()=>{reset(b.dataset.view==='top');document.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('active',x===b));};
document.querySelector('#walls').onchange=e=>walls.visible=e.target.checked;document.querySelector('#furniture').onchange=e=>furniture.visible=e.target.checked;document.querySelector('#names').onchange=e=>labelLayer.hidden=!e.target.checked;
document.querySelector('#save').onclick=()=>{renderer.render(scene,camera);const a=document.createElement('a');a.download='户型-3D.png';a.href=renderer.domElement.toDataURL();a.click();};
const ray=new T.Raycaster(),pointer=new T.Vector2();let down;renderer.domElement.addEventListener('pointerdown',e=>down=[e.clientX,e.clientY]);renderer.domElement.addEventListener('pointerup',e=>{if(!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>5)return;const r=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);ray.setFromCamera(pointer,camera);const hit=furniture.visible?ray.intersectObjects(picks)[0]:null;if(hit)document.querySelector('#detail').textContent=hit.object.userData.name;});
function resize(){const v=document.querySelector('#view');renderer.setSize(v.clientWidth,v.clientHeight);camera.aspect=v.clientWidth/v.clientHeight;camera.fov=camera.aspect<1?76:36;camera.updateProjectionMatrix();}addEventListener('resize',resize);resize();
renderer.setAnimationLoop(()=>{controls.update();renderer.render(scene,camera);const w=renderer.domElement.clientWidth,h=renderer.domElement.clientHeight;for(const el of labelLayer.children){const p=el.anchor.clone().project(camera);el.style.left=(p.x*.5+.5)*w+'px';el.style.top=(-p.y*.5+.5)*h+'px';el.style.display=p.z>1?'none':'';}});
window.floorplan={scene,camera,controls,renderer,rooms,reset,walls,furniture};document.querySelector('#status').textContent='离线模型已就绪';
const closeViews={living:[1120,780,-3.8,5,5.7],wardrobe:[530,410,3,4,4.5],entry:[1220,250,-3,3.8,4.2]};
for(const button of document.querySelectorAll('[data-focus]'))button.onclick=()=>{
  const [x,z,dx,h,dz]=closeViews[button.dataset.focus];controls.target.set(X(x),.45,Z(z));camera.position.set(X(x)+dx,h,Z(z)+dz);controls.update();
  document.querySelector('#detail').textContent=button.textContent+' · 拖动查看材质与细节';
  document.querySelectorAll('[data-view]').forEach(b=>b.classList.remove('active'));
};
