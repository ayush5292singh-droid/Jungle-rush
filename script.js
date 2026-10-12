
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

// =====================================================
// JUNGLE RUSH 3D — COMPLETE GAME ENGINE
// =====================================================

const $ = (id) => document.getElementById(id);

const gameEl = $('game');
const loadingEl = $('loading');

let scene, camera, renderer, player;
let running = false;
let paused = false;
let gameOver = false;

let score = 0;
let coins = 0;
let best = Number(localStorage.getItem('jungleRushBest') || 0);
let distance = 0;
let speed = 23;
let elapsed = 0;
let lane = 0;
let jumpVelocity = 0;
let jumpHeight = 0;
let slideTime = 0;
let spawnTimer = 1.1;
let coinTimer = 1.5;
let lastTime = 0;
let toastTimer = null;

const laneX = [-2.6, 0, 2.6];
const obstacles = [];
const treasures = [];
const scenery = [];
const floorTiles = [];

const sharedGeometries = [];
const sharedMaterials = [];

function mat(color, roughness = 0.85, options = {}) {
  const m = new THREE.MeshStandardMaterial({
    color,
    roughness,
    ...options
  });

  sharedMaterials.push(m);
  return m;
}

const mats = {
  ground: mat(0x254b30),
  path: mat(0x826f4d),
  pathEdge: mat(0x67563b),
  leaf: mat(0x225f35),
  leafLight: mat(0x418440),
  trunk: mat(0x69452a),
  stone: mat(0x777b69),
  stoneDark: mat(0x444d42),
  gold: mat(0xffcb32, 0.25, {
    metalness: 0.6,
    emissive: 0x754600,
    emissiveIntensity: 0.45
  }),
  player: mat(0x18a6a1, 0.45),
  skin: mat(0xf1b98b),
  dark: mat(0x172b29),
  wood: mat(0x9b6332),
  glow: mat(0xa7ff67, 0.4, {
    emissive: 0x4a9e19,
    emissiveIntensity: 0.7
  })
};

function geometry(geo) {
  sharedGeometries.push(geo);
  return geo;
}

function addMesh(geo, material, parent, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  parent.add(mesh);
  return mesh;
}

function box(parent, material, x, y, z, w, h, d) {
  return addMesh(
    geometry(new THREE.BoxGeometry(w, h, d)),
    material,
    parent,
    x, y, z
  );
}

// =====================================================
// INITIALIZE THE 3D GAME
// =====================================================

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x82bca5);
  scene.fog = new THREE.Fog(0x82bca5, 32, 145);

  camera = new THREE.PerspectiveCamera(
    innerWidth < 600 ? 70 : 65,
    innerWidth / innerHeight,
    0.1,
    220
  );

  camera.position.set(0, 5.5, 10.5);
  camera.lookAt(0, 1.5, -8);

  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance'
  });

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;

  renderer.domElement.style.position = 'absolute';
  renderer.domElement.style.inset = '0';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.zIndex = '0';

  gameEl.insertBefore(renderer.domElement, gameEl.firstChild);

  scene.add(new THREE.HemisphereLight(0xcdf8e3, 0x374526, 2.2));

  const sun = new THREE.DirectionalLight(0xffedc2, 2.4);
  sun.position.set(-8, 18, 5);
  scene.add(sun);

  createWorld();
  createPlayer();
  bindControls();

  $('best').textContent = best;

  window.addEventListener('resize', resize);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  if (loadingEl) {
    loadingEl.classList.add('done');
    setTimeout(() => loadingEl.remove(), 500);
  }

  lastTime = performance.now();
  requestAnimationFrame(loop);
}

// =====================================================
// WORLD, TRACK AND JUNGLE
// =====================================================

