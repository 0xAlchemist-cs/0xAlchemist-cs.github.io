/*!
 * Motion and drawing adapted from canvas-nest.js (MIT), Copyright (c) 2015 Hust.cc.
 * https://github.com/hustcc/canvas-nest.js
 * Full license: /third-party-notices.txt
 */
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface Position {
  x: number;
  y: number;
}

const particleRangeSquared = 6000;
const cursorRangeSquared = 20000;
const captureRadius = 220;
const collectedRadius = 76;
const maximumSpokes = 18;
const frameDuration = 1000 / 60;
const contentSurfaces =
  '.article-card, .project-card, .hero, .side-panel, .article-paper, .paper, .toc, .empty-state, .topic-card, .archive-row, .search-container, img, video, a, button, input, textarea, select, [data-background-static]';

function influence(radius: number) {
  const t = Math.max(0, Math.min(1, (captureRadius - radius) / 32));
  return t * t * (3 - 2 * t);
}

export function followCursor(
  current: Position | null,
  target: Position | null,
  step = 1,
) {
  if (!target) return null;
  if (!current) return { ...target };
  const blend = -Math.expm1((-frameDuration * step) / 12);
  current.x += (target.x - current.x) * blend;
  current.y += (target.y - current.y) * blend;
  return current;
}

export function advanceParticle(
  p: Particle,
  width: number,
  height: number,
  step = 1,
) {
  p.x += p.vx * step;
  p.y += p.vy * step;
  if ((p.x < 0 && p.vx < 0) || (p.x > width && p.vx > 0)) p.vx *= -1;
  if ((p.y < 0 && p.vy < 0) || (p.y > height && p.vy > 0)) p.vy *= -1;
}

export function attractParticle(p: Particle, cursor: Position, step = 1) {
  const dx = p.x - cursor.x;
  const dy = p.y - cursor.y;
  const squared = dx * dx + dy * dy;
  const radius = Math.sqrt(squared);
  if (radius <= collectedRadius || radius >= captureRadius) return squared;
  // A continuous, bounded inward force acts on every nearby real particle.
  // Interior nodes keep drifting; no circle slots, cohort lock or position snap.
  const pull =
    Math.min(
      0.24 * step,
      (radius - collectedRadius) * -Math.expm1(-0.06 * step),
    ) * influence(radius);
  p.x -= (dx / radius) * pull;
  p.y -= (dy / radius) * pull;
  return squared;
}

export function advanceParticles(
  points: Particle[],
  width: number,
  height: number,
  cursor: Position | null,
  step = 1,
  strength = 1,
) {
  for (let remaining = step; remaining > 0; remaining -= 1) {
    const delta = Math.min(remaining, 1);
    for (const point of points) {
      const weight = cursor
        ? influence(Math.hypot(point.x - cursor.x, point.y - cursor.y)) *
          Math.min(1, strength * 6)
        : 0;
      // Slow the original drift inside the field so outward velocity cannot
      // overpower attraction while the inward pull is still building. Braking
      // engages sooner than gathering; release restores the original drift.
      advanceParticle(point, width, height, delta * (1 - 0.88 * weight));
      if (cursor) attractParticle(point, cursor, delta * strength);
    }
  }
}

export function createParticleSimulation() {
  const members = new Set<Particle>();
  let center: Position | null = null;
  let strength = 0;
  function reset() {
    members.clear();
    center = null;
    strength = 0;
  }
  return {
    members,
    get center() {
      return center;
    },
    get strength() {
      return strength;
    },
    reset,
    advance(
      points: Particle[],
      width: number,
      height: number,
      cursor: Position | null,
      step = 1,
    ) {
      if (cursor && step > 0) {
        const start = center ?? cursor;
        const dx = cursor.x - start.x;
        const dy = cursor.y - start.y;
        const speed = Math.hypot(dx, dy) / step;
        const target = 1 / (1 + (speed / 1.5) ** 2);
        // Integrate the field and cursor path together, including low refresh
        // rates. Moving releases quickly; stillness brings attraction in slowly.
        let elapsed = 0;
        while (elapsed < step) {
          const delta = Math.min(0.5, step - elapsed);
          elapsed += delta;
          const response = target < strength ? 45 : 700;
          strength +=
            (target - strength) *
            -Math.expm1((-frameDuration * delta) / response);
          advanceParticles(
            points,
            width,
            height,
            {
              x: start.x + (dx * elapsed) / step,
              y: start.y + (dy * elapsed) / step,
            },
            delta,
            strength,
          );
        }
      } else if (!cursor) {
        strength = 0;
        advanceParticles(points, width, height, null, step);
      }
      center = cursor ? { ...cursor } : null;
      members.clear();
      if (cursor)
        for (const point of points)
          if (
            Math.hypot(point.x - cursor.x, point.y - cursor.y) < captureRadius
          )
            members.add(point);
    },
  };
}

