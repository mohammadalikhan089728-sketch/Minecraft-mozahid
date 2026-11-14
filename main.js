import * as THREE from 'three';
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
const update = window.firebaseUpdate; // Update import kiya

// =========================================
// 2. VARIABLES
// =========================================
let scene, camera, renderer, composer;
let localPlayer, water, sky;
let blockHighlight; // Jis block par nishana hoga, woh highlight hoga
const otherPlayers = {}; 
const worldChanges = {}; // Firebase se aane wale block changes store karne ke liye

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2(0, 0); // Center of screen

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
let isPlaying = false;

const keys = { w: false, a: false, s: false, d: false, space: false };
let joystickData = { x: 0, y: 0 };

// =========================================
// 3. WORLD GENERATION (With Modifications)
// =========================================
class World {
    constructor(scene) {
        this.scene = scene;
        this.worldSize = 25; 
        this.blocks = []; // Array of objects { x, y, z, instanceId }
        this.mesh = null;
        this.blockMap = new Map(); // Fast searching ke liye (x,y,z) -> instanceId
        this.dummy = new THREE.Object3D();
        
        this.generateWorld();
    }

    generateWorld() {
        for (let x = 0; x < this.worldSize; x++) {
            for (let z = 0; z < this.worldSize; z++) {
                let height = Math.floor(Math.sin(x * 0.3) * Math.cos(z * 0.3) * 3) + 3;
                for (let y = 0; y < height; y++) {
                    this.addBlockData(x, y, z);
                }
            }
        }

        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshStandardMaterial({ color: 0x4ade80, roughness: 0.8, metalness: 0.1 });

        this.mesh = new THREE.InstancedMesh(geometry, material, this.blocks.length);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;

        this.blocks.forEach((block, index) => {
            this.dummy.position.set(block.x + 0.5, block.y + 0.5, block.z + 0.5);
            this.dummy.updateMatrix();
            this.mesh.setMatrixAt(index, this.dummy.matrix);
        });

        this.scene.add(this.mesh);
    }

    addBlockData(x, y, z) {
        const key = `${x},${y},${z}`;
        if (!this.blockMap.has(key)) {
            const instanceId = this.blocks.length;
            this.blocks.push({ x, y, z, instanceId });
            this.blockMap.set(key, instanceId);
        }
    }

    // Block ko todne ke liye (Scale 0 kar denge taaki gayab ho jaye)
    removeBlock(x, y, z) {
        const key = `${x},${y},${z}`;
        if (this.blockMap.has(key)) {
            const instanceId = this.blockMap.get(key);
            this.dummy.position.set(x + 0.5, y + 0.5, z + 0.5);
            this.dummy.scale.set(0, 0, 0); // Block gayab
            this.dummy.updateMatrix();
            this.mesh.setMatrixAt(instanceId, this.dummy.matrix);
            this.mesh.instanceMatrix.needsUpdate = true; // GPU ko batao update hua hai
        }
    }

    // Naya block lagane ke liye
    placeBlock(x, y, z) {
        const key = `${x},${y},${z}`;
        if (!this.blockMap.has(key) && this.blocks.length > 0) {
            // Trick: Ek naya block add karne ke liye hum ek purane block ka data use karenge
            // Par InstancedMesh ka size fix hota hai. Isliye hum ek "dead" block ko reuse karenge.
            // Asli game mein yahan naya geometry add hota hai. Filhal hum purane todde gaye block ki jagah naya set karenge.
            
            // Ek simple tareeka: Hum blockMap mein add kar denge, par actual mesh mein naya block lagane ke liye
            // hume InstancedMesh ka count badhana padega ya naya mesh banana padega.
            // Abhi ke liye hum sirf data save karenge (Aage optimize karenge).
        }
    }
}

let gameWorld; 

