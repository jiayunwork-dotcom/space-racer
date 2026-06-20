import fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { initRedis, getAllTracks, getTrack, getLeaderboard, getGlobalLeaderboard, saveTrack, getReplay, getReplaysForTrack, getRaceReplay, getRaceReplaysForRoom, getLatestRaceReplayForRoom } from './services/redis';
import { createRoom, getRoom, getAllRooms, joinRoom, leaveRoom, setPlayerReady, startGame, setPlayerInput, getGameStateForPlayer, disconnectPlayer, reconnectPlayer, getLastRaceReplayId, addSpectator, removeSpectator, getGameStateForSpectator, checkDanmakuCooldown, getSpectatorCount } from './services/rooms';
import {
  createTournament,
  listTournaments,
  getTournamentDetail,
  joinTournament,
  startTournament,
  getCurrentStage,
  createStageRoom,
  submitStageResults,
  getStandings,
  markStageRacing
} from './services/tournaments';
import type { Track } from './types/game';
import { v4 as uuidv4 } from 'uuid';

const PORT = parseInt(process.env.PORT || '3000');

const app = fastify({ logger: true });

const rooms_spectatorConnections = new Map<string, Map<string, any>>();
const rooms_gameConnections = new Map<string, Map<string, any>>();

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

app.get('/api/race-replay/:id', async (request, reply) => {
  const { id } = request.params as { id: string };
  console.log(`[API] GET /api/race-replay/${id}`);
  const replay = await getRaceReplay(id);
  if (!replay) {
    console.log(`[API] Race replay not found: ${id}`);
    reply.code(404);
    return { error: 'Race replay not found' };
  }
  console.log(`[API] Race replay found: ${id} frames=${replay.frames.length} events=${replay.events.length}`);
  return { replay };
});

app.get('/api/race-replays/room/:roomId', async (request, reply) => {
  const { roomId } = request.params as { roomId: string };
  console.log(`[API] GET /api/race-replays/room/${roomId}`);
  const replays = await getRaceReplaysForRoom(roomId);
  console.log(`[API] Found ${replays.length} replays for room ${roomId}`);
  return { replays };
});

