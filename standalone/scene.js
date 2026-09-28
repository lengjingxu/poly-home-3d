import * as T from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {SSAOPass} from 'three/addons/postprocessing/SSAOPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {makeTextures} from './textures.js';
import {Reflector} from 'three/addons/objects/Reflector.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {createLighting} from './lighting.js';
const scene=new T.Scene();scene.background=new T.Color('#e1dfd8');
const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.toneMappingExposure=.93;renderer.toneMapping=T.ACESFilmicToneMapping;document.querySelector('#view').append(renderer.domElement);
const camera=new T.PerspectiveCamera(36,1,.1,100),controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.12;controls.maxPolarAngle=Math.PI/2-.03;controls.minDistance=1.5;controls.maxDistance=60;
const sky=new T.HemisphereLight(0xffffff,0x899ab6,.48);scene.add(sky);const sun=new T.DirectionalLight(0xffedd8,2.8);sun.position.set(-6,11,7);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-9,right:9,top:9,bottom:-9,near:.1,far:35});sun.shadow.bias=-.0002;sun.shadow.normalBias=.012;sun.shadow.radius=3;scene.add(sun);
const pmrem=new T.PMREMGenerator(renderer),studio=new RoomEnvironment();
const environment=pmrem.fromScene(studio,.04);scene.environment=environment.texture;scene.environmentIntensity=.55;studio.dispose();pmrem.dispose();
const fill=new T.DirectionalLight(0xd6e2ff,.65);fill.position.set(8,7,-6);scene.add(fill);
const home=new T.Group(),walls=new T.Group(),furniture=new T.Group();scene.add(home);home.add(walls,furniture);const picks=[];
const textures=makeTextures(),grain=textures.oak,micro=textures.pores;
const mat=c=>new T.MeshStandardMaterial({color:c,roughness:.72});
const plaster=mat('#f0eee7'),wood=new T.MeshStandardMaterial({color:'#ffffff',map:grain,bumpMap:grain,bumpScale:.003,roughness:.46});
const dark=mat('#191b1e'),black=new T.MeshStandardMaterial({color:'#202226',roughness:.36,bumpMap:textures.plaster,bumpScale:.0006});
const linen=new T.MeshStandardMaterial({color:'#ede9df',roughness:.95,bumpMap:textures.weave,bumpScale:.003});
const wine=mat('#8d292c'),stone=mat('#c8c7c2');
const chrome=new T.MeshStandardMaterial({color:'#e7ecf2',metalness:1,roughness:.13});
const silver=new T.MeshStandardMaterial({color:'#cbd0d8',metalness:1,roughness:.23,roughnessMap:textures.brushed,bumpMap:textures.brushed,bumpScale:.0004});
const mirror=new T.MeshStandardMaterial({color:'#e7ebef',metalness:1,roughness:.035});
const leather=new T.MeshPhysicalMaterial({color:'#101215',roughness:.43,clearcoat:.16,clearcoatRoughness:.38,bumpMap:micro,bumpScale:.0014});
const blue=new T.MeshStandardMaterial({color:'#153b92',roughness:1,bumpMap:textures.weave,bumpScale:.007});
const glass=new T.MeshPhysicalMaterial({color:'#b8d1d5',transparent:true,opacity:.22,roughness:.08,depthWrite:false});
plaster.bumpMap=textures.plaster;plaster.bumpScale=.001;
stone.bumpMap=textures.plaster;stone.bumpScale=.001;stone.roughness=.5;
const livingFloor=new T.MeshStandardMaterial({color:'#929497',roughness:.58,bumpMap:textures.plaster,bumpScale:.0006});
const floorWood=new T.MeshStandardMaterial({map:textures.floor,roughness:.55,bumpMap:textures.floor,bumpScale:.0018});
// Source drawing origin (264,282); 84.4 pixels per metre. No geographic orientation inferred.
const CEILING=2.6; /* Assumed ceiling height. */ const X=p=>(p-264)/84.4-6.25,Z=p=>(p-282)/84.4-3.7;
function box(x,z,w,d,h,m,y=0,g=furniture,name=''){const bevel=Math.min(.008,w/5,h/5,d/5);const geometry=(g===furniture&&Math.min(w,h,d)>.04)?new RoundedBoxGeometry(w,h,d,2,bevel):new T.BoxGeometry(w,h,d);const o=new T.Mesh(geometry,m);o.position.set(x,y+h/2,z);o.castShadow=true;o.receiveShadow=true;g.add(o);if(name){o.userData.name=name;picks.push(o);}return o;}
function rect(a,b,c,d,h,m,y=0,g=furniture,name=''){return box(X((a+c)/2),Z((b+d)/2),(c-a)/84.4,(d-b)/84.4,h,m,y,g,name);}
function cyl(x,z,r,h,m,y=0){const o=new T.Mesh(new T.CylinderGeometry(r,r,h,32),m);o.position.set(X(x),y+h/2,Z(z));o.castShadow=true;o.receiveShadow=true;furniture.add(o);return o;}
function wall(a,b,c,d){rect(a,b,c,d,CEILING,plaster,0,walls);rect(a-1,b-1,c+1,d+1,.025,plaster,CEILING,walls);}
walls.scale.y=1.15/CEILING;
function floor(a,b,c,d,m,y=0){
  const mesh=rect(a,b,c,d,.13,m,y-.13,home);
  if(m===floorWood){const uv=mesh.geometry.attributes.uv,pos=mesh.geometry.attributes.position;
    for(let i=0;i<pos.count;i++)uv.setXY(i,(pos.getX(i)+mesh.position.x)/4,(pos.getZ(i)+mesh.position.z)/4);
  }
}
floor(248,270,1319,980,floorWood);floor(1152,142,1319,282,stone);floor(890,922,1319,1054,stone,.006);
floor(264,282,417,551,stone,.004);floor(644,282,795,551,stone,.004);floor(795,282,1319,660,stone,.004);
// User-confirmed neutral grey living floor; the study keeps its existing finish.
floor(990,660,1319,922,livingFloor,.004);
const ground=new T.Mesh(new T.PlaneGeometry(200,200),mat('#e1dfd8'));ground.rotation.x=-Math.PI/2;ground.position.y=-.18;ground.receiveShadow=true;scene.add(ground);
// Dressing/primary bedroom and study/living room connections have no walls or doors. Exterior and interior walls are split at the drawing's door/window openings.
[[248,270,264,654],[248,710,264,922],[248,970,805,984],[264,270,292,286],[391,270,427,286],[622,270,654,286],[744,270,844,286],[844,270,864,286],[994,270,1167,286],[1152,142,1168,282],[1152,134,1180,150],[1273,134,1320,150],[1304,142,1320,922],[264,908,314,924],[527,908,580,924],[753,908,806,924],[806,908,892,924],[980,908,998,924],[1250,908,1320,924],[884,922,900,1054],[1304,922,1320,1054],[407,286,424,552],[634,286,651,552],[784,286,801,552],[264,545,329,559],[398,545,424,559],[642,545,665,559],[730,545,801,559],[544,650,560,910],[784,650,801,705],[784,744,801,910],[560,649,707,665]].forEach(v=>wall(...v));
function windowLine(a,b,c,d,sill=.9,head=2.35,isWindow=true){
  const height=head-sill;
  const pane=rect(a,b,c,d,height,glass,sill,home);
  pane.userData.glazing={sill,head,isWindow};
  rect(a,b,c,d,.035,dark,sill,home);rect(a,b,c,d,.035,dark,head-.035,home);
  const horizontal=c-a>d-b,length=horizontal?c-a:d-b;
  for(let n=0;n<=length;n+=length/4)rect(horizontal?a+n:a,horizontal?b:b+n,horizontal?a+n+3:c,horizontal?d:b+n+3,height,dark,sill,home);
  if(isWindow&&sill>0){
    rect(a,b,c,d,sill-.035,plaster,0,home);
    rect(a-1.5,b-1.5,c+1.5,d+1.5,.035,stone,sill-.035,home);
  }
}
[[424,274,630,280],[280,958,528,964],[572,958,774,964],[250,657,257,708],[808,909,980,916],[292,275,390,280],[653,275,744,280]].forEach(v=>windowLine(...v));
// Kitchen window on the refrigerator-side wall, above the sink.
windowLine(866,274,992,280,1.05,2.35);
rect(864,270,994,286,CEILING-2.35,plaster,2.35,home);
// The interior balcony glazing is a floor-level opening, not a normal window.
windowLine(999,910,1248,917,.02,CEILING,false);
// Balcony exterior: one uninterrupted floor-to-ceiling pane; no intermediate mullions.
rect(899,1046.5,1303,1047.5,CEILING-.04,glass,.02,home,'阳台 · 一体全景玻璃');
rect(899,1044,1303,1050,.025,dark,0,home);
rect(899,1044,1303,1050,.025,dark,CEILING-.025,home);
for(const x of [899,1301])rect(x,1044,x+2,1050,CEILING,dark,0,home);
function cabinet(a,b,c,d,name,h=1.05,m=black,face='south'){ if(h>=1.12)h=CEILING;
  rect(a,b,c,d,h-.07,m,.07,furniture,name);
  rect(a+3,b+3,c-3,d-3,.07,dark,0);
  const along=face==='south',span=along?c-a:d-b,count=Math.max(2,Math.round(span/43));
  for(let i=0;i<count;i++){
    const start=(along?a:b)+span*i/count+.3,end=(along?a:b)+span*(i+1)/count-.3;
    if(along)rect(start,d-.1,end,d+1.1,h-.14,m,.1);
    else{const edge=face==='west'?a-1.1:c-.1;rect(edge,start,edge+1.2,end,h-.14,m,.1);}
  }}
