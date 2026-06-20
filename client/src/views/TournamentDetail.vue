<template>
  <div class="tournament-detail">
    <div class="header">
      <button class="back-btn" @click="goBack">← 返回</button>
      <div class="header-info">
        <h2>{{ tournament?.name }}</h2>
        <div class="meta">
          <span class="status-badge" :class="tournament?.status">
            {{ statusText }}
          </span>
          <span class="creator">创建者: {{ tournament?.creatorName }}</span>
          <span class="player-count">{{ tournament?.players.length }} / 8 人</span>
        </div>
      </div>
      <button class="refresh-btn" @click="loadData">🔄</button>
    </div>

    <div v-if="loading" class="loading-container">
      <div class="loading">加载中...</div>
    </div>

    <div v-else class="main-content">
      <div class="sidebar">
        <h3>分站列表</h3>
        <div class="stages">
          <div 
            v-for="(stage, idx) in tournament?.stages" 
            :key="idx"
            :class="['stage-item', getStageClass(stage, idx)]"
          >
            <div class="stage-icon">
              <span v-if="stage.status === 'completed'" class="check-icon">✓</span>
              <span v-else-if="idx === tournament?.currentStageIndex && tournament?.status === 'ongoing'" class="current-icon">▶</span>
              <span v-else class="number-icon">{{ idx + 1 }}</span>
            </div>
            <div class="stage-info">
              <div class="stage-name">{{ stage.trackName }}</div>
              <div class="stage-laps">{{ stage.laps }} 圈</div>
            </div>
            <div v-if="stage.status === 'preparing'" class="countdown">
              {{ formatCountdown(countdownRemaining) }}
            </div>
          </div>
        </div>

        <div v-if="isRegistering && isCreator" class="action-section">
          <button 
            class="start-btn" 
            @click="startTournament"
            :disabled="(tournament?.players.length || 0) < 2"
          >
            开始锦标赛
          </button>
          <p v-if="(tournament?.players.length || 0) < 2" class="hint">
            至少需要 2 名玩家才能开始
          </p>
        </div>
      </div>

      <div class="content-area">
        <div class="standings-section">
          <h3>积分榜</h3>
          
          <div v-if="isPreparing" class="preparation-banner">
            <div class="banner-content">
              <span class="banner-icon">⏱️</span>
              <div>
                <div class="banner-title">第 {{ currentStageIndex + 1 }} 站准备中</div>
                <div class="banner-subtitle">{{ currentStage?.trackName }} · {{ currentStage?.laps }} 圈</div>
              </div>
              <div class="countdown-large">
                <div class="countdown-number">{{ Math.ceil(countdownRemaining / 1000) }}</div>
                <div class="countdown-label">秒</div>
              </div>
            </div>
          </div>

          <div class="standings-list">
            <div 
              v-for="(standing, idx) in standings" 
              :key="standing.playerId"
              :class="['standing-item', { 'is-self': standing.playerId === playerId }]"
            >
              <div class="rank">
                <span v-if="idx === 0" class="medal gold">🥇</span>
                <span v-else-if="idx === 1" class="medal silver">🥈</span>
                <span v-else-if="idx === 2" class="medal bronze">🥉</span>
                <span v-else class="rank-number">{{ idx + 1 }}</span>
              </div>
              
              <div 
                class="player-color" 
                :style="{ backgroundColor: SHIP_COLORS[standing.colorIndex] }"
              ></div>
              
              <div class="player-info">
                <div class="player-name">
                  {{ standing.playerName }}
                  <span v-if="standing.playerId === tournament?.creatorId" class="creator-tag">创建者</span>
                </div>
                <div class="stage-details">
                  <button 
                    class="expand-btn"
                    @click="toggleExpand(standing.playerId)"
                  >
                    {{ expandedPlayers.has(standing.playerId) ? '收起' : '展开' }}各站得分
                  </button>
                </div>
                
                <div v-if="expandedPlayers.has(standing.playerId)" class="stage-scores">
                  <div 
                    v-for="(result, sIdx) in standing.stageResults" 
                    :key="sIdx"
                    :class="['stage-score', { completed: result !== null }]"
                  >
                    <span class="stage-label">第{{ sIdx + 1 }}站</span>
                    <span v-if="result" class="score-info">
                      <span class="position">第{{ result.position }}名</span>
                      <span class="points">+{{ result.points }}分</span>
                      <span v-if="result.disconnected" class="dnf">（断线）</span>
                    </span>
                    <span v-else class="pending">-</span>
                  </div>
                </div>
              </div>
              
              <div class="total-points">
                <span class="points-value">{{ standing.totalPoints }}</span>
                <span class="points-label">分</span>
              </div>
            </div>
          </div>
        </div>

        <div v-if="isRegistering && !isJoined" class="join-section">
          <button class="join-btn" @click="joinTournament">
            加入锦标赛
          </button>
        </div>

        <div v-if="isRegistering && isJoined" class="joined-notice">
          <span class="check">✓</span> 已报名，等待创建者开始比赛
        </div>
      </div>
    </div>

    <div v-if="showEnterRaceButton" class="bottom-action">
      <button class="enter-race-btn" @click="enterRace">
        <span class="btn-icon">🏁</span>
        进入比赛 - 第 {{ currentStageIndex + 1 }} 站: {{ currentStage?.trackName }}
      </button>
    </div>

    <div v-if="isCreator && isOngoing && currentStage?.status === 'pending'" class="bottom-action">
      <button class="prepare-btn" @click="prepareStage">
        <span class="btn-icon">⏱️</span>
        开始第 {{ currentStageIndex + 1 }} 站准备 (30秒倒计时)
      </button>
    </div>

    <div v-if="showSpectateButton" class="bottom-action">
      <button class="spectate-btn" @click="enterSpectate">
        <span class="btn-icon">👁</span>
        观战当前站 - 第 {{ currentStageIndex + 1 }} 站: {{ currentStage?.trackName }}
      </button>
    </div>

    <div v-if="showFinalStandings" class="final-modal-overlay">
      <div class="final-modal">
        <div class="final-header">
          <span class="trophy">🏆</span>
          <h2>锦标赛最终排名</h2>
          <span class="tournament-name">{{ tournament?.name }}</span>
        </div>
        
        <div class="final-standings">
          <div 
            v-for="(standing, idx) in standings" 
            :key="standing.playerId"
            :class="['final-standing-item', `rank-${idx + 1}`]"
          >
            <div class="final-rank">
              <span v-if="idx === 0" class="medal-large">🥇</span>
              <span v-else-if="idx === 1" class="medal-large">🥈</span>
              <span v-else-if="idx === 2" class="medal-large">🥉</span>
              <span v-else class="rank-number-large">{{ idx + 1 }}</span>
            </div>
            
            <div 
              class="player-color-large" 
              :style="{ backgroundColor: SHIP_COLORS[standing.colorIndex] }"
            ></div>
            
            <div class="final-player-info">
              <div class="final-player-name">{{ standing.playerName }}</div>
              <div class="final-player-stats">
                <span>总积分: <strong>{{ standing.totalPoints }}</strong></span>
                <span v-if="standing.bestPositions.length > 0">
                  最佳名次: <strong>第{{ standing.bestPositions[0] }}名</strong>
                </span>
              </div>
            </div>
            
            <div class="final-points">
              <span class="final-points-value">{{ standing.totalPoints }}</span>
              <span class="final-points-label">分</span>
            </div>
          </div>
        </div>
        
        <button class="close-final-btn" @click="showFinalStandings = false">
          关闭
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import type { Tournament, TournamentStanding, TournamentStage } from '../types/game';
import { SHIP_COLORS } from '../types/game';

