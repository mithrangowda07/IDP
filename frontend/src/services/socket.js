import { io } from 'socket.io-client';

const SOCKET_URL = 'http://localhost:5000';

export const socket = io(SOCKET_URL, {
  autoConnect: false // We connect manually after login
});

export const connectSocket = (role) => {
  if (!socket.connected) {
    socket.connect();
    socket.on('connect', () => {
      console.log('Socket.IO connected to backend. Joining role room:', role);
      socket.emit('join_role', role);
    });
  } else {
    console.log('Socket already connected. Re-joining role room:', role);
    socket.emit('join_role', role);
  }
};

export const disconnectSocket = () => {
  if (socket.connected) {
    console.log('Disconnecting Socket.IO');
    socket.disconnect();
  }
};
