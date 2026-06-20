<template>
  <div class="home">
    <div class="stars"></div>
    
    <div class="content">
      <h1 class="title">
        <span class="title-main">SPACE</span>
        <span class="title-sub">RACER</span>
      </h1>
      
      <p class="subtitle">太空竞速 · 多人对战 · 赛道编辑器</p>

      <div class="menu">
        <button class="menu-btn primary" @click="goToRooms">
          <span class="btn-icon">🚀</span>
          <span>快速游戏</span>
        </button>
        
        <button class="menu-btn tournament" @click="goToTournaments">
          <span class="btn-icon">🏁</span>
          <span>锦标赛</span>
        </button>
        
        <button class="menu-btn" @click="goToGhostRace">
          <span class="btn-icon">👻</span>
          <span>幽灵赛</span>
        </button>
        
        <button class="menu-btn" @click="goToEditor">
          <span class="btn-icon">✏️</span>
          <span>赛道编辑器</span>
        </button>
        
        <button class="menu-btn generator" @click="goToTrackGenerator">
          <span class="btn-icon">🎲</span>
          <span>随机赛道</span>
        </button>
        
        <button class="menu-btn" @click="goToLeaderboard">
          <span class="btn-icon">🏆</span>
          <span>排行榜</span>
        </button>
      </div>

      <div class="player-setup">
        <label class="input-label">玩家名称</label>
        <input 
          v-model="playerName" 
          type="text" 
          class="name-input"
          placeholder="输入你的名字"
          maxlength="12"
        />
      </div>

      <div class="ship-customize">
        <h3>飞船配置</h3>
        
        <div class="engine-select">
          <span class="label">引擎类型：</span>
          <div class="engine-options">
            <button 
              v-for="engine in engines" 
              :key="engine.type"
              :class="['engine-btn', { active: selectedEngine === engine.type }]"
              @click="selectedEngine = engine.type"
            >
              <div class="engine-name">{{ engine.name }}</div>
              <div class="engine-desc">{{ engine.desc }}</div>
            </button>
          </div>
        </div>

        <div class="color-select">
          <span class="label">配色：</span>
          <div class="color-options">
            <button 
              v-for="(color, index) in colors" 
              :key="index"
              :class="['color-btn', { active: selectedColor === index }]"
              :style="{ backgroundColor: color }"
              @click="selectedColor = index as any"
            ></button>
          </div>
        </div>
      </div>
    </div>

    <div class="footer">
      <p>使用 WASD 控制飞船 · 空格键使用道具</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { SHIP_COLORS, type EngineType } from '../types/game';

const router = useRouter();

const playerName = ref('玩家');
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
});

function saveSettings() {
  localStorage.setItem('playerName', playerName.value);
  localStorage.setItem('engineType', selectedEngine.value);
  localStorage.setItem('colorIndex', selectedColor.value.toString());
}

function goToRooms() {
  saveSettings();
  router.push('/rooms');
}

function goToEditor() {
  saveSettings();
  router.push('/editor');
}

function goToLeaderboard() {
  saveSettings();
  router.push('/leaderboard');
}

function goToGhostRace() {
  saveSettings();
  router.push('/ghost-race');
}

function goToTournaments() {
  saveSettings();
  router.push('/tournaments');
}

function goToTrackGenerator() {
  saveSettings();
  router.push('/track-generator');
}
</script>

<style scoped>
.home {
  width: 100%;
  height: 100%;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #0a0a2e 0%, #1a1a3e 50%, #0a0a1a 100%);
  overflow: hidden;
}

.stars {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-image: 
    radial-gradient(2px 2px at 20px 30px, white, transparent),
    radial-gradient(2px 2px at 40px 70px, rgba(255,255,255,0.8), transparent),
    radial-gradient(1px 1px at 90px 40px, white, transparent),
    radial-gradient(2px 2px at 160px 120px, rgba(255,255,255,0.9), transparent),
    radial-gradient(1px 1px at 230px 80px, white, transparent),
    radial-gradient(2px 2px at 300px 150px, rgba(255,255,255,0.7), transparent),
    radial-gradient(1px 1px at 350px 60px, white, transparent),
    radial-gradient(2px 2px at 420px 200px, rgba(255,255,255,0.8), transparent);
  background-size: 500px 250px;
  animation: twinkle 4s ease-in-out infinite;
  opacity: 0.6;
}

