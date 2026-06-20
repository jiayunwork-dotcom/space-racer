<template>
  <div class="replay-view">
    <canvas ref="replayCanvas" class="replay-canvas"></canvas>
    
    <div class="player-list">
      <h3>玩家列表</h3>
      <div
        v-for="player in players"
        :key="player.playerId"
        :class="['player-item', { selected: followPlayerId === player.playerId }]"
        @click="selectPlayer(player.playerId)"
      >
        <span class="player-color" :style="{ backgroundColor: getPlayerColor(player.colorIndex) }"></span>
        <span class="player-name">{{ player.playerName }}</span>
        <span class="player-rank">#{{ player.finishPosition || '-' }}</span>
      </div>
      <div
        class="player-item free-cam" :class="{ selected: isFreeCamera }"
        @click="toggleFreeCamera"
      >
        <span class="player-color free-icon">🎥</span>
        <span class="player-name">自由视角</span>
      </div>
    </div>

    <div class="timeline-container">
      <div class="timeline-track" ref="timelineRef" @click="onTimelineClick" @mousedown="startDrag">
        <div class="timeline-progress" :style="{ width: progressPercent + '%' }"></div>
        <div class="timeline-handle" :style="{ left: progressPercent + '%' }"></div>
        <div
          v-for="event in timelineEvents"
          :key="event.id"
          class="timeline-event"
          :class="event.type"
          :style="{ left: getEventPosition(event) + '%' }"
          :title="getEventTooltip(event)"
          @click.stop="jumpToEvent(event)"
        >
          <span class="event-icon">{{ getEventIcon(event.type) }}</span>
        </div>
      </div>
      
      <div class="controls">
        <button class="control-btn" @click="stepBackward" title="后退一帧">⏮</button>
        <button class="control-btn play-btn" @click="togglePlay" :title="isPlaying ? '暂停' : '播放'">
          {{ isPlaying ? '⏸' : '▶' }}
        </button>
        <button class="control-btn" @click="stepForward" title="前进一帧">⏭</button>
        
        <div class="speed-controls">
          <button
            v-for="speed in speeds"
            :key="speed"
            :class="['speed-btn', { active: playbackSpeed === speed }]"
            @click="setSpeed(speed)"
          >
            {{ speed }}x
          </button>
        </div>
        
        <div class="time-display">
          {{ formatTime(currentTime) }} / {{ formatTime(duration) }}
        </div>
      </div>
    </div>

    <div class="stats-panel" :class="{ collapsed: statsCollapsed }">
      <div class="stats-toggle" @click="statsCollapsed = !statsCollapsed">
        {{ statsCollapsed ? '◀' : '▶' }}
        <span>数据统计</span>
      </div>
      
      <div v-if="!statsCollapsed" class="stats-content">
        <div class="stats-tabs">
          <button
            v-for="tab in statsTabs"
            :key="tab"
            :class="['stats-tab', { active: activeStatsTab === tab }]"
            @click="activeStatsTab = tab"
          >
            {{ tab }}
          </button>
        </div>
        
        <div class="chart-container">
          <div v-if="activeStatsTab === '速度'" ref="speedChartRef" class="chart"></div>
          <div v-if="activeStatsTab === '护盾'" ref="shieldChartRef" class="chart"></div>
          <div v-show="activeStatsTab === '道具'" class="events-timeline">
            <div v-for="player in players" :key="player.playerId" class="event-row">
              <span class="event-player-label" :style="{ color: getPlayerColor(player.colorIndex) }">
                {{ player.playerName }}
              </span>
              <div class="event-row-track">
                <span
                  v-for="event in getPlayerEvents(player.playerId)"
                  :key="event.id"
                  class="event-dot"
                  :class="event.type"
                  :style="{ left: getEventPosition(event) + '%' }"
                  :title="getEventTooltip(event)"
                  @click="jumpToEvent(event)"
                ></span>
              </div>
            </div>
          </div>
          <div v-if="activeStatsTab === '圈速'" ref="lapChartRef" class="chart"></div>
          <div v-if="activeStatsTab === '碰撞'" ref="collisionChart" class="chart collision-heatmap">
            <canvas ref="heatmapCanvas" class="heatmap-canvas"></canvas>
          </div>
        </div>
      </div>
    </div>

    <button class="back-btn" @click="goBack">
      返回
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, nextTick, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import * as echarts from 'echarts';
import type { RaceReplay, ShipReplayFrame, ReplayEvent, PlayerRaceStats } from '../types/game';
import { SHIP_COLORS } from '../types/game';
import { GameRenderer } from '../game/renderer';
import {
  createReplayPlayer,
  updateReplayPlayer,
  getInterpolatedShips,
  togglePlay as togglePlayFn,
  setPlaybackSpeed,
  stepForward as stepForwardFn,
  stepBackward as stepBackwardFn,
  seekToTime,
  type ReplayPlayerState
} from '../utils/replayPlayer';
import type { Track } from '../types/game';

