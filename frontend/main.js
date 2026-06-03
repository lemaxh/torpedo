/** * SORREND:
 * 1. Three.js környezet (grafika)
 * 2. Socket.io inicializálás (hálózat)
 * 3. HTML elemek kiválasztása (UI)
 * 4. Gomb események (logika)
 * 5. Szerver válaszok kezelése
 */

// --- 1. Three.js KÖRNYEZET ---
const canvasContainer = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x111111, 0.04);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 10, 15);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x111111);
canvasContainer.appendChild(renderer.domElement);

const gridHelper = new THREE.GridHelper(60, 60, 0x00ff00, 0x003300);
scene.add(gridHelper);

function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- 2. HÁLÓZAT (Socket.io) ---
const socket = io('https://torpedo-xl5u.onrender.com');

// --- 3. UI ELEMEK ---
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

// --- 4. GOMB ESEMÉNYEK ---
createRoomBtn.addEventListener('click', () => {
    socket.emit('create_room');
});

joinRoomBtn.addEventListener('click', () => {
    const code = roomCodeInput.value.trim().toUpperCase();
    if (code.length > 0) socket.emit('join_room', code);
});

fireBtn.addEventListener('click', () => {
    const shotData = { 
        x: Math.floor(Math.random() * 60) - 30, 
        y: 0, 
        z: Math.floor(Math.random() * -30) - 5 
    };
    socket.emit('shoot', shotData);
    logMessage(`Lövés leadva a ködbe: X:${shotData.x}, Z:${shotData.z}`, '');
});

// --- 5. SZERVER VÁLASZOK ---
socket.on('room_created', (code) => {
    statusDisplay.innerText = `Szoba létrehozva! Kódod: ${code}`;
    createRoomBtn.disabled = true;
    joinRoomBtn.disabled = true;
});

socket.on('room_joined', (code) => {
    statusDisplay.innerText = `Sikeresen csatlakoztál a ${code} szobához!`;
});

socket.on('game_start', (msg) => {
    logMessage(`[Rendszer] ${msg}`, 'system');
    lobbyArea.style.display = 'none';
    gameArea.style.display = 'block';
});

socket.on('enemy_shot', (data) => {
    logMessage(`⚠️ BEJÖVŐ TALÁLAT! Az ellenfél lőtt: X:${data.x}, Z:${data.z}`, 'enemy');
});

socket.on('error_msg', (msg) => alert(`Hiba: ${msg}`));
