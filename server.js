// Servidor del juego: sirve la página y sincroniza a los jugadores por WebSocket.
// Todo sale de esta laptop, así que funciona aunque la red no tenga internet.
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const zlib = require('zlib');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;

// Botones/HUD de cada jugador (por nombre), para que se conserven aunque el navegador borre sus datos
const UI_FILE = path.join(__dirname, 'ui-settings.json');
let uiStore = {};
try { uiStore = JSON.parse(fs.readFileSync(UI_FILE, 'utf8')) || {}; } catch { uiStore = {}; }
let uiSaveTimer = null;
function saveUiStore() {
  clearTimeout(uiSaveTimer);
  uiSaveTimer = setTimeout(() => { try { fs.writeFileSync(UI_FILE, JSON.stringify(uiStore)); } catch { /* sin guardado */ } }, 500);
}

// Librerías 3D servidas desde esta misma laptop (sin depender de internet)
const LIBS = {
  '/lib/babylon.js': path.join(__dirname, 'node_modules', 'babylonjs', 'babylon.js'),
  '/lib/babylonjs.loaders.min.js': path.join(__dirname, 'node_modules', 'babylonjs-loaders', 'babylonjs.loaders.min.js'),
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg']);
const gzipCache = new Map();

function sendFile(req, res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('No encontrado');
    }
    const ext = path.extname(file).toLowerCase();
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream' };
    const wantsGzip = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
    if (COMPRESSIBLE.has(ext) && wantsGzip) {
      const key = file + ':' + st.mtimeMs;
      let buf = gzipCache.get(key);
      if (!buf) {
        buf = zlib.gzipSync(fs.readFileSync(file), { level: 6 });
        gzipCache.set(key, buf);
      }
      headers['Content-Encoding'] = 'gzip';
      headers['Content-Length'] = buf.length;
      res.writeHead(200, headers);
      return res.end(buf);
    }
    headers['Content-Length'] = st.size;
    res.writeHead(200, headers);
    fs.createReadStream(file).pipe(res);
  });
}

const MANIFEST = JSON.stringify({
  name: 'Manci Battle Royale', short_name: 'Manci BR', start_url: '/', display: 'fullscreen',
  orientation: 'landscape', background_color: '#1f3a2b', theme_color: '#1f3a2b',
});

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/manifest.json') {
    res.writeHead(200, { 'Content-Type': 'application/manifest+json' });
    return res.end(MANIFEST);
  }
  if (LIBS[urlPath]) return sendFile(req, res, LIBS[urlPath]);
  const rel = urlPath === '/' ? '/index.html' : urlPath;
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end();
  }
  sendFile(req, res, file);
});

// ---------------------------------------------------------------------------
// Reglas del juego (aquí puedes ajustar el equilibrio)
// ---------------------------------------------------------------------------
// damage = daño por bala (la escopeta lanza varios perdigones)
// rate   = milisegundos mínimos entre disparos
// range  = alcance máximo en metros
const WEAPONS = {
  glock:         { damage: 12,  pellets: 1, rate: 75,   range: 60 },
  usp:           { damage: 24,  pellets: 1, rate: 240,  range: 90 },
  leone:         { damage: 14,  pellets: 8, rate: 850,  range: 35 },
  yg1265:        { damage: 10,  pellets: 6, rate: 300,  range: 32 },
  mp5:           { damage: 13,  pellets: 1, rate: 80,   range: 65 },
  mac10:         { damage: 10,  pellets: 1, rate: 55,   range: 45 },
  ump45:         { damage: 17,  pellets: 1, rate: 100,  range: 70 },
  ak47:          { damage: 24,  pellets: 1, rate: 105,  range: 115 },
  m4a1:          { damage: 20,  pellets: 1, rate: 88,   range: 120 },
  awp:           { damage: 100, pellets: 1, rate: 1500, range: 220 },
  sg552:         { damage: 21,  pellets: 1, rate: 98,   range: 125 },
  aug:           { damage: 20,  pellets: 1, rate: 92,   range: 125 },
  cuchillo:      { damage: 55,  pellets: 1, rate: 480,  range: 2.6, melee: true },
  // Armas especiales (solo salen de las cajas)
  minigun:       { damage: 4,   pellets: 3, rate: 60,   range: 80 },
  // bazuca: el misil tarda en llegar (speed m/s) y explota; el daño baja con la distancia al centro (radius en m)
  bazuca:        { damage: 110, pellets: 1, rate: 1600, range: 160, explosive: true, radius: 6, speed: 45 },
  // porro: no hace daño, marea al que le pegue (dizzy = milisegundos de mareo)
  porro:         { damage: 0,   pellets: 1, rate: 220,  range: 70,  dizzy: 8000, speed: 60 },
};