function mirrorFront(a,b,c,d,h,face){ h=CEILING;
  const span=d-b,count=Math.max(2,Math.round(span/44));
  for(let i=0;i<count;i++){
    const edge=face==='west'?a-1.8:c+1.2;
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
// White cabinet surround with silver-grey refrigerator doors, from the reference photo.
const fridgeWhite=new T.MeshStandardMaterial({color:'#ecebe5',roughness:.35});
const fridgeSilver=new T.MeshStandardMaterial({color:'#b8bec3',metalness:.55,roughness:.33});
rect(1004,295,1105,352,CEILING,fridgeWhite,0,furniture,'餐厨 · 白色与银灰色冰箱');
rect(1008,352,1101,353,.12,dark,.05);
for(const [a,c] of [[1008,1053.8],[1055.2,1101]]){
  rect(a,352,c,354,1.18,fridgeWhite,1.0);
  rect(a,352,c,354,.39,fridgeSilver,.19);rect(a,352,c,354,.39,fridgeSilver,.60);
}
rect(1008,353,1101,354,.018,dark,.986);
rect(1008,352,1101,353.5,.34,fridgeWhite,2.23);
cabinet(1107,295,1172,352,'厨房 · 黑色零食柜',1.4);
cabinet(1277,154,1310,409,'玄关 · 到顶黑色柜',1.12,black,'west');
rect(1169,159,1171,268,CEILING,mirror,0,furniture,'玄关 · 银色镜面墙');

for(let y=169;y<265;y+=32)rect(1168.8,y,1171.3,y+.5,CEILING,chrome);
// A projecting silver frame, open illuminated niche and six lower drawers.
const sideboardSilver=new T.MeshStandardMaterial({color:'#cbc9c3',metalness:.48,roughness:.34});
rect(1276,418,1310,437,CEILING,black);rect(1276,604,1310,653,CEILING,black);
rect(1276,437,1310,604,.28,black);rect(1276,437,1310,604,CEILING-2.34,black,2.34);
rect(1305,437,1310,604,CEILING,black);
rect(1256,437,1305,440,2.06,sideboardSilver,.28,furniture,'餐厅 · 银色餐边柜边框');
rect(1256,601,1305,604,2.06,sideboardSilver,.28);
rect(1256,437,1305,604,.035,sideboardSilver,2.305);
rect(1301,440,1305,601,2.025,sideboardSilver,.28);
rect(1256,440,1301,601,.90,sideboardSilver,.28,furniture,'餐厅 · 银色餐边柜（上部开放格，下部抽屉）');
for(let row=0;row<3;row++)for(let col=0;col<2;col++){
  const z=441+col*80;rect(1254.6,z,1256,z+78,.282,sideboardSilver,.293+row*.296);
}
rect(1253,437,1306,604,.035,sideboardSilver,1.18);
rect(1257,440,1302,601,.025,sideboardSilver,1.88);
// Small reference accessories indicate the depth of the open niche.
const bottle=mat('#343d28');for(const z of [459,471]){cyl(1290,z,.028,.14,bottle,1.905);cyl(1290,z,.012,.035,chrome,2.045);}
rect(1273,566,1296,591,.28,wine,1.215,furniture,'餐边柜 · 红色咖啡机示意');
rect(1268,569,1274,587,.025,chrome,1.26);cyl(1267,578,.035,.045,linen,1.285);

// L-shaped worktop: cooking on the west wall, washing under the north window.
cabinet(807,294,859,548,'厨房 · 黑色地柜',.86,black,'east');
rect(806,293,860,549,.04,silver,.86);
cabinet(859,294,997,352,'厨房 · 窗下水槽柜',.86,black);
for(const r of [[859,293,881,353],[931,293,997,353],[881,293,931,306],[881,340,931,353]])rect(...r,.04,silver,.86);
rect(881,306,931,340,.01,silver,.858,furniture,'厨房 · 窗下洗手台水槽');
for(const r of [[881,306,883,340],[929,306,931,340],[881,306,931,308],[881,338,931,340]])rect(...r,.05,silver,.864);
cyl(905,323,.023,.004,dark,.87);
// White wall cabinets meet the assumed ceiling and leave a clear hood opening.
for(const [z0,z1] of [[294,398],[476,548]]){
  rect(807,z0,842,z1,1,fridgeWhite,1.6,furniture,'厨房 · 白色吊柜');
  const n=Math.ceil((z1-z0)/43);
  for(let i=0;i<n;i++)rect(841.8,z0+(z1-z0)*i/n+.4,843,z0+(z1-z0)*(i+1)/n-.4,.94,fridgeWhite,1.63);
}
rect(807,404,861,472,.09,fridgeSilver,1.60,furniture,'厨房 · 油烟机');
rect(807,420,828,457,.85,fridgeSilver,1.69);
rect(849,406,861,470,.05,black,1.62);
rect(811,410,855,466,.014,black,.906,furniture,'厨房 · 灶台');
for(const [x,z] of [[822,423],[844,423],[822,453],[844,453]]){
  const ring=new T.Mesh(new T.TorusGeometry(.07,.007,8,24),dark);ring.rotation.x=Math.PI/2;ring.position.set(X(x),.929,Z(z));furniture.add(ring);
  rect(x-7,z-.6,x+7,z+.6,.008,chrome,.933);rect(x-.6,z-7,x+.6,z+7,.008,chrome,.933);
}
// Dishwasher front at the right-hand end of the sink run, adjacent to the fridge.
rect(944,352.5,995,354.5,.70,fridgeSilver,.10,furniture,'厨房 · 洗碗机');
rect(944,354.5,995,355,.065,black,.735);
rect(953,355,986,356,.018,chrome,.703);
rect(980,355,990,355.5,.022,dark,.761);
rect(922,448,1019,536,.9,wine,0,furniture,'厨房 · 磨砂酒红岛台');rect(919,445,1022,539,.04,wine,.9);rect(1022,454,1124,529,.05,wood,.76,furniture,'餐桌 · 木纹台面（参考图）');for(const z of [464,519])tube([1113,.02,z],[1113,.76,z],.021);
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
function duvet(a,b,c,d,y){
  const geometry=new T.PlaneGeometry((c-a)/84.4,(d-b)/84.4,42,42),pos=geometry.attributes.position;
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i),z=pos.getY(i);
    pos.setZ(i,.012*Math.sin(x*24+z*3)+.008*Math.sin(z*28+x*5));
  }
  geometry.computeVertexNormals();const cloth=new T.Mesh(geometry,linen);cloth.rotation.x=-Math.PI/2;cloth.position.set(X((a+c)/2),y,Z((b+d)/2));cloth.castShadow=true;cloth.receiveShadow=true;furniture.add(cloth);
}
duvet(329,730,472,865,.485);duvet(585,898,744,951,.47);
// LC3-inspired rounded leather cushions and external tubular steel frame.
rect(1000,695,1246,887,.027,blue,0,furniture,'客厅 · 蓝色地毯');
const binding=new T.MeshStandardMaterial({color:'#1b3270',roughness:1});
for(const r of [[1000,695,1246,696.2],[1000,885.8,1246,887],[1000,695,1001.2,887],[1244.8,695,1246,887]])rect(...r,.029,binding);
function soft(a,b,c,d,h,m,y,name){
  const w=(c-a)/84.4,depth=(d-b)/84.4;
  const mesh=new T.Mesh(new RoundedBoxGeometry(w,h,depth,3,Math.min(.065,h/3)),m);
  mesh.position.set(X((a+c)/2),y+h/2,Z((b+d)/2));mesh.castShadow=true;mesh.receiveShadow=true;furniture.add(mesh);
  if(name){mesh.userData.name=name;picks.push(mesh);}
  if(m===leather&&h>.1){
    const radius=.045,points=[];
    for(const [cx,cz,start] of [[w/2-radius,depth/2-radius,0],[-w/2+radius,depth/2-radius,90],[-w/2+radius,-depth/2+radius,180],[w/2-radius,-depth/2+radius,270]]){
      for(let step=0;step<=8;step++){const angle=(start+step*90/8)*Math.PI/180;points.push(new T.Vector3(cx+Math.cos(angle)*radius,h/2-.026,cz+Math.sin(angle)*radius));}
    }
    const seam=new T.LineLoop(new T.BufferGeometry().setFromPoints(points),new T.LineBasicMaterial({color:'#47484a'}));mesh.add(seam);
  }
  return mesh;
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
function bathroom(a){rect(a+12,299,a+125,396,.018,mat('#aebeb8'));windowLine(a+12,399,a+125,403,.18,.83,false);rect(a+14,432,a+45,460,.36,linen,0,furniture,'卫生间 · 坐便器');const seat=cyl(a+30,456,.19,.12,linen,.3);seat.scale.z=1.3;rect(a+10,490,a+63,542,.76,black,0,furniture,'卫生间 · 洗手台');const ceramic=new T.MeshPhysicalMaterial({color:'#f4f1e9',roughness:.18,clearcoat:.4,side:T.DoubleSide});
const profile=[[.025,.014],[.15,.014],[.215,.035],[.225,.09],[.205,.10],[.185,.048],[.025,.025]].map(([r,h])=>new T.Vector2(r,h));
const basin=new T.Mesh(new T.LatheGeometry(profile,40),ceramic);basin.position.set(X(a+35),.76,Z(512));basin.castShadow=true;basin.receiveShadow=true;furniture.add(basin);cyl(a+35,512,.022,.007,chrome,.784);cyl(a+35,496,.018,.18,dark,.82);cyl(a+100,314,.035,1.4,dark);cyl(a+100,314,.12,.04,dark,1.4);}bathroom(264);bathroom(647);
cabinet(1248,936,1298.64,986.64,'阳台 · 洗衣机 600 × 600',.85,linen);const drum=new T.Mesh(new T.CylinderGeometry(.21,.21,.025,36),dark);drum.rotation.z=Math.PI/2;drum.position.set(X(1246),.44,Z(965));furniture.add(drum);
const rim=new T.Mesh(new T.TorusGeometry(.213,.023,10,40),chrome);rim.rotation.y=Math.PI/2;rim.position.copy(drum.position);rim.position.x-=.016;furniture.add(rim);
const hatch=new T.Mesh(new T.CircleGeometry(.177,40),new T.MeshPhysicalMaterial({color:'#304048',metalness:.35,roughness:.17,clearcoat:1}));hatch.rotation.y=-Math.PI/2;hatch.position.copy(drum.position);hatch.position.x-=.025;furniture.add(hatch);
rect(1246.5,942,1247.2,979,.075,black,.69);
cabinet(1251,995,1291,1039,'阳台 · 扫地机基站',.45,stone);cyl(1266,1025,.16,.09,dark);
const faucetCurve=new T.CatmullRomCurve3([new T.Vector3(X(924),.9,Z(301)),new T.Vector3(X(924),1.15,Z(301)),new T.Vector3(X(911),1.20,Z(302)),new T.Vector3(X(905),1.13,Z(313))]);
const faucet=new T.Mesh(new T.TubeGeometry(faucetCurve,24,.012,10,false),chrome);faucet.castShadow=true;furniture.add(faucet);
// Three planar mirrors reflect the current viewpoint. Other mirror planes are hidden
// during each capture to bound the cost and avoid recursive mirror rendering.
for(const mesh of picks){if(mesh.material===mirror){mesh.visible=false;mesh.castShadow=false;mesh.receiveShadow=false;}}
const mirrors=[];
for(const [x,z0,z1,bottom,height,east] of [[482.1,345.5,541.5,.1,2.45,true],[579.1,345.5,465.5,.1,2.45,false],[1171.1,159,268,0,2.6,true]]){
  const reflection=new Reflector(new T.PlaneGeometry((z1-z0)/84.4,height),{color:0xaaaaaa,textureWidth:512,textureHeight:512,clipBias:0,multisample:2});
  reflection.material.fragmentShader=reflection.material.fragmentShader.replace('vec4 base = texture2DProj( tDiffuse, vUv );','vec4 base = texture2DProj( tDiffuse, vUv ); base.rgb = clamp(base.rgb, vec3(0.0), vec3(1.05));');
  reflection.position.set(X(x),bottom+height/2,Z((z0+z1)/2));reflection.rotation.y=east?Math.PI/2:-Math.PI/2;
  reflection.userData.name='银色镜面 · 实时平面反射';picks.push(reflection);furniture.add(reflection);mirrors.push(reflection);
  const capture=reflection.onBeforeRender;
  reflection.onBeforeRender=(renderer,scene,camera)=>{
    if(scene.overrideMaterial)return;
    const visibility=mirrors.map(m=>m.visible);
    for(const m of mirrors)if(m!==reflection)m.visible=false;
    try{capture(renderer,scene,camera);}finally{mirrors.forEach((m,i)=>m.visible=visibility[i]);}
  };
}
const ceiling=new T.Group();home.add(ceiling);ceiling.visible=false;
for(const [a,b,c,d] of [[248,270,1319,980],[1152,142,1319,282],[890,980,1319,1054]])rect(a,b,c,d,.08,plaster,CEILING,ceiling);
let interior=false,savedFullHeight=false;
const target=new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType,samples:4});
const composer=new EffectComposer(renderer,target);composer.addPass(new RenderPass(scene,camera));
const ao=new SSAOPass(scene,camera,1,1,16);ao.kernelRadius=.32;ao.minDistance=.001;ao.maxDistance=.018;composer.addPass(ao);
const bloom=new UnrealBloomPass(new T.Vector2(1,1),.25,.45,1.15);composer.addPass(bloom);composer.addPass(new OutputPass());
const lighting=createLighting({scene,home,ceiling,renderer,sun,sky,fill,ground,bloom,X,Z});
renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
// Transparent glass must not occlude the AO normal/depth pass.
const override=ao.overrideVisibility.bind(ao);ao.overrideVisibility=()=>{override();scene.traverse(o=>{if(o.isMesh&&o.material?.transparent)o.visible=false;});};
let dirty=true,renderCount=0,cameraMove=null;
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
function moveCamera(position,target,animate=true){controls.autoRotate=false;document.querySelector('#tour').textContent='镜头巡游';document.querySelector('#tour').setAttribute('aria-pressed','false');
  if(!animate||reducedMotion.matches){camera.position.copy(position);controls.target.copy(target);controls.update();dirty=true;cameraMove=null;return;}
  cameraMove={start:performance.now(),from:camera.position.clone(),to:position.clone(),targetFrom:controls.target.clone(),targetTo:target.clone()};dirty=true;
}
controls.addEventListener('start',()=>cameraMove=null);
controls.addEventListener('change',()=>dirty=true);
function refreshReflections(){renderer.shadowMap.needsUpdate=true;dirty=true;}
function renderFrame(){composer.render();renderCount++;dirty=false;const w=renderer.domElement.clientWidth,h=renderer.domElement.clientHeight;for(const el of labelLayer.children){const p=el.anchor.clone().project(camera);el.style.left=(p.x*.5+.5)*w+'px';el.style.top=(-p.y*.5+.5)*h+'px';el.style.display=(p.z>1||p.z< -1||Math.abs(p.x)>1||Math.abs(p.y)>1||(labelFocus&&el.textContent!==labelFocus))?'none':'';}}
const rooms=[['主卧',378,788,'横向轴线 3400 mm'],['衣帽间',527,436,'横向轴线 2700 mm'],['主卫',344,455,'横向轴线 1800 mm'],['公卫',720,454,'横向轴线 1800 mm'],['次卧',681,776,'横向轴线 2900 mm'],['书房',895,814,'横向轴线 2300 mm'],['客厅',1160,820,'右侧横向轴线 3900 mm'],['餐厨',1126,558,'开放式客餐厨'],['玄关',1229,261,'右上入户，薄柜靠右'],['阳台',1085,1006,'外挑阳台，家政区靠右']];
let labelFocus=null;const labelLayer=document.querySelector('#labels');for(const [name,x,y,desc]of rooms){const el=document.createElement('button');el.className='label';el.textContent=name;el.onclick=()=>{leaveInterior();labelFocus=name;document.querySelector('#detail').textContent=name+' · '+desc;moveCamera(new T.Vector3(X(x)+3,7,Z(y)+6),new T.Vector3(X(x),0,Z(y)));};labelLayer.append(el);el.anchor=new T.Vector3(X(x),.14,Z(y));}
function reset(top=false,animate=true){leaveInterior();labelFocus=null;moveCamera(new T.Vector3(top?0:-12,top?24:16,top?.21:17),new T.Vector3(0,0,.2),animate);}reset(false,false);
for(const b of document.querySelectorAll('[data-view]'))b.onclick=()=>{reset(b.dataset.view==='top');document.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('active',x===b));};
document.querySelector('#walls').onchange=e=>{walls.visible=e.target.checked;refreshReflections();};document.querySelector('#furniture').onchange=e=>{furniture.visible=e.target.checked;refreshReflections();};
document.querySelector('#full-height').onchange=e=>{const full=e.target.checked;leaveInterior();e.target.checked=full;walls.scale.y=full?1:1.15/CEILING;refreshReflections();};document.querySelector('#names').onchange=e=>labelLayer.hidden=!e.target.checked;
document.querySelector('#save').onclick=()=>{renderFrame();const a=document.createElement('a');a.download='户型-3D.png';a.href=renderer.domElement.toDataURL();a.click();};
const ray=new T.Raycaster(),pointer=new T.Vector2();let down;renderer.domElement.addEventListener('pointerdown',e=>down=[e.clientX,e.clientY]);renderer.domElement.addEventListener('pointerup',e=>{if(!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>5)return;const r=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);ray.setFromCamera(pointer,camera);const hit=furniture.visible?ray.intersectObjects(picks.filter(o=>o.visible))[0]:null;if(hit)document.querySelector('#detail').textContent=hit.object.userData.name;});
function resize(){const v=document.querySelector('#view');renderer.setSize(v.clientWidth,v.clientHeight);camera.aspect=v.clientWidth/v.clientHeight;const baseFov=interior?62:36;camera.fov=camera.aspect<1?T.MathUtils.radToDeg(2*Math.atan(Math.tan(T.MathUtils.degToRad(baseFov/2))/camera.aspect)):baseFov;camera.updateProjectionMatrix();composer.setSize(v.clientWidth,v.clientHeight);dirty=true;}addEventListener('resize',resize);resize();
let lastFrame=performance.now();
renderer.setAnimationLoop(now=>{
  const delta=Math.min((now-lastFrame)/1000,.05);lastFrame=now;
  if(cameraMove){
    const t=Math.min((now-cameraMove.start)/850,1),ease=t*t*(3-2*t);
    camera.position.lerpVectors(cameraMove.from,cameraMove.to,ease);controls.target.lerpVectors(cameraMove.targetFrom,cameraMove.targetTo,ease);dirty=true;
    if(t===1)cameraMove=null;
  }
  controls.update(delta);if(dirty)renderFrame();
});
window.floorplan={scene,camera,controls,renderer,composer,ao,bloom,lighting,mirrors,ceiling,rooms,reset,walls,furniture,renderFrame,get renderCount(){return renderCount;},get moving(){return !!cameraMove;}};document.querySelector('#status').textContent='实时光照 · 本地效果预览';
const closeViews={living:[1120,780,-3.8,5,5.7],wardrobe:[530,420,0,3.7,2.9],entry:[1220,250,-.3,3.6,3.2],kitchen:[925,370,2.4,4.8,4.8]};
for(const button of document.querySelectorAll('[data-focus]'))button.onclick=()=>{
  leaveInterior();labelFocus={living:'客厅',wardrobe:'衣帽间',entry:'玄关',kitchen:'餐厨'}[button.dataset.focus];const [x,z,dx,h,dz]=closeViews[button.dataset.focus];moveCamera(new T.Vector3(X(x)+dx,h,Z(z)+dz),new T.Vector3(X(x),button.dataset.focus==='kitchen'?1.15:.45,Z(z)));
  document.querySelector('#detail').textContent=button.textContent+' · 拖动查看材质与细节';
  document.querySelectorAll('[data-view]').forEach(b=>b.classList.remove('active'));
};

