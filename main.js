import * as THREE from 'three';

// =========================================
// 1. FIREBASE SETUP (From index.html)
// =========================================
const db = window.firebaseDB;
const ref = window.firebaseRef;
const set = window.firebaseSet;
const onValue = window.firebaseOnValue;
const onDisconnect = window.firebaseOnDisconnect;

// =========================================
// 2. GAME VARIABLES
// =========================================
let scene, camera, renderer;
let localPlayer;
const otherPlayers = {}; // Store other players' 3D models

const playerSpeed = 0.2;
const gravity = -0.02;
const jumpForce = 0.5;
let velocityY = 0;
let isGrounded = true;

// UI Elements
const lobbyScreen = document.getElementById('lobby-screen');
const loadingScreen = document.getElementById('loading-screen');
const uiLayer = document.getElementById('ui-layer');
const joinBtn = document.getElementById('join-btn');
const nameInput = document.getElementById('player-name-input');

// Player Data
let myId = "player_" + Math.floor(Math.random() * 1000000);
let myName = "Guest";

// Input States
const keys = { w: false, a: false, s: false, d: false, space: false };
let joystickData = { x: 0, y: 0 };

// =========================================
// 3. INITIALIZE 3D SCENE
// =========================================
function init() {
    // Scene setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB); // Aasman ka color
    scene.fog = new THREE.Fog(0x87CEEB, 10, 50); // Fog se door ki cheezein dhup jayengi

    // Camera setup
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 5, 10);

    // Renderer setup
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true; // Shadows on
    document.getElementById('game-container').appendChild(renderer.domElement);

    // Lights (Realistic feel ke liye)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 1);
    sunLight.position.set(10, 20, 10);
    sunLight.castShadow = true;
    scene.add(sunLight);

    // Basic Ground (Zameen)
    const groundGeo = new THREE.PlaneGeometry(100, 100);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x228B22 }); // Grass Green
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Create Local Player Model (Aap)
    localPlayer = createPlayerMesh(0xff0000); // Red box for you
    scene.add(localPlayer);

    // Hide loading screen
    loadingScreen.classList.add('hidden');

    // Start Animation Loop
    animate();
}

// =========================================
// 4. CREATE PLAYER 3D MODEL
// =========================================
function createPlayerMesh(color) {
    // Ek simple block (Minecraft style player)
    const geometry = new THREE.BoxGeometry(1, 2, 1);
    const material = new THREE.MeshStandardMaterial({ color: color });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.position.set(0, 1, 0); // Box ki height ke hisaab se
    return mesh;
}

// =========================================
// 5. FIREBASE MULTIPLAYER LOGIC
// =========================================
function joinMultiplayer() {
    myName = nameInput.value.trim() || "Player_" + Math.floor(Math.random() * 1000);
    
    // UI change
    lobbyScreen.classList.add('hidden');
    uiLayer.classList.remove('hidden');

    const playerRef = ref(db, 'players/' + myId);

    // Player data Firebase mein save karo
    set(playerRef, {
        name: myName,
        x: localPlayer.position.x,
        y: localPlayer.position.y,
        z: localPlayer.position.z
    });

    // Jab player game se nikle, toh use database se hatao
    onDisconnect(playerRef).remove();

    // Listen for other players
    onValue(ref(db, 'players'), (snapshot) => {
        const data = snapshot.val();
        if (!data) return;

        // Update online count
        document.getElementById('online-players').innerText = `Players: ${Object.keys(data).length}`;

        for (let id in data) {
            if (id !== myId) {
                // Agar dusra player hai
                if (!otherPlayers[id]) {
                    // Agar scene mein nahi hai, toh naya box banao
                    const otherMesh = createPlayerMesh(0x0000ff); // Blue box for others
                    scene.add(otherMesh);
                    otherPlayers[id] = otherMesh;
                }
                // Uski position update karo (lerp se smooth movement)
                otherPlayers[id].position.lerp(new THREE.Vector3(data[id].x, data[id].y, data[id].z), 0.2);
            } else if (!data[id]) {
                // Agar koi player disconnect ho gaya
                if (otherPlayers[id]) {
                    scene.remove(otherPlayers[id]);
                    delete otherPlayers[id];
                }
            }
        }
    });

    // Interval to update MY position to Firebase (har 100ms mein)
    setInterval(() => {
        if(localPlayer) {
            set(playerRef, {
                name: myName,
                x: localPlayer.position.x,
                y: localPlayer.position.y,
                z: localPlayer.position.z
            });
        }
    }, 100);
}

