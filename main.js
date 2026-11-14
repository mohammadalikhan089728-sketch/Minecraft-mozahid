<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Minecraft Mozahid</title>
    
    <!-- CSS Link (Bina folder ke) -->
    <link rel="stylesheet" href="style.css">

    <!-- Three.js Load Karne ke liye (Import Map) -->
    <script type="importmap">
        {
            "imports": {
                "three": "https://unpkg.com/three@0.160.0/build/three.module.js",
                "three/addons/": "https://unpkg.com/three@0.160.0/examples/jsm/"
            }
        }
    </script>

    <!-- Firebase SDK -->
    <script type="module">
        import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
        import { getDatabase, ref, set, onValue, onDisconnect } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

        const FIREBASE_CONFIG = {
            apiKey: "AIzaSyB-UdPysk2hYPf75cx8IAkJzivpbuCQcnc",
            authDomain: "v8-wala-engine-hai.firebaseapp.com",
            databaseURL: "https://v8-wala-engine-hai-default-rtdb.asia-southeast1.firebasedatabase.app",
            projectId: "v8-wala-engine-hai",
            storageBucket: "v8-wala-engine-hai.appspot.com",
            messagingSenderId: "67142036156",
            appId: "1:67142036156:web:dbc35b215283e1cff67eb9"
        };

        const app = initializeApp(FIREBASE_CONFIG);
        const db = getDatabase(app);

        window.firebaseDB = db;
        window.firebaseRef = ref;
        window.firebaseSet = set;
        window.firebaseOnValue = onValue;
        window.firebaseOnDisconnect = onDisconnect;
    </script>
</head>
<body>

    <div id="game-container"></div>

    <div id="loading-screen">
        <h1>Minecraft Mozahid</h1>
        <div class="loader"></div>
        <p>Connecting to server...</p>
    </div>

    <div id="lobby-screen">
        <div class="lobby-content">
            <h1>Mozahid's World</h1>
            <p>Enter your name to join</p>
            <input type="text" id="player-name-input" placeholder="Your Name..." maxlength="15" autocomplete="off">
            <button id="join-btn">PLAY MULTIPLAYER</button>
        </div>
    </div>

    <div id="ui-layer" class="hidden">
        <div id="crosshair">+</div>

        <div id="player-stats">
            <div class="bar-container"><div id="health-bar" class="bar health"></div></div>
            <div class="bar-container"><div id="hunger-bar" class="bar hunger"></div></div>
        </div>

        <div id="multiplayer-info">
            <span id="online-players">Players: 1</span>
        </div>

        <div id="mobile-controls">
            <div id="joystick-zone">
                <div id="joystick-base"><div id="joystick-knob"></div></div>
            </div>

            <div id="action-buttons">
                <button class="action-btn" id="btn-jump">JUMP</button>
                <button class="action-btn" id="btn-mine">MINE</button>
                <button class="action-btn" id="btn-place">PLACE</button>
            </div>
        </div>

        <div id="hotbar">
            <div class="slot active"></div>
            <div class="slot"></div>
            <div class="slot"></div>
            <div class="slot"></div>
            <div class="slot"></div>
        </div>
    </div>

    <!-- JS Link (Bina folder ke) -->
    <script type="module" src="main.js"></script>
</body>
</html>