const router = useRouter();
const route = useRoute();

const tournamentId = computed(() => route.params.tournamentId as string);

const tournament = ref<Tournament | null>(null);
const standings = ref<TournamentStanding[]>([]);
const loading = ref(true);
const playerId = ref('');
const playerName = ref('');
const countdownRemaining = ref(0);
const expandedPlayers = ref<Set<string>>(new Set());
const showFinalStandings = ref(false);

let refreshInterval: number | null = null;
let countdownInterval: number | null = null;

const isJoined = computed(() => {
  return tournament.value?.players.some(p => p.playerId === playerId.value) ?? false;
});

const isCreator = computed(() => {
  return tournament.value?.creatorId === playerId.value;
});

const isRegistering = computed(() => tournament.value?.status === 'registering');
const isOngoing = computed(() => tournament.value?.status === 'ongoing');
const isFinished = computed(() => tournament.value?.status === 'finished');

const isPreparing = computed(() => {
  if (!isOngoing.value || !tournament.value) return false;
  const stage = tournament.value.stages[tournament.value.currentStageIndex];
  return stage?.status === 'preparing';
});

const currentStageIndex = computed(() => tournament.value?.currentStageIndex ?? 0);
const currentStage = computed(() => tournament.value?.stages[currentStageIndex.value]);

