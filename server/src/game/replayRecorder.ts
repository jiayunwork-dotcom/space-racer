import type {
  Ship,
  ReplayEvent,
  RaceReplayFrame,
  ShipReplayFrame,
  RaceReplay,
  PlayerRaceStats,
  LapTime,
  ItemType,
  Projectile,
  Mine,
  ItemSpawner,
  Track
} from '../types/game';
import { v4 as uuidv4 } from 'uuid';
import { vecLength } from '../utils/vector';

export interface ReplayRecorderState {
  events: ReplayEvent[];
  collisions: Array<{
    position: { x: number; y: number };
    timestamp: number;
    type: 'ship' | 'boundary' | 'asteroid';
    playerId: string;
  }>;
  frames: RaceReplayFrame[];
  playerStats: Map<string, {
    itemPickups: number;
    itemUses: number;
    collisions: number;
    lapTimes: LapTime[];
  }>;
  startTime: number;
  roomId: string;
  trackId: string;
  trackName: string;
  totalLaps: number;
}

export function createReplayRecorder(
  roomId: string,
  trackId: string,
  trackName: string,
  totalLaps: number,
  playerIds: string[]
): ReplayRecorderState {
  const playerStats = new Map();
  for (const id of playerIds) {
    playerStats.set(id, {
      itemPickups: 0,
      itemUses: 0,
      collisions: 0,
      lapTimes: []
    });
  }

  return {
    events: [],
    collisions: [],
    frames: [],
    playerStats,
    startTime: 0,
    roomId,
    trackId,
    trackName,
    totalLaps
  };
}

export function startRecording(recorder: ReplayRecorderState, startTime: number): void {
  recorder.startTime = startTime;
}

export function recordItemPickup(
  recorder: ReplayRecorderState,
  ship: Ship,
  itemType: ItemType,
  currentTime: number
): void {
  const elapsed = currentTime - recorder.startTime;
  const event: ReplayEvent = {
    id: uuidv4(),
    timestamp: elapsed,
    type: 'item_pickup',
    playerId: ship.playerId,
    playerName: ship.playerName,
    position: { ...ship.position },
    itemType
  };
  recorder.events.push(event);

  const stats = recorder.playerStats.get(ship.playerId);
  if (stats) {
    stats.itemPickups++;
  }
}

export function recordItemUse(
  recorder: ReplayRecorderState,
  ship: Ship,
  itemType: ItemType,
  currentTime: number,
  targetShip?: Ship
): void {
  const elapsed = currentTime - recorder.startTime;
  const event: ReplayEvent = {
    id: uuidv4(),
    timestamp: elapsed,
    type: 'item_use',
    playerId: ship.playerId,
    playerName: ship.playerName,
    position: { ...ship.position },
    itemType
  };
  if (targetShip) {
    event.targetPlayerId = targetShip.playerId;
    event.targetPlayerName = targetShip.playerName;
  }
  recorder.events.push(event);

  const stats = recorder.playerStats.get(ship.playerId);
  if (stats) {
    stats.itemUses++;
  }
}

export function recordShipCollision(
  recorder: ReplayRecorderState,
  shipA: Ship,
  shipB: Ship,
  currentTime: number
): void {
  const elapsed = currentTime - recorder.startTime;
  const midPos = {
    x: (shipA.position.x + shipB.position.x) / 2,
    y: (shipA.position.y + shipB.position.y) / 2
  };

  const eventA: ReplayEvent = {
    id: uuidv4(),
    timestamp: elapsed,
    type: 'collision_ship',
    playerId: shipA.playerId,
    playerName: shipA.playerName,
    position: { ...shipA.position },
    targetPlayerId: shipB.playerId,
    targetPlayerName: shipB.playerName
  };
  recorder.events.push(eventA);

  const eventB: ReplayEvent = {
    id: uuidv4(),
    timestamp: elapsed,
    type: 'collision_ship',
    playerId: shipB.playerId,
    playerName: shipB.playerName,
    position: { ...shipB.position },
    targetPlayerId: shipA.playerId,
    targetPlayerName: shipA.playerName
  };
  recorder.events.push(eventB);

  recorder.collisions.push({
    position: midPos,
    timestamp: elapsed,
    type: 'ship',
    playerId: shipA.playerId
  });
  recorder.collisions.push({
    position: midPos,
    timestamp: elapsed,
    type: 'ship',
    playerId: shipB.playerId
  });

  const statsA = recorder.playerStats.get(shipA.playerId);
  if (statsA) statsA.collisions++;
  const statsB = recorder.playerStats.get(shipB.playerId);
  if (statsB) statsB.collisions++;
}

export function recordBoundaryCollision(
  recorder: ReplayRecorderState,
  ship: Ship,
  currentTime: number
): void {
  const elapsed = currentTime - recorder.startTime;
  const event: ReplayEvent = {
    id: uuidv4(),
    timestamp: elapsed,
    type: 'collision_boundary',
    playerId: ship.playerId,
    playerName: ship.playerName,
    position: { ...ship.position }
  };
  recorder.events.push(event);

  recorder.collisions.push({
    position: { ...ship.position },
    timestamp: elapsed,
    type: 'boundary',
    playerId: ship.playerId
  });

  const stats = recorder.playerStats.get(ship.playerId);
  if (stats) stats.collisions++;
}

