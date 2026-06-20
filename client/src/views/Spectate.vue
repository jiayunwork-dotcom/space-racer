<template>
  <div class="spectate-page">
    <canvas ref="gameCanvas" class="game-canvas"></canvas>

    <div class="top-bar">
      <div class="top-left">
        <span class="stage-info">第 {{ stageIndex + 1 }} 站</span>
        <span class="track-name">{{ trackName }}</span>
      </div>
      <div class="top-center">
        <span class="laps-info">剩余圈数: {{ remainingLaps }}</span>
      </div>
      <div class="top-right">
        <span class="spectator-count">👁 {{ spectatorCount }} 人观战</span>
      </div>
    </div>

    <div class="player-list">
      <div class="list-title">选手</div>
      <div
        v-for="(ship, idx) in sortedShips"
        :key="ship.id"
        :class="['player-item', { active: followShipId === ship.id }]"
        @click="followShipId = ship.id"
      >
        <div class="player-rank">{{ idx + 1 }}</div>
        <div
          class="player-color"
          :style="{ backgroundColor: SHIP_COLORS[ship.colorIndex] }"
        ></div>
        <div class="player-name">{{ ship.playerName }}</div>
        <div class="player-lap">{{ ship.lap }}/{{ totalLaps }}</div>
      </div>
    </div>

    <div class="danmaku-layer" ref="danmakuLayer">
      <div
        v-for="d in danmakuList"
        :key="d.id"
        class="danmaku-item"
        :style="{
          top: d.y + '%',
          color: d.color,
          fontSize: d.fontSize + 'px',
          animationDuration: '5s'
        }"
      >
        {{ d.text }}
      </div>
    </div>

    <div class="danmaku-input-area">
      <input
        v-model="danmakuText"
        class="danmaku-input"
        placeholder="输入弹幕..."
        maxlength="40"
        @keydown.enter="sendDanmaku"
        :disabled="!canSendDanmaku"
      />
      <button
        class="danmaku-send-btn"
        @click="sendDanmaku"
        :disabled="!canSendDanmaku || !danmakuText.trim()"
      >
        {{ canSendDanmaku ? '发送' : `${Math.ceil(cooldownRemaining / 1000)}s` }}
      </button>
    </div>

    <div v-if="raceEnded" class="race-ended-overlay">
      <div class="race-ended-panel">
        <h2>比赛已结束</h2>
        <button class="back-btn" @click="goBack">返回</button>
      </div>
    </div>

    <div v-if="gameState === 'finished'" class="results-overlay">
      <div class="results-panel">
        <h2>比赛结束</h2>
        <div class="results-list">
          <div
            v-for="(ship, index) in sortedShips"
            :key="ship.id"
            class="result-item"
          >
            <span class="rank">{{ index + 1 }}</span>
            <span class="name">{{ ship.playerName }}</span>
            <span class="time">{{ ship.finishTime ? formatTime(ship.finishTime - raceStartTime) : '未完成' }}</span>
          </div>
        </div>
        <button class="back-btn" @click="goBack">返回</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { GameRenderer } from '../game/renderer';
import { SpectateClient, type DanmakuMessage } from '../game/spectateClient';
import type { Track, Ship } from '../types/game';
import { SHIP_COLORS } from '../types/game';

const route = useRoute();
const router = useRouter();

const gameCanvas = ref<HTMLCanvasElement | null>(null);
const danmakuLayer = ref<HTMLElement | null>(null);

const roomId = computed(() => route.params.roomId as string);
const playerId = ref('');
const playerName = ref('');
const track = ref<Track | null>(null);
const trackName = ref('');
const stageIndex = ref(0);
const ships = ref<Ship[]>([]);
const raceStartTime = ref(0);
const totalLaps = ref(3);
const gameState = ref<'waiting' | 'countdown' | 'racing' | 'finished'>('waiting');
const spectatorCount = ref(0);
const followShipId = ref<string | null>(null);
const raceEnded = ref(false);

const danmakuText = ref('');
const canSendDanmaku = ref(true);
const cooldownRemaining = ref(0);
let cooldownTimer: number | null = null;

const DANMAKU_COLORS = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', '#6c5ce7', '#a29bfe'];

interface DanmakuItem {
  id: number;
  text: string;
  color: string;
  fontSize: number;
  y: number;
}
let danmakuIdCounter = 0;
const danmakuList = ref<DanmakuItem[]>([]);

let renderer: GameRenderer | null = null;
let spectateClient: SpectateClient | null = null;
let animationFrameId: number | null = null;

