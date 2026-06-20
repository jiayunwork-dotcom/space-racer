export interface Vector2 {
  x: number;
  y: number;
}

export type EngineType = 'speed' | 'balanced' | 'agile';

export interface EngineConfig {
  thrust: number;
  maxSpeed: number;
  angularSpeed: number;
  mass: number;
  angularDamping: number;
}

export const ENGINE_CONFIGS: Record<EngineType, EngineConfig> = {
  speed: {
    thrust: 250,
    maxSpeed: 400,
    angularSpeed: 2.5,
    mass: 2.0,
    angularDamping: 0.95
  },
  balanced: {
    thrust: 180,
    maxSpeed: 320,
    angularSpeed: 3.5,
    mass: 1.5,
    angularDamping: 0.92
  },
  agile: {
    thrust: 120,
    maxSpeed: 250,
    angularSpeed: 5.0,
    mass: 1.0,
    angularDamping: 0.90
  }
};

export const SHIP_COLORS = [
  '#ff6b6b',
  '#4ecdc4',
  '#45b7d1',
  '#f9ca24',
  '#6c5ce7',
  '#a29bfe'
];

export type ShipColorIndex = 0 | 1 | 2 | 3 | 4 | 5;

export interface Ship {
  id: string;
  playerId: string;
  playerName: string;
  position: Vector2;
  velocity: Vector2;
  angle: number;
  angularVelocity: number;
  shield: number;
  maxShield: number;
  engineType: EngineType;
  colorIndex: ShipColorIndex;
  currentCheckpoint: number;
  lap: number;
  lapStartTime: number;
  bestLapTime: number | null;
  totalTime: number;
  finished: boolean;
  finishTime: number | null;
  finishPosition: number | null;
  item: ItemType | null;
  boostEndTime: number;
  stunnedUntil: number;
  slowdownUntil: number;
  lastCheckpointPos: Vector2;
  isRespawning: boolean;
  respawnTime: number;
  itemUses: number;
}

export interface InputState {
  thrust: boolean;
  left: boolean;
  right: boolean;
  useItem: boolean;
}

export type ItemType = 'shield' | 'boost' | 'missile' | 'mine' | 'emp';

export interface ItemSpawner {
  id: string;
  position: Vector2;
  lastSpawn: number;
  currentItem: ItemType | null;
  cooldown: number;
}

export interface Projectile {
  id: string;
  type: 'missile';
  position: Vector2;
  velocity: Vector2;
  ownerId: string;
  targetId: string | null;
  lifetime: number;
}

export interface Mine {
  id: string;
  position: Vector2;
  ownerId: string;
}

export type EnvElementType = 'asteroid' | 'gravityWell' | 'speedBoost' | 'slowdown';

export interface EnvElement {
  id: string;
  type: EnvElementType;
  position: Vector2;
  radius: number;
  strength?: number;
}

export interface Checkpoint {
  id: string;
  position: Vector2;
  direction: number;
  index: number;
}

export interface TrackBoundary {
  controlPoints: Vector2[];
}

export interface Track {
  id: string;
  name: string;
  author: string;
  isBuiltIn: boolean;
  outerBoundary: TrackBoundary;
  innerBoundary: TrackBoundary;
  checkpoints: Checkpoint[];
  envElements: EnvElement[];
  itemSpawners: ItemSpawner[];
  startPosition: Vector2;
  startAngle: number;
  playCount: number;
  createdAt: number;
}

export type GameState = 'waiting' | 'countdown' | 'racing' | 'finished';

export interface Player {
  id: string;
  name: string;
  ship: Ship | null;
  isReady: boolean;
  isHost: boolean;
  disconnected: boolean;
  disconnectTime: number;
}

export interface Room {
  id: string;
  name: string;
  hostId: string;
  trackId: string;
  totalLaps: number;
  maxPlayers: number;
  players: Player[];
  gameState: GameState;
  countdownEndTime: number;
  raceStartTime: number;
  ships: Ship[];
  projectiles: Projectile[];
  mines: Mine[];
  envElements: EnvElement[];
  itemSpawners: ItemSpawner[];
  createdAt: number;
}

export interface LeaderboardEntry {
  playerName: string;
  time: number;
  date: number;
}

export interface GlobalLeaderboardEntry {
  playerName: string;
  wins: number;
  races: number;
}

export interface ReplayFrame {
  timestamp: number;
  position: Vector2;
  velocity: Vector2;
  angle: number;
}

export interface Replay {
  id: string;
  trackId: string;
  playerName: string;
  totalTime: number;
  bestLapTime: number | null;
  frames: ReplayFrame[];
  createdAt: number;
}

export type ReplayEventType = 'item_pickup' | 'item_use' | 'collision_ship' | 'collision_boundary' | 'collision_asteroid' | 'lap_complete' | 'race_finish';

export interface ReplayEvent {
  id: string;
  timestamp: number;
  type: ReplayEventType;
  playerId: string;
  playerName: string;
  position?: Vector2;
  itemType?: ItemType;
  targetPlayerId?: string;
  targetPlayerName?: string;
  lap?: number;
  lapTime?: number;
}

export interface ShipReplayFrame {
  playerId: string;
  playerName: string;
  colorIndex: ShipColorIndex;
  position: Vector2;
  velocity: Vector2;
  angle: number;
  shield: number;
  maxShield: number;
  lap: number;
  currentCheckpoint: number;
  boostEndTime: number;
  stunnedUntil: number;
  slowdownUntil: number;
  item: ItemType | null;
  isRespawning: boolean;
  finished: boolean;
}

export interface RaceReplayFrame {
  timestamp: number;
  ships: ShipReplayFrame[];
  projectiles: Array<{
    id: string;
    type: 'missile';
    position: Vector2;
    velocity: Vector2;
    ownerId: string;
  }>;
  mines: Array<{
    id: string;
    position: Vector2;
  }>;
  itemSpawners: Array<{
    id: string;
    position: Vector2;
    currentItem: ItemType | null;
  }>;
}

export interface LapTime {
  lap: number;
  time: number;
}

export interface PlayerRaceStats {
  playerId: string;
  playerName: string;
  colorIndex: ShipColorIndex;
  totalTime: number | null;
  bestLapTime: number | null;
  lapTimes: LapTime[];
  itemPickups: number;
  itemUses: number;
  collisions: number;
  finishPosition: number | null;
}

export interface RaceReplay {
  id: string;
  roomId: string;
  trackId: string;
  trackName: string;
  totalLaps: number;
  startTime: number;
  endTime: number;
  duration: number;
  frames: RaceReplayFrame[];
  events: ReplayEvent[];
  players: PlayerRaceStats[];
  collisions: Array<{
    position: Vector2;
    timestamp: number;
    type: 'ship' | 'boundary' | 'asteroid';
    playerId: string;
  }>;
  createdAt: number;
}

export const PHYSICS_CONFIG = {
  linearDrag: 0.02,
  elasticCollisionEnergyLoss: 0.7,
  shipRadius: 15,
  shieldDamageBoundary: 15,
  shieldDamageShipCollision: 20,
  missileSpeed: 500,
  missileLifetime: 5,
  missileDamage: 40,
  missileSlowDuration: 2,
  mineDamage: 30,
  mineRadius: 20,
  empRadius: 200,
  empStunDuration: 1.5,
  boostDuration: 3,
  boostMultiplier: 2,
  slowdownFactor: 0.6,
  speedBoostFactor: 1.5,
  gravityStrength: 80000,
  itemSpawnCooldown: 15,
  respawnTime: 2,
  disconnectTimeout: 5
};
