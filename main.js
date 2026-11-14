import * as THREE from 'three';

// High-End Graphics ke liye Imports
import { Sky } from 'three/addons/objects/Sky.js';
import { Water } from 'three/addons/objects/Water.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// =========================================
// 1. FIREBASE SETUP
// =========================================
const db = window.firebaseDB;
const ref = window.firebaseRef;
const set = window.firebaseSet;
const onValue = window.firebaseOnValue;
const onDisconnect = window.firebaseOnDisconnect;

// =========================================
// 2. VARIABLES
// =========================================
let scene, camera, renderer, composer;
let localPlayer, water, sky;
const otherPlayers = {}; 

const playerSpeed = 0.2;
const gravity = -0.02;
const jumpForce = 0.5;
let velocityY = 0;
let isGrounded = true;

const lobbyScreen = document.getElementById('lobby-screen');
const loadingScreen = document.getElementById('loading-screen');
const uiLayer = document.getElementById('ui-layer');
const joinBtn = document.getElementById('join-btn');
const nameInput = document.getElementById('player-name-input');

let myId = "player_" + Math.floor(Math.random() * 1000000);
let myName = "Guest";

const keys = { w: false, a: false, s: false, d: false, space: false };
let joystickData = { x: 0, y: 0 };

// =========================================
// 3. WORLD GENERATION
// =========================================
class World {
    constructor(scene) {
        this.scene = scene;
        this.worldSize = 25; 
        this.blocks = [];
        this.mesh = null;
        this.generateWorld();
    }

    generateWorld() {
        for (let x = 0; x < this.worldSize; x++) {
            for (let z = 0; z < this.worldSize; z++) {
                let height = Math.floor(Math.sin(x * 0.3) * Math.cos(z * 0.3) * 3) + 3;
                for (let y = 0; y < height; y++) {
                    this.blocks.push({ x, y, z });
                }
            }
        }

        const geometry = new THREE.BoxGeometry(1, 1, 1);
        // PBR Material (Physically Based Rendering) realistic light ke liye
        const material = new THREE.MeshStandardMaterial({ color: 0x4ade80, roughness: 0.9, metalness: 0.1 });

        this.mesh = new THREE.InstancedMesh(geometry, material, this.blocks.length);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;

        const dummy = new THREE.Object3D();
        this.blocks.forEach((block, index) => {
            dummy.position.set(block.x + 0.5, block.y + 0.5, block.z + 0.5);
            dummy.updateMatrix();
            this.mesh.setMatrixAt(index, dummy.matrix);
        });

        this.scene.add(this.mesh);
    }
}

// =========================================
// 4. INITIALIZE SCENE & HIGH GRAPHICS
// =========================================
function init() {
    scene = new THREE.Scene();

    // Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    
    // Renderer Setup
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Mobile par zyada load na ho
    renderer.shadowMap.enabled = true; 
    renderer.toneMapping = THREE.ACESFilmicToneMapping; // Cinematic Colors
    renderer.toneMappingExposure = 0.6;
    document.getElementById('game-container').appendChild(renderer.domElement);

    // --- 1. SUNSET SKY SETUP ---
    sky = new Sky();
    sky.scale.setScalar(450000);
    scene.add(sky);

    const sun = new THREE.Vector3();
    const uniforms = sky.material.uniforms;
    uniforms['turbidity'].value = 10;
    uniforms['rayleigh'].value = 2;
    uniforms['mieCoefficient'].value = 0.005;
    uniforms['mieDirectionalG'].value = 0.8;

    // Sun ki position (Sunset ke liye neeche)
    const elevation = 2; // Thoda neeche
    const azimuth = 180;
    const phi = THREE.MathUtils.degToRad(90 - elevation);
    const theta = THREE.MathUtils.degToRad(azimuth);
    sun.setFromSphericalCoords(1, phi, theta);
    uniforms['sunPosition'].value.copy(sun);

    // --- 2. REALISTIC WATER SETUP ---
    const waterGeometry = new THREE.PlaneGeometry(10000, 10000);
    water = new Water(waterGeometry, {
        textureWidth: 512,
        textureHeight: 512,
        waterNormals: new THREE.TextureLoader().load('https://threejs.org/examples/textures/waternormals.jpg', function (texture) {
            texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        }),
        sunDirection: new THREE.Vector3(),
        sunColor: 0xffffff,
        waterColor: 0x001e0f, // Gehra samundar ka color
        distortionScale: 3.7,
        fog: scene.fog !== undefined
    });
    water.rotation.x = -Math.PI / 2;
    water.position.y = -0.5; // Zameen se thoda neeche
    scene.add(water);

    // --- 3. LIGHTING ---
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffddaa, 2); // Sunset wali peeli roshni
    sunLight.position.set(20, 10, 10);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 50;
    sunLight.shadow.camera.left = -30;
    sunLight.shadow.camera.right = 30;
    sunLight.shadow.camera.top = 30;
    sunLight.shadow.camera.bottom = -30;
    scene.add(sunLight);

    // --- 4. POST-PROCESSING (BLOOM EFFECT) ---
    // Isse roshni chamkegi (jaise lantern ya sun)
    composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        1.5, // Strength
        0.4, // Radius
        0.85 // Threshold
    );
    composer.addPass(bloomPass);

    // World aur Player load karo
    const gameWorld = new World(scene);
    localPlayer = createPlayerMesh(0xff0000); 
    localPlayer.position.set(12, 10, 12); 
    scene.add(localPlayer);

    loadingScreen.classList.add('hidden');
    animate();
}

