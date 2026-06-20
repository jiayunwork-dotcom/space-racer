import type { Ship, ItemType, ItemSpawner, Projectile, Mine, Vector2, EnvElement } from '../types/game';
import { PHYSICS_CONFIG } from '../types/game';
import { v4 as uuidv4 } from 'uuid';
import { vec2, vecDistance, vecNormalize, vecSub, vecAdd, vecMul, vecLength } from '../utils/vector';

const ITEM_TYPES: ItemType[] = ['shield', 'boost', 'missile', 'mine', 'emp'];

export function getRandomItem(): ItemType {
  return ITEM_TYPES[Math.floor(Math.random() * ITEM_TYPES.length)];
}

export function updateItemSpawners(
  spawners: ItemSpawner[],
  currentTime: number
): void {
  for (const spawner of spawners) {
    if (!spawner.currentItem && currentTime - spawner.lastSpawn >= spawner.cooldown * 1000) {
      spawner.currentItem = getRandomItem();
    }
  }
}

export function checkItemPickup(
  ship: Ship,
  spawners: ItemSpawner[]
): ItemType | null {
  if (ship.item || ship.isRespawning || ship.finished) return null;

  for (const spawner of spawners) {
    if (!spawner.currentItem) continue;

    const dist = vecDistance(ship.position, spawner.position);
    if (dist < PHYSICS_CONFIG.shipRadius + 20) {
      const item = spawner.currentItem;
      ship.item = item;
      spawner.currentItem = null;
      spawner.lastSpawn = Date.now();
      return item;
    }
  }

  return null;
}

export function useItem(
  ship: Ship,
  allShips: Ship[],
  projectiles: Projectile[],
  mines: Mine[],
  currentTime: number
): boolean {
  if (!ship.item || ship.isRespawning || ship.finished) return false;

  const item = ship.item;
  ship.item = null;
  ship.itemUses++;

  switch (item) {
    case 'shield':
      ship.shield = Math.min(ship.shield + 50, ship.maxShield);
      break;

    case 'boost':
      ship.boostEndTime = currentTime + PHYSICS_CONFIG.boostDuration * 1000;
      break;

    case 'missile': {
      const forward = vec2(Math.cos(ship.angle), Math.sin(ship.angle));
      const startPos = vecAdd(ship.position, vecMul(forward, PHYSICS_CONFIG.shipRadius + 10));
      
      let closestTarget: Ship | null = null;
      let closestDist = Infinity;
      const forwardAngle = ship.angle;
      
      for (const other of allShips) {
        if (other.id === ship.id || other.finished || other.isRespawning) continue;
        
        const dist = vecDistance(ship.position, other.position);
        if (dist > 600) continue;
        
        const angleToTarget = Math.atan2(
          other.position.y - ship.position.y,
          other.position.x - ship.position.x
        );
        let angleDiff = Math.abs(angleToTarget - forwardAngle);
        if (angleDiff > Math.PI) angleDiff = Math.PI * 2 - angleDiff;
        
        if (angleDiff < Math.PI / 3 && dist < closestDist) {
          closestDist = dist;
          closestTarget = other;
        }
      }

      const missile: Projectile = {
        id: uuidv4(),
        type: 'missile',
        position: startPos,
        velocity: vecMul(forward, PHYSICS_CONFIG.missileSpeed),
        ownerId: ship.id,
        targetId: closestTarget?.id || null,
        lifetime: PHYSICS_CONFIG.missileLifetime
      };

      projectiles.push(missile);
      break;
    }

    case 'mine': {
      const mine: Mine = {
        id: uuidv4(),
        position: { ...ship.position },
        ownerId: ship.id
      };
      mines.push(mine);
      break;
    }

    case 'emp': {
      for (const other of allShips) {
        if (other.id === ship.id || other.finished || other.isRespawning) continue;
        
        const dist = vecDistance(ship.position, other.position);
        if (dist < PHYSICS_CONFIG.empRadius) {
          other.stunnedUntil = currentTime + PHYSICS_CONFIG.empStunDuration * 1000;
        }
      }
      break;
    }
  }

  return true;
}

export function updateProjectiles(
  projectiles: Projectile[],
  ships: Ship[],
  dt: number,
  currentTime: number
): { hitShips: string[]; removedProjectiles: string[] } {
  const hitShips: string[] = [];
  const removedProjectiles: string[] = [];

  for (let i = projectiles.length - 1; i >= 0; i--) {
    const proj = projectiles[i];

    if (proj.type === 'missile') {
      if (proj.targetId) {
        const target = ships.find(s => s.id === proj.targetId);
        if (target && !target.finished && !target.isRespawning) {
          const toTarget = vecNormalize(vecSub(target.position, proj.position));
          const currentSpeed = vecLength(proj.velocity);
          const turnRate = 0.1;
          const newDir = vecNormalize({
            x: proj.velocity.x / currentSpeed * (1 - turnRate) + toTarget.x * turnRate,
            y: proj.velocity.y / currentSpeed * (1 - turnRate) + toTarget.y * turnRate
          });
          proj.velocity = vecMul(newDir, currentSpeed);
        }
      }
    }

    proj.position = vecAdd(proj.position, vecMul(proj.velocity, dt));
    proj.lifetime -= dt;

    if (proj.lifetime <= 0) {
      removedProjectiles.push(proj.id);
      projectiles.splice(i, 1);
      continue;
    }

    for (const ship of ships) {
      if (ship.id === proj.ownerId || ship.finished || ship.isRespawning) continue;

      const dist = vecDistance(proj.position, ship.position);
      if (dist < PHYSICS_CONFIG.shipRadius + 8) {
        ship.shield -= PHYSICS_CONFIG.missileDamage;
        ship.slowdownUntil = currentTime + PHYSICS_CONFIG.missileSlowDuration * 1000;
        hitShips.push(ship.id);
        removedProjectiles.push(proj.id);
        projectiles.splice(i, 1);
        break;
      }
    }
  }

  return { hitShips, removedProjectiles };
}

export function updateMines(
  mines: Mine[],
  ships: Ship[]
): { triggered: string[]; hitShips: string[] } {
  const triggered: string[] = [];
  const hitShips: string[] = [];

  for (let i = mines.length - 1; i >= 0; i--) {
    const mine = mines[i];

    for (const ship of ships) {
      if (ship.id === mine.ownerId || ship.finished || ship.isRespawning) continue;

      const dist = vecDistance(mine.position, ship.position);
      if (dist < PHYSICS_CONFIG.mineRadius + PHYSICS_CONFIG.shipRadius) {
        ship.shield -= PHYSICS_CONFIG.mineDamage;
        hitShips.push(ship.id);
        triggered.push(mine.id);
        mines.splice(i, 1);
        break;
      }
    }
  }

  return { triggered, hitShips };
}
