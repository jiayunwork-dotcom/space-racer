import type { Track, Vector2, EnvElement, Checkpoint, ItemSpawner } from '../types/game';
import { v4 as uuidv4 } from 'uuid';
import { createCircleControlPoints } from '../utils/bezier';
import { vec2 } from '../utils/vector';

function createCheckpoints(
  positions: { pos: Vector2; dir: number }[]
): Checkpoint[] {
  return positions.map((p, i) => ({
    id: uuidv4(),
    position: p.pos,
    direction: p.dir,
    index: i
  }));
}

function createItemSpawners(positions: Vector2[]): ItemSpawner[] {
  return positions.map(pos => ({
    id: uuidv4(),
    position: pos,
    lastSpawn: 0,
    currentItem: null,
    cooldown: 15
  }));
}

export function createBeginnerTrack(): Track {
  const center = vec2(800, 600);
  const outerRadius = 350;
  const innerRadius = 250;

  const outerPoints = createCircleControlPoints(center, outerRadius, 8);
  const innerPoints = createCircleControlPoints(center, innerRadius, 8);

  const checkpoints: { pos: Vector2; dir: number }[] = [
    { pos: vec2(800, 600 - (outerRadius + innerRadius) / 2), dir: Math.PI / 2 },
    { pos: vec2(800 + (outerRadius + innerRadius) / 2, 600), dir: Math.PI },
    { pos: vec2(800, 600 + (outerRadius + innerRadius) / 2), dir: -Math.PI / 2 },
    { pos: vec2(800 - (outerRadius + innerRadius) / 2, 600), dir: 0 }
  ];

  const midRadius = (outerRadius + innerRadius) / 2;
  const envElements: EnvElement[] = [];

  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2 + Math.PI / 6;
    envElements.push({
      id: uuidv4(),
      type: 'speedBoost',
      position: vec2(
        center.x + Math.cos(angle) * midRadius,
        center.y + Math.sin(angle) * midRadius
      ),
      radius: 40
    });
  }

  const itemPositions: Vector2[] = [
    vec2(center.x + 50, center.y - midRadius + 20),
    vec2(center.x + midRadius - 20, center.y + 50),
    vec2(center.x - 50, center.y + midRadius - 20),
    vec2(center.x - midRadius + 20, center.y - 50)
  ];

  return {
    id: 'beginner-circle',
    name: '新手环形赛道',
    author: 'System',
    isBuiltIn: true,
    outerBoundary: { controlPoints: outerPoints },
    innerBoundary: { controlPoints: innerPoints },
    checkpoints: createCheckpoints(checkpoints),
    envElements,
    itemSpawners: createItemSpawners(itemPositions),
    startPosition: vec2(800, 600 - (outerRadius + innerRadius) / 2),
    startAngle: Math.PI / 2,
    playCount: 0,
    createdAt: Date.now()
  };
}

export function createAsteroidMazeTrack(): Track {
  const center = vec2(900, 600);
  const outerRadius = 400;
  const innerRadius = 180;

  const outerPoints = createCircleControlPoints(center, outerRadius, 12);
  
  const innerPoints: Vector2[] = [];
  const innerSegments = 10;
  const controlOffset = innerRadius * 0.55;
  
  for (let i = 0; i < innerSegments; i++) {
    const angle = (i / innerSegments) * Math.PI * 2 - Math.PI / 2;
    const wobble = Math.sin(angle * 3) * 30;
    const r = innerRadius + wobble;
    const nextAngle = ((i + 1) / innerSegments) * Math.PI * 2 - Math.PI / 2;
    const nextWobble = Math.sin(nextAngle * 3) * 30;
    const nextR = innerRadius + nextWobble;

    const startPoint = vec2(
      center.x + Math.cos(angle) * r,
      center.y + Math.sin(angle) * r
    );

    const endPoint = vec2(
      center.x + Math.cos(nextAngle) * nextR,
      center.y + Math.sin(nextAngle) * nextR
    );

    const startTangent = vec2(
      -Math.sin(angle) * controlOffset,
      Math.cos(angle) * controlOffset
    );

    const endTangent = vec2(
      -Math.sin(nextAngle) * controlOffset,
      Math.cos(nextAngle) * controlOffset
    );

    if (i === 0) {
      innerPoints.push(startPoint);
    }
    innerPoints.push(vec2(startPoint.x + startTangent.x, startPoint.y + startTangent.y));
    innerPoints.push(vec2(endPoint.x - endTangent.x, endPoint.y - endTangent.y));
    if (i === innerSegments - 1) {
      innerPoints.push(endPoint);
    }
  }

  const midRadius = (outerRadius + innerRadius) / 2;
  const checkpoints: { pos: Vector2; dir: number }[] = [
    { pos: vec2(900, 600 - midRadius + 20), dir: Math.PI / 2 },
    { pos: vec2(900 + midRadius - 30, 600 - 100), dir: Math.PI * 0.7 },
    { pos: vec2(900 + midRadius - 50, 600 + 150), dir: Math.PI * 0.85 },
    { pos: vec2(900, 600 + midRadius - 20), dir: -Math.PI / 2 },
    { pos: vec2(900 - midRadius + 30, 600 + 100), dir: 0.15 * Math.PI },
    { pos: vec2(900 - midRadius + 50, 600 - 150), dir: -0.3 * Math.PI }
  ];

  const envElements: EnvElement[] = [];
  
  const asteroidPositions = [
    { x: 900 + 150, y: 600 - 200, r: 25 },
    { x: 900 + 200, y: 600 + 50, r: 30 },
    { x: 900 - 180, y: 600 + 180, r: 22 },
    { x: 900 - 100, y: 600 - 250, r: 28 },
    { x: 900 + 50, y: 600 + 250, r: 20 },
    { x: 900 - 220, y: 600 - 50, r: 26 },
    { x: 900 + 280, y: 600 - 100, r: 18 },
    { x: 900 - 250, y: 600 + 200, r: 24 }
  ];

  for (const ast of asteroidPositions) {
    envElements.push({
      id: uuidv4(),
      type: 'asteroid',
      position: vec2(ast.x, ast.y),
      radius: ast.r
    });
  }

  const itemPositions: Vector2[] = [
    vec2(900 + 100, 600 - midRadius + 40),
    vec2(900 + midRadius - 60, 600),
    vec2(900 + 80, 600 + midRadius - 40),
    vec2(900 - 120, 600 + midRadius - 30),
    vec2(900 - midRadius + 40, 600 + 50),
    vec2(900 - 80, 600 - midRadius + 50)
  ];

  return {
    id: 'asteroid-maze',
    name: '小行星迷宫赛道',
    author: 'System',
    isBuiltIn: true,
    outerBoundary: { controlPoints: outerPoints },
    innerBoundary: { controlPoints: innerPoints },
    checkpoints: createCheckpoints(checkpoints),
    envElements,
    itemSpawners: createItemSpawners(itemPositions),
    startPosition: vec2(900, 600 - midRadius + 20),
    startAngle: Math.PI / 2,
    playCount: 0,
    createdAt: Date.now()
  };
}

