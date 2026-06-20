<template>
  <div class="leaderboard-page">
    <div class="header">
      <button class="back-btn" @click="goBack">← 返回</button>
      <h2>排行榜</h2>
      <div class="tabs">
        <button 
          :class="['tab-btn', { active: currentTab === 'track' }]"
          @click="currentTab = 'track'"
        >
          赛道排行
        </button>
        <button 
          :class="['tab-btn', { active: currentTab === 'global' }]"
          @click="currentTab = 'global'"
        >
          全球排行
        </button>
      </div>
    </div>

    <div class="content">
      <div v-if="currentTab === 'track'" class="track-leaderboard">
        <div class="track-selector">
          <label>选择赛道</label>
          <select v-model="selectedTrackId" @change="loadLeaderboard">
            <option v-for="track in tracks" :key="track.id" :value="track.id">
              {{ track.name }}
            </option>
          </select>
        </div>

        <div class="track-info" v-if="selectedTrack">
          <h3>{{ selectedTrack.name }}</h3>
          <p>作者: {{ selectedTrack.author }} · 游玩 {{ selectedTrack.playCount }} 次</p>
        </div>

        <div class="leaderboard-list">
          <div v-if="loading" class="loading">加载中...</div>
          <div v-else-if="entries.length === 0" class="empty">
            暂无记录，快来创造第一个记录吧！
          </div>
          <div 
            v-for="(entry, index) in entries" 
            :key="index"
            :class="['leaderboard-item', { top: index < 3 }]"
          >
            <span class="rank">{{ index + 1 }}</span>
            <span class="name">{{ entry.playerName }}</span>
            <span class="time">{{ formatTime(entry.time) }}</span>
            <span class="date">{{ formatDate(entry.date) }}</span>
          </div>
        </div>
      </div>

      <div v-else class="global-leaderboard">
        <h3>全球胜场排行</h3>
        
        <div class="leaderboard-list">
          <div v-if="globalLoading" class="loading">加载中...</div>
          <div v-else-if="globalEntries.length === 0" class="empty">
            暂无数据
          </div>
          <div 
            v-for="(entry, index) in globalEntries" 
            :key="entry.playerName"
            :class="['leaderboard-item', { top: index < 3 }]"
          >
            <span class="rank">{{ index + 1 }}</span>
            <span class="name">{{ entry.playerName }}</span>
            <span class="stats">
              <span class="wins">{{ entry.wins }} 胜</span>
              <span class="total">{{ entry.races }} 场</span>
            </span>
            <span class="winrate">
              {{ entry.races > 0 ? Math.round(entry.wins / entry.races * 100) : 0 }}%
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import type { Track, LeaderboardEntry, GlobalLeaderboardEntry } from '../types/game';

const router = useRouter();

const currentTab = ref<'track' | 'global'>('track');
const tracks = ref<Track[]>([]);
const selectedTrackId = ref('beginner-circle');
const entries = ref<LeaderboardEntry[]>([]);
const globalEntries = ref<GlobalLeaderboardEntry[]>([]);
const loading = ref(true);
const globalLoading = ref(true);

const selectedTrack = computed(() => {
  return tracks.value.find(t => t.id === selectedTrackId.value) || null;
});

onMounted(() => {
  loadTracks();
  loadGlobalLeaderboard();
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
      loadLeaderboard();
    }
  } catch (e) {
    console.error('Failed to load tracks:', e);
  }
}

async function loadLeaderboard() {
  if (!selectedTrackId.value) return;
  
  loading.value = true;
  
  try {
    const res = await fetch(`/api/leaderboard/${selectedTrackId.value}`);
    const data = await res.json();
    entries.value = data.entries || [];
  } catch (e) {
    console.error('Failed to load leaderboard:', e);
  } finally {
    loading.value = false;
  }
}

async function loadGlobalLeaderboard() {
  globalLoading.value = true;
  
  try {
    const res = await fetch('/api/global-leaderboard');
    const data = await res.json();
    globalEntries.value = data.entries || [];
  } catch (e) {
    console.error('Failed to load global leaderboard:', e);
  } finally {
    globalLoading.value = false;
  }
}

function formatTime(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = Math.floor((ms % 1000) / 10);
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function goBack() {
  router.push('/');
}
</script>

<style scoped>
.leaderboard-page {
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

.tabs {
  display: flex;
  gap: 0;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  padding: 4px;
}

.tab-btn {
  padding: 8px 20px;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  font-size: 14px;
  transition: all 0.3s;
}

.tab-btn.active {
  background: #4ecdc4;
  color: #fff;
}

.content {
  flex: 1;
  overflow-y: auto;
  max-width: 600px;
  margin: 0 auto;
  width: 100%;
}

.track-selector {
  margin-bottom: 20px;
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

.track-info {
  text-align: center;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.track-info h3 {
  margin: 0 0 8px 0;
  font-size: 22px;
  color: #4ecdc4;
}

.track-info p {
  margin: 0;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
}

.global-leaderboard h3 {
  text-align: center;
  margin: 0 0 20px 0;
  font-size: 20px;
  color: #f9ca24;
}

.leaderboard-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.loading, .empty {
  text-align: center;
  padding: 40px;
  color: rgba(255, 255, 255, 0.5);
}

.leaderboard-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 20px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 10px;
  border-left: 3px solid transparent;
  transition: all 0.3s;
}

.leaderboard-item:hover {
  background: rgba(255, 255, 255, 0.06);
}

.leaderboard-item.top {
  background: rgba(249, 202, 36, 0.08);
  border-left-color: #f9ca24;
}

.leaderboard-item.top .rank {
  color: #f9ca24;
  font-size: 20px;
}

.rank {
  width: 30px;
  font-size: 16px;
  font-weight: bold;
  color: rgba(255, 255, 255, 0.6);
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
  min-width: 50px;
  text-align: right;
}

.stats {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.wins {
  font-size: 14px;
  font-weight: bold;
  color: #f9ca24;
}

.total {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
}

.winrate {
  font-size: 14px;
  color: #4ecdc4;
  font-weight: bold;
  min-width: 50px;
  text-align: right;
}
</style>