// Puntos de aparición DENTRO de tu parque (x, z en metros, con la rotonda en 0,0).
// Están en zonas libres: sin árboles, canchas, juegos ni maceteros, y lejos de las casas.
// El parque va de x = -60 a 80 y de z = -47 a 55.
const SPAWN_POINTS = [
  [23.0, -4.2],
  [-55.0, 47.8],
  [-55.0, -38.2],
  [73.0, 47.8],
  [1.0, 47.8],
  [-27.0, 3.8],
  [-7.0, -42.2],
  [43.0, -42.2],
  [37.0, 31.8],
  [-27.0, 35.8],
  [-55.0, -8.2],
  [1.0, 17.8],
  [-51.0, 19.8],
  [-29.0, -24.2],
  [-3.0, -14.2],
  [19.0, -30.2],
  [45.0, 7.8],
  [43.0, -18.2],
  [23.0, 47.8],
  [51.0, 47.8],
  [-35.0, -42.2],
  [17.0, 29.8],
  [-17.0, 19.8],
  [-9.0, 3.8],
  [7.0, -0.2],
  [-43.0, 33.8],
  [-37.0, -10.2],
  [-35.0, 17.8]
];
const MIN_SPAWN_DIST = 25; // distancia mínima (m) que se intenta dejar entre jugadores al aparecer
const SPAWN_HEIGHT = 3; // aparecen un poco en el aire y caen al suelo

const MAX_HP = 100;
const KILL_GOAL = Number(process.env.KILL_GOAL) || 10; // bajas para ganar la partida
const MIN_PLAYERS = Number(process.env.MIN_PLAYERS) || 2; // jugadores mínimos para empezar
const RETURN_TO_LOBBY_MS = 7000; // tiempo mostrando al ganador antes de volver a la sala

// ---------------------------------------------------------------------------
// Cajas con armas
// ---------------------------------------------------------------------------
// [x, z, arma]  con arma = 'minigun' | 'bazuca' | 'porro'
// OJO: estas posiciones son de relleno (zonas libres del parque). Para ponerlas junto a tus bancas
// y dentro de la cancha: abre el juego con  http://IP:3000/?coords=1 , párate al lado de la banca
// y copia los números x y z que salen arriba en la pantalla.
const CRATE_POINTS = [
  [1.0, 17.8, 'minigun'],
  [-27.0, 3.8, 'bazuca'],
  [23.0, -4.2, 'porro'],
  [-51.0, 19.8, 'bazuca'],
  [37.0, 31.8, 'minigun'],
  [-29.0, -24.2, 'porro'],
  [45.0, 7.8, 'bazuca'],
  [19.0, -30.2, 'minigun'],
];
const CRATE_RESPAWN_MS = 30000; // la caja vuelve a aparecer después de este tiempo
const PICKUP_DIST = 4.5; // distancia máxima (m) para que el servidor te deje recoger una caja
const SPECIAL_AMMO = { minigun: 180, bazuca: 1, porro: 3 }; // munición que da cada caja
const SPECIALS_LOST_ON_DEATH = true; // true: al morir pierdes las armas de las cajas
const BASE_WEAPONS = ['glock', 'usp', 'leone', 'yg1265', 'mp5', 'mac10', 'ump45', 'ak47', 'm4a1', 'awp', 'sg552', 'aug', 'cuchillo'];
const STREAK_FIRE = Number(process.env.STREAK_FIRE) || 3; // bajas seguidas sin morir para "encenderse en llamas"

// Regeneración de vida: tras REGEN_DELAY_MS sin recibir daño, se recupera REGEN_AMOUNT cada REGEN_TICK_MS
const REGEN_DELAY_MS = 5000;
const REGEN_TICK_MS = 500;
const REGEN_AMOUNT = 5;

// Curaciones repartidas por el mapa: siempre hay HEAL_COUNT a la vez; al recogerse reaparece en otro punto
const HEAL_COUNT = 3;
const HEAL_AMOUNT = 40; // vida que da cada una
const HEAL_DIST = 3.2; // distancia máxima (m) para recogerla

