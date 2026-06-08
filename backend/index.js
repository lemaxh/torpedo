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

app.get('/monitor', (req, res) => {
  let html = `<!DOCTYPE html><html lang="hu"><head><meta charset="UTF-8"><title>Szerver Monitor</title><style>body { font-family: monospace; background: #111; color: #0f0; padding: 20px; } .room { border: 1px solid #333; margin-bottom: 15px; padding: 15px; background: #000; } .waiting { color: #ff0; } .planning { color: #0ff; } .playing { color: #f55; } h1 { border-bottom: 1px solid #0f0; padding-bottom: 10px; }</style></head><body><h1>📡 Torpedó Szerver: Aktív Szobák</h1>`;
  const roomCodes = Object.keys(activeRooms);
  if (roomCodes.length === 0) { html += `<p>Nincsenek aktív szobák jelenleg.</p>`; } 
  else {
    roomCodes.forEach(code => {
      const room = activeRooms[code];
      html += `<div class="room"><strong>Szobakód:</strong> <span style="font-size: 1.2em;">${code}</span> <br><br><strong>Fázis:</strong> <span class="${room.status}">${room.status.toUpperCase()}</span> <br><strong>Játékosok:</strong> ${room.players.length} / 2 <br><strong>Körön lévő:</strong> ${room.currentTurn === room.players[0] ? 'P1' : 'P2'} <br><strong>Leadott lövések:</strong> P1: ${room.p1_shots} db | P2: ${room.p2_shots} db</div>`;
    });
  }
  html += `<script>setTimeout(() => location.reload(), 5000);</script></body></html>`;
  res.send(html);
});

// Ütközésvizsgálat (Visszaadja a meglőtt hajó indexét)
function checkHitIndex(shot, ships) {
  for (let i = 0; i < ships.length; i++) {
    let ship = ships[i];
    let length = ship.length;
    let width = 1; 

    let dx = shot.x - ship.x;
    let dz = shot.z - ship.z;

    let angle = -ship.rotationY; 
    let localX = dx * Math.cos(angle) - dz * Math.sin(angle);
    let localZ = dx * Math.sin(angle) + dz * Math.cos(angle);

    if (Math.abs(localX) <= (width / 2) + 0.2 && Math.abs(localZ) <= (length / 2) + 0.2) {
      return i; 
    }
  }
  return -1; 
}

io.on('connection', (socket) => {
  console.log('Új gép csatlakozott. ID:', socket.id);
  let currentRoom = null;

  socket.on('create_room', () => {
    const roomCode = Math.random().toString(36).substring(2, 7).toUpperCase();
    socket.join(roomCode);
    currentRoom = roomCode;
    
    activeRooms[roomCode] = {
      status: 'waiting', players: [socket.id], currentTurn: null, 
      p1_shots: 0, p2_shots: 0, p1_ready: false, p2_ready: false,
      p1_ships: [], p2_ships: []
    };
    
    socket.emit('room_created', roomCode);
  });

  socket.on('join_room', (roomCode) => {
    if (activeRooms[roomCode] && activeRooms[roomCode].status === 'waiting') {
      socket.join(roomCode); currentRoom = roomCode;
      activeRooms[roomCode].players.push(socket.id); activeRooms[roomCode].status = 'planning'; 
      socket.emit('room_joined', roomCode);
      io.to(roomCode).emit('game_start', 'Kezdődhet a hajók lepakolása a te térfeledre (Alsó rész).');
    } else {
      socket.emit('error_msg', 'Nincs ilyen kódú szoba, vagy már tele van!');
    }
  });

  socket.on('ships_ready', (ships) => {
    if (currentRoom && activeRooms[currentRoom]) {
      const room = activeRooms[currentRoom];
      
      if (room.players[0] === socket.id) {
        room.p1_ready = true; room.p1_ships = ships;
      } else {
        room.p2_ready = true; room.p2_ships = ships;
      }

      if (room.p1_ready && room.p2_ready) {
        room.status = 'playing'; room.currentTurn = room.players[0]; 
        io.to(currentRoom).emit('battle_begins', 'Mindkét flotta készen áll! Kezdődik a harc!');
        io.to(currentRoom).emit('turn_update', room.currentTurn);
      }
    }
  });

  socket.on('shoot', (data) => {
    if (currentRoom && activeRooms[currentRoom]) {
      const room = activeRooms[currentRoom];
      
      if (room.currentTurn !== socket.id) return;

      let targetShips = (room.players[0] === socket.id) ? room.p2_ships : room.p1_ships;

      // TÜKRÖZÉS VARÁZSLAT: Mivel egymással szemben vagytok a pályán, elforgatjuk a lövést 180 fokkal a matekhoz!
      const targetX = -data.x;
      const targetZ = -data.z;

      const hitIndex = checkHitIndex({ x: targetX, z: targetZ }, targetShips);
      
      const isHit = (hitIndex !== -1);
      let isSunk = false;
      let gameOver = false;

      if (isHit) {
        targetShips[hitIndex].hp -= 1;
        if (targetShips[hitIndex].hp <= 0) {
          isSunk = true; targetShips[hitIndex].hp = 0;
        }
      }

      const aliveShips = targetShips.filter(ship => ship.hp > 0).length;
      if (aliveShips === 0) gameOver = true;

      // Kör átadása
      room.currentTurn = (room.players[0] === socket.id) ? room.players[1] : room.players[0];

      // KIKÜLDÉS (Az eredeti adatokat küldjük vissza, mert a kliensek már maguknak forgatják)
      io.to(currentRoom).emit('shot_result', {
        originalX: data.x, 
        originalZ: data.z,
        hit: isHit,
        sunk: isSunk,
        gameOver: gameOver,
        shooter: socket.id 
      });

      if (!gameOver) {
        io.to(currentRoom).emit('turn_update', room.currentTurn);
      }
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
