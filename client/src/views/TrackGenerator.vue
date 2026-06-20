<template>
  <div class="track-generator-page">
    <div class="stars"></div>

    <div class="toolbar">
      <button class="back-btn" @click="goBack">← 返回</button>
      <h2>赛道生成器</h2>
      <div class="toolbar-actions">
        <button class="action-btn" @click="randomizeSeed">🎲 随机种子</button>
      </div>
    </div>

    <div class="generator-content">
      <div class="params-panel">
        <div class="param-section">
          <h3>难度等级</h3>
          <div class="param-row">
            <input 
              v-model.number="difficulty" 
              type="range" 
              min="1" 
              max="5" 
              step="1"
              class="slider"
            />
            <span class="param-value">{{ difficulty }}</span>
          </div>
          <p class="param-desc">{{ difficultyDescription }}</p>
        </div>

        <div class="param-section">
          <h3>赛道长度</h3>
          <div class="param-row">
            <input 
              v-model.number="lengthFactor" 
              type="range" 
              min="0.5" 
              max="2.0" 
              step="0.1"
              class="slider"
            />
            <span class="param-value">{{ lengthFactor.toFixed(1) }}x</span>
          </div>
          <p class="param-desc">基准周长 3000 像素</p>
        </div>

        <div class="param-section">
          <h3>赛道宽度</h3>
          <div class="param-row">
            <input 
              v-model.number="trackWidth" 
              type="range" 
              min="80" 
              max="200" 
              step="10"
              class="slider"
            />
            <span class="param-value">{{ trackWidth }}px</span>
          </div>
          <p class="param-desc">内外边界之间的距离</p>
        </div>

        <div class="param-section">
          <h3>随机种子</h3>
          <div class="param-row">
            <input 
              v-model.number="seed" 
              type="number" 
              class="seed-input"
              placeholder="输入种子"
            />
          </div>
          <p class="param-desc">相同种子生成相同赛道</p>
        </div>

        <div class="param-section stats" v-if="currentTrack">
          <h3>赛道信息</h3>
          <div class="info-item">
            <span>名称:</span>
            <span class="info-value">{{ currentTrack.name }}</span>
          </div>
          <div class="info-item">
            <span>检查点:</span>
            <span class="info-value">{{ currentTrack.checkpoints.length }}</span>
          </div>
          <div class="info-item">
            <span>道具点:</span>
            <span class="info-value">{{ currentTrack.itemSpawners.length }}</span>
          </div>
          <div class="info-item">
            <span>障碍物:</span>
            <span class="info-value">{{ asteroidCount }}</span>
          </div>
        </div>
      </div>

      <div class="preview-container">
        <canvas 
          ref="previewCanvas" 
          class="preview-canvas"
        ></canvas>
        <div v-if="isGenerating" class="loading-overlay">
          <div class="loading-spinner"></div>
          <p>生成中...</p>
        </div>
        <div v-if="error" class="error-overlay">
          <p class="error-text">{{ error }}</p>
        </div>
      </div>
    </div>

    <div class="action-bar">
      <button class="generate-btn" @click="generateTrack" :disabled="isGenerating">
        <span>✨</span>
        <span>生成赛道</span>
      </button>
      <button 
        class="save-btn" 
        @click="saveAndUse" 
        :disabled="!currentTrack || isGenerating"
      >
        <span>🚀</span>
        <span>保存并使用</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import type { Track } from '../types/game';
import { drawBezierPath, drawBezierStroke } from '../utils/bezier';

const router = useRouter();

const previewCanvas = ref<HTMLCanvasElement | null>(null);
let ctx: CanvasRenderingContext2D | null = null;

const difficulty = ref(3);
const lengthFactor = ref(1.0);
const trackWidth = ref(120);
const seed = ref(Math.floor(Math.random() * 1000000));

const currentTrack = ref<Track | null>(null);
const isGenerating = ref(false);
const error = ref('');

