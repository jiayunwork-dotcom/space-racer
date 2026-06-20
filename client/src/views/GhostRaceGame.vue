<template>
  <div class="ghost-race-game">
    <canvas ref="gameCanvas" class="game-canvas"></canvas>
    
    <div v-if="gameState === 'countdown'" class="countdown-overlay">
      <div class="countdown-number">{{ countdownText }}</div>
    </div>

    <div v-if="gameState === 'finished'" class="results-overlay">
      <div class="results-panel">
        <h2>幽灵赛结束</h2>
        <div class="results-list">
          <div class="result-item player-ship">
            <span class="rank">1</span>
            <span class="name">{{ playerName }} (你)</span>
            <span class="time">{{ playerFinishTime ? formatTime(playerFinishTime) : '未完成' }}</span>
          </div>
          <div class="result-item ghost-ship">
            <span class="rank">2</span>
            <span class="name">{{ ghostPlayerName }} (幽灵)</span>
            <span class="time">{{ formatTime(replay?.totalTime || 0) }}</span>
          </div>
        </div>
        <div class="result-stats" v-if="playerFinishTime && replay">
          <p v-if="playerFinishTime < replay.totalTime" class="win">🎉 你击败了幽灵！</p>
          <p v-else class="lose">💪 再接再厉，下次一定能赢！</p>
          <p>差距: {{ formatTime(Math.abs(playerFinishTime - replay.totalTime)) }}</p>
        </div>
        <div class="result-actions">
          <button class="menu-btn" @click="restartRace">重新挑战</button>
          <button class="menu-btn" @click="backToMenu">返回菜单</button>
        </div>
      </div>
    </div>

    <div v-if="showPauseMenu" class="pause-overlay">
      <div class="pause-menu">
        <h2>暂停</h2>
        <button class="menu-btn" @click="showPauseMenu = false">继续游戏</button>
        <button class="menu-btn danger" @click="backToMenu">离开游戏</button>
      </div>
    </div>

    <div class="hud" v-if="gameState === 'racing' || gameState === 'countdown'">
      <div class="hud-item">
        <span class="label">圈数</span>
        <span class="value">{{ currentLap }} / {{ totalLaps }}</span>
      </div>
      <div class="hud-item">
        <span class="label">时间</span>
        <span class="value">{{ formatTime(elapsedTime) }}</span>
      </div>
      <div class="hud-item">
        <span class="label">最佳单圈</span>
        <span class="value">{{ bestLapTime ? formatTime(bestLapTime) : '--:--.--' }}</span>
      </div>
      <div class="hud-item ghost-info">
        <span class="label">幽灵</span>
        <span class="value">{{ ghostPlayerName }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { GameRenderer } from '../game/renderer';
import { InputManager } from '../game/input';
import type { Track, Ship, Replay, ReplayFrame, Vector2, EngineType, ShipColorIndex } from '../types/game';
import { PHYSICS_CONFIG, ENGINE_CONFIGS, SHIP_COLORS } from '../types/game';
import { updateShipPhysics, getShipShipCollision } from '../game/physics';
import { sampleBezier } from '../utils/bezier';
import type { BezierSample } from '../utils/bezier';
import { vec2, vecAdd, vecSub, vecMul, vecLength, vecNormalize, vecDistance } from '../utils/vector';

const route = useRoute();
const router = useRouter();

const gameCanvas = ref<HTMLCanvasElement | null>(null);
const gameState = ref<'waiting' | 'countdown' | 'racing' | 'finished'>('waiting');
const showPauseMenu = ref(false);

const trackId = computed(() => route.query.trackId as string);
const replayId = computed(() => route.query.replayId as string);
const totalLaps = ref(parseInt(route.query.totalLaps as string) || 3);
const playerId = ref(route.query.playerId as string);
const playerName = ref(route.query.playerName as string || '玩家');
const engineType = ref((route.query.engineType as EngineType) || 'balanced');
const colorIndex = ref(parseInt(route.query.colorIndex as string) || 0);

const track = ref<Track | null>(null);
const replay = ref<Replay | null>(null);
const ghostPlayerName = ref('');

const playerShip = ref<Ship | null>(null);
const ghostShip = ref<Ship | null>(null);

const currentLap = ref(1);
const elapsedTime = ref(0);
const bestLapTime = ref<number | null>(null);
const lapStartTime = ref(0);
const playerFinishTime = ref<number | null>(null);

let renderer: GameRenderer | null = null;
let inputManager: InputManager | null = null;
let animationFrameId: number | null = null;
let lastTime = 0;
let raceStartTime = 0;
let outerSamples: BezierSample[] = [];
let innerSamples: BezierSample[] = [];
let replayFrames: ReplayFrame[] = [];
let currentFrameIndex = 0;
let checkpointIndex = 0;

function formatTime(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = Math.floor((ms % 1000) / 10);
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
}

const countdownText = computed(() => {
  if (gameState.value !== 'countdown') return '';
  const remaining = Math.ceil((raceStartTime - Date.now()) / 1000);
  if (remaining <= 0) return 'GO!';
  return remaining.toString();
});

onMounted(async () => {
  if (!gameCanvas.value) return;

  renderer = new GameRenderer(gameCanvas.value);
  inputManager = new InputManager();
  inputManager.attach();
  
  const canvas = gameCanvas.value;
  function resize() {
    if (renderer && canvas) {
      renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    }
  }
  resize();
  window.addEventListener('resize', resize);

  try {
    const trackRes = await fetch(`/api/tracks/${trackId.value}`);
    const trackData = await trackRes.json();
    track.value = trackData.track;
    
    const replayRes = await fetch(`/api/replay/${replayId.value}`);
    const replayData = await replayRes.json();
    replay.value = replayData.replay;
    
    if (replay.value) {
      ghostPlayerName.value = replay.value.playerName;
      replayFrames = replay.value.frames;
    }

    if (track.value) {
      outerSamples = sampleBezier(track.value.outerBoundary.controlPoints, 200);
      innerSamples = sampleBezier(track.value.innerBoundary.controlPoints, 200);
    }

    initGame();
    startCountdown();
  } catch (e) {
    console.error('Failed to load ghost race data:', e);
    router.push('/ghost-race');
  }

  window.addEventListener('keydown', handleKeyDown);
});

onUnmounted(() => {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }
  if (inputManager) {
    inputManager.detach();
  }
  window.removeEventListener('keydown', handleKeyDown);
});

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && (gameState.value === 'racing' || gameState.value === 'countdown')) {
    showPauseMenu.value = !showPauseMenu.value;
  }
}

