/**
 * --- 1. KÖRNYEZET ÉS 3D ALAPOK (Three.js) ---
 */
const canvasContainer = document.getElementById('canvas-container');
const scene = new THREE.Scene();
const clock = new THREE.Clock();

const ownFleetGroup = new THREE.Group();
const enemyWatersGroup = new THREE.Group();
scene.add(ownFleetGroup);
scene.add(enemyWatersGroup);

scene.fog = new THREE.FogExp2(0x111111, 0.04);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 15, 15); 
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x111111);
canvasContainer.appendChild(renderer.domElement);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
controls.enableDamping = true; 

const gridHelper = new THREE.GridHelper(20, 20, 0x00ff00, 0x003300);
gridHelper.position.y = 0.01; 
scene.add(gridHelper);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.6); 
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8); 
directionalLight.position.set(10, 20, 10);
scene.add(directionalLight);

const waterNormals = new THREE.TextureLoader().load('https://raw.githubusercontent.com/mrdoob/three.js/r128/examples/textures/waternormals.jpg');
waterNormals.wrapS = waterNormals.wrapT = THREE.RepeatWrapping;

const waterGeometry = new THREE.PlaneGeometry(1000, 1000);
const water = new THREE.Water(
    waterGeometry,
    {
        textureWidth: 512,
        textureHeight: 512,
        waterNormals: waterNormals,
        sunDirection: directionalLight.position.clone().normalize(),
        sunColor: 0xffffff,
        waterColor: 0x001e0f, 
        distortionScale: 8.0, 
        fog: scene.fog !== undefined
    }
);
water.rotation.x = -Math.PI / 2;
water.position.y = -0.05; 
scene.add(water);

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); 
const planeIntersect = new THREE.Vector3();

/**
 * --- EFFEKTEK ÉS RÉSZECSKERENDSZER ---
 */
const particlesArray = []; 

function createCinematicExplosion(x, z, isHit) {
    const particleCount = isHit ? 250 : 120; 
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const velocities = [];
    const colors = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
        positions[i * 3] = x;
        positions[i * 3 + 1] = 0.2; 
        positions[i * 3 + 2] = z;

        let vx, vy, vz, color;

        if (isHit) {
            vx = (Math.random() - 0.5) * 0.4;
            vy = (Math.random() * 0.5) + 0.1;
            vz = (Math.random() - 0.5) * 0.4;
            
            const isSmoke = Math.random() > 0.5;
            color = isSmoke ? new THREE.Color(0x222222) : new THREE.Color(Math.random() > 0.5 ? 0xff4400 : 0xffaa00);
        } else {
            vx = (Math.random() - 0.5) * 0.15; 
            vy = (Math.random() * 0.8) + 0.2;  
            vz = (Math.random() - 0.5) * 0.15;
            color = new THREE.Color(0xaaaaaa).lerp(new THREE.Color(0xffffff), Math.random());
        }

        velocities.push({ x: vx, y: vy, z: vz });
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
        size: isHit ? 0.25 : 0.15,
        vertexColors: true,
        transparent: true,
        opacity: 1.0,
        blending: THREE.NormalBlending 
    });

    const particleSystem = new THREE.Points(geometry, material);
    enemyWatersGroup.add(particleSystem); 

    const decayRate = isHit ? 0.008 : 0.02;
    particlesArray.push({ system: particleSystem, velocities: velocities, life: 1.0, decay: decayRate });
}

function createGridMarker(x, z, isHit) {
    const planeGeo = new THREE.PlaneGeometry(1, 1);
    const planeMat = new THREE.MeshBasicMaterial({ 
        color: isHit ? 0xff0000 : 0x444444, 
        transparent: true, opacity: 0.6, side: THREE.DoubleSide
    });
    const marker = new THREE.Mesh(planeGeo, planeMat);
    marker.rotation.x = -Math.PI / 2;
    marker.position.set(x, 0.05, z); 
    ownFleetGroup.add(marker);
}

/**
 * --- 3D MODELLEK ÉS ÜTKÖZÉSVIZSGÁLAT ---
 */
const loader = new THREE.GLTFLoader();