export function recordAsteroidCollision(
  recorder: ReplayRecorderState,
  ship: Ship,
  currentTime: number
): void {
  const elapsed = currentTime - recorder.startTime;
  const event: ReplayEvent = {
    id: uuidv4(),
    timestamp: elapsed,
    type: 'collision_asteroid',
    playerId: ship.playerId,
    playerName: ship.playerName,
    position: { ...ship.position }
  };
  recorder.events.push(event);

  recorder.collisions.push({
    position: { ...ship.position },
    timestamp: elapsed,
    type: 'asteroid',
    playerId: ship.playerId
  });

  const stats = recorder.playerStats.get(ship.playerId);
  if (stats) stats.collisions++;
}

export function recordLapComplete(
  recorder: ReplayRecorderState,
  ship: Ship,
  lapNumber: number,
  lapTime: number,
  currentTime: number
): void {
  const elapsed = currentTime - recorder.startTime;
  const event: ReplayEvent = {
    id: uuidv4(),
    timestamp: elapsed,
    type: 'lap_complete',
    playerId: ship.playerId,
    playerName: ship.playerName,
    lap: lapNumber,
    lapTime
  };
  recorder.events.push(event);

  const stats = recorder.playerStats.get(ship.playerId);
  if (stats) {
    stats.lapTimes.push({ lap: lapNumber, time: lapTime });
  }
}

export function recordRaceFinish(
  recorder: ReplayRecorderState,
  ship: Ship,
  finishPosition: number,
  currentTime: number
): void {
  const elapsed = currentTime - recorder.startTime;
  const event: ReplayEvent = {
    id: uuidv4(),
    timestamp: elapsed,
    type: 'race_finish',
    playerId: ship.playerId,
    playerName: ship.playerName,
    lap: finishPosition
  };
  recorder.events.push(event);
}

export function recordFrame(
  recorder: ReplayRecorderState,
  ships: Ship[],
  projectiles: Projectile[],
  mines: Mine[],
  itemSpawners: ItemSpawner[],
  currentTime: number
): void {
  const elapsed = currentTime - recorder.startTime;

  const shipFrames: ShipReplayFrame[] = ships.map(ship => ({
    playerId: ship.playerId,
    playerName: ship.playerName,
    colorIndex: ship.colorIndex,
    position: { ...ship.position },
    velocity: { ...ship.velocity },
    angle: ship.angle,
    shield: ship.shield,
    maxShield: ship.maxShield,
    lap: ship.lap,
    currentCheckpoint: ship.currentCheckpoint,
    boostEndTime: ship.boostEndTime,
    stunnedUntil: ship.stunnedUntil,
    slowdownUntil: ship.slowdownUntil,
    item: ship.item,
    isRespawning: ship.isRespawning,
    finished: ship.finished
  }));

  const frame: RaceReplayFrame = {
    timestamp: elapsed,
    ships: shipFrames,
    projectiles: projectiles.map(p => ({
      id: p.id,
      type: p.type,
      position: { ...p.position },
      velocity: { ...p.velocity },
      ownerId: p.ownerId
    })),
    mines: mines.map(m => ({
      id: m.id,
      position: { ...m.position }
    })),
    itemSpawners: itemSpawners.map(s => ({
      id: s.id,
      position: { ...s.position },
      currentItem: s.currentItem
    }))
  };

  recorder.frames.push(frame);
}

export function buildRaceReplay(
  recorder: ReplayRecorderState,
  ships: Ship[],
  endTime: number
): RaceReplay {
  const sortedShips = [...ships].sort((a, b) => {
    if (a.finished && b.finished) return (a.finishTime || 0) - (b.finishTime || 0);
    if (a.finished) return -1;
    if (b.finished) return 1;
    if (a.lap !== b.lap) return b.lap - a.lap;
    return b.currentCheckpoint - a.currentCheckpoint;
  });

  const players: PlayerRaceStats[] = sortedShips.map((ship, index) => {
    const stats = recorder.playerStats.get(ship.playerId) || {
      itemPickups: 0,
      itemUses: 0,
      collisions: 0,
      lapTimes: []
    };

    let bestLapTime: number | null = null;
    if (stats.lapTimes.length > 0) {
      bestLapTime = Math.min(...stats.lapTimes.map(t => t.time));
    }

    return {
      playerId: ship.playerId,
      playerName: ship.playerName,
      colorIndex: ship.colorIndex,
      totalTime: ship.finishTime ? ship.finishTime - recorder.startTime : null,
      bestLapTime,
      lapTimes: stats.lapTimes,
      itemPickups: stats.itemPickups,
      itemUses: stats.itemUses,
      collisions: stats.collisions,
      finishPosition: ship.finished ? index + 1 : null
    };
  });

  return {
    id: uuidv4(),
    roomId: recorder.roomId,
    trackId: recorder.trackId,
    trackName: recorder.trackName,
    totalLaps: recorder.totalLaps,
    startTime: recorder.startTime,
    endTime,
    duration: endTime - recorder.startTime,
    frames: recorder.frames,
    events: recorder.events,
    players,
    collisions: recorder.collisions,
    createdAt: Date.now()
  };
}

export function getInstantSpeed(velocity: { x: number; y: number }): number {
  return vecLength(velocity);
}
