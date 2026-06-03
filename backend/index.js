const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const activeRooms = {};

app.get('/', (req, res) => {
  res.send('A 3D Torpedó szerver hibátlanul fut és várja a játékosokat!');
});

// A Monitor panel marad a régi (Admin Dashboard)
app.get('/monitor', (req, res) => {
  let html = `<!DOCTYPE html><html lang="hu"><head><meta charset="UTF-8"><title>Szerver Monitor</title><style>body { font-family: monospace; background: #111; color: #0f0; padding: 20px; } .room { border: 1px solid #333; margin-bottom: 15px; padding: 15px; background: #000; } .waiting { color: #ff0; } .planning { color: #0ff; } .playing { color: #f55; } h1 { border-bottom: 1px solid #0f0; padding-bottom: 10px; }</style></head><body><h1>📡 Torpedó Szerver: Aktív Szobák</h1>`;
  const roomCodes = Object.keys(activeRooms);
  if (roomCodes.length === 0) { html += `<p>Nincsenek aktív szobák jelenleg.</p>`; } 
  else {
    roomCodes.forEach(code => {
      const room = activeRooms[code];
      html += `<div class="room"><strong>Szobakód:</strong> <span style="font-size: 1.2em;">${code}</span> <br><br><strong>Fázis:</strong> <span class="${room.status}">${room.status.toUpperCase()}</span> <br><strong>Játékosok:</strong> ${room.players.length} / 2 <br><strong>Leadott lövések:</strong> P1: ${room.p1_shots} db | P2: ${room.p2_shots} db</div>`;
    });
  }
  html += `<script>setTimeout(() => location.reload(), 5000);</script></body></html>`;
  res.send(html);
});


// --- MATEMATIKAI ÜTKÖZÉSVIZSGÁLAT ---
function checkHit(shot, ships) {
  for (let ship of ships) {
    // 1. A fájlnév alapján kitaláljuk, milyen hosszú a hajó a rácson
    let length = 2; 
    if (ship.id.includes('3helyes')) length = 3;
    else if (ship.id.includes('4helyes')) length = 4;
    else if (ship.id.includes('5helyes')) length = 5;

    let width = 1; // Minden hajó 1 négyzet széles

    // 2. Kiszámoljuk a távolságot a lövés és a hajó közepe között
    let dx = shot.x - ship.x;
    let dz = shot.z - ship.z;

    // 3. Inverz forgatás (Visszaforgatjuk a lövést a hajó dőlésszögével ellentétesen)
    let angle = -ship.rotationY; 
    let localX = dx * Math.cos(angle) - dz * Math.sin(angle);
    let localZ = dx * Math.sin(angle) + dz * Math.cos(angle);

    // 4. Benne van-e a lövés a hajó téglalapjában? (0.2 ráhagyással a kerekítések miatt)
    if (Math.abs(localX) <= (width / 2) + 0.2 && Math.abs(localZ) <= (length / 2) + 0.2) {
      return true; // TALÁLAT!
    }
  }
  return false; // MELLÉ!
}


// --- HÁLÓZATI LOGIKA ---
io.on('connection', (socket) => {
  console.log('Új gép csatlakozott. ID:', socket.id);
  let currentRoom = null;

  socket.on('create_room', () => {
    const roomCode = Math.random().toString(36).substring(2, 7).toUpperCase();
    socket.join(roomCode);
    currentRoom = roomCode;
    
    activeRooms[roomCode] = {
      status: 'waiting',
      players: [socket.id],
      p1_shots: 0, p2_shots: 0,
      p1_ready: false, p2_ready: false,
      p1_ships: [], p2_ships: []
    };
    
    socket.emit('room_created', roomCode);
  });

  socket.on('join_room', (roomCode) => {
    if (activeRooms[roomCode] && activeRooms[roomCode].status === 'waiting') {
      socket.join(roomCode);
      currentRoom = roomCode;
      
      activeRooms[roomCode].players.push(socket.id);
      activeRooms[roomCode].status = 'planning'; 
      
      socket.emit('room_joined', roomCode);
      io.to(roomCode).emit('game_start', 'Kezdődhet a hajók lepakolása (Tervezési fázis).');
    } else {
      socket.emit('error_msg', 'Nincs ilyen kódú szoba, vagy már tele van!');
    }
  });

  // A JÁTÉKOS LERAKTA A HAJÓIT
  socket.on('ships_ready', (ships) => {
    if (currentRoom && activeRooms[currentRoom]) {
      const room = activeRooms[currentRoom];
      
      if (room.players[0] === socket.id) {
        room.p1_ready = true;
        room.p1_ships = ships;
      } else {
        room.p2_ready = true;
        room.p2_ships = ships;
      }

      // Ha mindkét fél rányomott a Kész gombra
      if (room.p1_ready && room.p2_ready) {
        room.status = 'playing';
        io.to(currentRoom).emit('battle_begins', 'Mindkét flotta készen áll! Kezdődik a harc!');
      }
    }
  });

  // LÖVÉS LEADÁSA
  socket.on('shoot', (data) => {
    if (currentRoom && activeRooms[currentRoom]) {
      const room = activeRooms[currentRoom];
      let targetShips = [];
      
      // Megnézzük, ki lőtt, és kinek a hajóit kell vizsgálni
      if (room.players[0] === socket.id) {
        room.p1_shots++;
        targetShips = room.p2_ships;
      } else {
        room.p2_shots++;
        targetShips = room.p1_ships;
      }

      // ÜTKÖZÉSVIZSGÁLAT!
      const isHit = checkHit(data, targetShips);

      // Eredmény kiküldése MINDENKINEK a szobában
      io.to(currentRoom).emit('shot_result', {
        x: data.x,
        z: data.z,
        hit: isHit,
        shooter: socket.id // Ebből tudja majd a kliens, hogy ő lőtt-e, vagy őt lőtték
      });
    }
  });

  socket.on('disconnect', () => {
    if (currentRoom && activeRooms[currentRoom]) {
      socket.to(currentRoom).emit('enemy_disconnected', 'Az ellenfél kilépett.');
      delete activeRooms[currentRoom];
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`A torpedó szerver aktív a ${PORT}-es porton!`);
});