function chooseLighting(mode){
  lighting.setMode(mode);dirty=true;
  document.querySelectorAll('[data-lighting]').forEach(b=>{b.classList.toggle('active',b.dataset.lighting===mode);b.setAttribute('aria-pressed',String(b.dataset.lighting===mode));});
}
for(const button of document.querySelectorAll('[data-lighting]'))button.onclick=()=>chooseLighting(button.dataset.lighting);
document.querySelector('#indoor').onchange=e=>{lighting.setEnabled(e.target.checked);dirty=true;};
document.querySelector('#exposure').oninput=e=>{lighting.setExposure(Number(e.target.value));document.querySelector('#exposure-value').textContent=Number(e.target.value).toFixed(2);dirty=true;};
document.querySelector('#tour').onclick=()=>{
  controls.autoRotate=!controls.autoRotate;controls.autoRotateSpeed=.45;if(!controls.autoRotate){controls.enableDamping=false;controls.update();controls.enableDamping=true;}
  document.querySelector('#tour').textContent=controls.autoRotate?'停止巡游':'镜头巡游';document.querySelector('#tour').setAttribute('aria-pressed',String(controls.autoRotate));dirty=true;
};
document.querySelector('#fullscreen').onclick=async()=>{
  try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}
  catch(error){document.querySelector('#detail').textContent='浏览器未能开启全屏：'+error.message;}
};
addEventListener('keydown',event=>{
  if(event.target.matches('input,button,select,textarea')||event.metaKey||event.ctrlKey||event.altKey)return;
  const modes={'1':'day','2':'dusk','3':'night'};
  if(modes[event.key])chooseLighting(modes[event.key]);
  if(event.key.toLowerCase()==='r')reset();
});
chooseLighting('dusk');

