const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

app.get('/', (req, res) => {
  res.send('A 3D Torpedó szerver hibátlanul fut és várja a játékosokat!');
});

io.on('connection', (socket) => {
  console.log('Új gép csatlakozott. ID:', socket.id);
  let currentRoom = null; // Nyomon követjük, melyik szobában van a játékos

  // 1. SZOBA LÉTREHOZÁSA (Host)
  socket.on('create_room', () => {
    // Generálunk egy 5 karakteres véletlenszerű kódot (pl. "A8F2K")
    const roomCode = Math.random().toString(36).substring(2, 7).toUpperCase();
    
    socket.join(roomCode); // A szerveren berakjuk ezt a gépet a szobába
    currentRoom = roomCode;
    
    // Visszaküldjük a kódot a létrehozónak, hogy ki tudja írni a képernyőre
    socket.emit('room_created', roomCode);
    console.log(`Szoba létrehozva: ${roomCode}`);
  });

  // 2. CSATLAKOZÁS SZOBAKÓDDAL (Vendég)
  socket.on('join_room', (roomCode) => {
    // Megnézzük, létezik-e a szoba, és hányan vannak benne
    const room = io.sockets.adapter.rooms.get(roomCode);
    
    if (room && room.size === 1) {
      // Ha létezik és csak 1 ember van benne, csatlakozunk
      socket.join(roomCode);
      currentRoom = roomCode;
      
      // Szólunk a csatlakozónak, hogy sikerült
      socket.emit('room_joined', roomCode);
      
      // Szólunk MINDENKINEK a szobában, hogy megvan a 2 ember, indulhat a játék
      io.to(roomCode).emit('game_start', 'Megvan a kapcsolat! Indulhat a lövöldözés.');
    } else if (room && room.size >= 2) {
      socket.emit('error_msg', 'Ez a szoba már tele van!');
    } else {
      socket.emit('error_msg', 'Nincs ilyen kódú szoba!');
    }
  });

  // 3. LÖVÉS (Már csak a szobán belül)
  socket.on('shoot', (data) => {
    if (currentRoom) {
      // A 'to(currentRoom)' biztosítja, hogy csak a szobatárs kapja meg
      socket.to(currentRoom).emit('enemy_shot', data);
    }
  });

  // 4. KILÉPÉS KEZELÉSE
  socket.on('disconnect', () => {
    if (currentRoom) {
      // Ha kilépett, szólunk a bent maradt játékosnak
      socket.to(currentRoom).emit('enemy_disconnected', 'Az ellenfél kilépett / megszakadt a kapcsolata.');
    }
    console.log('Játékos lecsatlakozott:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`A torpedó szerver aktív a ${PORT}-es porton!`);
});
