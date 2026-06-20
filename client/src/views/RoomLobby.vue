<template>
  <div class="room-lobby">
    <div class="header">
      <button class="back-btn" @click="leaveRoom">← 离开房间</button>
      <h2>{{ room?.name || '房间' }}</h2>
      <div class="room-id">ID: {{ roomId }}</div>
    </div>

    <div class="content">
      <div class="left-panel">
        <div class="players-section">
          <h3>玩家列表 ({{ players.length }}/{{ room?.maxPlayers || 8 }})</h3>
          <div class="players-list">
            <div 
              v-for="player in players" 
              :key="player.id" 
              :class="['player-item', { 
                ready: player.isReady, 
                host: player.isHost,
                disconnected: player.disconnected 
              }]"
            >
              <div class="player-info">
                <span v-if="player.isHost" class="host-badge">👑</span>
                <span class="player-name">{{ player.name }}</span>
                <span v-if="player.disconnected" class="disconnected-badge">断线</span>
              </div>
              <div class="player-status">
                <span v-if="player.isReady" class="ready-badge">已准备</span>
                <span v-else class="not-ready-badge">未准备</span>
              </div>
            </div>
          </div>
        </div>

        <div class="actions">
          <button 
            v-if="isHost"
            :class="['start-btn', { disabled: canStart === false }]"
            @click="startGame"
            :disabled="!canStart"
          >
            开始游戏
          </button>
          <button 
            v-else
            :class="['ready-btn', { ready: isReady }]"
            @click="toggleReady"
          >
            {{ isReady ? '取消准备' : '准备' }}
          </button>
        </div>
      </div>

      <div class="right-panel">
        <div class="track-section">
          <h3>赛道信息</h3>
          <div v-if="track" class="track-info">
            <div class="track-name">{{ track.name }}</div>
            <div class="track-author">作者: {{ track.author }}</div>
            <div class="track-details">
              <span>检查点: {{ track.checkpoints.length }}</span>
              <span>游玩次数: {{ track.playCount }}</span>
            </div>
            <div class="track-preview">
              <canvas ref="trackPreviewCanvas" width="300" height="200"></canvas>
            </div>
          </div>
        </div>

        <div v-if="isHost" class="settings-section">
          <h3>房间设置</h3>
          
          <div class="setting-item">
            <label>总圈数</label>
            <div class="lap-options">
              <button 
                v-for="laps in [3, 5, 10]" 
                :key="laps"
                :class="['lap-btn', { active: totalLaps === laps }]"
                @click="setLaps(laps)"
              >
                {{ laps }} 圈
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { Room, Player, Track } from '../types/game';
import { drawBezierPath } from '../utils/bezier';

const route = useRoute();
const router = useRouter();

const roomId = computed(() => route.params.roomId as string);
const room = ref<Room | null>(null);
const players = ref<Player[]>([]);
const track = ref<Track | null>(null);
const trackPreviewCanvas = ref<HTMLCanvasElement | null>(null);

const playerId = ref('');
const playerName = ref('');
const isHost = ref(false);
const isReady = ref(false);
const totalLaps = ref(3);

let pollInterval: number | null = null;

onMounted(() => {
  const savedId = localStorage.getItem('playerId');
  const savedName = localStorage.getItem('playerName');
  
  if (savedId) playerId.value = savedId;
  if (savedName) playerName.value = savedName;

  loadRoom();
  pollInterval = window.setInterval(loadRoom, 2000);
});

onUnmounted(() => {
  if (pollInterval) clearInterval(pollInterval);
});

watch(track, (newTrack) => {
  if (newTrack && trackPreviewCanvas.value) {
    nextTick(() => drawTrackPreview());
  }
});

watch([room, players], () => {
  if (room.value) {
    totalLaps.value = room.value.totalLaps;
  }
});

async function loadRoom() {
  try {
    const res = await fetch(`/api/rooms/${roomId.value}`);
    const data = await res.json();
    if (data.room) {
      room.value = data.room;
      players.value = data.room.players || [];
      
      const player = players.value.find(p => p.id === playerId.value);
      if (player) {
        isHost.value = player.isHost;
        isReady.value = player.isReady;
      }

      if (!track.value || track.value.id !== data.room.trackId) {
        loadTrack(data.room.trackId);
      }
    }
  } catch (e) {
    console.error('Failed to load room:', e);
  }
}

async function loadTrack(trackId: string) {
  try {
    const res = await fetch(`/api/tracks/${trackId}`);
    const data = await res.json();
    if (data.track) {
      track.value = data.track;
    }
  } catch (e) {
    console.error('Failed to load track:', e);
  }
}

function drawTrackPreview() {
  const canvas = trackPreviewCanvas.value;
  if (!canvas || !track.value) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.fillStyle = '#0a0a2e';
  ctx.fillRect(0, 0, 300, 200);

  const bounds = getTrackBounds(track.value);
  const scaleX = 280 / (bounds.maxX - bounds.minX);
  const scaleY = 180 / (bounds.maxY - bounds.minY);
  const scale = Math.min(scaleX, scaleY);
  const offsetX = 150 - (bounds.maxX + bounds.minX) / 2 * scale;
  const offsetY = 100 - (bounds.maxY + bounds.minY) / 2 * scale;

  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);

  drawBezierPath(ctx, track.value.outerBoundary.controlPoints);
  ctx.fillStyle = 'rgba(20, 30, 60, 0.8)';
  ctx.fill();
  ctx.strokeStyle = '#4ecdc4';
  ctx.lineWidth = 3;
  ctx.stroke();

  drawBezierPath(ctx, track.value.innerBoundary.controlPoints);
  ctx.fillStyle = '#0a0a1a';
  ctx.fill();
  ctx.strokeStyle = '#ff6b6b';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.restore();
}

