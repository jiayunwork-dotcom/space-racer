import type { Ship, Track, EnvElement, Projectile, Mine, ItemSpawner, Checkpoint } from '../types/game';
import { SHIP_COLORS, PHYSICS_CONFIG } from '../types/game';
import { drawBezierPath, drawBezierStroke } from '../utils/bezier';
import { vec2, vecAdd, vecRotate } from '../utils/vector';

export class GameRenderer {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  private cameraX = 0;
  private cameraY = 0;
  private zoom = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Cannot get 2d context');
    this.ctx = ctx;
  }

  setSize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  setCamera(x: number, y: number, zoom: number = 1): void {
    this.cameraX = x;
    this.cameraY = y;
    this.zoom = zoom;
  }

  worldToScreen(x: number, y: number): { x: number; y: number } {
    return {
      x: (x - this.cameraX) * this.zoom + this.canvas.width / 2,
      y: (y - this.cameraY) * this.zoom + this.canvas.height / 2
    };
  }

  clear(): void {
    const ctx = this.ctx;
    const gradient = ctx.createRadialGradient(
      this.canvas.width / 2, this.canvas.height / 2, 0,
      this.canvas.width / 2, this.canvas.height / 2, this.canvas.width
    );
    gradient.addColorStop(0, '#0a0a2e');
    gradient.addColorStop(1, '#020210');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.drawStars();
  }

  private drawStars(): void {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    
    const starCount = 100;
    const seed = 12345;
    
    for (let i = 0; i < starCount; i++) {
      const x = ((seed * (i + 1) * 9301 + 49297) % 233280) / 233280 * this.canvas.width;
      const y = ((seed * (i + 1) * 49297 + 9301) % 233280) / 233280 * this.canvas.height;
      const size = ((seed * (i + 1) * 1234) % 100) / 100 * 2 + 0.5;
      const alpha = ((seed * (i + 1) * 5678) % 100) / 100 * 0.5 + 0.2;
      
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.globalAlpha = 1;
  }

  drawTrack(track: Track): void {
    const ctx = this.ctx;
    
    ctx.save();
    ctx.translate(this.canvas.width / 2, this.canvas.height / 2);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.cameraX, -this.cameraY);

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

    ctx.restore();
  }

  drawEnvElements(elements: EnvElement[]): void {
    const ctx = this.ctx;
    
    ctx.save();
    ctx.translate(this.canvas.width / 2, this.canvas.height / 2);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.cameraX, -this.cameraY);

    for (const element of elements) {
      switch (element.type) {
        case 'asteroid':
          this.drawAsteroid(element);
          break;
        case 'gravityWell':
          this.drawGravityWell(element);
          break;
        case 'speedBoost':
          this.drawSpeedBoost(element);
          break;
        case 'slowdown':
          this.drawSlowdown(element);
          break;
      }
    }

    ctx.restore();
  }

  private drawAsteroid(element: EnvElement): void {
    const ctx = this.ctx;
    const { x, y } = element.position;
    const r = element.radius;

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

  private drawGravityWell(element: EnvElement): void {
    const ctx = this.ctx;
    const { x, y } = element.position;
    const r = element.radius;

    for (let i = 5; i > 0; i--) {
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, r * (i / 5));
      gradient.addColorStop(0, 'rgba(108, 92, 231, 0.4)');
      gradient.addColorStop(1, 'rgba(108, 92, 231, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, r * (i / 5), 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = '#6c5ce7';
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowColor = '#6c5ce7';
    ctx.shadowBlur = 20;
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  private drawSpeedBoost(element: EnvElement): void {
    const ctx = this.ctx;
    const { x, y } = element.position;
    const r = element.radius;

    const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
    gradient.addColorStop(0, 'rgba(46, 213, 115, 0.4)');
    gradient.addColorStop(1, 'rgba(46, 213, 115, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#2ed573';
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#2ed573';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⚡', x, y);
  }

  private drawSlowdown(element: EnvElement): void {
    const ctx = this.ctx;
    const { x, y } = element.position;
    const r = element.radius;

    const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
    gradient.addColorStop(0, 'rgba(255, 107, 107, 0.3)');
    gradient.addColorStop(1, 'rgba(255, 107, 107, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#ff6b6b';
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 6]);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  drawCheckpoints(checkpoints: Checkpoint[]): void {
    const ctx = this.ctx;
    
    ctx.save();
    ctx.translate(this.canvas.width / 2, this.canvas.height / 2);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.cameraX, -this.cameraY);

    for (let i = 0; i < checkpoints.length; i++) {
      const cp = checkpoints[i];
      const { x, y } = cp.position;

      const dirX = Math.cos(cp.direction);
      const dirY = Math.sin(cp.direction);
      const perpX = -dirY;
      const perpY = dirX;

      ctx.strokeStyle = i === 0 ? '#f9ca24' : 'rgba(249, 202, 36, 0.5)';
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      ctx.moveTo(x - perpX * 50, y - perpY * 50);
      ctx.lineTo(x + perpX * 50, y + perpY * 50);
      ctx.stroke();
      ctx.setLineDash([]);

      if (i === 0) {
        ctx.fillStyle = '#f9ca24';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('START', x, y - 25);
      }

      ctx.fillStyle = '#f9ca24';
      ctx.beginPath();
      ctx.moveTo(x + dirX * 15, y + dirY * 15);
      ctx.lineTo(x - perpX * 8, y - perpY * 8);
      ctx.lineTo(x + perpX * 8, y + perpY * 8);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }

  drawItemSpawners(spawners: ItemSpawner[]): void {
    const ctx = this.ctx;
    
    ctx.save();
    ctx.translate(this.canvas.width / 2, this.canvas.height / 2);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.cameraX, -this.cameraY);

    for (const spawner of spawners) {
      const { x, y } = spawner.position;

      if (spawner.currentItem) {
        const color = this.getItemColor(spawner.currentItem);
        
        ctx.shadowColor = color;
        ctx.shadowBlur = 15;
        
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, 12, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.shadowBlur = 0;
        
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.getItemIcon(spawner.currentItem), x, y);
      } else {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(x, y, 12, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    ctx.restore();
  }

  private getItemColor(item: string): string {
    switch (item) {
      case 'shield': return '#2ed573';
      case 'boost': return '#ffa502';
      case 'missile': return '#ff4757';
      case 'mine': return '#5352ed';
      case 'emp': return '#a29bfe';
      default: return '#fff';
    }
  }

  private getItemIcon(item: string): string {
    switch (item) {
      case 'shield': return '🛡';
      case 'boost': return '⚡';
      case 'missile': return '🚀';
      case 'mine': return '💣';
      case 'emp': return '⚡';
      default: return '?';
    }
  }

  drawShips(ships: Ship[], playerShipId: string | null = null): void {
    const ctx = this.ctx;
    
    ctx.save();
    ctx.translate(this.canvas.width / 2, this.canvas.height / 2);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.cameraX, -this.cameraY);

    for (const ship of ships) {
      if (ship.isRespawning) continue;
      this.drawShip(ship, ship.id === playerShipId);
    }

    ctx.restore();
  }

  private drawShip(ship: Ship, isPlayer: boolean): void {
    const ctx = this.ctx;
    const { x, y } = ship.position;
    const angle = ship.angle;
    const color = SHIP_COLORS[ship.colorIndex];

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    if (isPlayer) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 20;
    }

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(PHYSICS_CONFIG.shipRadius, 0);
    ctx.lineTo(-PHYSICS_CONFIG.shipRadius * 0.7, -PHYSICS_CONFIG.shipRadius * 0.7);
    ctx.lineTo(-PHYSICS_CONFIG.shipRadius * 0.4, 0);
    ctx.lineTo(-PHYSICS_CONFIG.shipRadius * 0.7, PHYSICS_CONFIG.shipRadius * 0.7);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.beginPath();
    ctx.arc(PHYSICS_CONFIG.shipRadius * 0.2, 0, PHYSICS_CONFIG.shipRadius * 0.25, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.restore();

    const shieldRatio = ship.shield / ship.maxShield;
    ctx.strokeStyle = shieldRatio > 0.5 ? '#2ed573' : shieldRatio > 0.25 ? '#ffa502' : '#ff4757';
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.arc(x, y, PHYSICS_CONFIG.shipRadius + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * shieldRatio);
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.fillStyle = '#fff';
    ctx.font = '10px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(ship.playerName, x, y - PHYSICS_CONFIG.shipRadius - 10);

    if (Date.now() < ship.boostEndTime) {
      ctx.fillStyle = '#ffa502';
      ctx.font = 'bold 14px Arial';
      ctx.fillText('⚡', x + 20, y - PHYSICS_CONFIG.shipRadius - 5);
    }

    if (Date.now() < ship.stunnedUntil) {
      ctx.fillStyle = '#a29bfe';
      ctx.font = 'bold 14px Arial';
      ctx.fillText('💫', x, y - PHYSICS_CONFIG.shipRadius - 20);
    }
  }

  drawProjectiles(projectiles: Projectile[]): void {
    const ctx = this.ctx;
    
    ctx.save();
    ctx.translate(this.canvas.width / 2, this.canvas.height / 2);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.cameraX, -this.cameraY);

    for (const proj of projectiles) {
      if (proj.type === 'missile') {
        const { x, y } = proj.position;
        const angle = Math.atan2(proj.velocity.y, proj.velocity.x);

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);

        ctx.fillStyle = '#ff4757';
        ctx.shadowColor = '#ff4757';
        ctx.shadowBlur = 10;
        
        ctx.beginPath();
        ctx.moveTo(8, 0);
        ctx.lineTo(-6, -3);
        ctx.lineTo(-4, 0);
        ctx.lineTo(-6, 3);
        ctx.closePath();
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.restore();
      }
    }

    ctx.restore();
  }

  drawMines(mines: Mine[]): void {
    const ctx = this.ctx;
    
    ctx.save();
    ctx.translate(this.canvas.width / 2, this.canvas.height / 2);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.cameraX, -this.cameraY);

    for (const mine of mines) {
      const { x, y } = mine.position;

      ctx.fillStyle = '#5352ed';
      ctx.shadowColor = '#5352ed';
      ctx.shadowBlur = 8;
      
      ctx.beginPath();
      ctx.arc(x, y, PHYSICS_CONFIG.mineRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('💣', x, y);

      ctx.shadowBlur = 0;
    }

    ctx.restore();
  }

  drawMinimap(
    x: number,
    y: number,
    width: number,
    height: number,
    track: Track,
    ships: Ship[],
    playerShipId: string | null
  ): void {
    const ctx = this.ctx;
    const scale = Math.min(width, height) / 1600;

    ctx.save();
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 8);
    ctx.fill();
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 8);
    ctx.clip();

    const offsetX = x + width / 2;
    const offsetY = y + height / 2;

    ctx.strokeStyle = 'rgba(78, 205, 196, 0.6)';
    ctx.lineWidth = 1;
    this.drawBezierForMinimap(ctx, track.outerBoundary.controlPoints, offsetX, offsetY, scale);

    ctx.strokeStyle = 'rgba(255, 107, 107, 0.6)';
    ctx.lineWidth = 1;
    this.drawBezierForMinimap(ctx, track.innerBoundary.controlPoints, offsetX, offsetY, scale);

    for (const ship of ships) {
      const isPlayer = ship.id === playerShipId;
      const px = offsetX + ship.position.x * scale;
      const py = offsetY + ship.position.y * scale;

      ctx.fillStyle = isPlayer ? '#f9ca24' : SHIP_COLORS[ship.colorIndex];
      ctx.beginPath();
      ctx.arc(px, py, isPlayer ? 5 : 3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
    ctx.restore();
  }

  private drawBezierForMinimap(
    ctx: CanvasRenderingContext2D,
    points: { x: number; y: number }[],
    offsetX: number,
    offsetY: number,
    scale: number
  ): void {
    if (points.length < 4) return;

    ctx.beginPath();
    ctx.moveTo(offsetX + points[0].x * scale, offsetY + points[0].y * scale);

    for (let i = 1; i < points.length - 1; i += 3) {
      if (i + 2 < points.length) {
        ctx.bezierCurveTo(
          offsetX + points[i].x * scale,
          offsetY + points[i].y * scale,
          offsetX + points[i + 1].x * scale,
          offsetY + points[i + 1].y * scale,
          offsetX + points[i + 2].x * scale,
          offsetY + points[i + 2].y * scale
        );
      }
    }

    ctx.stroke();
  }

  drawCountdown(countdown: number): void {
    const ctx = this.ctx;
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 120px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#4ecdc4';
    ctx.shadowBlur = 30;
    
    const text = countdown > 0 ? Math.ceil(countdown).toString() : 'GO!';
    ctx.fillText(text, this.canvas.width / 2, this.canvas.height / 2);
    
    ctx.shadowBlur = 0;
  }

  drawHUD(
    playerShip: Ship | null,
    totalLaps: number,
    currentTime: number
  ): void {
    if (!playerShip) return;

    const ctx = this.ctx;
    const padding = 20;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.beginPath();
    ctx.roundRect(padding, padding, 200, 100, 8);
    ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`圈数: ${playerShip.lap} / ${totalLaps}`, padding + 15, padding + 30);

    const lapTime = currentTime - playerShip.lapStartTime;
    ctx.font = '24px monospace';
    ctx.fillStyle = '#4ecdc4';
    ctx.fillText(this.formatTime(lapTime), padding + 15, padding + 60);

    if (playerShip.bestLapTime) {
      ctx.font = '14px Arial';
      ctx.fillStyle = '#f9ca24';
      ctx.fillText(`最佳: ${this.formatTime(playerShip.bestLapTime)}`, padding + 15, padding + 85);
    }

    const shieldBarWidth = 180;
    const shieldBarHeight = 12;
    const shieldBarY = this.canvas.height - padding - 40;
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.beginPath();
    ctx.roundRect(this.canvas.width - padding - shieldBarWidth - 20, shieldBarY - 10, shieldBarWidth + 20, 50, 8);
    ctx.fill();

    const shieldRatio = playerShip.shield / playerShip.maxShield;
    const shieldColor = shieldRatio > 0.5 ? '#2ed573' : shieldRatio > 0.25 ? '#ffa502' : '#ff4757';
    
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.fillRect(this.canvas.width - padding - shieldBarWidth, shieldBarY + 20, shieldBarWidth, shieldBarHeight);
    
    ctx.fillStyle = shieldColor;
    ctx.fillRect(this.canvas.width - padding - shieldBarWidth, shieldBarY + 20, shieldBarWidth * shieldRatio, shieldBarHeight);

    ctx.fillStyle = '#fff';
    ctx.font = '12px Arial';
    ctx.textAlign = 'right';
    ctx.fillText('护盾', this.canvas.width - padding, shieldBarY + 10);

    if (playerShip.item) {
      const itemSize = 50;
      const itemX = this.canvas.width - padding - itemSize;
      const itemY = this.canvas.height - padding - itemSize - 60;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.beginPath();
      ctx.roundRect(itemX - 5, itemY - 5, itemSize + 10, itemSize + 10, 8);
      ctx.fill();

      const itemColors: Record<string, string> = {
        shield: '#2ed573',
        boost: '#ffa502',
        missile: '#ff4757',
        mine: '#5352ed',
        emp: '#a29bfe'
      };
      const itemIcons: Record<string, string> = {
        shield: '🛡',
        boost: '⚡',
        missile: '🚀',
        mine: '💣',
        emp: '⚡'
      };

      ctx.fillStyle = itemColors[playerShip.item] || '#fff';
      ctx.shadowColor = itemColors[playerShip.item] || '#fff';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(itemX + itemSize / 2, itemY + itemSize / 2, itemSize / 2 - 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.fillStyle = '#fff';
      ctx.font = '20px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(itemIcons[playerShip.item] || '?', itemX + itemSize / 2, itemY + itemSize / 2);

      ctx.fillStyle = '#fff';
      ctx.font = '10px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('空格使用', itemX + itemSize / 2, itemY + itemSize + 12);
    }
  }

  private formatTime(ms: number): string {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const milliseconds = Math.floor((ms % 1000) / 10);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
  }

  drawResults(ships: Ship[], playerShipId: string | null): void {
    const ctx = this.ctx;
    const width = 500;
    const height = 400;
    const x = (this.canvas.width - width) / 2;
    const y = (this.canvas.height - height) / 2;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 12);
    ctx.fill();

    ctx.strokeStyle = '#4ecdc4';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 28px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('比赛结果', this.canvas.width / 2, y + 40);

    const sortedShips = [...ships].sort((a, b) => {
      if (a.finished && b.finished) return (a.finishTime || 0) - (b.finishTime || 0);
      if (a.finished) return -1;
      if (b.finished) return 1;
      return 0;
    });

    const startY = y + 70;
    const rowHeight = 45;

    for (let i = 0; i < sortedShips.length; i++) {
      const ship = sortedShips[i];
      const rowY = startY + i * rowHeight;
      const isPlayer = ship.id === playerShipId;

      if (isPlayer) {
        ctx.fillStyle = 'rgba(249, 202, 36, 0.2)';
        ctx.fillRect(x + 10, rowY - 5, width - 20, rowHeight - 5);
      }

      ctx.fillStyle = i < 3 ? '#f9ca24' : '#fff';
      ctx.font = 'bold 18px Arial';
      ctx.textAlign = 'left';
      ctx.fillText(`${i + 1}.`, x + 25, rowY + 20);

      ctx.fillStyle = SHIP_COLORS[ship.colorIndex];
      ctx.fillRect(x + 60, rowY + 8, 12, 20);

      ctx.fillStyle = isPlayer ? '#f9ca24' : '#fff';
      ctx.font = '16px Arial';
      ctx.fillText(ship.playerName, x + 85, rowY + 22);

      if (ship.finishTime) {
        ctx.fillStyle = '#4ecdc4';
        ctx.font = '16px monospace';
        ctx.textAlign = 'right';
        ctx.fillText(this.formatTime(ship.finishTime), x + width - 25, rowY + 22);
      } else {
        ctx.fillStyle = '#888';
        ctx.font = '14px Arial';
        ctx.textAlign = 'right';
        ctx.fillText('未完成', x + width - 25, rowY + 22);
      }

      if (ship.bestLapTime) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.font = '11px Arial';
        ctx.textAlign = 'right';
        ctx.fillText(`最佳: ${this.formatTime(ship.bestLapTime)}`, x + width - 25, rowY + 38);
      }
    }

    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('按 ESC 返回大厅', this.canvas.width / 2, y + height - 25);
  }
}