export function createGravitySlingshotTrack(): Track {
  const center = vec2(900, 600);
  const outerRadius = 420;
  const innerRadius = 200;

  const outerPoints = createCircleControlPoints(center, outerRadius, 10);
  const innerPoints = createCircleControlPoints(center, innerRadius, 10);

  const midRadius = (outerRadius + innerRadius) / 2;
  const checkpoints: { pos: Vector2; dir: number }[] = [
    { pos: vec2(900, 600 - midRadius + 10), dir: Math.PI / 2 },
    { pos: vec2(900 + midRadius * 0.7, 600 - midRadius * 0.7), dir: Math.PI * 0.75 },
    { pos: vec2(900 + midRadius - 20, 600), dir: Math.PI },
    { pos: vec2(900 + midRadius * 0.7, 600 + midRadius * 0.7), dir: Math.PI * 1.25 },
    { pos: vec2(900, 600 + midRadius - 10), dir: -Math.PI / 2 },
    { pos: vec2(900 - midRadius * 0.7, 600 + midRadius * 0.7), dir: -Math.PI * 1.25 },
    { pos: vec2(900 - midRadius + 20, 600), dir: 0 },
    { pos: vec2(900 - midRadius * 0.7, 600 - midRadius * 0.7), dir: -Math.PI * 0.75 }
  ];

  const envElements: EnvElement[] = [];

  envElements.push({
    id: uuidv4(),
    type: 'gravityWell',
    position: vec2(900 + 280, 600 - 150),
    radius: 100,
    strength: 100000
  });

  envElements.push({
    id: uuidv4(),
    type: 'gravityWell',
    position: vec2(900 - 280, 600 + 150),
    radius: 100,
    strength: 100000
  });

  envElements.push({
    id: uuidv4(),
    type: 'slowdown',
    position: vec2(900, 600 + midRadius - 60),
    radius: 60
  });

  envElements.push({
    id: uuidv4(),
    type: 'speedBoost',
    position: vec2(900, 600 - midRadius + 50),
    radius: 40
  });

  const itemPositions: Vector2[] = [
    vec2(900 + 100, 600 - midRadius + 30),
    vec2(900 + midRadius - 40, 600 - 80),
    vec2(900 + midRadius - 60, 600 + 100),
    vec2(900 - 80, 600 + midRadius - 40),
    vec2(900 - midRadius + 40, 600 + 80),
    vec2(900 - midRadius + 50, 600 - 100)
  ];

  return {
    id: 'gravity-slingshot',
    name: '引力弹弓赛道',
    author: 'System',
    isBuiltIn: true,
    outerBoundary: { controlPoints: outerPoints },
    innerBoundary: { controlPoints: innerPoints },
    checkpoints: createCheckpoints(checkpoints),
    envElements,
    itemSpawners: createItemSpawners(itemPositions),
    startPosition: vec2(900, 600 - midRadius + 10),
    startAngle: Math.PI / 2,
    playCount: 0,
    createdAt: Date.now()
  };
}

export function getBuiltInTracks(): Track[] {
  return [
    createBeginnerTrack(),
    createAsteroidMazeTrack(),
    createGravitySlingshotTrack()
  ];
}
