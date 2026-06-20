import type { Room, Player, Track, Ship, EngineType, ShipColorIndex, Replay, ReplayFrame } from '../types/game';
import { v4 as uuidv4 } from 'uuid';
import { getTrack, incrementTrackPlayCount, addLeaderboardEntry, addGlobalWin, addGlobalRace, saveReplay } from './redis';
import { createGameEngine, createShip, updateGame, getRaceResults, type GameEngineState } from '../game/engine';

interface RoomState {
  room: Room;
  engine: GameEngineState | null;
  track: Track | null;
  lastUpdate: number;
  updateInterval: NodeJS.Timeout | null;
  replayData: Map<string, ReplayFrame[]>;
  raceStartTime: number;
}

const rooms = new Map<string, RoomState>();

export function createRoom(
  hostId: string,
  hostName: string,
  roomName: string,
  trackId: string,
  totalLaps: number,
  maxPlayers: number = 8
): Room {
  const roomId = uuidv4();

  const player: Player = {
    id: hostId,
    name: hostName,
    ship: null,
    isReady: false,
    isHost: true,
    disconnected: false,
    disconnectTime: 0
  };

  const room: Room = {
    id: roomId,
    name: roomName,
    hostId,
    trackId,
    totalLaps,
    maxPlayers,
    players: [player],
    gameState: 'waiting',
    countdownEndTime: 0,
    raceStartTime: 0,
    ships: [],
    projectiles: [],
    mines: [],
    envElements: [],
    itemSpawners: [],
    createdAt: Date.now()
  };

  rooms.set(roomId, {
    room,
    engine: null,
    track: null,
    lastUpdate: 0,
    updateInterval: null,
    replayData: new Map(),
    raceStartTime: 0
  });

  return room;
}

export function getRoom(roomId: string): Room | null {
  const state = rooms.get(roomId);
  return state?.room || null;
}

export function getAllRooms(): Room[] {
  const result: Room[] = [];
  for (const state of rooms.values()) {
    if (state.room.gameState === 'waiting') {
      result.push(state.room);
    }
  }
  return result;
}

export async function joinRoom(
  roomId: string,
  playerId: string,
  playerName: string
): Promise<Room | null> {
  const state = rooms.get(roomId);
  if (!state) return null;

  const { room } = state;

  if (room.players.length >= room.maxPlayers) return null;
  if (room.gameState !== 'waiting') return null;

  const existingPlayer = room.players.find(p => p.id === playerId);
  if (existingPlayer) {
    existingPlayer.disconnected = false;
    return room;
  }

  const player: Player = {
    id: playerId,
    name: playerName,
    ship: null,
    isReady: false,
    isHost: false,
    disconnected: false,
    disconnectTime: 0
  };

  room.players.push(player);
  return room;
}

export function leaveRoom(roomId: string, playerId: string): boolean {
  const state = rooms.get(roomId);
  if (!state) return false;

  const { room } = state;
  const playerIndex = room.players.findIndex(p => p.id === playerId);

  if (playerIndex === -1) return false;

  room.players.splice(playerIndex, 1);

  if (room.players.length === 0) {
    if (state.updateInterval) {
      clearInterval(state.updateInterval);
    }
    rooms.delete(roomId);
    return true;
  }

  if (room.hostId === playerId) {
    room.hostId = room.players[0].id;
    room.players[0].isHost = true;
  }

  return true;
}

export function setPlayerReady(
  roomId: string,
  playerId: string,
  isReady: boolean
): Room | null {
  const state = rooms.get(roomId);
  if (!state) return null;

  const { room } = state;
  const player = room.players.find(p => p.id === playerId);

  if (!player) return null;

  player.isReady = isReady;
  return room;
}

export function setPlayerShipConfig(
  roomId: string,
  playerId: string,
  engineType: EngineType,
  colorIndex: ShipColorIndex
): Room | null {
  const state = rooms.get(roomId);
  if (!state) return null;

  const { room } = state;
  return room;
}

export async function startGame(roomId: string, hostId: string): Promise<Room | null> {
  const state = rooms.get(roomId);
  if (!state) return null;

  const { room } = state;

  if (room.hostId !== hostId) return null;
  if (room.gameState !== 'waiting') return null;

  const readyPlayers = room.players.filter(p => p.isReady && !p.disconnected);
  if (readyPlayers.length < 2) return null;

  const track = await getTrack(room.trackId);
  if (!track) return null;

  state.track = track;

  room.ships = [];
  room.projectiles = [];
  room.mines = [];
  room.envElements = JSON.parse(JSON.stringify(track.envElements));
  room.itemSpawners = JSON.parse(JSON.stringify(track.itemSpawners));

  const sortedPlayers = [...readyPlayers].sort((a, b) => a.id.localeCompare(b.id));

  for (let i = 0; i < sortedPlayers.length; i++) {
    const player = sortedPlayers[i];
    const ship = createShip(
      player.id,
      player.name,
      'balanced',
      i % 6,
      track.startPosition,
      track.startAngle,
      i
    );
    room.ships.push(ship);
    player.ship = ship;
  }

  const engine = createGameEngine(room, track);
  state.engine = engine;

  state.replayData.clear();
  for (const player of readyPlayers) {
    state.replayData.set(player.id, []);
  }

  room.gameState = 'countdown';
  room.countdownEndTime = Date.now() + 3000;

  startGameLoop(roomId);

  await incrementTrackPlayCount(room.trackId);

  return room;
}