// Granada (planta): el cliente simula la trayectoria y manda los puntos; el servidor decide la explosión
const GRENADE = { damage: 100, radius: 5.5 };
const NADES_MAX = 2; // granadas que se pueden tener a la vez
const NADE_REGEN_MS = 10000; // cada cuánto se recupera una
const NADE_DT = 0.12; // segundos entre un punto y otro de la trayectoria (igual que en game.js)
const NADE_MIN_POINTS = 15;
const NADE_MAX_POINTS = 30;
const NADE_COOLDOWN_MS = 700;
const SMOKES_MAX = 2; // granadas de humo morado a la vez
const SMOKE_REGEN_MS = 15000;

// ---------------------------------------------------------------------------
// Estado del juego
// ---------------------------------------------------------------------------
const wss = new WebSocketServer({ server });
const players = new Map(); // id -> jugador
let nextId = 1;
let phase = 'lobby'; // 'lobby' (sala de espera) | 'playing' | 'ending' (mostrando al ganador)
let endTimer = null;

const crates = CRATE_POINTS.map(([x, z, w], i) => ({ id: i + 1, x, z, w, on: true, timer: null }));
const crateList = () => crates.map((c) => ({ id: c.id, x: c.x, z: c.z, w: c.w, on: c.on }));
function resetCrates() {
  for (const c of crates) {
    clearTimeout(c.timer);
    c.on = true;
  }
}

// ---- Curaciones ----
const heals = [];
const healList = () => heals.map((h) => ({ id: h.id, x: h.x, z: h.z }));

// Punto al azar (de las zonas libres del parque) lejos de las otras curaciones y de donde estaba esta
function randomHealPoint(self) {
  const others = heals.filter((h) => h !== self);
  let pool = SPAWN_POINTS.filter(([x, z]) =>
    others.every((o) => Math.hypot(o.x - x, o.z - z) > 8) && (!self || Math.hypot(self.x - x, self.z - z) > 1));
  if (!pool.length) pool = SPAWN_POINTS;
  return pool[Math.floor(Math.random() * pool.length)];
}

function resetHeals() {
  heals.length = 0;
  for (let i = 0; i < HEAL_COUNT; i++) {
    const h = { id: i + 1, x: 0, z: 0 };
    const [x, z] = randomHealPoint(null);
    h.x = x;
    h.z = z;
    heals.push(h);
  }
}

// Elige uno de los puntos del parque, el más lejos posible de los demás jugadores en partida.
function pickSpawn(excludeId) {
  const others = [...players.values()].filter((p) => p.inGame && p.id !== excludeId);
  const pool = SPAWN_POINTS.slice().sort(() => Math.random() - 0.5); // orden al azar
  let best = pool[0];
  let bestD = -1;
  for (const [x, z] of pool) {
    let d = Infinity;
    for (const o of others) d = Math.min(d, Math.hypot(o.p[0] - x, o.p[2] - z));
    if (d >= MIN_SPAWN_DIST) return [x, SPAWN_HEIGHT, z];
    if (d > bestD) { bestD = d; best = [x, z]; }
  }
  return [best[0], SPAWN_HEIGHT, best[1]]; // si ninguno cumple, el más lejano de todos
}

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

// Solo llega a los jugadores que están en partida
function broadcast(msg, exceptId = null) {
  const data = JSON.stringify(msg);
  for (const p of players.values()) {
    if (p.inGame && p.id !== exceptId && p.ws.readyState === 1) p.ws.send(data);
  }
}

function scoreboard() {
  return [...players.values()]
    .filter((p) => p.inGame)
    .map((p) => ({ id: p.id, name: p.name, kills: p.kills, deaths: p.deaths, streak: p.streak || 0 }))
    .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
}

function broadcastScore() {
  broadcast({ t: 'score', players: scoreboard() });
}

// Personaje elegido: solo letras minúsculas, números, guion y guion bajo
function cleanChar(raw) {
  return String(raw || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24);
}

function cleanName(raw) {
  const n = String(raw || '').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 12);
  return n || 'Jugador' + nextId;
}