function createWorld() {
  box(scene, mats.ground, 0, -0.25, -55, 65, 0.5, 180);

  // Fifteen reusable track sections.
  // Each section owns its track and lane markings.
  for (let i = 0; i < 15; i++) {
    const tile = new THREE.Group();
    tile.position.z = -i * 12;
    scene.add(tile);

    box(tile, mats.path, 0, -0.015, 0, 8.3, 0.15, 12);

    box(tile, mats.pathEdge, -4.02, 0.02, 0, 0.14, 0.025, 12);
    box(tile, mats.pathEdge, 4.02, 0.02, 0, 0.14, 0.025, 12);

    for (const x of [-1.3, 1.3]) {
      box(tile, mats.pathEdge, x, 0.07, 0, 0.035, 0.025, 12);
    }

    floorTiles.push(tile);
  }

  // Trees on both sides of the running path.
  for (let i = 0; i < 38; i++) {
    const group = new THREE.Group();
    scene.add(group);

    const side = i % 2 === 0 ? -1 : 1;
    const x = side * (5.5 + Math.random() * 13);
    const z = -Math.random() * 145;

    makeTree(group, 0, 0, 0.8 + Math.random() * 1.1);
    group.position.set(x, 0, z);

    scenery.push(group);
  }

  // Distant jungle canopy.
  const distantGreen = mat(0x316746);

  for (let i = 0; i < 15; i++) {
    const x = (i - 7) * 12;

    const hill = addMesh(
      geometry(new THREE.IcosahedronGeometry(5 + Math.random() * 5, 1)),
      distantGreen,
      scene,
      x,
      2,
      -110 - Math.random() * 30
    );

    hill.scale.y = 0.9;
  }
}

function makeTree(parent, x, z, scale = 1) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.scale.setScalar(scale);
  parent.add(group);

  addMesh(
    geometry(new THREE.CylinderGeometry(0.18, 0.32, 2.5, 7)),
    mats.trunk,
    group,
    0, 1.25, 0
  );

  for (let i = 0; i < 3; i++) {
    const crown = addMesh(
      geometry(new THREE.IcosahedronGeometry(1.1 - i * 0.12, 1)),
      i === 1 ? mats.leafLight : mats.leaf,
      group,
      (i % 2) * 0.45 - 0.22,
      2.4 + i * 0.6,
      0
    );

    crown.scale.set(1, 1.15, 0.9);
  }

  return group;
}

// =====================================================
// PLAYER CHARACTER
// =====================================================

function createPlayer() {
  player = new THREE.Group();
  scene.add(player);

  box(player, mats.player, 0, 1.05, 0, 0.65, 0.78, 0.4);

  const head = addMesh(
    geometry(new THREE.SphereGeometry(0.29, 12, 10)),
    mats.skin,
    player,
    0, 1.75, 0
  );

  box(player, mats.dark, 0, 1.48, 0, 0.68, 0.16, 0.42);

  const hair = addMesh(
    geometry(new THREE.SphereGeometry(0.3, 10, 8)),
    mats.dark,
    player,
    0, 1.91, -0.035
  );

  hair.scale.set(1, 0.45, 1);

  const leftArm = box(
    player, mats.player, -0.43, 1.13, 0, 0.19, 0.61, 0.22
  );

  const rightArm = box(
    player, mats.player, 0.43, 1.13, 0, 0.19, 0.61, 0.22
  );

  const leftLeg = box(
    player, mats.dark, -0.19, 0.43, 0, 0.24, 0.65, 0.27
  );

  const rightLeg = box(
    player, mats.dark, 0.19, 0.43, 0, 0.24, 0.65, 0.27
  );

  player.userData.parts = {
    head,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg
  };
}

// =====================================================
// OBSTACLES AND COINS
// =====================================================

function createObstacle(type, x, z) {
  const group = new THREE.Group();

  group.position.set(x, 0, z);
  group.userData.type = type;
  group.userData.passed = false;

  if (type === 'rock') {
    const rock = addMesh(
      geometry(new THREE.DodecahedronGeometry(0.75, 0)),
      mats.stone,
      group,
      0, 0.65, 0
    );

    rock.scale.set(1.15, 0.95, 0.8);

    box(group, mats.stoneDark, 0, 0.17, 0, 1.2, 0.12, 0.8);
  } else if (type === 'log') {
    const log = addMesh(
      geometry(new THREE.CylinderGeometry(0.25, 0.3, 2.2, 8)),
      mats.wood,
      group,
      0, 1.05, 0
    );

    log.rotation.z = Math.PI / 2;
    log.rotation.x = 0.1;
  } else {
    // Low hanging branch: slide underneath.
    box(group, mats.wood, 0, 2.0, 0, 2.0, 0.35, 0.45);
    box(group, mats.leaf, 0, 2.28, 0, 2.1, 0.15, 0.5);
  }

  scene.add(group);
  obstacles.push(group);
}

