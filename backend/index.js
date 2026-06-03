const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
app.get('/', (req, res) => {
  res.send('A 3D Torpedó szerver hibátlanul fut és várja a játékosokat!');
});
// A CORS engedélyezi, hogy a böngészőből (majd a frontendünkről) rá tudjunk csatlakozni
const io = new Server(server, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST"]
  }
});

io.on('connection', (socket) => {
  console.log('Új játékos csatlakozott. ID:', socket.id);

  // Figyeljük az egyik gépről érkező lövést
  socket.on('shoot', (data) => {
    console.log(`Lövés érkezett: X:${data.x}, Y:${data.y}, Z:${data.z}`);
    
    // Átküldjük a lövés adatait a TÖBBI játékosnak (az ellenfélnek)
    socket.broadcast.emit('enemy_shot', data);
  });

  socket.on('disconnect', () => {
    console.log('Játékos lecsatlakozott:', socket.id);
  });
});

// A Render a process.env.PORT-on keresztül osztja ki a portot
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`A torpedó szerver aktív a ${PORT}-es porton!`);
});
