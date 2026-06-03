// --- 3D JÁTÉKTÉR (Three.js) INICIALIZÁLÁSA ---

const canvasContainer = document.getElementById('canvas-container');
const scene = new THREE.Scene();

// A KÖD beállítása: sötétszürke szín, exponenciális sűrűsödés a távolban
scene.fog = new THREE.FogExp2(0x111111, 0.04);

// Kamera beállítása (Látószög, Képarány, Közeli vágósík, Távoli vágósík)
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 10, 15); // Kicsit fentről és hátrábbról nézzük a "tengert"
camera.lookAt(0, 0, 0);

// Renderer beállítása
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x111111); // A háttérszínt a ködhöz igazítjuk
canvasContainer.appendChild(renderer.domElement);

// Egy egyszerű, retro zöld rács a "tenger" vizualizálására
const gridHelper = new THREE.GridHelper(60, 60, 0x00ff00, 0x003300);
scene.add(gridHelper);

// Animációs ciklus (folyamatosan frissíti a képet)
function animate() {
    requestAnimationFrame(animate);
    
    // Később itt fogjuk mozgatni a repülő lövedékeket
    
    renderer.render(scene, camera);
}
animate();

// Ablak átméretezésének lekezelése
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});


// --- INNENTŐL JÖN A KORÁBBI SOCKET.IO KÓDOD ---
const socket = io('https://torpedo-xl5u.onrender.com');

// ... (UI Elemek, Lobby logika, stb. maradnak pontosan úgy, ahogy eddig voltak) ...
// Frissítsd ezt a blokkot a main.js alján:
fireBtn.addEventListener('click', () => {
    const shotData = { 
        x: Math.floor(Math.random() * 60) - 30, // -30 és +30 közötti koordináta
        y: 0, 
        z: Math.floor(Math.random() * -30) - 5  // Direkt a távoli ködbe lövünk (negatív Z irány)
    };
    socket.emit('shoot', shotData);
    logMessage(`Lövés leadva a ködbe: X:${shotData.x}, Z:${shotData.z}`, '');
});