const sortedShips = computed(() => {
  return [...ships.value].sort((a, b) => {
    if (a.finished && b.finished) return (a.finishTime || 0) - (b.finishTime || 0);
    if (a.finished) return -1;
    if (b.finished) return 1;
    if (a.lap !== b.lap) return b.lap - a.lap;
    return b.currentCheckpoint - a.currentCheckpoint;
  });
});

const remainingLaps = computed(() => {
  if (ships.value.length === 0) return totalLaps.value;
  const leader = sortedShips.value[0];
  if (!leader) return totalLaps.value;
  return Math.max(0, totalLaps.value - leader.lap);
});

onMounted(() => {
  const savedId = localStorage.getItem('playerId');
  const savedName = localStorage.getItem('playerName');
  if (savedId) playerId.value = savedId;
  if (savedName) playerName.value = savedName;

  const ctx = localStorage.getItem('tournamentContext');
  if (ctx) {
    try {
      const parsed = JSON.parse(ctx);
      if (parsed.stageIndex !== undefined) stageIndex.value = parsed.stageIndex;
    } catch (e) {}
  }

  initSpectate();
  window.addEventListener('resize', handleResize);
});

onUnmounted(() => {
  if (animationFrameId) cancelAnimationFrame(animationFrameId);
  if (spectateClient) spectateClient.disconnect();
  if (renderer) renderer = null;
  if (cooldownTimer) clearInterval(cooldownTimer);
  window.removeEventListener('resize', handleResize);
});

async function initSpectate() {
  if (!gameCanvas.value) return;

  renderer = new GameRenderer(gameCanvas.value);
  handleResize();

  try {
    const res = await fetch(`/api/rooms/${roomId.value}`);
    const data = await res.json();
    if (data.room) {
      totalLaps.value = data.room.totalLaps;
      raceStartTime.value = data.room.raceStartTime;
      gameState.value = data.room.gameState;
      trackName.value = data.room.name || '';

      const trackRes = await fetch(`/api/tracks/${data.room.trackId}`);
      const trackData = await trackRes.json();
      if (trackData.track) {
        track.value = trackData.track;
      }
    }
  } catch (e) {
    console.error('[Spectate] Failed to load room:', e);
  }

  spectateClient = new SpectateClient(roomId.value, playerId.value, playerName.value);
  spectateClient.setOnStateUpdate(handleStateUpdate);
  spectateClient.setOnDanmaku(handleDanmaku);
  spectateClient.setOnRaceEnded(handleRaceEnded);

  try {
    await spectateClient.connect();
  } catch (e) {
    console.error('[Spectate] Failed to connect:', e);
  }

  cooldownTimer = window.setInterval(() => {
    if (spectateClient) {
      canSendDanmaku.value = spectateClient.canSendDanmaku();
      cooldownRemaining.value = spectateClient.getDanmakuCooldownRemaining();
    }
  }, 200);

  gameLoop();
}

