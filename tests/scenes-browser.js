(async () => {
 const c=document.getElementById('card');
 const deadline=performance.now()+10000;
 while(!c._model){if(performance.now()>deadline)throw Error('model timeout');await new Promise(r=>setTimeout(r,40));}
 const check=(ok,msg)=>{if(!ok)throw Error(msg);};
 const climates=c._config.markers.filter(m=>m.entity.startsWith('climate.'));
 check(climates.length===5 && climates.every(m=>m.source==='小米'), 'Duplicate AC controls');
 check(c._config.markers.filter(m=>m.entity.startsWith('cover.')).length===2,'Missing bedroom curtains');
 const buttons=[...c.shadowRoot.querySelectorAll('.scenes .scene')].filter(b=>b.querySelector('span'));
 check(buttons.length===7,'Missing scenes');
 const calls=[];
 c._hass.callService=async (...args)=>calls.push(args);
 for(let i=0;i<buttons.length;i++){
  await c._runScene(c._config.scenes[i],buttons[i]);
  check(calls.at(-1)[0]==='script' && calls.at(-1)[1]==='turn_on','Wrong service');
  check(calls.at(-1)[2].entity_id[0]===c._config.scenes[i].targets[0],'Wrong scene');
 }
 c._hass.callService=async()=>{throw Error('rejected');};
 await c._runScene(c._config.scenes[0],buttons[0]);
 check(buttons[0].textContent.includes('失败')&&!buttons[0].hasAttribute('aria-busy'),'Failure recovery');
 c._hass.states[c._config.scenes[0].targets[0]].state='unavailable';
 await c._runScene(c._config.scenes[0],buttons[0]);
 check(buttons[0].textContent.includes('不可用'),'Unavailable scene');
 const box=c.shadowRoot.querySelector('.scenes').getBoundingClientRect();
 check(box.left>=0 && box.right<=innerWidth && box.bottom<=innerHeight,'Scene buttons clip');
 return {scenes:7,airConditioners:5,curtains:2,routing:'passed',failures:'passed',fits:true};
})()
