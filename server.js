// server.js - WebRTC Signaling Server for P2P Video Call App
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

// Create Express app and HTTP server
const app = express();
const server = http.createServer(app);

// Create Socket.IO server with CORS settings
const io = new Server(server, {
  cors: {
    origin: '*', // In production, restrict this to your domain
    methods: ['GET', 'POST']
  }
});

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Store active rooms and participants
const rooms = new Map();

// Socket.IO connection handler
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);
  
  // Create a new room
  socket.on('create-room', ({ roomId, userData }) => {
    console.log(`Creating room: ${roomId} by user: ${socket.id}`);
    
    // Create room if it doesn't exist
    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Map());
    }
    
    // Join the socket to the room
    socket.join(roomId);
    
    // Add user data to the room
    rooms.get(roomId).set(socket.id, userData);
    
    // Store room ID in the socket object for easy access
    socket.roomId = roomId;
    
    // Send room data back to the user
    socket.emit('room-data', {
      participants: Object.fromEntries(rooms.get(roomId))
    });
  });
  
  // Join an existing room
  socket.on('join-room', ({ roomId, userData }) => {
    console.log(`User ${socket.id} joining room: ${roomId}`);
    
    // Check if room exists
    if (!rooms.has(roomId)) {
      socket.emit('error', { message: 'Room does not exist' });
      return;
    }
    
    // Join the socket to the room
    socket.join(roomId);
    
    // Add user data to the room
    rooms.get(roomId).set(socket.id, userData);
    
    // Store room ID in the socket object for easy access
    socket.roomId = roomId;
    
    // Notify all other participants in the room
    socket.to(roomId).emit('user-joined', {
      userId: socket.id,
      userData
    });
    
    // Send room data back to the user
    socket.emit('room-data', {
      participants: Object.fromEntries(rooms.get(roomId))
    });
  });
  
  // Handle WebRTC signaling - offer
  socket.on('offer', ({ targetId, senderId, signal }) => {
    io.to(targetId).emit('offer', {
      senderId,
      signal,
      senderData: socket.roomId && rooms.has(socket.roomId) ? 
        rooms.get(socket.roomId).get(senderId) : {}
    });
  });
  
  // Handle WebRTC signaling - answer
  socket.on('answer', ({ targetId, senderId, signal }) => {
    io.to(targetId).emit('answer', {
      senderId,
      signal
    });
  });
  
  // Handle WebRTC signaling - ICE candidate
  socket.on('ice-candidate', ({ targetId, senderId, candidate }) => {
    io.to(targetId).emit('ice-candidate', {
      senderId,
      candidate
    });
  });
  
  // Handle media state changes (mute/unmute)
  socket.on('media-state-change', ({ roomId, mediaType, enabled }) => {
    socket.to(roomId).emit('media-state-change', {
      userId: socket.id,
      mediaType,
      enabled
    });
  });
  
  // Explicitly leave a room
  socket.on('leave-room', ({ roomId }) => {
    handleUserLeaving(socket, roomId);
  });
  
  // Handle disconnections
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    
    // Clean up any rooms the user was in
    if (socket.roomId) {
      handleUserLeaving(socket, socket.roomId);
    }
  });
});

// Helper function to handle a user leaving a room
function handleUserLeaving(socket, roomId) {
  console.log(`User ${socket.id} leaving room: ${roomId}`);
  
  // Check if room exists
  if (rooms.has(roomId)) {
    // Remove user from room data
    rooms.get(roomId).delete(socket.id);
    
    // Notify other participants
    socket.to(roomId).emit('user-disconnected', {
      userId: socket.id
    });
    
    // If room is empty, delete it
    if (rooms.get(roomId).size === 0) {
      console.log(`Room ${roomId} is empty, deleting`);
      rooms.delete(roomId);
    }
  }
  
  // Leave the socket.io room
  socket.leave(roomId);
  
  // Clear room ID from socket
  delete socket.roomId;
}

// Handle routing - serve index.html for all routes
// FIX: Use a proper Express route instead of the problematic catch-all route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Handle other routes
app.get('/:roomId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
});