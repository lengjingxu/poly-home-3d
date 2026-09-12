(async () => {
  const c = document.getElementById('card');
  const deadline = performance.now() + 10000;
  while (!c._model) {
    if (performance.now() > deadline) throw Error('Model did not load');
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  const check = (ok, message) => { if (!ok) throw Error(message); };
  const ids = c._config.markers.filter(m => m.entity.startsWith('light.')).map(m => m.entity);
  for (const id of ids) c._hass.states[id].attributes = {};
  const attrs = { supported_color_modes: ['color_temp'], min_color_temp_kelvin: 2700, max_color_temp_kelvin: 6500 };
  c._hass.states[ids[0]] = { state: 'off', attributes: { ...attrs } };
  c._hass.states[ids[1]] = { state: 'on', attributes: { ...attrs, max_color_temp_kelvin: 4000 } };
  c._hass.states[ids[2]] = { state: 'unavailable', attributes: { ...attrs } };
  c._hass.states[ids[3]] = { state: 'on', attributes: { ...attrs, min_color_temp_kelvin: undefined } };
  c._hass.states[ids[4]] = { state: 'unknown', attributes: { ...attrs } };
  c._hass.states[ids[5]] = { state: 'on', attributes: { ...attrs, supported_color_modes: ['brightness'] } };
  const calls = [];
  c._hass.callService = async (domain, service, data) => { calls.push({domain, service, data}); };
  c.shadowRoot.querySelector('.temperature-open').click();
  const panel = c.shadowRoot.querySelector('.temperature-panel');
  const slider = panel.querySelector('input');
  check(panel.open && slider.min === '2700' && slider.max === '6500', 'Wrong panel/range');
  slider.value = 5000;
  slider.dispatchEvent(new Event('input'));
  check(calls.length === 0 && panel.querySelector('output').textContent === '5000 K', 'Input sent commands');
  await c._setTemperature(5000);
  check(calls.length === 2 && calls.every(x => x.domain === 'light' && x.service === 'turn_on'), 'Wrong targets/services');
  check(calls[0].data.color_temp_kelvin === 5000 && calls[1].data.color_temp_kelvin === 4000, 'Missing per-light clamp');
  check(new Set(calls.map(x => x.data.entity_id)).size === 2, 'Duplicate room/marker targets');
  c._hass.callService = async () => { throw Error('HA rejected'); };
  await c._setTemperature(3000);
  check(panel.querySelector('.temperature-status').textContent.includes('调节失败 2') && !slider.disabled, 'Failure not surfaced/recovered');
  for (const id of ids) c._hass.states[id].state = 'unavailable';
  c._paintTemperature();
  check(slider.disabled, 'Empty control remains enabled');
  await c._setTemperature(5000);
  check(calls.length === 2, 'Empty target sent calls');
  const b = panel.getBoundingClientRect();
  check(b.left >= 0 && b.right <= innerWidth && b.bottom <= innerHeight, 'Panel clips');
  return { targets: 'passed', clamp: 'passed', failures: 'passed', empty: 'passed', panelFits: true };
})()