// ---- Sala de espera ----
function broadcastLobby() {
  const list = [...players.values()]
    .filter((p) => !p.inGame)
    .map((p) => ({ id: p.id, name: p.name, ch: p.ch, ready: p.ready }));
  const msg = { t: 'lobby', players: list, min: MIN_PLAYERS };
  for (const p of players.values()) if (!p.inGame) send(p.ws, msg);
}

function checkStart() {
  if (phase !== 'lobby' || players.size < MIN_PLAYERS) return;
  for (const p of players.values()) if (!p.ready) return;
  startMatch();
}

function publicPlayer(p) {
  return { id: p.id, name: p.name, ch: p.ch, p: p.p, yaw: p.yaw, f: p.f };
}

function startMatch() {
  phase = 'playing';
  resetCrates();
  resetHeals();
  for (const p of players.values()) {
    p.inGame = false;
    p.owned = new Set(BASE_WEAPONS);
    p.kills = 0;
    p.deaths = 0;
    p.streak = 0;
    p.nades = NADES_MAX;
    p.nadeNext = 0;
    p.smokes = SMOKES_MAX;
    p.smokeNext = 0;
    p.hp = MAX_HP;
  }
  // Se colocan de uno en uno para que cada uno quede lejos de los ya colocados
  for (const p of players.values()) {
    p.p = pickSpawn(p.id);
    p.inGame = true;
  }
  for (const p of players.values()) {
    send(p.ws, {
      t: 'start',
      p: p.p,
      goal: KILL_GOAL,
      crates: crateList(),
      heals: healList(),
      nades: NADES_MAX,
      smokes: SMOKES_MAX,
      players: [...players.values()].filter((o) => o.id !== p.id).map(publicPlayer),
    });
  }
  broadcastScore();
  console.log(`>>> Empieza la partida con ${players.size} jugadores`);
}

// Un jugador que entra con la partida en marcha pasa directo a jugar
function enterMatch(p) {
  p.p = pickSpawn(p.id);
  p.inGame = true;
  p.ready = true;
  p.owned = new Set(BASE_WEAPONS);
  p.kills = 0;
  p.deaths = 0;
  p.streak = 0;
  p.nades = NADES_MAX;
  p.nadeNext = 0;
  p.smokes = SMOKES_MAX;
  p.smokeNext = 0;
  p.hp = MAX_HP;
  send(p.ws, {
    t: 'start',
    p: p.p,
    goal: KILL_GOAL,
    crates: crateList(),
    heals: healList(),
    nades: NADES_MAX,
    smokes: SMOKES_MAX,
    players: [...players.values()].filter((o) => o.inGame && o.id !== p.id).map(publicPlayer),
  });
  broadcast({ t: 'join', player: publicPlayer(p) }, p.id);
  broadcastScore();
}

function endMatch(winner) {
  phase = 'ending';
  broadcast({ t: 'win', id: winner.id, name: winner.name });
  console.log(`>>> Ganó ${winner.name}`);
  clearTimeout(endTimer);
  endTimer = setTimeout(() => {
    phase = 'lobby';
    for (const p of players.values()) {
      p.inGame = false;
      p.ready = false;
      p.kills = 0;
      p.deaths = 0;
      p.streak = 0;
      p.hp = MAX_HP;
    }
    broadcastLobby();
  }, RETURN_TO_LOBBY_MS);
}

function damagePlayer(killer, victim, dmg, wid) {
  if (phase !== 'playing') return;
  victim.hp -= dmg;
  victim.lastHit = Date.now();
  const died = victim.hp <= 0;
  send(killer.ws, { t: 'hitmark', kill: died }); // confirma el impacto a quien disparó
  if (!died) {
    send(victim.ws, { t: 'hp', hp: victim.hp });
    return;
  }
  const broke = (victim.streak || 0) >= STREAK_FIRE; // le cortaron una racha en llamas
  killer.kills++;
  killer.streak = (killer.streak || 0) + 1;
  victim.deaths++;
  victim.streak = 0;
  victim.hp = MAX_HP;
  victim.p = pickSpawn(victim.id);
  send(victim.ws, { t: 'hp', hp: MAX_HP });
  victim.nades = NADES_MAX;
  send(victim.ws, { t: 'nades', n: NADES_MAX });
  victim.smokes = SMOKES_MAX;
  send(victim.ws, { t: 'smokes', n: SMOKES_MAX });
  if (SPECIALS_LOST_ON_DEATH) victim.owned = new Set(BASE_WEAPONS);
  send(victim.ws, { t: 'respawn', p: victim.p, lose: SPECIALS_LOST_ON_DEATH });
  broadcast({ t: 'kill', killer: killer.name, killerId: killer.id, victim: victim.name, streak: killer.streak, broke, w: wid });
  if (killer.kills >= KILL_GOAL) endMatch(killer);
  else broadcastScore();
}

