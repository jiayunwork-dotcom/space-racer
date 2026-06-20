import fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { initRedis, getAllTracks, getTrack, getLeaderboard, getGlobalLeaderboard, saveTrack, getReplay, getReplaysForTrack } from './services/redis';
import { createRoom, getRoom, getAllRooms, joinRoom, leaveRoom, setPlayerReady, startGame, setPlayerInput, getGameStateForPlayer, disconnectPlayer, reconnectPlayer } from './services/rooms';
import type { Track } from './types/game';
import { v4 as uuidv4 } from 'uuid';

const PORT = parseInt(process.env.PORT || '3000');

const app = fastify({ logger: true });

app.register(cors, {
  origin: true,
  credentials: true
});

app.register(websocket);

app.get('/api/health', async () => {
  return { status: 'ok' };
});

app.get('/api/tracks', async () => {
  const tracks = await getAllTracks();
  return { tracks };
});

app.get('/api/tracks/:id', async (request, reply) => {
  const { id } = request.params as { id: string };
  const track = await getTrack(id);
  if (!track) {
    reply.code(404);
    return { error: 'Track not found' };
  }
  return { track };
});

app.get('/api/leaderboard/:trackId', async (request, reply) => {
  const { trackId } = request.params as { trackId: string };
  const entries = await getLeaderboard(trackId);
  return { entries };
});

app.get('/api/global-leaderboard', async () => {
  const entries = await getGlobalLeaderboard();
  return { entries };
});

app.post('/api/tracks', async (request, reply) => {
  try {
    const body = request.body as any;
    const track: Track = {
      id: uuidv4(),
      name: body.name || 'Custom Track',
      author: body.author || 'Anonymous',
      isBuiltIn: false,
      outerBoundary: body.outerBoundary,
      innerBoundary: body.innerBoundary,
      checkpoints: body.checkpoints || [],
      envElements: body.envElements || [],
      itemSpawners: body.itemSpawners || [],
      startPosition: body.startPosition || { x: 0, y: 0 },
      startAngle: body.startAngle || 0,
      playCount: 0,
      createdAt: Date.now()
    };
    await saveTrack(track);
    reply.code(201);
    return { track };
  } catch (error) {
    reply.code(400);
    return { error: 'Invalid track data' };
  }
});

app.get('/api/rooms', async () => {
  const rooms = getAllRooms();
  return { rooms };
});

app.get('/api/replays/:trackId', async (request, reply) => {
  const { trackId } = request.params as { trackId: string };
  const replays = await getReplaysForTrack(trackId);
  return { replays };
});

app.get('/api/replay/:id', async (request, reply) => {
  const { id } = request.params as { id: string };
  const replay = await getReplay(id);
  if (!replay) {
    reply.code(404);
    return { error: 'Replay not found' };
  }
  return { replay };
});

app.post('/api/rooms', async (request) => {
  const body = request.body as any;
  const room = createRoom(
    uuidv4(),
    body.hostName || 'Player',
    body.roomName || 'New Room',
    body.trackId || 'beginner-circle',
    body.totalLaps || 3,
    body.maxPlayers || 8
  );
  return { room };
});

app.get('/api/rooms/:id', async (request, reply) => {
  const { id } = request.params as { id: string };
  const room = getRoom(id);
  if (!room) {
    reply.code(404);
    return { error: 'Room not found' };
  }
  return { room };
});

app.post('/api/rooms/:id/join', async (request, reply) => {
  const { id } = request.params as { id: string };
  const body = request.body as any;
  const room = await joinRoom(id, body.playerId, body.playerName);
  if (!room) {
    reply.code(400);
    return { error: 'Cannot join room' };
  }
  return { room };
});

app.post('/api/rooms/:id/leave', async (request, reply) => {
  const { id } = request.params as { id: string };
  const body = request.body as any;
  const success = leaveRoom(id, body.playerId);
  if (!success) {
    reply.code(400);
    return { error: 'Cannot leave room' };
  }
  return { success: true };
});

app.post('/api/rooms/:id/ready', async (request, reply) => {
  const { id } = request.params as { id: string };
  const body = request.body as any;
  const room = setPlayerReady(id, body.playerId, body.isReady);
  if (!room) {
    reply.code(400);
    return { error: 'Cannot set ready state' };
  }
  return { room };
});

app.post('/api/rooms/:id/start', async (request, reply) => {
  const { id } = request.params as { id: string };
  const body = request.body as any;
  const room = await startGame(id, body.playerId);
  if (!room) {
    reply.code(400);
    return { error: 'Cannot start game' };
  }
  return { room };
});

app.register(async (fastify) => {
  fastify.get('/ws/game/:roomId/:playerId', { websocket: true }, (connection, request) => {
    const { roomId, playerId } = request.params as { roomId: string; playerId: string };

    const room = getRoom(roomId);
    if (!room) {
      connection.socket.close();
      return;
    }

    reconnectPlayer(roomId, playerId);

    const stateInterval = setInterval(() => {
      const state = getGameStateForPlayer(roomId, playerId);
      if (state) {
        connection.socket.send(JSON.stringify({
          type: 'state',
          data: state,
          timestamp: Date.now()
        }));
      }
    }, 1000 / 30);

    connection.socket.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        
        if (data.type === 'input') {
          setPlayerInput(roomId, playerId, data.input);
        }
        
        if (data.type === 'ping') {
          connection.socket.send(JSON.stringify({
            type: 'pong',
            timestamp: data.timestamp,
            serverTimestamp: Date.now()
          }));
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    });

    connection.socket.on('close', () => {
      clearInterval(stateInterval);
      disconnectPlayer(roomId, playerId);
    });

    connection.socket.on('error', (error) => {
      console.error('WebSocket error:', error);
      clearInterval(stateInterval);
      disconnectPlayer(roomId, playerId);
    });
  });
});

const start = async () => {
  try {
    await initRedis();
    await app.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`Space Racer server running on port ${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
