<template>
  <div class="editor-page">
    <div class="toolbar">
      <button class="back-btn" @click="goBack">← 返回</button>
      <h2>赛道编辑器</h2>
      <div class="toolbar-actions">
        <button class="action-btn" @click="resetTrack">重置</button>
        <button class="action-btn primary" @click="saveTrack">保存发布</button>
      </div>
    </div>

    <div class="editor-content">
      <div class="tools-panel">
        <div class="tool-section">
          <h3>绘制模式</h3>
          <div class="tool-buttons">
            <button 
              :class="['tool-btn', { active: drawMode === 'outer' }]"
              @click="setDrawMode('outer')"
            >
              外边界
            </button>
            <button 
              :class="['tool-btn', { active: drawMode === 'inner' }]"
              @click="setDrawMode('inner')"
            >
              内边界
            </button>
          </div>
        </div>

        <div class="tool-section">
          <h3>放置工具</h3>
          <div class="tool-buttons vertical">
            <button 
              :class="['tool-btn', { active: placeMode === 'checkpoint' }]"
              @click="setPlaceMode('checkpoint')"
            >
              🚩 检查点
            </button>
            <button 
              :class="['tool-btn', { active: placeMode === 'item' }]"
              @click="setPlaceMode('item')"
            >
              📦 道具刷新点
            </button>
            <button 
              :class="['tool-btn', { active: placeMode === 'asteroid' }]"
              @click="setPlaceMode('asteroid')"
            >
              🪨 小行星
            </button>
            <button 
              :class="['tool-btn', { active: placeMode === 'gravityWell' }]"
              @click="setPlaceMode('gravityWell')"
            >
              🌀 引力井
            </button>
            <button 
              :class="['tool-btn', { active: placeMode === 'speedBoost' }]"
              @click="setPlaceMode('speedBoost')"
            >
              ⚡ 加速带
            </button>
            <button 
              :class="['tool-btn', { active: placeMode === 'slowdown' }]"
              @click="setPlaceMode('slowdown')"
            >
              🛑 减速区
            </button>
          </div>
        </div>

        <div class="tool-section">
          <h3>操作提示</h3>
          <ul class="tips">
            <li>点击画布添加控制点</li>
            <li>拖拽控制点调整位置</li>
            <li>双击控制点删除</li>
            <li>至少需要8个控制点</li>
            <li>曲线会自动闭合</li>
          </ul>
        </div>

        <div class="tool-section">
          <h3>赛道信息</h3>
          <div class="info-item">
            <span>外边界控制点:</span>
            <span>{{ outerControlPoints.length }}</span>
          </div>
          <div class="info-item">
            <span>内边界控制点:</span>
            <span>{{ innerControlPoints.length }}</span>
          </div>
          <div class="info-item">
            <span>检查点:</span>
            <span>{{ checkpoints.length }}</span>
          </div>
        </div>
      </div>

      <div class="canvas-container">
        <canvas 
          ref="editorCanvas" 
          class="editor-canvas"
          @mousedown="handleMouseDown"
          @mousemove="handleMouseMove"
          @mouseup="handleMouseUp"
          @dblclick="handleDoubleClick"
        ></canvas>
      </div>

      <div class="properties-panel">
        <div class="tool-section">
          <h3>赛道设置</h3>
          <div class="form-group">
            <label>赛道名称</label>
            <input v-model="trackName" type="text" placeholder="输入赛道名称" />
          </div>
          <div class="form-group">
            <label>作者</label>
            <input v-model="authorName" type="text" placeholder="你的名字" />
          </div>
        </div>

        <div v-if="selectedElement" class="tool-section">
          <h3>选中元素</h3>
          <div class="form-group">
            <label>类型: {{ selectedElement.type }}</label>
          </div>
          <div v-if="selectedElement.type === 'asteroid'" class="form-group">
            <label>半径: {{ selectedElement.radius }}</label>
            <input 
              v-model.number="selectedElement.radius" 
              type="range" 
              min="10" 
              max="50" 
              step="1"
            />
          </div>
          <div v-if="selectedElement.type === 'gravityWell'" class="form-group">
            <label>半径: {{ selectedElement.radius }}</label>
            <input 
              v-model.number="selectedElement.radius" 
              type="range" 
              min="50" 
              max="200" 
              step="10"
            />
          </div>
          <div v-if="selectedElement.type === 'speedBoost' || selectedElement.type === 'slowdown'" class="form-group">
            <label>半径: {{ selectedElement.radius }}</label>
            <input 
              v-model.number="selectedElement.radius" 
              type="range" 
              min="20" 
              max="80" 
              step="5"
            />
          </div>
          <button class="delete-btn" @click="deleteSelected">删除选中</button>
        </div>
      </div>
    </div>

    <div v-if="showSaveModal" class="modal-overlay" @click.self="showSaveModal = false">
      <div class="modal">
        <h3>保存赛道</h3>
        <p v-if="saveStatus === 'saving'">保存中...</p>
        <p v-else-if="saveStatus === 'success'" class="success">保存成功！</p>
        <p v-else-if="saveStatus === 'error'" class="error">保存失败，请重试</p>
        <p v-else>确定要发布这条赛道吗？</p>
        <div class="modal-actions">
          <button v-if="saveStatus !== 'saving'" class="cancel-btn" @click="showSaveModal = false">取消</button>
          <button 
            v-if="saveStatus === 'idle'" 
            class="confirm-btn" 
            @click="doSaveTrack"
          >
            确认发布
          </button>
          <button 
            v-if="saveStatus === 'success'" 
            class="confirm-btn" 
            @click="goToTracks"
          >
            查看赛道
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, reactive } from 'vue';
import { useRouter } from 'vue-router';
import type { Vector2, EnvElement, Checkpoint, ItemSpawner } from '../types/game';
import { sampleBezier, drawBezierStroke } from '../utils/bezier';