function createCoin(x, z, y = 1.25) {
  const coin = addMesh(
    geometry(new THREE.TorusGeometry(0.31, 0.11, 7, 14)),
    mats.gold,
    scene,
    x, y, z
  );

  coin.userData.baseY = y;
  coin.userData.collected = false;

  treasures.push(coin);
}

// =====================================================
// RESET AND GAME SCREENS
// =====================================================

function removeDynamicObjects(array) {
  while (array.length) {
    const obj = array.pop();
    scene.remove(obj);
  }
}

function resetWorld() {
  removeDynamicObjects(obstacles);
  removeDynamicObjects(treasures);

  distance = 0;
  score = 0;
  coins = 0;
  speed = 23;
  elapsed = 0;
  lane = 0;
  jumpVelocity = 0;
  jumpHeight = 0;
  slideTime = 0;
  spawnTimer = 1.1;
  coinTimer = 1.5;

  floorTiles.forEach((tile, i) => {
    tile.position.z = -i * 12;
  });

  scenery.forEach(group => {
    group.position.z = -Math.random() * 140;
  });

  player.position.set(0, 0, 0);
  player.rotation.set(0, 0, 0);
  player.scale.set(1, 1, 1);

  $('score').textContent = '0';
  $('coins').textContent = '0';
  $('speed').textContent = 'SPEED 1x';
  $('best').textContent = best;
  $('toast').textContent = '';
}

function startGame() {
  resetWorld();

  running = true;
  paused = false;
  gameOver = false;

  $('startScreen').classList.add('hidden');
  $('pauseScreen').classList.add('hidden');
  $('overScreen').classList.add('hidden');
  $('pauseBtn').textContent = 'Ⅱ';

  lastTime = performance.now();
}

function endGame() {
  if (gameOver) return;

  running = false;
  paused = false;
  gameOver = true;

  score = Math.floor(distance * 2) + coins * 10;

  if (score > best) {
    best = score;
    localStorage.setItem('jungleRushBest', String(best));
  }

  $('best').textContent = best;
  $('finalScore').textContent = score;
  $('finalCoins').textContent = coins;
  $('overScreen').classList.remove('hidden');
}

function pauseGame() {
  if (!running || gameOver) return;

  paused = !paused;

  $('pauseScreen').classList.toggle('hidden', !paused);
  $('pauseBtn').textContent = paused ? '▶' : 'Ⅱ';

  lastTime = performance.now();
}

// =====================================================
// CONTROLS: KEYBOARD, SWIPES AND TOUCH BUTTONS
// =====================================================

function move(direction) {
  if (!running || paused || gameOver) return;

  if (direction === 'left') {
    lane = Math.max(-1, lane - 1);
  }

  if (direction === 'right') {
    lane = Math.min(1, lane + 1);
  }

  if (direction === 'jump' && jumpHeight <= 0.03 && slideTime <= 0) {
    jumpVelocity = 10.5;
  }

  if (direction === 'slide' && jumpHeight <= 0.05) {
    slideTime = 0.65;
  }
}

function onKeyDown(event) {
  const key = event.key.toLowerCase();

  const controls = [
    'arrowleft', 'arrowright', 'arrowup', 'arrowdown',
    ' ', 'a', 'd', 'w', 's', 'escape'
  ];

  if (controls.includes(key)) {
    event.preventDefault();
  }

  if (event.repeat) return;

  if (key === 'arrowleft' || key === 'a') move('left');
  if (key === 'arrowright' || key === 'd') move('right');
  if (key === 'arrowup' || key === 'w' || key === ' ') move('jump');
  if (key === 'arrowdown' || key === 's') move('slide');
  if (key === 'escape') pauseGame();
}

function onKeyUp(event) {
  const key = event.key.toLowerCase();

  if (key === 'arrowdown' || key === 's') {
    slideTime = Math.min(slideTime, 0.15);
  }
}