export function createParticleRenderer(ctx: CanvasRenderingContext2D) {
  const levels = 32;
  const near: boolean[] = [];
  const neighbours: number[][] = [];
  const spokes: number[] = [];
  const spokeVisibility: number[] = [];
  let edgeVisibility = new Float32Array(0);
  const buckets = Array.from({ length: levels }, (_, index) => {
    const strength = (index + 0.5) / levels;
    return {
      coordinates: [] as number[],
      used: 0,
      width: strength * 1.25,
      color: `rgba(0,0,255,${strength + 0.2})`,
    };
  });
  function squared(a: Position, b: Position) {
    return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  }
  function line(
    a: Position,
    b: Position,
    distance: number,
    range: number,
    visibility = 1,
  ) {
    const strength = ((range - distance) / range) * visibility;
    if (strength <= 0.001) return;
    const bucket =
      buckets[Math.min(levels - 1, Math.floor(strength * levels))]!;
    bucket.coordinates[bucket.used++] = a.x;
    bucket.coordinates[bucket.used++] = a.y;
    bucket.coordinates[bucket.used++] = b.x;
    bucket.coordinates[bucket.used++] = b.y;
  }
  return function render(
    points: Particle[],
    width: number,
    height: number,
    cursor: Position | null,
    motion: { step?: number; strength?: number } = {},
  ) {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#000';
    ctx.globalAlpha = 1;
    spokes.length = maximumSpokes;
    spokes.fill(-1);
    const blend = -Math.expm1(-(motion.step ?? 1) / 6);
    if (edgeVisibility.length !== points.length ** 2)
      edgeVisibility = new Float32Array(points.length ** 2);
    for (const bucket of buckets) bucket.used = 0;
    for (let i = 0; i < points.length; i++) {
      const point = points[i]!;
      near[i] = !!cursor && squared(point, cursor) < cursorRangeSquared;
      const closest = neighbours[i] ?? (neighbours[i] = []);
      closest.length = 0;
      if (cursor && near[i]) {
        // Limit drawn spokes, not physical attraction. Angular coverage avoids
        // choosing one side simply because those points came first in an array.
        const angle =
          Math.atan2(point.y - cursor.y, point.x - cursor.x) + Math.PI;
        const sector = Math.min(
          maximumSpokes - 1,
          Math.floor((angle / (Math.PI * 2)) * maximumSpokes),
        );
        const previous = spokes[sector]!;
        if (
          previous < 0 ||
          squared(point, cursor) < squared(points[previous]!, cursor)
        )
          spokes[sector] = i;
      }
    }
    for (let i = 0; i < points.length; i++) {
      const a = points[i]!;
      const closest = neighbours[i]!;
      ctx.fillRect(a.x - 0.5, a.y - 0.5, 1, 1);
      for (let j = 0; j < points.length; j++) {
        if (i === j) continue;
        const distance = squared(a, points[j]!);
        const range = particleRangeSquared;
        if (distance >= range) continue;
        let rank = 0;
        while (
          rank < closest.length &&
          squared(a, points[closest[rank]!]!) <= distance
        )
          rank++;
        if (rank < 3) {
          closest.splice(rank, 0, j);
          closest.length = Math.min(3, closest.length);
        }
      }
    }
    for (let i = 0; i < points.length; i++) {
      const target = cursor && spokes.includes(i) ? (motion.strength ?? 1) : 0;
      const previous = spokeVisibility[i] ?? 0;
      const visible = cursor ? previous + (target - previous) * blend : 0;
      spokeVisibility[i] = visible;
      if (cursor && near[i])
        line(
          points[i]!,
          cursor,
          squared(points[i]!, cursor),
          cursorRangeSquared,
          visible,
        );
      for (let j = i + 1; j < points.length; j++) {
        const key = i * points.length + j;
        const selected =
          neighbours[i]!.includes(j) || neighbours[j]!.includes(i);
        const old = edgeVisibility[key]!;
        const visible = old + ((selected ? 1 : 0) - old) * blend;
        edgeVisibility[key] = visible;
        // Use one distance rule across the field boundary, so a crossing edge
        // never changes length/opacity merely because a point becomes 'inside'.
        const range = particleRangeSquared;
        const distance = squared(points[i]!, points[j]!);
        if (distance < range)
          line(points[i]!, points[j]!, distance, range, visible);
      }
    }
    for (const bucket of buckets) {
      if (!bucket.used) continue;
      ctx.beginPath();
      ctx.lineWidth = bucket.width;
      ctx.strokeStyle = bucket.color;
      for (let i = 0; i < bucket.used; i += 4) {
        ctx.moveTo(bucket.coordinates[i]!, bucket.coordinates[i + 1]!);
        ctx.lineTo(bucket.coordinates[i + 2]!, bucket.coordinates[i + 3]!);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  };
}

export function startBackground(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d');
  if (!context) return;
  const ctx = context;
  const render = createParticleRenderer(ctx);
  const simulation = createParticleSimulation();
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const fine = window.matchMedia('(pointer: fine)');
  let width = 0;
  let height = 0;
  let pixelRatio = 0;
  let points: Particle[] = [];
  let cursor: { x: number; y: number } | null = null;
  let cursorTarget: { x: number; y: number } | null = null;
  let frame = 0;
  let previous: number | null = null;
  let disabled = false;
  let initialized = false;
  let initializationQueued = false;
  try {
    disabled = localStorage.getItem('background-motion') === 'off';
  } catch {
    /* Storage can be disabled. */
  }

  function resize(nextWidth: number, nextHeight: number) {
    if (!nextWidth || !nextHeight) return false;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const count = nextWidth < 768 || !fine.matches ? 32 : 120;
    if (
      width === nextWidth &&
      height === nextHeight &&
      pixelRatio === ratio &&
      points.length === count
    )
      return false;
    const scaleX = width ? nextWidth / width : 1;
    const scaleY = height ? nextHeight / height : 1;
    simulation.reset();
    width = nextWidth;
    height = nextHeight;
    pixelRatio = ratio;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    // Preserve relative positions so expanding the viewport fills both halves.
    points.length = Math.min(points.length, count);
    for (const point of points) {
      point.x = Math.max(0, Math.min(point.x * scaleX, width));
      point.y = Math.max(0, Math.min(point.y * scaleY, height));
    }
    while (points.length < count) {
      points.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: Math.random() * 2 - 1,
        vy: Math.random() * 2 - 1,
      });
    }
    return true;
  }
  function draw(time: number) {
    if (!initialized || document.hidden || reduced.matches || disabled) return;
    const step =
      previous === null
        ? 1
        : Math.max(0, Math.min((time - previous) / frameDuration, 3));
    previous = time;
    cursor = followCursor(cursor, cursorTarget, step);
    simulation.advance(points, width, height, cursor, step);
    render(points, width, height, simulation.center, {
      step,
      strength: simulation.strength,
    });
    frame = requestAnimationFrame(draw);
  }
  function sync() {
    cancelAnimationFrame(frame);
    previous = null;
    const stopped = reduced.matches || disabled;
    if (stopped || document.hidden || !fine.matches) release();
    canvas.dataset.state = stopped
      ? 'disabled'
      : document.hidden
        ? 'paused'
        : initialized && width && height
          ? 'running'
          : 'initializing';
    if (stopped) ctx.clearRect(0, 0, width, height);
    if (!stopped && !document.hidden && initialized && width && height)
      frame = requestAnimationFrame(draw);
    const button = document.querySelector<HTMLButtonElement>('#motion-toggle');
    if (button) {
      button.setAttribute('aria-pressed', String(!stopped));
      button.textContent = stopped ? '背景动态：关' : '背景动态：开';
    }
  }
  function initializeAfterFirstPaint() {
    if (initialized || initializationQueued) return;
    initializationQueued = true;
    // The first font/page paint can still be expensive after layout completes.
    // Start motion in an idle slot after that paint rather than freezing mid-start.
    void document.fonts.ready.then(() => {
      const activate = () => {
        initialized = true;
        sync();
      };
      if (typeof window.requestIdleCallback === 'function')
        window.requestIdleCallback(activate);
      else window.setTimeout(activate, 0);
    });
  }
  window.addEventListener(
    'pointermove',
    (event) => {
      if (
        fine.matches &&
        event.pointerType !== 'touch' &&
        !reduced.matches &&
        !disabled
      ) {
        if (
          event.target instanceof Element &&
          event.target.closest(contentSurfaces)
        ) {
          release();
          return;
        }
        if (cursorTarget) {
          cursorTarget.x = event.clientX;
          cursorTarget.y = event.clientY;
        } else {
          cursorTarget = { x: event.clientX, y: event.clientY };
        }
      }
    },
    { passive: true },
  );
  window.addEventListener(
    'pointerover',
    (event) => {
      if (
        event.target instanceof Element &&
        event.target.closest(contentSurfaces)
      )
        release();
    },
    { passive: true },
  );
  document.addEventListener('scroll', release, {
    passive: true,
    capture: true,
  });
  window.addEventListener('pointerout', (event) => {
    if (!event.relatedTarget) release();
  });
  function release() {
    const active = cursorTarget !== null || simulation.members.size > 0;
    cursor = null;
    cursorTarget = null;
    simulation.reset();
    if (
      active &&
      initialized &&
      !document.hidden &&
      !reduced.matches &&
      !disabled
    )
      render(points, width, height, null);
  }
  window.addEventListener('blur', release);
  // Reading innerWidth here forces cold font/style layout in the module task.
  // ResizeObserver supplies dimensions after layout, without a synchronous read.
  new ResizeObserver((entries) => {
    const bounds = entries[0]?.contentRect;
    if (bounds && resize(bounds.width, bounds.height)) {
      if (initialized) sync();
      else initializeAfterFirstPaint();
    }
  }).observe(canvas);
  document.addEventListener('visibilitychange', sync);
  reduced.addEventListener('change', sync);
  fine.addEventListener('change', () => {
    resize(width, height);
    sync();
  });
  document.querySelector('#motion-toggle')?.addEventListener('click', () => {
    disabled = !disabled;
    try {
      localStorage.setItem('background-motion', disabled ? 'off' : 'on');
    } catch {
      /* Optional preference. */
    }
    sync();
  });
  sync();
}