function generateId(): string {
  return 'id_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
}

const router = useRouter();

const editorCanvas = ref<HTMLCanvasElement | null>(null);
let ctx: CanvasRenderingContext2D | null = null;

const drawMode = ref<'outer' | 'inner'>('outer');
const placeMode = ref<string | null>(null);

const outerControlPoints = ref<Vector2[]>([]);
const innerControlPoints = ref<Vector2[]>([]);
const checkpoints = ref<Checkpoint[]>([]);
const itemSpawners = ref<ItemSpawner[]>([]);
const envElements = ref<EnvElement[]>([]);

const trackName = ref('我的赛道');
const authorName = ref('');

const selectedPoint = ref<{ type: 'outer' | 'inner'; index: number } | null>(null);
const selectedElement = ref<{
  type: string;
  id: string;
  radius: number;
} | null>(null);

const isDragging = ref(false);
const dragStart = ref({ x: 0, y: 0 });

const showSaveModal = ref(false);
const saveStatus = ref<'idle' | 'saving' | 'success' | 'error'>('idle');

onMounted(() => {
  if (!editorCanvas.value) return;
  
  const canvas = editorCanvas.value;
  const container = canvas.parentElement;
  if (container) {
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
  }
  
  const c = canvas.getContext('2d');
  if (c) ctx = c;

  const savedName = localStorage.getItem('playerName');
  if (savedName) authorName.value = savedName;

  initDefaultTrack();
  render();
});

onUnmounted(() => {
});