const difficultyDescription = computed(() => {
  const descs = [
    '最简单 - 大弯道，无障碍物',
    '简单 - 较平缓的弯道',
    '中等 - 适中的弯道和障碍',
    '困难 - 急弯较多，有障碍',
    '专家级 - 极限弯道，密集障碍'
  ];
  return descs[difficulty.value - 1] || '';
});

const asteroidCount = computed(() => {
  if (!currentTrack.value) return 0;
  return currentTrack.value.envElements.filter(e => e.type === 'asteroid').length;
});

function randomizeSeed() {
  seed.value = Math.floor(Math.random() * 1000000);
}

function goBack() {
  router.push('/');
}

async function generateTrack() {
  if (isGenerating.value) return;

  isGenerating.value = true;
  error.value = '';

  try {
    const res = await fetch('/api/tracks/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        difficulty: difficulty.value,
        lengthFactor: lengthFactor.value,
        trackWidth: trackWidth.value,
        seed: seed.value
      })
    });

    const data = await res.json();

    if (res.ok && data.track) {
      currentTrack.value = data.track;
      render();
    } else {
      error.value = data.error || '生成失败';
    }
  } catch (e) {
    error.value = '网络错误，请重试';
    console.error('Generate track error:', e);
  } finally {
    isGenerating.value = false;
  }
}

async function saveAndUse() {
  if (!currentTrack.value) return;

  const playerName = localStorage.getItem('playerName') || '玩家';
  const roomName = `${currentTrack.value.name} - 房间`;

  try {
    const res = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hostName: playerName,
        roomName,
        trackId: currentTrack.value.id,
        totalLaps: 3,
        maxPlayers: 8
      })
    });

    const data = await res.json();

    if (res.ok && data.room) {
      localStorage.setItem('playerName', playerName);
      router.push(`/room/${data.room.id}`);
    } else {
      error.value = data.error || '创建房间失败';
    }
  } catch (e) {
    error.value = '创建房间失败';
    console.error('Create room error:', e);
  }
}

function render() {
  if (!ctx || !previewCanvas.value || !currentTrack.value) return;

  const canvas = previewCanvas.value;
  const track = currentTrack.value;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const gradient = ctx.createRadialGradient(
    canvas.width / 2, canvas.height / 2, 0,
    canvas.width / 2, canvas.height / 2, canvas.width
  );
  gradient.addColorStop(0, '#0a0a2e');
  gradient.addColorStop(1, '#020210');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawStars();

  const scale = Math.min(
    canvas.width / 1600,
    canvas.height / 1200
  ) * 0.9;
  const offsetX = canvas.width / 2;
  const offsetY = canvas.height / 2;

  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);
  ctx.translate(-800, -600);

  drawBezierPath(ctx, track.outerBoundary.controlPoints);
  ctx.fillStyle = 'rgba(20, 30, 60, 0.8)';
  ctx.fill();

  drawBezierPath(ctx, track.innerBoundary.controlPoints);
  ctx.fillStyle = '#020210';
  ctx.fill();

  drawBezierStroke(ctx, track.outerBoundary.controlPoints);
  ctx.strokeStyle = '#4ecdc4';
  ctx.lineWidth = 3;
  ctx.shadowColor = '#4ecdc4';
  ctx.shadowBlur = 10;
  ctx.stroke();
  ctx.shadowBlur = 0;

  drawBezierStroke(ctx, track.innerBoundary.controlPoints);
  ctx.strokeStyle = '#ff6b6b';
  ctx.lineWidth = 3;
  ctx.shadowColor = '#ff6b6b';
  ctx.shadowBlur = 10;
  ctx.stroke();
  ctx.shadowBlur = 0;

  for (const elem of track.envElements) {
    if (elem.type === 'asteroid') {
      drawAsteroid(elem.position.x, elem.position.y, elem.radius);
    }
  }

  for (let i = 0; i < track.checkpoints.length; i++) {
    const cp = track.checkpoints[i];
    drawCheckpoint(cp.position.x, cp.position.y, cp.direction, i === 0);
  }

  for (const spawner of track.itemSpawners) {
    drawItemSpawner(spawner.position.x, spawner.position.y);
  }

  ctx.restore();
}

