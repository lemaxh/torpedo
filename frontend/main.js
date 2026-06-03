/**
 * 1. Three.js KÖRNYEZET
 */
const canvasContainer = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x111111, 0.04);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 15, 20); // Kicsit magasabbra raktuk a kamerát a pakoláshoz
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x111111);
canvasContainer.appendChild(renderer.domElement);

const gridHelper = new THREE.GridHelper(60, 60, 0x00ff00, 0x003300);
scene.add(gridHelper);

// --- ÚJ: RAYCASTER ÉS SZELLEMHAJÓ A PAKOLÁSHOZ ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
// Egy láthatatlan matematikai sík, amivel az egerünk metszéspontját számoljuk (a tenger felszíne)
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); 
const planeIntersect = new THREE.Vector3();

// Szellemhajó (amit mozgatunk)
const ghostGeometry = new THREE.BoxGeometry(1, 1, 4); // Szélesség: 1, Magasság: 1, Hossz: 4
const ghostMaterial = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.5 });
const ghostShip = new THREE.Mesh(ghostGeometry, ghostMaterial);
ghostShip.visible = false; // Kezdetben elrejtjük
scene.add(ghostShip);

let isPlanningPhase = false;
const placedShips = [];
const maxShips = 5;


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

/**
 * 2. HÁLÓZAT (Socket.io) & 3. UI ELEMEK
 */
const socket = io('https://torpedo-xl5u.onrender.com');

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
const fireBtn = document.getElementById('fireBtn');

function logMessage(msg, type = 'system') {
    const p = document.createElement('p');
    p.innerHTML = msg;
    p.className = type;
    logDiv.prepend(p);
}

/**
 * 4. ÚJ: EGÉR ÉS BILLENTYŰZET ESEMÉNYEK A 3D-BEN
 */

// Egér követése
window.addEventListener('mousemove', (event) => {
    if (!isPlanningPhase) return;

    // Egér koordináták konvertálása -1 és +1 közé a Three.js számára
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    // Lézersugár kilövése a kamerából az egér irányába
    raycaster.setFromCamera(mouse, camera);
    
    // Hol metszi a sugár a láthatatlan tengerfelszínt?
    raycaster.ray.intersectPlane(plane, planeIntersect);

    // Szellemhajó pozicionálása (Math.round-al rácsra illesztjük)
    ghostShip.position.x = Math.round(planeIntersect.x);
    ghostShip.position.z = Math.round(planeIntersect.z);
    ghostShip.position.y = 0.5; // Kicsit kiemelkedik a vízből
});

// Hajó lerakása (Kattintás)
window.addEventListener('click', (event) => {
    if (!isPlanningPhase || placedShips.length >= maxShips) return;
    
    // Ne rakjunk le hajót, ha véletlenül a UI panelre kattintunk
    if (event.clientX < 380 && event.clientY < 600) return; 

    // Lemásoljuk a szellemhajót egy igazi, szilárd hajóvá
    const solidMaterial = new THREE.MeshBasicMaterial({ color: 0xaaaaaa, wireframe: false });
    const newShip = new THREE.Mesh(ghostGeometry, solidMaterial);
    
    newShip.position.copy(ghostShip.position);
    newShip.rotation.copy(ghostShip.rotation);
    
    scene.add(newShip);
    
    // Eltároljuk a hajó adatait (Ezt fogjuk később a szervernek küldeni)
    placedShips.push({
        x: newShip.position.x,
        z: newShip.position.z,
        rotationY: newShip.rotation.y
    });

    shipCountSpan.innerText = placedShips.length;
    logMessage(`Hajó lerakva! (Koor: ${newShip.position.x}, ${newShip.position.z})`, 'system');

    // Ha leraktuk mind az 5-öt, engedélyezzük a "Kész" gombot
    if (placedShips.length === maxShips) {
        ghostShip.visible = false;
        readyBtn.disabled = false;
        readyBtn.style.background = "#005500";
        logMessage("Flotta készen áll! Nyomd meg a Kész gombot.", 'system');
    }
});

// Hajó forgatása (45 fokonként - ferde elhelyezés)
window.addEventListener('keydown', (event) => {
    if (!isPlanningPhase) return;
    
    if (event.key === 'r' || event.key === 'R') {
        // Math.PI / 4 = 45 fok radiánban
        ghostShip.rotation.y += Math.PI / 4; 
    }
});


/**
 * 5. LOBBY ÉS HÁLÓZATI GOMBOK
 */
createRoomBtn.addEventListener('click', () => { socket.emit('create_room'); });
joinRoomBtn.addEventListener('click', () => {
    const code = roomCodeInput.value.trim().toUpperCase();
    if (code.length > 0) socket.emit('join_room', code);
});

readyBtn.addEventListener('click', () => {
    isPlanningPhase = false;
    planningArea.style.display = 'none';
    gameArea.style.display = 'block';
    logMessage("Várakozás az ellenfélre / Csatatér aktiválva...", 'system');
    
    // IDE JÖN MAJD AZ ADATKÜLDÉS A SZERVERNEK: socket.emit('ships_ready', placedShips);
});

fireBtn.addEventListener('click', () => {
    // Egyelőre marad a random lövés prototípus
    const shotData = { x: Math.floor(Math.random() * 60) - 30, y: 0, z: Math.floor(Math.random() * -30) - 5 };
    socket.emit('shoot', shotData);
});


/**
 * 6. SZERVER VÁLASZOK
 */
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
    
    // Elindítjuk a tervezési fázist!
    planningArea.style.display = 'block';
    isPlanningPhase = true;
    ghostShip.visible = true; // Megjelenik a szellemhajó az egerünk alatt
});

socket.on('enemy_shot', (data) => {
    logMessage(`⚠️ BEJÖVŐ TALÁLAT: X:${data.x}, Z:${data.z}`, 'enemy');
});

socket.on('error_msg', (msg) => alert(`Hiba: ${msg}`));
