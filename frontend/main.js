/**
 * --- 1. KÖRNYEZET ÉS 3D ALAPOK (Three.js) ---
 */
const canvasContainer = document.getElementById('canvas-container');
const scene = new THREE.Scene();

const ownFleetGroup = new THREE.Group();
const enemyWatersGroup = new THREE.Group();
scene.add(ownFleetGroup);
scene.add(enemyWatersGroup);

// Alapértelmezett sötét köd
scene.fog = new THREE.FogExp2(0x111111, 0.04);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 15, 20); 
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x111111);
canvasContainer.appendChild(renderer.domElement);

// Rács a pakoláshoz
const gridHelper = new THREE.GridHelper(60, 60, 0x00ff00, 0x003300);
gridHelper.position.y = 0.01; // Épphogy a víz felett
scene.add(gridHelper);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.6); 
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8); 
directionalLight.position.set(10, 20, 10);
scene.add(directionalLight);

// --- ÚJ: REALISZTIKUS VÍZ SZIMULÁCIÓ ---
const waterGeometry = new THREE.PlaneGeometry(1000, 1000);
const water = new THREE.Water(
    waterGeometry,
    {
        textureWidth: 512,
        textureHeight: 512,
        // Egy hivatalos víz-textúrát töltünk be a webről a hullámzáshoz
        waterNormals: new THREE.TextureLoader().load('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/waternormals.jpg', function (texture) {
            texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        }),
        sunDirection: directionalLight.position.clone().normalize(),
        sunColor: 0xffffff,
        waterColor: 0x001e0f, // Mélykék, óceános szín
        distortionScale: 3.7,
        fog: scene.fog !== undefined
    }
);
water.rotation.x = -Math.PI / 2;
scene.add(water);


const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); 
const planeIntersect = new THREE.Vector3();

/**
 * --- EFFEKTEK: ÁTLÁTSZÓ KOCKÁK (SAJÁT NÉZET) ÉS FÜST (TÁMADÓ NÉZET) ---
 */
function createGridMarker(x, z, isHit) {
    const planeGeo = new THREE.PlaneGeometry(1, 1);
    const planeMat = new THREE.MeshBasicMaterial({ 
        color: isHit ? 0xff8800 : 0x888888, 
        transparent: true, 
        opacity: 0.6,
        side: THREE.DoubleSide
    });
    const marker = new THREE.Mesh(planeGeo, planeMat);
    marker.rotation.x = -Math.PI / 2;
    marker.position.set(x, 0.05, z); 
    ownFleetGroup.add(marker);
}

function createFogExplosion(x, z, isHit) {
    const markerGeo = new THREE.BoxGeometry(0.8, 0.8, 0.8);
    const markerMat = new THREE.MeshBasicMaterial({ color: isHit ? 0xff4400 : 0x555555 });
    const marker = new THREE.Mesh(markerGeo, markerMat);
    marker.position.set(x, 0.4, z); 
    enemyWatersGroup.add(marker);
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

    if (isRotated) { 
        return { minX: x - length/2 + shrink, maxX: x + length/2 - shrink, minZ: z - width/2 + shrink, maxZ: z + width/2 - shrink };
    } else { 
        return { minX: x - width/2 + shrink, maxX: x + width/2 - shrink, minZ: z - length/2 + shrink, maxZ: z + length/2 - shrink };
    }
}