const route = useRoute();
const router = useRouter();

const replayCanvas = ref<HTMLCanvasElement | null>(null);
const heatmapCanvas = ref<HTMLCanvasElement | null>(null);
const timelineRef = ref<HTMLDivElement | null>(null);
const speedChartRef = ref<HTMLElement | null>(null);
const shieldChartRef = ref<HTMLElement | null>(null);
const lapChartRef = ref<HTMLElement | null>(null);

const replay = ref<RaceReplay | null>(null);
const track = ref<Track | null>(null);
const playerState = ref<ReplayPlayerState | null>(null);

const isPlaying = ref(false);
const playbackSpeed = ref(1);
const currentTime = ref(0);
const duration = ref(0);
const followPlayerId = ref<string | null>(null);
const isFreeCamera = ref(true);
const statsCollapsed = ref(false);
const activeStatsTab = ref('速度');
const isDragging = ref(false);

const speeds = [0.5, 1, 2, 4];
const statsTabs = ['速度', '护盾', '道具', '圈速', '碰撞'];

let renderer: GameRenderer | null = null;
let animationFrameId: number | null = null;
let lastFrameTime = 0;
let speedChart: echarts.ECharts | null = null;
let shieldChart: echarts.ECharts | null = null;
let lapChart: echarts.ECharts | null = null;

const players = computed(() => replay.value?.players || []);

const progressPercent = computed(() => {
  if (duration.value === 0) return 0;
  return (currentTime.value / duration.value) * 100;
});

const timelineEvents = computed(() => {
  if (!replay.value) return [];
  return replay.value.events.filter(e => 
    e.type === 'item_pickup' || e.type === 'item_use' || 
    e.type === 'collision_ship' || e.type === 'lap_complete' ||
    e.type === 'race_finish'
  ).slice(0, 50);
});

function getPlayerColor(index: number): string {
  return SHIP_COLORS[index] || '#ffffff';
}

function formatTime(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = Math.floor((ms % 1000) / 10);
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
}

function getEventPosition(event: ReplayEvent): number {
  if (!replay.value) return 0;
  return (event.timestamp / replay.value.duration) * 100;
}

function getEventIcon(type: string): string {
  switch (type) {
    case 'item_pickup': return '📦';
    case 'item_use': return '⚡';
    case 'collision_ship': return '💥';
    case 'collision_boundary': return '🧱';
    case 'lap_complete': return '🏁';
    case 'race_finish': return '🏆';
    default: return '•';
  }
}

function getEventTooltip(event: ReplayEvent): string {
  let text = `${formatTime(event.timestamp)} - ${event.playerName}`;
  if (event.itemType) text += ` - ${event.itemType}`;
  if (event.targetPlayerName) text += ` → ${event.targetPlayerName}`;
  return text;
}