@keyframes twinkle {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 0.8; }
}

.content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
}

.title {
  font-size: 64px;
  font-weight: bold;
  text-align: center;
  line-height: 1;
}

.title-main {
  display: block;
  background: linear-gradient(90deg, #4ecdc4, #45b7d1, #a29bfe);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  text-shadow: 0 0 40px rgba(78, 205, 196, 0.5);
}

.title-sub {
  display: block;
  font-size: 48px;
  letter-spacing: 8px;
  color: #ff6b6b;
  text-shadow: 0 0 30px rgba(255, 107, 107, 0.5);
}

.subtitle {
  font-size: 16px;
  color: rgba(255, 255, 255, 0.6);
  letter-spacing: 4px;
  margin-bottom: 16px;
}

.menu {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 280px;
}

.menu-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 16px 24px;
  font-size: 18px;
  font-weight: 500;
  color: #fff;
  background: rgba(255, 255, 255, 0.1);
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.menu-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  border-color: rgba(255, 255, 255, 0.4);
  transform: translateY(-2px);
}

.menu-btn.primary {
  background: linear-gradient(135deg, #4ecdc4, #45b7d1);
  border-color: transparent;
  box-shadow: 0 4px 20px rgba(78, 205, 196, 0.4);
}

.menu-btn.primary:hover {
  box-shadow: 0 6px 30px rgba(78, 205, 196, 0.6);
  transform: translateY(-2px);
}

.menu-btn.tournament {
  background: linear-gradient(135deg, #f093fb, #f5576c);
  border-color: transparent;
  box-shadow: 0 4px 20px rgba(245, 87, 108, 0.4);
}

.menu-btn.tournament:hover {
  box-shadow: 0 6px 30px rgba(245, 87, 108, 0.6);
  transform: translateY(-2px);
}

.menu-btn.generator {
  background: linear-gradient(135deg, #ffd93d, #ff9500);
  border-color: transparent;
  box-shadow: 0 4px 20px rgba(255, 149, 0, 0.4);
}

.menu-btn.generator:hover {
  box-shadow: 0 6px 30px rgba(255, 149, 0, 0.6);
  transform: translateY(-2px);
}

.btn-icon {
  font-size: 24px;
}

.player-setup {
  margin-top: 16px;
  text-align: center;
}

.input-label {
  display: block;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 8px;
}

.name-input {
  width: 220px;
  padding: 12px 16px;
  font-size: 16px;
  color: #fff;
  background: rgba(255, 255, 255, 0.1);
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  outline: none;
  text-align: center;
  transition: all 0.3s;
}

.name-input:focus {
  border-color: #4ecdc4;
  box-shadow: 0 0 10px rgba(78, 205, 196, 0.3);
}

.ship-customize {
  margin-top: 16px;
  padding: 20px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.ship-customize h3 {
  font-size: 16px;
  margin-bottom: 16px;
  text-align: center;
  color: #4ecdc4;
}

.engine-select {
  margin-bottom: 16px;
}

.label {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: 8px;
  display: block;
}

.engine-options {
  display: flex;
  gap: 8px;
}

.engine-btn {
  flex: 1;
  padding: 10px 8px;
  background: rgba(255, 255, 255, 0.05);
  border: 2px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s;
  color: #fff;
}

.engine-btn:hover {
  border-color: rgba(255, 255, 255, 0.3);
}

.engine-btn.active {
  border-color: #4ecdc4;
  background: rgba(78, 205, 196, 0.2);
}

.engine-name {
  font-size: 13px;
  font-weight: bold;
  margin-bottom: 4px;
}

.engine-desc {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.5);
}

.color-select {
  display: flex;
  align-items: center;
  gap: 12px;
}

.color-options {
  display: flex;
  gap: 8px;
}

.color-btn {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 3px solid transparent;
  cursor: pointer;
  transition: all 0.3s;
}

.color-btn:hover {
  transform: scale(1.1);
}

.color-btn.active {
  border-color: #fff;
  box-shadow: 0 0 10px rgba(255, 255, 255, 0.5);
}

.footer {
  position: absolute;
  bottom: 20px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
}
</style>
