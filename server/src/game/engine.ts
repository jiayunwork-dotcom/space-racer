import type { Room, Ship, Track, InputState, Player, EnvElement, ItemSpawner, Projectile, Mine, ItemType } from '../types/game';
import { PHYSICS_CONFIG, ENGINE_CONFIGS } from '../types/game';
import { v4 as uuidv4 } from 'uuid';
import { sampleBezier, type BezierSample } from '../utils/bezier';
import { vec2 } from '../utils/vector';
import { updateShipPhysics, updateShipCollisions } from './physics';
import { checkCheckpoint, checkRaceFinish, getSortedShips } from './checkpoints';
import { updateItemSpawners, checkItemPickup, useItem, updateProjectiles, updateMines } from './items';

export interface EngineEvent {
  type: 'item_pickup' | 'item_use' | 'collision_ship' | 'collision_boundary' | 'collision_asteroid' | 'lap_complete' | 'race_finish';
  timestamp: number;
  playerId: string;
  playerName: string;
  position?: { x: number; y: number };
  itemType?: ItemType;
  targetPlayerId?: string;
  targetPlayerName?: string;
  lap?: number;
  lapTime?: number;
  finishPosition?: number;
}

export interface GameEngineState {
  room: Room;
  track: Track;
  outerSamples: BezierSample[];
  innerSamples: BezierSample[];
  inputs: Map<string, InputState>;
  lastUpdateTime: number;
  finishCount: number;
  events: EngineEvent[];
  prevShieldValues: Map<string, number>;
  prevItems: Map<string, ItemType | null>;
  prevLaps: Map<string, number>;
  prevFinished: Map<string, boolean>;
}

export function createGameEngine(room: Room, track: Track): GameEngineState {
  const outerSamples = sampleBezier(track.outerBoundary.controlPoints, 200);
  const innerSamples = sampleBezier(track.innerBoundary.controlPoints, 200);

  const prevShieldValues = new Map<string, number>();
  const prevItems = new Map<string, ItemType | null>();
  const prevLaps = new Map<string, number>();
  const prevFinished = new Map<string, boolean>();

  for (const ship of room.ships) {
    prevShieldValues.set(ship.playerId, ship.shield);
    prevItems.set(ship.playerId, ship.item);
    prevLaps.set(ship.playerId, ship.lap);
    prevFinished.set(ship.playerId, ship.finished);
  }

  return {
    room,
    track,
    outerSamples,
    innerSamples,
    inputs: new Map(),
    lastUpdateTime: 0,
    finishCount: 0,
    events: [],
    prevShieldValues,
    prevItems,
    prevLaps,
    prevFinished
  };
}

export function createShip(
  playerId: string,
  playerName: string,
  engineType: 'speed' | 'balanced' | 'agile',
  colorIndex: number,
  startPosition: { x: number; y: number },
  startAngle: number,
  index: number
): Ship {
  const angleOffset = (index - 3) * 0.5;
  const distanceOffset = Math.abs(index - 3) * 30;

  return {
    id: uuidv4(),
    playerId,
    playerName,
    position: {
      x: startPosition.x + Math.cos(startAngle - Math.PI / 2) * distanceOffset,
      y: startPosition.y + Math.sin(startAngle - Math.PI / 2) * distanceOffset
    },
    velocity: { x: 0, y: 0 },
    angle: startAngle + angleOffset * 0.05,
    angularVelocity: 0,
    shield: 100,
    maxShield: 100,
    engineType,
    colorIndex: colorIndex as 0 | 1 | 2 | 3 | 4 | 5,
    currentCheckpoint: 0,
    lap: 0,
    lapStartTime: 0,
    bestLapTime: null,
    totalTime: 0,
    finished: false,
    finishTime: null,
    finishPosition: null,
    item: null,
    boostEndTime: 0,
    stunnedUntil: 0,
    slowdownUntil: 0,
    lastCheckpointPos: { ...startPosition },
    isRespawning: false,
    respawnTime: 0,
    itemUses: 0
  };
}

export function setPlayerInput(
  engine: GameEngineState,
  playerId: string,
  input: InputState
): void {
  engine.inputs.set(playerId, input);
}

export function updateGame(engine: GameEngineState, currentTime: number): void {
  const { room, track, outerSamples, innerSamples, inputs } = engine;

  if (room.gameState === 'countdown') {
    if (currentTime >= room.countdownEndTime) {
      startRace(engine, currentTime);
    }
    return;
  }

  if (room.gameState !== 'racing') return;

  const dt = Math.min((currentTime - engine.lastUpdateTime) / 1000, 0.05);
  engine.lastUpdateTime = currentTime;

  updateItemSpawners(room.itemSpawners, currentTime);

  for (const ship of room.ships) {
    if (ship.isRespawning) {
      ship.respawnTime -= dt;
      if (ship.respawnTime <= 0) {
        ship.isRespawning = false;
      }
      continue;
    }

    const input = inputs.get(ship.playerId) || { thrust: false, left: false, right: false, useItem: false };
    
    if (input.useItem) {
      useItem(ship, room.ships, room.projectiles, room.mines, currentTime);
    }

    updateShipPhysics(
      ship,
      input,
      dt,
      currentTime,
      room.envElements,
      outerSamples,
      innerSamples
    );

    checkItemPickup(ship, room.itemSpawners);

    const result = checkCheckpoint(ship, track.checkpoints, currentTime);
    if (result.lapCompleted) {
      // Lap completed
    }

    if (ship.shield <= 0) {
      ship.isRespawning = true;
      ship.respawnTime = PHYSICS_CONFIG.respawnTime;
      ship.position = { ...ship.lastCheckpointPos };
      ship.velocity = vec2(0, 0);
      ship.angularVelocity = 0;
      ship.shield = ship.maxShield;
    }
  }

  updateShipCollisions(room.ships);

  updateProjectiles(room.projectiles, room.ships, dt, currentTime);
  updateMines(room.mines, room.ships);

  for (const ship of room.ships) {
    if (!ship.finished) {
      const finished = checkRaceFinish(ship, room.totalLaps, currentTime, engine.finishCount + 1);
      if (finished) {
        engine.finishCount++;
      }
    }
  }

  const activeShips = room.ships.filter(s => !s.finished);
  if (activeShips.length === 0) {
    room.gameState = 'finished';
  }
}

export function startRace(engine: GameEngineState, currentTime: number): void {
  const { room } = engine;
  room.gameState = 'racing';
  room.raceStartTime = currentTime;
  engine.lastUpdateTime = currentTime;
  engine.finishCount = 0;

  for (const ship of room.ships) {
    ship.lapStartTime = currentTime;
    ship.lap = 0;
    ship.currentCheckpoint = 0;
  }
}

export function getRaceResults(engine: GameEngineState): Ship[] {
  return getSortedShips(engine.room.ships);
}