function startGameLoop(roomId: string): void {
  const state = rooms.get(roomId);
  if (!state) return;

  const tickRate = 60;
  const tickInterval = 1000 / tickRate;
  let recordFrameCounter = 0;

  state.updateInterval = setInterval(() => {
    const s = rooms.get(roomId);
    if (!s || !s.engine) return;

    const now = Date.now();
    
    if (s.room.gameState === 'racing' && s.raceStartTime === 0) {
      s.raceStartTime = now;
    }

    updateGame(s.engine, now);

    if (s.room.gameState === 'racing') {
      recordFrameCounter++;
      if (recordFrameCounter % 2 === 0) {
        const elapsed = now - s.raceStartTime;
        for (const ship of s.room.ships) {
          const frames = s.replayData.get(ship.playerId);
          if (frames && !ship.finished) {
            frames.push({
              timestamp: elapsed,
              position: { ...ship.position },
              velocity: { ...ship.velocity },
              angle: ship.angle
            });
          }
        }
      }
    }

    if (s.room.gameState === 'finished') {
      handleRaceFinish(roomId);
    }
  }, tickInterval);
}

function handleRaceFinish(roomId: string): void {
  const state = rooms.get(roomId);
  if (!state || !state.engine || !state.track) return;

  if (state.updateInterval) {
    clearInterval(state.updateInterval);
    state.updateInterval = null;
  }

  const results = getRaceResults(state.engine);

  for (let i = 0; i < results.length; i++) {
    const ship = results[i];
    
    if (ship.bestLapTime) {
      addLeaderboardEntry(state.track.id, ship.playerName, ship.bestLapTime);
    }

    addGlobalRace(ship.playerName);

    if (i === 0) {
      addGlobalWin(ship.playerName);
    }

    if (ship.finished && ship.finishTime) {
      const frames = state.replayData.get(ship.playerId);
      if (frames && frames.length > 0) {
        const replay: Replay = {
          id: uuidv4(),
          trackId: state.track.id,
          playerName: ship.playerName,
          totalTime: ship.finishTime - state.raceStartTime,
          bestLapTime: ship.bestLapTime,
          frames,
          createdAt: Date.now()
        };
        saveReplay(replay);
      }
    }
  }
}

export function setPlayerInput(
  roomId: string,
  playerId: string,
  input: { thrust: boolean; left: boolean; right: boolean; useItem: boolean }
): void {
  const state = rooms.get(roomId);
  if (!state || !state.engine) return;

  state.engine.inputs.set(playerId, input);
}

export function getGameStateForPlayer(roomId: string, playerId: string): any {
  const state = rooms.get(roomId);
  if (!state) return null;

  const { room } = state;

  return {
    room: {
      id: room.id,
      name: room.name,
      trackId: room.trackId,
      totalLaps: room.totalLaps,
      maxPlayers: room.maxPlayers,
      gameState: room.gameState,
      countdownEndTime: room.countdownEndTime,
      raceStartTime: room.raceStartTime
    },
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      isReady: p.isReady,
      isHost: p.isHost,
      disconnected: p.disconnected
    })),
    ships: room.ships.map(s => ({
      id: s.id,
      playerId: s.playerId,
      playerName: s.playerName,
      position: s.position,
      velocity: s.velocity,
      angle: s.angle,
      angularVelocity: s.angularVelocity,
      shield: s.shield,
      maxShield: s.maxShield,
      engineType: s.engineType,
      colorIndex: s.colorIndex,
      currentCheckpoint: s.currentCheckpoint,
      lap: s.lap,
      lapStartTime: s.lapStartTime,
      bestLapTime: s.bestLapTime,
      finished: s.finished,
      finishTime: s.finishTime,
      finishPosition: s.finishPosition,
      item: s.item,
      boostEndTime: s.boostEndTime,
      stunnedUntil: s.stunnedUntil,
      slowdownUntil: s.slowdownUntil,
      isRespawning: s.isRespawning,
      itemUses: s.itemUses
    })),
    projectiles: room.projectiles.map(p => ({
      id: p.id,
      type: p.type,
      position: p.position,
      velocity: p.velocity,
      ownerId: p.ownerId
    })),
    mines: room.mines.map(m => ({
      id: m.id,
      position: m.position
    })),
    envElements: room.envElements,
    itemSpawners: room.itemSpawners.map(s => ({
      id: s.id,
      position: s.position,
      currentItem: s.currentItem
    }))
  };
}

export function disconnectPlayer(roomId: string, playerId: string): void {
  const state = rooms.get(roomId);
  if (!state) return;

  const player = state.room.players.find(p => p.id === playerId);
  if (player) {
    player.disconnected = true;
    player.disconnectTime = Date.now();
  }

  const ship = state.room.ships.find(s => s.playerId === playerId);
  if (ship) {
    // Mark ship as disconnected but keep it in the race for now
  }
}

export function reconnectPlayer(roomId: string, playerId: string): boolean {
  const state = rooms.get(roomId);
  if (!state) return false;

  const player = state.room.players.find(p => p.id === playerId);
  if (!player) return false;

  if (Date.now() - player.disconnectTime > 5000) {
    return false;
  }

  player.disconnected = false;
  return true;
}

export function cleanupDisconnectedPlayers(): void {
  const now = Date.now();
  const DISCONNECT_TIMEOUT = 5000;

  for (const [roomId, state] of rooms) {
    const { room } = state;
    
    for (let i = room.players.length - 1; i >= 0; i--) {
      const player = room.players[i];
      if (player.disconnected && now - player.disconnectTime > DISCONNECT_TIMEOUT) {
        room.players.splice(i, 1);
        
        const shipIndex = room.ships.findIndex(s => s.playerId === player.id);
        if (shipIndex !== -1) {
          room.ships.splice(shipIndex, 1);
        }
      }
    }

    if (room.players.length === 0 && state.updateInterval) {
      clearInterval(state.updateInterval);
      state.updateInterval = null;
      rooms.delete(roomId);
    }
  }
}

setInterval(cleanupDisconnectedPlayers, 1000);
