import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

const canvas = document.getElementById("game");
const speedEl = document.getElementById("speedText");
const rpmEl = document.getElementById("rpmText");
const gearEl = document.getElementById("gearText");
const signalEl = document.getElementById("signalText");

// --- Three.js setup ---
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070b);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);

// Soft ambient + directional light
const ambient = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambient);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(5, 10, -5);
scene.add(dirLight);

// --- Road ---
const roadWidth = 12;
const roadLength = 400;
const roadGeo = new THREE.PlaneGeometry(roadWidth, roadLength, 1, 20);
const roadMat = new THREE.MeshStandardMaterial({ color: 0x202020 });
const road = new THREE.Mesh(roadGeo, roadMat);
road.rotation.x = -Math.PI / 2;
scene.add(road);

// Lane lines
const laneLines = new THREE.Group();
const laneCount = 4;
for (let i = -laneCount / 2 + 0.5; i < laneCount / 2; i++) {
  const lineGeo = new THREE.PlaneGeometry(0.15, roadLength, 1, 40);
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  const line = new THREE.Mesh(lineGeo, lineMat);
  line.rotation.x = -Math.PI / 2;
  line.position.x = (roadWidth / laneCount) * i * 2;
  laneLines.add(line);
}
scene.add(laneLines);

// --- Car (simple body + steering wheel) ---
const car = new THREE.Group();

// Car body (just for reference, not visible from cockpit)
const bodyGeo = new THREE.BoxGeometry(1.8, 1.2, 4);
const bodyMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.4, roughness: 0.6 });
const body = new THREE.Mesh(bodyGeo, bodyMat);
body.position.y = 0.6;
car.add(body);

// Steering wheel
const wheelGeo = new THREE.TorusGeometry(0.45, 0.08, 16, 32);
const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.3, roughness: 0.4 });
const steeringWheel = new THREE.Mesh(wheelGeo, wheelMat);
steeringWheel.rotation.z = Math.PI / 2;
steeringWheel.position.set(0, 1.0, 0.6);
car.add(steeringWheel);

// Simple dash panel
const dashGeo = new THREE.BoxGeometry(2.2, 0.4, 0.2);
const dashMat = new THREE.MeshStandardMaterial({ color: 0x050608, metalness: 0.2, roughness: 0.8 });
const dash = new THREE.Mesh(dashGeo, dashMat);
dash.position.set(0, 1.0, 0.2);
car.add(dash);

// Turn signal indicators (small emissive spheres)
const leftSignalMesh = new THREE.Mesh(
  new THREE.SphereGeometry(0.05, 16, 16),
  new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0x000000 })
);
leftSignalMesh.position.set(-0.6, 1.05, 0.25);
car.add(leftSignalMesh);

const rightSignalMesh = new THREE.Mesh(
  new THREE.SphereGeometry(0.05, 16, 16),
  new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0x000000 })
);
rightSignalMesh.position.set(0.6, 1.05, 0.25);
car.add(rightSignalMesh);

scene.add(car);

// Camera in cockpit
camera.position.set(0, 1.1, 0.1);
car.add(camera);

// --- Traffic cars (simple boxes) ---
const traffic = [];
const trafficMat = new THREE.MeshStandardMaterial({ color: 0xff3333, metalness: 0.4, roughness: 0.5 });

function spawnTrafficCar() {
  const geo = new THREE.BoxGeometry(1.8, 1.2, 4);
  const mesh = new THREE.Mesh(geo, trafficMat.clone());
  const laneIndex = Math.floor(Math.random() * laneCount);
  const laneX = (laneIndex - (laneCount - 1) / 2) * (roadWidth / laneCount);
  mesh.position.set(laneX, 0.6, -Math.random() * 200 - 50);
  mesh.userData.speed = 60 + Math.random() * 80; // km/h
  scene.add(mesh);
  traffic.push(mesh);
}

for (let i = 0; i < 10; i++) spawnTrafficCar();