function initGame() {
  if (!track.value) return;

  const startPos = track.value.startPosition;
  const startAngle = track.value.startAngle;

  playerShip.value = {
    id: 'player',
    playerId: playerId.value,
    playerName: playerName.value,
    position: { ...startPos },
    velocity: vec2(0, 0),
    angle: startAngle,
    angularVelocity: 0,
    shield: 100,
    maxShield: 100,
    engineType: engineType.value,
    colorIndex: colorIndex.value as ShipColorIndex,
    currentCheckpoint: 0,
    lap: 1,
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
    lastCheckpointPos: { ...startPos },
    isRespawning: false,
    respawnTime: 0,
    itemUses: 0
  };

  ghostShip.value = {
    id: 'ghost',
    playerId: 'ghost',
    playerName: ghostPlayerName.value,
    position: { ...startPos },
    velocity: vec2(0, 0),
    angle: startAngle,
    angularVelocity: 0,
    shield: 100,
    maxShield: 100,
    engineType: 'balanced',
    colorIndex: 5,
    currentCheckpoint: 0,
    lap: 1,
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
    lastCheckpointPos: { ...startPos },
    isRespawning: false,
    respawnTime: 0,
    itemUses: 0
  };

  currentFrameIndex = 0;
  checkpointIndex = 0;
  currentLap.value = 1;
  elapsedTime.value = 0;
  bestLapTime.value = null;
  playerFinishTime.value = null;
}

function startCountdown() {
  gameState.value = 'countdown';
  raceStartTime = Date.now() + 3000;
  lapStartTime.value = raceStartTime;
  
  lastTime = performance.now();
  gameLoop(lastTime);
}

function gameLoop(currentTime: number) {
  const dt = Math.min((currentTime - lastTime) / 1000, 0.05);
  lastTime = currentTime;

  if (gameState.value === 'countdown') {
    if (Date.now() >= raceStartTime) {
      gameState.value = 'racing';
      lapStartTime.value = Date.now();
    }
  }

  if (gameState.value === 'racing') {
    elapsedTime.value = Date.now() - lapStartTime.value + (currentLap.value - 1) * (bestLapTime.value || 0);
    updateGame(dt);
  }

  render();

  animationFrameId = requestAnimationFrame(gameLoop);
}

