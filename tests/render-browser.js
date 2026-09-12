(async () => {
  const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
  const waitFor = async (test) => {
    const deadline = performance.now() + 10000;
    while (!test()) {
      if (performance.now() > deadline) throw Error('Timed out waiting for model');
      await new Promise(resolve => setTimeout(resolve, 40));
    }
  };
  const c = document.getElementById('card');
  await waitFor(() => c._model && !c.shadowRoot.querySelector('.loading'));
  const errors = [];
  const check = (test, message) => { if (!test) errors.push(message); };
  const host = c.shadowRoot.querySelector('.viewport').getBoundingClientRect();
  const canvas = c._renderer.domElement.getBoundingClientRect();
  check(Math.abs(canvas.width - host.width) < 1 && Math.abs(canvas.height - host.height) < 1,
    `Canvas CSS ${canvas.width}x${canvas.height} exceeds viewport ${host.width}x${host.height}`);

  // Reconfiguration must not leave a loop rendering into the next scene.
  const oldRenderer = c._renderer;
  let disposals = 0;
  const dispose = oldRenderer.dispose.bind(oldRenderer);
  oldRenderer.dispose = () => { disposals++; dispose(); };
  c._build();
  c._build();
  await waitFor(() => c._model && !c.shadowRoot.querySelector('.loading'));
  check(disposals === 1, `Previous renderer disposed ${disposals} times`);
  let ticks = 0;
  const tick = c._tickCamera.bind(c);
  c._tickCamera = () => { ticks++; tick(); };
  await frame();
  const before = ticks;
  for (let i = 0; i < 5; i++) await frame();
  check(ticks - before === 5, `Expected 5 render ticks, received ${ticks - before}`);
  const parent = c.parentElement;
  c.remove();
  await frame();
  const stopped = ticks;
  await frame();
  check(ticks === stopped, 'Rendering continued while card was detached');
  parent.append(c);
  await frame();
  await frame();
  check(ticks > stopped, 'Rendering did not resume after reconnect');
  c._tickCamera = tick;
  check(c._scene.children.filter(node => node.children.some(child => child.name === 'Apartment')).length === 1,
    'A stale model was added to the current scene');
  const config = { ...c._config, config_url: undefined }, hass = c._hass;
  const fetch = window.fetch;
  let finishOld;
  try {
    window.fetch = (url, ...args) => {
      if (url === '/test/old-config') return new Promise(resolve => { finishOld = resolve; });
      if (url === '/test/new-config') return Promise.resolve(new Response(JSON.stringify({ ...config, title: 'new' })));
      return fetch(url, ...args);
    };
    c.setConfig({ config_url: '/test/old-config' });
    c.setConfig({ config_url: '/test/new-config' });
    await waitFor(() => c._config.title === 'new' && c._model);
    finishOld(new Response(JSON.stringify({ ...config, title: 'old' })));
    await frame();
    check(c._config.title === 'new', 'An older config replaced the latest config');
  } finally {
    window.fetch = fetch;
  }
  c.setConfig(config);
  c.hass = hass;
  await waitFor(() => c._model && !c.shadowRoot.querySelector('.loading'));

  // HA's expanded/collapsed sidebar, and resize during a focus transition.
  for (const inset of [56, 256, 0]) {
    parent.style.inset = `56px 0px 0px ${inset}px`;
    c._resize();
    const h = c.shadowRoot.querySelector('.viewport').getBoundingClientRect();
    const r = c._renderer.domElement.getBoundingClientRect();
    check(Math.abs(r.width-h.width)<1 && Math.abs(r.height-h.height)<1, 'HA canvas size mismatch');
    const p = c._project(c._controls.target.x, c._controls.target.y, c._controls.target.z, r);
    check(Math.abs(r.left+p.x-innerWidth/2)<2 && Math.abs(r.top+p.y-innerHeight/2)<2, 'HA view is not centered');
    const camera = c._camera.position.clone();
    c._resize();
    check(camera.distanceTo(c._camera.position)<1e-8, 'Unchanged resize moved the camera');
  }
  c._focusRoom('主卧');
  parent.style.inset = '56px 0px 0px 56px';
  c._resize();
  check(!c._anim, 'Resize left an old focus animation running');
  c._focusRoom('全屋');
  await waitFor(() => !c._anim);
  if (errors.length) throw Error(errors.join('\n'));
  return { dpr: devicePixelRatio, width: host.width, height: host.height, renderTicks: 5, reconnect: true };
})()