const statusText = computed(() => {
  switch (tournament.value?.status) {
    case 'registering': return '报名中';
    case 'ongoing': return '进行中';
    case 'finished': return '已结束';
    default: return '';
  }
});

const showEnterRaceButton = computed(() => {
  if (!isOngoing.value || !currentStage.value) return false;
  return (currentStage.value.status === 'preparing' && countdownRemaining.value > 0) ||
         currentStage.value.status === 'racing';
});

const showSpectateButton = computed(() => {
  if (!isOngoing.value || !currentStage.value) return false;
  if (isJoined.value) return false;
  return currentStage.value.status === 'preparing' || currentStage.value.status === 'racing';
});

watch(isFinished, (finished) => {
  if (finished && standings.value.length > 0) {
    showFinalStandings.value = true;
  }
});

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
  
  refreshInterval = window.setInterval(loadData, 2000);
  countdownInterval = window.setInterval(updateCountdown, 100);
});

onUnmounted(() => {
  if (refreshInterval) clearInterval(refreshInterval);
  if (countdownInterval) clearInterval(countdownInterval);
});

async function loadData() {
  try {
    const res = await fetch(`/api/tournaments/${tournamentId.value}`);
    const data = await res.json();
    
    if (data.tournament) {
      tournament.value = data.tournament;
      standings.value = data.standings || [];
      
      if (data.tournament.status === 'finished' && !showFinalStandings.value) {
        showFinalStandings.value = true;
      }
    }
    loading.value = false;
  } catch (e) {
    console.error('Failed to load tournament:', e);
    loading.value = false;
  }
}

function updateCountdown() {
  if (!tournament.value || tournament.value.status !== 'ongoing') return;
  
  const stage = tournament.value.stages[tournament.value.currentStageIndex];
  if (stage?.status === 'preparing' && stage.preparationEndTime) {
    countdownRemaining.value = Math.max(0, stage.preparationEndTime - Date.now());
  } else {
    countdownRemaining.value = 0;
  }
}

function formatCountdown(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  return `${seconds}s`;
}

function getStageClass(stage: TournamentStage, idx: number): string {
  if (stage.status === 'completed') return 'completed';
  if (tournament.value?.status === 'ongoing' && idx === tournament.value.currentStageIndex) {
    return 'current';
  }
  return 'pending';
}

function toggleExpand(playerId: string) {
  if (expandedPlayers.value.has(playerId)) {
    expandedPlayers.value.delete(playerId);
  } else {
    expandedPlayers.value.add(playerId);
  }
  expandedPlayers.value = new Set(expandedPlayers.value);
}

async function joinTournament() {
  try {
    const res = await fetch(`/api/tournaments/${tournamentId.value}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerId: playerId.value,
        playerName: playerName.value || '玩家'
      })
    });
    
    const data = await res.json();
    if (data.tournament) {
      tournament.value = data.tournament;
    }
  } catch (e) {
    console.error('Failed to join tournament:', e);
  }
}

async function startTournament() {
  try {
    const res = await fetch(`/api/tournaments/${tournamentId.value}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerId: playerId.value
      })
    });
    
    const data = await res.json();
    if (data.tournament) {
      tournament.value = data.tournament;
    }
  } catch (e) {
    console.error('Failed to start tournament:', e);
  }
}