const shipConfig = [
    { file: '2helyes.glb', length: 2, scale: 0.10, rotX: Math.PI * (90/180), rotY: 0, rotZ: Math.PI * (90/180), posX: -3.95, posY: 1.20, posZ: -0.40 },
    { file: '3helyes1.glb', length: 3, scale: 0.10, rotX: Math.PI * (90/180), rotY: 0, rotZ: Math.PI * (90/180), posX: -2.15, posY: 1.20, posZ: -0.20 },
    { file: '3helyes2.glb', length: 3, scale: 0.10, rotX: Math.PI * (90/180), rotY: 0, rotZ: Math.PI * (90/180), posX: 3.95, posY: 1.20, posZ: -0.20 },
    { file: '4helyes.glb', length: 4, scale: 0.10, rotX: Math.PI * (90/180), rotY: 0, rotZ: Math.PI * (90/180), posX: 2.35, posY: 1.20, posZ: 0.00 },
    { file: '5helyes.glb', length: 5, scale: 0.10, rotX: 0, rotY: Math.PI * (90/180), rotZ: 0, posX: -0.25, posY: 1.20, posZ: 0.10 }
];

let loadedModels = []; 
let currentShipIndex = 0; 
let canPlaceCurrentShip = true; 

const ghostShip = new THREE.Group();
ghostShip.visible = false;
scene.add(ghostShip); 

function getAABB(x, z, rotY, length) {
    let width = 1;
    let isRotated = Math.abs(rotY % Math.PI) > 0.1; 
    let shrink = 0.1; 
    if (isRotated) return { minX: x - length/2 + shrink, maxX: x + length/2 - shrink, minZ: z - width/2 + shrink, maxZ: z + width/2 - shrink };
    else return { minX: x - width/2 + shrink, maxX: x + width/2 - shrink, minZ: z - length/2 + shrink, maxZ: z + length/2 - shrink };
}

function checkOverlap(newX, newZ, newRotY, newLength) {
    const box1 = getAABB(newX, newZ, newRotY, newLength);
    for (let ship of placedShips) {
        const box2 = getAABB(ship.x, ship.z, ship.rotationY, ship.length);
        if (!(box1.maxX <= box2.minX || box1.minX >= box2.maxX || box1.maxZ <= box2.minZ || box1.minZ >= box2.maxZ)) return true; 
    }
    return false; 
}

Promise.all(shipConfig.map(config => {
    return new Promise((resolve) => {
        loader.load(config.file, (gltf) => {
            const model = gltf.scene;
            model.scale.set(config.scale, config.scale, config.scale);
            model.rotation.set(config.rotX, config.rotY, config.rotZ);
            model.position.set(config.posX, config.posY, config.posZ);
            
            model.traverse((child) => {
                if (child.isMesh) child.material = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.6, metalness: 0.3 });
            });
            const wrapper = new THREE.Group();
            wrapper.add(model);
            resolve(wrapper);
        });
    });
})).then(models => {
    loadedModels = models;
    updateGhostShip(); 
});

function updateGhostShip() {
    while(ghostShip.children.length > 0) ghostShip.remove(ghostShip.children[0]); 
    if(currentShipIndex < loadedModels.length) {
        const modelClone = loadedModels[currentShipIndex].clone();
        modelClone.traverse((child) => {
            if (child.isMesh) {
                child.material = child.material.clone();
                child.material.transparent = true;
                child.material.opacity = 0.6;
                child.material.color.setHex(0x00ffff); 
            }
        });
        ghostShip.add(modelClone);
    }
}

const targetGeometry = new THREE.RingGeometry(0.3, 0.5, 16);
const targetMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000, side: THREE.DoubleSide });
const targetReticle = new THREE.Mesh(targetGeometry, targetMaterial);
targetReticle.rotation.x = -Math.PI / 2; 
targetReticle.position.y = 0.1; 
targetReticle.visible = false;
enemyWatersGroup.add(targetReticle); 

let isPlanningPhase = false;
let isPlayingPhase = false;
let isMyTurn = false; 
const placedShips = [];
const maxShips = 5;
const myShotsOnRadar = {}; 