function getPlayerEvents(playerId: string): ReplayEvent[] {
  if (!replay.value) return [];
  return replay.value.events.filter(e => e.playerId === playerId);
}

function selectPlayer(playerId: string) {
  if (!playerState.value) return;
  followPlayerId.value = playerId;
  isFreeCamera.value = false;
}

function toggleFreeCamera() {
  isFreeCamera.value = true;
  followPlayerId.value = null;
}

function togglePlay() {
  if (!playerState.value) return;
  togglePlayFn(playerState.value);
  isPlaying.value = playerState.value.isPlaying;
}

function setSpeed(speed: number) {
  if (!playerState.value) return;
  playbackSpeed.value = speed;
  setPlaybackSpeed(playerState.value, speed);
}

function stepForward() {
  if (!playerState.value) return;
  stepForwardFn(playerState.value, 1);
  currentTime.value = playerState.value.currentTime;
  isPlaying.value = false;
}

function stepBackward() {
  if (!playerState.value) return;
  stepBackwardFn(playerState.value, 1);
  currentTime.value = playerState.value.currentTime;
  isPlaying.value = false;
}

function onTimelineClick(e: MouseEvent) {
  if (!timelineRef.value || !replay.value || !playerState.value) return;
  const rect = timelineRef.value.getBoundingClientRect();
  const percent = (e.clientX - rect.left) / rect.width;
  const time = percent * replay.value.duration;
  seekToTime(playerState.value, time);
  currentTime.value = playerState.value.currentTime;
}

function startDrag(e: MouseEvent) {
  isDragging.value = true;
  document.addEventListener('mousemove', onDrag);
  document.addEventListener('mouseup', stopDrag);
}

function onDrag(e: MouseEvent) {
  if (!isDragging.value || !timelineRef.value || !replay.value || !playerState.value) return;
  const rect = timelineRef.value.getBoundingClientRect();
  let percent = (e.clientX - rect.left) / rect.width;
  percent = Math.max(0, Math.min(1, percent));
  const time = percent * replay.value.duration;
  seekToTime(playerState.value, time);
  currentTime.value = playerState.value.currentTime;
}

function stopDrag() {
  isDragging.value = false;
  document.removeEventListener('mousemove', onDrag);
  document.removeEventListener('mouseup', stopDrag);
}

function jumpToEvent(event: ReplayEvent) {
  if (!playerState.value) return;
  seekToTime(playerState.value, event.timestamp);
  currentTime.value = playerState.value.currentTime;
}

function goBack() {
  router.back();
}

function render() {
  if (!renderer || !track.value || !replay.value || !playerState.value) return;

  const ships = getInterpolatedShips(replay.value, currentTime.value);

  const shipsForRenderer = ships.map(s => ({
    id: s.playerId,
    playerId: s.playerId,
    playerName: s.playerName,
    position: s.position,
    velocity: s.velocity,
    angle: s.angle,
    angularVelocity: 0,
    shield: s.shield,
    maxShield: s.maxShield,
    engineType: 'balanced' as const,
    colorIndex: s.colorIndex,
    currentCheckpoint: s.currentCheckpoint,
    lap: s.lap,
    lapStartTime: 0,
    bestLapTime: null,
    totalTime: 0,
    finished: s.finished,
    finishTime: null,
    finishPosition: null,
    item: s.item,
    boostEndTime: s.boostEndTime,
    stunnedUntil: s.stunnedUntil,
    slowdownUntil: s.slowdownUntil,
    lastCheckpointPos: { x: 0, y: 0 },
    isRespawning: s.isRespawning,
    respawnTime: 0,
    itemUses: 0
  }));

  if (!isFreeCamera.value && followPlayerId.value) {
    const followShip = ships.find(s => s.playerId === followPlayerId.value);
    if (followShip) {
      const targetX = followShip.position.x;
      const targetY = followShip.position.y + 100;
      renderer.setCamera(targetX, targetY, 1);
    }
  } else {
    if (track.value.checkpoints.length > 0) {
      let sumX = 0, sumY = 0;
      for (const cp of track.value.checkpoints) {
        sumX += cp.position.x;
        sumY += cp.position.y;
      }
      const centerX = sumX / track.value.checkpoints.length;
      const centerY = sumY / track.value.checkpoints.length;
      renderer.setCamera(centerX, centerY, 0.6);
    }
  }

  renderer.clear();
  renderer.drawTrack(track.value);
  renderer.drawEnvElements(track.value.envElements);
  renderer.drawCheckpoints(track.value.checkpoints);
  
  const currentFrameData = getCurrentFrameData();
  if (currentFrameData) {
    renderer.drawItemSpawners(currentFrameData.itemSpawners as any);
    renderer.drawShips(shipsForRenderer, null);
    renderer.drawProjectiles(currentFrameData.projectiles as any);
    renderer.drawMines(currentFrameData.mines as any);
  }
}