async function prepareStage() {
  try {
    const res = await fetch(`/api/tournaments/${tournamentId.value}/create-stage-room`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerId: playerId.value
      })
    });
    
    const data = await res.json();
    if (data.tournament) {
      tournament.value = data.tournament;
    }
  } catch (e) {
    console.error('Failed to prepare stage:', e);
  }
}

function enterRace() {
  const roomId = currentStage.value?.roomId;
  if (roomId) {
    localStorage.setItem('tournamentId', tournamentId.value);
    localStorage.setItem('currentStageIndex', currentStageIndex.value.toString());
    router.push(`/room/${roomId}`);
  }
}

function enterSpectate() {
  const roomId = currentStage.value?.roomId;
  if (roomId) {
    localStorage.setItem('tournamentContext', JSON.stringify({
      tournamentId: tournamentId.value,
      stageIndex: currentStageIndex.value
    }));
    router.push(`/spectate/${roomId}`);
  }
}

function goBack() {
  router.push('/tournaments');
}
</script>

<style scoped>
.tournament-detail {
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
  padding-bottom: 15px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.header-info h2 {
  margin: 0 0 8px 0;
  font-size: 28px;
  background: linear-gradient(90deg, #f093fb, #f5576c);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.meta {
  display: flex;
  align-items: center;
  gap: 16px;
}

.status-badge {
  padding: 4px 12px;
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

.status-badge.finished {
  background: rgba(162, 155, 254, 0.2);
  color: #a29bfe;
}

.creator, .player-count {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
}

.back-btn, .refresh-btn {
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  color: #fff;
  cursor: pointer;
  font-size: 14px;
}

.back-btn:hover, .refresh-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.loading-container {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.loading {
  text-align: center;
  color: rgba(255, 255, 255, 0.6);
  font-size: 18px;
}

.main-content {
  flex: 1;
  display: flex;
  gap: 20px;
  overflow: hidden;
}

.sidebar {
  width: 280px;
  display: flex;
  flex-direction: column;
  padding-right: 20px;
  border-right: 1px solid rgba(255, 255, 255, 0.1);
}

.sidebar h3 {
  margin: 0 0 16px 0;
  font-size: 16px;
  color: rgba(255, 255, 255, 0.8);
}

.stages {
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
}

.stage-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 10px;
  transition: all 0.3s;
}

.stage-item.pending {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.05);
  opacity: 0.6;
}

.stage-item.current {
  background: rgba(245, 87, 108, 0.15);
  border: 2px solid #f5576c;
  box-shadow: 0 0 20px rgba(245, 87, 108, 0.2);
}

.stage-item.completed {
  background: rgba(78, 205, 196, 0.1);
  border: 1px solid rgba(78, 205, 196, 0.3);
}

.stage-icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-weight: bold;
  font-size: 14px;
}

.pending .stage-icon {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.5);
}

.current .stage-icon {
  background: #f5576c;
  color: #fff;
}

.completed .stage-icon {
  background: #4ecdc4;
  color: #fff;
}

.check-icon {
  font-size: 16px;
}

.current-icon {
  font-size: 12px;
}

.stage-info {
  flex: 1;
}

.stage-name {
  font-size: 14px;
  font-weight: bold;
  margin-bottom: 2px;
}

.pending .stage-name {
  color: rgba(255, 255, 255, 0.5);
}

.stage-laps {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
}

.countdown {
  font-size: 14px;
  font-weight: bold;
  color: #f5576c;
}