function bindControls() {
  $('startBtn').addEventListener('click', startGame);
  $('againBtn').addEventListener('click', startGame);
  $('resumeBtn').addEventListener('click', pauseGame);
  $('restartPauseBtn').addEventListener('click', startGame);
  $('pauseBtn').addEventListener('click', pauseGame);

  document.querySelectorAll('[data-move]').forEach(button => {
    button.addEventListener('pointerdown', event => {
      event.preventDefault();
      move(button.dataset.move);
    });
  });

  let touchX = 0;
  let touchY = 0;

  gameEl.addEventListener('touchstart', event => {
    if (event.target.closest('button')) return;

    const touch = event.changedTouches[0];
    touchX = touch.clientX;
    touchY = touch.clientY;
  }, { passive: true });

  gameEl.addEventListener('touchend', event => {
    if (!running || paused || gameOver) return;
    if (event.target.closest('button')) return;

    const touch = event.changedTouches[0];
    const dx = touch.clientX - touchX;
    const dy = touch.clientY - touchY;

    if (Math.max(Math.abs(dx), Math.abs(dy)) < 25) return;

    if (Math.abs(dx) > Math.abs(dy)) {
      move(dx < 0 ? 'left' : 'right');
    } else {
      move(dy < 0 ? 'jump' : 'slide');
    }
  }, { passive: true });
}

// =====================================================
// PROCEDURAL OBSTACLE AND COIN GENERATION
// =====================================================

function spawnPattern() {
  const z = -105 - Math.random() * 12;
  const chosenLane = Math.floor(Math.random() * 3);
  const x = laneX[chosenLane];
  const roll = Math.random();

  let type = 'rock';

  if (roll > 0.57 && roll < 0.84) {
    type = 'log';
  }

  if (roll >= 0.84) {
    type = 'branch';
  }

  createObstacle(type, x, z);

  // Leave at least one lane open.
  if (Math.random() > 0.56) {
    let secondLane = Math.floor(Math.random() * 3);

    while (secondLane === chosenLane) {
      secondLane = Math.floor(Math.random() * 3);
    }

    createObstacle(
      Math.random() > 0.5 ? 'rock' : 'log',
      laneX[secondLane],
      z - 3
    );
  }
}

function spawnCoinLine() {
  const selectedLane = Math.floor(Math.random() * 3);
  const x = laneX[selectedLane];
  const startZ = -100;

  for (let i = 0; i < 7; i++) {
    createCoin(x, startZ - i * 3, 1.25);
  }
}

function showToast(message) {
  $('toast').textContent = message;

  if (toastTimer !== null) {
    clearTimeout(toastTimer);
  }

  toastTimer = setTimeout(() => {
    $('toast').textContent = '';
    toastTimer = null;
  }, 700);
}

// =====================================================
// PLAYER MOVEMENT AND RUNNING ANIMATION
// =====================================================

function updatePlayer(dt) {
  const targetX = laneX[lane];

  player.position.x = THREE.MathUtils.damp(
    player.position.x,
    targetX,
    12,
    dt
  );

  // Jump physics.
  if (jumpVelocity !== 0 || jumpHeight > 0) {
    jumpHeight += jumpVelocity * dt;
    jumpVelocity -= 27 * dt;

    if (jumpHeight <= 0) {
      jumpHeight = 0;
      jumpVelocity = 0;
    }
  }

  slideTime = Math.max(0, slideTime - dt);

  player.position.y = jumpHeight;
  player.scale.y = slideTime > 0 ? 0.55 : 1;

  const parts = player.userData.parts;

  if (running && !paused) {
    const phase = elapsed * 13;

    parts.leftLeg.rotation.x = Math.sin(phase) * 0.75;
    parts.rightLeg.rotation.x = -Math.sin(phase) * 0.75;
    parts.leftArm.rotation.x = -Math.sin(phase) * 0.6;
    parts.rightArm.rotation.x = Math.sin(phase) * 0.6;
  } else {
    parts.leftLeg.rotation.x = 0;
    parts.rightLeg.rotation.x = 0;
    parts.leftArm.rotation.x = 0;
    parts.rightArm.rotation.x = 0;
  }

  player.rotation.z = THREE.MathUtils.damp(
    player.rotation.z,
    (targetX - player.position.x) * 0.045,
    8,
    dt
  );

  camera.position.x = THREE.MathUtils.damp(
    camera.position.x,
    player.position.x * 0.25,
    2.5,
    dt
  );

  camera.lookAt(player.position.x * 0.2, 1.3, -8);
}

