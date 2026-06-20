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
  finished: boolean;
  finishTime: number | null;
  finishPosition: number | null;
  item: ItemType | null;
  boostEndTime: number;
  stunnedUntil: number;
  slowdownUntil: number;
  isRespawning: boolean;
  itemUses: number;
}

export interface InputState {
  thrust: boolean;
  left: boolean;
  right: boolean;
  useItem: boolean;
}

export type ItemType = 'shield' | 'boost' | 'missile' | 'mine' | 'emp';

export const ITEM_NAMES: Record<ItemType, string> = {
  shield: '护盾修复',
  boost: '加速推进',
  missile: '追踪导弹',
  mine: '地雷',
  emp: 'EMP脉冲'
};

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
}

export interface Mine {
  id: string;
  position: Vector2;
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
  isReady: boolean;
  isHost: boolean;
  disconnected: boolean;
}

export interface Room {
  id: string;
  name: string;
  hostId?: string;
  trackId: string;
  totalLaps: number;
  maxPlayers: number;
  gameState: GameState;
  countdownEndTime: number;
  raceStartTime: number;
  players?: Player[];
  createdAt?: number;
}

export interface GameStateData {
  room: Room;
  players: Player[];
  ships: Ship[];
  projectiles: Projectile[];
  mines: Mine[];
  envElements: EnvElement[];
  itemSpawners: ItemSpawner[];
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

export const PHYSICS_CONFIG = {
  linearDrag: 0.02,
  shipRadius: 15,
  missileSpeed: 500,
  mineRadius: 20,
  empRadius: 200,
  boostDuration: 3,
  itemSpawnCooldown: 15,
  respawnTime: 2
};
