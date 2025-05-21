// client/src/socket.js
import { io } from 'socket.io-client';

const URL = process.env.REACT_APP_SOCKET_SERVER_URL;

const socket = io(URL, {
  transports: ['websocket'], // Optional: improves stability in some environments
  withCredentials: true,
});

export default socket;
