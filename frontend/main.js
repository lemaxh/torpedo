// Csatlakozás a saját Render szerveredhez
const socket = io('https://torpedo-xl5u.onrender.com');

const logDiv = document.getElementById('radar-log');
const fireBtn = document.getElementById('fireBtn');

function logMessage(msg, isEnemy = false) {
    const p = document.createElement('p');
    p.innerHTML = msg;
    if (isEnemy) p.className = 'enemy';
    logDiv.prepend(p); // A legújabb üzenet kerül felülre
}

// Ha sikeres a csatlakozás
socket.on('connect', () => {
    logMessage(`Sikeresen rácsatlakozva a szerverre! (ID: ${socket.id})`);
});

// Gombnyomásra lövünk egyet (egyelőre random koordinátákra)
fireBtn.addEventListener('click', () => {
    // 3D térben X és Z lesz a tenger felszíne, Y a magasság
    const shotData = { 
        x: Math.floor(Math.random() * 10), 
        y: 0, 
        z: Math.floor(Math.random() * 10) 
    };
    
    socket.emit('shoot', shotData);
    logMessage(`Lövés leadva a következő koordinátára: X:${shotData.x}, Z:${shotData.z}`);
});

// Ha az ellenféltől érkezik egy lövés (ezt fogjuk majd a 3D-ben robbanássá alakítani)
socket.on('enemy_shot', (data) => {
    logMessage(`⚠️ BEJÖVŐ TALÁLAT! Az ellenfél lőtt: X:${data.x}, Z:${data.z}`, true);
});