function initDefaultTrack() {
  const cx = 600;
  const cy = 400;
  const outerR = 300;
  const innerR = 200;

  const segments = 8;
  const controlOffsetOuter = outerR * 0.55;
  const controlOffsetInner = innerR * 0.55;

  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2 - Math.PI / 2;
    const nextAngle = ((i + 1) / segments) * Math.PI * 2 - Math.PI / 2;

    const startPoint = {
      x: cx + Math.cos(angle) * outerR,
      y: cy + Math.sin(angle) * outerR
    };
    const endPoint = {
      x: cx + Math.cos(nextAngle) * outerR,
      y: cy + Math.sin(nextAngle) * outerR
    };

    const startTangent = {
      x: -Math.sin(angle) * controlOffsetOuter,
      y: Math.cos(angle) * controlOffsetOuter
    };
    const endTangent = {
      x: -Math.sin(nextAngle) * controlOffsetOuter,
      y: Math.cos(nextAngle) * controlOffsetOuter
    };

    if (i === 0) {
      outerControlPoints.value.push(startPoint);
    }
    outerControlPoints.value.push({
      x: startPoint.x + startTangent.x,
      y: startPoint.y + startTangent.y
    });
    outerControlPoints.value.push({
      x: endPoint.x - endTangent.x,
      y: endPoint.y - endTangent.y
    });
    if (i === segments - 1) {
      outerControlPoints.value.push(endPoint);
    }
  }

  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2 - Math.PI / 2;
    const nextAngle = ((i + 1) / segments) * Math.PI * 2 - Math.PI / 2;

    const startPoint = {
      x: cx + Math.cos(angle) * innerR,
      y: cy + Math.sin(angle) * innerR
    };
    const endPoint = {
      x: cx + Math.cos(nextAngle) * innerR,
      y: cy + Math.sin(nextAngle) * innerR
    };

    const startTangent = {
      x: -Math.sin(angle) * controlOffsetInner,
      y: Math.cos(angle) * controlOffsetInner
    };
    const endTangent = {
      x: -Math.sin(nextAngle) * controlOffsetInner,
      y: Math.cos(nextAngle) * controlOffsetInner
    };

    if (i === 0) {
      innerControlPoints.value.push(startPoint);
    }
    innerControlPoints.value.push({
      x: startPoint.x + startTangent.x,
      y: startPoint.y + startTangent.y
    });
    innerControlPoints.value.push({
      x: endPoint.x - endTangent.x,
      y: endPoint.y - endTangent.y
    });
    if (i === segments - 1) {
      innerControlPoints.value.push(endPoint);
    }
  }

  checkpoints.value = [
    { id: generateId(), position: { x: cx, y: cy - 250 }, direction: Math.PI / 2, index: 0 },
    { id: generateId(), position: { x: cx + 250, y: cy }, direction: Math.PI, index: 1 },
    { id: generateId(), position: { x: cx, y: cy + 250 }, direction: -Math.PI / 2, index: 2 },
    { id: generateId(), position: { x: cx - 250, y: cy }, direction: 0, index: 3 }
  ];
}

function setDrawMode(mode: 'outer' | 'inner') {
  drawMode.value = mode;
  placeMode.value = null;
  selectedPoint.value = null;
  selectedElement.value = null;
}

function setPlaceMode(mode: string | null) {
  placeMode.value = mode;
  selectedPoint.value = null;
}

function getCanvasCoords(e: MouseEvent): { x: number; y: number } {
  const canvas = editorCanvas.value;
  if (!canvas) return { x: 0, y: 0 };
  
  const rect = canvas.getBoundingClientRect();
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top
  };
}

function findNearestPoint(x: number, y: number): { type: 'outer' | 'inner'; index: number } | null {
  const threshold = 10;
  let nearest: { type: 'outer' | 'inner'; index: number } | null = null;
  let minDist = threshold;

  for (let i = 0; i < outerControlPoints.value.length; i++) {
    const p = outerControlPoints.value[i];
    const dist = Math.sqrt((p.x - x) ** 2 + (p.y - y) ** 2);
    if (dist < minDist) {
      minDist = dist;
      nearest = { type: 'outer', index: i };
    }
  }

  for (let i = 0; i < innerControlPoints.value.length; i++) {
    const p = innerControlPoints.value[i];
    const dist = Math.sqrt((p.x - x) ** 2 + (p.y - y) ** 2);
    if (dist < minDist) {
      minDist = dist;
      nearest = { type: 'inner', index: i };
    }
  }

  return nearest;
}

function findElementAt(x: number, y: number): EnvElement | null {
  for (const elem of envElements.value) {
    const dist = Math.sqrt((elem.position.x - x) ** 2 + (elem.position.y - y) ** 2);
    if (dist < elem.radius + 5) {
      return elem;
    }
  }
  return null;
}

