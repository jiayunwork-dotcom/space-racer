<template>
  <div class="game-page">
    <canvas ref="gameCanvas" class="game-canvas"></canvas>
    
    <div v-if="gameState === 'countdown'" class="countdown-overlay">
      <div class="countdown-number">{{ countdownText }}</div>
    </div>

    <div v-if="gameState === 'finished'" class="results-overlay">
      <div class="results-panel">
        <h2>比赛结束</h2>
        <div class="results-list">
          <div 
            v-for="(ship, index) in sortedShips" 
            :key="ship.id"
            :class="['result-item', { 'player-ship': ship.playerId === playerId }]"
          >
            <span class="rank">{{ index + 1 }}</span>
            <span class="name">{{ ship.playerName }}</span>
            <span class="time">{{ ship.finishTime ? formatTime(ship.finishTime - raceStartTime) : '未完成' }}</span>
          </div>
        </div>
        <button class="back-btn" @click="backToLobby">返回大厅</button>
      </div>
    </div>

    <div v-if="showPauseMenu" class="pause-overlay">
      <div class="pause-menu">
        <h2>暂停</h2>
        <button class="menu-btn" @click="showPauseMenu = false">继续游戏</button>
        <button class="menu-btn danger" @click="backToLobby">离开游戏</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { GameRenderer } from '../game/renderer';
import { GameClient } from '../game/client';
import { InputManager } from '../game/input';
import type { Track, Ship, GameStateData } from '../types/game';

const route = useRoute();
const router = useRouter();

const gameCanvas = ref<HTMLCanvasElement | null>(null);
const gameState = ref<'waiting' | 'countdown' | 'racing' | 'finished'>('waiting');
const showPauseMenu = ref(false);

const roomId = computed(() => route.params.roomId as string);
const playerId = ref('');
const track = ref<Track | null>(null);
const ships = ref<Ship[]>([]);
const raceStartTime = ref(0);
const totalLaps = ref(3);

let renderer: GameRenderer | null = null;
let gameClient: GameClient | null = null;
let inputManager: InputManager | null = null;
let animationFrameId: number | null = null;
let lastInputSend = 0;

const countdownText = computed(() => {
  if (gameState.value !== 'countdown') return '';
  const remaining = Math.ceil((countdownEndTime.value - Date.now()) / 1000);
  return remaining > 0 ? remaining.toString() : 'GO!';
});

const countdownEndTime = ref(0);

const sortedShips = computed(() => {
  return [...ships.value].sort((a, b) => {
    if (a.finished && b.finished) return (a.finishTime || 0) - (b.finishTime || 0);
    if (a.finished) return -1;
    if (b.finished) return 1;
    if (a.lap !== b.lap) return b.lap - a.lap;
    return b.currentCheckpoint - a.currentCheckpoint;
  });
});

const playerShip = computed(() => {
  return ships.value.find(s => s.playerId === playerId.value) || null;
});

onMounted(() => {
  const savedId = localStorage.getItem('playerId');
  if (savedId) playerId.value = savedId;

  initGame();
});

onUnmounted(() => {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }
  if (gameClient) {
    gameClient.disconnect();
  }
  if (inputManager) {
    inputManager.detach();
  }
  window.removeEventListener('keydown', handleKeyDown);
  window.removeEventListener('resize', handleResize);
});

async function initGame() {
  if (!gameCanvas.value) return;

  renderer = new GameRenderer(gameCanvas.value);
  
  inputManager = new InputManager();
  inputManager.attach();

  window.addEventListener('resize', handleResize);
  window.addEventListener('keydown', handleKeyDown);

  handleResize();

  try {
    const res = await fetch(`/api/rooms/${roomId.value}`);
    const data = await res.json();
    if (data.room) {
      totalLaps.value = data.room.totalLaps;
      raceStartTime.value = data.room.raceStartTime;
      countdownEndTime.value = data.room.countdownEndTime;
      gameState.value = data.room.gameState;

      const trackRes = await fetch(`/api/tracks/${data.room.trackId}`);
      const trackData = await trackRes.json();
      if (trackData.track) {
        track.value = trackData.track;
      }
    }
  } catch (e) {
    console.error('Failed to load room:', e);
  }

  gameClient = new GameClient(roomId.value, playerId.value);
  gameClient.setOnStateUpdate(handleStateUpdate);
  
  try {
    await gameClient.connect();
  } catch (e) {
    console.error('Failed to connect to game server:', e);
  }

  gameLoop();
}

function handleResize() {
  if (renderer && gameCanvas.value) {
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (gameState.value === 'racing' || gameState.value === 'finished') {
      showPauseMenu.value = !showPauseMenu.value;
    }
  }
}

