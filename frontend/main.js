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

// --- ÚJ: FÉNYFORRÁSOK ---
// A szürke modellek megvilágításához elengedhetetlen, különben teljesen sötétek lennének
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6); // Alapvető derítés mindenhonnan
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8); // Fentről jövő "napfény"
directionalLight.position.set(10, 20, 10);
scene.add(directionalLight);

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); 
const planeIntersect = new THREE.Vector3();

/**
 * --- 3D MODELLEK BETÖLTÉSE (GLTFLoader) ---
 */
const loader = new THREE.GLTFLoader();

// Frissített fájlnevek a te listád alapján
const shipFiles = [
    '2helyes.glb',
    '3helyes1.glb',
    '3helyes2.glb',
    '4helyes.glb',
    '5helyes.glb'
];

let loadedModels = []; 
let currentShipIndex = 0; 

// --- MÉRETEZÉS ---
// Itt tudod finomhangolni a méretet (pl. 0.3 még kisebb, 0.8 nagyobb)
const SHIP_SCALE = 0.5; 

const ghostShip = new THREE.Group();
ghostShip.visible = false;
scene.add(ghostShip);

// Modellek letöltése és átszínezése
Promise.all(shipFiles.map(file => {
    return new Promise((resolve, reject) => {
        loader.load(file, (gltf) => {
            const model = gltf.scene;
            
            // Méret beállítása
            model.scale.set(SHIP_SCALE, SHIP_SCALE, SHIP_SCALE);
            
            // --- SZÍN FELÜLÍRÁSA SZÜRKÉRE ---
            model.traverse((child) => {
                if (child.isMesh) {
                    child.material = new THREE.MeshStandardMaterial({ 
                        color: 0x888888, // Egységes szürke
                        roughness: 0.6,  // Kicsit matt felület
                        metalness: 0.3   // Enyhe fémes hatás
                    });
                }
            });

            resolve(model);
        }, undefined, (error) => {
            console.error('Hiba a modell betöltésekor:', file, error);
        });
    });
})).then(models => {
    loadedModels = models;
    console.log("Minden hajómodell sikeresen betöltve és átszínezve!");
    updateGhostShip(); 
});

function updateGhostShip() {
    while(ghostShip.children.length > 0){ 
        ghostShip.remove(ghostShip.children[0]); 
    }
    
    if(currentShipIndex < loadedModels.length) {
        const modelClone = loadedModels[currentShipIndex].clone();
        
        // A szellemhajónál a szürke anyagot áttetsző kékké alakítjuk
        modelClone.traverse((child) => {
            if (child.isMesh) {
                child.material = child.material.clone();
                child.material.transparent = true;
                child.material.opacity = 0.5;
                child.material.color.setHex(0x00ffff);
            }
        });
        
        ghostShip.add(modelClone);
    }
}

// Célkereszt
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
        const solidShip = loadedModels[currentShipIndex].clone();
        solidShip.position.copy(ghostShip.position);
        solidShip.rotation.copy(ghostShip.rotation);
        scene.add(solidShip);
        
        placedShips.push({ 
            id: shipFiles[currentShipIndex],
            x: solidShip.position.x, 
            z: solidShip.position.z, 
            rotationY: solidShip.rotation.y 
        });
        
        currentShipIndex++;
        shipCountSpan.innerText = currentShipIndex;
        
        if (currentShipIndex === maxShips) {
            ghostShip.visible = false;
            readyBtn.disabled = false;
            readyBtn.style.background = "#005500";
        } else {
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
    
    if (loadedModels.length > 0) {
        isPlanningPhase = true;
        ghostShip.visible = true;
    } else {
        logMessage("⚠️ Várj egy picit, a hajómodellek még töltenek...", "system");
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