function updateGame(dt: number) {
  if (!playerShip.value || !track.value || !ghostShip.value) return;

  const now = Date.now();
  const input = inputManager?.getInputState() || { thrust: false, left: false, right: false, useItem: false };

  const envElements = track.value.envElements;
  updateShipPhysics(playerShip.value, input, envElements, outerSamples, innerSamples, [], dt, now);

  const elapsedMs = now - lapStartTime.value + (currentLap.value - 1) * (bestLapTime.value || 0);
  while (currentFrameIndex < replayFrames.length - 1 && replayFrames[currentFrameIndex + 1].timestamp <= elapsedMs) {
    currentFrameIndex++;
  }

  if (currentFrameIndex < replayFrames.length) {
    const currentFrame = replayFrames[currentFrameIndex];
    const nextFrame = replayFrames[Math.min(currentFrameIndex + 1, replayFrames.length - 1)];
    
    const t = currentFrameIndex < replayFrames.length - 1 
      ? (elapsedMs - currentFrame.timestamp) / (nextFrame.timestamp - currentFrame.timestamp + 0.001)
      : 0;
    
    ghostShip.value.position.x = currentFrame.position.x + (nextFrame.position.x - currentFrame.position.x) * Math.min(t, 1);
    ghostShip.value.position.y = currentFrame.position.y + (nextFrame.position.y - currentFrame.position.y) * Math.min(t, 1);
    ghostShip.value.angle = currentFrame.angle + (nextFrame.angle - currentFrame.angle) * Math.min(t, 1);
    ghostShip.value.velocity = { ...currentFrame.velocity };
  }

  checkCheckpoints();
  checkShipCollision();

  if (currentFrameIndex >= replayFrames.length - 1 && replay.value) {
    ghostShip.value.finished = true;
    ghostShip.value.finishTime = replay.value.totalTime;
  }
}

function checkCheckpoints() {
  if (!playerShip.value || !track.value) return;

  const checkpoints = track.value.checkpoints;
  if (checkpoints.length === 0) return;

  const nextCheckpointIndex = (playerShip.value.currentCheckpoint + 1) % checkpoints.length;
  const nextCheckpoint = checkpoints[nextCheckpointIndex];
  
  const dist = vecDistance(playerShip.value.position, nextCheckpoint.position);
  if (dist < 50) {
    playerShip.value.currentCheckpoint = nextCheckpointIndex;
    playerShip.value.lastCheckpointPos = { ...nextCheckpoint.position };

    if (nextCheckpointIndex === 0 && playerShip.value.currentCheckpoint > 0) {
      const lapTime = Date.now() - lapStartTime.value;
      
      if (!bestLapTime.value || lapTime < bestLapTime.value) {
        bestLapTime.value = lapTime;
      }

      currentLap.value++;
      
      if (currentLap.value > totalLaps.value) {
        finishRace();
      } else {
        lapStartTime.value = Date.now();
      }
    }
  }
}

function checkShipCollision() {
  if (!playerShip.value || !ghostShip.value) return;

  const collision = getShipShipCollision(playerShip.value, ghostShip.value, PHYSICS_CONFIG.shipRadius);
  if (collision.collided) {
    playerShip.value.position = vecAdd(playerShip.value.position, collision.pushOut);
    
    const normal = collision.normal;
    const velocityDotNormal = vecDot(playerShip.value.velocity, normal);
    
    if (velocityDotNormal < 0) {
      const reflected = vecReflect(playerShip.value.velocity, normal);
      const energyLoss = PHYSICS_CONFIG.elasticCollisionEnergyLoss;
      playerShip.value.velocity = vecMul(reflected, Math.sqrt(energyLoss));
    }
    
    playerShip.value.shield -= PHYSICS_CONFIG.shieldDamageShipCollision;
  }
}

function vecDot(a: Vector2, b: Vector2): number {
  return a.x * b.x + a.y * b.y;
}

function vecReflect(v: Vector2, n: Vector2): Vector2 {
  const d = 2 * vecDot(v, n);
  return vecSub(v, vecMul(n, d));
}

function finishRace() {
  if (!playerShip.value) return;
  
  gameState.value = 'finished';
  playerShip.value.finished = true;
  playerFinishTime.value = Date.now() - lapStartTime.value + (currentLap.value - 2) * (bestLapTime.value || 0);
  playerShip.value.finishTime = playerFinishTime.value;
}