app.get('/api/rooms/:roomId/latest-replay', async (request, reply) => {
  const { roomId } = request.params as { roomId: string };
  console.log(`[API] GET /api/rooms/${roomId}/latest-replay`);
  
  const replayId = getLastRaceReplayId(roomId);
  console.log(`[API] Memory lastReplayId for room ${roomId}: ${replayId}`);
  
  if (replayId) {
    const replay = await getRaceReplay(replayId);
    if (replay) {
      console.log(`[API] Returning memory replay: ${replayId}`);
      return { replayId, replay };
    }
  }
  const latestReplay = await getLatestRaceReplayForRoom(roomId);
  if (!latestReplay) {
    console.log(`[API] No replay found for room ${roomId}`);
    reply.code(404);
    return { error: 'No replay found' };
  }
  console.log(`[API] Returning Redis latest replay: ${latestReplay.id}`);
  return { replayId: latestReplay.id, replay: latestReplay };
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

app.post('/api/tournaments', async (request, reply) => {
  try {
    const body = request.body as any;
    const result = await createTournament({
      name: body.name || '新锦标赛',
      creatorId: body.creatorId,
      creatorName: body.creatorName || '创建者',
      stages: body.stages || []
    });
    if (result.error) {
      reply.code(400);
      return { error: result.error };
    }
    reply.code(201);
    return { tournament: result.tournament };
  } catch (error) {
    reply.code(400);
    return { error: '创建锦标赛失败' };
  }
});

app.get('/api/tournaments', async (request, reply) => {
  const query = request.query as any;
  const status = query.status || 'registering';
  if (!['registering', 'ongoing', 'finished'].includes(status)) {
    reply.code(400);
    return { error: '无效的状态参数' };
  }
  const tournaments = await listTournaments(status as any);
  return { tournaments };
});

app.get('/api/tournaments/:id', async (request, reply) => {
  const { id } = request.params as { id: string };
  const result = await getTournamentDetail(id);
  if (result.error) {
    reply.code(404);
    return { error: result.error };
  }
  return { tournament: result.tournament, standings: result.standings };
});

app.post('/api/tournaments/:id/join', async (request, reply) => {
  const { id } = request.params as { id: string };
  const body = request.body as any;
  const result = await joinTournament(id, {
    playerId: body.playerId,
    playerName: body.playerName || '玩家'
  });
  if (result.error) {
    reply.code(400);
    return { error: result.error };
  }
  return { tournament: result.tournament };
});

app.post('/api/tournaments/:id/start', async (request, reply) => {
  const { id } = request.params as { id: string };
  const body = request.body as any;
  const result = await startTournament(id, body.playerId);
  if (result.error) {
    reply.code(400);
    return { error: result.error };
  }
  return { tournament: result.tournament };
});

app.get('/api/tournaments/:id/current-stage', async (request, reply) => {
  const { id } = request.params as { id: string };
  const result = await getCurrentStage(id);
  if (result.error) {
    reply.code(404);
    return { error: result.error };
  }
  return {
    tournament: result.tournament,
    standings: result.standings,
    canEnterRace: result.canEnterRace,
    countdownRemaining: result.countdownRemaining,
    currentStage: result.currentStage,
    currentStageIndex: result.currentStageIndex
  };
});

app.post('/api/tournaments/:id/create-stage-room', async (request, reply) => {
  const { id } = request.params as { id: string };
  const body = request.body as any;
  const result = await createStageRoom(id, body.playerId);
  if (result.error) {
    reply.code(400);
    return { error: result.error };
  }
  return { tournament: result.tournament, roomId: result.roomId };
});

app.post('/api/tournaments/:id/mark-racing', async (request, reply) => {
  const { id } = request.params as { id: string };
  const body = request.body as any;
  const result = await markStageRacing(id, body.stageIndex);
  if (result.error) {
    reply.code(400);
    return { error: result.error };
  }
  return { tournament: result.tournament };
});

app.post('/api/tournaments/:id/submit-result', async (request, reply) => {
  const { id } = request.params as { id: string };
  const body = request.body as any;
  const result = await submitStageResults(id, {
    stageIndex: body.stageIndex,
    results: body.results || []
  });
  if (result.error) {
    reply.code(400);
    return { error: result.error };
  }
  return {
    tournament: result.tournament,
    standings: result.standings,
    isFinished: result.isFinished
  };
});

app.get('/api/tournaments/:id/standings', async (request, reply) => {
  const { id } = request.params as { id: string };
  const result = await getStandings(id);
  if (result.error) {
    reply.code(404);
    return { error: result.error };
  }
  return { standings: result.standings };
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

    if (!rooms_gameConnections.has(roomId)) {
      rooms_gameConnections.set(roomId, new Map());
    }
    rooms_gameConnections.get(roomId)!.set(playerId, connection.socket);

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
      const conns = rooms_gameConnections.get(roomId);
      if (conns) conns.delete(playerId);
    });

    connection.socket.on('error', (error) => {
      console.error('WebSocket error:', error);
      clearInterval(stateInterval);
      disconnectPlayer(roomId, playerId);
      const conns = rooms_gameConnections.get(roomId);
      if (conns) conns.delete(playerId);
    });
  });

  fastify.get('/ws/spectate/:roomId/:spectatorId', { websocket: true }, (connection, request) => {
    const { roomId, spectatorId } = request.params as { roomId: string; spectatorId: string };

    const room = getRoom(roomId);
    if (!room || room.gameState === 'finished') {
      connection.socket.send(JSON.stringify({
        type: 'race_ended',
        message: '比赛已结束'
      }));
      setTimeout(() => connection.socket.close(), 100);
      return;
    }

    addSpectator(roomId, spectatorId);

    const stateInterval = setInterval(() => {
      const currentRoom = getRoom(roomId);
      if (!currentRoom || currentRoom.gameState === 'finished') {
        connection.socket.send(JSON.stringify({
          type: 'race_ended',
          message: '比赛已结束'
        }));
        clearInterval(stateInterval);
        removeSpectator(roomId, spectatorId);
        setTimeout(() => connection.socket.close(), 100);
        return;
      }

      const state = getGameStateForSpectator(roomId);
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

        if (data.type === 'danmaku') {
          const text = (data.text || '').trim().slice(0, 40);
          if (!text) return;
          if (!checkDanmakuCooldown(roomId, spectatorId)) return;

          const danmakuMsg = JSON.stringify({
            type: 'danmaku',
            spectatorId,
            playerName: data.playerName || '观战者',
            text,
            timestamp: Date.now()
          });

          const spectatorState = rooms_spectatorConnections.get(roomId);
          if (spectatorState) {
            for (const [id, conn] of spectatorState) {
              if (conn.readyState === 1) {
                conn.send(danmakuMsg);
              }
            }
          }

          const gameConnections = rooms_gameConnections.get(roomId);
          if (gameConnections) {
            for (const [id, conn] of gameConnections) {
              if (conn.readyState === 1) {
                conn.send(danmakuMsg);
              }
            }
          }
        }
      } catch (error) {
        console.error('Spectator WebSocket message error:', error);
      }
    });

    connection.socket.on('close', () => {
      clearInterval(stateInterval);
      removeSpectator(roomId, spectatorId);
      const conns = rooms_spectatorConnections.get(roomId);
      if (conns) conns.delete(spectatorId);
    });

    connection.socket.on('error', (error) => {
      console.error('Spectator WebSocket error:', error);
      clearInterval(stateInterval);
      removeSpectator(roomId, spectatorId);
      const conns = rooms_spectatorConnections.get(roomId);
      if (conns) conns.delete(spectatorId);
    });

    if (!rooms_spectatorConnections.has(roomId)) {
      rooms_spectatorConnections.set(roomId, new Map());
    }
    rooms_spectatorConnections.get(roomId)!.set(spectatorId, connection.socket);
  });
});

const start = async () => {
  try {
    await initRedis();
    await app.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`Space Racer server running on port ${PORT}`);
    
    console.log('=== Registered Routes Tree ===');
    console.log(app.printRoutes());
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
