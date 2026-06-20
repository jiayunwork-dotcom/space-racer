<template>
  <div class="tournament-lobby">
    <div class="header">
      <button class="back-btn" @click="goBack">← 返回</button>
      <h2>锦标赛大厅</h2>
      <button class="refresh-btn" @click="loadData">🔄</button>
    </div>

    <div class="tabs">
      <button 
        :class="['tab-btn', { active: activeTab === 'registering' }]"
        @click="activeTab = 'registering'"
      >
        报名中
        <span class="badge">{{ registeringTournaments.length }}</span>
      </button>
      <button 
        :class="['tab-btn', { active: activeTab === 'ongoing' }]"
        @click="activeTab = 'ongoing'"
      >
        进行中
        <span class="badge">{{ ongoingTournaments.length }}</span>
      </button>
    </div>

    <div class="content">
      <div v-if="loading" class="loading">加载中...</div>
      
      <div v-else-if="currentTournaments.length === 0" class="empty">
        <p>{{ activeTab === 'registering' ? '暂无报名中的锦标赛' : '暂无进行中的锦标赛' }}</p>
        <p class="hint">创建一个新锦标赛开始赛季吧！</p>
      </div>

      <div v-else class="tournaments">
        <div 
          v-for="tournament in currentTournaments" 
          :key="tournament.id" 
          class="tournament-card"
          @click="viewTournament(tournament.id)"
        >
          <div class="tournament-header">
            <h3>{{ tournament.name }}</h3>
            <span class="status-badge" :class="tournament.status">
              {{ tournament.status === 'registering' ? '报名中' : '进行中' }}
            </span>
          </div>
          <div class="tournament-info">
            <div class="info-item">
              <span class="label">创建者</span>
              <span class="value">{{ tournament.creatorName }}</span>
            </div>
            <div class="info-item">
              <span class="label">报名人数</span>
              <span class="value player-count">{{ tournament.players.length }} / 8</span>
            </div>
            <div class="info-item">
              <span class="label">分站数</span>
              <span class="value">{{ tournament.stages.length }} 站</span>
            </div>
          </div>
          <div class="tournament-stages">
            <span v-for="(stage, idx) in tournament.stages" :key="idx" class="stage-tag">
              {{ stage.trackName }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <div class="create-section">
      <button class="create-btn" @click="showCreateModal = true">+ 创建锦标赛</button>
    </div>

    <div v-if="showCreateModal" class="modal-overlay" @click.self="showCreateModal = false">
      <div class="modal">
        <h3>创建锦标赛</h3>
        
        <div class="form-group">
          <label>赛事名称</label>
          <input v-model="newTournament.name" type="text" placeholder="输入赛事名称" maxlength="30" />
        </div>

        <div class="form-group">
          <label>选择分站赛道 ({{ newTournament.stages.length }}/6)</label>
          <div class="track-list">
            <label 
              v-for="track in availableTracks" 
              :key="track.id" 
              :class="['track-item', { selected: isTrackSelected(track.id) }]"
            >
              <input 
                type="checkbox" 
                :value="track.id"
                :checked="isTrackSelected(track.id)"
                @change="toggleTrack(track)"
              />
              <div class="track-info">
                <span class="track-name">{{ track.name }}</span>
                <span class="track-author">{{ track.isBuiltIn ? '内置赛道' : track.author }}</span>
              </div>
            </label>
          </div>
        </div>

        <div class="form-group">
          <label>每站圈数: {{ newTournament.laps }} 圈</label>
          <div class="lap-options">
            <button 
              v-for="laps in [2, 3, 5, 10]" 
              :key="laps"
              :class="['lap-btn', { active: newTournament.laps === laps }]"
              @click="newTournament.laps = laps"
            >
              {{ laps }} 圈
            </button>
          </div>
        </div>

        <div class="points-info">
          <h4>积分规则</h4>
          <div class="points-grid">
            <span v-for="(points, pos) in pointsSystem" :key="pos" class="point-item">
              <span class="pos">{{ pos }}名</span>
              <span class="points">{{ points }}分</span>
            </span>
          </div>
          <p class="note">未完赛得 0 分</p>
        </div>

        <div class="modal-actions">
          <button class="cancel-btn" @click="showCreateModal = false">取消</button>
          <button class="confirm-btn" @click="createTournament" :disabled="!canCreate">创建</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import type { Tournament, Track } from '../types/game';
import { POINTS_SYSTEM, TOURNAMENT_MIN_STAGES, TOURNAMENT_MAX_STAGES } from '../types/game';

const router = useRouter();

const activeTab = ref<'registering' | 'ongoing'>('registering');
const loading = ref(true);
const registeringTournaments = ref<Tournament[]>([]);
const ongoingTournaments = ref<Tournament[]>([]);
const tracks = ref<Track[]>([]);
const showCreateModal = ref(false);
const playerId = ref('');
const playerName = ref('');

const newTournament = ref({
  name: '',
  laps: 3,
  stages: [] as Array<{ trackId: string; trackName: string }>
});

const pointsSystem = POINTS_SYSTEM;

const currentTournaments = computed(() => {
  return activeTab.value === 'registering' ? registeringTournaments.value : ongoingTournaments.value;
});

const availableTracks = computed(() => tracks.value);

const canCreate = computed(() => {
  return newTournament.value.stages.length >= TOURNAMENT_MIN_STAGES && 
         newTournament.value.stages.length <= TOURNAMENT_MAX_STAGES &&
         newTournament.value.name.trim().length > 0;
});

let refreshInterval: number | null = null;

onMounted(() => {
  const savedName = localStorage.getItem('playerName');
  const savedId = localStorage.getItem('playerId');
  
  if (savedName) playerName.value = savedName;
  
  if (savedId) {
    playerId.value = savedId;
  } else {
    playerId.value = 'player_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('playerId', playerId.value);
  }

  loadData();
  
  refreshInterval = window.setInterval(loadData, 5000);
});

onUnmounted(() => {
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }
});