function drawStars() {
  if (!ctx || !previewCanvas.value) return;

  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  
  const starCount = 80;
  const seedVal = 54321;
  
  for (let i = 0; i < starCount; i++) {
    const x = ((seedVal * (i + 1) * 9301 + 49297) % 233280) / 233280 * previewCanvas.value.width;
    const y = ((seedVal * (i + 1) * 49297 + 9301) % 233280) / 233280 * previewCanvas.value.height;
    const size = ((seedVal * (i + 1) * 1234) % 100) / 100 * 1.5 + 0.5;
    const alpha = ((seedVal * (i + 1) * 5678) % 100) / 100 * 0.4 + 0.2;
    
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }
  
  ctx.globalAlpha = 1;
}

function drawAsteroid(x: number, y: number, r: number) {
  if (!ctx) return;

  const gradient = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
  gradient.addColorStop(0, '#8b7355');
  gradient.addColorStop(0.5, '#6b5344');
  gradient.addColorStop(1, '#4a3728');

  ctx.fillStyle = gradient;
  ctx.beginPath();
  
  const segments = 8;
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const variance = 0.7 + ((i * 37) % 100) / 300;
    const px = x + Math.cos(angle) * r * variance;
    const py = y + Math.sin(angle) * r * variance;
    if (i === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#3a2718';
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawCheckpoint(x: number, y: number, direction: number, isStart: boolean) {
  if (!ctx) return;

  const dirX = Math.cos(direction);
  const dirY = Math.sin(direction);
  const perpX = -dirY;
  const perpY = dirX;

  ctx.strokeStyle = isStart ? '#f9ca24' : 'rgba(249, 202, 36, 0.6)';
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.moveTo(x - perpX * 50, y - perpY * 50);
  ctx.lineTo(x + perpX * 50, y + perpY * 50);
  ctx.stroke();
  ctx.setLineDash([]);

  if (isStart) {
    ctx.fillStyle = '#f9ca24';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('START', x, y - 30);
  }

  ctx.fillStyle = '#f9ca24';
  ctx.beginPath();
  ctx.moveTo(x + dirX * 12, y + dirY * 12);
  ctx.lineTo(x - perpX * 6, y - perpY * 6);
  ctx.lineTo(x + perpX * 6, y + perpY * 6);
  ctx.closePath();
  ctx.fill();
}

function drawItemSpawner(x: number, y: number) {
  if (!ctx) return;

  ctx.strokeStyle = 'rgba(46, 213, 115, 0.5)';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.arc(x, y, 12, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = 'rgba(46, 213, 115, 0.7)';
  ctx.font = '12px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('📦', x, y);
}

function resizeCanvas() {
  if (!previewCanvas.value) return;

  const container = previewCanvas.value.parentElement;
  if (container) {
    previewCanvas.value.width = container.clientWidth;
    previewCanvas.value.height = container.clientHeight;
  }

  render();
}

onMounted(() => {
  if (!previewCanvas.value) return;
  
  const c = previewCanvas.value.getContext('2d');
  if (c) ctx = c;

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  generateTrack();
});
</script>

<style scoped>
.track-generator-page {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #0a0a1a;
  color: #fff;
  position: relative;
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
    radial-gradient(1px 1px at 230px 80px, white, transparent);
  background-size: 500px 250px;
  animation: twinkle 4s ease-in-out infinite;
  opacity: 0.4;
  pointer-events: none;
}

@keyframes twinkle {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 0.6; }
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: rgba(26, 26, 62, 0.9);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  z-index: 10;
}

.toolbar h2 {
  margin: 0;
  font-size: 20px;
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

.toolbar-actions {
  display: flex;
  gap: 10px;
}

.action-btn {
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  color: #fff;
  cursor: pointer;
  font-size: 14px;
}

.action-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.generator-content {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.params-panel {
  width: 280px;
  padding: 20px;
  background: rgba(26, 26, 62, 0.8);
  border-right: 1px solid rgba(255, 255, 255, 0.1);
  overflow-y: auto;
  z-index: 5;
}

.param-section {
  margin-bottom: 24px;
}

.param-section h3 {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: #4ecdc4;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.param-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.slider {
  flex: 1;
  height: 6px;
  -webkit-appearance: none;
  appearance: none;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
  outline: none;
}

.slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 18px;
  height: 18px;
  background: #4ecdc4;
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 0 10px rgba(78, 205, 196, 0.5);
}

.slider::-moz-range-thumb {
  width: 18px;
  height: 18px;
  background: #4ecdc4;
  border-radius: 50%;
  cursor: pointer;
  border: none;
  box-shadow: 0 0 10px rgba(78, 205, 196, 0.5);
}

.param-value {
  min-width: 50px;
  text-align: right;
  font-family: monospace;
  font-size: 14px;
  color: #f9ca24;
  font-weight: bold;
}

.param-desc {
  margin: 8px 0 0 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}

.seed-input {
  flex: 1;
  min-width: 140px;
  padding: 8px 12px;
  font-size: 14px;
  color: #fff;
  background: rgba(255, 255, 255, 0.05);
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  outline: none;
  font-family: monospace;
  letter-spacing: 1px;
}

.seed-input:focus {
  border-color: #4ecdc4;
  box-shadow: 0 0 10px rgba(78, 205, 196, 0.3);
}

.stats {
  background: rgba(78, 205, 196, 0.05);
  padding: 16px;
  border-radius: 8px;
  border: 1px solid rgba(78, 205, 196, 0.2);
}

.info-item {
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
  font-size: 13px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.info-item:last-child {
  border-bottom: none;
}

.info-value {
  color: #4ecdc4;
  font-weight: bold;
}

.preview-container {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.preview-canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
}

.loading-spinner {
  width: 50px;
  height: 50px;
  border: 3px solid rgba(78, 205, 196, 0.3);
  border-top-color: #4ecdc4;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-overlay p {
  margin: 0;
  color: #4ecdc4;
  font-size: 16px;
}

.error-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
}

.error-text {
  color: #ff6b6b;
  font-size: 16px;
  text-align: center;
}

.action-bar {
  display: flex;
  justify-content: center;
  gap: 20px;
  padding: 20px;
  background: rgba(26, 26, 62, 0.9);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  z-index: 10;
}

.generate-btn, .save-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 32px;
  font-size: 16px;
  font-weight: bold;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.generate-btn {
  background: linear-gradient(135deg, #4ecdc4, #45b7d1);
  color: #fff;
  box-shadow: 0 4px 20px rgba(78, 205, 196, 0.4);
}

.generate-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 30px rgba(78, 205, 196, 0.6);
}

.generate-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  background: linear-gradient(135deg, #555, #666);
  box-shadow: none;
  transform: none;
}

.generate-btn:disabled:hover {
  transform: none;
  box-shadow: none;
}

.save-btn {
  background: linear-gradient(135deg, #f093fb, #f5576c);
  color: #fff;
  box-shadow: 0 4px 20px rgba(245, 87, 108, 0.4);
}

.save-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 30px rgba(245, 87, 108, 0.6);
}

.save-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  background: linear-gradient(135deg, #555, #666);
  box-shadow: none;
  transform: none;
}

.save-btn:disabled:hover {
  transform: none;
  box-shadow: none;
}

.generate-btn span:first-child,
.save-btn span:first-child {
  font-size: 20px;
}
</style>