function createPlayerMesh(color) {
    const geometry = new THREE.BoxGeometry(1, 2, 1);
    const material = new THREE.MeshStandardMaterial({ color: color, roughness: 0.5 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    return mesh;
}

// =========================================
// 5. MULTIPLAYER LOGIC
// =========================================
function joinMultiplayer() {
    myName = nameInput.value.trim() || "Player_" + Math.floor(Math.random() * 1000);
    lobbyScreen.classList.add('hidden');
    uiLayer.classList.remove('hidden');

    const playerRef = ref(db, 'players/' + myId);
    set(playerRef, { name: myName, x: localPlayer.position.x, y: localPlayer.position.y, z: localPlayer.position.z });
    onDisconnect(playerRef).remove();

    onValue(ref(db, 'players'), (snapshot) => {
        const data = snapshot.val();
        if (!data) return;

        document.getElementById('online-players').innerText = `Players: ${Object.keys(data).length}`;

        for (let id in data) {
            if (id !== myId) {
                if (!otherPlayers[id]) {
                    const otherMesh = createPlayerMesh(0x0000ff); 
                    scene.add(otherMesh);
                    otherPlayers[id] = otherMesh;
                }
                otherPlayers[id].position.lerp(new THREE.Vector3(data[id].x, data[id].y, data[id].z), 0.3);
            }
        }
        
        for (let id in otherPlayers) {
            if (!data[id]) {
                scene.remove(otherPlayers[id]);
                delete otherPlayers[id];
            }
        }
    });

    setInterval(() => {
        if(localPlayer) {
            set(playerRef, { name: myName, x: localPlayer.position.x, y: localPlayer.position.y, z: localPlayer.position.z });
        }
    }, 100);
}

// =========================================
// 6. CONTROLS
// =========================================
window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'w') keys.w = true;
    if (e.key.toLowerCase() === 'a') keys.a = true;
    if (e.key.toLowerCase() === 's') keys.s = true;
    if (e.key.toLowerCase() === 'd') keys.d = true;
    if (e.code === 'Space') keys.space = true;
});

window.addEventListener('keyup', (e) => {
    if (e.key.toLowerCase() === 'w') keys.w = false;
    if (e.key.toLowerCase() === 'a') keys.a = false;
    if (e.key.toLowerCase() === 's') keys.s = false;
    if (e.key.toLowerCase() === 'd') keys.d = false;
    if (e.code === 'Space') keys.space = false;
});

const joystickBase = document.getElementById('joystick-base');
const joystickKnob = document.getElementById('joystick-knob');
const joystickZone = document.getElementById('joystick-zone');
const maxDistance = 35;
let touchId = null;
let baseRect;

joystickZone.addEventListener('touchstart', (e) => {
    e.preventDefault();
    touchId = e.changedTouches[0].identifier;
    baseRect = joystickBase.getBoundingClientRect();
}, { passive: false });

joystickZone.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (let i = 0; i < e.touches.length; i++) {
        if (e.touches[i].identifier === touchId) {
            const touch = e.touches[i];
            const centerX = baseRect.left + baseRect.width / 2;
            const centerY = baseRect.top + baseRect.height / 2;
            let deltaX = touch.clientX - centerX;
            let deltaY = touch.clientY - centerY;
            const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
            
            if (distance > maxDistance) {
                deltaX = (deltaX / distance) * maxDistance;
                deltaY = (deltaY / distance) * maxDistance;
            }
            joystickKnob.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
            joystickData.x = deltaX / maxDistance;
            joystickData.y = deltaY / maxDistance;
        }
    }
}, { passive: false });

joystickZone.addEventListener('touchend', (e) => {
    e.preventDefault();
    joystickKnob.style.transform = `translate(0px, 0px)`;
    joystickData = { x: 0, y: 0 };
    touchId = null;
}, { passive: false });

document.getElementById('btn-jump').addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (isGrounded) { velocityY = jumpForce; isGrounded = false; }
});

// =========================================
// 7. ANIMATION LOOP
// =========================================
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();

    // Pani ko lehrane ke liye (Water Animation)
    if (water) water.material.uniforms['time'].value += delta * 0.5;

    if (localPlayer) {
        let moveX = 0, moveZ = 0;
        if (keys.w) moveZ -= 1;
        if (keys.s) moveZ += 1;
        if (keys.a) moveX -= 1;
        if (keys.d) moveX += 1;

        if (joystickData.x !== 0 || joystickData.y !== 0) {
            moveX = joystickData.x;
            moveZ = joystickData.y;
        }

        localPlayer.position.x += moveX * playerSpeed;
        localPlayer.position.z += moveZ * playerSpeed;

        if (moveX !== 0 || moveZ !== 0) {
            localPlayer.rotation.y = Math.atan2(moveX, moveZ);
        }

        velocityY += gravity;
        localPlayer.position.y += velocityY;

        if (localPlayer.position.y <= 1) { 
            localPlayer.position.y = 1;
            velocityY = 0;
            isGrounded = true;
        }

        if (keys.space && isGrounded) {
            velocityY = jumpForce;
            isGrounded = false;
        }

        camera.position.x = localPlayer.position.x;
        camera.position.y = localPlayer.position.y + 6;
        camera.position.z = localPlayer.position.z + 12;
        camera.lookAt(localPlayer.position);
    }

    // Renderer ki jagah Composer use karo (Bloom effect ke liye)
    composer.render();
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});

init();
joinBtn.addEventListener('click', joinMultiplayer);