function getCurrentFrameData() {
  if (!replay.value || replay.value.frames.length === 0) return null;
  
  let closestFrame = replay.value.frames[0];
  let minDiff = Math.abs(currentTime.value - closestFrame.timestamp);
  
  for (const frame of replay.value.frames) {
    const diff = Math.abs(currentTime.value - frame.timestamp);
    if (diff < minDiff) {
      minDiff = diff;
      closestFrame = frame;
    }
  }
  
  return closestFrame;
}

function gameLoop(timestamp: number) {
  if (lastFrameTime === 0) lastFrameTime = timestamp;
  const deltaTime = timestamp - lastFrameTime;
  lastFrameTime = timestamp;

  if (playerState.value && isPlaying.value) {
    updateReplayPlayer(playerState.value, deltaTime);
    currentTime.value = playerState.value.currentTime;
    isPlaying.value = playerState.value.isPlaying;
  }

  render();

  animationFrameId = requestAnimationFrame(gameLoop);
}

async function loadReplay() {
  const replayId = route.params.replayId as string;
  console.log('[ReplayView] loadReplay called, replayId:', replayId);
  if (!replayId) return;

  try {
    const res = await fetch(`/api/race-replay/${replayId}`);
    console.log('[ReplayView] fetch race-replay status:', res.status);
    if (!res.ok) {
      console.error('[ReplayView] Failed to fetch replay, status:', res.status);
      return;
    }
    const data = await res.json();
    console.log('[ReplayView] replay data loaded:', {
      hasReplay: !!data.replay,
      frames: data.replay?.frames?.length,
      events: data.replay?.events?.length,
      players: data.replay?.players?.length,
      duration: data.replay?.duration
    });
    if (data.replay) {
      replay.value = data.replay;
      duration.value = data.replay.duration;
      
      const trackRes = await fetch(`/api/tracks/${data.replay.trackId}`);
      console.log('[ReplayView] fetch track status:', trackRes.status);
      if (trackRes.ok) {
        const trackData = await trackRes.json();
        if (trackData.track) {
          track.value = trackData.track;
          console.log('[ReplayView] track loaded:', trackData.track.name);
        }
      }

      playerState.value = createReplayPlayer(data.replay);
      console.log('[ReplayView] replay player created');

      nextTick(() => {
        setTimeout(() => {
          console.log('[ReplayView] initializing charts after delay');
          initCharts();
          drawCollisionHeatmap();
        }, 100);
      });
    }
  } catch (e) {
    console.error('[ReplayView] Failed to load replay:', e);
  }
}

