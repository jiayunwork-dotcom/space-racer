<template>
  <div class="ghost-race-page">
    <div class="header">
      <button class="back-btn" @click="goBack">← 返回</button>
      <h2>幽灵赛模式</h2>
    </div>

    <div class="content">
      <div class="track-selector">
        <label>选择赛道</label>
        <select v-model="selectedTrackId" @change="loadReplays">
          <option v-for="track in tracks" :key="track.id" :value="track.id">
            {{ track.name }} ({{ track.isBuiltIn ? '内置' : '玩家创作' }})
          </option>
        </select>
      </div>

      <div class="replays-section">
        <h3>可用录像</h3>
        
        <div v-if="loading" class="loading">加载中...</div>
        
        <div v-else-if="replays.length === 0" class="empty">
          <p>该赛道暂无录像记录</p>
          <p class="hint">先完成一场比赛来创建第一个录像吧！</p>
        </div>

        <div v-else class="replays-list">
          <div 
            v-for="(replay, index) in replays" 
            :key="replay.id"
            :class="['replay-item', { selected: selectedReplayId === replay.id }]"
            @click="selectReplay(replay.id)"
          >
            <span class="rank">#{{ index + 1 }}</span>
            <span class="name">{{ replay.playerName }}</span>
            <span class="time">{{ formatTime(replay.totalTime) }}</span>
            <span class="date">{{ formatDate(replay.createdAt) }}</span>
          </div>
        </div>
      </div>

      <div class="race-settings" v-if="selectedTrackId">
        <h3>比赛设置</h3>
        
        <div class="form-group">
          <label>总圈数</label>
          <div class="lap-options">
            <button 
              v-for="laps in [3, 5, 10]" 
              :key="laps"
              :class="['lap-btn', { active: totalLaps === laps }]"
              @click="totalLaps = laps"
            >
              {{ laps }} 圈
            </button>
          </div>
        </div>

        <button 
          class="start-btn" 
          :disabled="!selectedReplayId"
          @click="startGhostRace"
        >
          {{ selectedReplayId ? '开始幽灵赛' : '请选择一个录像' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import type { Track, Replay, EngineType } from '../types/game';
import { SHIP_COLORS } from '../types/game';

const router = useRouter();

const tracks = ref<Track[]>([]);
const replays = ref<Replay[]>([]);
const loading = ref(false);
const selectedTrackId = ref('beginner-circle');
const selectedReplayId = ref<string | null>(null);
const totalLaps = ref(3);
const playerName = ref('');
const selectedEngine = ref<EngineType>('balanced');
const selectedColor = ref(0);

const colors = SHIP_COLORS;

const engines = [
  { type: 'speed' as EngineType, name: '高速型', desc: '推力大 速度快 转向慢' },
  { type: 'balanced' as EngineType, name: '平衡型', desc: '各项属性均衡' },
  { type: 'agile' as EngineType, name: '灵活型', desc: '转向快 质量小 速度低' }
];

onMounted(() => {
  const savedName = localStorage.getItem('playerName');
  if (savedName) playerName.value = savedName;
  
  const savedEngine = localStorage.getItem('engineType') as EngineType;
  if (savedEngine) selectedEngine.value = savedEngine;
  
  const savedColor = localStorage.getItem('colorIndex');
  if (savedColor !== null) selectedColor.value = parseInt(savedColor);

  loadTracks();
});

async function loadTracks() {
  try {
    const res = await fetch('/api/tracks');
    const data = await res.json();
    tracks.value = data.tracks || [];
    
    if (tracks.value.length > 0 && !selectedTrackId.value) {
      selectedTrackId.value = tracks.value[0].id;
    }
    
    if (selectedTrackId.value) {
      loadReplays();
    }
  } catch (e) {
    console.error('Failed to load tracks:', e);
  }
}

async function loadReplays() {
  if (!selectedTrackId.value) return;
  
  loading.value = true;
  
  try {
    const res = await fetch(`/api/replays/${selectedTrackId.value}`);
    const data = await res.json();
    replays.value = data.replays || [];
    
    if (replays.value.length > 0 && !selectedReplayId.value) {
      selectedReplayId.value = replays.value[0].id;
    }
  } catch (e) {
    console.error('Failed to load replays:', e);
  } finally {
    loading.value = false;
  }
}

function selectReplay(replayId: string) {
  selectedReplayId.value = replayId;
}

function startGhostRace() {
  if (!selectedReplayId.value) return;
  
  localStorage.setItem('playerName', playerName.value);
  localStorage.setItem('engineType', selectedEngine.value);
  localStorage.setItem('colorIndex', selectedColor.value.toString());
  
  const playerId = localStorage.getItem('playerId') || 'player_' + Math.random().toString(36).substr(2, 9);
  localStorage.setItem('playerId', playerId);
  
  router.push({
    path: '/ghost-race',
    query: {
      trackId: selectedTrackId.value,
      replayId: selectedReplayId.value,
      totalLaps: totalLaps.value.toString(),
      playerId,
      playerName: playerName.value,
      engineType: selectedEngine.value,
      colorIndex: selectedColor.value.toString()
    }
  });
}

function formatTime(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = Math.floor((ms % 1000) / 10);
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

function goBack() {
  router.push('/');
}
</script>

<style scoped>
.ghost-race-page {
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
  gap: 20px;
  margin-bottom: 24px;
}

.header h2 {
  margin: 0;
  font-size: 24px;
  flex: 1;
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

.content {
  flex: 1;
  overflow-y: auto;
  max-width: 800px;
  margin: 0 auto;
  width: 100%;
}

.track-selector {
  margin-bottom: 24px;
}

.track-selector label {
  display: block;
  margin-bottom: 8px;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.7);
}

.track-selector select {
  width: 100%;
  padding: 12px;
  font-size: 15px;
  color: #fff;
  background: rgba(255, 255, 255, 0.05);
  border: 2px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  outline: none;
  cursor: pointer;
}

.track-selector select:focus {
  border-color: #4ecdc4;
}

.replays-section {
  margin-bottom: 24px;
}

.replays-section h3 {
  margin: 0 0 16px 0;
  font-size: 18px;
  color: #4ecdc4;
}

.loading, .empty {
  text-align: center;
  padding: 40px;
  color: rgba(255, 255, 255, 0.5);
}

.hint {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.4);
  margin-top: 8px;
}

.replays-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 300px;
  overflow-y: auto;
}

.replay-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 20px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 10px;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.3s;
}

.replay-item:hover {
  background: rgba(255, 255, 255, 0.06);
}

.replay-item.selected {
  border-color: #4ecdc4;
  background: rgba(78, 205, 196, 0.1);
}

.rank {
  width: 40px;
  font-size: 18px;
  font-weight: bold;
  color: #f9ca24;
  text-align: center;
}

.name {
  flex: 1;
  font-size: 15px;
}

.time {
  font-family: monospace;
  font-size: 16px;
  color: #4ecdc4;
  font-weight: bold;
}

.date {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
}

.race-settings {
  padding: 20px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.race-settings h3 {
  margin: 0 0 16px 0;
  font-size: 18px;
  color: #a29bfe;
  text-align: center;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
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
}

.lap-btn.active {
  border-color: #4ecdc4;
  background: rgba(78, 205, 196, 0.2);
}

.start-btn {
  width: 100%;
  padding: 16px;
  font-size: 18px;
  font-weight: bold;
  background: linear-gradient(135deg, #a29bfe, #6c5ce7);
  border: none;
  border-radius: 10px;
  color: #fff;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 4px 15px rgba(162, 155, 254, 0.4);
}

.start-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(162, 155, 254, 0.6);
}

.start-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  box-shadow: none;
}
</style>