.action-section {
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.start-btn {
  width: 100%;
  padding: 14px;
  font-size: 16px;
  font-weight: bold;
  background: linear-gradient(135deg, #4ecdc4, #45b7d1);
  border: none;
  border-radius: 10px;
  color: #fff;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 4px 15px rgba(78, 205, 196, 0.4);
}

.start-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(78, 205, 196, 0.6);
}

.start-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.hint {
  margin: 8px 0 0 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
  text-align: center;
}

.content-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.standings-section {
  flex: 1;
  overflow-y: auto;
  padding-right: 10px;
}

.standings-section h3 {
  margin: 0 0 16px 0;
  font-size: 16px;
  color: rgba(255, 255, 255, 0.8);
}

.preparation-banner {
  background: linear-gradient(135deg, rgba(245, 87, 108, 0.2), rgba(240, 147, 251, 0.2));
  border: 1px solid rgba(245, 87, 108, 0.5);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 20px;
}

.banner-content {
  display: flex;
  align-items: center;
  gap: 20px;
}

.banner-icon {
  font-size: 40px;
}

.banner-title {
  font-size: 18px;
  font-weight: bold;
  margin-bottom: 4px;
  color: #f5576c;
}

.banner-subtitle {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.7);
}

.countdown-large {
  margin-left: auto;
  text-align: center;
}

.countdown-number {
  font-size: 48px;
  font-weight: bold;
  color: #f5576c;
  line-height: 1;
  text-shadow: 0 0 20px rgba(245, 87, 108, 0.5);
}

.countdown-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}

.standings-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.standing-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  transition: all 0.3s;
}

.standing-item.is-self {
  border-color: #f093fb;
  background: rgba(240, 147, 251, 0.1);
}

.rank {
  width: 40px;
  text-align: center;
}

.medal {
  font-size: 24px;
}

.rank-number {
  font-size: 18px;
  font-weight: bold;
  color: rgba(255, 255, 255, 0.6);
}

.player-color {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  flex-shrink: 0;
  border: 2px solid rgba(255, 255, 255, 0.3);
}

.player-info {
  flex: 1;
}

.player-name {
  font-size: 16px;
  font-weight: bold;
  margin-bottom: 4px;
}

.creator-tag {
  font-size: 10px;
  background: rgba(240, 147, 251, 0.3);
  color: #f093fb;
  padding: 2px 6px;
  border-radius: 4px;
  margin-left: 8px;
}

.stage-details {
  margin-bottom: 4px;
}

.expand-btn {
  background: none;
  border: none;
  color: #4ecdc4;
  font-size: 12px;
  cursor: pointer;
  padding: 0;
}

.expand-btn:hover {
  text-decoration: underline;
}

.stage-scores {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.stage-score {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 6px;
  font-size: 12px;
}

.stage-score.completed {
  background: rgba(78, 205, 196, 0.1);
}

.stage-label {
  color: rgba(255, 255, 255, 0.5);
}

.score-info {
  display: flex;
  align-items: center;
  gap: 6px;
}

.position {
  font-weight: bold;
}

.points {
  color: #4ecdc4;
  font-weight: bold;
}

.dnf {
  color: #f5576c;
  font-size: 11px;
}

.pending {
  color: rgba(255, 255, 255, 0.3);
}

.total-points {
  text-align: right;
  min-width: 80px;
}

.points-value {
  font-size: 24px;
  font-weight: bold;
  color: #4ecdc4;
}

.points-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  margin-left: 4px;
}

.join-section {
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  justify-content: center;
}

.join-btn {
  padding: 14px 60px;
  font-size: 16px;
  font-weight: bold;
  background: linear-gradient(135deg, #4ecdc4, #45b7d1);
  border: none;
  border-radius: 10px;
  color: #fff;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 4px 15px rgba(78, 205, 196, 0.4);
}

.join-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(78, 205, 196, 0.6);
}

.joined-notice {
  margin-top: 20px;
  padding: 16px;
  text-align: center;
  background: rgba(78, 205, 196, 0.1);
  border: 1px solid rgba(78, 205, 196, 0.3);
  border-radius: 10px;
  color: #4ecdc4;
  font-size: 14px;
}

.joined-notice .check {
  margin-right: 8px;
  font-weight: bold;
}

.bottom-action {
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  justify-content: center;
}

