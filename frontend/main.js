/**
 * --- 1. KÖRNYEZET ÉS 3D ALAPOK (Three.js) ---
 */
const canvasContainer = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x111111, 0.04);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 15, 20); // Kamera a pakoláshoz
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x111111);
canvasContainer.appendChild(renderer.domElement);

const gridHelper = new THREE.GridHelper(60, 60, 0x00ff00, 0x003300);
scene.add(gridHelper);

// --- SUGÁRKÖVETŐ (Raycaster) ÉS LÁTHATATLAN SÍK ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // Tengerszint
const planeIntersect = new THREE.Vector3();

// --- 3D OBJEKTUMOK ---
// 1. A Szellemhajó (Tervezési fázishoz)
const ghostGeometry = new THREE.BoxGeometry(1, 1, 4);
const ghostMaterial = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.5 });
const ghostShip = new THREE.Mesh(ghostGeometry, ghostMaterial);
ghostShip.visible = false;
scene.add(ghostShip);

// 2. A Célkereszt (Játék fázishoz)
const targetGeometry = new THREE.RingGeometry(0.4, 0.8, 16);
const targetMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000, side: THREE.DoubleSide });
const targetReticle = new THREE.Mesh(targetGeometry, targetMaterial);
targetReticle.rotation.x = -Math.PI / 2; // Ráfektetve a rácsra
targetReticle.position.y = 0.1; // Kicsit a rács felett
targetReticle.visible = false;
scene.add(targetReticle);

// Játékállapot változók
let isPlanningPhase = false;
let isPlayingPhase = false;
const placedShips = [];
const maxShips = 5;

// Animációs ciklus
function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}
animate();

// Ablak átméretezés lekezelése
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});


/**
 * --- 2. HÁLÓZAT ÉS FELÜLET (Socket.io & UI) ---
 */
const socket = io('https://torpedo-xl5u.onrender.com');

// UI elemek
const logDiv = document.getElementById('radar-log');
const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const roomCodeInput = document.getElementById('roomCodeInput');
const statusDisplay = document.getElementById('status-display');
const lobbyArea = document.getElementById('lobby-area');
const planningArea = document.getElementById('planning-area');
const gameArea = document.getElementById('game-area');
const shipCountSpan = document.getElementById('ship-count');
const readyBtn = document.getElementById('readyBtn');

function logMessage(msg, type = 'system') {
    const p = document.createElement('p');
    p.innerHTML = msg;
    p.className = type;
    logDiv.prepend(p);
}


/**
 * --- 3. JÁTÉKOS INTERAKCIÓK (Egér és Billentyűzet) ---
 */

// Egér mozgatása (Hajó vagy Célkereszt mozgatása)
window.addEventListener('mousemove', (event) => {
    if (!isPlanningPhase && !isPlayingPhase) return;

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    raycaster.ray.intersectPlane(plane, planeIntersect);

    if (isPlanningPhase) {
        ghostShip.position.x = Math.round(planeIntersect.x);
        ghostShip.position.z = Math.round(planeIntersect.z);
        ghostShip.position.y = 0.5;
    } else if (isPlayingPhase) {
        targetReticle.position.x = Math.round(planeIntersect.x);
        targetReticle.position.z = Math.round(planeIntersect.z);
    }
});

// Hajó forgatása (R betű)
window.addEventListener('keydown', (event) => {
    if (isPlanningPhase && (event.key === 'r' || event.key === 'R')) {
        ghostShip.rotation.y += Math.PI / 4; // 45 fokos forgatás
    }
});

// Kattintás (Lerakás vagy Lövés)
window.addEventListener('click', (event) => {
    // Csak akkor csinálunk valamit a 3D-ben, ha magára a vászonra (tengerre) kattintottunk, nem a menüre!
    if (event.target !== renderer.domElement) return;

    if (isPlanningPhase && placedShips.length < maxShips) {
        // Hajó lerakása
        const solidMaterial = new THREE.MeshBasicMaterial({ color: 0xaaaaaa });
        const newShip = new THREE.Mesh(ghostGeometry, solidMaterial);
        newShip.position.copy(ghostShip.position);
        newShip.rotation.copy(ghostShip.rotation);
        scene.add(newShip);
        
        placedShips.push({ x: newShip.position.x, z: newShip.position.z, rotationY: newShip.rotation.y });
        shipCountSpan.innerText = placedShips.length;
        
        // Ha leraktuk az összeset
        if (placedShips.length === maxShips) {
            ghostShip.visible = false;
            readyBtn.disabled = false;
            readyBtn.style.background = "#005500";
        }
    } else if (isPlayingPhase) {
        // Lövés leadása
        const shotData = {
            x: targetReticle.position.x,
            y: 0,
            z: targetReticle.position.z
        };
        socket.emit('shoot', shotData);
        logMessage(`Tűz alá vetted a ${shotData.x}, ${shotData.z} koordinátát!`, 'system');
    }
});


/**
 * --- 4. GOMBOK ÉS HÁLÓZATI ESEMÉNYEK ---
 */
createRoomBtn.addEventListener('click', () => { socket.emit('create_room'); });
joinRoomBtn.addEventListener('click', () => {
    const code = roomCodeInput.value.trim().toUpperCase();
    if (code.length > 0) socket.emit('join_room', code);
});

readyBtn.addEventListener('click', () => {
    isPlanningPhase = false;
    planningArea.style.display = 'none';
    logMessage("Hajók rögzítve! Várakozás az ellenfélre...", 'system');
    
    // Adatküldés a szervernek
    socket.emit('ships_ready', placedShips);
});

// Szerver válaszok
socket.on('room_created', (code) => {
    statusDisplay.innerText = `Szoba: ${code}`;
    createRoomBtn.disabled = true; joinRoomBtn.disabled = true;
});

socket.on('room_joined', (code) => {
    statusDisplay.innerText = `Csatlakozva: ${code}`;
});

socket.on('game_start', (msg) => {
    logMessage(`[Parancsnokság] ${msg}`, 'system');
    lobbyArea.style.display = 'none';
    planningArea.style.display = 'block';
    isPlanningPhase = true;
    ghostShip.visible = true;
});

socket.on('battle_begins', (msg) => {
    logMessage(`🔥 [Parancsnokság] ${msg}`, 'system');
    gameArea.style.display = 'block';
    
    // Fázisváltás lövöldözésre
    isPlayingPhase = true;
    targetReticle.visible = true;
});

socket.on('enemy_shot', (data) => {
    logMessage(`⚠️ BEJÖVŐ TALÁLAT! Az ellenfél lőtt: X:${data.x}, Z:${data.z}`, 'enemy');
});

socket.on('error_msg', (msg) => alert(`Hiba: ${msg}`));
