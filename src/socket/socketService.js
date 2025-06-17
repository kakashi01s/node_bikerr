import { Server } from 'socket.io';

let io; // Declare a variable to store the Socket.IO instance

const socketService = (server) => {
  console.log('socketService called with server:', server); // Add this line

  io = new Server(server, {
    cors: {
      origin: "*", // Adjust for your app's origin
      
    }
  });

  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    socket.on('joinChat', (chatRoomId) => {
      socket.join(chatRoomId);
      console.log(`User ${socket.id} joined room ${chatRoomId}`);
    });

    socket.on('sendMessage', (messageData) => {
        console.log("saving message-------------------------------")
      const { chatRoomId, message } = messageData;
      io.to(chatRoomId).emit('receiveMessage', message);
      io.to(chatRoomId).emit('conversationUpdated', message);
    });

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.id}`);
    });
  });

  return io; // Return the io instance so it can be used elsewhere
};

export { io, socketService };