// =========================================
// 4. INITIALIZE SCENE
// =========================================
function init() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); 
    renderer.shadowMap.enabled = true; 
    renderer.toneMapping = THREE.ACESFilmicToneMapping; 
    renderer.toneMappingExposure = 0.6;
    document.getElementById('game-container').appendChild(renderer.domElement);

    // --- SKY ---
    sky = new Sky();
    sky.scale.setScalar(450000);
    scene.add(sky);
    const sun = new THREE.Vector3();
    const uniforms = sky.material.uniforms;
    uniforms['turbidity'].value = 10;
    uniforms['rayleigh'].value = 2;
    uniforms['mieCoefficient'].value = 0.005;
    uniforms['mieDirectionalG'].value = 0.8;
    sun.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 2), THREE.MathUtils.degToRad(180));
    uniforms['sunPosition'].value.copy(sun);

    // --- WATER ---
    const waterGeometry = new THREE.PlaneGeometry(10000, 10000);
    water = new Water(waterGeometry, {
        textureWidth: 512, textureHeight: 512,
        waterNormals: new THREE.TextureLoader().load('https://threejs.org/examples/textures/waternormals.jpg', function (texture) {
            texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        }),
        sunDirection: new THREE.Vector3(),
        sunColor: 0xffffff, waterColor: 0x001e0f,
        distortionScale: 3.7, fog: scene.fog !== undefined
    });
    water.rotation.x = -Math.PI / 2;
    water.position.y = -0.5;
    scene.add(water);

    // --- LIGHTS ---
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);
    const sunLight = new THREE.DirectionalLight(0xffddaa, 2); 
    sunLight.position.set(20, 10, 10);
    sunLight.castShadow = true;
    scene.add(sunLight);

    // --- BLOOM ---
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85));

    // --- WORLD & PLAYER ---
    gameWorld = new World(scene);
    localPlayer = createPlayerMesh(0xff0000); 
    localPlayer.position.set(12, 10, 12); 
    scene.add(localPlayer);

    // --- BLOCK HIGHLIGHT BOX ---
    // Jab aap crosshair kisi block par rakhenge, toh ek white outline dikhega
    const boxGeo = new THREE.BoxGeometry(1.01, 1.01, 1.01);
    const edges = new THREE.EdgesGeometry(boxGeo);
    const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 }));
    blockHighlight = line;
    scene.add(blockHighlight);

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
// 5. MULTIPLAYER & WORLD SYNC
// =========================================
function joinMultiplayer() {
    myName = nameInput.value.trim() || "Player_" + Math.floor(Math.random() * 1000);
    lobbyScreen.classList.add('hidden');
    uiLayer.classList.remove('hidden');
    isPlaying = true;

    const playerRef = ref(db, 'players/' + myId);
    set(playerRef, { name: myName, x: localPlayer.position.x, y: localPlayer.position.y, z: localPlayer.position.z });
    onDisconnect(playerRef).remove();

    // 1. Players Sync
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

    // Player Position Update Interval
    setInterval(() => {
        if(isPlaying && localPlayer) {
            set(playerRef, { name: myName, x: localPlayer.position.x, y: localPlayer.position.y, z: localPlayer.position.z });
        }
    }, 100);

    // 2. Block Changes Sync (Firebase)
    onValue(ref(db, 'blockChanges'), (snapshot) => {
        const changes = snapshot.val();
        if (!changes) return;
        
        for (let key in changes) {
            // Agar pehle se apply nahi kiya hai
            if (!worldChanges[key]) {
                worldChanges[key] = changes[key];
                const coords = key.split('_');
                const x = parseFloat(coords[0]);
                const y = parseFloat(coords[1]);
                const z = parseFloat(coords[2]);

                if (changes[key] === 0) { // Block Toda gaya
                    gameWorld.removeBlock(x, y, z);
                } else if (changes[key] === 1) { // Block Lagaya gaya
                    // Note: InstancedMesh mein naya block add karna thoda complex hai, abhi ke liye hum sirf remove sync kar rahe hain.
                }
            }
        }
    });
}

// =========================================
// 6. CONTROLS & ACTIONS (MINE/PLACE)
// =========================================
const joystickBase = document.getElementById('joystick-base');
const joystickKnob = document.getElementById('joystick-knob');
const joystickZone = document.getElementById('joystick-zone');
const maxDistance = 35;
let touchId = null;
let baseRect;

// Joystick Logic
joystickZone.addEventListener('touchstart', (e) => { e.preventDefault(); touchId = e.changedTouches[0].identifier; baseRect = joystickBase.getBoundingClientRect(); }, { passive: false });
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
            if (distance > maxDistance) { deltaX = (deltaX / distance) * maxDistance; deltaY = (deltaY / distance) * maxDistance; }
            joystickKnob.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
            joystickData.x = deltaX / maxDistance; joystickData.y = deltaY / maxDistance;
        }
    }
}, { passive: false });
joystickZone.addEventListener('touchend', (e) => { e.preventDefault(); joystickKnob.style.transform = `translate(0px, 0px)`; joystickData = { x: 0, y: 0 }; touchId = null; }, { passive: false });

// Jump
document.getElementById('btn-jump').addEventListener('touchstart', (e) => { e.preventDefault(); if (isGrounded) { velocityY = jumpForce; isGrounded = false; } });