async function loadTracks() {
  try {
    const res = await fetch('/api/tracks');
    const data = await res.json();
    tracks.value = data.tracks || [];
  } catch (e) {
    console.error('Failed to load tracks:', e);
  }
}

async function loadData() {
  await loadTracks();
  
  try {
    const [regRes, ongRes] = await Promise.all([
      fetch('/api/tournaments?status=registering'),
      fetch('/api/tournaments?status=ongoing')
    ]);
    
    const regData = await regRes.json();
    const ongData = await ongRes.json();
    
    registeringTournaments.value = regData.tournaments || [];
    ongoingTournaments.value = ongData.tournaments || [];
    loading.value = false;
  } catch (e) {
    console.error('Failed to load tournaments:', e);
    loading.value = false;
  }
}

function isTrackSelected(trackId: string): boolean {
  return newTournament.value.stages.some(s => s.trackId === trackId);
}

function toggleTrack(track: Track) {
  const index = newTournament.value.stages.findIndex(s => s.trackId === track.id);
  
  if (index >= 0) {
    newTournament.value.stages.splice(index, 1);
  } else if (newTournament.value.stages.length < TOURNAMENT_MAX_STAGES) {
    newTournament.value.stages.push({
      trackId: track.id,
      trackName: track.name
    });
  }
}

async function createTournament() {
  if (!canCreate.value) return;
  
  try {
    const stages = newTournament.value.stages.map(s => ({
      trackId: s.trackId,
      laps: newTournament.value.laps
    }));
    
    const res = await fetch('/api/tournaments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newTournament.value.name,
        creatorId: playerId.value,
        creatorName: playerName.value || '玩家',
        stages
      })
    });
    
    const data = await res.json();
    if (data.tournament) {
      showCreateModal.value = false;
      resetCreateForm();
      router.push(`/tournament/${data.tournament.id}`);
    }
  } catch (e) {
    console.error('Failed to create tournament:', e);
  }
}

function resetCreateForm() {
  newTournament.value = {
    name: '',
    laps: 3,
    stages: []
  };
}

function viewTournament(tournamentId: string) {
  router.push(`/tournament/${tournamentId}`);
}

function goBack() {
  router.push('/');
}
</script>

