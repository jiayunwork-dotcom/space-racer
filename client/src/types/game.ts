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
  spectatorCount?: number;
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

export const POINTS_SYSTEM: Record<number, number> = {
  1: 25,
  2: 18,
  3: 15,
  4: 12,
  5: 10,
  6: 8,
  7: 6,
  8: 4
};

export const TOURNAMENT_PREPARATION_TIME = 30000;
export const TOURNAMENT_MIN_STAGES = 3;
export const TOURNAMENT_MAX_STAGES = 6;
export const TOURNAMENT_MAX_PLAYERS = 8;

export type TournamentStatus = 'registering' | 'ongoing' | 'finished';

export type StageStatus = 'pending' | 'preparing' | 'racing' | 'completed';

export interface TournamentStage {
  trackId: string;
  trackName: string;
  laps: number;
  status: StageStatus;
  preparationEndTime: number | null;
  roomId: string | null;
}

export interface TournamentPlayer {
  playerId: string;
  playerName: string;
  colorIndex: number;
  registrationOrder: number;
}

export interface TournamentStageResult {
  playerId: string;
  playerName: string;
  position: number | null;
  time: number | null;
  points: number;
  disconnected: boolean;
}

export interface TournamentStanding {
  playerId: string;
  playerName: string;
  colorIndex: number;
  totalPoints: number;
  stageResults: (TournamentStageResult | null)[];
  bestPositions: number[];
  registrationOrder: number;
}

export interface Tournament {
  id: string;
  name: string;
  creatorId: string;
  creatorName: string;
  status: TournamentStatus;
  stages: TournamentStage[];
  currentStageIndex: number;
  players: TournamentPlayer[];
  stageResults: TournamentStageResult[][];
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
}

export interface CurrentStageStatus {
  stageIndex: number;
  stage: TournamentStage;
  preparationEndTime: number | null;
  canEnterRace: boolean;
  countdownRemaining: number;
}

export function calculatePoints(position: number | null, disconnected: boolean): number {
  if (disconnected || position === null || position < 1 || position > 8) {
    return 0;
  }
  return POINTS_SYSTEM[position] || 0;
}

export function sortStandings(standings: TournamentStanding[]): TournamentStanding[] {
  return [...standings].sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) {
      return b.totalPoints - a.totalPoints;
    }

    const maxLen = Math.max(a.bestPositions.length, b.bestPositions.length);
    for (let i = 0; i < maxLen; i++) {
      const aPos = a.bestPositions[i] ?? Infinity;
      const bPos = b.bestPositions[i] ?? Infinity;
      if (aPos !== bPos) {
        return aPos - bPos;
      }
    }

    return a.registrationOrder - b.registrationOrder;
  });
}