function initCharts() {
  if (!replay.value) {
    console.warn('[ReplayView] initCharts: no replay data');
    return;
  }

  if (speedChart) speedChart.dispose();
  if (shieldChart) shieldChart.dispose();
  if (lapChart) lapChart.dispose();

  console.log('[ReplayView] initCharts refs:', {
    speed: !!speedChartRef.value,
    speedRect: speedChartRef.value?.getBoundingClientRect(),
    shield: !!shieldChartRef.value,
    shieldRect: shieldChartRef.value?.getBoundingClientRect(),
    lap: !!lapChartRef.value,
    lapRect: lapChartRef.value?.getBoundingClientRect()
  });

  if (speedChartRef.value) {
    speedChart = echarts.init(speedChartRef.value);
    speedChart.setOption(getSpeedChartOption());
    console.log('[ReplayView] speed chart initialized');
  } else {
    console.warn('[ReplayView] speedChartRef not available');
  }

  if (shieldChartRef.value) {
    shieldChart = echarts.init(shieldChartRef.value);
    shieldChart.setOption(getShieldChartOption());
    console.log('[ReplayView] shield chart initialized');
  } else {
    console.warn('[ReplayView] shieldChartRef not available');
  }

  if (lapChartRef.value) {
    lapChart = echarts.init(lapChartRef.value);
    lapChart.setOption(getLapChartOption());
    console.log('[ReplayView] lap chart initialized');
  } else {
    console.warn('[ReplayView] lapChartRef not available');
  }
}

function getSpeedChartOption(): echarts.EChartsOption {
  if (!replay.value) return {};

  const series = replay.value.players.map(player => {
    const data: [number, number][] = [];
    const playerFrames = replay.value!.frames
      .map(f => f.ships.find(s => s.playerId === player.playerId))
      .filter(Boolean);

    for (let i = 0; i < playerFrames.length; i++) {
      const frame = playerFrames[i];
      if (frame) {
        const speed = Math.sqrt(frame.velocity.x ** 2 + frame.velocity.y ** 2);
        data.push([replay.value!.frames[i].timestamp / 1000, speed]);
      }
    }

    return {
      name: player.playerName,
      type: 'line' as const,
      data,
      smooth: true,
      lineStyle: {
        color: getPlayerColor(player.colorIndex)
      },
      itemStyle: {
        color: getPlayerColor(player.colorIndex)
      }
    };
  });

  return {
    title: { text: '速度曲线', left: 'center', textStyle: { color: '#fff', fontSize: 14 } },
    tooltip: { trigger: 'axis' },
    legend: {
      bottom: 0,
      textStyle: { color: '#fff' }
    },
    grid: { left: 50, right: 20, top: 40, bottom: 40 },
    xAxis: {
      type: 'value',
      name: '时间 (秒)',
      axisLabel: { color: '#aaa' },
      axisLine: { lineStyle: { color: '#333' } }
    },
    yAxis: {
      type: 'value',
      name: '速度',
      axisLabel: { color: '#aaa' },
      axisLine: { lineStyle: { color: '#333' } }
    },
    series
  };
}

function getShieldChartOption(): echarts.EChartsOption {
  if (!replay.value) return {};

  const series = replay.value.players.map(player => {
    const data: [number, number][] = [];
    const playerFrames = replay.value!.frames
      .map(f => f.ships.find(s => s.playerId === player.playerId))
      .filter(Boolean);

    for (let i = 0; i < playerFrames.length; i++) {
      const frame = playerFrames[i];
      if (frame) {
        data.push([replay.value!.frames[i].timestamp / 1000, frame.shield]);
      }
    }

    return {
      name: player.playerName,
      type: 'line' as const,
      data,
      smooth: true,
      lineStyle: {
        color: getPlayerColor(player.colorIndex)
      },
      itemStyle: {
        color: getPlayerColor(player.colorIndex)
      }
    };
  });

  return {
    title: { text: '护盾变化', left: 'center', textStyle: { color: '#fff', fontSize: 14 } },
    tooltip: { trigger: 'axis' },
    legend: {
      bottom: 0,
      textStyle: { color: '#fff' }
    },
    grid: { left: 50, right: 20, top: 40, bottom: 40 },
    xAxis: {
      type: 'value',
      name: '时间 (秒)',
      axisLabel: { color: '#aaa' },
      axisLine: { lineStyle: { color: '#333' } }
    },
    yAxis: {
      type: 'value',
      name: '护盾值',
      max: 100,
      axisLabel: { color: '#aaa' },
      axisLine: { lineStyle: { color: '#333' } }
    },
    series
  };
}

