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

const ambientLight = new THREE.AmbientLight(0xffffff, 0.6); 
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8); 
directionalLight.position.set(10, 20, 10);
scene.add(directionalLight);

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); 
const planeIntersect = new THREE.Vector3();

// --- ÚJ: EFFEKTEK TÁROLÓJA ---
const activeEffects = [];

// Ez a függvény hozza létre a robbanást és a rácson maradó jelölőt
function createExplosion(x, z, isHit) {
    // 1. Állandó jelölő (Kocka a rácson)
    const markerGeo = new THREE.BoxGeometry(0.8, 0.8, 0.8);
    const markerMat = new THREE.MeshBasicMaterial({ color: isHit ? 0xff0000 : 0x555555 });
    const marker = new THREE.Mesh(markerGeo, markerMat);
    marker.position.set(x, 0.4, z); // Félig kiáll a rácsból
    scene.add(marker);

    // 2. Táguló lökésgullám (Animált effekt)
    const waveGeo = new THREE.RingGeometry(0.1, 0.5, 32);
    const waveMat = new THREE.MeshBasicMaterial({ 
        color: isHit ? 0xff8800 : 0xaaaaaa, 
        side: THREE.DoubleSide, 
        transparent: true, 
        opacity: 1 
    });
    const wave = new THREE.Mesh(waveGeo, waveMat);
    wave.rotation.x = -Math.PI / 2;
    wave.position.set(x, 0.1, z);
    scene.add(wave);
    
    // Betesszük az aktív effektek közé, hogy az animációs ciklus mozgassa
    activeEffects.push(wave);
}


/**
 * --- 3D MODELLEK EGYEDI BEÁLLÍTÁSAI ---
 */
const loader = new THREE.GLTFLoader();

const shipConfig = [
    { file: '2helyes.glb', scale: 0.10, rotX: Math.PI * (90/180), rotY: 0, rotZ: 0, posX: 0.6, posY: 1.2, posZ: 4.5 },
    { file: '3helyes1.glb', scale: 0.10, rotX: Math.PI * (90/180), rotY: 0, rotZ: 0, posX: 1.3, posY: 1.2, posZ: 2.7 },
    { file: '3helyes2.glb', scale: 0.10, rotX: Math.PI * (90/180), rotY: 0, rotZ: 0, posX: 1.3, posY: 1.2, posZ: -3.4 },
    { file: '4helyes.glb', scale: 0.10, rotX: Math.PI * (90/180), rotY: 0, rotZ: 0, posX: 2.0, posY: 1.2, posZ: -1.8 },
    { file: '5helyes.glb', scale: 0.10, rotX: 0, rotY: 0, rotZ: 0, posX: 2.4, posY: 1.2, posZ: 0.3 }
];

let loadedModels = []; 
let currentShipIndex = 0; 

const ghostShip = new THREE.Group();
ghostShip.visible = false;
scene.add(ghostShip);

Promise.all(shipConfig.map(config => {
    return new Promise((resolve, reject) => {
        loader.load(config.file, (gltf) => {
            const model = gltf.scene;
            
            model.scale.set(config.scale, config.scale, config.scale);
            model.rotation.set(config.rotX, config.rotY, config.rotZ);
            model.position.set(config.posX, config.posY, config.posZ);
            
            model.traverse((child) => {
                if (child.isMesh) {
                    child.material = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.6, metalness: 0.3 });
                }
            });

            const wrapper = new THREE.Group();
            wrapper.add(model);
            resolve(wrapper);
        }, undefined, (error) => {
            console.error('Hiba a modell betöltésekor:', config.file, error);
        });
    });
})).then(models => {
    loadedModels = models;
    console.log("Minden hajómodell sikeresen betöltve a kalibrált értékekkel!");
    updateGhostShip(); 
});

function updateGhostShip() {
    while(ghostShip.children.length > 0){ ghostShip.remove(ghostShip.children[0]); }
    
    if(currentShipIndex < loadedModels.length) {
        const modelClone = loadedModels[currentShipIndex].clone();
        
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
    
    // --- ÚJ: EFFEKTEK ANIMÁLÁSA ---
    for (let i = activeEffects.length - 1; i >= 0; i--) {
        const effect = activeEffects[i];
        
        // Tágulás
        effect.scale.x += 0.1;
        effect.scale.y += 0.1;
        
        // Halványodás
        effect.material.opacity -= 0.02;

        // Ha teljesen elhalványult, kitöröljük a memóriából és a színtérből
        if (effect.material.opacity <= 0) {
            scene.remove(effect);
            activeEffects.splice(i, 1);
        }
    }

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
            id: shipConfig[currentShipIndex].file,
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
        const shotData = { x: targetReticle.position.x, y: 0, z: targetReticle.position.z };
        socket.emit('shoot', shotData);
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

// --- ÚJ: LÖVÉS EREDMÉNYÉNEK FELDOLGOZÁSA ÉS VIZUALIZÁLÁSA ---
socket.on('shot_result', (data) => {
    const isMe = (data.shooter === socket.id);
    
    // Lerendereljük a vizuális effektet
    createExplosion(data.x, data.z, data.hit);

    // Kiírjuk az üzenetet a radarnaplóba
    if (isMe) {
        if (data.hit) {
            logMessage(`🔥 CÉL TALÁLVA! Bumm! (X:${data.x}, Z:${data.z})`, 'system');
        } else {
            logMessage(`💦 Mellé. Csobbanás a tengerben. (X:${data.x}, Z:${data.z})`, 'system');
        }
    } else {
        if (data.hit) {
            logMessage(`⚠️ FIGYELEM! Eltalálták egy hajónkat! (X:${data.x}, Z:${data.z})`, 'enemy');
        } else {
            logMessage(`Közel volt... Az ellenfél mellélőtt. (X:${data.x}, Z:${data.z})`, 'enemy');
        }
    }
});

socket.on('error_msg', (msg) => alert(`Hiba: ${msg}`));
