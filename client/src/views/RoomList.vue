<template>
  <div class="room-list">
    <div class="header">
      <button class="back-btn" @click="goBack">← 返回</button>
      <h2>房间列表</h2>
      <button class="refresh-btn" @click="loadRooms">🔄</button>
    </div>

    <div class="rooms-container">
      <div v-if="loading" class="loading">加载中...</div>
      
      <div v-else-if="rooms.length === 0" class="empty">
        <p>暂无房间</p>
        <p class="hint">创建一个新房间开始游戏吧！</p>
      </div>

      <div v-else class="rooms">
        <div 
          v-for="room in rooms" 
          :key="room.id" 
          class="room-card"
          @click="joinRoom(room.id)"
        >
          <div class="room-header">
            <h3>{{ room.name }}</h3>
            <span class="player-count">{{ room.players?.length || 0 }} / {{ room.maxPlayers }}</span>
          </div>
          <div class="room-info">
            <span>赛道: {{ getTrackName(room.trackId) }}</span>
            <span>圈数: {{ room.totalLaps }} 圈</span>
          </div>
        </div>
      </div>
    </div>

    <div class="create-section">
      <button class="create-btn" @click="showCreateModal = true">+ 创建房间</button>
    </div>

    <div v-if="showCreateModal" class="modal-overlay" @click.self="showCreateModal = false">
      <div class="modal">
        <h3>创建房间</h3>
        
        <div class="form-group">
          <label>房间名称</label>
          <input v-model="newRoom.name" type="text" placeholder="输入房间名" maxlength="20" />
        </div>

        <div class="form-group">
          <label>选择赛道</label>
          <select v-model="newRoom.trackId">
            <option v-for="track in tracks" :key="track.id" :value="track.id">
              {{ track.name }} ({{ track.isBuiltIn ? '内置' : '玩家创作' }})
            </option>
          </select>
        </div>

        <div class="form-group">
          <label>总圈数</label>
          <div class="lap-options">
            <button 
              v-for="laps in [3, 5, 10]" 
              :key="laps"
              :class="['lap-btn', { active: newRoom.totalLaps === laps }]"
              @click="newRoom.totalLaps = laps"
            >
              {{ laps }} 圈
            </button>
          </div>
        </div>

        <div class="form-group">
          <label>最大玩家数: {{ newRoom.maxPlayers }}</label>
          <input 
            v-model.number="newRoom.maxPlayers" 
            type="range" 
            min="2" 
            max="8" 
            step="1"
          />
        </div>

        <div class="modal-actions">
          <button class="cancel-btn" @click="showCreateModal = false">取消</button>
          <button class="confirm-btn" @click="createRoom">创建</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import type { Room, Track } from '../types/game';

const router = useRouter();

const rooms = ref<Room[]>([]);
const tracks = ref<Track[]>([]);
const loading = ref(true);
const showCreateModal = ref(false);
const playerId = ref('');
const playerName = ref('');

const newRoom = ref({
  name: '',
  trackId: 'beginner-circle',
  totalLaps: 3,
  maxPlayers: 8
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

  loadTracks();
  loadRooms();
  
  const interval = setInterval(loadRooms, 5000);
  
  return () => clearInterval(interval);
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

async function loadRooms() {
  try {
    const res = await fetch('/api/rooms');
    const data = await res.json();
    rooms.value = data.rooms || [];
    loading.value = false;
  } catch (e) {
    console.error('Failed to load rooms:', e);
    loading.value = false;
  }
}

function getTrackName(trackId: string): string {
  const track = tracks.value.find(t => t.id === trackId);
  return track?.name || trackId;
}

async function createRoom() {
  try {
    const res = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hostName: playerName.value || '玩家',
        roomName: newRoom.value.name || '新房间',
        trackId: newRoom.value.trackId,
        totalLaps: newRoom.value.totalLaps,
        maxPlayers: newRoom.value.maxPlayers
      })
    });
    
    const data = await res.json();
    if (data.room) {
      await joinRoomWithId(data.room.id);
      showCreateModal.value = false;
    }
  } catch (e) {
    console.error('Failed to create room:', e);
  }
}

async function joinRoom(roomId: string) {
  await joinRoomWithId(roomId);
}

async function joinRoomWithId(roomId: string) {
  try {
    const res = await fetch(`/api/rooms/${roomId}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerId: playerId.value,
        playerName: playerName.value || '玩家'
      })
    });
    
    if (res.ok) {
      router.push(`/room/${roomId}`);
    }
  } catch (e) {
    console.error('Failed to join room:', e);
  }
}

function goBack() {
  router.push('/');
}
</script>

<style scoped>
.room-list {
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

.rooms-container {
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

.rooms {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.room-card {
  padding: 16px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s;
}

.room-card:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: #4ecdc4;
  transform: translateY(-2px);
}

.room-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.room-header h3 {
  margin: 0;
  font-size: 18px;
}

.player-count {
  font-size: 14px;
  color: #4ecdc4;
  font-weight: bold;
}

.room-info {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
}

.create-section {
  margin-top: 20px;
  display: flex;
  justify-content: center;
}

.create-btn {
  padding: 14px 40px;
  font-size: 18px;
  font-weight: bold;
  background: linear-gradient(135deg, #4ecdc4, #45b7d1);
  border: none;
  border-radius: 10px;
  color: #fff;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 4px 15px rgba(78, 205, 196, 0.4);
}

.create-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(78, 205, 196, 0.6);
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
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
  width: 400px;
  max-width: 90%;
}

.modal h3 {
  margin: 0 0 20px 0;
  text-align: center;
  font-size: 22px;
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

.form-group input[type="text"],
.form-group select {
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

.form-group input[type="text"]:focus,
.form-group select:focus {
  border-color: #4ecdc4;
}

.form-group input[type="range"] {
  width: 100%;
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
  background: linear-gradient(135deg, #4ecdc4, #45b7d1);
  color: #fff;
  font-weight: bold;
}

.confirm-btn:hover {
  transform: translateY(-1px);
}
</style>