function leaveInterior(){
  if(!interior)return;
  interior=false;ceiling.visible=false;document.querySelector('#full-height').checked=savedFullHeight;walls.scale.y=savedFullHeight?1:1.15/CEILING;
  resize();refreshReflections();
}
document.querySelector('#interior').onclick=()=>{
  if(!interior)savedFullHeight=document.querySelector('#full-height').checked;interior=true;ceiling.visible=true;walls.visible=true;walls.scale.y=1;document.querySelector('#full-height').checked=true;document.querySelector('#walls').checked=true;
  labelFocus='客厅';controls.autoRotate=false;document.querySelector('#tour').textContent='镜头巡游';document.querySelector('#tour').setAttribute('aria-pressed','false');
  resize();refreshReflections();moveCamera(new T.Vector3(X(1088),1.65,Z(868)),new T.Vector3(X(1230),1.15,Z(744)));
  document.querySelector('#detail').textContent='室内视角 · 拖动环顾，点击立体返回全屋';
  document.querySelectorAll('[data-view]').forEach(b=>b.classList.remove('active'));
};

document.querySelector('#entry-view').onclick=()=>{
  if(!interior)savedFullHeight=document.querySelector('#full-height').checked;
  interior=true;ceiling.visible=true;walls.visible=true;walls.scale.y=1;document.querySelector('#full-height').checked=true;document.querySelector('#walls').checked=true;
  labelFocus='餐厨';resize();refreshReflections();
  moveCamera(new T.Vector3(X(1040),1.65,Z(770)),new T.Vector3(X(1170),1.36,Z(430)));
  document.querySelector('#detail').textContent='客厅看向入户 · 左侧白色与银灰冰箱，右侧银色餐边柜';
  document.querySelectorAll('[data-view]').forEach(b=>b.classList.remove('active'));
};