// --- Driving state ---
const keys = {};
document.addEventListener("keydown", e => keys[e.key.toLowerCase()] = true);
document.addEventListener("keyup", e => keys[e.key.toLowerCase()] = false);

let speed = 0;      // km/h
let rpm = 800;
let gear = "D";
let steeringInput = 0; // -1..1
let steeringAngle = 0; // radians
let leftSignal = false;
let rightSignal = false;
let signalBlink = false;
let signalTimer = 0;

// --- Update loop ---
let lastTime = performance.now();

function update(dt) {
  // Throttle / brake
  const accel = 120;   // km/h per second
  const brake = 200;
  const drag = 0.35;

  if (keys["w"]) speed += accel * dt;
  if (keys["s"]) speed -= brake * dt;

  speed -= speed * drag * dt;
  speed = Math.max(0, Math.min(260, speed));

  // RPM (fake auto box)
  rpm = 900 + speed * 40 + (keys["w"] ? 500 : 0);
  rpm = Math.min(7500, rpm);

  // Steering input (A = left, D = right)
  if (keys["a"]) steeringInput += 3 * dt;
  if (keys["d"]) steeringInput -= 3 * dt;
  steeringInput = Math.max(-1, Math.min(1, steeringInput));
  steeringInput *= 0.9;

  // Speed‑sensitive steering (less twitchy at high speed)
  const steeringStrength = THREE.MathUtils.lerp(1.8, 0.4, speed / 200);
  const yawDelta = steeringInput * steeringStrength * dt;

  // Move car forward in its local -Z direction
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(car.quaternion);
  const distance = (speed / 3.6) * dt; // km/h -> m/s
  car.position.addScaledVector(forward, distance);

  // Rotate car around Y
  car.rotation.y += yawDelta;

  // Steering wheel rotation (visual)
  steeringAngle = steeringInput * 0.7; // radians
  steeringWheel.rotation.y = steeringAngle + Math.PI; // keep orientation nice

  // Road reposition (looping)
  const carZ = car.position.z;
  road.position.z = carZ - 50;
  laneLines.position.z = road.position.z;

  // Traffic update
  for (const t of traffic) {
    const relSpeed = (t.userData.speed - speed); // km/h
    const dz = (relSpeed / 3.6) * dt;
    t.position.z += dz;

    if (t.position.z > carZ + 50) {
      // Respawn ahead
      const laneIndex = Math.floor(Math.random() * laneCount);
      const laneX = (laneIndex - (laneCount - 1) / 2) * (roadWidth / laneCount);
      t.position.set(laneX, 0.6, carZ - 150 - Math.random() * 150);
      t.userData.speed = 60 + Math.random() * 80;
    }
  }

  // Signals
  if (keys["z"]) {
    leftSignal = true;
    rightSignal = false;
  }
  if (keys["x"]) {
    rightSignal = true;
    leftSignal = false;
  }
  if (keys["z"] && keys["x"]) {
    leftSignal = false;
    rightSignal = false;
  }

  signalTimer += dt;
  if (signalTimer > 0.5) {
    signalTimer = 0;
    signalBlink = !signalBlink;
  }

  // Update signal meshes
  leftSignalMesh.material.emissive.set(
    leftSignal && signalBlink ? 0xffaa00 : 0x000000
  );
  rightSignalMesh.material.emissive.set(
    rightSignal && signalBlink ? 0xffaa00 : 0x000000
  );

  // HUD
  speedEl.textContent = speed.toFixed(0);
  rpmEl.textContent = rpm.toFixed(0);
  gearEl.textContent = gear;
  if (leftSignal && rightSignal && signalBlink) signalEl.textContent = "Hazard";
  else if (leftSignal && signalBlink) signalEl.textContent = "Left";
  else if (rightSignal && signalBlink) signalEl.textContent = "Right";
  else signalEl.textContent = "Off";
}

function animate(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  update(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

// Resize
window.addEventListener("resize", () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});
