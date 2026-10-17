(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const canvas = $('c');
  // Detecta el dispositivo principal por su tipo de puntero. Evita clasificar como
  // móvil a computadoras Windows que tienen pantalla táctil pero usan mouse.
  const isTouch = window.matchMedia('(pointer: coarse)').matches;
  document.body.classList.toggle('touch', isTouch);

  // Si tu modelo sale muy grande o muy chico: http://IP:3000/?escala=2.5
  const params = new URLSearchParams(location.search);
  const parkScale = parseFloat(params.get('escala')) || 1;

  // ---------------------------------------------------------------------------
  // Equipos y armas
  // ---------------------------------------------------------------------------
  // Todos contra todos: cada jugador tiene su propio color según su número
  const PALETTE = ['#3b82c4', '#e4572e', '#4caf50', '#f0c24b', '#9b59b6', '#1abc9c', '#e91e63', '#ff9800'];
  const colorOf = (id) => PALETTE[id % PALETTE.length];

  // rate = ms entre disparos, pellets = balas por disparo, spread = dispersión, range = alcance (m)
  // mag = balas por cargador, reload = ms de recarga
  // recoil = cuánto sube la mira al disparar, kick = cuánto retrocede el arma en la mano
  // flash = tamaño del fogonazo
  // ui = [daño, cadencia, alcance] del 1 al 5, solo para las barritas del menú.
  // El daño real de cada arma lo decide el servidor (server.js).
  const WEAPONS = {
    usp: { name: 'USP .45 Tactical', rate: 240, pellets: 1, spread: 0.004, range: 90, mag: 12, reload: 1300, recoil: 0.014, kick: 0.6, flash: 0.4, ui: [3, 2, 3] },
    leone: { name: 'Leone 12 Gauge Super', rate: 850, pellets: 8, spread: 0.065, range: 35, mag: 7, reload: 2600, recoil: 0.05, kick: 1.2, flash: 1.5, ui: [5, 1, 1] },
    yg1265: { name: 'Leone YG1265 Auto', rate: 300, pellets: 6, spread: 0.07, range: 32, mag: 7, reload: 2400, recoil: 0.035, kick: 0.9, flash: 1.4, ui: [4, 3, 1] },
    mp5: { name: 'MP5 Navy', rate: 80, pellets: 1, spread: 0.02, range: 65, mag: 30, reload: 1700, recoil: 0.007, kick: 0.3, flash: 0.8, ui: [2, 5, 3] },
    mac10: { name: 'MAC-10', rate: 55, pellets: 1, spread: 0.045, range: 45, mag: 32, reload: 1500, recoil: 0.009, kick: 0.3, flash: 0.7, ui: [1, 5, 2] },
    ump45: { name: 'UMP-45', rate: 100, pellets: 1, spread: 0.016, range: 70, mag: 25, reload: 1800, recoil: 0.009, kick: 0.4, flash: 0.8, ui: [3, 4, 3] },
    ak47: { name: 'AK-47', rate: 105, pellets: 1, spread: 0.014, range: 115, mag: 30, reload: 2200, recoil: 0.013, kick: 0.6, flash: 1.1, ui: [4, 4, 4] },
    awp: { name: 'AWP', rate: 1500, pellets: 1, spread: 0, range: 220, mag: 5, reload: 2800, recoil: 0.075, kick: 1.7, flash: 1.3, ui: [5, 1, 5], speed: 500 },
    cuchillo: { name: 'Cuchillo', rate: 480, pellets: 1, spread: 0, range: 2.6, mag: 1, reload: 0, recoil: 0, kick: 1.2, flash: 0, ui: [4, 3, 1], melee: true },
    // --- Armas especiales: solo salen de las cajas. Munición limitada ("mag" = lo que da una caja) ---
    minigun: { name: 'Minigun', rate: 60,   pellets: 3, spread: 0.05, range: 80,  mag: 180, reload: 0, recoil: 0.004, kick: 0.3, flash: 1.1,  ui: [2, 5, 3], special: true, speed: 260 },
    bazuca:  { name: 'Bazuca',  rate: 1600, pellets: 1, spread: 0,    range: 160, mag: 1,   reload: 0, recoil: 0.06,  kick: 1.8, flash: 1.7,  ui: [5, 1, 4], special: true, speed: 45, explosive: true },
    porro:   { name: 'Porro',   rate: 220,  pellets: 1, spread: 0.01, range: 70,  mag: 3,   reload: 0, recoil: 0.006, kick: 0.3, flash: 0.35, ui: [0, 3, 3], special: true, speed: 60 },
  };
  const WEAPON_ORDER = ['usp', 'leone', 'yg1265', 'mp5', 'mac10', 'ump45', 'ak47', 'awp', 'cuchillo'];
  const SPECIAL_ORDER = ['minigun', 'bazuca', 'porro'];

  // ---------------------------------------------------------------------------
  // Escena
  // ---------------------------------------------------------------------------
  const SKY = BABYLON.Color3.FromHexString('#9ec9e8');
  const engine = new BABYLON.Engine(canvas, true, { stencil: false, powerPreference: 'high-performance' });
  if (isTouch) engine.setHardwareScalingLevel(1 / Math.min(2, window.devicePixelRatio || 1)); // nítido en pantallas retina sin pasarse de píxeles
  const scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color4(SKY.r, SKY.g, SKY.b, 1);
  scene.collisionsEnabled = true;
  scene.gravity = new BABYLON.Vector3(0, -0.2, 0);
  scene.fogMode = BABYLON.Scene.FOGMODE_LINEAR;
  scene.fogColor = SKY;
  scene.fogStart = 45;
  scene.fogEnd = 170;

  const hemi = new BABYLON.HemisphericLight('hemi', new BABYLON.Vector3(0, 1, 0), scene);
  hemi.intensity = 0.45;
  const sun = new BABYLON.DirectionalLight('sun', new BABYLON.Vector3(-0.4, -1, -0.3), scene);
  sun.intensity = 1.0;

  // Sombras suaves: el cuadro de sombra (110 m) sigue al jugador
  const SUN_DIR = new BABYLON.Vector3(-0.4, -1, -0.3).normalize();
  sun.autoUpdateExtends = false;
  sun.shadowFrustumSize = 110;
  sun.shadowMinZ = 1;
  sun.shadowMaxZ = 260;
  sun.position.copyFromFloats(0, 120, 0);
  const shadowGen = new BABYLON.ShadowGenerator(isTouch ? 1024 : 2048, sun);
  shadowGen.usePercentageCloserFiltering = true;
  shadowGen.filteringQuality = isTouch ? BABYLON.ShadowGenerator.QUALITY_LOW : BABYLON.ShadowGenerator.QUALITY_MEDIUM;
  shadowGen.bias = 0.0008;
  shadowGen.normalBias = 0.02;
  shadowGen.setDarkness(0);

  const camera = new BABYLON.UniversalCamera('cam', new BABYLON.Vector3(0, 8, 0), scene);
  camera.inputs.clear(); // los controles los manejamos nosotros
  camera.minZ = 0.1;
  camera.maxZ = 400;
  camera.fov = 1.1;
  camera.inertia = 0;
  camera.checkCollisions = true;
  camera.applyGravity = true;
  // El ojo está en la parte alta del elipsoide: 0.85 * 2 = 1.7 m de altura
  camera.ellipsoid = new BABYLON.Vector3(0.4, 0.85, 0.4);

  // Nubes low poly que se mueven y se reciclan alrededor del jugador
  const cloudMat = new BABYLON.StandardMaterial('cloudMat', scene);
  cloudMat.diffuseColor = new BABYLON.Color3(1, 1, 1);
  cloudMat.emissiveColor = new BABYLON.Color3(0.55, 0.57, 0.6);
  cloudMat.specularColor = BABYLON.Color3.Black();
  cloudMat.fogEnabled = false;
  const CLOUD_RANGE = 260;
  const clouds = [];
  for (let i = 0; i < 16; i++) {
    const parts = [];
    const n = 4 + Math.floor(Math.random() * 3);
    for (let j = 0; j < n; j++) {
      const sp = BABYLON.MeshBuilder.CreateIcoSphere('cp', { radius: 1, subdivisions: 1, flat: true }, scene);
      const k = 7 + Math.random() * 7;
      sp.scaling.set(k * 1.5, k * 0.65, k);
      sp.position.set((j - n / 2) * 11 + Math.random() * 4, Math.random() * 4, (Math.random() - 0.5) * 9);
      parts.push(sp);
    }
    const cloud = BABYLON.Mesh.MergeMeshes(parts, true);
    cloud.material = cloudMat;
    cloud.isPickable = false;
    cloud.checkCollisions = false;
    cloud.position.set((Math.random() * 2 - 1) * CLOUD_RANGE, 75 + Math.random() * 35, (Math.random() * 2 - 1) * CLOUD_RANGE);
    clouds.push({ mesh: cloud, speed: 2 + Math.random() * 3 });
  }
  scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(engine.getDeltaTime(), 50) / 1000;
    for (const c of clouds) {
      c.mesh.position.x += c.speed * dt;
      if (c.mesh.position.x > camera.position.x + CLOUD_RANGE) {
        c.mesh.position.x = camera.position.x - CLOUD_RANGE;
        c.mesh.position.z = camera.position.z + (Math.random() * 2 - 1) * CLOUD_RANGE;
      }
      if (c.mesh.position.z > camera.position.z + CLOUD_RANGE) c.mesh.position.z -= CLOUD_RANGE * 2;
      if (c.mesh.position.z < camera.position.z - CLOUD_RANGE) c.mesh.position.z += CLOUD_RANGE * 2;
    }
  });

  function mat(hex) {
    const m = new BABYLON.StandardMaterial('m' + hex, scene);
    m.diffuseColor = BABYLON.Color3.FromHexString(hex);
    m.specularColor = BABYLON.Color3.Black();
    return m;
  }

  function emissiveMat(name, hex) {
    const m = new BABYLON.StandardMaterial(name, scene);
    m.emissiveColor = BABYLON.Color3.FromHexString(hex);
    m.disableLighting = true;
    return m;
  }

  function mulberry32(a) {
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Objetos del mapa de prueba, para dibujarlos en el minimapa
  const mapObjs = [];

  // Mapa de prueba (igual para todos los jugadores porque usa la misma semilla)
  function buildTestMap() {
    const rng = mulberry32(20261013);

    const grassTex = new BABYLON.DynamicTexture('grassTex', 256, scene, true);
    const ctx = grassTex.getContext();
    ctx.fillStyle = '#5f8f4a';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1800; i++) {
      ctx.fillStyle = `hsl(${95 + rng() * 25}, ${35 + rng() * 20}%, ${28 + rng() * 18}%)`;
      ctx.fillRect(rng() * 256, rng() * 256, 2 + rng() * 3, 2 + rng() * 3);
    }
    grassTex.update();
    grassTex.uScale = 48;
    grassTex.vScale = 48;

    const grass = new BABYLON.StandardMaterial('grass', scene);
    grass.diffuseTexture = grassTex;
    grass.specularColor = BABYLON.Color3.Black();
    const ground = BABYLON.MeshBuilder.CreateGround('ground', { width: 240, height: 240 }, scene);
    ground.material = grass;
    ground.checkCollisions = true;
    ground.receiveShadows = true;

    const walkway = BABYLON.MeshBuilder.CreateGround('walkway', { width: 5, height: 240 }, scene);
    walkway.position.y = 0.02;
    walkway.material = mat('#c9b78f');
    walkway.receiveShadows = true;

    const wallMat = mat('#8a8f98');
    [[0, 120, 240, 1], [0, -120, 240, 1], [120, 0, 1, 240], [-120, 0, 1, 240]].forEach(([x, z, w, d], i) => {
      const wall = BABYLON.MeshBuilder.CreateBox('wall' + i, { width: w, depth: d, height: 5 }, scene);
      wall.position.set(x, 2.5, z);
      wall.material = wallMat;
      wall.checkCollisions = true;
      wall.receiveShadows = true;
      shadowGen.addShadowCaster(wall);
      mapObjs.push({ kind: 'box', x, z, w, d, rot: 0 });
    });

    const crateMats = [mat('#a47c4a'), mat('#8a8f98'), mat('#b5523b')];
    for (let i = 0; i < 18; i++) {
      const x = (rng() - 0.5) * 180;
      const z = (rng() - 0.5) * 180;
      const w = 2 + rng() * 3, d = 2 + rng() * 3, h = 1.2 + rng() * 1.8;
      const rot = rng() * Math.PI;
      if (Math.abs(x) < 8 && Math.abs(z) < 8) continue;
      const box = BABYLON.MeshBuilder.CreateBox('crate' + i, { width: w, depth: d, height: h }, scene);
      box.position.set(x, h / 2, z);
      box.rotation.y = rot;
      box.material = crateMats[i % crateMats.length];
      box.checkCollisions = true;
      box.receiveShadows = true;
      shadowGen.addShadowCaster(box);
      mapObjs.push({ kind: 'box', x, z, w, d, rot });
    }

    const trunkMat = mat('#6b4a2f');
    const leafMat = mat('#3f7a3a');
    for (let i = 0; i < 30; i++) {
      const x = (rng() - 0.5) * 200;
      const z = (rng() - 0.5) * 200;
      const h = 3 + rng() * 2.5;
      const crownD = 3.2 + rng() * 1.5;
      if (Math.abs(x) < 6 && Math.abs(z) < 6) continue;
      const trunk = BABYLON.MeshBuilder.CreateCylinder('trunk' + i, { height: h, diameter: 0.5, tessellation: 8 }, scene);
      trunk.position.set(x, h / 2, z);
      trunk.material = trunkMat;
      trunk.checkCollisions = true;
      trunk.receiveShadows = true;
      shadowGen.addShadowCaster(trunk);
      const crown = BABYLON.MeshBuilder.CreateSphere('crown' + i, { diameter: crownD, segments: 8 }, scene);
      crown.position.set(x, h + 0.6, z);
      crown.material = leafMat; // la copa no bloquea el paso, pero sí las balas
      crown.receiveShadows = true;
      shadowGen.addShadowCaster(crown);
      mapObjs.push({ kind: 'tree', x, z, r: crownD / 2 });
    }
  }

  // Tu parque: pon el archivo en public/park.glb
  async function loadPark() {
    const result = await BABYLON.SceneLoader.ImportMeshAsync('', '/', 'park.glb', scene);
    const root = result.meshes[0];
    if (parkScale !== 1) root.scaling.scaleInPlace(parkScale);
    for (const m of result.meshes) {
      if (m.getTotalVertices && m.getTotalVertices() > 0) {
        m.checkCollisions = true;
        m.isPickable = true;
        m.receiveShadows = true;
        shadowGen.addShadowCaster(m);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Estado local
  // ---------------------------------------------------------------------------
  let ws = null;
  let myId = null;
  let killGoal = 10;
  let inLobby = false;
  let myReady = false;
  let mapPromise = null;
  let weapon = 'ak47';
  let inventory = WEAPON_ORDER.slice(); // armas que tienes ahora (las casillas de la barra de abajo)
  let shake = 0; // temblor de pantalla por explosiones
  let dizzyStart = 0;
  let dizzyUntil = 0; // hasta cuándo dura el mareo del porro
  let playing = false;
  let menuOpen = false;
  let editMode = false;
  let uiEdit = false; // modo personalizar botones y HUD
  let hp = 100;
  let spawn = [0, 8, 0];
  let yaw = 0;
  let pitch = 0;
  let firing = false;
  let lastShot = 0;
  let mapReady = false;
  let reloading = false;
  let reloadStart = 0;
  let reloadEnd = 0;
  let moveAmt = 0;
  const ammo = {};
  WEAPON_ORDER.forEach((id) => { ammo[id] = WEAPONS[id].mag; });
  const keys = {};
  const joy = { x: 0, y: 0 };
  const remotes = new Map();
  const streaks = new Map(); // id del jugador -> bajas seguidas sin morir
  const STREAK_FIRE = 3; // con esta racha el nombre se enciende en llamas (igual que en server.js)

  // ---------------------------------------------------------------------------
  // Postura: correr, agacharse y saltar
  // ---------------------------------------------------------------------------
  const STAND_E = 0.85; // semialtura del elipsoide de pie (ojo a 1.7 m)
  const CROUCH_E = 0.55; // agachado (ojo a 1.1 m)
  const PRONE_E = 0.25; // cuerpo a tierra (ojo a 0.5 m del suelo)
  const CROUCH_SPEED = 2.4; // m/s agachado
  const PRONE_SPEED = 1.1; // m/s arrastrándose
  const JUMP_SPEED = 6; // m/s hacia arriba al saltar (sube ~0.9 m)
  const JUMP_GRAVITY = 20; // m/s² durante el salto
  const FALL_SPEED = 14; // caída máxima, igual que antes
  let stanceAmt = 0; // 0 de pie, 1 agachado, 2 cuerpo a tierra (valores intermedios = transición)
  let stanceVel = 0; // velocidad del cambio de postura (positivo = bajando)
  let wantProne = false; // cuerpo a tierra encendido (X en PC, botón en celular)
  let sprinting = false;
  let vy = -FALL_SPEED;
  let airTime = 0;
  let jumpUntil = 0;
  let myFlags = 0; // 1 agachado, 2 corriendo, 4 en el aire
  let touchRun = false;
  let touchCrouch = false;

  // Apuntar (ADS): clic derecho en PC, botón Apuntar en celular
  let aiming = false; // clic derecho mantenido
  let touchAim = false; // botón Apuntar encendido
  let adsAmt = 0; // 0 = disparo desde la cadera, 1 = apuntando
  let zoomLevel = 0; // francotirador: 0 = zoom bajo, 1 = zoom alto
  let sensMul = 1; // la sensibilidad baja al hacer zoom
  let scopeShown = false;
  let crossHidden = false;
  const SNIPER_ZOOM = [{ fov: 0.3, label: 'x4' }, { fov: 0.1, label: 'x11' }];
  const SCOPE_ZOOM = [{ fov: 0.3, label: 'x3' }, { fov: 0.2, label: 'x4.5' }];
  const SCOPED = { awp: SNIPER_ZOOM }; // armas con mira telescópica
  const ADS_FOV = { usp: 0.6, leone: 0.62, yg1265: 0.6, mp5: 0.55, mac10: 0.62, ump45: 0.55, ak47: 0.5, cuchillo: 1.05, minigun: 0.7, bazuca: 0.7, porro: 0.75 };

  const probe = new BABYLON.Ray(new BABYLON.Vector3(), new BABYLON.Vector3(0, -1, 0), 1);
  const solid = (m) => m.checkCollisions && m.isEnabled() && !(m.metadata && m.metadata.noSolid);

  function groundDistance(eyeH) {
    probe.origin.copyFrom(camera.position);
    probe.direction.set(0, -1, 0);
    probe.length = eyeH + 0.6;
    const p = scene.pickWithRay(probe, solid);
    return p && p.hit ? p.distance : Infinity;
  }

  // Semialtura del cuerpo para un nivel de postura (0 de pie, 1 agachado, 2 cuerpo a tierra)
  function stanceE(level) {
    if (level <= 1) return STAND_E - (STAND_E - CROUCH_E) * level;
    return CROUCH_E - (CROUCH_E - PRONE_E) * (level - 1);
  }

  // ¿Hay algo encima que impida crecer hasta la semialtura toE? (por defecto, ponerse de pie)
  function headBlocked(toE) {
    const need = 2 * ((toE === undefined ? STAND_E : toE) - camera.ellipsoid.y) + 0.1;
    if (need <= 0.1) return false;
    probe.origin.copyFrom(camera.position);
    probe.direction.set(0, 1, 0);
    probe.length = need;
    const p = scene.pickWithRay(probe, solid);
    return !!(p && p.hit);
  }

  // Cambia la altura del cuerpo manteniendo los pies en su sitio (el ojo está arriba del elipsoide)
  function applyCrouchShape() {
    const e = stanceE(stanceAmt);
    const d = e - camera.ellipsoid.y;
    if (Math.abs(d) > 1e-5) {
      camera.ellipsoid.y = e;
      camera.position.y += 2 * d;
    }
  }

  function resetStance() {
    stanceAmt = 0;
    stanceVel = 0;
    wantProne = false;
    nadeAiming = false;
    sprinting = false;
    vy = -FALL_SPEED;
    airTime = 0;
    jumpUntil = 0;
    camera.ellipsoid.y = STAND_E;
    dizzyUntil = 0;
    touchRun = false;
    touchCrouch = false;
    aiming = false;
    touchAim = false;
    adsAmt = 0;
    syncActionBtns();
  }

  // Botones táctiles: Correr y Agachar se encienden/apagan; Saltar es un toque
  const runBtn = $('runBtn');
  const crouchBtn = $('crouchBtn');
  const jumpBtn = $('jumpBtn');
  const aimBtn = $('aimBtn');
  const proneBtn = $('proneBtn');

  function syncActionBtns() {
    proneBtn.classList.toggle('on', wantProne);
    proneBtn.setAttribute('aria-pressed', String(wantProne));
    runBtn.classList.toggle('on', touchRun);
    crouchBtn.classList.toggle('on', touchCrouch);
    aimBtn.classList.toggle('on', touchAim);
    runBtn.setAttribute('aria-pressed', String(touchRun));
    crouchBtn.setAttribute('aria-pressed', String(touchCrouch));
  }

  function onPress(btn, fn) {
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!playing || menuOpen || editMode) return;
      btn.classList.add('down');
      fn();
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((n) =>
      btn.addEventListener(n, () => btn.classList.remove('down')));
  }
  onPress(runBtn, () => { touchRun = !touchRun; if (touchRun) { touchCrouch = false; wantProne = false; } syncActionBtns(); });
  onPress(crouchBtn, () => { touchCrouch = !touchCrouch; if (touchCrouch) { touchRun = false; wantProne = false; } syncActionBtns(); });
  // Cuerpo a tierra: se enciende y apaga (también te levantas con Saltar, Correr o Agachar)
  onPress(proneBtn, () => { wantProne = !wantProne; if (wantProne) { touchRun = false; touchCrouch = false; } syncActionBtns(); });
  onPress(jumpBtn, () => { jumpUntil = performance.now() + 180; });
  // Apuntar: se enciende y apaga. Con el francotirador, tocarlo de nuevo cambia al zoom alto
  onPress(aimBtn, () => {
    if (SCOPED[weapon] && touchAim) {
      if (zoomLevel === 0) zoomLevel = 1;
      else { touchAim = false; zoomLevel = 0; }
    } else {
      touchAim = !touchAim;
    }
    syncActionBtns();
  });

  // ---------------------------------------------------------------------------
  // Sonido
  // ---------------------------------------------------------------------------
  let audioCtx = null;
  function blip(freq, dur, type, gain, delay, endFreq) {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const t = audioCtx.currentTime + (delay || 0);
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(audioCtx.destination);
      o.start(t);
      o.stop(t + dur + 0.02);
    } catch { /* sin audio */ }
  }

  const SILENCED = { usp: true, mac10: true }; // armas con silenciador
  function shotSound(id) {
    if (SILENCED[id]) { blip(650, 0.05, 'sine', 0.025, 0, 280); blip(220, 0.04, 'triangle', 0.02, 0.01, 120); return; }
    if (id === 'minigun') { blip(380, 0.06, 'square', 0.09, 0, 120); return; }
    if (id === 'bazuca') { blip(170, 0.5, 'sawtooth', 0.22, 0, 40); blip(700, 0.3, 'square', 0.06, 0, 150); return; }
    if (id === 'porro') { blip(520, 0.22, 'sine', 0.1, 0, 220); return; }
    if (id === 'cuchillo') { blip(900, 0.12, 'sawtooth', 0.07, 0, 300); return; }
    const heavy = id === 'leone' || id === 'yg1265' || id === 'awp';
    blip(heavy ? 260 : 420, heavy ? 0.24 : 0.14, heavy ? 'sawtooth' : 'square', heavy ? 0.2 : 0.12, 0, heavy ? 55 : 90);
  }

  function reloadSound() {
    blip(900, 0.04, 'square', 0.06, 0.15);
    blip(600, 0.05, 'square', 0.07, 0.8);
  }

  // ---------------------------------------------------------------------------
  // Jugadores remotos
  // ---------------------------------------------------------------------------
  // Armas que se ven en las manos de los demás jugadores (versión sencilla)
  // k: 'box' (ancho, alto, largo) o 'cyl' (diámetro, largo); p: posición; c: color
  const gb = (w, h, d, x, y, z, c, r) => ({ k: 'box', s: [w, h, d], p: [x, y, z], c, r });
  const gc = (dia, len, x, y, z, c) => ({ k: 'cyl', s: [dia, len], p: [x, y, z], c });
  const GD = '#2b2d31', GK = '#1a1b1e', GM = '#4a4f57', GS = '#9aa0a8', GG = '#3b3d42', GL = '#8d5b30', GO = '#3f4a3a', GBL = '#c8ced6';
  const REMOTE_GUNS = {
    usp: [
      gb(0.034, 0.036, 0.22, 0, 0.032, 0.115, GG), gb(0.036, 0.024, 0.19, 0, 0.004, 0.105, GK),
      gb(0.034, 0.1, 0.05, 0, -0.055, 0.03, GK, -0.2), gb(0.02, 0.01, 0.055, 0, -0.012, 0.11, GK),
      gc(0.016, 0.04, 0, 0.03, 0.245, GS), gc(0.034, 0.15, 0, 0.03, 0.34, GK),
      gb(0.012, 0.014, 0.014, 0, 0.056, 0.02, GK), gb(0.006, 0.01, 0.012, 0, 0.056, 0.2, GK),
    ],
    leone: [
      gb(0.05, 0.09, 0.26, 0, 0, 0.1, GD), gc(0.03, 0.6, 0, 0.026, 0.56, GM), gc(0.034, 0.5, 0, -0.024, 0.5, GD),
      gb(0.06, 0.055, 0.18, 0, -0.024, 0.42, GK), gb(0.044, 0.09, 0.3, 0, -0.012, -0.2, GK, 0.1),
      gb(0.036, 0.1, 0.045, 0, -0.085, 0.01, GK, -0.25), gb(0.012, 0.02, 0.05, 0, 0.056, 0.06, GK),
      gb(0.008, 0.016, 0.008, 0, 0.056, 0.84, GS),
    ],
    yg1265: [
      gb(0.056, 0.1, 0.32, 0, 0, 0.12, GK), gb(0.058, 0.02, 0.12, 0, 0.034, 0.16, GM),
      gc(0.03, 0.5, 0, 0.028, 0.55, GM), gc(0.036, 0.46, 0, -0.026, 0.5, GD), gb(0.07, 0.06, 0.2, 0, -0.026, 0.42, GG),
      gb(0.05, 0.1, 0.34, 0, -0.012, -0.24, GK, 0.08), gb(0.038, 0.11, 0.05, 0, -0.1, 0.0, GK, -0.25),
      gb(0.01, 0.012, 0.4, 0, 0.056, 0.46, GS), gb(0.014, 0.022, 0.03, 0, 0.066, 0.05, GK), gb(0.008, 0.016, 0.008, 0, 0.07, 0.8, GK),
    ],
    mp5: [
      gb(0.05, 0.076, 0.34, 0, 0.012, 0.2, GD), gb(0.064, 0.072, 0.17, 0, 0.0, 0.47, GK), gc(0.022, 0.08, 0, 0.02, 0.6, GM),
      gb(0.03, 0.1, 0.046, 0, -0.095, 0.21, GD, 0.08), gb(0.03, 0.08, 0.046, 0, -0.17, 0.228, GD, 0.24),
      gb(0.034, 0.1, 0.046, 0, -0.09, 0.06, GK, -0.25), gc(0.03, 0.2, 0, 0.012, -0.2, GM), gb(0.04, 0.09, 0.03, 0, 0.0, -0.32, GK),
      gb(0.022, 0.026, 0.03, 0, 0.065, 0.2, GK), gb(0.006, 0.026, 0.006, 0, 0.066, 0.57, GK),
    ],
    mac10: [
      gb(0.05, 0.1, 0.2, 0, 0.0, 0.1, GD), gb(0.042, 0.022, 0.2, 0, 0.056, 0.1, GK), gb(0.03, 0.16, 0.05, 0, -0.1, 0.11, GK),
      gc(0.05, 0.24, 0, 0.02, 0.32, GK), gb(0.01, 0.01, 0.2, 0.022, 0.025, -0.1, GS), gb(0.01, 0.01, 0.2, -0.022, 0.025, -0.1, GS),
      gb(0.05, 0.012, 0.012, 0, 0.025, -0.2, GS), gb(0.012, 0.02, 0.012, 0, 0.07, 0.19, GK), gb(0.012, 0.018, 0.02, 0, 0.07, 0.01, GK),
    ],
    ump45: [
      gb(0.056, 0.09, 0.36, 0, 0.0, 0.2, GG), gb(0.022, 0.016, 0.36, 0, 0.054, 0.2, GK), gb(0.056, 0.07, 0.15, 0, -0.006, 0.45, GD),
      gc(0.028, 0.14, 0, 0.012, 0.6, GM), gb(0.036, 0.2, 0.05, 0, -0.14, 0.22, GK), gb(0.036, 0.1, 0.046, 0, -0.09, 0.05, GK, -0.25),
      gc(0.02, 0.26, 0, 0.006, -0.18, GM), gb(0.04, 0.095, 0.03, 0, 0.0, -0.32, GK),
      gb(0.008, 0.02, 0.008, 0, 0.066, 0.6, GK), gb(0.02, 0.016, 0.03, 0, 0.066, 0.06, GK),
    ],
    ak47: [
      gb(0.05, 0.088, 0.32, 0, 0.0, 0.12, GG), gb(0.042, 0.018, 0.3, 0, 0.052, 0.12, GD),
      gb(0.056, 0.05, 0.22, 0, -0.016, 0.46, GL), gb(0.05, 0.034, 0.2, 0, 0.032, 0.47, GL),
      gc(0.016, 0.3, 0, 0.056, 0.56, GM), gc(0.022, 0.26, 0, 0.03, 0.74, GM), gb(0.012, 0.04, 0.012, 0, 0.066, 0.84, GK),
      gc(0.03, 0.05, 0, 0.03, 0.89, GK), gb(0.04, 0.1, 0.05, 0, -0.1, 0.19, GK, 0.1), gb(0.04, 0.09, 0.05, 0, -0.18, 0.25, GK, 0.4),
      gb(0.036, 0.1, 0.046, 0, -0.09, 0.0, GL, -0.3), gb(0.046, 0.1, 0.3, 0, -0.016, -0.2, GL, 0.1), gb(0.02, 0.016, 0.04, 0, 0.068, 0.28, GK),
    ],
    awp: [
      gb(0.056, 0.1, 0.46, 0, 0.0, 0.12, GO), gc(0.034, 0.66, 0, 0.02, 0.68, GK), gc(0.046, 0.1, 0, 0.02, 1.04, GK),
      gc(0.056, 0.32, 0, 0.1, 0.16, GK), gc(0.07, 0.04, 0, 0.1, 0.33, GK), gc(0.064, 0.04, 0, 0.1, 0.0, GK),
      gb(0.03, 0.03, 0.04, 0, 0.065, 0.06, GK), gb(0.03, 0.03, 0.04, 0, 0.065, 0.26, GK),
      gb(0.05, 0.014, 0.014, 0.042, 0.03, 0.0, GS), gb(0.02, 0.02, 0.02, 0.075, 0.03, 0.0, GS),
      gb(0.05, 0.12, 0.36, 0, -0.03, -0.3, GO), gb(0.04, 0.07, 0.1, 0, -0.085, 0.16, GK), gb(0.04, 0.1, 0.05, 0, -0.09, -0.05, GO, -0.3),
    ],
    cuchillo: [
      gb(0.03, 0.034, 0.13, 0, 0, 0.0, GK), gb(0.05, 0.022, 0.014, 0, 0, 0.07, GS), gb(0.01, 0.036, 0.2, 0, -0.004, 0.18, GBL),
      gb(0.012, 0.012, 0.2, 0, 0.016, 0.18, GS), gb(0.01, 0.026, 0.05, 0, 0.0, 0.305, GBL, 0.5),
    ],
  };
  // Cómo se sostiene cada arma en tu mano: mano derecha, mano izquierda y altura de la mira al apuntar
  const VMCFG = {
    usp: { right: [0, -0.08, 0.04], left: null, ads: 0.058 },
    leone: { right: [0, -0.085, 0.02], left: [0, -0.07, 0.42], ads: 0.07 }, yg1265: { right: [0, -0.09, 0.02], left: [0, -0.07, 0.42], ads: 0.075 },
    mp5: { right: [0, -0.095, 0.06], left: [0, -0.06, 0.47], ads: 0.078 }, mac10: { right: [0, -0.1, 0.11], left: null, ads: 0.08 },
    ump45: { right: [0, -0.095, 0.05], left: [0, -0.06, 0.45], ads: 0.075 }, ak47: { right: [0, -0.095, 0.01], left: [0, -0.06, 0.48], ads: 0.078 },
    awp: { right: [0, -0.09, -0.05], left: [0, -0.04, 0.45], ads: 0.1 },
    cuchillo: { right: [0, -0.03, 0.0], left: null, ads: 0 },
  };

  // Armas especiales (cajas): se ven en la mano de los demás, en la barra de abajo y flotando sobre las cajas
  Object.assign(REMOTE_GUNS, {
    minigun: [
      { k: 'box', s: [0.1, 0.1, 0.3], p: [0, 0, 0.05], c: '#2b2d31' },
      { k: 'cyl', s: [0.11, 0.5], p: [0, 0, 0.42], c: '#4a4f57' },
      { k: 'cyl', s: [0.14, 0.04], p: [0, 0, 0.3], c: '#2b2d31' },
      { k: 'cyl', s: [0.14, 0.04], p: [0, 0, 0.62], c: '#2b2d31' },
      { k: 'box', s: [0.04, 0.14, 0.05], p: [0, -0.11, 0.02], c: '#2b2d31' },
      { k: 'box', s: [0.14, 0.14, 0.16], p: [0, -0.12, -0.12], c: '#6b4a2f' },
    ],
    bazuca: [
      { k: 'cyl', s: [0.16, 1.0], p: [0, 0.05, 0.35], c: '#4b5d3a' },
      { k: 'cyl', s: [0.2, 0.08], p: [0, 0.05, -0.15], c: '#2b2d31' },
      { k: 'cyl', s: [0.19, 0.08], p: [0, 0.05, 0.85], c: '#2b2d31' },
      { k: 'cyl', s: [0.09, 0.2], p: [0, 0.05, 0.97], c: '#c1121f' },
      { k: 'box', s: [0.03, 0.06, 0.1], p: [0, 0.15, 0.35], c: '#2b2d31' },
      { k: 'box', s: [0.05, 0.14, 0.06], p: [0, -0.07, 0.3], c: '#2b2d31' },
    ],
    porro: [
      { k: 'cyl', s: [0.05, 0.5], p: [0, 0, 0.25], c: '#f2efe4' },
      { k: 'cyl', s: [0.056, 0.07], p: [0, 0, 0.53], c: '#ff6a1a' },
      { k: 'box', s: [0.03, 0.03, 0.06], p: [0, 0, -0.03], c: '#e8e0c8' },
      { k: 'box', s: [0.025, 0.025, 0.03], p: [0, 0.03, 0.15], c: '#3a8f2a' },
      { k: 'box', s: [0.025, 0.025, 0.03], p: [0, 0.03, 0.32], c: '#3a8f2a' },
    ],
  });

  const gunMatCache = {};
  const gunMat = (hex) => gunMatCache[hex] || (gunMatCache[hex] = mat(hex));

  function gunBounds(id) {
    const rects = REMOTE_GUNS[id].map((p) => (p.k === 'box'
      ? { z0: p.p[2] - p.s[2] / 2, z1: p.p[2] + p.s[2] / 2, y0: p.p[1] - p.s[1] / 2, y1: p.p[1] + p.s[1] / 2, c: p.c }
      : { z0: p.p[2] - p.s[1] / 2, z1: p.p[2] + p.s[1] / 2, y0: p.p[1] - p.s[0] / 2, y1: p.p[1] + p.s[0] / 2, c: p.c }));
    return {
      rects,
      minZ: Math.min(...rects.map((r) => r.z0)), maxZ: Math.max(...rects.map((r) => r.z1)),
      minY: Math.min(...rects.map((r) => r.y0)), maxY: Math.max(...rects.map((r) => r.y1)),
    };
  }

  const gunIcons = new Map(); // id -> imagen del modelo .glb visto de lado
  const iconCvs = {};

  function drawIconImg(cv, img) {
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, cv.width, cv.height);
    const k = Math.min((cv.width - 8) / img.width, (cv.height - 8) / img.height);
    const w = img.width * k;
    const hh = img.height * k;
    ctx.drawImage(img, (cv.width - w) / 2, (cv.height - hh) / 2, w, hh);
  }

  // Dibuja el arma de lado en una casilla de la barra de abajo
  function drawGunIcon(cv, id) {
    (iconCvs[id] = (iconCvs[id] || []).filter((c) => c.isConnected)).push(cv);
    if (gunIcons.has(id)) { drawIconImg(cv, gunIcons.get(id)); return; }
    if (!REMOTE_GUNS[id]) return;
    const b = gunBounds(id);
    const ctx = cv.getContext('2d');
    const pad = 4;
    const k = Math.min((cv.width - 2 * pad) / (b.maxZ - b.minZ), (cv.height - 2 * pad) / (b.maxY - b.minY));
    const ox = (cv.width - (b.maxZ - b.minZ) * k) / 2;
    const oy = (cv.height - (b.maxY - b.minY) * k) / 2;
    b.rects.forEach((r) => {
      const x = ox + (r.z0 - b.minZ) * k;
      const y = oy + (b.maxY - r.y1) * k;
      const w = (r.z1 - r.z0) * k;
      const h = (r.y1 - r.y0) * k;
      ctx.fillStyle = r.c;
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    });
  }

  // Arma centrada (para flotar sobre las cajas)
  function addGunParts(parent, id) {
    const b = gunBounds(id);
    const cz = (b.minZ + b.maxZ) / 2;
    const cy = (b.minY + b.maxY) / 2;
    REMOTE_GUNS[id].forEach((part) => {
      let m;
      if (part.k === 'box') {
        m = BABYLON.MeshBuilder.CreateBox('gp', { width: part.s[0], height: part.s[1], depth: part.s[2] }, scene);
      } else {
        m = BABYLON.MeshBuilder.CreateCylinder('gp', { diameter: part.s[0], height: part.s[1], tessellation: 10 }, scene);
        m.rotation.x = Math.PI / 2;
      }
      m.material = gunMat(part.c);
      m.parent = parent;
      m.position.set(part.p[0], part.p[1] - cy, part.p[2] - cz);
      m.isPickable = false;
    });
  }


  // ---------------------------------------------------------------------------
  // Armas .glb (public/weapons/). Para cambiar una: reemplaza el archivo o edita su línea.
  // rem / vm = largo en metros (en la mano de otros jugadores / en tu mano)
  // grip = [punto de agarre a lo largo del arma (0 culata, 1 boca), altura (0 abajo, 1 arriba)]
  // fore = dónde apoya la mano izquierda (0 a 1) · hand = posición de tu mano derecha
  // ---------------------------------------------------------------------------
  const GUN_MODELS = {};
  const gunCache = new Map(); // id -> Promise
  const gunReady = new Map(); // id -> { id, def, container, spec } cuando ya cargó

  function tuneGunMat(m) {
    if (m.metallic !== undefined && m.metallic !== null) m.metallic = Math.min(m.metallic, 0.3);
    if (m.roughness !== undefined && m.roughness !== null) m.roughness = Math.max(m.roughness, 0.55);
    m.fogEnabled = false;
    if (/glass|lens/i.test(m.name || '')) { // cristales de las miras: transparentes
      m.alpha = 0.18;
      if (m.transparencyMode !== undefined && BABYLON.Material.MATERIAL_ALPHABLEND !== undefined) m.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND;
      m.backFaceCulling = false;
    }
  }

  // Mide el modelo: eje largo, hacia dónde apunta la boca, escala y punto de agarre (largo = 1)
  function measureGun(holder, def) {
    holder.getDescendants(false).forEach((n) => { if (n.computeWorldMatrix) n.computeWorldMatrix(true); });
    holder.computeWorldMatrix(true);
    const pts = [];
    holder.getChildMeshes(false).forEach((m) => {
      if (!m.getTotalVertices || m.getTotalVertices() === 0) return;
      m.computeWorldMatrix(true);
      const pos = m.getVerticesData(BABYLON.VertexBuffer.PositionKind);
      if (!pos) return;
      const wm = m.getWorldMatrix();
      for (let i = 0; i < pos.length; i += 3) {
        pts.push(BABYLON.Vector3.TransformCoordinates(new BABYLON.Vector3(pos[i], pos[i + 1], pos[i + 2]), wm));
      }
    });
    const mn = new BABYLON.Vector3(1e9, 1e9, 1e9);
    const mx = new BABYLON.Vector3(-1e9, -1e9, -1e9);
    pts.forEach((p) => { mn.minimizeInPlace(p); mx.maximizeInPlace(p); });
    const axisX = (mx.x - mn.x) >= (mx.z - mn.z);
    const span = Math.max(1e-6, axisX ? mx.x - mn.x : mx.z - mn.z);
    const a0 = axisX ? 'x' : 'z';
    const a1 = axisX ? 'z' : 'x';
    const lo0 = mn[a0] + span * 0.12;
    const hi0 = mx[a0] - span * 0.12;
    const area = (sel) => {
      let y0 = 1e9, y1 = -1e9, b0 = 1e9, b1 = -1e9;
      pts.forEach((p) => {
        if (!sel(p[a0])) return;
        y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
        b0 = Math.min(b0, p[a1]); b1 = Math.max(b1, p[a1]);
      });
      return y1 < y0 ? 0 : (y1 - y0 + 1e-6) * (b1 - b0 + 1e-6);
    };
    // La boca es el extremo más delgado
    const sign = area((v) => v >= hi0) < area((v) => v <= lo0) ? 1 : -1;
    const theta = axisX ? -sign * Math.PI / 2 : (sign > 0 ? 0 : Math.PI);
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    let rx0 = 1e9, rx1 = -1e9, ry0 = 1e9, ry1 = -1e9, rz0 = 1e9, rz1 = -1e9;
    pts.forEach((p) => {
      const x = p.x * c + p.z * s;
      const z = -p.x * s + p.z * c;
      rx0 = Math.min(rx0, x); rx1 = Math.max(rx1, x);
      ry0 = Math.min(ry0, p.y); ry1 = Math.max(ry1, p.y);
      rz0 = Math.min(rz0, z); rz1 = Math.max(rz1, z);
    });
    const su = 1 / Math.max(1e-6, rz1 - rz0);
    const gy = ry0 + def.grip[1] * (ry1 - ry0);
    const gz = rz0 + def.grip[0] * (rz1 - rz0);
    const gx = (rx0 + rx1) / 2;
    return {
      theta, su,
      g: new BABYLON.Vector3(gx * su, gy * su, gz * su),
      zMuz: (rz1 - gz) * su,
      top: (ry1 - gy) * su,
      h: (ry1 - ry0) * su,
      muzY: (ry1 - gy) * su - 0.28 * (ry1 - ry0) * su,
    };
  }

  function loadGun(id) {
    const def = GUN_MODELS[id];
    if (!def) return Promise.resolve(null);
    if (!gunCache.has(id)) {
      gunCache.set(id, BABYLON.SceneLoader.LoadAssetContainerAsync('/weapons/', def.file, scene).then((c) => {
        c.animationGroups.forEach((a) => a.stop());
        c.materials.forEach(tuneGunMat);
        const inst = c.instantiateModelsToScene((n) => n, false, { doNotInstantiate: true });
        const holder = new BABYLON.TransformNode('gunM', scene);
        inst.rootNodes.forEach((n) => { n.parent = holder; });
        const spec = measureGun(holder, def);
        holder.dispose(false, false);
        const gr = { id, def, container: c, spec };
        gunReady.set(id, gr);
        remotes.forEach((r) => { if (r.weapon === id && !r.gunGlb) swapRemoteGun(r, gr); });
        if (playing && weapon === id && vm.root && !vm.glb) buildViewmodel(id);
        return gr;
      }).catch((err) => { console.error('Arma', id, err); return null; }));
    }
    return gunCache.get(id);
  }

  // Crea una copia del arma con la boca hacia +Z y el punto de agarre en el origen
  function makeGunNode(gr, L, vmMode) {
    const inst = gr.container.instantiateModelsToScene((n) => n, false, { doNotInstantiate: true });
    inst.animationGroups.forEach((a) => a.dispose());
    const outer = new BABYLON.TransformNode('gun_' + gr.id, scene);
    const inner = new BABYLON.TransformNode('gunI', scene);
    inner.parent = outer;
    inst.rootNodes.forEach((n) => { n.parent = inner; });
    inner.rotation.y = gr.spec.theta;
    inner.scaling.setAll(gr.spec.su * L);
    inner.position.set(-gr.spec.g.x * L, -gr.spec.g.y * L, -gr.spec.g.z * L);
    outer.getChildMeshes(false).forEach((m) => {
      if (vmMode) prepVm(m);
      else { m.isPickable = false; m.checkCollisions = false; }
      m.receiveShadows = false;
      m.metadata = Object.assign(m.metadata || {}, { noSolid: true });
    });
    return outer;
  }

  function disposeRemoteGun(r) {
    if (!r.gun) return;
    if (r.gunGlb) { r.gun.parent = null; r.gun.dispose(false, false); } // materiales compartidos: no se borran
    else r.gun.dispose(false, true);
    r.gun = null;
    r.gunGlb = false;
  }

  function swapRemoteGun(r, gr) {
    disposeRemoteGun(r);
    const n = makeGunNode(gr, gr.def.rem, false);
    n.parent = r.armPivot;
    n.position.set(0.17, -0.02, 0.08); // si el modelo no tiene mano, queda a la altura del pecho
    r.gun = n;
    r.gunGlb = true;
  }

  function refreshChain(n) {
    const chain = [];
    for (let p = n; p; p = p.parent) chain.push(p);
    for (let i = chain.length - 1; i >= 0; i--) if (chain[i].computeWorldMatrix) chain[i].computeWorldMatrix(true);
  }

  // Hueso/nodo de la mano derecha del modelo
  function findHandNode(holder) {
    const nodes = holder.getDescendants(false).filter((x) => !x.getTotalVertices);
    const tests = [
      /^fist[._\- ]?r/i, /^(hand|palm)[._\- ]?r/i, /^wrist[._\- ]?r/i,
      /right.*(hand|fist|wrist)|(hand|fist|wrist).*right/i,
      /(hand|fist|wrist).*[._\- ]r$/i, /(lower|fore)arm[._\- ]?r/i,
    ];
    for (const t of tests) {
      const n = nodes.find((x) => t.test(x.name));
      if (n) return n;
    }
    return null;
  }

  const _gunInv = new BABYLON.Matrix();
  const _gunPos = new BABYLON.Vector3();
  // El arma se queda en la mano del personaje (sigue su animación) sin torcerse ni deformarlo
  function anchorGun(r) {
    const m = r.model;
    if (!m || !m.hand || !r.gunGlb || !r.gun) return;
    refreshChain(r.armPivot);
    refreshChain(m.hand);
    r.armPivot.getWorldMatrix().invertToRef(_gunInv);
    BABYLON.Vector3.TransformCoordinatesToRef(m.hand.getAbsolutePosition(), _gunInv, _gunPos);
    r.gun.position.copyFromFloats(_gunPos.x, _gunPos.y + 0.015, _gunPos.z + 0.02);
  }

  // Materiales de los personajes: opacos si no son transparentes (evita fallos de orden con el mapa)
  const charMatDone = new WeakSet();
  function fixCharMat(mt) {
    if (!mt || charMatDone.has(mt)) return;
    charMatDone.add(mt);
    const tex = mt.albedoTexture || mt.diffuseTexture;
    if ((mt.alpha === undefined || mt.alpha >= 0.99) && !(tex && tex.hasAlpha)) {
      if (mt.transparencyMode !== undefined && BABYLON.Material.MATERIAL_OPAQUE !== undefined) mt.transparencyMode = BABYLON.Material.MATERIAL_OPAQUE;
      mt.needDepthPrePass = false;
    }
    mt.zOffset = 0;
  }

  Object.keys(GUN_MODELS).forEach((id) => { loadGun(id); }); // se precargan todas

  function setRemoteWeapon(r, id) {
    if (!REMOTE_GUNS[id] || r.weapon === id) return;
    r.weapon = id;
    disposeRemoteGun(r);
    const gr = gunReady.get(id);
    if (gr) { swapRemoteGun(r, gr); return; }
    const gun = new BABYLON.TransformNode('rg', scene);
    gun.parent = r.armPivot; // el arma sigue a los brazos (que se enderezan al tirarse al suelo)
    gun.position.set(0.17, -0.01, 0.22);
    REMOTE_GUNS[id].forEach((part) => {
      let m;
      if (part.k === 'box') {
        m = BABYLON.MeshBuilder.CreateBox('rgp', { width: part.s[0], height: part.s[1], depth: part.s[2] }, scene);
        if (part.r) m.rotation.x = part.r;
      } else {
        m = BABYLON.MeshBuilder.CreateCylinder('rgp', { diameter: part.s[0], height: part.s[1], tessellation: 8 }, scene);
        m.rotation.x = Math.PI / 2; // apunta hacia adelante
      }
      m.material = mat(part.c);
      m.parent = gun;
      m.position.set(part.p[0], part.p[1], part.p[2]);
      m.isPickable = false;
    });
    r.gun = gun;
    r.gunGlb = false;
  }

  // Llamas del nombre (racha de bajas): una textura de llama dibujada una sola vez
  const nameFlameTex = new BABYLON.DynamicTexture('nameFlameTex', 128, scene, false);
  (function drawNameFlame() {
    const c = nameFlameTex.getContext();
    c.clearRect(0, 0, 128, 128);
    const blob = (sx, sy, grad) => {
      c.save();
      c.translate(64, 126);
      c.scale(sx, sy);
      c.translate(-64, -126);
      c.beginPath();
      c.moveTo(64, 4);
      c.bezierCurveTo(98, 44, 120, 78, 100, 108);
      c.bezierCurveTo(90, 124, 38, 124, 28, 108);
      c.bezierCurveTo(8, 78, 42, 56, 64, 4);
      c.closePath();
      c.fillStyle = grad;
      c.fill();
      c.restore();
    };
    const g1 = c.createLinearGradient(0, 126, 0, 4);
    g1.addColorStop(0, 'rgba(255,170,30,0.95)');
    g1.addColorStop(0.55, 'rgba(255,90,10,0.85)');
    g1.addColorStop(1, 'rgba(200,20,0,0)');
    blob(1, 1, g1);
    const g2 = c.createLinearGradient(0, 126, 0, 50);
    g2.addColorStop(0, 'rgba(255,250,190,1)');
    g2.addColorStop(1, 'rgba(255,200,60,0)');
    blob(0.5, 0.62, g2);
    nameFlameTex.hasAlpha = true;
    nameFlameTex.update();
  })();
  const nameFlameMat = new BABYLON.StandardMaterial('nameFlameMat', scene);
  nameFlameMat.diffuseTexture = nameFlameTex;
  nameFlameMat.useAlphaFromDiffuseTexture = true;
  nameFlameMat.emissiveColor = BABYLON.Color3.White();
  nameFlameMat.disableLighting = true;
  nameFlameMat.backFaceCulling = false;
  nameFlameMat.fogEnabled = false;
  nameFlameMat.alphaMode = BABYLON.Engine.ALPHA_ADD;

  // Cinco llamas sobre el cartel del nombre (apagadas hasta que el jugador tenga racha)
  function makeFlames(label) {
    return [-0.82, -0.41, 0, 0.41, 0.82].map((x, i) => {
      const m = BABYLON.MeshBuilder.CreatePlane('nf', { width: 0.5, height: 0.75 }, scene);
      m.material = nameFlameMat;
      m.parent = label;
      m.position.set(x, 0.42, -0.02);
      m.isPickable = false;
      m.setEnabled(false);
      return { m, ph: i * 1.7 };
    });
  }

  // Nombre sobre la cabeza: cartelito oscuro con borde del color del equipo
  function makeLabel(p, team, body) {
    const tex = new BABYLON.DynamicTexture('tx' + p.id, { width: 512, height: 128 }, scene, false);
    tex.hasAlpha = true;
    const c = tex.getContext();
    // burning = true cuando el jugador va en racha: cartel naranja y texto dorado
    const draw = (burning) => {
      const x = 6, y = 6, w = 500, h = 116, rad = 40;
      c.clearRect(0, 0, 512, 128);
      c.beginPath();
      c.moveTo(x + rad, y);
      c.arcTo(x + w, y, x + w, y + h, rad);
      c.arcTo(x + w, y + h, x, y + h, rad);
      c.arcTo(x, y + h, x, y, rad);
      c.arcTo(x, y, x + w, y, rad);
      c.closePath();
      c.fillStyle = burning ? 'rgba(60, 18, 0, 0.88)' : 'rgba(20, 38, 28, 0.82)';
      c.fill();
      c.lineWidth = burning ? 11 : 8;
      c.strokeStyle = burning ? '#ff7a1a' : team.color;
      c.stroke();
      c.fillStyle = burning ? '#ffd27a' : '#ffffff';
      c.font = 'bold 58px sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(p.name, 256, 68);
      tex.update();
    };
    draw(false);

    const labelMat = new BABYLON.StandardMaterial('lm' + p.id, scene);
    labelMat.diffuseTexture = tex;
    labelMat.useAlphaFromDiffuseTexture = true;
    labelMat.emissiveColor = BABYLON.Color3.White();
    labelMat.disableLighting = true;
    labelMat.backFaceCulling = false;
    labelMat.fogEnabled = false;
    const label = BABYLON.MeshBuilder.CreatePlane('lb' + p.id, { width: 2.0, height: 0.5 }, scene);
    label.material = labelMat;
    label.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
    label.parent = body;
    label.position.y = 2.05; // se mide desde los pies
    label.scaling.setAll(0.55);
    label.isPickable = false;
    label.metadata = { draw };
    return label;
  }

  // ---------------------------------------------------------------------------
  // Personajes (modelos .glb en public/characters/)
  // Para agregar uno: copia el .glb a public/characters/ y suma una línea aquí.
  // "photo" es opcional (imagen en public/characters/); si no hay, la foto se genera sola.
  // ---------------------------------------------------------------------------
  const CHARACTERS = [];
  const CHAR_HEIGHT = 1.8; // todos miden lo mismo que la caja de impacto
  const charDef = (id) => CHARACTERS.find((c) => c.id === id) || null;
  const charCache = new Map(); // id -> Promise del modelo ya cargado

  // Nombres de animación (se usa la primera que exista en cada modelo)
  const ANIM = {
    idle: ['Idle_Gun', 'Idle', 'Idle_Neutral'],
    walk: ['Walk_Gun', 'Walk', 'Run'],
    run: ['Run_Gun', 'Run', 'Walk'],
    duck: ['Duck', 'Idle_Gun', 'Idle'],
    air: ['Jump_Idle', 'Jump', 'Run'],
  };
  const ANIM_THUMB = ['Idle', 'Idle_Neutral', 'Idle_Gun'];

  function findAnim(groups, names) {
    for (const n of names) {
      const g = groups.find((x) => x.name === n || x.name.endsWith('|' + n));
      if (g) return g;
    }
    return null;
  }

  function loadCharContainer(def) {
    if (!charCache.has(def.id)) {
      charCache.set(def.id, BABYLON.SceneLoader.LoadAssetContainerAsync('/characters/', def.file, scene)
        .then((c) => { c.animationGroups.forEach((g) => g.stop()); return c; })
        .catch((err) => { console.error('Personaje', def.id, err); return null; }));
    }
    return charCache.get(def.id);
  }

  // Hacia dónde mira el modelo, sacado de la posición de sus hombros/manos (derecha - izquierda)
  function skeletonYaw(all) {
    const byName = new Map();
    all.forEach((n) => { if (!n.getTotalVertices && n.name && n.getAbsolutePosition) byName.set(n.name, n); });
    const swap = (s) => {
      if (/right/i.test(s)) return s.replace(/right/i, (m) => (m === 'RIGHT' ? 'LEFT' : m[0] === 'R' ? 'Left' : 'left'));
      if (/[._\- ]R$/.test(s) || /[a-z]R$/.test(s)) return s.replace(/R$/, 'L');
      if (/[._\- ]r$/.test(s)) return s.replace(/r$/, 'l');
      return null;
    };
    const prio = ['shoulder', 'upperarm', 'upper_arm', 'clavicle', 'arm', 'thigh', 'upleg', 'hand', 'fist', 'wrist', 'foot'];
    const cands = [];
    byName.forEach((_, k) => {
      const low = k.toLowerCase();
      const i = prio.findIndex((p) => low.includes(p));
      const o = swap(k);
      if (i >= 0 && o && byName.has(o)) cands.push({ k, o, i });
    });
    cands.sort((a, b) => a.i - b.i);
    for (const c of cands) {
      const lat = byName.get(c.k).getAbsolutePosition().subtract(byName.get(c.o).getAbsolutePosition());
      lat.y = 0;
      if (lat.lengthSquared() < 1e-6) continue;
      lat.normalize();
      const fx = -lat.z; // adelante = derecha x arriba
      const fz = lat.x;
      return -Math.atan2(fx, fz);
    }
    return null;
  }

  // Deja el modelo con la altura de juego, apoyado en el suelo y mirando hacia +Z
  function fitModel(inst, scn, targetH) {
    const holder = new BABYLON.TransformNode('chHolder', scn);
    const roots = inst.rootNodes;
    roots.forEach((n) => { n.parent = holder; });
    holder.computeWorldMatrix(true);
    const all = [];
    const collect = (n) => { all.push(n); n.getChildren().forEach(collect); };
    roots.forEach(collect);
    all.forEach((n) => { if (n.computeWorldMatrix) n.computeWorldMatrix(true); });

    // Hacia dónde mira el modelo (el frente de un .glb es +Z; el cargador puede voltearlo)
    const fwd = BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(0, 0, 1), roots[0].getWorldMatrix());
    let yaw = -Math.atan2(fwd.x, fwd.z);
    const sy = skeletonYaw(all);
    if (sy !== null) yaw = sy;

    let scale = 1;
    let yOff = 0;
    const head = all.find((n) => n.name === 'Head_end');
    if (inst.skeletons.length && head) {
      // Con esqueleto: la altura es la punta de la cabeza sobre el suelo del modelo
      scale = targetH / Math.max(0.1, head.getAbsolutePosition().y);
    } else {
      const mn = new BABYLON.Vector3(1e9, 1e9, 1e9);
      const mx = new BABYLON.Vector3(-1e9, -1e9, -1e9);
      holder.getChildMeshes(false).forEach((m) => {
        if (!m.getTotalVertices || m.getTotalVertices() === 0) return;
        m.computeWorldMatrix(true);
        const bb = m.getBoundingInfo().boundingBox;
        mn.minimizeInPlace(bb.minimumWorld);
        mx.maximizeInPlace(bb.maximumWorld);
      });
      const h = Math.max(1e-4, mx.y - mn.y);
      const side = Math.max(mx.x - mn.x, mx.z - mn.z, 1e-4);
      scale = Math.min(targetH / h, 1.1 / side);
      yOff = -mn.y * scale;
    }
    holder.scaling.setAll(scale);
    holder.rotation.y = yaw;
    return { holder, scale, yOff };
  }

  // Las armas del modelo (pistola, cuchillo) se esconden: el juego pone las suyas
  function hideHeldProps(holder) {
    holder.getDescendants(false).forEach((n) => {
      if (n.name && /pistol|knife|\bgun\b|rifle|weapon|sword|smg|shotgun|revolver|blade/i.test(n.name)) n.setEnabled(false);
    });
  }

  function attachCharacter(r, chId) {
    const def = charDef(chId);
    if (!def) return; // sin personaje: queda el muñeco de cajas
    loadCharContainer(def).then((container) => {
      if (!container || remotes.get(r.id) !== r) return;
      const inst = container.instantiateModelsToScene((n) => n, false, { doNotInstantiate: true });
      inst.animationGroups.forEach((g) => g.stop());
      const fit = fitModel(inst, scene, CHAR_HEIGHT);
      hideHeldProps(fit.holder);
      const pivot = new BABYLON.TransformNode('mp', scene); // pivote de la cadera: se tira al suelo como el muñeco
      pivot.parent = r.body;
      pivot.position.y = 0.9;
      fit.holder.parent = pivot;
      fit.holder.position.y = -0.9 + fit.yOff;
      fit.holder.getChildMeshes(false).forEach((m) => {
        m.isPickable = false;
        m.checkCollisions = false;
        m.receiveShadows = false;
        m.alwaysSelectAsActiveMesh = true;
        m.metadata = Object.assign(m.metadata || {}, { noSolid: true });
        if (m.material) fixCharMat(m.material);
        if (!m.skeleton) shadowGen.addShadowCaster(m); // con esqueleto: sin sombra (evita manchas y tirones)
      });
      r.proc.forEach((m) => m.setEnabled(false));
      const anims = {};
      Object.keys(ANIM).forEach((k) => { anims[k] = findAnim(inst.animationGroups, ANIM[k]); });
      r.model = { inst, holder: fit.holder, pivot, anims, cur: null, scale: fit.scale, baseY: -0.9 + fit.yOff, still: inst.animationGroups.length === 0, hand: findHandNode(fit.holder) };
    }).catch((err) => console.error(err));
  }

  // Pose del personaje con modelo: elige la animación según lo que hace el jugador
  function updateModelPose(r) {
    const m = r.model;
    m.pivot.position.y = 0.9 + (0.22 - 0.9) * r.pr;
    m.pivot.position.z = -0.6 * r.pr;
    m.pivot.rotation.x = r.pr * (Math.PI / 2);
    // El arma sigue a la altura del pecho del modelo
    r.rig.position.y = (0.9 - 0.35 * r.cr) * (1 - r.pr) + 0.22 * r.pr;
    r.upper.rotation.x = -0.6 * r.pr;
    r.upper.position.y = -0.1;

    if (m.still) { // modelo sin animaciones: balanceo sencillo
      m.holder.position.y = m.baseY + Math.abs(Math.sin(r.phase)) * 0.05 * r.walk;
      m.holder.rotation.z = Math.sin(r.phase) * 0.07 * r.walk;
      m.holder.scaling.y = m.scale * (1 - 0.3 * r.cr);
      return;
    }
    let key = 'idle';
    if (r.pr > 0.5) key = 'idle';
    else if (r.air > 0.5) key = 'air';
    else if (r.cr > 0.5) key = r.walk > 0.3 ? 'walk' : 'duck';
    else if (r.run > 0.5) key = 'run';
    else if (r.walk > 0.3) key = 'walk';
    const g = m.anims[key] || m.anims.idle;
    if (g && m.cur !== g) {
      if (m.cur) m.cur.stop();
      g.enableBlending = true;
      g.blendingSpeed = 0.08;
      g.start(key !== 'duck', key === 'walk' && r.cr > 0.5 ? 0.7 : 1);
      m.cur = g;
    }
  }

  // Personaje remoto con esqueleto sencillo:
  //   body (en los pies, gira con el jugador)
  //    ├─ hit    cápsula invisible = caja de impacto (se encoge al agacharse)
  //    └─ rig    la cadera: sube y baja según la pose
  //        ├─ upper   torso, cabeza, brazos y arma (se inclina desde la cadera)
  //        └─ muslos → pantorrillas (la rodilla se dobla)
  // flags (r.flags): 1 = agachado, 2 = corriendo, 4 = en el aire
  const REMOTE_EYE_STAND = 1.75; // altura del ojo sobre los pies, de pie
  const REMOTE_EYE_CROUCH = 1.15; // y agachado (coincide con el elipsoide de la cámara)
  const REMOTE_EYE_PRONE = 0.5; // y tendido en el suelo

  function addRemote(p) {
    if (remotes.has(p.id)) return;
    const team = { color: colorOf(p.id) };

    const body = new BABYLON.TransformNode('pl' + p.id, scene);

    const hit = BABYLON.MeshBuilder.CreateCapsule('hit' + p.id, { height: 1.8, radius: 0.35, tessellation: 12, subdivisions: 2 }, scene);
    hit.visibility = 0;
    hit.metadata = { playerId: p.id };
    hit.isPickable = true;
    hit.parent = body;
    hit.position.y = 0.9;

    const rig = new BABYLON.TransformNode('rig', scene);
    rig.parent = body;
    rig.position.y = 0.9;
    const upper = new BABYLON.TransformNode('up', scene);
    upper.parent = rig;
    upper.position.y = -0.1; // pivote en la cadera
    // Pivote de los brazos y el arma (a la altura de los hombros): al tirarse al suelo se
    // endereza para que el arma siga apuntando hacia adelante con el cuerpo tendido
    const armPivot = new BABYLON.TransformNode('ap', scene);
    armPivot.parent = upper;
    armPivot.position.y = 0.38;

    const skin = mat('#e0b48a');
    const cloth = mat(team.color);
    const pants = mat('#2b2d31');
    const shoe = mat('#17181b');
    // y se mide desde el centro del torso original; +0.1 porque el pivote está en la cadera
    const part = (mesh, x, y, z, ry) => {
      mesh.parent = upper;
      mesh.position.set(x, y + 0.1, z);
      if (ry) mesh.rotation.y = ry;
      mesh.isPickable = false;
      return mesh;
    };

    // Torso, cabeza y cara
    part(BABYLON.MeshBuilder.CreateBox('to', { width: 0.5, height: 0.6, depth: 0.3 }, scene), 0, 0.2, 0).material = cloth;
    part(BABYLON.MeshBuilder.CreateSphere('he', { diameter: 0.32, segments: 8 }, scene), 0, 0.66, 0).material = skin;
    part(BABYLON.MeshBuilder.CreateBox('fa', { width: 0.2, height: 0.06, depth: 0.05 }, scene), 0, 0.68, 0.16).material = mat('#f2efe4');

    // Brazos sosteniendo el arma
    const arm = (mesh, x, z, ry) => {
      mesh.parent = armPivot;
      mesh.position.set(x, 0, z);
      mesh.rotation.y = ry;
      mesh.isPickable = false;
      return mesh;
    };
    arm(BABYLON.MeshBuilder.CreateBox('ar', { width: 0.11, height: 0.11, depth: 0.35 }, scene), 0.24, 0.1, -0.35).material = cloth;
    arm(BABYLON.MeshBuilder.CreateBox('al', { width: 0.1, height: 0.1, depth: 0.65 }, scene), -0.08, 0.28, 0.6).material = cloth;

    // Piernas de dos tramos: muslo (cadera) + pantorrilla (rodilla) + zapato
    const legs = [-0.12, 0.12].map((lx) => {
      const thigh = new BABYLON.TransformNode('th', scene);
      thigh.parent = rig;
      thigh.position.set(lx, -0.1, 0);
      const tm = BABYLON.MeshBuilder.CreateBox('thb', { width: 0.19, height: 0.4, depth: 0.21 }, scene);
      tm.material = pants;
      tm.parent = thigh;
      tm.position.y = -0.2;
      tm.isPickable = false;

      const shin = new BABYLON.TransformNode('sh', scene);
      shin.parent = thigh;
      shin.position.y = -0.4;
      const sm = BABYLON.MeshBuilder.CreateBox('shb', { width: 0.18, height: 0.4, depth: 0.2 }, scene);
      sm.material = pants;
      sm.parent = shin;
      sm.position.y = -0.2;
      sm.isPickable = false;
      const fm = BABYLON.MeshBuilder.CreateBox('fot', { width: 0.2, height: 0.08, depth: 0.3 }, scene);
      fm.material = shoe;
      fm.parent = shin;
      fm.position.set(0, -0.36, 0.05);
      fm.isPickable = false;
      return { thigh, shin };
    });

    // Gallinas: cresta roja. Grones: sombrero oscuro.
    if (p.id % 2 === 0) {
      part(BABYLON.MeshBuilder.CreateBox('co', { width: 0.06, height: 0.16, depth: 0.24 }, scene), 0, 0.88, 0).material = mat('#c1121f');
    } else {
      part(BABYLON.MeshBuilder.CreateCylinder('ha', { height: 0.12, diameterTop: 0.34, diameterBottom: 0.52, tessellation: 12 }, scene), 0, 0.86, 0).material = mat('#1d3557');
    }

    const proc = body.getChildMeshes(false).filter((m) => m !== hit); // piezas del muñeco de cajas
    body.getChildMeshes(false).forEach((m) => { if (m !== hit) shadowGen.addShadowCaster(m); });

    const label = makeLabel(p, team, body);
    const flames = makeFlames(label);

    const eye = new BABYLON.Vector3(p.p[0], p.p[1], p.p[2]);
    body.position.set(eye.x, eye.y - REMOTE_EYE_STAND, eye.z);
    body.rotation.y = p.yaw || 0;
    const r = {
      body, rig, upper, armPivot, hit, legs, label, flames, burning: false, eye, target: eye.clone(),
      id: p.id, yaw: p.yaw || 0, flags: p.f || 0,
      lastShot: -1e9, gun: null, weapon: null, proc, model: null,
      walk: 0, run: 0, cr: (p.f || 0) & 1 ? 1 : 0, pr: (p.f || 0) & 8 ? 1 : 0, air: 0, land: 0, phase: 0, wasAir: false,
    };
    remotes.set(p.id, r);
    setRemoteWeapon(r, p.weapon || 'ak47');
    setBurning(r, (streaks.get(p.id) || 0) >= STREAK_FIRE);
    attachCharacter(r, p.ch);
  }

  // Enciende o apaga las llamas del nombre (y el cartel naranja)
  function setBurning(r, on) {
    if (!r.flames || r.burning === on) return;
    r.burning = on;
    r.label.metadata.draw(on);
    r.flames.forEach((f) => f.m.setEnabled(on));
  }

  // Anima a cada jugador remoto: caminar, correr, agacharse, tirarse al suelo y saltar
  function animateRemotes(dt, now) {
    const k = Math.min(1, dt * 14);
    remotes.forEach((r) => {
      const crouching = (r.flags & 1) !== 0;
      const running = (r.flags & 2) !== 0;
      const inAir = (r.flags & 4) !== 0;
      const proning = (r.flags & 8) !== 0;

      // Se mueve si la posición horizontal todavía no alcanzó a la última recibida
      const ex = r.eye.x - r.target.x;
      const ez = r.eye.z - r.target.z;
      const moving = ex * ex + ez * ez > 0.0009 ? 1 : 0;
      BABYLON.Vector3.LerpToRef(r.eye, r.target, k, r.eye);
      r.body.rotation.y += (r.yaw - r.body.rotation.y) * k;

      // Factores suaves (0 a 1) de cada pose
      r.walk += (moving - r.walk) * Math.min(1, dt * 8);
      r.run += ((running && moving ? 1 : 0) - r.run) * Math.min(1, dt * 8);
      r.cr += ((crouching ? 1 : 0) - r.cr) * Math.min(1, dt * 12);
      r.air += ((inAir ? 1 : 0) - r.air) * Math.min(1, dt * 12);
      r.pr += ((proning ? 1 : 0) - r.pr) * Math.min(1, dt * 9);
      if (r.wasAir && !inAir) r.land = 1; // al aterrizar flexiona un instante
      r.wasAir = inAir;
      r.land = Math.max(0, r.land - dt * 5);

      // Fase del paso: más rápida al correr, más lenta agachado
      r.phase += dt * (8 + 5 * r.run) * (1 - 0.4 * r.cr) * r.walk;
      const ph = r.phase;
      const swing = Math.sin(ph) * (0.7 + 0.45 * r.run) * (1 - 0.55 * r.cr) * (1 - 0.8 * r.pr) * r.walk;
      const kneeAmt = (0.5 + 0.8 * r.run) * r.walk * (1 - r.pr);
      const squat = Math.min(1, r.cr + r.land * 0.45) * (1 - r.pr); // 0 de pie, 1 en cuclillas

      // rotation.x negativa = pierna hacia adelante; en la rodilla positiva = se dobla hacia atrás
      let ext = 0;
      r.legs.forEach((leg, i) => {
        const s = i === 0 ? swing : -swing;
        const fwd = Math.max(0, i === 0 ? Math.cos(ph) : -Math.cos(ph)); // pierna que avanza levanta el pie
        let thigh = -s - 1.45 * squat;
        let knee = fwd * kneeAmt + 2.45 * squat;
        thigh += -r.air * (i === 0 ? 0.75 : 0.25); // en el salto recoge las piernas
        knee += r.air * (i === 0 ? 1.2 : 0.55);
        leg.thigh.rotation.x = thigh;
        leg.shin.rotation.x = knee;
        ext = Math.max(ext, 0.4 * Math.cos(thigh) + 0.4 * Math.cos(thigh + knee));
      });

      // La cadera se coloca para que el pie de apoyo toque el suelo; en el aire queda arriba
      const groundedY = 0.1 + ext;
      const baseY = groundedY + (0.9 - groundedY) * r.air;
      // Cuerpo a tierra: toda la cadera cae al suelo y el cuerpo gira hacia adelante hasta quedar
      // horizontal (cabeza donde estaba la cámara); los brazos se enderezan para seguir apuntando
      r.rig.position.y = baseY + (0.22 - baseY) * r.pr;
      r.rig.position.z = -0.6 * r.pr;
      r.rig.rotation.x = r.pr * (Math.PI / 2);
      r.armPivot.rotation.x = -r.pr * (Math.PI / 2 - 0.6);

      // Torso: se inclina al agacharse y al correr, un poco hacia atrás en el salto
      const bob = Math.abs(Math.sin(ph)) * 0.03 * r.walk;
      r.upper.rotation.x = 0.35 * squat + 0.28 * r.run - 0.1 * r.air - 0.6 * r.pr;
      r.upper.position.y = -0.1 + bob;
      if (r.model) updateModelPose(r);

      // Posición: de los ojos hacia abajo hasta los pies
      const eyeH0 = REMOTE_EYE_STAND + (REMOTE_EYE_CROUCH - REMOTE_EYE_STAND) * r.cr;
      const eyeH = eyeH0 + (REMOTE_EYE_PRONE - eyeH0) * r.pr;
      r.body.position.set(r.eye.x, r.eye.y - eyeH, r.eye.z);
      if (r.model) anchorGun(r);

      // Caja de impacto y nombre acompañan la altura
      // La caja de impacto se acuesta junto con el cuerpo cuando está tendido
      const h = 1.8 - 0.6 * r.cr;
      r.hit.rotation.x = r.pr * (Math.PI / 2);
      r.hit.scaling.set(1 - 0.2 * r.pr, (h / 1.8) * (1 - r.pr) + 0.95 * r.pr, 1 - 0.2 * r.pr);
      r.hit.position.y = (h / 2) * (1 - r.pr) + 0.28 * r.pr;
      r.hit.position.z = -0.65 * r.pr;
      // El nombre crece un poco con la distancia para que se pueda leer
      const dist = BABYLON.Vector3.Distance(camera.position, r.body.position);
      const ls = 0.55 * Math.min(2.6, Math.max(1, dist / 20));
      r.label.scaling.setAll(ls);
      // justo encima de la cabeza (la cabeza llega a ~1.85 m de pie)
      r.label.position.y = (1.9 - 0.55 * r.cr) * (1 - r.pr) + 0.8 * r.pr + 0.14 * ls;
      // Llamas del nombre: cada una titila a su ritmo, siempre pegada al borde de arriba del cartel
      if (r.burning) {
        const t = now / 1000;
        r.flames.forEach((f) => {
          const s = 1 + 0.28 * Math.sin(t * 11 + f.ph) + 0.14 * Math.sin(t * 23 + f.ph * 2);
          f.m.scaling.set(1 + 0.12 * Math.sin(t * 9 + f.ph * 1.3), s, 1);
          f.m.position.y = 0.04 + 0.375 * s;
        });
      }
    });
  }

  function removeRemote(id) {
    const r = remotes.get(id);
    if (!r) return;
    r.flames.forEach((f) => { f.m.material = null; }); // el material de las llamas es compartido: no se borra
    if (r.model) { // el modelo comparte materiales con los demás: no se borran
      r.model.inst.animationGroups.forEach((g) => g.dispose());
      r.model.inst.skeletons.forEach((s) => s.dispose());
      r.model.holder.parent = null;
      r.model.holder.dispose(false, false);
    }
    disposeRemoteGun(r);
    r.body.dispose(false, true); // borra el personaje completo, su arma y su nombre
    remotes.delete(id);
  }

  // ---------------------------------------------------------------------------
  // Arma en la mano (se ve en primera persona)
  // ---------------------------------------------------------------------------
  const vm = { root: null, muzzle: null, kick: 0, swap: 0, bob: 0, flashUntil: 0, sprint: 0 };
  const VM_BASE = new BABYLON.Vector3(0.22, -0.2, 0.4);

  function prepVm(m) {
    m.isPickable = false;
    m.checkCollisions = false;
    m.renderingGroupId = 1; // se dibuja encima del mapa y no se mete en las paredes
    m.alwaysSelectAsActiveMesh = true;
  }

  function vmMat(hex) {
    const m = new BABYLON.StandardMaterial('vmm' + hex, scene);
    m.diffuseColor = BABYLON.Color3.FromHexString(hex);
    m.specularColor = new BABYLON.Color3(0.12, 0.12, 0.12);
    m.fogEnabled = false;
    return m;
  }

  function vmBox(root, w, h, d, x, y, z, hex, rx) {
    const b = BABYLON.MeshBuilder.CreateBox('vb', { width: w, height: h, depth: d }, scene);
    b.material = typeof hex === 'string' ? vmMat(hex) : hex;
    b.parent = root;
    b.position.set(x, y, z);
    if (rx) b.rotation.x = rx;
    prepVm(b);
    return b;
  }

  function vmCyl(root, diameter, length, x, y, z, hex) {
    const c = BABYLON.MeshBuilder.CreateCylinder('vc', { diameter, height: length, tessellation: 10 }, scene);
    c.rotation.x = Math.PI / 2; // apunta hacia adelante
    c.material = vmMat(hex);
    c.parent = root;
    c.position.set(x, y, z);
    prepVm(c);
    return c;
  }

  // Mira holográfica en estilo cajas: base, dos postes, techo, cristal azul y punto rojo con
  // cuatro marcas. Devuelve la altura (en el arma) del centro de la ventana, que es donde queda
  // el punto rojo; al apuntar, el arma sube justo esa altura para que el punto caiga en el centro.
  // Cada pieza crea su propio material porque al cambiar de arma se borran con el arma.
  function vmHolo(root, x, y, z, s) {
    const frame = '#2b2d31';
    const cy = y + 0.03 * s;
    const dot = () => emissiveMat('holoDot', '#ff3b30');
    const glass = new BABYLON.StandardMaterial('holoGlass', scene);
    glass.diffuseColor = BABYLON.Color3.FromHexString('#7fc8ff');
    glass.specularColor = BABYLON.Color3.Black();
    glass.alpha = 0.16;
    glass.fogEnabled = false;
    vmBox(root, 0.05 * s, 0.012 * s, 0.075 * s, x, y, z, frame); // base
    vmBox(root, 0.008 * s, 0.05 * s, 0.06 * s, x - 0.024 * s, cy, z, frame); // poste izquierdo
    vmBox(root, 0.008 * s, 0.05 * s, 0.06 * s, x + 0.024 * s, cy, z, frame); // poste derecho
    vmBox(root, 0.056 * s, 0.01 * s, 0.07 * s, x, y + 0.058 * s, z, frame); // techo
    vmBox(root, 0.04 * s, 0.045 * s, 0.003, x, cy, z, glass); // cristal
    vmBox(root, 0.0028 * s, 0.0028 * s, 0.002, x, cy, z - 0.003, dot()); // punto rojo
    const r = 0.014 * s;
    vmBox(root, 0.006 * s, 0.002, 0.002, x + r, cy, z - 0.003, dot());
    vmBox(root, 0.006 * s, 0.002, 0.002, x - r, cy, z - 0.003, dot());
    vmBox(root, 0.002, 0.006 * s, 0.002, x, cy + r, z - 0.003, dot());
    vmBox(root, 0.002, 0.006 * s, 0.002, x, cy - r, z - 0.003, dot());
    return cy;
  }

  // Fogonazo: una estrella amarilla que aparece un instante en la boca del arma
  const flashTex = new BABYLON.DynamicTexture('flashTex', 64, scene, false);
  (function drawFlash() {
    const c = flashTex.getContext();
    const g = c.createRadialGradient(32, 32, 2, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,225,1)');
    g.addColorStop(0.35, 'rgba(255,205,90,0.9)');
    g.addColorStop(1, 'rgba(255,120,0,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
    c.strokeStyle = 'rgba(255,230,150,0.9)';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(32, 2); c.lineTo(32, 62);
    c.moveTo(2, 32); c.lineTo(62, 32);
    c.stroke();
    flashTex.hasAlpha = true;
    flashTex.update();
  })();
  const flashMat = new BABYLON.StandardMaterial('flashMat', scene);
  flashMat.diffuseTexture = flashTex;
  flashMat.useAlphaFromDiffuseTexture = true;
  flashMat.emissiveColor = BABYLON.Color3.White();
  flashMat.disableLighting = true;
  flashMat.backFaceCulling = false;
  flashMat.fogEnabled = false;
  const flashMesh = BABYLON.MeshBuilder.CreatePlane('flash', { size: 0.3 }, scene);
  flashMesh.material = flashMat;
  flashMesh.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
  prepVm(flashMesh);
  flashMesh.setEnabled(false);

  function buildViewmodel(id) {
    flashMesh.parent = null;
    if (vm.gunNode) { vm.gunNode.parent = null; vm.gunNode.dispose(false, false); vm.gunNode = null; }
    if (vm.root) vm.root.dispose(false, true);
    vm.glb = false;
    vm.id = id;
    const root = new BABYLON.TransformNode('vm', scene);
    root.parent = camera;
    vm.spinNode = null;
    const dark = '#2b2d31', metal = '#4a4f57', wood = '#6b4a2f';
    const skin = '#e0b48a';
    const sleeve = myId ? colorOf(myId) : '#3b82c4';
    let muzzleZ = 0.5;
    let right = [0, -0.1, 0.06];
    let left = null;
    let adsY = 0.1; // altura del centro de la mira respecto al arma
    let muzzleY = 0.02;
    const gm = gunReady.get(id);

    if (gm) {
      const L = gm.def.vm;
      right = gm.def.hand.slice();
      const oy = right[1] + 0.035;
      const nd = makeGunNode(gm, L, true);
      nd.parent = root;
      nd.position.set(0, oy, right[2]);
      vm.gunNode = nd;
      vm.glb = true;
      muzzleZ = right[2] + gm.spec.zMuz * L;
      muzzleY = oy + gm.spec.muzY * L;
      adsY = oy + gm.spec.top * L - 0.012;
      if (gm.def.fore != null) left = [0, oy - 0.05, right[2] + (gm.def.fore - gm.def.grip[0]) * L];
      if (id === 'fusil') { // mira de hierro: línea sobre el cañón, poste delantero y muesca trasera
        const ty = oy + gm.spec.top * L;
        const len = muzzleZ - right[2] - 0.03;
        vmBox(root, 0.003, 0.003, len, 0, ty + 0.003, right[2] + len / 2, '#f2f2f2');
        vmBox(root, 0.005, 0.022, 0.005, 0, ty + 0.011, muzzleZ - 0.06, '#f2f2f2');
        vmBox(root, 0.004, 0.014, 0.006, -0.011, ty + 0.007, right[2] - 0.02, '#f2f2f2');
        vmBox(root, 0.004, 0.014, 0.006, 0.011, ty + 0.007, right[2] - 0.02, '#f2f2f2');
        adsY = ty + 0.02;
      }
    } else if (VMCFG[id]) {
      const cfg = VMCFG[id];
      let zmax = 0;
      REMOTE_GUNS[id].forEach((p) => {
        if (p.k === 'box') vmBox(root, p.s[0], p.s[1], p.s[2], p.p[0], p.p[1], p.p[2], p.c, p.r);
        else vmCyl(root, p.s[0], p.s[1], p.p[0], p.p[1], p.p[2], p.c);
        zmax = Math.max(zmax, p.p[2] + (p.k === 'box' ? p.s[2] : p.s[1]) / 2);
      });
      adsY = cfg.ads;
      muzzleZ = zmax;
      right = cfg.right.slice();
      left = cfg.left ? cfg.left.slice() : null;
    } else if (id === 'pistola') {
      vmBox(root, 0.045, 0.04, 0.2, 0, 0, 0.1, dark);
      vmBox(root, 0.05, 0.055, 0.22, 0, 0.03, 0.12, metal);
      vmBox(root, 0.045, 0.12, 0.06, 0, -0.07, 0.03, dark, -0.2);
      adsY = vmHolo(root, 0, 0.066, 0.1, 0.8);
      muzzleZ = 0.24;
      right = [0, -0.08, 0.04];
    } else if (id === 'subfusil') {
      vmBox(root, 0.06, 0.09, 0.3, 0, 0, 0.16, dark);
      vmCyl(root, 0.025, 0.18, 0, 0.01, 0.4, metal);
      vmBox(root, 0.035, 0.16, 0.05, 0, -0.12, 0.18, dark, 0.1);
      vmBox(root, 0.04, 0.09, 0.05, 0, -0.08, 0.05, dark);
      adsY = vmHolo(root, 0, 0.074, 0.2, 1);
      muzzleZ = 0.5;
      right = [0, -0.1, 0.06];
      left = [0, -0.07, 0.34];
    } else if (id === 'fusil') {
      vmBox(root, 0.06, 0.09, 0.42, 0, 0, 0.2, dark);
      vmBox(root, 0.055, 0.06, 0.2, 0, 0.005, 0.5, metal);
      vmCyl(root, 0.022, 0.3, 0, 0.015, 0.78, metal);
      vmBox(root, 0.04, 0.13, 0.07, 0, -0.1, 0.2, dark, 0.15);
      adsY = vmHolo(root, 0, 0.078, 0.26, 1);
      vmBox(root, 0.05, 0.08, 0.18, 0, -0.01, -0.05, wood);
      vmBox(root, 0.04, 0.09, 0.05, 0, -0.085, 0.08, dark);
      muzzleZ = 0.94;
      right = [0, -0.1, 0.08];
      left = [0, -0.06, 0.52];
    } else if (id === 'escopeta') {
      vmBox(root, 0.06, 0.09, 0.2, 0, 0, 0.1, dark);
      vmCyl(root, 0.035, 0.7, 0, 0.02, 0.5, metal);
      vmCyl(root, 0.03, 0.5, 0, -0.02, 0.42, dark);
      vmBox(root, 0.065, 0.05, 0.16, 0, -0.04, 0.45, wood);
      vmBox(root, 0.05, 0.09, 0.25, 0, -0.03, -0.12, wood);
      adsY = vmHolo(root, 0, 0.056, 0.14, 0.9);
      muzzleZ = 0.86;
      right = [0, -0.08, 0.02];
      left = [0, -0.075, 0.45];
    } else if (id === 'minigun') {
      vmBox(root, 0.1, 0.1, 0.3, 0, 0, 0.05, dark);
      vmBox(root, 0.04, 0.14, 0.06, 0, -0.11, 0.0, dark, 0.1);
      vmBox(root, 0.14, 0.14, 0.16, 0, -0.12, -0.12, wood); // caja de munición
      vmBox(root, 0.05, 0.05, 0.2, 0.09, 0.0, 0.1, metal); // motor lateral
      // Barriles que giran al disparar
      const spin = new BABYLON.TransformNode('spin', scene);
      spin.parent = root;
      spin.position.set(0, 0, 0.45);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        vmCyl(spin, 0.026, 0.62, Math.cos(a) * 0.045, Math.sin(a) * 0.045, 0, metal);
      }
      vmCyl(spin, 0.14, 0.03, 0, 0, -0.12, dark);
      vmCyl(spin, 0.14, 0.03, 0, 0, 0.1, dark);
      vmCyl(spin, 0.14, 0.03, 0, 0, 0.3, dark);
      vm.spinNode = spin;
      adsY = 0.08;
      muzzleZ = 0.78;
      right = [0, -0.13, 0.0];
      left = [0.02, -0.1, 0.22];
    } else if (id === 'bazuca') {
      vmCyl(root, 0.15, 1.0, 0, 0.03, 0.4, '#4b5d3a');
      vmCyl(root, 0.19, 0.08, 0, 0.03, -0.12, dark);
      vmCyl(root, 0.18, 0.06, 0, 0.03, 0.88, dark);
      vmCyl(root, 0.09, 0.2, 0, 0.03, 0.92, '#c1121f'); // punta del misil asomando
      vmBox(root, 0.03, 0.06, 0.1, 0, 0.13, 0.3, dark); // mira
      vmBox(root, 0.04, 0.12, 0.05, 0, -0.1, 0.25, dark, 0.15);
      vmBox(root, 0.04, 0.1, 0.05, 0, -0.1, 0.55, dark);
      adsY = 0.14;
      muzzleZ = 1.0;
      right = [0, -0.09, 0.25];
      left = [0, -0.08, 0.55];
    } else if (id === 'porro') {
      vmCyl(root, 0.045, 0.42, 0, 0, 0.22, '#f2efe4'); // papel
      const ember = vmCyl(root, 0.05, 0.05, 0, 0, 0.45, '#ff6a1a'); // brasa
      ember.material = emissiveMat('ember', '#ff7a1a');
      vmBox(root, 0.02, 0.02, 0.05, 0, 0, -0.01, '#e8e0c8'); // punta retorcida
      vmBox(root, 0.012, 0.012, 0.02, 0.0, 0.025, 0.14, '#3a8f2a');
      vmBox(root, 0.012, 0.012, 0.02, 0.0, 0.025, 0.3, '#3a8f2a');
      adsY = 0.07;
      muzzleZ = 0.5;
      right = [0, -0.05, 0.1];
    } else {
      // francotirador
      vmBox(root, 0.06, 0.09, 0.4, 0, 0, 0.12, dark);
      vmCyl(root, 0.028, 0.7, 0, 0.02, 0.5, metal);
      vmCyl(root, 0.05, 0.3, 0, 0.09, 0.2, dark);
      vmBox(root, 0.05, 0.1, 0.3, 0, -0.02, -0.2, wood);
      vmBox(root, 0.035, 0.07, 0.06, 0, -0.07, 0.15, dark);
      // Visor: anillos en los extremos y soportes
      vmBox(root, 0.062, 0.062, 0.02, 0, 0.09, 0.05, '#17181b');
      vmBox(root, 0.072, 0.072, 0.02, 0, 0.09, 0.35, '#17181b');
      vmBox(root, 0.02, 0.04, 0.03, 0, 0.055, 0.12, dark);
      vmBox(root, 0.02, 0.04, 0.03, 0, 0.055, 0.28, dark);
      adsY = 0.09;
      muzzleZ = 0.87;
      right = [0, -0.09, 0.0];
      left = [0, -0.05, 0.55];
    }

    // Manos y mangas (del color de tu equipo); con arma .glb no se dibujan
    if (!gm) {
      vmBox(root, 0.075, 0.075, 0.09, right[0], right[1], right[2], skin);
      vmBox(root, 0.1, 0.1, 0.55, right[0] + 0.03, right[1] - 0.1, right[2] - 0.3, sleeve, 0.3);
      if (left) {
        vmBox(root, 0.075, 0.075, 0.09, left[0], left[1], left[2], skin);
        vmBox(root, 0.1, 0.1, 0.55, left[0] - 0.12, left[1] - 0.14, left[2] - 0.3, sleeve, 0.35);
      }
    }

    const muzzle = new BABYLON.TransformNode('muzzle', scene);
    muzzle.parent = root;
    muzzle.position.set(0, muzzleY, muzzleZ);
    flashMesh.parent = muzzle;

    vm.root = root;
    vm.adsY = adsY;
    vm.muzzle = muzzle;
    vm.swap = 1; // animación al sacar el arma
    vm.kick = 0;
    root.position.copyFrom(VM_BASE);
  }

  function updateViewmodel(dt, now) {
    if (!vm.root) return;
    vm.kick *= Math.exp(-dt * 16);
    if (vm.spinNode) {
      // el minigun gira mientras disparas y se frena poco a poco
      vm.spinV = vm.spinV || 0;
      vm.spinV += (((firing && weapon === 'minigun' && !menuOpen) ? 30 : 0) - vm.spinV) * Math.min(1, dt * 6);
      vm.spinNode.rotation.z += vm.spinV * dt;
    }
    vm.swap = Math.max(0, vm.swap - dt * 4);
    vm.sprint += ((sprinting && moveAmt > 0.1 ? 1 : 0) - vm.sprint) * Math.min(1, dt * 9);
    vm.bob += dt * 9 * moveAmt * (1 + 0.5 * vm.sprint);

    let rp = 0;
    if (reloading) rp = Math.max(0, Math.min(1, (now - reloadStart) / (reloadEnd - reloadStart)));
    const dip = Math.sin(rp * Math.PI);
    // Al tirarte al suelo el arma baja de golpe; ya tendido queda un poco más abajo
    const dive = Math.min(0.14, Math.max(0, stanceVel) * 0.03);

    // Al correr el arma baja y se ladea, como en cualquier shooter
    // Al apuntar el arma pasa al centro de la pantalla, con la mira justo frente al ojo
    const a = adsAmt;
    const bobK = 1 - 0.85 * a; // apuntando casi no se mueve
    vm.root.position.set(
      VM_BASE.x * (1 - a) + Math.cos(vm.bob * 0.5) * 0.006 * moveAmt * bobK - vm.sprint * 0.04,
      VM_BASE.y * (1 - a) - vm.adsY * a + Math.sin(vm.bob) * 0.007 * moveAmt * bobK - dip * 0.14 - vm.swap * 0.3 - vm.sprint * 0.05 - dive - Math.max(0, stanceAmt - 1) * 0.02,
      VM_BASE.z + 0.12 * a - vm.kick * 0.05 * (1 - 0.5 * a)
    );
    vm.root.rotation.x = -vm.kick * 0.07 * (1 - 0.6 * a) + dip * 0.8 + vm.sprint * 0.4 + dive * 2.5;
    vm.root.rotation.y = -vm.sprint * 0.3;
    vm.slash = Math.max(0, (vm.slash || 0) - dt * 3.2);
    const sl = Math.sin(vm.slash * Math.PI);
    vm.root.rotation.z = sl * 1.0;
    vm.root.rotation.x -= sl * 0.7;
    vm.root.position.x -= sl * 0.12;
    // Francotirador apuntando: se esconde el arma y se ve la mira del visor
    const scoped = !!SCOPED[weapon] && a > 0.85;
    vm.root.setEnabled(!scoped);
    flashMesh.setEnabled(!scoped && now < vm.flashUntil);
  }

  function muzzlePosition() {
    if (vm.muzzle) {
      vm.muzzle.computeWorldMatrix(true);
      return vm.muzzle.getAbsolutePosition().clone();
    }
    return camera.position.clone();
  }

  // ---------------------------------------------------------------------------
  // Efectos: balas que se ven viajar, chispas y marcas en las paredes
  // ---------------------------------------------------------------------------
  const tracerMat = emissiveMat('tracerMat', '#ffe9a0');
  const tracerPool = [];
  const tracers = [];
  const TRACER_SPEED = 300; // metros por segundo (cada arma puede tener su propia velocidad)

  function spawnTracer(from, to, speed, onArrive) {
    const a = new BABYLON.Vector3(from[0], from[1], from[2]);
    const b = new BABYLON.Vector3(to[0], to[1], to[2]);
    const d = b.subtract(a);
    const dist = d.length();
    if (dist < 0.5) return;
    let m = tracerPool.pop();
    if (!m) {
      m = BABYLON.MeshBuilder.CreateBox('tracer', { width: 0.04, height: 0.04, depth: 2.2 }, scene);
      m.material = tracerMat;
      m.isPickable = false;
    }
    m.setEnabled(true);
    m.position.copyFrom(a);
    m.lookAt(b);
    tracers.push({ m, a, dir: d.scale(1 / dist), dist, traveled: 0, speed: speed || TRACER_SPEED, onArrive });
  }

  const SPARK_COUNT = 48;
  const sparkMats = { warm: emissiveMat('sparkWarm', '#ffd37a'), red: emissiveMat('sparkRed', '#ff5a4a'), green: emissiveMat('sparkGreen', '#5bff6a') };
  const sparks = [];
  for (let i = 0; i < SPARK_COUNT; i++) {
    const m = BABYLON.MeshBuilder.CreateBox('spark', { size: 0.045 }, scene);
    m.material = sparkMats.warm;
    m.isPickable = false;
    m.setEnabled(false);
    sparks.push({ m, v: new BABYLON.Vector3(), life: 0 });
  }
  let sparkIdx = 0;

  function spawnSparks(p, n, kind, count) {
    for (let i = 0; i < count; i++) {
      const s = sparks[sparkIdx++ % SPARK_COUNT];
      s.m.material = sparkMats[kind];
      s.m.position.copyFrom(p);
      s.m.scaling.setAll(1);
      s.v.set(
        n.x * 2 + (Math.random() - 0.5) * 3,
        n.y * 2 + Math.random() * 1.5,
        n.z * 2 + (Math.random() - 0.5) * 3
      );
      s.life = 0.3;
      s.m.setEnabled(true);
    }
  }

  const DECAL_COUNT = 20;
  const decalMat = new BABYLON.StandardMaterial('decalMat', scene);
  decalMat.diffuseColor = BABYLON.Color3.FromHexString('#0c0c0c');
  decalMat.specularColor = BABYLON.Color3.Black();
  decalMat.alpha = 0.6;
  decalMat.backFaceCulling = false;
  decalMat.zOffset = -2;
  const decals = [];
  for (let i = 0; i < DECAL_COUNT; i++) {
    const m = BABYLON.MeshBuilder.CreatePlane('decal', { size: 0.14 }, scene);
    m.material = decalMat;
    m.isPickable = false;
    m.setEnabled(false);
    decals.push({ m, until: 0 });
  }
  let decalIdx = 0;

  function spawnDecal(p, n) {
    const d = decals[decalIdx++ % DECAL_COUNT];
    d.m.position.copyFrom(p.add(n.scale(0.012)));
    d.m.lookAt(p.subtract(n)); // se pega plana sobre la superficie
    d.m.setEnabled(true);
    d.until = performance.now() + 15000;
  }

  function updateFx(dt, now) {
    for (let i = tracers.length - 1; i >= 0; i--) {
      const t = tracers[i];
      t.traveled += t.speed * dt;
      if (t.traveled >= t.dist) {
        t.m.setEnabled(false);
        tracerPool.push(t.m);
        tracers.splice(i, 1);
        if (t.onArrive) t.onArrive();
      } else {
        t.m.position.copyFrom(t.a).addInPlace(t.dir.scale(t.traveled));
      }
    }
    for (const s of sparks) {
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) {
        s.m.setEnabled(false);
        continue;
      }
      s.v.y -= 9 * dt;
      s.m.position.addInPlace(s.v.scale(dt));
      s.m.scaling.setAll(Math.max(0.15, s.life / 0.3));
    }
    for (const d of decals) {
      if (d.until && now > d.until) {
        d.m.setEnabled(false);
        d.until = 0;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Armas especiales: cajas, misil de la bazuca, hojas del porro, explosiones y mareo
  // ---------------------------------------------------------------------------
  const V = (a) => new BABYLON.Vector3(a[0], a[1], a[2]);
  const r2 = (n) => Math.round(n * 100) / 100;

  // Tareas con retraso (para que los impactos aparezcan cuando la bala llega, no al disparar)
  const timers = [];
  function after(ms, fn) {
    timers.push({ at: performance.now() + Math.max(0, ms), fn });
  }
  function updateTimers(now) {
    for (let i = timers.length - 1; i >= 0; i--) {
      if (now >= timers[i].at) {
        const t = timers.splice(i, 1)[0];
        try { t.fn(); } catch (err) { console.error(err); }
      }
    }
  }

  const smokeMat = new BABYLON.StandardMaterial('smokeMat', scene);
  smokeMat.diffuseColor = new BABYLON.Color3(0.3, 0.3, 0.3);
  smokeMat.emissiveColor = new BABYLON.Color3(0.18, 0.18, 0.18);
  smokeMat.specularColor = BABYLON.Color3.Black();
  const fireMat = emissiveMat('fireMat', '#ff7a1a');
  const coreMat = emissiveMat('coreMat', '#fff1b0');
  const leafSmokeMat = emissiveMat('leafSmokeMat', '#6dff7a');

  // Bolitas de humo reutilizables
  const puffs = [];
  const puffPool = [];
  function spawnPuff(pos, size, life, material) {
    let m = puffPool.pop();
    if (!m) {
      m = BABYLON.MeshBuilder.CreateSphere('puff', { diameter: 1, segments: 4 }, scene);
      m.isPickable = false;
    }
    m.material = material || smokeMat;
    m.position.copyFrom(pos);
    m.scaling.setAll(size);
    m.visibility = 0.55;
    m.setEnabled(true);
    puffs.push({ m, t: 0, life, size, rise: 0.5 + Math.random() * 0.6 });
  }
  function updatePuffs(dt) {
    for (let i = puffs.length - 1; i >= 0; i--) {
      const p = puffs[i];
      p.t += dt;
      const k = p.t / p.life;
      if (k >= 1) {
        p.m.setEnabled(false);
        puffPool.push(p.m);
        puffs.splice(i, 1);
        continue;
      }
      p.m.scaling.setAll(p.size * (1 + k * 1.6));
      p.m.visibility = 0.55 * (1 - k);
      p.m.position.y += p.rise * dt;
    }
  }

  // Explosión: bola de fuego, núcleo, humo, escombros, temblor y estruendo
  const explosions = [];
  function boomSound(dist) {
    const g = Math.max(0.05, Math.min(1, 1 - dist / 140));
    blip(120, 0.7, 'sawtooth', 0.4 * g, 0, 25);
    blip(70, 0.9, 'square', 0.25 * g, 0.02, 20);
    blip(900, 0.15, 'square', 0.08 * g, 0, 100);
  }
  function explosionAt(pos) {
    const dist = BABYLON.Vector3.Distance(camera.position, pos);
    boomSound(dist);
    shake = Math.max(shake, 0.05 * Math.max(0, 1 - dist / 35));
    const ball = (material, size, life, alpha) => {
      const m = BABYLON.MeshBuilder.CreateSphere('boom', { diameter: 1, segments: 8 }, scene);
      m.material = material;
      m.isPickable = false;
      m.position.copyFrom(pos);
      explosions.push({ m, t: 0, life, size, alpha });
    };
    ball(fireMat, 12, 0.5, 0.85);
    ball(coreMat, 7, 0.3, 1);
    for (let i = 0; i < 12; i++) {
      const o = pos.add(new BABYLON.Vector3((Math.random() - 0.5) * 4, Math.random() * 2.5, (Math.random() - 0.5) * 4));
      spawnPuff(o, 2 + Math.random() * 2, 1.4 + Math.random() * 0.6);
    }
    for (let i = 0; i < 24; i++) {
      const s = sparks[sparkIdx++ % SPARK_COUNT];
      s.m.material = sparkMats[i % 2 ? 'warm' : 'red'];
      s.m.position.copyFrom(pos);
      s.m.scaling.setAll(1);
      s.v.set((Math.random() - 0.5) * 14, 3 + Math.random() * 9, (Math.random() - 0.5) * 14);
      s.life = 0.8;
      s.m.setEnabled(true);
    }
  }
  function updateExplosions(dt) {
    for (let i = explosions.length - 1; i >= 0; i--) {
      const e = explosions[i];
      e.t += dt;
      const k = e.t / e.life;
      if (k >= 1) {
        e.m.dispose();
        explosions.splice(i, 1);
        continue;
      }
      e.m.scaling.setAll(e.size * (1 - Math.pow(1 - k, 3)) + 0.1);
      e.m.visibility = e.alpha * (1 - k * k);
    }
  }

  // Proyectiles que viajan de verdad (misil y hojas): salen de la boca del arma y llegan al blanco
  const projectiles = [];
  const rocketMats = { body: mat('#8a8f98'), nose: mat('#c1121f'), fin: mat('#3a3d42') };

  function launchRocket(from, to) {
    const a = V(from);
    const b = V(to);
    const d = b.subtract(a);
    const dist = d.length();
    if (dist < 1) { explosionAt(b); return; }
    const root = new BABYLON.TransformNode('rocket', scene);
    const part = (mesh, mt, x, y, z) => {
      mesh.material = mt;
      mesh.parent = root;
      mesh.position.set(x, y, z);
      mesh.isPickable = false;
      return mesh;
    };
    part(BABYLON.MeshBuilder.CreateCylinder('rb', { diameter: 0.16, height: 0.8, tessellation: 10 }, scene), rocketMats.body, 0, 0, 0).rotation.x = Math.PI / 2;
    part(BABYLON.MeshBuilder.CreateCylinder('rn', { diameterTop: 0, diameterBottom: 0.16, height: 0.28, tessellation: 10 }, scene), rocketMats.nose, 0, 0, 0.54).rotation.x = Math.PI / 2;
    for (let i = 0; i < 3; i++) {
      part(BABYLON.MeshBuilder.CreateBox('rf', { width: 0.02, height: 0.3, depth: 0.2 }, scene), rocketMats.fin, 0, 0, -0.32).rotation.z = (i * Math.PI) / 3;
    }
    const flame = part(BABYLON.MeshBuilder.CreatePlane('rfl', { size: 0.7 }, scene), flashMat, 0, 0, -0.65);
    flame.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
    root.scaling.setAll(1.4);
    root.position.copyFrom(a);
    root.lookAt(b);
    for (let i = 0; i < 6; i++) spawnPuff(a, 0.5 + Math.random() * 0.4, 0.8); // humo de salida
    projectiles.push({ node: root, a, dir: d.scale(1 / dist), dist, speed: WEAPONS.bazuca.speed, traveled: 0, trail: 0, kind: 'rocket', onArrive: () => explosionAt(b) });
  }

  // Hoja de marihuana dibujada en una textura
  const leafTex = new BABYLON.DynamicTexture('leafTex', 128, scene, true);
  (function drawLeaf() {
    const c = leafTex.getContext();
    c.clearRect(0, 0, 128, 128);
    c.translate(64, 112);
    [[0, 92], [-32, 74], [32, 74], [-62, 54], [62, 54], [-88, 34], [88, 34]].forEach(([deg, len]) => {
      c.save();
      c.rotate((deg * Math.PI) / 180);
      c.beginPath();
      c.moveTo(0, 0);
      c.quadraticCurveTo(-9, -len * 0.55, 0, -len);
      c.quadraticCurveTo(9, -len * 0.55, 0, 0);
      c.fillStyle = '#3ddc4a';
      c.fill();
      c.lineWidth = 2;
      c.strokeStyle = '#176b22';
      c.stroke();
      c.beginPath();
      c.moveTo(0, -4);
      c.lineTo(0, -len * 0.85);
      c.lineWidth = 1.5;
      c.stroke();
      c.restore();
    });
    c.fillStyle = '#176b22';
    c.fillRect(-2, 0, 4, 14);
    leafTex.hasAlpha = true;
    leafTex.update();
  })();
  const leafMat = new BABYLON.StandardMaterial('leafMat', scene);
  leafMat.diffuseTexture = leafTex;
  leafMat.useAlphaFromDiffuseTexture = true;
  leafMat.emissiveColor = BABYLON.Color3.White();
  leafMat.disableLighting = true;
  leafMat.backFaceCulling = false;
  leafMat.fogEnabled = false;

  function launchLeaf(from, to) {
    const a = V(from);
    const b = V(to);
    const d = b.subtract(a);
    const dist = d.length();
    if (dist < 0.5) return;
    const plane = BABYLON.MeshBuilder.CreatePlane('leaf', { size: 0.7 }, scene);
    plane.material = leafMat;
    plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
    plane.isPickable = false;
    plane.position.copyFrom(a);
    projectiles.push({
      node: plane, a, dir: d.scale(1 / dist), dist, speed: WEAPONS.porro.speed, traveled: 0, trail: 0, kind: 'leaf',
      onArrive: () => { for (let i = 0; i < 5; i++) spawnPuff(b, 0.5 + Math.random() * 0.4, 0.7, leafSmokeMat); },
    });
  }

  function updateProjectiles(dt) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      p.traveled += p.speed * dt;
      const pos = p.a.add(p.dir.scale(Math.min(p.traveled, p.dist)));
      p.node.position.copyFrom(pos);
      p.trail -= dt;
      if (p.trail <= 0) {
        if (p.kind === 'rocket') { p.trail = 0.02; spawnPuff(pos, 0.35, 0.8); }
        else { p.trail = 0.04; spawnPuff(pos, 0.22, 0.45, leafSmokeMat); }
      }
      if (p.kind === 'leaf') p.node.scaling.setAll(1 + 0.15 * Math.sin(p.traveled * 1.2));
      if (p.traveled >= p.dist) {
        p.node.dispose();
        projectiles.splice(i, 1);
        if (p.onArrive) p.onArrive();
      }
    }
  }

  // Un disparo (tuyo o de otro jugador): elige cómo se ve la bala según el arma
  function launchProjectile(id, from, to, remote) {
    const w = WEAPONS[id];
    if (id === 'cuchillo' || (remote && SILENCED[id])) return; // el silenciador no deja ver la bala a los demás
    if (id === 'bazuca') { launchRocket(from, to); return; }
    if (id === 'porro') { launchLeaf(from, to); return; }
    let onArrive = null;
    if (remote && w) {
      const len = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
      if (len < w.range - 1) onArrive = () => spawnSparks(V(to), BABYLON.Vector3.Up(), 'warm', 2);
    }
    spawnTracer(from, to, w && w.speed, onArrive);
  }

  // ---- Mareo del porro ----
  const dizzyOv = document.createElement('div');
  dizzyOv.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;pointer-events:none;z-index:5;opacity:0;'
    + 'background:radial-gradient(circle at 50% 50%,rgba(80,255,110,0) 22%,rgba(60,220,90,.55) 100%)';
  document.body.appendChild(dizzyOv);
  let dizzyOn = false;

  function giveDizzy(ms) {
    const now = performance.now();
    if (now >= dizzyUntil) dizzyStart = now;
    dizzyUntil = Math.max(dizzyUntil, now + ms);
    feed('¡Te pegó un porro! Estás mareado');
    blip(200, 0.6, 'sine', 0.1, 0, 420);
  }
  function dizzyAmount(now) {
    if (now >= dizzyUntil) return 0;
    return Math.min(1, (now - dizzyStart) / 700, (dizzyUntil - now) / 1800);
  }
  function applyDizzyFx(k, now) {
    if (k > 0.01) {
      dizzyOn = true;
      canvas.style.filter = 'hue-rotate(' + ((now / 14) % 360).toFixed(0) + 'deg) saturate(' + (1 + k * 1.4).toFixed(2) + ') blur(' + (k * 1.4).toFixed(1) + 'px)';
      dizzyOv.style.opacity = String(k * (0.65 + 0.3 * Math.sin(now / 420)));
    } else if (dizzyOn) {
      clearDizzyFx();
    }
  }
  function clearDizzyFx() {
    dizzyOn = false;
    canvas.style.filter = '';
    dizzyOv.style.opacity = '0';
    camera.rotation.z = 0;
  }
  function clearDizzy() {
    dizzyUntil = 0;
    clearDizzyFx();
  }

  // ---- Cajas con armas ----
  const CRATE_COLORS = { minigun: '#ff8c1a', bazuca: '#ff3b30', porro: '#3ddc4a' };
  const crates = new Map();
  const crateMatCache = {};
  const crateMat = (hex) => crateMatCache[hex] || (crateMatCache[hex] = mat(hex));
  const platMatCache = {};
  function platMat(hex, light) {
    const key = hex + (light ? 'l' : 'd');
    if (!platMatCache[key]) {
      const m = new BABYLON.StandardMaterial('plat' + key, scene);
      const c = BABYLON.Color3.FromHexString(hex);
      m.diffuseColor = light ? c : c.scale(0.55);
      m.emissiveColor = light ? c.scale(0.8) : c.scale(0.3);
      m.specularColor = BABYLON.Color3.Black();
      platMatCache[key] = m;
    }
    return platMatCache[key];
  }
  const beamMatCache = {};
  function beamMat(hex) {
    if (!beamMatCache[hex]) {
      const m = new BABYLON.StandardMaterial('beam' + hex, scene);
      m.emissiveColor = BABYLON.Color3.FromHexString(hex);
      m.disableLighting = true;
      m.alpha = 0.28;
      m.backFaceCulling = false;
      m.fogEnabled = false;
      beamMatCache[hex] = m;
    }
    return beamMatCache[hex];
  }

  // Altura del suelo en ese punto (se mira de arriba hacia abajo desde poco más alto que una persona)
  function groundY(x, z) {
    probe.origin.set(x, 8, z);
    probe.direction.set(0, -1, 0);
    probe.length = 40;
    const p = scene.pickWithRay(probe, solid);
    return p && p.hit ? p.pickedPoint.y : 0;
  }

  function setCrateActive(c, on) {
    c.active = on;
    c.fl.setEnabled(on);
    c.beam.setEnabled(on);
    c.disc.setEnabled(on);
  }

  function addCrate(info) {
    const col = CRATE_COLORS[info.w] || '#ffffff';
    const y = groundY(info.x, info.z);
    const root = new BABYLON.TransformNode('crate' + info.id, scene);
    root.position.set(info.x, y, info.z);
    const add = (mesh, px, py, pz, material) => {
      mesh.parent = root;
      mesh.position.set(px, py, pz);
      mesh.material = material;
      mesh.isPickable = false; // las balas la atraviesan y se recoge caminando encima
      return mesh;
    };
    add(BABYLON.MeshBuilder.CreateCylinder('cpl', { diameter: 2.4, height: 0.16, tessellation: 28 }, scene), 0, 0.08, 0, platMat(col, false));
    add(BABYLON.MeshBuilder.CreateCylinder('cpl2', { diameter: 1.7, height: 0.05, tessellation: 28 }, scene), 0, 0.185, 0, platMat(col, true));
    const fl = new BABYLON.TransformNode('cf', scene);
    fl.parent = root;
    fl.position.y = 1.7;
    fl.scaling.setAll(1.2);
    addGunParts(fl, info.w);
    const beam = add(BABYLON.MeshBuilder.CreateCylinder('beam', { diameter: 0.7, height: 40, tessellation: 10 }, scene), 0, 20, 0, beamMat(col));
    const disc = add(BABYLON.MeshBuilder.CreateDisc('disc', { radius: 1.4, tessellation: 20 }, scene), 0, 0.04, 0, beamMat(col));
    disc.rotation.x = Math.PI / 2;
    const c = { id: info.id, x: info.x, z: info.z, y, w: info.w, root, fl, beam, disc, active: true, askedAt: 0 };
    crates.set(info.id, c);
    setCrateActive(c, info.on !== false);
  }
  function clearCrates() {
    crates.forEach((c) => c.root.dispose());
    crates.clear();
  }
  function buildCrates(list) {
    clearCrates();
    list.forEach(addCrate);
  }
  function animateCrates(dt, now) {
    crates.forEach((c) => {
      if (!c.active) return;
      c.fl.rotation.y += dt * 1.6;
      c.fl.position.y = 1.7 + Math.sin(now / 350 + c.id) * 0.15;
      c.beam.visibility = 0.7 + Math.sin(now / 500 + c.id) * 0.3;
    });
  }
  // Al pasar sobre una caja se le pide al servidor; él decide si te la da
  function checkCratePickup(now) {
    crates.forEach((c) => {
      if (!c.active || now - c.askedAt < 700) return;
      const dx = camera.position.x - c.x;
      const dz = camera.position.z - c.z;
      if (dx * dx + dz * dz < 2.4 * 2.4 && Math.abs(camera.position.y - (c.y + 1.7)) < 2.5) {
        c.askedAt = now;
        send({ t: 'pickup', id: c.id });
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Curaciones en el mapa y granada de planta
  // ---------------------------------------------------------------------------
  const healMat = new BABYLON.StandardMaterial('healMat', scene);
  healMat.diffuseColor = BABYLON.Color3.FromHexString('#e11d2e');
  healMat.emissiveColor = BABYLON.Color3.FromHexString('#7a0a12');
  healMat.specularColor = BABYLON.Color3.Black();
  const healShadowMat = new BABYLON.StandardMaterial('healShadowMat', scene);
  healShadowMat.diffuseColor = BABYLON.Color3.Black();
  healShadowMat.specularColor = BABYLON.Color3.Black();
  healShadowMat.alpha = 0.3;
  healShadowMat.backFaceCulling = false;

  const heals = new Map(); // id -> curación (cruz roja pequeña que flota sobre el suelo)

  function addHeal(info) {
    if (heals.has(info.id)) return;
    const y = groundY(info.x, info.z);
    const root = new BABYLON.TransformNode('heal' + info.id, scene);
    root.position.set(info.x, y, info.z);
    const body = new BABYLON.TransformNode('hb', scene);
    body.parent = root;
    body.position.y = 0.8;
    [[0.34, 0.11, 0.11], [0.11, 0.34, 0.11]].forEach(([w, h, d]) => {
      const m = BABYLON.MeshBuilder.CreateBox('hp', { width: w, height: h, depth: d }, scene);
      m.material = healMat;
      m.parent = body;
      m.isPickable = false;
    });
    const shadow = BABYLON.MeshBuilder.CreateDisc('hs', { radius: 0.22, tessellation: 16 }, scene);
    shadow.material = healShadowMat;
    shadow.parent = root;
    shadow.position.y = 0.03;
    shadow.rotation.x = Math.PI / 2;
    shadow.isPickable = false;
    heals.set(info.id, { id: info.id, x: info.x, z: info.z, y, root, body, askedAt: 0 });
  }
  function moveHeal(h, x, z) {
    h.x = x;
    h.z = z;
    h.y = groundY(x, z);
    h.root.position.set(x, h.y, z);
  }
  function clearHeals() {
    heals.forEach((h) => h.root.dispose());
    heals.clear();
  }
  function buildHeals(list) {
    clearHeals();
    list.forEach(addHeal);
  }
  function animateHeals(dt, now) {
    heals.forEach((h) => {
      h.body.rotation.y += dt * 2;
      h.body.position.y = 0.8 + Math.sin(now / 400 + h.id) * 0.1;
    });
  }
  // Al pasar sobre una curación (si te falta vida) se le pide al servidor; él decide si te la da
  function checkHealPickup(now) {
    if (hp >= 100) return;
    heals.forEach((h) => {
      if (now - h.askedAt < 600) return;
      const dx = camera.position.x - h.x;
      const dz = camera.position.z - h.z;
      if (dx * dx + dz * dz < 1.6 * 1.6 && Math.abs(camera.position.y - (h.y + 1.7)) < 2.5) {
        h.askedAt = now;
        send({ t: 'heal', id: h.id });
      }
    });
  }

  // ---- Granada: planta de marihuana convertida en granada ----
  const NADE_MAX = 2;
  const NADE_DT = 0.12; // segundos entre puntos de la trayectoria (igual que en server.js)
  const NADE_POINTS = 21; // 20 tramos = mecha de 2.4 s
  const NADE_GRAVITY = 16;
  const NADE_SPEED = 18;
  let nades = NADE_MAX;
  const SMOKE_MAX = 2;
  let smokes = SMOKE_MAX;
  let smokeAiming = false; // mantener H / botón Humo
  let lastSmoke = 0;
  let nadeAiming = false; // mantener G / botón Granada: se ve la trayectoria; al soltar se lanza
  let lastNade = 0;
  const nadeHud = $('nadeHud');
  function updateNadeHud() {
    nadeHud.textContent = '🌿 Granadas: ' + nades + '  💜 Humo: ' + smokes + ((nadeAiming || smokeAiming) ? ' - suelta para lanzar' : (isTouch ? '' : '  [G] [H]'));
  }
  updateNadeHud();

  const nadeBudMat = mat('#2f7a2a');
  const nadeBudMat2 = mat('#4cae3b');
  const nadeDarkMat = mat('#2b2d31');
  const nadeMetalMat = mat('#9aa0a8');

  // Cogollo con bolitas de hojas, tapa y anilla de granada, y una corona de hojas de planta encima
  const smokeBudMat = mat('#6b2fa0');
  const smokeBudMat2 = mat('#a255e0');
  function buildGrenadeMesh(purple) {
    const bm = purple ? smokeBudMat : nadeBudMat;
    const bm2 = purple ? smokeBudMat2 : nadeBudMat2;
    const root = new BABYLON.TransformNode('nade', scene);
    const add = (mesh, x, y, z, material) => {
      mesh.parent = root;
      mesh.position.set(x, y, z);
      mesh.material = material;
      mesh.isPickable = false;
      return mesh;
    };
    add(BABYLON.MeshBuilder.CreateSphere('nb', { diameter: 0.2, segments: 8 }, scene), 0, 0, 0, bm);
    [[0.07, 0.05, 0], [-0.07, 0.04, 0.03], [0.02, 0.08, -0.06], [-0.03, -0.06, 0.07], [0.05, -0.05, -0.05]].forEach(([x, y, z]) =>
      add(BABYLON.MeshBuilder.CreateSphere('nbb', { diameter: 0.12, segments: 6 }, scene), x, y, z, bm2));
    add(BABYLON.MeshBuilder.CreateCylinder('nc', { diameter: 0.07, height: 0.1, tessellation: 8 }, scene), 0, 0.13, 0, nadeDarkMat);
    add(BABYLON.MeshBuilder.CreateTorus('npin', { diameter: 0.12, thickness: 0.015, tessellation: 12 }, scene), 0.09, 0.14, 0, nadeMetalMat).rotation.z = Math.PI / 2;
    for (let i = 0; i < 3; i++) {
      const leaf = BABYLON.MeshBuilder.CreatePlane('nl', { size: 0.55 }, scene);
      leaf.material = purple ? purpleLeafMat : leafMat;
      leaf.parent = root;
      leaf.position.set(0, 0.36, 0);
      leaf.rotation.y = (i * Math.PI) / 3;
      leaf.isPickable = false;
    }
    return root;
  }

  const purpleLeafMat = leafMat.clone('purpleLeafMat');
  purpleLeafMat.diffuseColor = BABYLON.Color3.Black();
  purpleLeafMat.emissiveColor = new BABYLON.Color3(0.62, 0.25, 0.92);
  const purpleSmokeMat = emissiveMat('purpleSmokeMat', '#b06cff');

  // Nube de humo morado: bloquea la vista un buen rato y se disipa sola
  const smokeCloudMat = new BABYLON.StandardMaterial('smokeCloudMat', scene);
  smokeCloudMat.diffuseColor = new BABYLON.Color3(0.5, 0.22, 0.78);
  smokeCloudMat.emissiveColor = new BABYLON.Color3(0.3, 0.1, 0.5);
  smokeCloudMat.specularColor = BABYLON.Color3.Black();
  smokeCloudMat.backFaceCulling = false;
  smokeCloudMat.fogEnabled = false;
  const smokeClouds = [];
  const SMOKE_LIFE = 20;
  const SMOKE_RADIUS = 3.6;
  function spawnSmoke(pos) {
    const cl = { t: 0, balls: [], pos: pos.clone() };
    for (let i = 0; i < 26; i++) {
      const m = BABYLON.MeshBuilder.CreateSphere('smk', { diameter: 1, segments: 6 }, scene);
      m.material = smokeCloudMat;
      m.isPickable = false;
      m.checkCollisions = false;
      m.alwaysSelectAsActiveMesh = true;
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * SMOKE_RADIUS;
      const off = new BABYLON.Vector3(Math.cos(a) * r, 0.2 + Math.random() * 3.2, Math.sin(a) * r);
      m.position.copyFrom(pos.add(off));
      m.visibility = 0;
      cl.balls.push({ m, off, size: 3.4 + Math.random() * 2.4, ph: Math.random() * 6 });
    }
    smokeClouds.push(cl);
    blip(260, 0.7, 'sawtooth', 0.1, 0, 90);
    blip(520, 0.4, 'sine', 0.05, 0.05, 200);
  }
  function updateSmokes(dt) {
    for (let i = smokeClouds.length - 1; i >= 0; i--) {
      const cl = smokeClouds[i];
      cl.t += dt;
      const k = cl.t / SMOKE_LIFE;
      if (k >= 1) {
        cl.balls.forEach((b) => b.m.dispose());
        smokeClouds.splice(i, 1);
        continue;
      }
      const fade = k < 0.06 ? k / 0.06 : (k > 0.8 ? (1 - k) / 0.2 : 1);
      const grow = Math.min(1, cl.t / 1.4);
      cl.balls.forEach((b) => {
        b.m.scaling.setAll(b.size * (0.25 + 0.75 * grow) * (1 + 0.05 * Math.sin(cl.t * 1.4 + b.ph)));
        b.m.position.set(cl.pos.x + b.off.x * grow, cl.pos.y + b.off.y * grow + k * 0.8, cl.pos.z + b.off.z * grow);
        b.m.visibility = 0.9 * fade;
      });
    }
  }
  function clearSmokes() {
    smokeClouds.forEach((cl) => cl.balls.forEach((b) => b.m.dispose()));
    smokeClouds.length = 0;
  }

  const nadeRay = new BABYLON.Ray(new BABYLON.Vector3(), new BABYLON.Vector3(0, -1, 0), 1);

  // Simula el vuelo: gravedad, rebotes en paredes y suelo, y se frena hasta quedar quieta.
  // Devuelve `samples` puntos separados NADE_DT segundos.
  function simulateGrenade(origin, vel, step, samples, every) {
    const pos = origin.clone();
    const v = vel.clone();
    const pts = [[r2(pos.x), r2(pos.y), r2(pos.z)]];
    const total = (samples - 1) * every;
    let rest = false;
    for (let i = 1; i <= total; i++) {
      if (!rest) {
        v.y -= NADE_GRAVITY * step;
        const move = v.scale(step);
        const len = move.length();
        if (len > 1e-4) {
          nadeRay.origin.copyFrom(pos);
          nadeRay.direction.copyFrom(move.scale(1 / len));
          nadeRay.length = len + 0.1;
          const pick = scene.pickWithRay(nadeRay, solid);
          if (pick && pick.hit && pick.pickedPoint) {
            let n = null;
            try { n = pick.getNormal(true); } catch { n = null; }
            if (!n) n = BABYLON.Vector3.Up();
            const d = BABYLON.Vector3.Dot(v, n);
            if (d < 0) {
              const vn = n.scale(d);
              const vt = v.subtract(vn);
              v.copyFrom(vt.scale(0.7).subtract(vn.scale(0.45))); // rebota: pierde fuerza y roza
            }
            pos.copyFrom(pick.pickedPoint).addInPlace(n.scale(0.1));
            if (v.length() < 1.6) { v.set(0, 0, 0); rest = true; }
          } else {
            pos.addInPlace(move);
          }
        }
      }
      if (i % every === 0) pts.push([r2(pos.x), r2(pos.y), r2(pos.z)]);
    }
    return pts;
  }

  function nadeThrowParams() {
    const fwd = camera.getForwardRay(1).direction;
    const origin = camera.position.add(fwd.scale(0.5));
    origin.y -= 0.12;
    const vel = fwd.scale(NADE_SPEED);
    vel.y += 3.5;
    return { origin, vel };
  }

  // Círculo en el suelo que marca el área de la explosión
  const NADE_LINE_POINTS = 41;
  const NADE_BLAST_RADIUS = 5.5; // igual que GRENADE.radius en server.js
  const NADE_MARK_RADIUS = 2.6; // tamaño del círculo que se ve en el piso
  const nadeZoneMat = new BABYLON.StandardMaterial('nadeZoneMat', scene);
  nadeZoneMat.diffuseColor = BABYLON.Color3.Black();
  nadeZoneMat.specularColor = BABYLON.Color3.Black();
  nadeZoneMat.emissiveColor = new BABYLON.Color3(1, 0.25, 0.15);
  nadeZoneMat.disableLighting = true;
  nadeZoneMat.alpha = 0.3;
  nadeZoneMat.backFaceCulling = false;
  nadeZoneMat.zOffset = -4;
  const nadeRingMat = new BABYLON.StandardMaterial('nadeRingMat', scene);
  nadeRingMat.emissiveColor = new BABYLON.Color3(1, 0.35, 0.2);
  nadeRingMat.disableLighting = true;
  nadeRingMat.backFaceCulling = false;
  nadeRingMat.zOffset = -5;
  const nadeZone = BABYLON.MeshBuilder.CreateDisc('nadeZone', { radius: NADE_MARK_RADIUS, tessellation: 48 }, scene);
  nadeZone.rotation.x = Math.PI / 2;
  nadeZone.material = nadeZoneMat;
  nadeZone.isPickable = false;
  nadeZone.setEnabled(false);
  const nadeRing = BABYLON.MeshBuilder.CreateTorus('nadeRing', { diameter: NADE_MARK_RADIUS * 2, thickness: 0.09, tessellation: 48 }, scene);
  nadeRing.material = nadeRingMat;
  nadeRing.isPickable = false;
  nadeRing.setEnabled(false);
  const nadeGroundRay = new BABYLON.Ray(new BABYLON.Vector3(), new BABYLON.Vector3(0, -1, 0), 6);
  let nadeDotsOn = false;
  let nadePreviewAt = 0;
  function hideNadeDots() {
    if (!nadeDotsOn) return;
    nadeDotsOn = false;
    nadeZone.setEnabled(false);
    nadeRing.setEnabled(false);
  }
  function updateNadePreview(now) {
    const aimOk = nadeAiming ? nades > 0 : (smokeAiming && smokes > 0);
    if (!aimOk || !playing || menuOpen) { hideNadeDots(); return; }
    if (now - nadePreviewAt < 60) return;
    nadePreviewAt = now;
    const { origin, vel } = nadeThrowParams();
    const pts = simulateGrenade(origin, vel, 0.06, NADE_LINE_POINTS, 1);
    const e = pts[pts.length - 1];
    nadeGroundRay.origin.set(e[0], e[1] + 1, e[2]);
    const pick = scene.pickWithRay(nadeGroundRay, solid);
    const gy = pick && pick.hit && pick.pickedPoint ? pick.pickedPoint.y : e[1];
    nadeZone.position.set(e[0], gy + 0.06, e[2]);
    nadeRing.position.set(e[0], gy + 0.07, e[2]);
    nadeZone.setEnabled(true);
    nadeRing.setEnabled(true);
    nadeDotsOn = true;
  }

  const nadeFlights = []; // granadas en el aire (tuyas y de los demás)
  function launchGrenade(pts, kind) {
    if (!Array.isArray(pts) || pts.length < 2) return;
    const smoke = kind === 'smoke';
    const node = buildGrenadeMesh(smoke);
    node.position.set(pts[0][0], pts[0][1], pts[0][2]);
    nadeFlights.push({ node, pts, t: 0, trail: 0, smoke });
  }
  function updateNadeFlights(dt) {
    for (let i = nadeFlights.length - 1; i >= 0; i--) {
      const f = nadeFlights[i];
      f.t += dt;
      const k = f.t / NADE_DT;
      const last = f.pts.length - 1;
      if (k >= last) {
        const end = V(f.pts[last]);
        f.node.dispose();
        nadeFlights.splice(i, 1);
        if (f.smoke) {
          spawnSmoke(end.add(new BABYLON.Vector3(0, 0.3, 0)));
          for (let j = 0; j < 8; j++) spawnPuff(end.add(new BABYLON.Vector3((Math.random() - 0.5) * 2, Math.random() * 1.5, (Math.random() - 0.5) * 2)), 1.2 + Math.random(), 1.2, purpleSmokeMat);
          continue;
        }
        explosionAt(end);
        for (let j = 0; j < 10; j++) {
          spawnPuff(end.add(new BABYLON.Vector3((Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3)), 1.4 + Math.random() * 1.2, 1.6 + Math.random() * 0.8, leafSmokeMat);
        }
        continue;
      }
      const i0 = Math.floor(k);
      const a = f.pts[i0];
      const b = f.pts[i0 + 1];
      const u = k - i0;
      f.node.position.set(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u);
      f.node.rotation.y += dt * 9;
      f.node.rotation.x += dt * 5;
      f.trail -= dt;
      if (f.trail <= 0) {
        f.trail = 0.06;
        spawnPuff(f.node.position, 0.2, 0.5, f.smoke ? purpleSmokeMat : leafSmokeMat);
      }
    }
  }
  function clearNades() {
    nadeFlights.forEach((f) => f.node.dispose());
    nadeFlights.length = 0;
    clearSmokes();
    smokeAiming = false;
    nadeAiming = false;
    hideNadeDots();
    updateNadeHud();
  }

  function throwGrenade() {
    const now = performance.now();
    if (!playing || menuOpen || editMode || nades <= 0 || now - lastNade < 700) return;
    lastNade = now;
    const { origin, vel } = nadeThrowParams();
    const pts = simulateGrenade(origin, vel, 0.03, NADE_POINTS, 4);
    nades--;
    updateNadeHud();
    blip(300, 0.15, 'sine', 0.08, 0, 160);
    vm.kick = 1;
    send({ t: 'nade', path: pts });
    launchGrenade(pts);
  }

  function throwSmoke() {
    const now = performance.now();
    if (!playing || menuOpen || editMode || smokes <= 0 || now - lastSmoke < 700 || now - lastNade < 700) return;
    lastSmoke = now;
    const { origin, vel } = nadeThrowParams();
    const pts = simulateGrenade(origin, vel, 0.03, NADE_POINTS, 4);
    smokes--;
    updateNadeHud();
    blip(300, 0.15, 'sine', 0.08, 0, 160);
    vm.kick = 1;
    send({ t: 'nade', k: 'smoke', path: pts });
    launchGrenade(pts, 'smoke');
  }

  const smokeBtn = $('smokeBtn');
  smokeBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!playing || menuOpen || editMode || smokes <= 0) return;
    try { smokeBtn.setPointerCapture(e.pointerId); } catch { /* ignorar */ }
    smokeBtn.classList.add('down', 'on');
    smokeAiming = true;
    nadeAiming = false;
    updateNadeHud();
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((n) =>
    smokeBtn.addEventListener(n, () => {
      smokeBtn.classList.remove('down', 'on');
      if (!smokeAiming) return;
      smokeAiming = false;
      updateNadeHud();
      if (n === 'pointerup') throwSmoke();
    }));

  // Botón táctil: mantener = ver trayectoria, soltar = lanzar
  const nadeBtn = $('nadeBtn');
  nadeBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!playing || menuOpen || editMode || nades <= 0) return;
    try { nadeBtn.setPointerCapture(e.pointerId); } catch { /* ignorar */ }
    nadeBtn.classList.add('down', 'on');
    nadeAiming = true;
    updateNadeHud();
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((n) =>
    nadeBtn.addEventListener(n, () => {
      nadeBtn.classList.remove('down', 'on');
      if (!nadeAiming) return;
      nadeAiming = false;
      updateNadeHud();
      if (n === 'pointerup') throwGrenade();
    }));

  // ---------------------------------------------------------------------------
  // Disparo, munición y recarga
  // ---------------------------------------------------------------------------
  function updateChip() {
    const w = WEAPONS[weapon];
    updateHotbarAmmo();
  }

  function startReload() {
    const w = WEAPONS[weapon];
    if (!playing || reloading || w.special || w.melee || ammo[weapon] >= w.mag) return;
    reloading = true;
    reloadStart = performance.now();
    reloadEnd = reloadStart + w.reload;
    reloadSound();
    updateChip();
  }

  function refillAll() {
    WEAPON_ORDER.forEach((id) => { ammo[id] = WEAPONS[id].mag; });
    reloading = false;
    updateChip();
  }

  function shoot() {
    const id = weapon;
    const w = WEAPONS[id];
    const now = performance.now();
    if (!playing || menuOpen || editMode || reloading || now - lastShot < w.rate) return;
    if (!w.melee && ammo[id] <= 0) {
      startReload();
      return;
    }
    lastShot = now;
    if (!w.melee) ammo[id]--;
    if (w.melee) vm.slash = 1;
    shotSound(id);

    const base = camera.getForwardRay(w.range);
    const mp = muzzlePosition();
    const from = [r2(mp.x), r2(mp.y), r2(mp.z)];
    const speed = w.speed || TRACER_SPEED;

    let firstTo = null;
    const tos = [];
    const hits = [];
    // Apuntando se dispara más preciso; el francotirador desde la cadera es muy impreciso
    const spread = (w.spread + (id === 'awp' ? 0.035 * (1 - adsAmt) : 0)) * (1 - 0.55 * adsAmt);
    for (let i = 0; i < w.pellets; i++) {
      const dir = base.direction.clone();
      if (spread > 0) {
        dir.x += (Math.random() - 0.5) * 2 * spread;
        dir.y += (Math.random() - 0.5) * 2 * spread;
        dir.z += (Math.random() - 0.5) * 2 * spread;
        dir.normalize();
      }
      const ray = new BABYLON.Ray(base.origin, dir, w.range);
      const pick = scene.pickWithRay(ray, (m) => m.isPickable && m.isVisible && m.isEnabled());
      const hit = pick && pick.hit && pick.pickedPoint;
      const end = hit ? pick.pickedPoint : base.origin.add(dir.scale(w.range));
      const to = [r2(end.x), r2(end.y), r2(end.z)];
      if (!w.melee) launchProjectile(id, from, to, false); // la bala (o el misil) se ve viajar hasta el blanco
      tos.push(to);
      if (!firstTo) firstTo = to;

      if (hit && !w.explosive) {
        // El impacto aparece cuando la bala llega, no al apretar el gatillo
        const delay = (BABYLON.Vector3.Distance(mp, end) / speed) * 1000;
        const pt = end.clone();
        const meta = pick.pickedMesh ? pick.pickedMesh.metadata : null;
        const target = meta && meta.playerId ? remotes.get(meta.playerId) : null;
        if (target) {
          after(delay, () => spawnSparks(pt, BABYLON.Vector3.Up(), id === 'porro' ? 'green' : 'red', 4));
          hits.push(meta.playerId); // todos son enemigos
        } else {
          let n = null;
          try { n = pick.getNormal(true); } catch { n = null; }
          if (!n) n = BABYLON.Vector3.Up();
          const idx = i;
          after(delay, () => {
            if (id === 'porro') { spawnSparks(pt, n, 'green', 4); return; }
            spawnSparks(pt, n, 'warm', w.pellets > 1 ? 2 : 5);
            if (idx < 4 && !w.melee) spawnDecal(pt, n);
          });
        }
      }
    }

    // Retroceso del arma en la mano, de la mira y fogonazo
    vm.kick = w.kick;
    const recoil = w.recoil * (1 - 0.4 * adsAmt);
    pitch -= recoil;
    yaw += (Math.random() - 0.5) * recoil * 0.6;
    if (!w.melee && !SILENCED[id]) vm.flashUntil = now + 50;
    flashMesh.scaling.setAll((0.7 + Math.random() * 0.5) * w.flash * (1 - 0.75 * adsAmt));
    flashMesh.rotation.z = Math.random() * Math.PI;

    send({ t: 'shot', w: id, from, to: firstTo, tos, hits });

    if (w.special) {
      // Las armas de las cajas no se recargan: cuando se acaba la munición, se va la casilla
      if (ammo[id] <= 0) removeFromInventory(id);
      else updateChip();
    } else {
      updateChip();
      if (ammo[id] === 0) startReload();
    }
  }

  // ---------------------------------------------------------------------------
  // Armas: tarjetas y menú
  // ---------------------------------------------------------------------------
  function buildWeaponGrid(container) {
    container.textContent = '';
    inventory.forEach((id) => {
      const w = WEAPONS[id];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'wcard';
      b.dataset.id = id;
      const title = document.createElement('b');
      title.textContent = w.name;
      b.appendChild(title);
      [['Daño', w.ui[0]], ['Cadencia', w.ui[1]], ['Alcance', w.ui[2]]].forEach(([label, n]) => {
        const row = document.createElement('div');
        row.className = 'stat';
        const l = document.createElement('span');
        l.textContent = label;
        const pips = document.createElement('span');
        pips.className = 'pips';
        for (let i = 1; i <= 5; i++) {
          const pip = document.createElement('i');
          if (i <= n) pip.className = 'on';
          pips.appendChild(pip);
        }
        row.append(l, pips);
        b.appendChild(row);
      });
      b.addEventListener('click', () => {
        selectWeapon(id);
        if (menuOpen) closeMenu();
      });
      container.appendChild(b);
    });
  }

  function selectWeapon(id) {
    if (!WEAPONS[id] || !inventory.includes(id)) return;
    const changed = id !== weapon;
    weapon = id;
    lastShot = performance.now(); // pequeña pausa al cambiar de arma
    reloading = false;
    document.querySelectorAll('.wcard').forEach((c) => c.classList.toggle('sel', c.dataset.id === id));
    hotbarEl.querySelectorAll('.hslot').forEach((b) => b.classList.toggle('sel', b.dataset.id === id));
    updateChip();
    if (playing && changed) showWeaponName(WEAPONS[id].name);
    if (playing && (changed || !vm.root)) buildViewmodel(id);
  }

  function openMenu() {
    if (!playing || menuOpen) return;
    menuOpen = true;
    firing = false;
    aiming = false;
    touchAim = false;
    syncActionBtns();
    if (document.pointerLockElement) document.exitPointerLock();
    $('weaponMenu').classList.remove('hidden');
  }

  function closeMenu() {
    menuOpen = false;
    $('weaponMenu').classList.add('hidden');
  }

  // ---------------------------------------------------------------------------
  // Inventario y barra de armas de abajo (como el Minecraft)
  // ---------------------------------------------------------------------------
  const hotCss = document.createElement('style');
  hotCss.textContent = [
    '#hotbar{position:fixed;left:50%;bottom:calc(8px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);display:none;flex-wrap:wrap;justify-content:center;max-width:96vw;gap:4px;padding:5px;background:rgba(10,14,20,.62);border:1px solid rgba(255,255,255,.18);border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,.35);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);z-index:15;touch-action:none;user-select:none;-webkit-user-select:none}',
    'body.playing #hotbar{display:flex}',
    '#hotbar .hslot{position:relative;width:50px;height:38px;padding:0;border:1px solid rgba(255,255,255,.12);border-radius:7px;background:rgba(255,255,255,.06);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .12s,border-color .12s,transform .12s}',
    '#hotbar .hslot.sel{border-color:rgba(255,255,255,.85);background:rgba(255,255,255,.18);box-shadow:0 0 0 1px rgba(255,255,255,.25);transform:translateY(-2px)}',
    '#hotbar canvas{width:42px;height:22px;pointer-events:none}',
    '#hotbar .hnum{position:absolute;top:1px;left:4px;font:bold 10px monospace;color:#fff;text-shadow:0 1px 2px #000;pointer-events:none}',
    '#hotbar .hammo{position:absolute;bottom:1px;right:3px;font:bold 10px monospace;color:#ffe9a0;text-shadow:0 1px 2px #000;pointer-events:none}',
    'body.touch #hotbar .hslot{width:38px;height:32px}',
    'body.touch #hotbar canvas{width:30px;height:17px}',
  ].join('\n');
  document.head.appendChild(hotCss);
  const weaponNameEl = document.createElement('div');
  weaponNameEl.style.cssText = 'position:fixed;left:50%;bottom:calc(100px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:15;pointer-events:none;padding:4px 14px;border-radius:999px;background:rgba(10,14,20,.62);color:#fff;font:800 15px system-ui,sans-serif;letter-spacing:.03em;text-shadow:0 1px 2px #000;opacity:0;transition:opacity .25s;white-space:nowrap';
  document.body.appendChild(weaponNameEl);
  let weaponNameTimer = 0;
  function showWeaponName(text) {
    weaponNameEl.textContent = text;
    weaponNameEl.style.opacity = '1';
    clearTimeout(weaponNameTimer);
    weaponNameTimer = setTimeout(() => { weaponNameEl.style.opacity = '0'; }, 1600);
  }
  const hotbarEl = document.createElement('div');
  hotbarEl.id = 'hotbar';
  document.body.appendChild(hotbarEl);

  function updateHotbarAmmo() {
    hotbarEl.querySelectorAll('.hslot').forEach((b) => {
      const id = b.dataset.id;
      b.lastChild.textContent = reloading && id === weapon ? '...' : (WEAPONS[id].melee ? '' : String(ammo[id] != null ? ammo[id] : ''));
    });
  }

  function renderHotbar() {
    hotbarEl.textContent = '';
    inventory.forEach((id, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.tabIndex = -1; // para que la barra espaciadora (saltar) no active la casilla
      b.className = 'hslot' + (id === weapon ? ' sel' : '');
      b.dataset.id = id;
      const num = document.createElement('span');
      num.className = 'hnum';
      num.textContent = String(i + 1);
      const cv = document.createElement('canvas');
      cv.width = 64;
      cv.height = 36;
      drawGunIcon(cv, id);
      const am = document.createElement('span');
      am.className = 'hammo';
      b.append(num, cv, am);
      b.addEventListener('click', () => { if (isTouch && id === weapon) openMenu(); else selectWeapon(id); b.blur(); });
      hotbarEl.appendChild(b);
    });
    updateHotbarAmmo();
  }

  function refreshInventoryUI() {
    buildWeaponGrid($('weaponGridMenu'));
    document.querySelectorAll('.wcard').forEach((c) => c.classList.toggle('sel', c.dataset.id === weapon));
    renderHotbar();
    updateChip();
  }

  // Recoger un arma de una caja: se agrega una casilla (o se suma munición si ya la tienes)
  function addToInventory(id, n) {
    const w = WEAPONS[id];
    if (!w) return;
    const isNew = !inventory.includes(id);
    if (isNew) inventory.push(id);
    ammo[id] = Math.min(w.mag * 2, (isNew ? 0 : ammo[id] || 0) + (n || w.mag));
    refreshInventoryUI();
    if (isNew) selectWeapon(id);
    feed('Recogiste: ' + w.name);
    blip(660, 0.1, 'square', 0.1, 0);
    blip(990, 0.14, 'square', 0.08, 0.09);
  }

  function removeFromInventory(id) {
    if (!inventory.includes(id)) return;
    inventory = inventory.filter((x) => x !== id);
    delete ammo[id];
    if (weapon === id) {
      weapon = 'ak47';
      reloading = false;
      lastShot = performance.now();
      if (playing) buildViewmodel(weapon);
    }
    refreshInventoryUI();
    feed(WEAPONS[id].name + ' sin munición');
  }

  // Al empezar la partida (o al morir) vuelves a tener solo las 5 armas de siempre
  function resetInventory() {
    inventory = WEAPON_ORDER.slice();
    SPECIAL_ORDER.forEach((id) => { delete ammo[id]; });
    if (!inventory.includes(weapon)) {
      weapon = 'ak47';
      reloading = false;
      if (playing) buildViewmodel(weapon);
    }
    refreshInventoryUI();
  }

  function cycleWeapon(dir) {
    const i = inventory.indexOf(weapon);
    selectWeapon(inventory[(i + dir + inventory.length) % inventory.length]);
  }

  buildWeaponGrid($('weaponGridMenu'));
  selectWeapon('ak47');

  $('menuClose').addEventListener('click', closeMenu);
  $('reloadBtn').addEventListener('click', startReload);


  // ---------------------------------------------------------------------------
  // Botón de disparo movible (celular)
  // ---------------------------------------------------------------------------
  const fireBtn = $('fireBtn');
  let firePos = null; // { x, y } como fracción de la pantalla
  try { firePos = JSON.parse(localStorage.getItem('parque.fireBtn') || 'null'); } catch { firePos = null; }

  function applyFirePos() {
    if (!firePos) return;
    const x = Math.max(50, Math.min(window.innerWidth - 50, firePos.x * window.innerWidth));
    const y = Math.max(50, Math.min(window.innerHeight - 50, firePos.y * window.innerHeight));
    fireBtn.style.left = x + 'px';
    fireBtn.style.top = y + 'px';
    fireBtn.style.right = 'auto';
    fireBtn.style.bottom = 'auto';
    fireBtn.style.transform = 'translate(-50%, -50%)';
  }

  function dragFireBtn(clientX, clientY) {
    firePos = {
      x: Math.max(50, Math.min(window.innerWidth - 50, clientX)) / window.innerWidth,
      y: Math.max(50, Math.min(window.innerHeight - 50, clientY)) / window.innerHeight,
    };
    applyFirePos();
  }

  function saveFirePos() {
    try { localStorage.setItem('parque.fireBtn', JSON.stringify(firePos)); } catch { /* sin guardado */ }
  }

  function enterEditMode() {
    closeMenu();
    editMode = true;
    firing = false;
    $('editBar').classList.remove('hidden');
  }

  $('moveBtn').addEventListener('click', () => { closeMenu(); openUiEdit(); });
  $('editDone').addEventListener('click', () => {
    editMode = false;
    $('editBar').classList.add('hidden');
    saveFirePos();
  });
  applyFirePos();

  // ---------------------------------------------------------------------------
  // Personalizar botones y HUD: transparencia, tamaño y ubicación de cada elemento
  // ---------------------------------------------------------------------------
  const UI_ITEMS = [
    ['fireBtn', 'Disparar'], ['aimBtn', 'Apuntar'], ['jumpBtn', 'Saltar'], ['crouchBtn', 'Agachar'],
    ['proneBtn', 'Tumbarse'], ['reloadBtn', 'Recargar'], ['nadeBtn', 'Granada'], ['smokeBtn', 'Humo'], ['runBtn', 'Correr'],
    ['hotbar', 'Barra de armas'], ['radar', 'Minimapa'], ['hp', 'Vida'], ['score', 'Marcador'],
    ['feed', 'Mensajes'], ['nadeHud', 'Contador de granadas'],
  ];
  const UI_KEY = 'manci.ui';
  let uiCfg = {}; // id -> { x, y (fracción de pantalla), s (tamaño), o (transparencia) }
  try { uiCfg = JSON.parse(localStorage.getItem(UI_KEY) || '{}') || {}; } catch { uiCfg = {}; }
  let uiSel = null;
  let uiDrag = null;
  const uiBar = $('uiBar');
  const uiName = $('uiName');
  const uiOp = $('uiOp');
  const uiSz = $('uiSz');
  const uiGrip = $('uiGrip');
  const UI_BAR_KEY = 'manci.uiBarPos';
  let uiBarPos = null; // esquina superior izquierda del panel, en píxeles
  try { uiBarPos = JSON.parse(localStorage.getItem(UI_BAR_KEY) || 'null'); } catch { uiBarPos = null; }
  let uiBarDrag = null;

  function uiBarPlace() {
    if (!uiBarPos) { uiBar.style.left = ''; uiBar.style.top = ''; uiBar.style.transform = ''; return; }
    const r = uiBar.getBoundingClientRect();
    const w = r.width || 300;
    const h = r.height || 150;
    const x = Math.min(Math.max(0, uiBarPos.x), Math.max(0, window.innerWidth - w));
    const y = Math.min(Math.max(0, uiBarPos.y), Math.max(0, window.innerHeight - h));
    uiBar.style.left = x + 'px';
    uiBar.style.top = y + 'px';
    uiBar.style.transform = 'none';
    uiBarPos = { x, y };
  }

  uiGrip.addEventListener('pointerdown', (e) => {
    const r = uiBar.getBoundingClientRect();
    uiBarDrag = { pid: e.pointerId, dx: e.clientX - r.left, dy: e.clientY - r.top };
    uiBar.classList.add('drag');
    try { uiGrip.setPointerCapture(e.pointerId); } catch { /* ignorar */ }
    e.preventDefault();
    e.stopPropagation();
  });
  uiGrip.addEventListener('pointermove', (e) => {
    if (!uiBarDrag || e.pointerId !== uiBarDrag.pid) return;
    uiBarPos = { x: e.clientX - uiBarDrag.dx, y: e.clientY - uiBarDrag.dy };
    uiBarPlace();
  });
  const uiBarEnd = () => {
    if (!uiBarDrag) return;
    uiBarDrag = null;
    uiBar.classList.remove('drag');
    try { localStorage.setItem(UI_BAR_KEY, JSON.stringify(uiBarPos)); } catch { /* sin guardado */ }
  };
  uiGrip.addEventListener('pointerup', uiBarEnd);
  uiGrip.addEventListener('pointercancel', uiBarEnd);
  window.addEventListener('resize', () => { if (uiBarPos && !uiBar.classList.contains('hidden')) uiBarPlace(); });

  function uiSave() {
    try { localStorage.setItem(UI_KEY, JSON.stringify(uiCfg)); } catch { /* sin guardado */ }
    send({ t: 'ui', cfg: uiCfg }); // copia en el servidor (por nombre), por si el navegador borra la suya
  }
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch { /* ignorar */ }

  function applyUi(id) {
    const el = $(id);
    if (!el) return;
    const c = uiCfg[id];
    if (!c) { el.style.translate = ''; el.style.scale = ''; el.style.opacity = ''; return; }
    el.style.translate = (c.x || 0) * window.innerWidth + 'px ' + (c.y || 0) * window.innerHeight + 'px';
    el.style.scale = String(c.s || 1);
    el.style.opacity = c.o == null ? '' : String(c.o);
  }

  function applyUiAll() { UI_ITEMS.forEach(([id]) => applyUi(id)); }

  // Mantiene el elemento dentro de la pantalla
  function uiClamp(id) {
    const el = $(id);
    const c = uiCfg[id];
    if (!el || !c) return;
    const r = el.getBoundingClientRect();
    if (!r.width) return;
    let dx = 0;
    let dy = 0;
    if (r.left < 0) dx = -r.left; else if (r.right > window.innerWidth) dx = window.innerWidth - r.right;
    if (r.top < 0) dy = -r.top; else if (r.bottom > window.innerHeight) dy = window.innerHeight - r.bottom;
    if (dx || dy) {
      c.x = (c.x || 0) + dx / window.innerWidth;
      c.y = (c.y || 0) + dy / window.innerHeight;
      applyUi(id);
    }
  }

  function uiPick(x, y) {
    let best = null;
    let area = Infinity;
    UI_ITEMS.forEach(([id]) => {
      const el = $(id);
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom && r.width * r.height < area) {
        area = r.width * r.height;
        best = id;
      }
    });
    return best;
  }

  function uiSelect(id) {
    uiSel = id;
    UI_ITEMS.forEach(([i]) => { const el = $(i); if (el) el.classList.toggle('ui-sel', i === id); });
    const on = !!id;
    uiOp.disabled = !on;
    uiSz.disabled = !on;
    $('uiResetOne').disabled = !on;
    if (!on) {
      uiName.textContent = 'Toca un elemento para elegirlo';
      $('uiOpV').textContent = '';
      $('uiSzV').textContent = '';
      return;
    }
    const c = uiCfg[id] || {};
    const el = $(id);
    const op = c.o != null ? c.o : (parseFloat(getComputedStyle(el).opacity) || 1);
    uiName.textContent = UI_ITEMS.find(([i]) => i === id)[1] + ' (arrástralo para moverlo)';
    uiOp.value = String(Math.round(op * 100));
    uiSz.value = String(Math.round((c.s || 1) * 100));
    $('uiOpV').textContent = uiOp.value + '%';
    $('uiSzV').textContent = uiSz.value + '%';
  }

  function uiEnsure(id) { return uiCfg[id] || (uiCfg[id] = {}); }

  uiOp.addEventListener('input', () => {
    if (!uiSel) return;
    uiEnsure(uiSel).o = Number(uiOp.value) / 100;
    $('uiOpV').textContent = uiOp.value + '%';
    applyUi(uiSel);
    uiSave();
  });
  uiSz.addEventListener('input', () => {
    if (!uiSel) return;
    uiEnsure(uiSel).s = Number(uiSz.value) / 100;
    $('uiSzV').textContent = uiSz.value + '%';
    applyUi(uiSel);
    uiClamp(uiSel);
    uiSave();
  });
  $('uiResetOne').addEventListener('click', () => {
    if (!uiSel) return;
    const id = uiSel;
    delete uiCfg[id];
    if (id === 'fireBtn') resetFireBtnBase();
    applyUi(id);
    uiSave();
    uiSelect(id);
  });
  $('uiResetAll').addEventListener('click', () => {
    uiCfg = {};
    resetFireBtnBase();
    applyUiAll();
    uiSave();
    uiSelect(uiSel);
  });

  function resetFireBtnBase() {
    firePos = null;
    try { localStorage.removeItem('parque.fireBtn'); } catch { /* ignorar */ }
    ['left', 'top', 'right', 'bottom', 'transform'].forEach((p) => { fireBtn.style[p] = ''; });
  }

  function openUiEdit() {
    if (!playing || uiEdit) return;
    menuOpen = true; // congela los controles del juego mientras se edita
    firing = false;
    aiming = false;
    touchAim = false;
    nadeAiming = false;
    smokeAiming = false;
    syncActionBtns();
    if (document.pointerLockElement) document.exitPointerLock();
    $('weaponMenu').classList.add('hidden');
    uiEdit = true;
    document.body.classList.add('ui-edit');
    UI_ITEMS.forEach(([id]) => { const el = $(id); if (el) el.classList.add('ui-el'); });
    uiBar.classList.remove('hidden');
    uiBarPlace();
    uiSelect(null);
  }

  function closeUiEdit() {
    if (!uiEdit) return;
    uiEdit = false;
    menuOpen = false;
    uiDrag = null;
    document.body.classList.remove('ui-edit');
    UI_ITEMS.forEach(([id]) => { const el = $(id); if (el) el.classList.remove('ui-el', 'ui-sel'); });
    uiBar.classList.add('hidden');
    uiSave();
  }

  $('optBtn').addEventListener('click', () => (uiEdit ? closeUiEdit : openUiEdit)());
  $('uiDone').addEventListener('click', closeUiEdit);

  // En modo edición los toques no llegan al juego: eligen y arrastran elementos
  document.addEventListener('pointerdown', (e) => {
    if (!uiEdit) return;
    if (e.target.closest && e.target.closest('#uiBar, #optBtn')) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    const id = uiPick(e.clientX, e.clientY);
    if (id) {
      uiSelect(id);
      uiDrag = { id, pid: e.pointerId, lx: e.clientX, ly: e.clientY };
    } else {
      uiDrag = null;
    }
  }, true);
  document.addEventListener('pointermove', (e) => {
    if (!uiDrag || e.pointerId !== uiDrag.pid) return;
    const c = uiEnsure(uiDrag.id);
    c.x = (c.x || 0) + (e.clientX - uiDrag.lx) / window.innerWidth;
    c.y = (c.y || 0) + (e.clientY - uiDrag.ly) / window.innerHeight;
    uiDrag.lx = e.clientX;
    uiDrag.ly = e.clientY;
    applyUi(uiDrag.id);
    uiClamp(uiDrag.id);
  });
  ['pointerup', 'pointercancel'].forEach((n) => document.addEventListener(n, (e) => {
    if (uiDrag && e.pointerId === uiDrag.pid) { uiDrag = null; uiSave(); }
  }));
  window.addEventListener('resize', applyUiAll);
  window.addEventListener('orientationchange', () => setTimeout(applyUiAll, 250));
  applyUiAll();

  // ---------------------------------------------------------------------------
  // HUD
  // ---------------------------------------------------------------------------
  function setHp(v) {
    const lost = v < hp;
    hp = v;
    $('hpFill').style.width = Math.max(0, v) + '%';
    $('hpText').textContent = 'Vida ' + Math.max(0, v);
    $('hp').classList.toggle('low', v <= 40);
    if (lost) {
      const f = $('flash');
      f.classList.add('on');
      requestAnimationFrame(() => requestAnimationFrame(() => f.classList.remove('on')));
    }
  }

  function showHitmark(kill) {
    const el = $('hitmark');
    el.classList.toggle('kill', !!kill);
    el.classList.remove('show');
    void el.offsetWidth; // reinicia la animación
    el.classList.add('show');
    if (kill) {
      blip(520, 0.18, 'sine', 0.14, 0);
      blip(780, 0.16, 'sine', 0.12, 0.09);
    } else {
      blip(1100, 0.06, 'sine', 0.12, 0);
    }
  }

  function renderScore(msg) {
    const box = $('score');
    box.textContent = '';

    const head = document.createElement('div');
    head.className = 'teamsrow';
    const a = document.createElement('span');
    a.textContent = 'Bajas / Muertes';
    const b = document.createElement('span');
    b.textContent = 'Meta ' + killGoal;
    head.append(a, b);
    box.appendChild(head);

    msg.players.slice(0, 6).forEach((p) => {
      const row = document.createElement('div');
      row.className = 'row' + (p.id === myId ? ' me' : '') + ((p.streak || 0) >= STREAK_FIRE ? ' burning' : '');
      row.style.borderLeftColor = colorOf(p.id);
      const n = document.createElement('span');
      n.textContent = ((p.streak || 0) >= STREAK_FIRE ? '🔥 ' : '') + p.name;
      const k = document.createElement('span');
      k.textContent = p.kills + ' / ' + p.deaths;
      row.append(n, k);
      box.appendChild(row);
    });
  }

  // Racha de bajas: enciende o apaga las llamas del nombre de cada jugador y el aviso propio
  function applyStreaks(list) {
    list.forEach((p) => {
      const n = p.streak || 0;
      streaks.set(p.id, n);
      const r = remotes.get(p.id);
      if (r) setBurning(r, n >= STREAK_FIRE);
    });
    const mine = list.find((p) => p.id === myId);
    const ms = mine ? mine.streak || 0 : 0;
    const badge = $('streakBadge');
    badge.textContent = '🔥 EN LLAMAS x' + ms;
    badge.classList.toggle('hidden', ms < STREAK_FIRE);
  }

  function feed(text) {
    const box = $('feed');
    const d = document.createElement('div');
    d.textContent = text;
    box.appendChild(d);
    while (box.children.length > 4) box.removeChild(box.firstChild);
    setTimeout(() => d.remove(), 4500);
  }

  let bannerTimer = null;
  function showBanner(text, color) {
    const el = $('banner');
    el.textContent = text;
    el.style.color = color || '';
    el.classList.remove('hidden');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => el.classList.add('hidden'), 6000);
  }

  // ---------------------------------------------------------------------------
  // Minimapa (radar): ves el mapa y a tus compañeros; a los enemigos solo
  // cuando disparan
  // ---------------------------------------------------------------------------
  const radar = $('radar');
  const rctx = radar.getContext('2d');
  const RADAR_SIZE = isTouch ? 120 : 150;
  const RADAR_RANGE = 55; // metros desde el centro hasta el borde
  const ENEMY_VISIBLE_MS = 1800;
  let lastRadar = 0;

  (function setupRadar() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    radar.width = RADAR_SIZE * dpr;
    radar.height = RADAR_SIZE * dpr;
    radar.style.width = RADAR_SIZE + 'px';
    radar.style.height = RADAR_SIZE + 'px';
    rctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  })();

  function drawRadar(now) {
    const S = RADAR_SIZE;
    const c = S / 2;
    const k = c / RADAR_RANGE;
    const px = camera.position.x;
    const pz = camera.position.z;
    const sy = Math.sin(yaw);
    const cy = Math.cos(yaw);
    // convierte una posición del mundo a la del radar (adelante = arriba)
    const toR = (x, z) => {
      const dx = x - px;
      const dz = z - pz;
      return [c + (dx * cy - dz * sy) * k, c - (dx * sy + dz * cy) * k];
    };

    rctx.clearRect(0, 0, S, S);
    rctx.save();
    rctx.beginPath();
    rctx.arc(c, c, c - 1, 0, Math.PI * 2);
    rctx.clip();
    rctx.fillStyle = 'rgba(10, 14, 20, 0.68)';
    rctx.fillRect(0, 0, S, S);

    // Objetos del mapa de prueba
    for (const o of mapObjs) {
      if (o.kind === 'tree') {
        const [x, y] = toR(o.x, o.z);
        rctx.fillStyle = 'rgba(130, 200, 120, 0.35)';
        rctx.beginPath();
        rctx.arc(x, y, o.r * k, 0, Math.PI * 2);
        rctx.fill();
        continue;
      }
      const hw = o.w / 2;
      const hd = o.d / 2;
      const ct = Math.cos(o.rot);
      const st = Math.sin(o.rot);
      rctx.fillStyle = 'rgba(242, 239, 228, 0.38)';
      rctx.beginPath();
      [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].forEach(([lx, lz], i) => {
        const [x, y] = toR(o.x + lx * ct + lz * st, o.z - lx * st + lz * ct);
        if (i === 0) rctx.moveTo(x, y); else rctx.lineTo(x, y);
      });
      rctx.closePath();
      rctx.fill();
    }

    // Cajas con armas (cuadritos de color)
    crates.forEach((cr) => {
      if (!cr.active) return;
      const [x, y] = toR(cr.x, cr.z);
      if (Math.hypot(x - c, y - c) > c - 5) return;
      rctx.fillStyle = CRATE_COLORS[cr.w] || '#fff';
      rctx.fillRect(x - 3, y - 3, 6, 6);
      rctx.strokeStyle = '#fff';
      rctx.lineWidth = 1;
      rctx.strokeRect(x - 3, y - 3, 6, 6);
    });

    // Curaciones (puntos rojos)
    heals.forEach((h) => {
      const [x, y] = toR(h.x, h.z);
      if (Math.hypot(x - c, y - c) > c - 5) return;
      rctx.fillStyle = '#ff2a2a';
      rctx.strokeStyle = '#fff';
      rctx.lineWidth = 1;
      rctx.beginPath();
      rctx.arc(x, y, 3.5, 0, Math.PI * 2);
      rctx.fill();
      rctx.stroke();
    });

    // Anillo de distancia y cono de visión
    rctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    rctx.lineWidth = 1;
    rctx.beginPath();
    rctx.arc(c, c, c / 2, 0, Math.PI * 2);
    rctx.stroke();
    rctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    rctx.beginPath();
    rctx.moveTo(c, c);
    rctx.arc(c, c, c, -Math.PI / 2 - 0.6, -Math.PI / 2 + 0.6);
    rctx.closePath();
    rctx.fill();

    // Compañeros siempre; enemigos solo un momento después de disparar
    remotes.forEach((r) => {
      const mine = false; // todos son enemigos: solo se ven un momento al disparar
      const age = now - r.lastShot;
      if (!mine && age > ENEMY_VISIBLE_MS) return;
      let [x, y] = toR(r.body.position.x, r.body.position.z);
      const dx = x - c;
      const dy = y - c;
      const d = Math.hypot(dx, dy);
      const max = c - 5;
      if (d > max) { x = c + (dx / d) * max; y = c + (dy / d) * max; }
      rctx.globalAlpha = mine ? 1 : Math.max(0.25, 1 - age / ENEMY_VISIBLE_MS);
      rctx.fillStyle = colorOf(r.id);
      rctx.strokeStyle = '#fff';
      rctx.lineWidth = 1.5;
      rctx.beginPath();
      rctx.arc(x, y, 4, 0, Math.PI * 2);
      rctx.fill();
      rctx.stroke();
      rctx.globalAlpha = 1;
    });

    // Tú, en el centro
    rctx.fillStyle = '#fff';
    rctx.beginPath();
    rctx.moveTo(c, c - 6);
    rctx.lineTo(c + 4.5, c + 5);
    rctx.lineTo(c - 4.5, c + 5);
    rctx.closePath();
    rctx.fill();
    rctx.restore();

    rctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    rctx.lineWidth = 1;
    rctx.beginPath();
    rctx.arc(c, c, c - 0.5, 0, Math.PI * 2);
    rctx.stroke();
  }

  // ---------------------------------------------------------------------------
  // Red
  // ---------------------------------------------------------------------------
  function send(msg) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
  }

  function status(text, isError) {
    const s = $('status');
    s.textContent = text;
    s.classList.toggle('error', !!isError);
  }

  // Al conectar: empieza a cargar el mapa mientras esperas en la sala
  function prepareMap(msg) {
    myId = msg.id;
    killGoal = msg.goal;
    mapPromise = (async () => {
      if (msg.hasPark) {
        try {
          await loadPark();
        } catch (err) {
          console.error(err);
          buildTestMap();
        }
      } else {
        buildTestMap();
      }
      mapReady = true;
    })();
  }

  function renderLobby(msg) {
    const list = $('lobbyList');
    list.textContent = '';
    let mine = null;
    msg.players.forEach((p) => {
      const li = document.createElement('li');
      li.className = (p.ready ? 'ready ' : '') + (p.id === myId ? 'me' : '');
      const n = document.createElement('span');
      n.textContent = p.name + (p.id === myId ? ' (tú)' : '');
      const c = document.createElement('span');
      c.className = 'chk';
      c.textContent = '✓';
      li.append(n, c);
      list.appendChild(li);
      if (p.id === myId) mine = p;
    });
    myReady = !!(mine && mine.ready);
    const total = msg.players.length;
    const ready = msg.players.filter((p) => p.ready).length;
    $('lobbyInfo').textContent = total < msg.min
      ? 'Esperando jugadores (mínimo ' + msg.min + ')...'
      : 'Listos: ' + ready + ' de ' + total + '. La partida empieza cuando todos estén listos.';
    const btn = $('readyBtn');
    btn.textContent = myReady ? 'LISTO ✓ (toca para cancelar)' : 'LISTO';
    btn.classList.toggle('on', myReady);
  }

  // Muestra la sala de espera (también al terminar una partida)
  function showLobby(msg) {
    if (playing) {
      playing = false;
      firing = false;
      document.body.classList.remove('playing');
      if (document.pointerLockElement) document.exitPointerLock();
      closeMenu();
      for (const id of [...remotes.keys()]) removeRemote(id);
      clearCrates();
      clearHeals();
      clearNades();
      clearDizzy();
    }
    inLobby = true;
    $('overlay').classList.add('hidden');
    $('lobby').classList.remove('hidden');
    renderLobby(msg);
  }

  async function startMatch(msg) {
    await mapPromise;
    if (msg.goal) killGoal = msg.goal;
    inLobby = false;
    for (const id of [...remotes.keys()]) removeRemote(id);
    streaks.clear();
    $('streakBadge').classList.add('hidden');
    spawn = msg.p;
    resetStance();
    camera.position.copyFromFloats(msg.p[0], msg.p[1], msg.p[2]);
    yaw = Math.random() * Math.PI * 2;
    pitch = 0;
    msg.players.forEach(addRemote);
    resetInventory();
    buildCrates(msg.crates || []);
    buildHeals(msg.heals || []);
    clearNades();
    nades = typeof msg.nades === 'number' ? msg.nades : NADE_MAX;
    smokes = typeof msg.smokes === 'number' ? msg.smokes : SMOKE_MAX;
    updateNadeHud();
    clearDizzy();
    $('lobby').classList.add('hidden');
    $('overlay').classList.add('hidden');
    $('banner').classList.add('hidden');
    document.body.classList.add('playing');
    playing = true;
    setHp(100);
    refillAll();
    buildViewmodel(weapon);
    feed('Todos contra todos. Meta: ' + killGoal + ' bajas');
  }

  function onMessage(ev) {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    switch (msg.t) {
      case 'welcome':
        prepareMap(msg);
        break;
      case 'lobby':
        showLobby(msg);
        break;
      case 'start':
        startMatch(msg);
        break;
      case 'join':
        if (mapReady && playing) addRemote(msg.player);
        feed(msg.player.name + ' entró a la partida');
        break;
      case 'leave': {
        const r = remotes.get(msg.id);
        removeRemote(msg.id);
        if (r) feed('Un jugador salió');
        break;
      }
      case 'state': {
        const r = remotes.get(msg.id);
        if (r) {
          r.target.copyFromFloats(msg.p[0], msg.p[1], msg.p[2]); // posición de los ojos
          r.yaw = msg.yaw;
          if (typeof msg.f === 'number') r.flags = msg.f;
          if (msg.w) setRemoteWeapon(r, msg.w);
        }
        break;
      }
      case 'shot': {
        const ends = Array.isArray(msg.tos) && msg.tos.length ? msg.tos : [msg.to];
        ends.forEach((to) => launchProjectile(msg.w, msg.from, to, true));
        const r = remotes.get(msg.id);
        if (r && !SILENCED[msg.w]) r.lastShot = performance.now(); // con silenciador no sales en el minimapa
        break;
      }
      case 'hp':
        setHp(msg.hp);
        break;
      case 'hitmark':
        showHitmark(msg.kill);
        break;
      case 'respawn':
        spawn = msg.p;
        resetStance();
        camera.position.copyFromFloats(msg.p[0], msg.p[1], msg.p[2]);
        refillAll();
        if (msg.lose) resetInventory();
        break;
      case 'kill':
        feed(msg.killer + ' eliminó a ' + msg.victim + (msg.w ? ' con ' + (msg.w === 'granada' ? 'Granada' : (WEAPONS[msg.w] ? WEAPONS[msg.w].name : msg.w)) : ''));
        if (msg.streak === STREAK_FIRE) {
          feed('🔥 ' + msg.killer + ' está en llamas');
          if (msg.killerId === myId) {
            showBanner('¡EN LLAMAS! Racha de ' + STREAK_FIRE, '#ffb347');
            blip(220, 0.5, 'sawtooth', 0.1, 0, 700);
          }
        } else if (msg.streak > STREAK_FIRE && msg.killerId === myId) {
          feed('Racha de ' + msg.streak + ' bajas');
        }
        if (msg.broke) feed(msg.killer + ' cortó la racha de ' + msg.victim);
        break;
      case 'score':
        renderScore(msg);
        applyStreaks(msg.players);
        break;
      case 'crate': {
        const c = crates.get(msg.id);
        if (c) setCrateActive(c, !!msg.on);
        break;
      }
      case 'give':
        addToInventory(msg.w, msg.n);
        break;
      case 'dizzy':
        giveDizzy(msg.ms || 8000);
        break;
      case 'healMove': {
        const h = heals.get(msg.id);
        if (h) moveHeal(h, msg.x, msg.z);
        break;
      }
      case 'healed':
        feed('+' + msg.amount + ' de vida');
        blip(880, 0.12, 'sine', 0.12, 0);
        blip(1320, 0.16, 'sine', 0.1, 0.1);
        break;
      case 'nades':
        nades = msg.n;
        updateNadeHud();
        break;
      case 'ui':
        if (msg.cfg && typeof msg.cfg === 'object' && !Object.keys(uiCfg).length && Object.keys(msg.cfg).length) {
          uiCfg = msg.cfg;
          try { localStorage.setItem(UI_KEY, JSON.stringify(uiCfg)); } catch { /* sin guardado */ }
          applyUiAll();
        }
        break;
      case 'smokes':
        smokes = msg.n;
        updateNadeHud();
        break;
      case 'nade':
        if (playing) launchGrenade(msg.path, msg.k);
        break;
      case 'win':
        showBanner(msg.id === myId ? '¡GANASTE!' : 'Ganó ' + msg.name, '#ffd96b');
        break;
    }
  }

  function connect(name, ch) {
    status('Conectando...');
    $('playBtn').disabled = true;
    ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
    ws.onopen = () => send({ t: 'join', name, ch });
    ws.onmessage = onMessage;
    ws.onerror = () => {
      $('overlay').classList.remove('hidden');
      status('No pude conectar. Revisa que el servidor siga abierto en la laptop.', true);
      $('playBtn').disabled = false;
    };
    ws.onclose = () => {
      if (playing || inLobby) {
        playing = false;
        inLobby = false;
        document.body.classList.remove('playing');
        closeMenu();
        $('lobby').classList.add('hidden');
        $('overlay').classList.remove('hidden');
        $('playBtn').disabled = true;
        status('Se perdió la conexión. Recarga la página para volver a entrar.', true);
      }
    };
  }

  // ---------------------------------------------------------------------------
  // Pantalla completa (Android: al primer toque en la página; iPad igual).
  // El iPhone en Safari no permite pantalla completa real: ahí se logra agregando
  // el juego a la pantalla de inicio (Compartir > Agregar a inicio), ya configurado en el HTML.
  // ---------------------------------------------------------------------------
  let everFullscreen = false;
  const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;
  function goFullscreen() {
    try {
      const el = document.documentElement;
      if (!fsElement()) {
        const req = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
        if (req) {
          const r = req.call(el, { navigationUI: 'hide' });
          if (r && typeof r.then === 'function') {
            r.then(() => { everFullscreen = true; }).catch(() => {});
          }
        }
      }
      if (isTouch && screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
    } catch { /* algunos navegadores no lo permiten */ }
  }
  if (isTouch) {
    // Los navegadores solo permiten pantalla completa dentro de un gesto del usuario
    ['pointerup', 'touchend', 'click'].forEach((n) =>
      document.addEventListener(n, () => {
        if (!fsElement() && (!everFullscreen || playing)) goFullscreen();
      }, { capture: true, passive: true }));
  }
  ['fullscreenchange', 'webkitfullscreenchange'].forEach((n) =>
    document.addEventListener(n, () => { setTimeout(() => { engine.resize(); applyFirePos(); }, 150); }));

  // ---------------------------------------------------------------------------
  // Controles
  // ---------------------------------------------------------------------------
  // Íconos de la barra de armas: cada .glb visto de lado, sacado en un lienzo aparte
  async function renderGunIcons() {
    let eng = null;
    try {
      const cv = document.createElement('canvas');
      cv.width = 320;
      cv.height = 160;
      eng = new BABYLON.Engine(cv, true, { preserveDrawingBuffer: true, alpha: true }, false);
      for (const id of Object.keys(GUN_MODELS)) {
        const def = GUN_MODELS[id];
        let sc = null;
        try {
          sc = new BABYLON.Scene(eng);
          sc.clearColor = new BABYLON.Color4(0, 0, 0, 0);
          new BABYLON.HemisphericLight('h', new BABYLON.Vector3(0.4, 1, 0.6), sc).intensity = 1.2;
          new BABYLON.DirectionalLight('d', new BABYLON.Vector3(-1, -1, -0.5), sc).intensity = 0.8;
          const container = await BABYLON.SceneLoader.LoadAssetContainerAsync('/weapons/', def.file, sc);
          container.materials.forEach(tuneGunMat);
          const inst = container.instantiateModelsToScene((n) => n, false, { doNotInstantiate: true });
          const hold = new BABYLON.TransformNode('m', sc);
          inst.rootNodes.forEach((n) => { n.parent = hold; });
          const spec = measureGun(hold, def);
          hold.dispose(false, false);
          const inst2 = container.instantiateModelsToScene((n) => n, false, { doNotInstantiate: true });
          const inner = new BABYLON.TransformNode('i', sc);
          inst2.rootNodes.forEach((n) => { n.parent = inner; });
          inner.rotation.y = spec.theta;
          inner.scaling.setAll(spec.su);
          inner.position.set(-spec.g.x, -spec.g.y, -spec.g.z);
          const cam = new BABYLON.FreeCamera('c', new BABYLON.Vector3(5, 0, 0), sc);
          cam.mode = BABYLON.Camera.ORTHOGRAPHIC_CAMERA;
          const halfW = Math.max(0.56, spec.h * 1.1);
          const halfH = halfW / 2;
          const zc = spec.zMuz - 0.5;
          const yc = spec.top - spec.h / 2;
          cam.position.set(5, yc, zc);
          cam.setTarget(new BABYLON.Vector3(0, yc, zc));
          cam.orthoLeft = -halfW; cam.orthoRight = halfW; cam.orthoTop = halfH; cam.orthoBottom = -halfH;
          cam.minZ = 0.1; cam.maxZ = 20;
          await sc.whenReadyAsync();
          sc.render();
          sc.render();
          const img = new Image();
          await new Promise((ok) => { img.onload = ok; img.onerror = ok; img.src = cv.toDataURL('image/png'); });
          gunIcons.set(id, img);
          (iconCvs[id] || []).filter((c) => c.isConnected).forEach((c) => drawIconImg(c, img));
        } catch (err) {
          console.warn('Sin ícono para', id, err);
        } finally {
          if (sc) sc.dispose();
        }
      }
    } catch (err) {
      console.warn('No se pudieron generar los íconos', err);
    } finally {
      if (eng) eng.dispose();
    }
  }

  $('playBtn').addEventListener('click', () => {
    const name = $('nameInput').value.trim();
    if (!name) {
      status('Escribe tu nombre para entrar.', true);
      return;
    }
    goFullscreen();
    connect(name, '');
  });
  $('readyBtn').addEventListener('click', () => send({ t: 'ready', ready: !myReady }));
  $('nameInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('playBtn').click();
  });

  // Teclado y mouse (computadora)
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    keys[e.code] = true;
    if (playing && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'Space', 'KeyC', 'ControlLeft'].includes(e.code)) e.preventDefault();
    if (!playing) return;
    if (e.code === 'KeyO' && !e.repeat && (uiEdit || !menuOpen)) { (uiEdit ? closeUiEdit : openUiEdit)(); return; }
    if (uiEdit) { if (e.code === 'Escape') closeUiEdit(); return; }
    const m = /^Digit([1-9])$/.exec(e.code);
    if (m && inventory[Number(m[1]) - 1]) selectWeapon(inventory[Number(m[1]) - 1]);
    if (e.code === 'KeyQ') (menuOpen ? closeMenu : openMenu)();
    if (e.code === 'KeyR') startReload();
    if (e.code === 'KeyZ') zoomLevel = 1 - zoomLevel; // francotirador: cambia entre los 2 zooms
    if (e.code === 'KeyX' && !e.repeat) { touchCrouch = false; wantProne = !wantProne; syncActionBtns(); } // cuerpo a tierra
    if (e.code === 'KeyG' && !e.repeat && !menuOpen && nades > 0) { smokeAiming = false; nadeAiming = true; updateNadeHud(); } // granada: mantener
    if (e.code === 'KeyH' && !e.repeat && !menuOpen && smokes > 0) { nadeAiming = false; smokeAiming = true; updateNadeHud(); } // humo: mantener
    // Agacharte o correr te levanta del suelo
    if ((e.code === 'KeyC' || e.code === 'ControlLeft') && !e.repeat) { wantProne = false; touchCrouch = !touchCrouch; syncActionBtns(); } // solo arrodillarse
    if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && (wantProne || touchCrouch)) { wantProne = false; touchCrouch = false; syncActionBtns(); }
  });
  window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
    if (e.code === 'KeyG' && nadeAiming) { nadeAiming = false; updateNadeHud(); throwGrenade(); }
    if (e.code === 'KeyH' && smokeAiming) { smokeAiming = false; updateNadeHud(); throwSmoke(); }
  });
  // Rueda del mouse con el francotirador: arriba = zoom alto, abajo = zoom bajo
  window.addEventListener('wheel', (e) => {
    if (!playing || menuOpen) return;
    if (SCOPED[weapon] && (aiming || touchAim)) {
      zoomLevel = e.deltaY < 0 ? 1 : 0; // apuntando con el francotirador: zoom
      return;
    }
    cycleWeapon(e.deltaY > 0 ? 1 : -1); // si no, la rueda cambia de arma como en Minecraft
  }, { passive: true });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; nadeAiming = false; smokeAiming = false; updateNadeHud(); });

  // Mouse de PC: intenta capturar el puntero para girar la cámara como en un FPS.
  // El canvas puede estar cubierto por elementos del HUD, así que también escuchamos
  // pointerdown en el documento. Si el navegador no permite Pointer Lock, usamos
  // movimiento relativo mientras se mantiene pulsado el botón izquierdo.
  let mouseFallbackActive = false;
  let mouseLastX = 0;
  let mouseLastY = 0;

  function requestMouseLock() {
    if (!playing || menuOpen || document.pointerLockElement === canvas) return;
    try {
      const result = canvas.requestPointerLock();
      if (result && typeof result.catch === 'function') result.catch(() => {});
    } catch (_) { /* se usará el movimiento alternativo del mouse */ }
  }
  // El clic directo sobre el área de juego es la forma más fiable de activar
  // Pointer Lock en Chrome/Edge, y debe ocurrir durante el gesto del usuario.
  canvas.addEventListener('click', () => {
    if (!playing || menuOpen) return;
    requestMouseLock();
  });
  canvas.addEventListener('contextmenu', (e) => {
    if (playing) e.preventDefault();
  });

  document.addEventListener('pointerdown', (e) => {
    if (!playing || menuOpen || e.pointerType !== 'mouse') return;
    const t = e.target;
    if (t.closest && t.closest('button, input, textarea, #weaponMenu, #reloadBtn, #editBar, #hotbar, #uiBar, #optBtn')) return;
    mouseLastX = e.clientX;
    mouseLastY = e.clientY;
    mouseFallbackActive = true;
    requestMouseLock();
    if (e.button === 0) firing = true;
    if (e.button === 2) aiming = true; // clic derecho: apuntar mientras se mantiene
  });

  // Clic izquierdo (o derecho) con el otro botón ya mantenido: pointerdown no se dispara, mousedown sí
  document.addEventListener('mousedown', (e) => {
    if (!playing || menuOpen) return;
    if (e.target.closest && e.target.closest('button, input, textarea, #weaponMenu, #reloadBtn, #editBar, #hotbar, #uiBar, #optBtn')) return;
    if (e.button === 2) aiming = true;
    else if (e.button === 0 && aiming) firing = true;
  });

  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === canvas) mouseFallbackActive = false;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) {
      firing = false;
      mouseFallbackActive = false;
    }
    if (e.button === 2) aiming = false;
  });
  window.addEventListener('blur', () => { mouseFallbackActive = false; firing = false; aiming = false; });

  document.addEventListener('mousemove', (e) => {
    if (!playing || menuOpen) return;
    if (document.pointerLockElement === canvas) {
      yaw += e.movementX * 0.0025 * sensMul;
      pitch = Math.max(-1.5, Math.min(1.5, pitch + e.movementY * 0.0025 * sensMul));
    } else if (mouseFallbackActive && (e.buttons & 1)) {
      const dx = e.clientX - mouseLastX;
      const dy = e.clientY - mouseLastY;
      yaw += dx * 0.0025 * sensMul;
      pitch = Math.max(-1.5, Math.min(1.5, pitch + dy * 0.0025 * sensMul));
      mouseLastX = e.clientX;
      mouseLastY = e.clientY;
    } else {
      mouseLastX = e.clientX;
      mouseLastY = e.clientY;
    }
  });

  // Táctil (celulares)
  const STICK_RADIUS = 50;
  let stickPointer = null;
  let stickOrigin = { x: 0, y: 0 };
  let lookPointer = null;
  let lookLast = { x: 0, y: 0 };
  let firePointer = null;
  let fireLast = { x: 0, y: 0 };
  let dragPointer = null;
  const stickEl = $('stick');
  const knobEl = $('knob');

  document.addEventListener('pointerdown', (e) => {
    if (!playing || e.pointerType === 'mouse') return;
    const t = e.target;
    if (t.closest && t.closest('#weaponMenu, .abtn, #editBar, #hotbar, #uiBar, #optBtn')) return; // botones normales
    // Cada dedo queda "capturado" por su elemento: así los varios toques a la vez
    // (joystick + mirar + disparar) no se pisan en Android ni en iOS
    try { if (t.setPointerCapture) t.setPointerCapture(e.pointerId); } catch { /* ignorar */ }
    if (editMode) {
      if (t === fireBtn) dragPointer = e.pointerId; // solo mover el botón, sin disparar
      e.preventDefault();
      return;
    }
    if (t === fireBtn) {
      firePointer = e.pointerId;
      fireLast = { x: e.clientX, y: e.clientY };
      firing = true;
      fireBtn.classList.add('down');
    } else if (e.clientX < window.innerWidth * 0.45 && stickPointer === null) {
      stickPointer = e.pointerId;
      stickOrigin = { x: e.clientX, y: e.clientY };
      stickEl.style.display = 'block';
      stickEl.style.left = e.clientX + 'px';
      stickEl.style.top = e.clientY + 'px';
      knobEl.style.transform = 'translate(0,0)';
    } else if (lookPointer === null) {
      lookPointer = e.pointerId;
      lookLast = { x: e.clientX, y: e.clientY };
    }
    e.preventDefault();
  }, { passive: false });

  document.addEventListener('pointermove', (e) => {
    if (e.pointerId === dragPointer) {
      dragFireBtn(e.clientX, e.clientY);
    } else if (e.pointerId === stickPointer) {
      let dx = e.clientX - stickOrigin.x;
      let dy = e.clientY - stickOrigin.y;
      const len = Math.hypot(dx, dy);
      if (len > STICK_RADIUS) { dx = (dx / len) * STICK_RADIUS; dy = (dy / len) * STICK_RADIUS; }
      knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
      const dead = 0.12;
      joy.x = Math.abs(dx / STICK_RADIUS) < dead ? 0 : dx / STICK_RADIUS;
      joy.y = Math.abs(dy / STICK_RADIUS) < dead ? 0 : dy / STICK_RADIUS;
    } else if (e.pointerId === lookPointer) {
      yaw += (e.clientX - lookLast.x) * 0.006 * sensMul;
      pitch = Math.max(-1.5, Math.min(1.5, pitch + (e.clientY - lookLast.y) * 0.006 * sensMul));
      lookLast = { x: e.clientX, y: e.clientY };
    } else if (e.pointerId === firePointer) {
      // Con el mismo pulgar del botón de disparo también apuntas
      yaw += (e.clientX - fireLast.x) * 0.006 * sensMul;
      pitch = Math.max(-1.5, Math.min(1.5, pitch + (e.clientY - fireLast.y) * 0.006 * sensMul));
      fireLast = { x: e.clientX, y: e.clientY };
    }
  });

  function releasePointer(e) {
    if (e.pointerId === dragPointer) {
      dragPointer = null;
      saveFirePos();
    } else if (e.pointerId === stickPointer) {
      stickPointer = null;
      joy.x = 0; joy.y = 0;
      stickEl.style.display = 'none';
      if (touchRun) { touchRun = false; syncActionBtns(); } // correr se apaga al soltar el joystick
    } else if (e.pointerId === lookPointer) {
      lookPointer = null;
    } else if (e.pointerId === firePointer) {
      firePointer = null;
      firing = false;
      fireBtn.classList.remove('down');
    }
  }
  document.addEventListener('pointerup', releasePointer);
  document.addEventListener('pointercancel', releasePointer);
  document.addEventListener('lostpointercapture', releasePointer);

  // Seguro: si el sistema pierde un dedo (iOS/Android a veces no avisan), al quedar sin
  // ningún toque en pantalla se suelta todo para que no quede el joystick o el disparo pegado
  function releaseAllTouches() {
    stickPointer = null; lookPointer = null; firePointer = null; dragPointer = null;
    joy.x = 0; joy.y = 0;
    stickEl.style.display = 'none';
    firing = false;
    fireBtn.classList.remove('down');
    document.querySelectorAll('.abtn.down').forEach((b) => b.classList.remove('down'));
  }
  ['touchend', 'touchcancel'].forEach((n) =>
    document.addEventListener(n, (e) => { if (e.touches.length === 0 && isTouch) releaseAllTouches(); }, { passive: true }));
  window.addEventListener('blur', () => { if (isTouch) releaseAllTouches(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && isTouch) releaseAllTouches(); });

  // Evita que el navegador interprete los toques múltiples como zoom o desplazamiento
  ['touchstart', 'touchmove'].forEach((n) =>
    document.addEventListener(n, (e) => {
      if (!playing || menuOpen || editMode) return;
      if (e.target.closest && e.target.closest('input, textarea, button, #hotbar, #editBar, #weaponMenu, #lobby, #overlay, #uiBar, #optBtn')) return;
      e.preventDefault();
    }, { passive: false }));

  // Evita zoom y menús del navegador en iPhone
  ['gesturestart', 'gesturechange', 'contextmenu'].forEach((n) =>
    document.addEventListener(n, (e) => e.preventDefault()));

  // ---------------------------------------------------------------------------
  // Bucle del juego
  // ---------------------------------------------------------------------------
  scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(engine.getDeltaTime(), 50) / 1000;
    const now = performance.now();
    scene.gravity.y = -14 * dt; // caída de ~14 m/s sin importar los FPS

    animateRemotes(dt, now);

    updateFx(dt, now);
    updateProjectiles(dt);
    updatePuffs(dt);
    updateExplosions(dt);
    updateTimers(now);
    animateCrates(dt, now);
    animateHeals(dt, now);
    updateNadeFlights(dt);
    updateSmokes(dt);

    if (!playing) {
      camera.cameraDirection.copyFromFloats(0, 0, 0);
      return;
    }

    if (reloading && now >= reloadEnd) {
      ammo[weapon] = WEAPONS[weapon].mag;
      reloading = false;
      updateChip();
    }

    // Mareo (porro) y temblor (explosiones) se suman a la cámara
    const dizzyK = dizzyAmount(now);
    camera.rotation.x = pitch + (Math.random() - 0.5) * shake + Math.cos(now / 800) * 0.04 * dizzyK
      + Math.min(0.12, Math.max(0, stanceVel) * 0.03); // al tirarte al suelo la vista cabecea hacia abajo
    camera.rotation.y = yaw + (Math.random() - 0.5) * shake + Math.sin(now / 950) * 0.05 * dizzyK;
    camera.rotation.z = Math.sin(now / 650) * 0.14 * dizzyK;
    shake *= Math.exp(-dt * 7);
    applyDizzyFx(dizzyK, now);

    // --- Movimiento horizontal ---
    let f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) - joy.y;
    let s = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + joy.x;
    const len = Math.hypot(f, s);
    if (len > 1) { f /= len; s /= len; }
    moveAmt = Math.min(1, len);

    // --- Agacharse / cuerpo a tierra: al levantarte, solo subes hasta donde haya espacio sobre la cabeza ---
    let goalLvl = wantProne ? 2 : (touchCrouch ? 1 : 0);
    while (goalLvl < 2 && goalLvl < stanceAmt - 0.02 && headBlocked(stanceE(goalLvl))) goalLvl++;
    const prevStance = stanceAmt;
    // Tirarse al suelo es un poco más pausado que agacharse; levantarse es rápido
    stanceAmt += (goalLvl - stanceAmt) * Math.min(1, dt * (goalLvl > stanceAmt ? 8 : 11));
    if (Math.abs(goalLvl - stanceAmt) < 0.01) stanceAmt = goalLvl;
    stanceVel = (stanceAmt - prevStance) / Math.max(dt, 0.001);
    applyCrouchShape();
    const crouched = stanceAmt > 0.5;
    const proned = stanceAmt > 1.5;

    // --- Correr: solo hacia adelante y de pie ---
    const wantRun = !!(keys.ShiftLeft || keys.ShiftRight) || touchRun;
    sprinting = wantRun && !crouched && f > 0.1 && !(aiming || touchAim);
    const baseSpeed = sprinting ? 7 : 4.5;
    const speed = stanceAmt <= 1
      ? baseSpeed + (CROUCH_SPEED - baseSpeed) * stanceAmt
      : CROUCH_SPEED + (PRONE_SPEED - CROUCH_SPEED) * (stanceAmt - 1);
    s += Math.sin(now / 600) * 0.5 * dizzyK; // mareado: te vas de lado
    const dx = Math.sin(yaw) * f + Math.cos(yaw) * s;
    const dz = Math.cos(yaw) * f - Math.sin(yaw) * s;

    // --- Salto y gravedad ---
    // vy es la velocidad vertical real. -14 = solo la gravedad de la escena (como antes).
    const eyeH = camera.ellipsoid.y * 2;
    const grounded = vy <= 0 && groundDistance(eyeH) <= eyeH + 0.15;
    if (grounded) {
      airTime = 0;
      vy = -FALL_SPEED;
      if (keys.Space || now < jumpUntil) {
        jumpUntil = 0;
        if (wantProne || stanceAmt > 1.3) {
          // Tendido: Saltar te levanta del suelo (no salta)
          wantProne = false;
          syncActionBtns();
        } else {
          vy = JUMP_SPEED;
          if (touchCrouch) { touchCrouch = false; syncActionBtns(); }
          blip(300, 0.09, 'sine', 0.07, 0, 520);
        }
      }
    } else {
      airTime += dt;
      vy = Math.max(-FALL_SPEED, vy - JUMP_GRAVITY * dt);
    }
    camera.cameraDirection.copyFromFloats(dx * speed * dt, (vy + FALL_SPEED) * dt, dz * speed * dt);

    // Postura que ven los demás: 1 agachado, 2 corriendo, 4 en el aire
    myFlags = (crouched && !proned ? 1 : 0) | (sprinting && moveAmt > 0.1 ? 2 : 0) | (airTime > 0.12 ? 4 : 0) | (proned ? 8 : 0);
    // Apuntar: zoom suave. Al correr se abre un poco el campo de visión.
    const aimNow = (aiming || touchAim) && !reloading && !menuOpen && !WEAPONS[weapon].melee;
    const aimGoal = aimNow ? 1 : 0;
    adsAmt += (aimGoal - adsAmt) * Math.min(1, dt * 12);
    if (Math.abs(aimGoal - adsAmt) < 0.01) adsAmt = aimGoal;
    const hipFov = sprinting ? 1.18 : 1.1;
    const adsFov = SCOPED[weapon] ? SCOPED[weapon][zoomLevel].fov : ADS_FOV[weapon];
    camera.fov += ((hipFov + (adsFov - hipFov) * adsAmt + Math.sin(now / 450) * 0.1 * dizzyK) - camera.fov) * Math.min(1, dt * 10);
    sensMul = Math.max(0.12, camera.fov / 1.1); // con zoom se gira más despacio

    // Visor del francotirador y mira del centro
    const scoped = !!SCOPED[weapon] && adsAmt > 0.85;
    if (scoped !== scopeShown) {
      scopeShown = scoped;
      $('scope').classList.toggle('hidden', !scoped);
    }
    if (scoped) $('scopeZoom').textContent = SCOPED[weapon][zoomLevel].label;
    const hasHolo = !WEAPONS[weapon].melee && !WEAPONS[weapon].special;
    const hideCross = scoped || (hasHolo && adsAmt > 0.5);
    if (hideCross !== crossHidden) {
      crossHidden = hideCross;
      $('crosshair').style.visibility = hideCross ? 'hidden' : '';
    }

    // El cuadro de sombra sigue al jugador a saltos de 4 m para que las sombras no titilen
    sun.position.set(
      Math.round(camera.position.x / 4) * 4 - SUN_DIR.x * 120,
      -SUN_DIR.y * 120,
      Math.round(camera.position.z / 4) * 4 - SUN_DIR.z * 120
    );

    // Si se cae por un hueco del mapa, vuelve a aparecer arriba
    if (camera.position.y < -60) camera.position.copyFromFloats(spawn[0], 15, spawn[2]);

    if (firing) shoot();
    checkCratePickup(now);
    checkHealPickup(now);
    updateViewmodel(dt, now);
    updateNadePreview(now);

    if (now - lastRadar > 66) {
      lastRadar = now;
      drawRadar(now);
    }
  });

  // Envía tu posición ~15 veces por segundo
  setInterval(() => {
    if (!playing) return;
    const p = camera.position;
    send({ t: 'state', p: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)], yaw: +yaw.toFixed(3), w: weapon, f: myFlags });
  }, 66);

  // Para ubicar las cajas: abre el juego con ?coords=1 y se muestra tu posición (x, z) en pantalla
  if (params.get('coords')) {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;left:50%;top:46px;transform:translateX(-50%);z-index:30;background:rgba(0,0,0,.65);color:#fff;font:13px monospace;padding:4px 10px;border-radius:6px;pointer-events:none';
    document.body.appendChild(el);
    setInterval(() => {
      if (playing) el.textContent = 'x: ' + camera.position.x.toFixed(1) + '   z: ' + camera.position.z.toFixed(1);
    }, 200);
  }

  engine.runRenderLoop(() => scene.render());
  window.addEventListener('resize', () => { engine.resize(); applyFirePos(); });
  window.addEventListener('orientationchange', () => setTimeout(() => { engine.resize(); applyFirePos(); }, 250));
})();