// =========================================
// 6. CONTROLS (Keyboard & Mobile Joystick)
// =========================================
// Keyboard
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

// Mobile Joystick (Touch Events)
const joystickBase = document.getElementById('joystick-base');
const joystickKnob = document.getElementById('joystick-knob');
const joystickZone = document.getElementById('joystick-zone');
const maxDistance = 35; // Knob kitna hil sakta hai

joystickZone.addEventListener('touchstart', handleTouchStart, { passive: false });
joystickZone.addEventListener('touchmove', handleTouchMove, { passive: false });
joystickZone.addEventListener('touchend', handleTouchEnd, { passive: false });

let touchId = null;
let baseRect;

function handleTouchStart(e) {
    e.preventDefault();
    const touch = e.changedTouches[0];
    touchId = touch.identifier;
    baseRect = joystickBase.getBoundingClientRect();
    handleTouchMove(e);
}

function handleTouchMove(e) {
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
            
            // Normalize values (-1 to 1) for movement
            joystickData.x = deltaX / maxDistance;
            joystickData.y = deltaY / maxDistance;
        }
    }
}

function handleTouchEnd(e) {
    e.preventDefault();
    joystickKnob.style.transform = `translate(0px, 0px)`;
    joystickData = { x: 0, y: 0 };
    touchId = null;
}

// Jump Button
const jumpBtn = document.getElementById('btn-jump');
jumpBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (isGrounded) {
        velocityY = jumpForce;
        isGrounded = false;
    }
});

// =========================================
// 7. ANIMATION LOOP (Game Logic)
// =========================================
function animate() {
    requestAnimationFrame(animate);

    if (localPlayer) {
        // Movement Logic
        let moveX = 0;
        let moveZ = 0;

        // Keyboard
        if (keys.w) moveZ -= 1;
        if (keys.s) moveZ += 1;
        if (keys.a) moveX -= 1;
        if (keys.d) moveX += 1;

        // Joystick (Mobile)
        if (joystickData.x !== 0 || joystickData.y !== 0) {
            moveX = joystickData.x;
            moveZ = joystickData.y;
        }

        // Player Position Update
        localPlayer.position.x += moveX * playerSpeed;
        localPlayer.position.z += moveZ * playerSpeed;

        // Player rotation (Jis taraf chal raha hai, us taraf muh ho)
        if (moveX !== 0 || moveZ !== 0) {
            const angle = Math.atan2(moveX, moveZ);
            localPlayer.rotation.y = angle;
        }

        // Gravity & Jump
        velocityY += gravity;
        localPlayer.position.y += velocityY;

        // Ground Collision (Simple)
        if (localPlayer.position.y <= 1) {
            localPlayer.position.y = 1;
            velocityY = 0;
            isGrounded = true;
        }

        // Keyboard Jump
        if (keys.space && isGrounded) {
            velocityY = jumpForce;
            isGrounded = false;
        }

        // Camera ko player ke peeche set karo (Third Person View)
        // Agar aap first person chahte hain toh yeh logic change hoga
        camera.position.x = localPlayer.position.x;
        camera.position.y = localPlayer.position.y + 5;
        camera.position.z = localPlayer.position.z + 10;
        camera.lookAt(localPlayer.position);
    }

    renderer.render(scene, camera);
}

// =========================================
// 8. WINDOW RESIZE
// =========================================
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Start the Game!
init();
joinBtn.addEventListener('click', joinMultiplayer);
