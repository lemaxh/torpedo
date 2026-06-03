const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// Ez lesz a memóriabeli adatbázisunk, ami minden szobát nyilvántart
const activeRooms = {};

// 1. Alap végpont a "kíváncsiskodóknak"
app.get('/', (req, res) => {
  res.send('A 3D Torpedó szerver hibátlanul fut és várja a játékosokat!');
});

// 2. A Monitor Végpont (Admin Dashboard)
app.get('/monitor', (req, res) => {
  let html = `
    <!DOCTYPE html>
    <html lang="hu">
    <head>
      <meta charset="UTF-8">
      <title>Szerver Monitor</title>
      <style>
        body { font-family: monospace; background: #111; color: #0f0; padding: 20px; }
        .room { border: 1px solid #333; margin-bottom: 15px; padding: 15px; background: #000; }
        .waiting { color: #ff0; }
        .planning { color: #0ff; }
        .playing { color: #f55; }
        h1 { border-bottom: 1px solid #0f0; padding-bottom: 10px; }
      </style>
    </head>
    <body>
      <h1>📡 Torpedó Szerver: Aktív Szobák</h1>
  `;

  const roomCodes = Object.keys(activeRooms);
  
  if (roomCodes.length === 0) {
    html += `<p>Nincsenek aktív szobák jelenleg.</p>`;
  } else {
    roomCodes.forEach(code => {
      const room = activeRooms[code];
      html += `
        <div class="room">
          <strong>Szobakód:</strong> <span style="font-size: 1.2em;">${code}</span> <br><br>
          <strong>Fázis:</strong> <span class="${room.status}">${room.status.toUpperCase()}</span> <br>
          <strong>Játékosok:</strong> ${room.players.length} / 2 <br>
          <strong>Leadott lövések:</strong> P1: ${room.p1_shots} db | P2: ${room.p2_shots} db
        </div>
      `;
    });
  }

  html += `
      <script>
        // Az oldal 5 másodpercenként automatikusan frissíti magát
        setTimeout(() => location.reload(), 5000);
      </script>
    </body></html>`;
    
  res.send(html);
});

// 3. Valós idejű Socket.IO kommunikáció és állapotkezelés
io.on('connection', (socket) => {
  console.log('Új gép csatlakozott. ID:', socket.id);
  let currentRoom = null;

  socket.on('create_room', () => {
    const roomCode = Math.random().toString(36).substring(2, 7).toUpperCase();
    
    socket.join(roomCode);
    currentRoom = roomCode;
    
    // Létrehozzuk a szobát a szerver memóriájában
    activeRooms[roomCode] = {
      status: 'waiting', // Várakozás a 2. játékosra
      players: [socket.id],
      p1_shots: 0,
      p2_shots: 0
    };
    
    socket.emit('room_created', roomCode);
  });

  socket.on('join_room', (roomCode) => {
    if (activeRooms[roomCode] && activeRooms[roomCode].status === 'waiting') {
      socket.join(roomCode);
      currentRoom = roomCode;
      
      // Frissítjük a memóriát: megvan a 2 ember, jöhet a hajó lepakolás
      activeRooms[roomCode].players.push(socket.id);
      activeRooms[roomCode].status = 'planning'; 
      
      socket.emit('room_joined', roomCode);
      io.to(roomCode).emit('game_start', 'Megvan a kapcsolat! Kezdődhet a hajók lepakolása (Tervezési fázis).');
    } else {
      socket.emit('error_msg', 'Nincs ilyen kódú szoba, vagy már tele van!');
    }
  });

  socket.on('shoot', (data) => {
    if (currentRoom && activeRooms[currentRoom]) {
      const room = activeRooms[currentRoom];
      
      // Monitorozás: regisztráljuk, hogy ki lőtt (az 1-es vagy a 2-es játékos)
      if (room.players[0] === socket.id) room.p1_shots++;
      else room.p2_shots++;

      // Továbbítjuk a lövést a szobán belül az ellenfélnek
      socket.to(currentRoom).emit('enemy_shot', data);
    }
  });

  socket.on('disconnect', () => {
    if (currentRoom && activeRooms[currentRoom]) {
      socket.to(currentRoom).emit('enemy_disconnected', 'Az ellenfél kilépett.');
      
      // Ha valaki kilép, megsemmisítjük a szobát a memóriából
      delete activeRooms[currentRoom];
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`A torpedó szerver aktív a ${PORT}-es porton!`);
});