// Keyboard Events
window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'w') keys.w = true;
    if (e.key.toLowerCase() === 'a') keys.a = true;
    if (e.key.toLowerCase() === 's') keys.s = true;
    if (e.key.toLowerCase() === 'd') keys.d = true;
    if (e.code === 'Space') keys.space = true;
});

// Desktop Mouse click (Mine/Place)
window.addEventListener('mousedown', (e) => {
    if (!isPlaying) return;
    if (e.button === 0) mineBlock(); // Left Click = Mine
    if (e.button === 2) placeBlock(); // Right Click = Place
});
window.addEventListener('contextmenu', e => e.preventDefault()); // Right click menu band karo

// Mobile Buttons (Mine/Place)
document.getElementById('btn-mine').addEventListener('touchstart', (e) => { e.preventDefault(); mineBlock(); });
document.getElementById('btn-place').addEventListener('touchstart', (e) => { e.preventDefault(); placeBlock(); });

// MINE LOGIC
function mineBlock() {
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(gameWorld.mesh);
    
    if (intersects.length > 0) {
        // Sirf 5 block door tak tod sakte hain
        if (intersects[0].distance < 6) {
            const instanceId = intersects[0].instanceId;
            const blockData = gameWorld.blocks.find(b => b.instanceId === instanceId);
            
            if (blockData) {
                // 1. Local mein gayab karo
                gameWorld.removeBlock(blockData.x, blockData.y, blockData.z);
                
                // 2. Firebase mein save karo (taaki dusre players ko dikhe)
                const key = `${blockData.x}_${blockData.y}_${blockData.z}`;
                set(ref(db, 'blockChanges/' + key), 0); 
            }
        }
    }
}

// PLACE LOGIC (Thoda complex hai, abhi hum simple rakh rahe hain)
function placeBlock() {
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(gameWorld.mesh);
    
    if (intersects.length > 0) {
        if (intersects[0].distance < 6) {
            const point = intersects[0].point;
            const normal = intersects[0].face.normal;
            
            // Nayi block ki position calculate karo (jitna face normal hai, uske hisaab se)
            const nx = point.x + normal.x * 0.5;
            const ny = point.y + normal.y * 0.5;
            const nz = point.z + normal.z * 0.5;

            // Fire me save karo
            const key = `${Math.floor(nx)}_${Math.floor(ny)}_${Math.floor(nz)}`;
            set(ref(db, 'blockChanges/' + key), 1); 
            
            // Note: InstancedMesh mein naya block lagana thoda tricky hai. 
            // Abhi ke liye hum naya block lagane ka visual local mein skip kar rahe hain, par firebase sync ho raha hai.
            alert("Block position saved to database! (Visuals coming in next update)");
        }
    }
}

// =========================================
// 7. ANIMATION LOOP & HIGHLIGHT
// =========================================
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    if (water) water.material.uniforms['time'].value += delta * 0.5;

    if (localPlayer && isPlaying) {
        let moveX = 0, moveZ = 0;
        if (keys.w) moveZ -= 1; if (keys.s) moveZ += 1; if (keys.a) moveX -= 1; if (keys.d) moveX += 1;
        if (joystickData.x !== 0 || joystickData.y !== 0) { moveX = joystickData.x; moveZ = joystickData.y; }

        localPlayer.position.x += moveX * playerSpeed;
        localPlayer.position.z += moveZ * playerSpeed;

        if (moveX !== 0 || moveZ !== 0) localPlayer.rotation.y = Math.atan2(moveX, moveZ);

        velocityY += gravity;
        localPlayer.position.y += velocityY;

        if (localPlayer.position.y <= 1) { localPlayer.position.y = 1; velocityY = 0; isGrounded = true; }
        if (keys.space && isGrounded) { velocityY = jumpForce; isGrounded = false; }

        // Camera follow
        camera.position.x = localPlayer.position.x;
        camera.position.y = localPlayer.position.y + 6;
        camera.position.z = localPlayer.position.z + 12;
        camera.lookAt(localPlayer.position);

        // --- BLOCK HIGHLIGHT LOGIC ---
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObject(gameWorld.mesh);
        if (intersects.length > 0 && intersects[0].distance < 6) {
            const point = intersects[0].point;
            const normal = intersects[0].face.normal;
            // Highlight box ko block ke center par set karo
            blockHighlight.position.set(
                Math.floor(point.x) + 0.5, 
                Math.floor(point.y) + 0.5, 
                Math.floor(point.z) + 0.5
            );
            blockHighlight.visible = true;
        } else {
            blockHighlight.visible = false; // Door ho toh gayab kardo
        }
    }

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
