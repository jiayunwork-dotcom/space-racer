import type { Room, Player, Track, Ship, EngineType, ShipColorIndex, Replay, ReplayFrame, RaceReplay } from '../types/game';
import { v4 as uuidv4 } from 'uuid';
import { getTrack, incrementTrackPlayCount, addLeaderboardEntry, addGlobalWin, addGlobalRace, saveReplay, saveRaceReplay, getRaceReplay } from './redis';
import { createGameEngine, createShip, updateGame, getRaceResults, type GameEngineState } from '../game/engine';
import {
  createReplayRecorder,
  startRecording,
  recordFrame,
  recordItemPickup,
  recordItemUse,
  recordShipCollision,
  recordBoundaryCollision,
  recordAsteroidCollision,
  recordLapComplete,
  recordRaceFinish,
  buildRaceReplay,
  type ReplayRecorderState
} from '../game/replayRecorder';
import { vecLength } from '../utils/vector';

interface RoomState {
  room: Room;
  engine: GameEngineState | null;
  track: Track | null;
  lastUpdate: number;
  updateInterval: NodeJS.Timeout | null;
  replayData: Map<string, ReplayFrame[]>;
  raceStartTime: number;
  replayRecorder: ReplayRecorderState | null;
  lastRaceReplayId: string | null;
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
    raceStartTime: 0,
    replayRecorder: null,
    lastRaceReplayId: null
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

  const playerIds = readyPlayers.map(p => p.id);
  state.replayRecorder = createReplayRecorder(
    room.id,
    track.id,
    track.name,
    room.totalLaps,
    playerIds
  );
  state.lastRaceReplayId = null;

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
  let raceStarted = false;

  state.updateInterval = setInterval(() => {
    const s = rooms.get(roomId);
    if (!s || !s.engine) return;

    const now = Date.now();
    
    if (s.room.gameState === 'racing' && s.raceStartTime === 0) {
      s.raceStartTime = now;
      if (s.replayRecorder) {
        startRecording(s.replayRecorder, now);
        raceStarted = true;
      }
    }

    const prevShipStates = new Map<string, {
      shield: number;
      item: typeof s.room.ships[0]['item'];
      lap: number;
      finished: boolean;
      boostEndTime: number;
    }>();

    for (const ship of s.room.ships) {
      prevShipStates.set(ship.playerId, {
        shield: ship.shield,
        item: ship.item,
        lap: ship.lap,
        finished: ship.finished,
        boostEndTime: ship.boostEndTime
      });
    }

    const prevShipCount = s.room.ships.length;
    const prevProjectileCount = s.room.projectiles.length;
    const prevMineCount = s.room.mines.length;

    updateGame(s.engine, now);

    if (s.room.gameState === 'racing' && s.replayRecorder && raceStarted) {
      for (const ship of s.room.ships) {
        const prev = prevShipStates.get(ship.playerId);
        if (!prev) continue;

        if (prev.item === null && ship.item !== null) {
          recordItemPickup(s.replayRecorder, ship, ship.item, now);
        }

        if (prev.item !== null && ship.item === null && prev.boostEndTime === ship.boostEndTime) {
          const itemType = prev.item;
          if (itemType === 'shield' && ship.shield > prev.shield) {
            recordItemUse(s.replayRecorder, ship, itemType, now);
          } else if (itemType === 'boost' && ship.boostEndTime > prev.boostEndTime) {
            recordItemUse(s.replayRecorder, ship, itemType, now);
          } else if (itemType === 'missile' && s.room.projectiles.length > prevProjectileCount) {
            recordItemUse(s.replayRecorder, ship, itemType, now);
          } else if (itemType === 'mine' && s.room.mines.length > prevMineCount) {
            recordItemUse(s.replayRecorder, ship, itemType, now);
          } else if (itemType === 'emp') {
            recordItemUse(s.replayRecorder, ship, itemType, now);
          }
        }

        if (ship.shield < prev.shield && ship.shield > 0) {
          const damage = prev.shield - ship.shield;
          if (damage >= 10 && damage < 25) {
            recordBoundaryCollision(s.replayRecorder, ship, now);
          } else if (damage >= 20) {
            recordShipCollision(s.replayRecorder, ship, 
              s.room.ships.find(s2 => s2.playerId !== ship.playerId) || ship, 
              now);
          }
        }

        if (ship.lap > prev.lap && ship.lap > 0) {
          const lapTime = now - ship.lapStartTime + (ship.lapStartTime > 0 ? 0 : 0);
          if (ship.bestLapTime) {
            recordLapComplete(s.replayRecorder, ship, ship.lap, ship.bestLapTime, now);
          }
        }

        if (ship.finished && !prev.finished) {
          recordRaceFinish(s.replayRecorder, ship, ship.finishPosition || 1, now);
        }
      }

      recordFrameCounter++;
      if (recordFrameCounter % 2 === 0) {
        recordFrame(
          s.replayRecorder,
          s.room.ships,
          s.room.projectiles,
          s.room.mines,
          s.room.itemSpawners,
          now
        );
      }

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

  if (state.replayRecorder) {
    const raceReplay = buildRaceReplay(
      state.replayRecorder,
      state.room.ships,
      Date.now()
    );
    saveRaceReplay(raceReplay);
    state.lastRaceReplayId = raceReplay.id;
  }

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

export function getLastRaceReplayId(roomId: string): string | null {
  const state = rooms.get(roomId);
  return state?.lastRaceReplayId || null;
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