// Explosión de la bazuca: daña a todos los que estén cerca (menos a quien disparó)
function explode(shooterId, at, w, wid) {
  if (phase !== 'playing') return;
  const killer = players.get(shooterId);
  if (!killer) return;
  for (const v of [...players.values()]) {
    if (!v.inGame || v.id === killer.id) continue;
    const d = Math.hypot(v.p[0] - at[0], v.p[1] - 0.8 - at[1], v.p[2] - at[2]); // centro del cuerpo
    if (d > w.radius) continue;
    damagePlayer(killer, v, Math.round(w.damage * (1 - 0.6 * (d / w.radius))), wid);
  }
}

// Efecto del porro: no quita vida, solo marea (cuando la bala llega)
function dizzyPlayer(shooter, victim, w) {
  if (phase !== 'playing' || players.get(victim.id) !== victim || !victim.inGame) return;
  send(victim.ws, { t: 'dizzy', ms: w.dizzy });
  send(shooter.ws, { t: 'hitmark', kill: false });
}

const finite = (v) => Number.isFinite(v);
const isVec3 = (v) => Array.isArray(v) && v.length === 3 && v.every(finite);

wss.on('connection', (ws) => {
  let me = null;

  ws.on('message', (raw) => {
    if (raw.length > 24000) return;
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (msg.t === 'join' && !me) {
      me = {
        id: nextId++,
        ws,
        name: cleanName(msg.name),
        ch: cleanChar(msg.ch),
        ready: false,
        inGame: false,
        p: [0, SPAWN_HEIGHT, 0],
        yaw: 0,
        f: 0, // postura: bit 1 = agachado, bit 2 = corriendo, bit 4 = en el aire, bit 8 = cuerpo a tierra
        hp: MAX_HP,
        kills: 0,
        deaths: 0,
        streak: 0, // bajas seguidas sin morir
        nades: NADES_MAX, // granadas disponibles
        nadeNext: 0, // cuándo se recupera la siguiente
        smokes: SMOKES_MAX, // granadas de humo disponibles
        smokeNext: 0,
        lastNade: 0,
        lastShot: 0,
        owned: new Set(BASE_WEAPONS), // armas que puede usar (las de siempre + las de cajas)
      };
      players.set(me.id, me);
      send(ws, {
        t: 'welcome',
        id: me.id,
        goal: KILL_GOAL,
        hasPark: fs.existsSync(path.join(ROOT, 'park.glb')),
      });
      const savedUi = uiStore[me.name.toLowerCase()];
      if (savedUi) send(ws, { t: 'ui', cfg: savedUi });
      if (phase === 'playing') enterMatch(me);
      else broadcastLobby();
      console.log(`+ ${me.name} (#${me.id}) entró. Jugadores: ${players.size}`);
      return;
    }
    if (raw.length > 2048 && msg.t !== 'ui') return;
    if (!me) return;

    if (msg.t === 'ui') {
      if (msg.cfg && typeof msg.cfg === 'object' && JSON.stringify(msg.cfg).length < 20000) {
        uiStore[me.name.toLowerCase()] = msg.cfg;
        saveUiStore();
      }
      return;
    }

    if (msg.t === 'ready') {
      if (phase !== 'lobby' || me.inGame) return;
      me.ready = !!msg.ready;
      broadcastLobby();
      checkStart();
      return;
    }

    if (!me.inGame) return;

    if (msg.t === 'pickup' && phase === 'playing') {
      const c = crates.find((k) => k.id === msg.id);
      if (!c || !c.on) return;
      if (Math.hypot(me.p[0] - c.x, me.p[2] - c.z) > PICKUP_DIST) return; // tiene que estar cerca
      c.on = false;
      me.owned.add(c.w);
      send(ws, { t: 'give', w: c.w, n: SPECIAL_AMMO[c.w] });
      broadcast({ t: 'crate', id: c.id, on: false });
      clearTimeout(c.timer);
      c.timer = setTimeout(() => {
        c.on = true;
        broadcast({ t: 'crate', id: c.id, on: true });
      }, CRATE_RESPAWN_MS);
      console.log(`  ${me.name} recogió ${c.w}`);
      return;
    }

    // Curación: se aplica si está cerca y le falta vida; la curación reaparece en otro punto al azar
    if (msg.t === 'heal' && phase === 'playing') {
      const h = heals.find((k) => k.id === msg.id);
      if (!h || me.hp >= MAX_HP) return;
      if (Math.hypot(me.p[0] - h.x, me.p[2] - h.z) > HEAL_DIST) return;
      me.hp = Math.min(MAX_HP, me.hp + HEAL_AMOUNT);
      send(ws, { t: 'hp', hp: me.hp });
      send(ws, { t: 'healed', amount: HEAL_AMOUNT });
      const [x, z] = randomHealPoint(h);
      h.x = x;
      h.z = z;
      broadcast({ t: 'healMove', id: h.id, x, z });
      return;
    }

    // Granada: llega la trayectoria completa; explota al final del recorrido
    if (msg.t === 'nade' && phase === 'playing') {
      const path = msg.path;
      if (!Array.isArray(path) || path.length < NADE_MIN_POINTS || path.length > NADE_MAX_POINTS || !path.every(isVec3)) return;
      const now = Date.now();
      const smoke = msg.k === 'smoke';
      if ((smoke ? (me.smokes || 0) : (me.nades || 0)) <= 0 || now - me.lastNade < NADE_COOLDOWN_MS) return;
      const first = path[0];
      const at = path[path.length - 1];
      if (Math.hypot(first[0] - me.p[0], first[1] - me.p[1], first[2] - me.p[2]) > 6) return;
      if (Math.hypot(at[0] - me.p[0], at[2] - me.p[2]) > 70) return;
      me.lastNade = now;
      if (smoke) {
        if (me.smokes >= SMOKES_MAX) me.smokeNext = now + SMOKE_REGEN_MS;
        me.smokes--;
        send(ws, { t: 'smokes', n: me.smokes });
        broadcast({ t: 'nade', id: me.id, path, k: 'smoke' }, me.id); // el humo no hace daño: solo tapa la vista
        return;
      }
      if (me.nades >= NADES_MAX) me.nadeNext = now + NADE_REGEN_MS;
      me.nades--;
      send(ws, { t: 'nades', n: me.nades });
      broadcast({ t: 'nade', id: me.id, path }, me.id);
      const shooterId = me.id;
      setTimeout(() => explode(shooterId, at, GRENADE, 'granada'), (path.length - 1) * NADE_DT * 1000);
      return;
    }

    if (msg.t === 'state' && isVec3(msg.p) && finite(msg.yaw)) {
      me.p = msg.p;
      me.yaw = msg.yaw;
      const wid = WEAPONS[msg.w] ? msg.w : undefined; // arma que lleva en la mano
      me.f = Number.isInteger(msg.f) && msg.f >= 0 && msg.f <= 15 ? msg.f : 0; // bit 8 = cuerpo a tierra
      broadcast({ t: 'state', id: me.id, p: me.p, yaw: me.yaw, w: wid, f: me.f }, me.id);
      return;
    }

    if (msg.t === 'shot' && phase === 'playing' && isVec3(msg.from) && isVec3(msg.to)) {
      const w = WEAPONS[msg.w];
      if (!w || !me.owned.has(msg.w)) return; // solo puede disparar armas que tiene
      const now = Date.now();
      if (now - me.lastShot < w.rate * 0.7) return; // dispara más rápido de lo permitido
      me.lastShot = now;
      // Todos los perdigones/balas del disparo, para que los demás vean cada una llegar
      const tos = Array.isArray(msg.tos) ? msg.tos.filter(isVec3).slice(0, 12) : [];
      if (!tos.length) tos.push(msg.to);
      broadcast({ t: 'shot', id: me.id, w: msg.w, from: msg.from, to: msg.to, tos }, me.id);

      // Bazuca: el misil vuela hasta el punto de impacto y explota al llegar
      if (w.explosive) {
        const flight = Math.hypot(msg.to[0] - msg.from[0], msg.to[1] - msg.from[1], msg.to[2] - msg.from[2]);
        const fromMe = Math.hypot(msg.from[0] - me.p[0], msg.from[1] - me.p[1], msg.from[2] - me.p[2]);
        if (flight > w.range + 15 || fromMe > 8) return;
        const shooterId = me.id;
        const at = msg.to;
        const wid = msg.w;
        setTimeout(() => explode(shooterId, at, w, wid), (flight / w.speed) * 1000);
        return;
      }

      // Suma el daño de todos los perdigones por víctima y lo aplica una sola vez
      const hits = Array.isArray(msg.hits) ? msg.hits.slice(0, w.pellets) : [];
      const damage = new Map();
      for (const hitId of hits) {
        const victim = players.get(hitId);
        if (!victim || !victim.inGame || victim.id === me.id) continue;
        const dist = Math.hypot(victim.p[0] - me.p[0], victim.p[1] - me.p[1], victim.p[2] - me.p[2]);
        if (dist > (w.melee ? w.range + 2.5 : w.range + 15)) continue;
        damage.set(victim, (damage.get(victim) || 0) + w.damage);
      }
      for (const [victim, dmg] of damage) {
        if (!w.dizzy) {
          damagePlayer(me, victim, dmg, msg.w);
          continue;
        }
        const dd = Math.hypot(victim.p[0] - me.p[0], victim.p[2] - me.p[2]);
        const shooter = me;
        setTimeout(() => dizzyPlayer(shooter, victim, w), (dd / w.speed) * 1000);
      }
    }
  });

  ws.on('close', () => {
    if (!me) return;
    players.delete(me.id);
    if (me.inGame) {
      broadcast({ t: 'leave', id: me.id });
      broadcastScore();
    } else {
      broadcastLobby();
      checkStart(); // quizá los que quedan ya estaban todos listos
    }
    if (players.size === 0) {
      phase = 'lobby';
      clearTimeout(endTimer);
    }
    console.log(`- ${me.name} (#${me.id}) salió. Jugadores: ${players.size}`);
  });
});

