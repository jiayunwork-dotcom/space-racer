import type { Ship, InputState, EnvElement, Vector2 } from '../types/game';
import { ENGINE_CONFIGS, PHYSICS_CONFIG } from '../types/game';
import { vecAdd, vecSub, vecMul, vecDiv, vecLength, vecNormalize, vecDot, vecReflect, vecDistance, vecDistanceSq, vec2 } from '../utils/vector';
import type { BezierSample } from '../utils/bezier';
import { getTrackBoundaryCollision } from '../utils/bezier';

export function updateShipPhysics(
  ship: Ship,
  input: InputState,
  dt: number,
  currentTime: number,
  envElements: EnvElement[],
  outerSamples: BezierSample[],
  innerSamples: BezierSample[]
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

export function updateShipCollisions(ships: Ship[]): void {
  const radius = PHYSICS_CONFIG.shipRadius;
  const diameter = radius * 2;

  for (let i = 0; i < ships.length; i++) {
    for (let j = i + 1; j < ships.length; j++) {
      const shipA = ships[i];
      const shipB = ships[j];

      if (shipA.finished || shipB.finished) continue;
      if (shipA.isRespawning || shipB.isRespawning) continue;

      const distSq = vecDistanceSq(shipA.position, shipB.position);

      if (distSq < diameter * diameter) {
        const dist = Math.sqrt(distSq);
        if (dist === 0) continue;

        const normal = vecNormalize(vecSub(shipB.position, shipA.position));
        const overlap = diameter - dist;

        const configA = ENGINE_CONFIGS[shipA.engineType];
        const configB = ENGINE_CONFIGS[shipB.engineType];
        const totalMass = configA.mass + configB.mass;

        shipA.position = vecSub(shipA.position, vecMul(normal, overlap * (configB.mass / totalMass)));
        shipB.position = vecAdd(shipB.position, vecMul(normal, overlap * (configA.mass / totalMass)));

        const relVel = vecSub(shipB.velocity, shipA.velocity);
        const velAlongNormal = vecDot(relVel, normal);

        if (velAlongNormal < 0) {
          const restitution = PHYSICS_CONFIG.elasticCollisionEnergyLoss;
          const impulse = -(1 + restitution) * velAlongNormal / (1 / configA.mass + 1 / configB.mass);
          const impulseVec = vecMul(normal, impulse);

          shipA.velocity = vecSub(shipA.velocity, vecDiv(impulseVec, configA.mass));
          shipB.velocity = vecAdd(shipB.velocity, vecDiv(impulseVec, configB.mass));

          const impactSpeed = Math.abs(velAlongNormal);
          const damageFactor = impactSpeed / 200;
          const damage = PHYSICS_CONFIG.shieldDamageShipCollision * Math.min(damageFactor, 1.5);

          shipA.shield -= damage;
          shipB.shield -= damage;
        }
      }
    }
  }
}
