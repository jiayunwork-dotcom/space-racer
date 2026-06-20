import type { Ship, InputState, EnvElement, Vector2 } from '../types/game';
import { ENGINE_CONFIGS, PHYSICS_CONFIG } from '../types/game';
import { vecAdd, vecSub, vecMul, vecDiv, vecLength, vecNormalize, vecDot, vecReflect, vecDistance, vecDistanceSq, vec2 } from '../utils/vector';
import type { BezierSample } from '../utils/bezier';
import { getTrackBoundaryCollision } from '../utils/bezier';

export interface CollisionResult {
  collided: boolean;
  normal: Vector2;
  pushOut: Vector2;
}

export function updateShipPhysics(
  ship: Ship,
  input: InputState,
  envElements: EnvElement[],
  outerSamples: BezierSample[],
  innerSamples: BezierSample[],
  otherShips: Ship[],
  dt: number,
  currentTime: number
): { shieldDamaged: boolean; boundaryHit: boolean } {
  if (ship.finished || ship.isRespawning) {
    return { shieldDamaged: false, boundaryHit: false };
  }

  const isStunned = currentTime < ship.stunnedUntil;
  const isSlowdown = currentTime < ship.slowdownUntil;
  const hasBoost = currentTime < ship.boostEndTime;

  const config = ENGINE_CONFIGS[ship.engineType];
  const thrustMultiplier = hasBoost ? PHYSICS_CONFIG.boostMultiplier : 1;

  if (!isStunned) {
    if (input.thrust) {
      const thrustForce = config.thrust * thrustMultiplier;
      const acceleration = thrustForce / config.mass;
      const forward = vec2(Math.cos(ship.angle), Math.sin(ship.angle));
      ship.velocity = vecAdd(ship.velocity, vecMul(forward, acceleration * dt));
    }

    if (input.left) {
      ship.angularVelocity -= config.angularSpeed * dt;
    }
    if (input.right) {
      ship.angularVelocity += config.angularSpeed * dt;
    }
  }

  ship.angularVelocity *= config.angularDamping;
  ship.angle += ship.angularVelocity * dt;

  for (const env of envElements) {
    if (env.type === 'gravityWell') {
      const dist = vecDistance(ship.position, env.position);
      if (dist < env.radius * 3 && dist > 10) {
        const strength = env.strength || PHYSICS_CONFIG.gravityStrength;
        const forceMagnitude = strength / (dist * dist);
        const direction = vecNormalize(vecSub(env.position, ship.position));
        const force = vecMul(direction, forceMagnitude);
        ship.velocity = vecAdd(ship.velocity, vecDiv(force, config.mass));
      }
    }
  }

  const drag = 1 - PHYSICS_CONFIG.linearDrag * dt;
  ship.velocity = vecMul(ship.velocity, drag);

  if (isSlowdown) {
    const slowdownFactor = PHYSICS_CONFIG.slowdownFactor;
    const targetSpeed = vecLength(ship.velocity) * slowdownFactor;
    const dir = vecNormalize(ship.velocity);
    ship.velocity = vecMul(dir, targetSpeed);
  }

  const maxSpeed = config.maxSpeed;
  const speed = vecLength(ship.velocity);
  if (speed > maxSpeed) {
    const dir = vecNormalize(ship.velocity);
    ship.velocity = vecMul(dir, maxSpeed);
  }

  const oldPosition = { ...ship.position };
  ship.position = vecAdd(ship.position, vecMul(ship.velocity, dt));

  let boundaryHit = false;
  let shieldDamaged = false;

  const collision = getTrackBoundaryCollision(
    ship.position,
    PHYSICS_CONFIG.shipRadius,
    outerSamples,
    innerSamples
  );

  if (collision.collided) {
    boundaryHit = true;
    ship.position = vecAdd(ship.position, collision.pushOut);
    
    const normal = collision.normal;
    const velocityDotNormal = vecDot(ship.velocity, normal);
    
    if (velocityDotNormal < 0) {
      const reflected = vecReflect(ship.velocity, normal);
      const energyLoss = PHYSICS_CONFIG.elasticCollisionEnergyLoss;
      ship.velocity = vecMul(reflected, Math.sqrt(energyLoss));
    }
    
    ship.shield -= PHYSICS_CONFIG.shieldDamageBoundary;
    shieldDamaged = true;
  }

  for (const env of envElements) {
    if (env.type === 'asteroid') {
      const distSq = vecDistanceSq(ship.position, env.position);
      const minDist = PHYSICS_CONFIG.shipRadius + env.radius;
      
      if (distSq < minDist * minDist) {
        const dist = Math.sqrt(distSq);
        const normal = dist > 0 ? vecNormalize(vecSub(ship.position, env.position)) : vec2(0, -1);
        const pushAmount = minDist - dist;
        ship.position = vecAdd(ship.position, vecMul(normal, pushAmount));
        
        const velocityDotNormal = vecDot(ship.velocity, normal);
        if (velocityDotNormal < 0) {
          const reflected = vecReflect(ship.velocity, normal);
          const energyLoss = PHYSICS_CONFIG.elasticCollisionEnergyLoss;
          ship.velocity = vecMul(reflected, Math.sqrt(energyLoss));
        }
        
        ship.shield -= PHYSICS_CONFIG.shieldDamageBoundary;
        shieldDamaged = true;
      }
    }
  }

  for (const env of envElements) {
    if (env.type === 'speedBoost') {
      const dist = vecDistance(ship.position, env.position);
      if (dist < env.radius) {
        const speed = vecLength(ship.velocity);
        if (speed > 0) {
          const dir = vecNormalize(ship.velocity);
          ship.velocity = vecMul(dir, speed * PHYSICS_CONFIG.speedBoostFactor);
        }
      }
    }
    if (env.type === 'slowdown') {
      const dist = vecDistance(ship.position, env.position);
      if (dist < env.radius) {
        const speed = vecLength(ship.velocity);
        if (speed > 0) {
          const dir = vecNormalize(ship.velocity);
          ship.velocity = vecMul(dir, speed * PHYSICS_CONFIG.slowdownFactor);
        }
      }
    }
  }

  if (ship.shield <= 0) {
    ship.isRespawning = true;
    ship.respawnTime = PHYSICS_CONFIG.respawnTime;
    ship.position = { ...ship.lastCheckpointPos };
    ship.velocity = vec2(0, 0);
    ship.angularVelocity = 0;
    ship.shield = ship.maxShield;
  }

  return { shieldDamaged, boundaryHit };
}

export function getShipShipCollision(shipA: Ship, shipB: Ship, radius: number): CollisionResult {
  const distSq = vecDistanceSq(shipA.position, shipB.position);
  const minDist = radius * 2;

  if (distSq < minDist * minDist) {
    const dist = Math.sqrt(distSq);
    if (dist === 0) {
      return {
        collided: true,
        normal: { x: 0, y: -1 },
        pushOut: { x: 0, y: -minDist }
      };
    }

    const normal = vecNormalize(vecSub(shipB.position, shipA.position));
    const overlap = minDist - dist;

    return {
      collided: true,
      normal,
      pushOut: vecMul(normal, overlap * 0.5)
    };
  }

  return {
    collided: false,
    normal: { x: 0, y: 0 },
    pushOut: { x: 0, y: 0 }
  };
}