function handleStateUpdate(state: GameStateData) {
  ships.value = state.ships;
  gameState.value = state.room.gameState;
  raceStartTime.value = state.room.raceStartTime;
  countdownEndTime.value = state.room.countdownEndTime;
  totalLaps.value = state.room.totalLaps;
}

function gameLoop() {
  const now = Date.now();

  if (inputManager && gameClient) {
    if (now - lastInputSend > 1000 / 60) {
      const input = inputManager.getInputState();
      gameClient.sendInput(input);
      lastInputSend = now;
    }
  }

  render();

  animationFrameId = requestAnimationFrame(gameLoop);
}

function render() {
  if (!renderer || !track.value) return;

  const playerShipData = playerShip.value;
  
  if (playerShipData) {
    const targetX = playerShipData.position.x;
    const targetY = playerShipData.position.y + 100;
    renderer.setCamera(targetX, targetY, 1);
  }

  renderer.clear();
  renderer.drawTrack(track.value);
  renderer.drawEnvElements(track.value.envElements);
  renderer.drawCheckpoints(track.value.checkpoints);
  renderer.drawItemSpawners(
    (gameClient?.getLastState() as any)?.itemSpawners || []
  );

  const renderShips = gameClient && gameClient.getLastState() 
    ? gameClient.getInterpolatedShips(ships.value)
    : ships.value;

  renderer.drawShips(renderShips, playerShipData?.id || null);
  renderer.drawProjectiles(
    (gameClient?.getLastState() as any)?.projectiles || []
  );
  renderer.drawMines(
    (gameClient?.getLastState() as any)?.mines || []
  );

  if (playerShipData && gameState.value === 'racing') {
    const currentTime = Date.now();
    renderer.drawHUD(playerShipData, totalLaps.value, currentTime);
  }

  const minimapSize = 180;
  renderer.drawMinimap(
    window.innerWidth - minimapSize - 20,
    20,
    minimapSize,
    minimapSize,
    track.value,
    ships.value,
    playerShipData?.id || null
  );

  if (gameState.value === 'finished') {
    renderer.drawResults(ships.value, playerShipData?.id || null);
  }
}

function formatTime(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = Math.floor((ms % 1000) / 10);
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
}

function backToLobby() {
  router.push(`/room/${roomId.value}`);
}
</script>

<style scoped>
.game-page {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
}

.game-canvas {
  display: block;
  width: 100%;
  height: 100%;
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
  background: rgba(0, 0, 0, 0.3);
  pointer-events: none;
}

.countdown-number {
  font-size: 150px;
  font-weight: bold;
  color: #fff;
  text-shadow: 0 0 40px #4ecdc4;
  animation: pulse 1s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.1); opacity: 0.8; }
}

.results-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.7);
  z-index: 10;
}

.results-panel {
  background: #1a1a3e;
  padding: 30px 40px;
  border-radius: 16px;
  border: 2px solid #4ecdc4;
  box-shadow: 0 0 30px rgba(78, 205, 196, 0.3);
  min-width: 400px;
}

.results-panel h2 {
  margin: 0 0 20px 0;
  text-align: center;
  font-size: 28px;
  color: #f9ca24;
}

.results-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 24px;
}

.result-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
}

.result-item.player-ship {
  background: rgba(249, 202, 36, 0.15);
  border: 1px solid #f9ca24;
}

.rank {
  width: 30px;
  font-size: 18px;
  font-weight: bold;
  color: #f9ca24;
}

.name {
  flex: 1;
  font-size: 16px;
  color: #fff;
}

.time {
  font-family: monospace;
  font-size: 16px;
  color: #4ecdc4;
}

.back-btn {
  width: 100%;
  padding: 12px;
  font-size: 16px;
  background: linear-gradient(135deg, #4ecdc4, #45b7d1);
  border: none;
  border-radius: 8px;
  color: #fff;
  cursor: pointer;
  font-weight: bold;
  transition: all 0.3s;
}

.back-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 15px rgba(78, 205, 196, 0.4);
}

.pause-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.7);
  z-index: 20;
}

.pause-menu {
  background: #1a1a3e;
  padding: 30px 40px;
  border-radius: 16px;
  border: 2px solid rgba(255, 255, 255, 0.2);
  min-width: 280px;
}

.pause-menu h2 {
  margin: 0 0 24px 0;
  text-align: center;
  font-size: 24px;
}

.menu-btn {
  display: block;
  width: 100%;
  padding: 14px;
  margin-bottom: 12px;
  font-size: 16px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
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
  color: #ff6b6b;
}

.menu-btn.danger:hover {
  background: rgba(255, 107, 107, 0.3);
}
</style>