.enter-race-btn, .prepare-btn {
  padding: 16px 80px;
  font-size: 18px;
  font-weight: bold;
  background: linear-gradient(135deg, #f093fb, #f5576c);
  border: none;
  border-radius: 12px;
  color: #fff;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 4px 20px rgba(245, 87, 108, 0.4);
  display: flex;
  align-items: center;
  gap: 12px;
}

.enter-race-btn:hover, .prepare-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 30px rgba(245, 87, 108, 0.6);
}

.spectate-btn {
  padding: 16px 80px;
  font-size: 18px;
  font-weight: bold;
  background: linear-gradient(135deg, #667eea, #764ba2);
  border: none;
  border-radius: 12px;
  color: #fff;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 4px 20px rgba(102, 126, 234, 0.4);
  display: flex;
  align-items: center;
  gap: 12px;
}

.spectate-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 30px rgba(102, 126, 234, 0.6);
}

.prepare-btn {
  background: linear-gradient(135deg, #4ecdc4, #45b7d1);
  box-shadow: 0 4px 20px rgba(78, 205, 196, 0.4);
}

.prepare-btn:hover {
  box-shadow: 0 6px 30px rgba(78, 205, 196, 0.6);
}

.btn-icon {
  font-size: 24px;
}

.final-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}

.final-modal {
  background: linear-gradient(135deg, #1a1a3e 0%, #2a1a4e 100%);
  padding: 40px;
  border-radius: 20px;
  border: 2px solid rgba(240, 147, 251, 0.5);
  width: 600px;
  max-width: 90%;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 0 60px rgba(240, 147, 251, 0.3);
}

.final-header {
  text-align: center;
  margin-bottom: 30px;
}

.trophy {
  font-size: 60px;
  display: block;
  margin-bottom: 10px;
}

.final-header h2 {
  margin: 0 0 8px 0;
  font-size: 28px;
  background: linear-gradient(90deg, #f093fb, #f5576c);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.tournament-name {
  font-size: 16px;
  color: rgba(255, 255, 255, 0.6);
}

.final-standings {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 30px;
}

.final-standing-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.final-standing-item.rank-1 {
  background: linear-gradient(135deg, rgba(255, 215, 0, 0.2), rgba(255, 215, 0, 0.05));
  border-color: rgba(255, 215, 0, 0.5);
}

.final-standing-item.rank-2 {
  background: linear-gradient(135deg, rgba(192, 192, 192, 0.2), rgba(192, 192, 192, 0.05));
  border-color: rgba(192, 192, 192, 0.5);
}

.final-standing-item.rank-3 {
  background: linear-gradient(135deg, rgba(205, 127, 50, 0.2), rgba(205, 127, 50, 0.05));
  border-color: rgba(205, 127, 50, 0.5);
}

.final-rank {
  width: 50px;
  text-align: center;
}

.medal-large {
  font-size: 32px;
}

.rank-number-large {
  font-size: 24px;
  font-weight: bold;
  color: rgba(255, 255, 255, 0.6);
}

.player-color-large {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  flex-shrink: 0;
  border: 2px solid rgba(255, 255, 255, 0.3);
}

.final-player-info {
  flex: 1;
}

.final-player-name {
  font-size: 18px;
  font-weight: bold;
  margin-bottom: 4px;
}

.final-player-stats {
  display: flex;
  gap: 20px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
}

.final-player-stats strong {
  color: #4ecdc4;
}

.final-points {
  text-align: right;
  min-width: 100px;
}

.final-points-value {
  font-size: 32px;
  font-weight: bold;
  color: #4ecdc4;
}

.final-points-label {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.5);
  margin-left: 4px;
}

.close-final-btn {
  width: 100%;
  padding: 14px;
  font-size: 16px;
  font-weight: bold;
  background: linear-gradient(135deg, #f093fb, #f5576c);
  border: none;
  border-radius: 10px;
  color: #fff;
  cursor: pointer;
  transition: all 0.3s;
}

.close-final-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 20px rgba(245, 87, 108, 0.5);
}
</style>
