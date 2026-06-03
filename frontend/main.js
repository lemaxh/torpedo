// --- 1. 3D JÁTÉKTÉR (Three.js) INICIALIZÁLÁSA ---

const canvasContainer = document.getElementById('canvas-container');
const scene = new THREE.Scene();

// Köd beállítása
scene.fog = new THREE.FogExp2(0x111111, 0.04);

// Kamera
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 10, 15);
camera.lookAt(0, 0, 0);

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x111111);
canvasContainer.appendChild(renderer.domElement);

// Zöld rács
const gridHelper = new THREE.GridHelper(60, 60, 0x00ff00, 0x003300);
scene.add(gridHelper);

// Animációs ciklus
function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}
animate();

// Ablak átméretezés
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});


// --- 2. HÁLÓZATI KOMMUNIKÁCIÓ (Socket.IO) ÉS UI LOGIKA ---

// Csatlakozás a szerveredhez
const socket = io('https://torpedo-xl5u.onrender.com');

// UI Elemek kiválasztása
const logDiv = document.getElementById('radar-log');
const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const roomCodeInput = document.getElementById('roomCodeInput');
const statusDisplay = document.getElementById('status-display');
const lobbyArea = document.getElementById('lobby-area');
const gameArea = document.getElementById('game-area');
const fireBtn = document.getElementById('fireBtn');

function logMessage(msg, type = 'system') {
    const p = document.createElement('p');
    p.innerHTML = msg;
    p.className = type;
    logDiv.prepend(p);
}

// Gombok eseményei
createRoomBtn.addEventListener('click', () => {
    socket.emit('create_room');
});

joinRoomBtn.addEventListener('click', () => {
    const code = roomCodeInput.value.trim().toUpperCase();
    if (code.length > 0) {
        socket.emit('join_room', code);
    }
});

// Szerver válaszok kezelése
socket.on('room_created', (code) => {
    statusDisplay.innerText = `Szoba létrehozva! Kódod: ${code} (Várakozás az ellenfélre...)`;
    createRoomBtn.disabled = true;
    joinRoomBtn.disabled = true;
});

socket.on('room_joined', (code) => {
    statusDisplay.innerText = `Sikeresen csatlakoztál a ${code} szobához!`;
});

socket.on('error_msg', (msg) => {
    alert(`Hiba: ${msg}`);
});

socket.on('game_start', (msg) => {
    logMessage(`[Rendszer] ${msg}`, 'system');
    lobbyArea.style.display = 'none';
    gameArea.style.display = 'block';
});

socket.on('enemy_disconnected', (msg) => {
    logMessage(`⚠️ [Rendszer] ${msg}`, 'enemy');
    gameArea.style.display = 'none';
    statusDisplay.innerText = "Az ellenfél kilépett. Frissítsd az oldalt egy új játékhoz.";
});

// Lövés logika a ködbe
fireBtn.addEventListener('click', () => {
    const shotData = { 
        x: Math.floor(Math.random() * 60) - 30, 
        y: 0, 
        z: Math.floor(Math.random() * -30) - 5 
    };
    socket.emit('shoot', shotData);
    logMessage(`Lövés leadva a ködbe: X:${shotData.x}, Z:${shotData.z}`, '');
});

socket.on('enemy_shot', (data) => {
    logMessage(`⚠️ BEJÖVŐ TALÁLAT! Az ellenfél lőtt: X:${data.x}, Z:${data.z}`, 'enemy');
});