function render() {
  if (!renderer || !track.value || !playerShip.value) return;

  const camX = playerShip.value.position.x;
  const camY = playerShip.value.position.y;
  const speed = vecLength(playerShip.value.velocity);
  const maxSpeed = ENGINE_CONFIGS[playerShip.value.engineType].maxSpeed;
  const zoom = 1 - (speed / maxSpeed) * 0.1;

  renderer.setCamera(camX, camY, zoom);
  renderer.clear();
  renderer.drawTrack(track.value);
  
  for (const env of track.value.envElements) {
    renderer.drawEnvElement(env);
  }
  
  for (const checkpoint of track.value.checkpoints) {
    renderer.drawCheckpoint(checkpoint, playerShip.value.currentCheckpoint);
  }

  if (ghostShip.value && !ghostShip.value.finished) {
    renderer.drawGhostShip(ghostShip.value);
  }

  renderer.drawShip(playerShip.value, playerShip.value.playerId === playerId.value);
}

function restartRace() {
  initGame();
  startCountdown();
  showPauseMenu.value = false;
}

function backToMenu() {
  router.push('/ghost-race');
}
</script>

<style scoped>
.ghost-race-game {
  width: 100%;
  height: 100%;
  position: relative;
  background: #0a0a2e;
  overflow: hidden;
}

.game-canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.countdown-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  z-index: 10;
}

.countdown-number {
  font-size: 120px;
  font-weight: bold;
  color: #4ecdc4;
  text-shadow: 0 0 40px rgba(78, 205, 196, 0.8);
  animation: pulse 0.5s ease-in-out;
}

@keyframes pulse {
  0% { transform: scale(0.5); opacity: 0; }
  50% { transform: scale(1.2); }
  100% { transform: scale(1); opacity: 1; }
}

.results-overlay, .pause-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.8);
  z-index: 20;
}

.results-panel, .pause-menu {
  background: linear-gradient(135deg, #1a1a3e, #0a0a2e);
  padding: 40px;
  border-radius: 16px;
  border: 2px solid rgba(78, 205, 196, 0.3);
  text-align: center;
  min-width: 400px;
}

.results-panel h2, .pause-menu h2 {
  margin: 0 0 24px 0;
  font-size: 28px;
  color: #4ecdc4;
}

.results-list {
  margin-bottom: 24px;
}

.result-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 20px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  margin-bottom: 8px;
}

.result-item.player-ship {
  border-left: 4px solid #4ecdc4;
}

.result-item.ghost-ship {
  border-left: 4px solid #a29bfe;
  opacity: 0.7;
}

.result-item .rank {
  width: 30px;
  font-size: 20px;
  font-weight: bold;
  color: #f9ca24;
}

.result-item .name {
  flex: 1;
  text-align: left;
  font-size: 16px;
}

.result-item .time {
  font-family: monospace;
  font-size: 18px;
  font-weight: bold;
  color: #4ecdc4;
}

.result-stats {
  margin-bottom: 24px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
}

.result-stats .win {
  color: #4ecdc4;
  font-size: 18px;
  font-weight: bold;
  margin-bottom: 8px;
}

.result-stats .lose {
  color: #ff6b6b;
  font-size: 18px;
  font-weight: bold;
  margin-bottom: 8px;
}

.result-actions {
  display: flex;
  gap: 12px;
}

.menu-btn {
  flex: 1;
  padding: 14px;
  font-size: 16px;
  background: rgba(255, 255, 255, 0.1);
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  color: #fff;
  cursor: pointer;
  transition: all 0.3s;
}

.menu-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.menu-btn.danger {
  background: rgba(255, 107, 107, 0.2);
  border-color: rgba(255, 107, 107, 0.5);
}

.menu-btn.danger:hover {
  background: rgba(255, 107, 107, 0.3);
}

.hud {
  position: absolute;
  top: 20px;
  left: 20px;
  right: 20px;
  display: flex;
  justify-content: space-between;
  gap: 16px;
  z-index: 5;
  pointer-events: none;
}

.hud-item {
  background: rgba(0, 0, 0, 0.6);
  padding: 10px 16px;
  border-radius: 8px;
  border: 1px solid rgba(78, 205, 196, 0.3);
}

.hud-item .label {
  display: block;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 4px;
}

.hud-item .value {
  display: block;
  font-size: 18px;
  font-weight: bold;
  color: #fff;
  font-family: monospace;
}

.hud-item.ghost-info {
  border-color: rgba(162, 155, 254, 0.5);
}

.hud-item.ghost-info .value {
  color: #a29bfe;
}
</style>
