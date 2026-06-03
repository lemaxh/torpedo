/**
 * --- 1. KÖRNYEZET ÉS 3D ALAPOK (Three.js) ---
 */
const canvasContainer = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x111111, 0.04);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 15, 20); 
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x111111);
canvasContainer.appendChild(renderer.domElement);

const gridHelper = new THREE.GridHelper(60, 60, 0x00ff00, 0x003300);
scene.add(gridHelper);

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); 
const planeIntersect = new THREE.Vector3();

// --- 3D MODELLEK BETÖLTÉSE (GLTFLoader) ---
const loader = new THREE.GLTFLoader();

// Itt adjuk meg a fájljaid pontos nevét a megfelelő sorrendben
const shipFiles = [
    '2helyes.glb',
    '3helyes1.glb',
    '3helyes2.glb',
    '4helyes.glb',
    '5helyes_lenti.glb'
];

let loadedModels = []; // Ide mentjük a betöltött, szilárd modelleket
let currentShipIndex = 0; // Melyik hajót pakoljuk éppen?
const SHIP_SCALE = 1.0; // Állítsd át (pl. 0.5 vagy 2.0), ha a modellek mérete nem jó

// A Szellemhajó most már egy üres "tároló" (Group), amibe mindig beletesszük az aktuális 3D modellt
const ghostShip = new THREE.Group();
ghostShip.visible = false;
scene.add(ghostShip);

// Betöltjük a hajókat a háttérben
Promise.all(shipFiles.map(file => {
    return new Promise((resolve, reject) => {
        loader.load(file, (gltf) => {
            const model = gltf.scene;
            model.scale.set(SHIP_SCALE, SHIP_SCALE, SHIP_SCALE);
            resolve(model);
        }, undefined, (error) => {
            console.error('Hiba a modell betöltésekor:', file, error);
        });
    });
})).then(models => {
    loadedModels = models;
    console.log("Minden hajómodell sikeresen betöltve!");
    updateGhostShip(); // Beállítjuk az első hajót az egérhez
});

// Ez a függvény cseréli a szellemhajót a következő modellre
function updateGhostShip() {
    // Kitöröljük az előző szellemhajót a tárolóból
    while(ghostShip.children.length > 0){ 
        ghostShip.remove(ghostShip.children[0]); 
    }
    
    if(currentShipIndex < loadedModels.length) {
        // Lemásoljuk a betöltött szilárd modellt
        const modelClone = loadedModels[currentShipIndex].clone();
        
        // Végigmegyünk a modell részein, és áttetszővé (szellemmé) tesszük őket
        modelClone.traverse((child) => {
            if (child.isMesh) {
                child.material = child.material.clone(); // Klónozzuk, hogy ne rontsuk el az eredetit
                child.material.transparent = true;
                child.material.opacity = 0.5;
                child.material.color.setHex(0x00ffff); // Kékes neon szín a tervezéshez
            }
        });
        
        ghostShip.add(modelClone);
    }
}

// Célkereszt (Játék fázishoz)
const targetGeometry = new THREE.RingGeometry(0.4, 0.8, 16);
const targetMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000, side: THREE.DoubleSide });
const targetReticle = new THREE.Mesh(targetGeometry, targetMaterial);
targetReticle.rotation.x = -Math.PI / 2; 
targetReticle.position.y = 0.1; 
targetReticle.visible = false;
scene.add(targetReticle);

let isPlanningPhase = false;
let isPlayingPhase = false;
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
 * --- 2. HÁLÓZAT ÉS FELÜLET (Socket.io & UI) ---
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

function logMessage(msg, type = 'system') {
    const p = document.createElement('p');
    p.innerHTML = msg;
    p.className = type;
    logDiv.prepend(p);
}


/**
 * --- 3. JÁTÉKOS INTERAKCIÓK (Egér és Billentyűzet) ---
 */
window.addEventListener('mousemove', (event) => {
    if (!isPlanningPhase && !isPlayingPhase) return;

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    raycaster.ray.intersectPlane(plane, planeIntersect);

    if (isPlanningPhase) {
        ghostShip.position.x = Math.round(planeIntersect.x);
        ghostShip.position.z = Math.round(planeIntersect.z);
        // Ha a modell origója a közepén van, esetleg feljebb kell emelni. 
        // Most maradjunk a nulla szintnél.
        ghostShip.position.y = 0; 
    } else if (isPlayingPhase) {
        targetReticle.position.x = Math.round(planeIntersect.x);
        targetReticle.position.z = Math.round(planeIntersect.z);
    }
});

window.addEventListener('keydown', (event) => {
    if (isPlanningPhase && (event.key === 'r' || event.key === 'R')) {
        ghostShip.rotation.y += Math.PI / 4; 
    }
});

window.addEventListener('click', (event) => {
    if (event.target !== renderer.domElement) return;

    if (isPlanningPhase && currentShipIndex < maxShips) {
        // 1. Lemásoljuk és lerakjuk az eredeti, SZILÁRD textúrájú modellt
        const solidShip = loadedModels[currentShipIndex].clone();
        solidShip.position.copy(ghostShip.position);
        solidShip.rotation.copy(ghostShip.rotation);
        scene.add(solidShip);
        
        // 2. Elmentjük az adatokat a szerver számára
        placedShips.push({ 
            id: shipFiles[currentShipIndex],
            x: solidShip.position.x, 
            z: solidShip.position.z, 
            rotationY: solidShip.rotation.y 
        });
        
        // 3. Lépünk a következő hajóra
        currentShipIndex++;
        shipCountSpan.innerText = currentShipIndex;
        
        if (currentShipIndex === maxShips) {
            ghostShip.visible = false;
            readyBtn.disabled = false;
            readyBtn.style.background = "#005500";
        } else {
            // Betöltjük a következő hajó szellemképét
            updateGhostShip();
        }
    } else if (isPlayingPhase) {
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
    socket.emit('ships_ready', placedShips);
});

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
    
    // Csak akkor indítjuk a pakolást, ha a hajók már betöltöttek
    if (loadedModels.length > 0) {
        isPlanningPhase = true;
        ghostShip.visible = true;
    } else {
        logMessage("⚠️ Várj egy picit, a hajómodellek még töltenek...", "system");
        // Egy kis időzítő, ami megvárja a betöltést
        const waitInterval = setInterval(() => {
            if (loadedModels.length > 0) {
                clearInterval(waitInterval);
                isPlanningPhase = true;
                ghostShip.visible = true;
                logMessage("Hajómodellek betöltve! Indulhat a pakolás.", "system");
            }
        }, 500);
    }
});

socket.on('battle_begins', (msg) => {
    logMessage(`🔥 [Parancsnokság] ${msg}`, 'system');
    gameArea.style.display = 'block';
    isPlayingPhase = true;
    targetReticle.visible = true;
});

socket.on('enemy_shot', (data) => {
    logMessage(`⚠️ BEJÖVŐ TALÁLAT! Az ellenfél lőtt: X:${data.x}, Z:${data.z}`, 'enemy');
});

socket.on('error_msg', (msg) => alert(`Hiba: ${msg}`));