function checkOverlap(newX, newZ, newRotY, newLength) {
    const box1 = getAABB(newX, newZ, newRotY, newLength);
    for (let ship of placedShips) {
        const box2 = getAABB(ship.x, ship.z, ship.rotationY, ship.length);
        if (!(box1.maxX <= box2.minX || box1.minX >= box2.maxX || box1.maxZ <= box2.minZ || box1.minZ >= box2.maxZ)) {
            return true; 
        }
    }
    return false; 
}


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
        }, undefined, (error) => console.error('Hiba a modell betöltésekor:', config.file, error));
    });
})).then(models => {
    loadedModels = models;
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
                child.material.opacity = 0.6;
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
enemyWatersGroup.add(targetReticle); 

let isPlanningPhase = false;
let isPlayingPhase = false;
let currentView = 'defensive';
const placedShips = [];
const maxShips = 5;

// Animációs ciklus
function animate() {
    requestAnimationFrame(animate);
    
    // Hullámzó víz animálása
    water.material.uniforms['time'].value += 1.0 / 60.0;
    
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
const viewControls = document.getElementById('view-controls');

function logMessage(msg, type = 'system') {
    const p = document.createElement('p');
    p.innerHTML = msg;
    p.className = type;
    logDiv.prepend(p);
}

// --- NÉZETVÁLTÁS LOGIKÁJA ---
function switchView(view) {
    currentView = view;
    if (view === 'defensive') {
        scene.fog = new THREE.FogExp2(0x111111, 0.04);
        renderer.setClearColor(0x111111);
        ownFleetGroup.visible = true;
        enemyWatersGroup.visible = false;
        logMessage("👁️ Váltás: Saját Flotta", "system");
    } else if (view === 'offensive') {
        scene.fog = new THREE.FogExp2(0xeeeeee, 0.08);
        renderer.setClearColor(0xeeeeee);
        ownFleetGroup.visible = false;
        enemyWatersGroup.visible = true;
        logMessage("👁️ Váltás: Ellenséges Vizek (Célzás engedélyezve)", "system");
    }
}

document.getElementById('viewDefensiveBtn').addEventListener('click', () => switchView('defensive'));
document.getElementById('viewOffensiveBtn').addEventListener('click', () => switchView('offensive'));


/**
 * --- 3. JÁTÉKOS INTERAKCIÓK (Egér és Billentyűzet) ---
 */
window.addEventListener('mousemove', (event) => {
    if (!isPlanningPhase && !isPlayingPhase) return;

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    raycaster.ray.intersectPlane(plane, planeIntersect);

    const snappedX = Math.floor(planeIntersect.x) + 0.5;
    const snappedZ = Math.floor(planeIntersect.z) + 0.5;

    if (isPlanningPhase && currentShipIndex < maxShips) {
        ghostShip.position.x = snappedX;
        ghostShip.position.z = snappedZ;
        ghostShip.position.y = 0; 

        const length = shipConfig[currentShipIndex].length;
        const isOverlapping = checkOverlap(snappedX, snappedZ, ghostShip.rotation.y, length);
        
        canPlaceCurrentShip = !isOverlapping;

        ghostShip.traverse((child) => {
            if (child.isMesh) {
                child.material.color.setHex(isOverlapping ? 0xff0000 : 0x00ffff);
            }
        });

    } else if (isPlayingPhase && currentView === 'offensive') {
        targetReticle.position.x = snappedX;
        targetReticle.position.z = snappedZ;
    }
});

window.addEventListener('keydown', (event) => {
    if (isPlanningPhase && (event.key === 'r' || event.key === 'R')) {
        ghostShip.rotation.y += Math.PI / 2; 
        
        const snappedX = ghostShip.position.x;
        const snappedZ = ghostShip.position.z;
        const length = shipConfig[currentShipIndex].length;
        canPlaceCurrentShip = !checkOverlap(snappedX, snappedZ, ghostShip.rotation.y, length);
        
        ghostShip.traverse((child) => {
            if (child.isMesh) child.material.color.setHex(canPlaceCurrentShip ? 0x00ffff : 0xff0000);
        });
    }
});

window.addEventListener('click', (event) => {
    if (event.target !== renderer.domElement) return;

    if (isPlanningPhase && currentShipIndex < maxShips) {
        if (!canPlaceCurrentShip) {
            logMessage("❌ Nem rakhatod ide a hajót, ütközik egy másikkal!", "enemy");
            return; 
        }

        const solidShip = loadedModels[currentShipIndex].clone();
        solidShip.position.copy(ghostShip.position);
        solidShip.rotation.copy(ghostShip.rotation);
        
        ownFleetGroup.add(solidShip);
        
        placedShips.push({ 
            id: shipConfig[currentShipIndex].file,
            length: shipConfig[currentShipIndex].length,
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
    } else if (isPlayingPhase && currentView === 'offensive') {
        const shotData = { x: targetReticle.position.x, y: 0, z: targetReticle.position.z };
        socket.emit('shoot', shotData);
    } else if (isPlayingPhase && currentView === 'defensive') {
        logMessage("Ideje felébredni! Válts át Támadó Nézetbe a lövéshez!", "system");
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
    
    switchView('defensive');
    
    if (loadedModels.length > 0) {
        isPlanningPhase = true;
        ghostShip.visible = true;
    } else {
        const waitInterval = setInterval(() => {
            if (loadedModels.length > 0) {
                clearInterval(waitInterval);
                isPlanningPhase = true;
                ghostShip.visible = true;
            }
        }, 500);
    }
});

socket.on('battle_begins', (msg) => {
    logMessage(`🔥 [Parancsnokság] ${msg}`, 'system');
    gameArea.style.display = 'block';
    isPlayingPhase = true;
    targetReticle.visible = true;
    viewControls.style.display = 'block'; 
});

socket.on('shot_result', (data) => {
    const isMe = (data.shooter === socket.id);
    
    if (isMe) {
        createFogExplosion(data.x, data.z, data.hit);
        if (data.hit) logMessage(`🔥 CÉL TALÁLVA! Bumm! (X:${data.x}, Z:${data.z})`, 'system');
        else logMessage(`💦 Mellé. Csobbanás a tengerben. (X:${data.x}, Z:${data.z})`, 'system');
    } else {
        createGridMarker(data.x, data.z, data.hit);
        if (data.hit) logMessage(`⚠️ FIGYELEM! Eltalálták egy hajónkat! (X:${data.x}, Z:${data.z})`, 'enemy');
        else logMessage(`Közel volt... Az ellenfél mellélőtt. (X:${data.x}, Z:${data.z})`, 'enemy');
    }
});

socket.on('error_msg', (msg) => alert(`Hiba: ${msg}`));
