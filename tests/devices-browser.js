(async () => {
  const c = document.getElementById('card');
  const deadline = performance.now() + 10000;
  while (!c._model || c.shadowRoot.querySelector('.loading')) {
    if (performance.now() > deadline) throw Error('Model did not load');
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  const check = (condition, message) => { if (!condition) throw Error(message); };
  const devices = c._config.markers;
  check(devices.filter(m => m.source === '小米').length === 15, 'Expected all 15 Xiaomi devices');
  check(c._deviceEls.size === devices.length, 'Device list omitted an entity');
  for (const m of devices) {
    check(!!c._hass.states[m.entity], `Unknown demo entity: ${m.entity}`);
    for (const control of m.controls || []) check(!!c._hass.states[control.entity], `Missing control: ${control.entity}`);
  }
  const light = devices.find(m => m.entity === 'light.gdds_cn_2142937389_wy0a02_s_2_light');
  const offline = devices.filter(m => m.source === '小米' && m.entity.startsWith('light.') && m !== light);
  for (const m of offline) c._hass.states[m.entity].state = 'unavailable';
  c._hass.states[light.entity].state = 'on';
  const camera = devices.find(m => m.icon === 'mdi:video');
  const fan = devices.find(m => m.entity.startsWith('fan.'));
  c._hass.states[camera.entity].state = 'on';
  c._hass.states[fan.entity].state = 'on';
  c._applyStates();
  check(c._fixtures.size === 11, 'Only 11 positioned lights should have fixtures');
  check(!c._fixtures.has(camera.entity) && !c._fixtures.has(fan.entity), 'Non-light device produced a fixture');
  check(c._scene.children.filter(o => o.isPointLight).length === 1, 'Camera or fan produced a light');
  check(c.shadowRoot.querySelector('.chips').textContent.includes('1 / 13'), 'Light total counted another device type');
  check(c._markerEls.size === 25, 'Unplaced lights must not get an arbitrary floor pin');
  for (const el of c._markerEls.values()) check(!el.style.transform.includes('NaN'), 'Invalid pin coordinates');

  const calls = [], info = [];
  c._hass.callService = (domain, service, data) => { calls.push({ domain, service, data }); };
  c.addEventListener('hass-more-info', event => info.push(event.detail.entityId));
  c._markerEls.get(light.entity).click();
  check(calls.length === 1 && calls[0].domain === 'light' && calls[0].service === 'toggle'
    && calls[0].data.entity_id === light.entity, 'Xiaomi light called the wrong service');
  for (const m of [camera, devices.find(m => m.entity.startsWith('vacuum.')),
                   devices.find(m => m.entity.startsWith('media_player.')),
                   devices.find(m => m.source === '小米' && m.entity.startsWith('climate.'))]) {
    c._markerEls.get(m.entity).click();
    check(info.at(-1) === m.entity, `Wrong HA control panel for ${m.name}`);
  }
  check(calls.length === 1, 'Opening camera controls toggled a device');
  c._runScene(c._config.scenes.find(s => s.name === '全开'));
  check(calls.at(-1).data.entity_id.includes(light.entity), 'All-on omitted Xiaomi lighting');
  check(!calls.at(-1).data.entity_id.some(id => offline.some(m => m.entity === id)), 'Scene targeted offline lights');
  const bedroom = c._config.rooms.find(r => r.name === '主卧');
  const before = calls.length;
  c._toggleRoom(bedroom);
  check(calls.length === before, 'Offline-only room sent a service call');

  c.shadowRoot.querySelector('.device-open').click();
  const panel = c.shadowRoot.querySelector('.device-panel');
  check(panel.open, 'Device list did not open');
  for (const m of offline) {
    const row = c._deviceEls.get(m.entity);
    check(row.state.textContent === '离线' && row.toggle.disabled, 'Offline state/action is incorrect');
  }
  const unplaced = devices.find(m => m.source === '小米' && !Number.isFinite(m.x));
  c._deviceEls.get(unplaced.entity).row.querySelector('.device-info').click();
  check(!panel.open && info.at(-1) === unplaced.entity, 'Unplaced light has no detail entry');
  c.shadowRoot.querySelector('.device-open').click();
  const remote = devices.find(m => m.controls);
  c._deviceEls.get(remote.entity).row.querySelector('.device-controls button').click();
  check(info.at(-1) === remote.controls[0].entity, 'IR control opens the wrong entity');
  check(calls.length === before, 'Detail view sent a hardware command');
  c.shadowRoot.querySelector('.device-open').click();
  const source = panel.querySelector('.device-source');
  source.value = '小米';
  source.dispatchEvent(new Event('change'));
  check([...c._deviceEls.values()].filter(item => !item.row.hidden).length === 15, 'Xiaomi filter omitted a device');
  const bounds = panel.getBoundingClientRect();
  check(bounds.left >= 0 && bounds.right <= innerWidth && bounds.top >= 0 && bounds.bottom <= innerHeight,
    'Device list clips outside the viewport');
  return { xiaomiDevices: 15, totalDevices: devices.length, positionedDevices: 25,
           lightFixtures: 11, lightingEntities: 13, serviceRouting: 'passed', panelFits: true };
})()