function handleMouseDown(e: MouseEvent) {
  const { x, y } = getCanvasCoords(e);

  if (placeMode.value) {
    placeElement(x, y);
    return;
  }

  const point = findNearestPoint(x, y);
  if (point) {
    selectedPoint.value = point;
    isDragging.value = true;
    dragStart.value = { x, y };
    return;
  }

  const elem = findElementAt(x, y);
  if (elem) {
    selectedElement.value = {
      type: elem.type,
      id: elem.id,
      radius: elem.radius
    };
    isDragging.value = true;
    dragStart.value = { x, y };
    return;
  }

  if (drawMode.value === 'outer') {
    outerControlPoints.value.push({ x, y });
  } else {
    innerControlPoints.value.push({ x, y });
  }

  render();
}

function handleMouseMove(e: MouseEvent) {
  if (!isDragging.value) return;

  const { x, y } = getCanvasCoords(e);

  if (selectedPoint.value) {
    const points = selectedPoint.value.type === 'outer' 
      ? outerControlPoints.value 
      : innerControlPoints.value;
    points[selectedPoint.value.index] = { x, y };
  } else if (selectedElement.value && selectedElement.value.id) {
    const elem = envElements.value.find(e => e.id === selectedElement.value!.id);
    if (elem) {
      elem.position = { x, y };
    }
  }

  render();
}

function handleMouseUp() {
  isDragging.value = false;
}

function handleDoubleClick(e: MouseEvent) {
  const { x, y } = getCanvasCoords(e);
  const point = findNearestPoint(x, y);
  
  if (point) {
    const points = point.type === 'outer' 
      ? outerControlPoints.value 
      : innerControlPoints.value;
    
    if (points.length > 4) {
      points.splice(point.index, 1);
      selectedPoint.value = null;
      render();
    }
  }
}

function placeElement(x: number, y: number) {
  const mode = placeMode.value;
  if (!mode) return;

  if (mode === 'checkpoint') {
    const index = checkpoints.value.length;
    checkpoints.value.push({
      id: generateId(),
      position: { x, y },
      direction: 0,
      index
    });
  } else if (mode === 'item') {
    itemSpawners.value.push({
      id: generateId(),
      position: { x, y },
      lastSpawn: 0,
      currentItem: null,
      cooldown: 15
    });
  } else {
    const radius = mode === 'asteroid' ? 25 : 
                   mode === 'gravityWell' ? 100 : 
                   mode === 'speedBoost' ? 40 : 50;
    
    envElements.value.push({
      id: generateId(),
      type: mode as any,
      position: { x, y },
      radius,
      strength: mode === 'gravityWell' ? 80000 : undefined
    });
  }

  render();
}

function deleteSelected() {
  if (!selectedElement.value || !selectedElement.value.id) return;

  const index = envElements.value.findIndex(e => e.id === selectedElement.value!.id);
  if (index !== -1) {
    envElements.value.splice(index, 1);
    selectedElement.value = null;
  }

  render();
}