<style scoped>
.tournament-lobby {
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
  background: linear-gradient(90deg, #f093fb, #f5576c);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
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

.refresh-btn {
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  color: #fff;
  cursor: pointer;
  font-size: 18px;
}

.tabs {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
}

.tab-btn {
  flex: 1;
  padding: 12px 24px;
  background: rgba(255, 255, 255, 0.05);
  border: 2px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  font-size: 16px;
  font-weight: bold;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.tab-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.tab-btn.active {
  background: linear-gradient(135deg, #f093fb, #f5576c);
  border-color: transparent;
  color: #fff;
}

.badge {
  background: rgba(255, 255, 255, 0.2);
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 12px;
}

.content {
  flex: 1;
  overflow-y: auto;
}

.loading, .empty {
  text-align: center;
  padding: 60px 20px;
  color: rgba(255, 255, 255, 0.6);
}

.hint {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.4);
  margin-top: 8px;
}

.tournaments {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

.tournament-card {
  padding: 20px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s;
}

.tournament-card:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: #f093fb;
  transform: translateY(-2px);
}

.tournament-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.tournament-header h3 {
  margin: 0;
  font-size: 18px;
}

.status-badge {
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: bold;
}

.status-badge.registering {
  background: rgba(78, 205, 196, 0.2);
  color: #4ecdc4;
}

.status-badge.ongoing {
  background: rgba(245, 87, 108, 0.2);
  color: #f5576c;
}

.tournament-info {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 12px;
}

.info-item {
  text-align: center;
}

.info-item .label {
  display: block;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  margin-bottom: 4px;
}

.info-item .value {
  font-size: 14px;
  font-weight: bold;
}

.player-count {
  color: #4ecdc4;
}

.tournament-stages {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.stage-tag {
  padding: 4px 8px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.7);
}

.create-section {
  margin-top: 20px;
  display: flex;
  justify-content: center;
}

.create-btn {
  padding: 14px 60px;
  font-size: 18px;
  font-weight: bold;
  background: linear-gradient(135deg, #f093fb, #f5576c);
  border: none;
  border-radius: 10px;
  color: #fff;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 4px 15px rgba(245, 87, 108, 0.4);
}

.create-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(245, 87, 108, 0.6);
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal {
  background: #1a1a3e;
  padding: 30px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  width: 500px;
  max-width: 90%;
  max-height: 80vh;
  overflow-y: auto;
}

.modal h3 {
  margin: 0 0 20px 0;
  text-align: center;
  font-size: 22px;
  background: linear-gradient(90deg, #f093fb, #f5576c);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
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

.form-group input[type="text"] {
  width: 100%;
  padding: 10px 12px;
  font-size: 14px;
  color: #fff;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  outline: none;
  box-sizing: border-box;
}

.form-group input[type="text"]:focus {
  border-color: #f093fb;
}

.track-list {
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 8px;
}

.track-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.track-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.track-item.selected {
  background: rgba(240, 147, 251, 0.2);
  border: 1px solid #f093fb;
}

.track-item input {
  cursor: pointer;
}

.track-info {
  flex: 1;
}

.track-name {
  display: block;
  font-size: 14px;
  font-weight: bold;
}

.track-author {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
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
  border-color: #f093fb;
  background: rgba(240, 147, 251, 0.2);
}

.points-info {
  margin-top: 20px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.points-info h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: #f093fb;
}

.points-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-bottom: 8px;
}

.point-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 6px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 6px;
}

.point-item .pos {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.6);
}

.point-item .points {
  font-size: 14px;
  font-weight: bold;
  color: #4ecdc4;
}

.note {
  margin: 0;
  text-align: center;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}

.modal-actions {
  display: flex;
  gap: 12px;
  margin-top: 24px;
}

.cancel-btn, .confirm-btn {
  flex: 1;
  padding: 12px;
  font-size: 16px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s;
}

.cancel-btn {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.cancel-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.confirm-btn {
  background: linear-gradient(135deg, #f093fb, #f5576c);
  color: #fff;
  font-weight: bold;
}

.confirm-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.confirm-btn:hover:not(:disabled) {
  transform: translateY(-1px);
}
</style>