function handleResize() {
  if (renderer && gameCanvas.value) {
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
}

function handleStateUpdate(state: any) {
  ships.value = state.ships || [];
  gameState.value = state.room?.gameState || 'waiting';
  raceStartTime.value = state.room?.raceStartTime || 0;
  totalLaps.value = state.room?.totalLaps || 3;
  spectatorCount.value = state.spectatorCount || 0;

  if (!followShipId.value && sortedShips.value.length > 0) {
    followShipId.value = sortedShips.value[0].id;
  }
}

function handleDanmaku(msg: DanmakuMessage) {
  const item: DanmakuItem = {
    id: danmakuIdCounter++,
    text: msg.text,
    color: DANMAKU_COLORS[Math.floor(Math.random() * DANMAKU_COLORS.length)],
    fontSize: Math.floor(Math.random() * 7) + 14,
    y: Math.random() * 60 + 10
  };
  danmakuList.value.push(item);
  setTimeout(() => {
    danmakuList.value = danmakuList.value.filter(d => d.id !== item.id);
  }, 5000);
}

function handleRaceEnded(msg: string) {
  raceEnded.value = true;
}

function sendDanmaku() {
  if (!spectateClient || !danmakuText.value.trim()) return;
  const sent = spectateClient.sendDanmaku(danmakuText.value.trim());
  if (sent) {
    danmakuText.value = '';
  }
}

function gameLoop() {
  render();
  animationFrameId = requestAnimationFrame(gameLoop);
}

function render() {
  if (!renderer || !track.value) return;

  const followShip = followShipId.value
    ? ships.value.find(s => s.id === followShipId.value)
    : sortedShips.value[0];

  if (followShip) {
    const targetX = followShip.position.x;
    const targetY = followShip.position.y + 100;
    renderer.setCamera(targetX, targetY, 1);
  }

  renderer.clear();
  renderer.drawTrack(track.value);
  renderer.drawEnvElements(track.value.envElements);
  renderer.drawCheckpoints(track.value.checkpoints);

  const lastState = spectateClient?.getLastState();
  renderer.drawItemSpawners((lastState as any)?.itemSpawners || []);
  renderer.drawShips(ships.value, followShipId.value);
  renderer.drawProjectiles((lastState as any)?.projectiles || []);
  renderer.drawMines((lastState as any)?.mines || []);

  const minimapSize = 180;
  renderer.drawMinimap(
    window.innerWidth - minimapSize - 20,
    20,
    minimapSize,
    minimapSize,
    track.value,
    ships.value,
    followShipId.value
  );
}

function formatTime(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = Math.floor((ms % 1000) / 10);
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
}

function goBack() {
  const tournamentCtx = localStorage.getItem('tournamentContext');
  if (tournamentCtx) {
    try {
      const ctx = JSON.parse(tournamentCtx);
      if (ctx.tournamentId) {
        router.push(`/tournament/${ctx.tournamentId}`);
        return;
      }
    } catch (e) {}
  }
  router.push('/tournaments');
}
</script>

<style scoped>
.spectate-page {
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

.top-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 48px;
  background: rgba(0, 0, 0, 0.75);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  z-index: 10;
  border-bottom: 1px solid rgba(78, 205, 196, 0.3);
}

.top-left,
.top-center,
.top-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.stage-info {
  font-weight: bold;
  color: #f5576c;
  font-size: 15px;
}

.track-name {
  color: rgba(255, 255, 255, 0.8);
  font-size: 14px;
}

.laps-info {
  font-weight: bold;
  color: #f9ca24;
  font-size: 16px;
}

.spectator-count {
  color: #4ecdc4;
  font-size: 14px;
}

.player-list {
  position: absolute;
  top: 60px;
  left: 10px;
  width: 160px;
  background: rgba(0, 0, 0, 0.7);
  border-radius: 10px;
  padding: 10px;
  z-index: 10;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.list-title {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 6px;
  text-align: center;
}

.player-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s;
  font-size: 12px;
}

.player-item:hover {
  background: rgba(255, 255, 255, 0.1);
}

.player-item.active {
  background: rgba(78, 205, 196, 0.2);
  border: 1px solid rgba(78, 205, 196, 0.5);
}

.player-rank {
  width: 18px;
  color: #f9ca24;
  font-weight: bold;
  text-align: center;
}

.player-color {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.player-name {
  flex: 1;
  color: #fff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.player-lap {
  color: rgba(255, 255, 255, 0.6);
  font-size: 11px;
}

.danmaku-layer {
  position: absolute;
  top: 60px;
  left: 0;
  right: 0;
  bottom: 60px;
  pointer-events: none;
  overflow: hidden;
  z-index: 5;
}

.danmaku-item {
  position: absolute;
  right: 0;
  white-space: nowrap;
  opacity: 0.8;
  font-weight: bold;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
  animation: danmaku-scroll 5s linear forwards;
  pointer-events: none;
}

@keyframes danmaku-scroll {
  from {
    transform: translateX(100%);
  }
  to {
    transform: translateX(-100vw);
  }
}

.danmaku-input-area {
  position: absolute;
  bottom: 10px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 8px;
  z-index: 10;
  width: 400px;
  max-width: 90%;
}

.danmaku-input {
  flex: 1;
  padding: 8px 14px;
  border-radius: 20px;
  border: 1px solid rgba(78, 205, 196, 0.4);
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
  font-size: 14px;
  outline: none;
}

.danmaku-input:focus {
  border-color: #4ecdc4;
}

.danmaku-input:disabled {
  opacity: 0.5;
}

.danmaku-send-btn {
  padding: 8px 18px;
  border-radius: 20px;
  border: none;
  background: linear-gradient(135deg, #4ecdc4, #45b7d1);
  color: #fff;
  font-size: 14px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
}

.danmaku-send-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 2px 10px rgba(78, 205, 196, 0.4);
}

.danmaku-send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.race-ended-overlay {
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

.race-ended-panel {
  background: #1a1a3e;
  padding: 30px 40px;
  border-radius: 16px;
  border: 2px solid #f5576c;
  text-align: center;
}

.race-ended-panel h2 {
  margin: 0 0 20px 0;
  color: #f5576c;
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
  z-index: 15;
}

.results-panel {
  background: #1a1a3e;
  padding: 30px 40px;
  border-radius: 16px;
  border: 2px solid #4ecdc4;
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
</style>
