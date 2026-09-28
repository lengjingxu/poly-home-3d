import * as T from 'three';
// Fixed integer hash keeps offline materials reproducible, with no image downloads.
const noise=(x,y)=>{let h=Math.imul(x+19,374761393)^Math.imul(y+73,668265263);h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967295;};
function map(size,pixel,color=false){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
  const ctx=canvas.getContext('2d'),data=ctx.createImageData(size,size);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const rgb=pixel(x,y),i=(y*size+x)*4;
    data.data[i]=rgb[0];data.data[i+1]=rgb[1];data.data[i+2]=rgb[2];data.data[i+3]=255;
  }
  ctx.putImageData(data,0,0);const t=new T.CanvasTexture(canvas);
  t.wrapS=t.wrapT=T.RepeatWrapping;t.colorSpace=color?T.SRGBColorSpace:T.NoColorSpace;
  t.anisotropy=8;return t;
}
export function makeTextures(){
  const oak=map(512,(x,y)=>{
    const drift=9*Math.sin(y*.008)+3*Math.sin(y*.033),ring=Math.sin((x+drift)*.34)+.35*Math.sin((x+drift)*1.83);
    const v=ring*6+(noise(x,y)-.5)*8;
    return [164+v,126+v*.85,86+v*.65];
  },true);
  const floor=map(1024,(x,y)=>{
    const row=Math.floor(y/64),offset=(row%3)*137,board=Math.floor((x+offset)/384),seed=noise(board,row);
    const seam=y%64<2||(x+offset)%384<2;
    const grain=5*Math.sin(y*2+5*Math.sin(x*.008))+3*Math.sin(y*.53+Math.sin(x*.016));
    const v=grain+(noise(x,y)-.5)*7+seed*18;
    return seam?[103,88,67]:[167+v,139+v*.85,105+v*.7];
  },true);
  const pores=map(256,(x,y)=>{const v=120+noise(x,y)*35+Math.sin(x*.9)*Math.sin(y*.8)*12;return [v,v,v];});
  const weave=map(256,(x,y)=>{const v=110+Math.sin(x*Math.PI/2)*18+Math.sin(y*Math.PI/2)*18+noise(x,y)*12;return [v,v,v];});
  weave.repeat.set(22,22);pores.repeat.set(5,5);
  const plaster=map(256,(x,y)=>{const v=126+noise(x,y)*12;return [v,v,v];});
  plaster.repeat.set(4,4);
  const brushed=map(512,(x,y)=>{const v=160+noise(0,y)*30+noise(x,y)*5;return [v,v,v];});
  return {oak,floor,pores,weave,plaster,brushed};
}