function render() {
  if (!ctx || !editorCanvas.value) return;

  const canvas = editorCanvas.value;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#0a0a1a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1;
  const gridSize = 50;
  for (let x = 0; x < canvas.width; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y < canvas.height; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  if (outerControlPoints.value.length >= 4) {
    drawBezierStroke(ctx, outerControlPoints.value);
    ctx.strokeStyle = '#4ecdc4';
    ctx.lineWidth = 3;
    ctx.closePath();
    ctx.stroke();

    const samples = sampleBezier(outerControlPoints.value, 100);
    const innerSamples = sampleBezier(innerControlPoints.value, 100);
    
    ctx.fillStyle = 'rgba(78, 205, 196, 0.1)';
    ctx.beginPath();
    ctx.moveTo(samples[0].point.x, samples[0].point.y);
    for (let i = 1; i < samples.length; i++) {
      ctx.lineTo(samples[i].point.x, samples[i].point.y);
    }
    ctx.closePath();
    ctx.fill();
  }

  if (innerControlPoints.value.length >= 4) {
    drawBezierStroke(ctx, innerControlPoints.value);
    ctx.strokeStyle = '#ff6b6b';
    ctx.lineWidth = 3;
    ctx.closePath();
    ctx.stroke();

    ctx.fillStyle = '#0a0a1a';
    const samples = sampleBezier(innerControlPoints.value, 100);
    ctx.beginPath();
    ctx.moveTo(samples[0].point.x, samples[0].point.y);
    for (let i = 1; i < samples.length; i++) {
      ctx.lineTo(samples[i].point.x, samples[i].point.y);
    }
    ctx.closePath();
    ctx.fill();
  }

  for (let i = 0; i < outerControlPoints.value.length; i++) {
    const p = outerControlPoints.value[i];
    const isSelected = selectedPoint.value?.type === 'outer' && selectedPoint.value.index === i;
    const isEndpoint = i % 3 === 0;

    ctx.fillStyle = isSelected ? '#f9ca24' : (isEndpoint ? '#4ecdc4' : '#4ecdc4aa');
    ctx.beginPath();
    ctx.arc(p.x, p.y, isEndpoint ? 6 : 4, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < innerControlPoints.value.length; i++) {
    const p = innerControlPoints.value[i];
    const isSelected = selectedPoint.value?.type === 'inner' && selectedPoint.value.index === i;
    const isEndpoint = i % 3 === 0;

    ctx.fillStyle = isSelected ? '#f9ca24' : (isEndpoint ? '#ff6b6b' : '#ff6b6baa');
    ctx.beginPath();
    ctx.arc(p.x, p.y, isEndpoint ? 6 : 4, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const cp of checkpoints.value) {
    ctx.strokeStyle = '#f9ca24';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(cp.position.x - 30, cp.position.y - 30);
    ctx.lineTo(cp.position.x + 30, cp.position.y + 30);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#f9ca24';
    ctx.beginPath();
    ctx.arc(cp.position.x, cp.position.y, 8, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const spawner of itemSpawners.value) {
    ctx.fillStyle = 'rgba(46, 213, 115, 0.5)';
    ctx.strokeStyle = '#2ed573';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(spawner.position.x, spawner.position.y, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('📦', spawner.position.x, spawner.position.y);
  }

  for (const elem of envElements.value) {
    const isSelected = selectedElement.value && selectedElement.value.id === elem.id;

    switch (elem.type) {
      case 'asteroid':
        ctx.fillStyle = '#6b5344';
        ctx.strokeStyle = isSelected ? '#f9ca24' : '#3a2718';
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.beginPath();
        ctx.arc(elem.position.x, elem.position.y, elem.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        break;

      case 'gravityWell':
        for (let i = 3; i > 0; i--) {
          ctx.fillStyle = `rgba(108, 92, 231, ${0.15 * i})`;
          ctx.beginPath();
          ctx.arc(elem.position.x, elem.position.y, elem.radius * (i / 3), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.strokeStyle = isSelected ? '#f9ca24' : '#6c5ce7';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(elem.position.x, elem.position.y, elem.radius, 0, Math.PI * 2);
        ctx.stroke();
        break;

      case 'speedBoost':
        ctx.fillStyle = 'rgba(46, 213, 115, 0.3)';
        ctx.strokeStyle = isSelected ? '#f9ca24' : '#2ed573';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.arc(elem.position.x, elem.position.y, elem.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);
        break;

      case 'slowdown':
        ctx.fillStyle = 'rgba(255, 107, 107, 0.3)';
        ctx.strokeStyle = isSelected ? '#f9ca24' : '#ff6b6b';
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 6]);
        ctx.beginPath();
        ctx.arc(elem.position.x, elem.position.y, elem.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);
        break;
    }
  }
}

function resetTrack() {
  if (confirm('确定要重置赛道吗？所有修改将丢失。')) {
    outerControlPoints.value = [];
    innerControlPoints.value = [];
    checkpoints.value = [];
    itemSpawners.value = [];
    envElements.value = [];
    initDefaultTrack();
    render();
  }
}

function saveTrack() {
  showSaveModal.value = true;
  saveStatus.value = 'idle';
}

async function doSaveTrack() {
  if (outerControlPoints.value.length < 8) {
    alert('外边界至少需要8个控制点');
    return;
  }
  if (innerControlPoints.value.length < 8) {
    alert('内边界至少需要8个控制点');
    return;
  }
  if (checkpoints.value.length < 2) {
    alert('至少需要2个检查点');
    return;
  }

  saveStatus.value = 'saving';

  try {
    const startPos = checkpoints.value[0].position;
    const startAngle = checkpoints.value[0].direction;

    const trackData = {
      name: trackName.value || '自定义赛道',
      author: authorName.value || '匿名',
      outerBoundary: { controlPoints: outerControlPoints.value },
      innerBoundary: { controlPoints: innerControlPoints.value },
      checkpoints: checkpoints.value,
      envElements: envElements.value,
      itemSpawners: itemSpawners.value.map(s => ({
        id: s.id,
        position: s.position,
        lastSpawn: 0,
        currentItem: null,
        cooldown: 15
      })),
      startPosition: startPos,
      startAngle: startAngle
    };

    const res = await fetch('/api/tracks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(trackData)
    });

    if (res.ok) {
      saveStatus.value = 'success';
    } else {
      saveStatus.value = 'error';
    }
  } catch (e) {
    console.error('Save track failed:', e);
    saveStatus.value = 'error';
  }
}

function goToTracks() {
  router.push('/leaderboard');
}

function goBack() {
  router.push('/');
}
</script>

<style scoped>
.editor-page {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #0a0a1a;
  color: #fff;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: #1a1a3e;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.toolbar h2 {
  margin: 0;
  font-size: 20px;
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

.action-btn.primary {
  background: linear-gradient(135deg, #4ecdc4, #45b7d1);
  border: none;
  font-weight: bold;
}

.editor-content {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.tools-panel {
  width: 220px;
  padding: 16px;
  background: #1a1a3e;
  border-right: 1px solid rgba(255, 255, 255, 0.1);
  overflow-y: auto;
}

.properties-panel {
  width: 220px;
  padding: 16px;
  background: #1a1a3e;
  border-left: 1px solid rgba(255, 255, 255, 0.1);
  overflow-y: auto;
}

.tool-section {
  margin-bottom: 24px;
}

.tool-section h3 {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: #4ecdc4;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.tool-buttons {
  display: flex;
  gap: 6px;
}

.tool-buttons.vertical {
  flex-direction: column;
}

.tool-btn {
  flex: 1;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.05);
  border: 2px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  color: #fff;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
  text-align: left;
}

.tool-btn:hover {
  border-color: rgba(255, 255, 255, 0.3);
}

.tool-btn.active {
  border-color: #4ecdc4;
  background: rgba(78, 205, 196, 0.2);
}

.tips {
  margin: 0;
  padding-left: 18px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  line-height: 1.8;
}

.info-item {
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
  font-size: 13px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.info-item span:first-child {
  color: rgba(255, 255, 255, 0.6);
}

.canvas-container {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.editor-canvas {
  display: block;
  width: 100%;
  height: 100%;
  cursor: crosshair;
}

.form-group {
  margin-bottom: 14px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.8);
}

.form-group input[type="text"] {
  width: 100%;
  padding: 8px 10px;
  font-size: 13px;
  color: #fff;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  outline: none;
  box-sizing: border-box;
}

.form-group input[type="text"]:focus {
  border-color: #4ecdc4;
}

.form-group input[type="range"] {
  width: 100%;
}

.delete-btn {
  width: 100%;
  padding: 8px;
  background: rgba(255, 107, 107, 0.2);
  border: 1px solid rgba(255, 107, 107, 0.5);
  border-radius: 6px;
  color: #ff6b6b;
  cursor: pointer;
  font-size: 13px;
}

.delete-btn:hover {
  background: rgba(255, 107, 107, 0.3);
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
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  min-width: 300px;
}

.modal h3 {
  margin: 0 0 16px 0;
  text-align: center;
}

.success {
  color: #2ed573;
  text-align: center;
}

.error {
  color: #ff6b6b;
  text-align: center;
}

.modal-actions {
  display: flex;
  gap: 10px;
  margin-top: 20px;
}

.cancel-btn, .confirm-btn {
  flex: 1;
  padding: 10px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
}

.cancel-btn {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.confirm-btn {
  background: linear-gradient(135deg, #4ecdc4, #45b7d1);
  color: #fff;
  font-weight: bold;
}
</style>
