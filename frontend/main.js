const socket = io('https://torpedo-xl5u.onrender.com');

// UI Elemek
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
    p.className = type; // 'system', 'enemy', vagy alapértelmezett
    logDiv.prepend(p);
}

// --- LOBBY LOGIKA ---

createRoomBtn.addEventListener('click', () => {
    socket.emit('create_room');
});

joinRoomBtn.addEventListener('click', () => {
    const code = roomCodeInput.value.trim().toUpperCase();
    if (code.length > 0) {
        socket.emit('join_room', code);
    }
});

// Szerver válaszok a szobákra
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

// Amikor mindkét játékos bent van
socket.on('game_start', (msg) => {
    logMessage(`[Rendszer] ${msg}`, 'system');
    lobbyArea.style.display = 'none'; // Eltüntetjük a menüt
    gameArea.style.display = 'block'; // Megjelenítjük a tűzgombot
});

// Ha a másik játékos kilép
socket.on('enemy_disconnected', (msg) => {
    logMessage(`⚠️ [Rendszer] ${msg}`, 'enemy');
    gameArea.style.display = 'none';
    statusDisplay.innerText = "Az ellenfél kilépett. Frissítsd az oldalt egy új játékhoz.";
});


// --- JÁTÉK LOGIKA ---

fireBtn.addEventListener('click', () => {
    const shotData = { 
        x: Math.floor(Math.random() * 10), 
        y: 0, 
        z: Math.floor(Math.random() * 10) 
    };
    socket.emit('shoot', shotData);
    logMessage(`Lövés leadva a következő koordinátára: X:${shotData.x}, Z:${shotData.z}`, '');
});

socket.on('enemy_shot', (data) => {
    logMessage(`⚠️ BEJÖVŐ TALÁLAT! Az ellenfél lőtt: X:${data.x}, Z:${data.z}`, 'enemy');
});