// =====================================================
// WORLD MOVEMENT AND COLLISIONS
// =====================================================

function updateWorld(dt) {
  const travel = speed * dt;

  // Recycle the track without gaps.
  for (const tile of floorTiles) {
    tile.position.z += travel;

    if (tile.position.z > 12) {
      tile.position.z -= floorTiles.length * 12;
    }
  }

  // Recycle scenery.
  for (const group of scenery) {
    group.position.z += travel;

    if (group.position.z > 18) {
      group.position.z = -135 - Math.random() * 25;
    }
  }

  // Obstacles.
  for (let i = obstacles.length - 1; i >= 0; i--) {
    const obj = obstacles[i];

    obj.position.z += travel;

    if (obj.position.z > 14) {
      scene.remove(obj);
      obstacles.splice(i, 1);
      continue;
    }

    const dz = Math.abs(obj.position.z);
    const dx = Math.abs(obj.position.x - player.position.x);

    if (dz < 0.85 && dx < 0.86 && !obj.userData.passed) {
      const type = obj.userData.type;

      const safeJump = jumpHeight > 0.85 && type !== 'branch';
      const safeSlide = slideTime > 0.08 && type === 'branch';

      if (!safeJump && !safeSlide) {
        endGame();
        return;
      }

      obj.userData.passed = true;
    }
  }

  // Coins.
  for (let i = treasures.length - 1; i >= 0; i--) {
    const coin = treasures[i];

    coin.position.z += travel;
    coin.rotation.y += dt * 3;

    coin.position.y =
      coin.userData.baseY + Math.sin(elapsed * 5 + i) * 0.12;

    if (coin.position.z > 12) {
      scene.remove(coin);
      treasures.splice(i, 1);
      continue;
    }

    const dx = Math.abs(coin.position.x - player.position.x);
    const dy = Math.abs(coin.position.y - (1.1 + jumpHeight));
    const dz = Math.abs(coin.position.z);

    if (dx < 0.9 && dy < 1.15 && dz < 0.95) {
      coins++;

      scene.remove(coin);
      treasures.splice(i, 1);

      $('coins').textContent = coins;
      showToast('+10 COINS');
    }
  }
}

// =====================================================
// HUD AND RESIZING
// =====================================================

function updateHUD() {
  score = Math.floor(distance * 2) + coins * 10;

  $('score').textContent = score;
  $('best').textContent = Math.max(best, score);
  $('speed').textContent = 'SPEED ' + (speed / 23).toFixed(1) + 'x';
}

function resize() {
  if (!camera || !renderer) return;

  camera.aspect = innerWidth / innerHeight;
  camera.fov = innerWidth < 600 ? 70 : 65;
  camera.updateProjectionMatrix();

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(innerWidth, innerHeight);
}

// =====================================================
// MAIN GAME LOOP
// =====================================================

function loop(now) {
  requestAnimationFrame(loop);

  const dt = Math.min((now - lastTime) / 1000, 0.04);
  lastTime = now;

  if (running && !paused && !gameOver) {
    elapsed += dt;

    distance += speed * dt / 10;
    speed = Math.min(23 + elapsed * 0.32, 42);

    updatePlayer(dt);
    updateWorld(dt);

    if (running && !gameOver) {
      spawnTimer -= dt;
      coinTimer -= dt;

      if (spawnTimer <= 0) {
        spawnPattern();

        spawnTimer =
          Math.max(0.9, 1.65 - elapsed * 0.005) +
          Math.random() * 0.35;
      }

      if (coinTimer <= 0) {
        spawnCoinLine();
        coinTimer = 2.8 + Math.random() * 1.6;
      }

      updateHUD();
    }
  } else if (!paused && !gameOver && player) {
    // Gentle idle animation on the title screen.
    elapsed += dt * 0.35;
    player.position.y = Math.sin(elapsed * 1.5) * 0.035;
  }

  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
}

// =====================================================
// STARTUP AND ERROR HANDLING
// =====================================================

try {
  init();
} catch (error) {
  console.error('Jungle Rush 3D startup error:', error);

  if (loadingEl) {
    loadingEl.textContent =
      '3D COULD NOT START — TRY A MODERN BROWSER';
  }
}