// --- ANIMÁCIÓS CIKLUS ---
function animate() {
    requestAnimationFrame(animate);
    controls.update(); 
    
    const delta = clock.getDelta();

    if (water !== undefined && water.material.uniforms !== undefined) {
        water.material.uniforms['time'].value += delta; 
    }

    for (let i = particlesArray.length - 1; i >= 0; i--) {
        let pObj = particlesArray[i];
        let positions = pObj.system.geometry.attributes.position.array;

        pObj.life -= pObj.decay; 
        pObj.system.material.opacity = pObj.life;

        for (let j = 0; j < pObj.velocities.length; j++) {
            pObj.velocities[j].y -= 0.005; 
            
            positions[j * 3] += pObj.velocities[j].x;
            positions[j * 3 + 1] += pObj.velocities[j].y;
            positions[j * 3 + 2] += pObj.velocities[j].z;
            
            if (positions[j * 3 + 1] < 0) {
                positions[j * 3 + 1] = 0;
                pObj.velocities[j].x *= 0.8; 
                pObj.velocities[j].z *= 0.8;
            }
        }
        
        pObj.system.geometry.attributes.position.needsUpdate = true;

        if (pObj.life <= 0) {
            enemyWatersGroup.remove(pObj.system);
            pObj.system.geometry.dispose();
            pObj.system.material.dispose();
            particlesArray.splice(i, 1);
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
const turnIndicator = document.getElementById('turn-indicator');

// Belső nézetváltó funkció (A GOMBOKTÓL FÜGGETLENÜL MEGHAGYVA, mert az animáció ezt hívja)
function switchView(view) {
    if (view === 'defensive') {
        scene.fog = new THREE.FogExp2(0x111111, 0.04);
        renderer.setClearColor(0x111111);
        ownFleetGroup.visible = true;
        enemyWatersGroup.visible = false;
    } else if (view === 'offensive') {
        scene.fog = new THREE.FogExp2(0xdddddd, 0.06); 
        renderer.setClearColor(0xdddddd);
        ownFleetGroup.visible = false;
        enemyWatersGroup.visible = true;
    }
}

function logMessage(msg, type = 'system') {
    const p = document.createElement('p');
    p.innerHTML = msg; p.className = type; logDiv.prepend(p);
}

/**
 * --- ZSEBRADAR LOGIKA (KAPCSOLÓ ÉS GENERÁLÁS) ---
 */
const pocketRadar = document.getElementById('pocket-radar');
const radarHandle = document.getElementById('radar-handle');

function updateRadarHandleText() {
    if (pocketRadar.classList.contains('open')) {
        radarHandle.innerText = isMyTurn ? "📡 Taktikai Radar (Kattints a bezáráshoz)" : "📡 Radar (Ellenfél köre - Bezárás)";
        buildRadarGrid(); 
    } else {
        radarHandle.innerText = isMyTurn ? "📡 Taktikai Radar (Kattints a nyitáshoz)" : "📡 Radar (Ellenfél köre - Megtekintés)";
    }
}

radarHandle.addEventListener('click', () => {
    pocketRadar.classList.toggle('open');
    updateRadarHandleText();
});

function buildRadarGrid() {
    const radarGrid = document.getElementById('radar-grid');
    radarGrid.innerHTML = '';
    for (let z = -10; z < 10; z++) {
        for (let x = -10; x < 10; x++) {
            const cell = document.createElement('div');
            cell.className = 'radar-cell';
            const snappedX = x + 0.5;
            const snappedZ = z + 0.5;
            
            const cellKey = `${snappedX},${snappedZ}`;
            if (myShotsOnRadar[cellKey] === 'hit') cell.classList.add('hit');
            else if (myShotsOnRadar[cellKey] === 'miss') cell.classList.add('miss');

            cell.addEventListener('click', () => {
                // Biztonsági blokk: Csak a saját körödben lőhetsz (már hibaüzenet nélkül, némán letiltva)
                if (!isMyTurn) return; 
                if (myShotsOnRadar[cellKey]) return; 

                // Lövés elküldése
                socket.emit('shoot', { x: snappedX, z: snappedZ });
                
                // Radar visszacsukása automatikusan
                pocketRadar.classList.remove('open');
                updateRadarHandleText();
            });
            radarGrid.appendChild(cell);
        }
    }
}

/**
 * --- GAME OVER GOMBOK ---
 */
document.getElementById('rematchBtn').addEventListener('click', () => {
    window.location.reload(); // A legtisztább megoldás az új körhöz: frissíti az oldalt
});
document.getElementById('exitBtn').addEventListener('click', () => {
    // Üres képernyőt hagyunk vissza, mintha kilépett volna a játékból
    document.body.innerHTML = "<h1 style='text-align:center; margin-top:20%; color:#0f0;'>Sikeresen kiléptél a Parancsnokságról.</h1>";
});

/**
 * --- 3. JÁTÉKOS INTERAKCIÓK (Egér pakolás) ---
 */
window.addEventListener('mousemove', (event) => {
    if (!isPlanningPhase) return;
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.ray.intersectPlane(plane, planeIntersect);
    if (!intersects) return; 

    const snappedX = Math.floor(planeIntersect.x) + 0.5;
    const snappedZ = Math.floor(planeIntersect.z) + 0.5;
    const isOutOfBounds = Math.abs(snappedX) > 10 || Math.abs(snappedZ) > 10;

    if (currentShipIndex < maxShips) {
        ghostShip.position.x = snappedX; ghostShip.position.z = snappedZ; ghostShip.position.y = 0; 
        const length = shipConfig[currentShipIndex].length;
        canPlaceCurrentShip = !checkOverlap(snappedX, snappedZ, ghostShip.rotation.y, length) && !isOutOfBounds;

        ghostShip.traverse((child) => {
            if (child.isMesh) child.material.color.setHex(canPlaceCurrentShip ? 0x00ffff : 0xff0000);
        });
    }
});

window.addEventListener('keydown', (event) => {
    if (isPlanningPhase && (event.key === 'r' || event.key === 'R')) {
        ghostShip.rotation.y += Math.PI / 2; 
        const snappedX = ghostShip.position.x; const snappedZ = ghostShip.position.z;
        const length = shipConfig[currentShipIndex].length;
        const isOutOfBounds = Math.abs(snappedX) > 10 || Math.abs(snappedZ) > 10;
        canPlaceCurrentShip = !checkOverlap(snappedX, snappedZ, ghostShip.rotation.y, length) && !isOutOfBounds;
        
        ghostShip.traverse((child) => {
            if (child.isMesh) child.material.color.setHex(canPlaceCurrentShip ? 0x00ffff : 0xff0000);
        });
    }
});

window.addEventListener('click', (event) => {
    if (event.target !== renderer.domElement) return;

    if (isPlanningPhase && currentShipIndex < maxShips) {
        if (!canPlaceCurrentShip) { logMessage("❌ Érvénytelen pozíció!", "enemy"); return; }

        const solidShip = loadedModels[currentShipIndex].clone();
        solidShip.position.copy(ghostShip.position);
        solidShip.rotation.copy(ghostShip.rotation);
        ownFleetGroup.add(solidShip);
        
        placedShips.push({ 
            id: shipConfig[currentShipIndex].file, length: shipConfig[currentShipIndex].length, hp: shipConfig[currentShipIndex].length,
            x: solidShip.position.x, z: solidShip.position.z, rotationY: solidShip.rotation.y 
        });
        
        currentShipIndex++; shipCountSpan.innerText = currentShipIndex;
        
        if (currentShipIndex === maxShips) {
            ghostShip.visible = false; readyBtn.disabled = false; readyBtn.style.background = "#005500";
        } else {
            updateGhostShip();
        }
    }
});

/**
 * --- 4. HÁLÓZATI ESEMÉNYEK ---
 */
/**
 * --- 4. HÁLÓZATI ESEMÉNYEK (ÉS SZERVER KAPCSOLAT) ---
 */

// ALAPÉRTELMEZETT: Gombok letiltása, amíg nincs kapcsolat
createRoomBtn.disabled = true;
joinRoomBtn.disabled = true;
statusDisplay.innerText = "⏳ Szerver ébresztése... (Akár 30-50 mp is lehet)";
statusDisplay.style.color = "orange";

// HA SIKERESEN CSATLAKOZOTT A SOCKET.IO
socket.on('connect', () => {
    statusDisplay.innerText = "✅ Szerver elérhető! Készen áll a parancsokra.";
    statusDisplay.style.color = "#0f0";
    createRoomBtn.disabled = false;
    joinRoomBtn.disabled = false;
});

// HA MEGSZAKAD A KAPCSOLAT
socket.on('disconnect', () => {
    statusDisplay.innerText = "❌ Kapcsolat megszakadt a szerverrel!";
    statusDisplay.style.color = "red";
    createRoomBtn.disabled = true;
    joinRoomBtn.disabled = true;
});

createRoomBtn.addEventListener('click', () => { 
    socket.emit('create_room'); 
});

joinRoomBtn.addEventListener('click', () => {
    const code = roomCodeInput.value.trim().toUpperCase();
    if (code.length > 0) socket.emit('join_room', code);
});
readyBtn.addEventListener('click', () => {
    isPlanningPhase = false; planningArea.style.display = 'none';
    logMessage("Hajók rögzítve! Várakozás az ellenfélre...", 'system');
    socket.emit('ships_ready', placedShips);
});

socket.on('room_created', (code) => { statusDisplay.innerText = `Szoba: ${code}`; createRoomBtn.disabled = true; joinRoomBtn.disabled = true; });
socket.on('room_joined', (code) => { statusDisplay.innerText = `Csatlakozva: ${code}`; });
socket.on('game_start', (msg) => {
    logMessage(`[Parancsnokság] ${msg}`, 'system');
    lobbyArea.style.display = 'none'; planningArea.style.display = 'block';
    switchView('defensive');
    if (loadedModels.length > 0) { isPlanningPhase = true; ghostShip.visible = true; }
});

socket.on('battle_begins', (msg) => {
    logMessage(`🔥 [Parancsnokság] ${msg}`, 'system');
    gameArea.style.display = 'block'; isPlayingPhase = true;
});

// KÖR FRISSÍTÉSE: Vizuális Zöld/Piros módosítók a radaron
socket.on('turn_update', (activePlayerId) => {
    isMyTurn = (activePlayerId === socket.id);
    
    if (isMyTurn) {
        turnIndicator.className = 'turn-status my-turn';
        turnIndicator.innerText = "🟢 TE JÖSSZ! Tűzparancs engedélyezve.";
        if (pocketRadar) pocketRadar.classList.remove('disabled');
    } else {
        turnIndicator.className = 'turn-status enemy-turn';
        turnIndicator.innerText = "🔴 ELLENFÉL KÖRE... Készülj a becsapódásra!";
        if (pocketRadar) pocketRadar.classList.add('disabled');
    }
    updateRadarHandleText();
});

socket.on('shot_result', (data) => {
    const isMe = (data.shooter === socket.id);
    
    if (isMe) {
        myShotsOnRadar[`${data.x},${data.z}`] = data.hit ? 'hit' : 'miss';
        
        switchView('offensive'); 
        targetReticle.position.set(data.x, 0.1, data.z); targetReticle.visible = true;
        
        createCinematicExplosion(data.x, data.z, data.hit);
        if (data.hit) logMessage(`🔥 CÉL TALÁLVA! Bumm! (X:${data.x}, Z:${data.z})`, 'hit');
        else logMessage(`💦 Mellé. Csobbanás a tengerben. (X:${data.x}, Z:${data.z})`, 'system');
        if (data.sunk) logMessage(`☠️ TALÁLT, SÜLLYEDT! Egy ellenséges hajó megsemmisült!`, 'hit');

        setTimeout(() => { switchView('defensive'); targetReticle.visible = false; }, 3000);

    } else {
        createGridMarker(data.x, data.z, data.hit);
        if (data.hit) logMessage(`⚠️ FIGYELEM! Eltalálták egy hajónkat! (X:${data.x}, Z:${data.z})`, 'enemy');
        else logMessage(`Közel volt... Az ellenfél mellélőtt. (X:${data.x}, Z:${data.z})`, 'system');
        if (data.sunk) logMessage(`🚨 KATASZTRÓFA! Elvesztettünk egy hajót!`, 'enemy');
    }

    // GAME OVER LEKEZELÉS (Késleltetve, hogy a mozis nézet befejeződhessen)
    if (data.gameOver) {
        isPlayingPhase = false;
        isMyTurn = false;
        if (pocketRadar) pocketRadar.classList.add('disabled');

        const delay = isMe ? 3500 : 1000; // Ha én lőttem, megvárjuk amíg a kamera visszatér
        
        setTimeout(() => {
            const modal = document.getElementById('game-over-modal');
            const title = document.getElementById('game-over-title');
            const msg = document.getElementById('game-over-message');
            
            modal.style.display = 'block';
            
            if (isMe) {
                turnIndicator.className = 'turn-status my-turn'; turnIndicator.innerText = "🏆 GYŐZELEM!";
                modal.className = 'victory'; title.innerText = "🏆 GYŐZELEM!"; title.style.color = "#0ff";
                msg.innerText = "Gratulálok Parancsnok, az ellenséges flotta megsemmisült!";
            } else {
                turnIndicator.className = 'turn-status enemy-turn'; turnIndicator.innerText = "💀 VERESÉG...";
                modal.className = 'defeat'; title.innerText = "💀 VERESÉG!"; title.style.color = "#f55";
                msg.innerText = "Sajnálom Parancsnok, a flottánk odaveszett.";
            }
        }, delay);
    }
});

socket.on('enemy_disconnected', (msg) => {
    logMessage(`🔌 ${msg}`, 'enemy');
    alert("Az ellenfél feladta/kilépett a játékból.");
});

socket.on('error_msg', (msg) => alert(`Hiba: ${msg}`));