function getLapChartOption(): echarts.EChartsOption {
  if (!replay.value) return {};

  const lapCount = Math.max(...replay.value.players.map(p => p.lapTimes.length), 0);

  const series = replay.value.players.map((player, idx) => {
    const data = player.lapTimes.map(lt => lt.time / 1000);
    return {
      name: player.playerName,
      type: 'bar' as const,
      data,
      itemStyle: {
        color: getPlayerColor(player.colorIndex)
      }
    };
  });

  return {
    title: { text: '每圈耗时', left: 'center', textStyle: { color: '#fff', fontSize: 14 } },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: {
      bottom: 0,
      textStyle: { color: '#fff' }
    },
    grid: { left: 60, right: 20, top: 40, bottom: 40 },
    xAxis: {
      type: 'category',
      data: Array.from({ length: lapCount }, (_, i) => '第' + (i + 1) + '圈'),
      axisLabel: { color: '#aaa' },
      axisLine: { lineStyle: { color: '#333' } }
    },
    yAxis: {
      type: 'value',
      name: '时间 (秒)',
      axisLabel: { color: '#aaa' },
      axisLine: { lineStyle: { color: '#333' } }
    },
    series
  };
}

function drawCollisionHeatmap() {
  if (!heatmapCanvas.value || !track.value || !replay.value) return;

  const canvas = heatmapCanvas.value;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;

  const width = canvas.width;
  const height = canvas.height;

  const padding = 20;
  const trackWidth = width - padding * 2;
  const trackHeight = height - padding * 2;

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;

  for (const cp of track.value.checkpoints) {
    minX = Math.min(minX, cp.position.x);
    maxX = Math.max(maxX, cp.position.x);
    minY = Math.min(minY, cp.position.y);
    maxY = Math.max(maxY, cp.position.y);
  }

  const scaleX = trackWidth / (maxX - minX);
  const scaleY = trackHeight / (maxY - minY);
  const scale = Math.min(scaleX, scaleY);

  const offsetX = padding + (trackWidth - (maxX - minX) * scale) / 2;
  const offsetY = padding + (trackHeight - (maxY - minY) * scale) / 2;

  function worldToScreen(x: number, y: number) {
    return {
      x: offsetX + (x - minX) * scale,
      y: offsetY + (y - minY) * scale
    };
  }

  ctx.fillStyle = '#0a0a2e';
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = 'rgba(78, 205, 196, 0.3)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < track.value.checkpoints.length; i++) {
    const cp = track.value.checkpoints[i];
    const p = worldToScreen(cp.position.x, cp.position.y);
    if (i === 0) {
      ctx.moveTo(p.x, p.y);
    } else {
      ctx.lineTo(p.x, p.y);
    }
  }
  ctx.closePath();
  ctx.stroke();

  const collisionData = new Map<string, number>();
  const gridSize = 10;

  for (const col of replay.value.collisions) {
    const p = worldToScreen(col.position.x, col.position.y);
    const gridX = Math.floor(p.x / gridSize);
    const gridY = Math.floor(p.y / gridSize);
    const key = gridX + ',' + gridY;
    collisionData.set(key, (collisionData.get(key) || 0) + 1);
  }

  let maxCount = 0;
  for (const count of collisionData.values()) {
    maxCount = Math.max(maxCount, count);
  }

  for (const [key, count] of collisionData) {
    const [gx, gy] = key.split(',').map(Number);
    const x = gx * gridSize + gridSize / 2;
    const y = gy * gridSize + gridSize / 2;
    const intensity = count / maxCount;

    const gradient = ctx.createRadialGradient(x, y, 0, x, y, gridSize * 2);
    gradient.addColorStop(0, 'rgba(255, 107, 107, ' + (intensity * 0.8) + ')');
    gradient.addColorStop(0.5, 'rgba(255, 165, 2, ' + (intensity * 0.5) + ')');
    gradient.addColorStop(1, 'rgba(255, 107, 107, 0)');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, gridSize * 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function handleResize() {
  if (renderer && replayCanvas.value) {
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  
  if (speedChart) speedChart.resize();
  if (shieldChart) shieldChart.resize();
  if (lapChart) lapChart.resize();
  
  drawCollisionHeatmap();
}

onMounted(async () => {
  if (!replayCanvas.value) return;

  renderer = new GameRenderer(replayCanvas.value);
  handleResize();

  window.addEventListener('resize', handleResize);

  await loadReplay();

  animationFrameId = requestAnimationFrame(gameLoop);
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }
  if (speedChart) speedChart.dispose();
  if (shieldChart) shieldChart.dispose();
  if (lapChart) lapChart.dispose();
});

watch(activeStatsTab, () => {
  console.log('[ReplayView] activeStatsTab changed to:', activeStatsTab.value);
  nextTick(() => {
    setTimeout(() => {
      if (activeStatsTab.value === '速度' && speedChartRef.value && !speedChart) {
        speedChart = echarts.init(speedChartRef.value);
        speedChart.setOption(getSpeedChartOption());
        console.log('[ReplayView] speed chart lazy initialized');
      }
      if (activeStatsTab.value === '速度' && speedChart) {
        speedChart.resize();
      }
      if (activeStatsTab.value === '护盾' && shieldChartRef.value && !shieldChart) {
        shieldChart = echarts.init(shieldChartRef.value);
        shieldChart.setOption(getShieldChartOption());
        console.log('[ReplayView] shield chart lazy initialized');
      }
      if (activeStatsTab.value === '护盾' && shieldChart) {
        shieldChart.resize();
      }
      if (activeStatsTab.value === '圈速' && lapChartRef.value && !lapChart) {
        lapChart = echarts.init(lapChartRef.value);
        lapChart.setOption(getLapChartOption());
        console.log('[ReplayView] lap chart lazy initialized');
      }
      if (activeStatsTab.value === '圈速' && lapChart) {
        lapChart.resize();
      }
      if (activeStatsTab.value === '碰撞') {
        drawCollisionHeatmap();
      }
    }, 50);
  });
});

watch(statsCollapsed, (collapsed) => {
  console.log('[ReplayView] statsCollapsed changed to:', collapsed);
  if (!collapsed) {
    nextTick(() => {
      setTimeout(() => {
        if (speedChart) speedChart.resize();
        if (shieldChart) shieldChart.resize();
        if (lapChart) lapChart.resize();
        drawCollisionHeatmap();
      }, 100);
    });
  }
});
</script>

<style scoped>
.replay-view {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
  background: #020210;
}

.replay-canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.player-list {
  position: absolute;
  left: 20px;
  top: 20px;
  background: rgba(0, 0, 0, 0.8);
  border-radius: 12px;
  padding: 16px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  min-width: 200px;
  z-index: 10;
}

.player-list h3 {
  margin: 0 0 12px 0;
  color: #fff;
  font-size: 16px;
}

.player-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: 4px;
}