// ---------------------------------------------------------------------------
// Arranque: muestra las direcciones para abrir desde los celulares
// ---------------------------------------------------------------------------
// Recupera una granada cada NADE_REGEN_MS hasta el máximo
setInterval(() => {
  if (phase !== 'playing') return;
  const now = Date.now();
  for (const p of players.values()) {
    if (!p.inGame) continue;
    if (p.nades < NADES_MAX && now >= p.nadeNext) {
      p.nades++;
      p.nadeNext = now + NADE_REGEN_MS;
      send(p.ws, { t: 'nades', n: p.nades });
    }
    if (p.smokes < SMOKES_MAX && now >= p.smokeNext) {
      p.smokes++;
      p.smokeNext = now + SMOKE_REGEN_MS;
      send(p.ws, { t: 'smokes', n: p.smokes });
    }
  }
}, 1000);

setInterval(() => {
  if (phase !== 'playing') return;
  const now = Date.now();
  for (const p of players.values()) {
    if (!p.inGame || p.hp >= MAX_HP || p.hp <= 0) continue;
    if (now - (p.lastHit || 0) < REGEN_DELAY_MS) continue;
    p.hp = Math.min(MAX_HP, p.hp + REGEN_AMOUNT);
    send(p.ws, { t: 'hp', hp: p.hp });
  }
}, REGEN_TICK_MS);

function lanAddresses() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const i of list || []) {
      if (i.family === 'IPv4' && !i.internal) out.push({ name, address: i.address });
    }
  }
  return out;
}

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n=== Manci Battle Royale ===');
  console.log(fs.existsSync(path.join(ROOT, 'park.glb'))
    ? 'Mapa: public/park.glb'
    : 'Mapa: de prueba (pon tu modelo en public/park.glb para usar tu parque)');
  console.log(`Mínimo de jugadores: ${MIN_PLAYERS}. Bajas para ganar: ${KILL_GOAL}.`);
  const addrs = lanAddresses();
  if (!addrs.length) {
    console.log('\nNo detecté ninguna red. Conecta la laptop al wifi o activa el punto de acceso.');
  }
  let qr = null;
  try { qr = require('qrcode-terminal'); } catch { /* opcional */ }
  for (const a of addrs) {
    const url = `http://${a.address}:${PORT}`;
    console.log(`\nAbre en el celular (${a.name}):  ${url}`);
    if (qr) qr.generate(url, { small: true });
  }
  console.log(`\nEn esta laptop: http://localhost:${PORT}\n`);
});