function getTrackBounds(track: Track) {
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;

  for (const cp of track.outerBoundary.controlPoints) {
    minX = Math.min(minX, cp.x);
    maxX = Math.max(maxX, cp.x);
    minY = Math.min(minY, cp.y);
    maxY = Math.max(maxY, cp.y);
  }

  return { minX, maxX, minY, maxY };
}

async function toggleReady() {
  try {
    const res = await fetch(`/api/rooms/${roomId.value}/ready`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerId: playerId.value,
        isReady: !isReady.value
      })
    });
    
    if (res.ok) {
      isReady.value = !isReady.value;
      loadRoom();
    }
  } catch (e) {
    console.error('Failed to toggle ready:', e);
  }
}

async function setLaps(laps: number) {
  totalLaps.value = laps;
}

const canStart = computed(() => {
  if (!isHost.value) return false;
  const readyCount = players.value.filter(p => p.isReady && !p.disconnected).length;
  return readyCount >= 2;
});

async function startGame() {
  if (!canStart.value) return;

  try {
    const res = await fetch(`/api/rooms/${roomId.value}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerId: playerId.value
      })
    });
    
    if (res.ok) {
      router.push(`/game/${roomId.value}`);
    }
  } catch (e) {
    console.error('Failed to start game:', e);
  }
}

async function leaveRoom() {
  try {
    await fetch(`/api/rooms/${roomId.value}/leave`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerId: playerId.value
      })
    });
  } catch (e) {
    console.error('Failed to leave room:', e);
  }
  
  router.push('/rooms');
}
</script>

<style scoped>
.room-lobby {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: linear-gradient(135deg, #0a0a2e 0%, #1a1a3e 100%);
  color: #fff;
  padding: 20px;
  box-sizing: border-box;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.header h2 {
  margin: 0;
  font-size: 24px;
  color: #4ecdc4;
}

.back-btn {
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  color: #fff;
  cursor: pointer;
  font-size: 14px;
}

.back-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.room-id {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  font-family: monospace;
}

.content {
  flex: 1;
  display: flex;
  gap: 20px;
  overflow: hidden;
}

.left-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.right-panel {
  width: 350px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.players-section, .track-section, .settings-section {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 16px;
}

.players-section h3,
.track-section h3,
.settings-section h3 {
  margin: 0 0 16px 0;
  font-size: 18px;
  color: #4ecdc4;
}

.players-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 300px;
  overflow-y: auto;
}

.player-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 8px;
  border-left: 3px solid transparent;
  transition: all 0.3s;
}

.player-item.ready {
  border-left-color: #2ed573;
  background: rgba(46, 213, 115, 0.1);
}

.player-item.host {
  border-left-color: #f9ca24;
}

.player-item.disconnected {
  opacity: 0.5;
}

.player-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.host-badge {
  font-size: 16px;
}

.player-name {
  font-size: 15px;
  font-weight: 500;
}

.disconnected-badge {
  font-size: 11px;
  color: #ff6b6b;
  background: rgba(255, 107, 107, 0.2);
  padding: 2px 6px;
  border-radius: 4px;
}

.ready-badge {
  font-size: 12px;
  color: #2ed573;
  background: rgba(46, 213, 115, 0.2);
  padding: 4px 10px;
  border-radius: 12px;
}

.not-ready-badge {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  background: rgba(255, 255, 255, 0.1);
  padding: 4px 10px;
  border-radius: 12px;
}

.actions {
  margin-top: auto;
}

.ready-btn, .start-btn {
  width: 100%;
  padding: 14px;
  font-size: 16px;
  font-weight: bold;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.3s;
}

.ready-btn {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  border: 2px solid rgba(255, 255, 255, 0.2);
}

.ready-btn.ready {
  background: rgba(46, 213, 115, 0.2);
  border-color: #2ed573;
  color: #2ed573;
}

.start-btn {
  background: linear-gradient(135deg, #4ecdc4, #45b7d1);
  color: #fff;
  box-shadow: 0 4px 15px rgba(78, 205, 196, 0.4);
}

.start-btn:hover:not(.disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(78, 205, 196, 0.6);
}

.start-btn.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.track-name {
  font-size: 18px;
  font-weight: bold;
  margin-bottom: 4px;
}

.track-author {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 12px;
}

.track-details {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 12px;
}

.track-preview {
  display: flex;
  justify-content: center;
  background: #0a0a1a;
  border-radius: 8px;
  padding: 8px;
}

.setting-item {
  margin-bottom: 16px;
}

.setting-item label {
  display: block;
  margin-bottom: 8px;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.8);
}

.lap-options {
  display: flex;
  gap: 8px;
}

.lap-btn {
  flex: 1;
  padding: 10px;
  background: rgba(255, 255, 255, 0.05);
  border: 2px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: #fff;
  cursor: pointer;
  transition: all 0.3s;
  font-size: 14px;
}

.lap-btn.active {
  border-color: #4ecdc4;
  background: rgba(78, 205, 196, 0.2);
}
</style>
