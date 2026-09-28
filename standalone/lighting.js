import * as T from 'three';
import {RectAreaLightUniformsLib} from 'three/addons/lights/RectAreaLightUniformsLib.js';

export function createLighting({scene,home,ceiling,renderer,sun,sky,fill,ground,bloom,X,Z}) {
  RectAreaLightUniformsLib.init();
  const sources=[],strips=[];
  // Positions are an architectural-lighting preview, not HA device locations.
  for(const [x,z,power,shadow] of [[1130,790,32,true],[1010,490,26,true],[384,786,20,true],[690,800,17,false],[524,426,15,false],[1222,246,13,false]]){
    const light=new T.SpotLight(0xffd4a2,0,5.5,Math.PI*.31,.7,2);
    light.position.set(X(x),2.47,Z(z));light.target.position.set(X(x),.05,Z(z));
    light.castShadow=shadow;light.shadow.mapSize.set(768,768);light.shadow.camera.near=.15;light.shadow.camera.far=6;
    light.shadow.bias=-.00015;light.shadow.normalBias=.018;light.shadow.radius=3;
    light.userData.power=power;home.add(light,light.target);sources.push(light);
    const fitting=new T.Mesh(new T.CylinderGeometry(.095,.095,.045,24),new T.MeshStandardMaterial({color:0x16181d,roughness:.3}));
    fitting.position.set(X(x),2.565,Z(z));ceiling.add(fitting);
    const lensMaterial=new T.MeshStandardMaterial({color:0xffeccb,emissive:0xffc98b,emissiveIntensity:0});
    const lens=new T.Mesh(new T.CylinderGeometry(.066,.066,.006,24),lensMaterial);lens.position.set(X(x),2.539,Z(z));ceiling.add(lens);strips.push(lensMaterial);
  }
  function strip(x,z,w,d,y,power){
    const material=new T.MeshStandardMaterial({color:0xffe0b1,emissive:0xffc98b,emissiveIntensity:0,roughness:.4});
    const mesh=new T.Mesh(new T.BoxGeometry(w,.016,d),material);mesh.position.set(X(x),y,Z(z));home.add(mesh);strips.push(material);
    const light=new T.RectAreaLight(0xffcf97,0,w,d);light.position.copy(mesh.position);light.rotation.x=-Math.PI/2;
    light.userData.power=power;home.add(light);sources.push(light);
  }
  strip(863,748,.025,1.94,1.43,4.5);
  strip(1254,521,.025,1.95,.67,5);
  strip(855,421,.025,2.65,.89,3.5);
  strip(1029,714,.62,.018,2.35,3.5);
  const presets={
    day:{sky:.55,sun:3.1,fill:.6,env:.55,exposure:.95,local:.10,bloom:.10,position:[-5,12,9],sunColor:0xfff0dc,background:0xdddcd6,ground:0xd4d1c9},
    dusk:{sky:.22,sun:2.2,fill:.38,env:.32,exposure:1.0,local:.85,bloom:.25,position:[-8,5,6],sunColor:0xffb469,background:0x252b36,ground:0x303642},
    night:{sky:.09,sun:.26,fill:.21,env:.19,exposure:1.13,local:1,bloom:.32,position:[-4,9,8],sunColor:0x8caaff,background:0x121a26,ground:0x172130}
  };
  let mode='dusk',enabled=true,exposureScale=1;
  function apply(){
    const p=presets[mode];sky.intensity=p.sky;sun.intensity=p.sun;fill.intensity=p.fill;scene.environmentIntensity=p.env;
    sun.color.setHex(p.sunColor);sun.position.set(...p.position);scene.background.setHex(p.background);ground.material.color.setHex(p.ground);
    renderer.toneMappingExposure=p.exposure*exposureScale;bloom.strength=p.bloom;
    for(const light of sources)light.intensity=enabled?light.userData.power*p.local:0;
    for(const material of strips)material.emissiveIntensity=enabled?p.local*5:0;
    renderer.shadowMap.needsUpdate=true;document.body.dataset.lighting=mode;
  }
  function setMode(value){if(!presets[value])throw new Error('Unknown lighting preset');mode=value;apply();}
  function setEnabled(value){enabled=value;apply();}
  function setExposure(value){exposureScale=value;apply();}
  apply();return {setMode,setEnabled,setExposure,sources,get mode(){return mode;},get enabled(){return enabled;}};
}