.player-item:hover {
  background: rgba(255, 255, 255, 0.1);
}

.player-item.selected {
  background: rgba(78, 205, 196, 0.2);
  border: 1px solid #4ecdc4;
}

.player-color {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.free-icon {
  font-size: 14px;
  width: 12px;
  text-align: center;
}

.player-name {
  flex: 1;
  color: #fff;
  font-size: 14px;
}

.player-rank {
  color: #f9ca24;
  font-size: 12px;
  font-weight: bold;
}

.free-cam {
  margin-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  padding-top: 12px;
}

.timeline-container {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(0, 0, 0, 0.9);
  padding: 16px 20px 20px;
  z-index: 10;
}

.timeline-track {
  position: relative;
  height: 40px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  cursor: pointer;
  margin-bottom: 12px;
}

.timeline-progress {
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  background: linear-gradient(90deg, #4ecdc4, #45b7d1);
  border-radius: 4px;
  opacity: 0.3;
}

.timeline-handle {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 12px;
  height: 12px;
  background: #4ecdc4;
  border-radius: 50%;
  box-shadow: 0 0 10px rgba(78, 205, 196, 0.5);
  cursor: grab;
}

.timeline-handle:active {
  cursor: grabbing;
}

.timeline-event {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  cursor: pointer;
  z-index: 1;
  font-size: 12px;
}

.event-icon {
  display: block;
  width: 20px;
  height: 20px;
  text-align: center;
  line-height: 20px;
}

.controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.control-btn {
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  cursor: pointer;
  font-size: 16px;
  transition: all 0.2s;
}

.control-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.control-btn.play-btn {
  width: 50px;
  height: 50px;
  font-size: 20px;
  background: linear-gradient(135deg, #4ecdc4, #45b7d1);
}

.control-btn.play-btn:hover {
  transform: scale(1.1);
}

.speed-controls {
  display: flex;
  gap: 4px;
  margin-left: 12px;
}

.speed-btn {
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
}

.speed-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.speed-btn.active {
  background: #4ecdc4;
  color: #000;
  font-weight: bold;
}

.time-display {
  margin-left: auto;
  color: #fff;
  font-family: monospace;
  font-size: 14px;
}

.stats-panel {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  z-index: 10;
}

.stats-toggle {
  width: 30px;
  background: rgba(0, 0, 0, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-right: none;
  border-radius: 8px 0 0 8px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 12px;
  writing-mode: vertical-rl;
  text-orientation: mixed;
  padding: 20px 0;
  gap: 8px;
}

.stats-toggle:hover {
  background: rgba(0, 0, 0, 0.9);
}

.stats-content {
  width: 400px;
  height: 500px;
  background: rgba(0, 0, 0, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0 0 0 8px;
  padding: 16px;
}

.stats-panel.collapsed .stats-content {
  display: none;
}

.stats-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.stats-tab {
  flex: 1;
  min-width: auto;
  padding: 8px 12px;
  border: none;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
}

.stats-tab:hover {
  background: rgba(255, 255, 255, 0.2);
}

.stats-tab.active {
  background: #4ecdc4;
  color: #000;
  font-weight: bold;
}

.chart-container {
  width: 100%;
  height: calc(100% - 50px);
}

.chart {
  width: 100%;
  height: 100%;
}

.events-timeline {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 400px;
  overflow-y: auto;
}

.event-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.event-player-label {
  width: 80px;
  font-size: 12px;
  font-weight: bold;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.event-row-track {
  flex: 1;
  height: 20px;
  position: relative;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
}

.event-dot {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 10px;
  height: 10px;
  border-radius: 50%;
  cursor: pointer;
}

.event-dot.item_pickup {
  background: #2ed573;
}

.event-dot.item_use {
  background: #ffa502;
}

.event-dot.collision_ship {
  background: #ff4757;
}

.event-dot.collision_boundary {
  background: #ff6b6b;
}

.event-dot.lap_complete {
  background: #f9ca24;
}

.event-dot.race_finish {
  background: #a29bfe;
}

.collision-heatmap {
  position: relative;
  width: 100%;
  height: 100%;
}

.heatmap-canvas {
  width: 100%;
  height: 100%;
  border-radius: 8px;
}

.back-btn {
  position: absolute;
  top: 20px;
  right: 20px;
  padding: 10px 20px;
  background: rgba(0, 0, 0, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  color: #fff;
  cursor: pointer;
  z-index: 10;
  transition: all 0.2s;
}

.back-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}
</style>
