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
const captureRadius = 320;
const maximumCapturedParticles = 48;
const gatheringPace = 0.65;
const frameDuration = 1000 / 60;
const contentSurfaces =
  '.article-card, .project-card, .hero, .side-panel, .article-paper, .paper, .toc, .empty-state, .topic-card, .archive-row, .search-container, img, video, a, button, input, textarea, select, [data-background-static]';

export function followCursor(
  current: Position | null,
  target: Position | null,
  step = 1,
) {
  if (!target) return null;
  if (!current) return { x: target.x, y: target.y };
  // Bridge gaps between input events with a short, time-based 12ms response.
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
  if (p.x < 0 || p.x > width) p.vx *= -1;
  if (p.y < 0 || p.y > height) p.vy *= -1;
}

export function attractParticle(p: Particle, cursor: Position, step = 1) {
  const dx = p.x - cursor.x;
  const dy = p.y - cursor.y;
  const distanceSquared = dx * dx + dy * dy;
  // Keep the reference's circular capture area, with a continuous restoring force.
  // The original 3% jump switches on at 100px and makes settled points jitter.
  if (
    distanceSquared < cursorRangeSquared &&
    distanceSquared > cursorRangeSquared / 2
  ) {
    const distance = Math.sqrt(distanceSquared);
    const edge = Math.min(1, (Math.sqrt(cursorRangeSquared) - distance) / 12);
    const falloff = edge * edge * (3 - 2 * edge);
    const pull = (1 - 100 / distance) * -Math.expm1(-0.12 * step * falloff);
    p.x -= dx * pull;
    p.y -= dy * pull;
  }
  return distanceSquared;
}

const rimPool: { point: Particle; angle: number; radius: number }[] = [];
const rimOrder: (typeof rimPool)[number][] = [];
function spreadRimParticles(
  points: Particle[],
  width: number,
  height: number,
  cursor: Position,
  step: number,
  settling = 0,
  maximumTurn = 0.016,
) {
  let count = 0;
  for (const point of points) {
    const dx = point.x - cursor.x;
    const dy = point.y - cursor.y;
    const squared = dx * dx + dy * dy;
    if (squared <= 85 * 85 * (1 - settling) || squared >= cursorRangeSquared)
      continue;
    const sample = rimPool[count] ?? { point, angle: 0, radius: 0 };
    rimPool[count] = sample;
    sample.point = point;
    sample.angle = Math.atan2(dy, dx);
    sample.radius = Math.sqrt(squared);
    rimOrder[count++] = sample;
  }
  rimOrder.length = count;
  if (count < (settling ? 3 : 12)) return;
  rimOrder.sort((a, b) => a.angle - b.angle);
  const fullTurn = Math.PI * 2;
  const spacing = fullTurn / count;
  const minimumSpacing = spacing * (0.9 + 0.05 * settling);
  const neighbours = Math.min(8, Math.floor(count / 2));
  const limit =
    Math.max(0.28, spacing * 1.35) * (1 - settling) + spacing * 1.05 * settling;
  const response = -Math.expm1(-0.09 * step);
  for (let index = 0; index < count; index++) {
    const { point, angle, radius } = rimOrder[index]!;
    const previous = rimOrder[(index + count - 1) % count]!.angle;
    const next = rimOrder[(index + 1) % count]!.angle;
    const behind = angle - previous + (index === 0 ? fullTurn : 0);
    const ahead = next - angle + (index === count - 1 ? fullTurn : 0);
    let pressure = 0;
    // Share crowding pressure across a few neighbours so dense knots can open up.
    // This leaves a range of natural spacings instead of assigning angular slots.
    for (let offset = 1; offset <= neighbours; offset++) {
      const previousIndex = index - offset;
      const nextIndex = index + offset;
      const behindSpan =
        angle -
        rimOrder[(previousIndex + count) % count]!.angle +
        (previousIndex < 0 ? fullTurn : 0);
      const aheadSpan =
        rimOrder[nextIndex % count]!.angle -
        angle +
        (nextIndex >= count ? fullTurn : 0);
      const spacing = minimumSpacing * offset;
      pressure +=
        Math.max(0, spacing - behindSpan) - Math.max(0, spacing - aheadSpan);
    }
    const error =
      Math.max(0, ahead - limit) - Math.max(0, behind - limit) + pressure * 0.9;
    if (!error) continue;
    const inner = Math.min(1, (radius - 85) / 15);
    const outer = Math.min(1, (Math.sqrt(cursorRangeSquared) - radius) / 12);
    const weight =
      inner *
        inner *
        (3 - 2 * inner) *
        outer *
        outer *
        (3 - 2 * outer) *
        (1 - settling) +
      settling;
    const speed = (maximumTurn * (1 - settling) + 0.004 * settling) * step;
    const turn = Math.max(-speed, Math.min(speed, error * response)) * weight;
    const x = cursor.x + Math.cos(angle + turn) * radius;
    const y = cursor.y + Math.sin(angle + turn) * radius;
    // Let a settling mesh extend past the viewport; the canvas clips its edge.
    if (settling || (x >= 0 && x <= width && y >= 0 && y <= height)) {
      point.x = x;
      point.y = y;
    }
  }
}

export function advanceParticles(
  points: Particle[],
  width: number,
  height: number,
  cursor: Position | null,
  step = 1,
) {
  for (let remaining = step; remaining > 0; remaining -= 1) {
    const delta = Math.min(remaining, 1);
    for (const point of points) {
      advanceParticle(point, width, height, delta);
      if (cursor) attractParticle(point, cursor, delta);
    }
    if (cursor) spreadRimParticles(points, width, height, cursor, delta);
  }
}

function rimTransition(radius: number) {
  const progress = Math.max(0, Math.min(1, (radius - 110) / 70));
  return progress * progress * (3 - 2 * progress);
}

export function createParticleSimulation() {
  const members = new Set<Particle>();
  const homes = new Map<Particle, Particle>();
  const radii = new Map<Particle, number>();
  const group: Particle[] = [];
  const restingAngles: number[] = [];
  let previous: Position | null = null;
  let motionAnchor: Position | null = null;
  let quietFrames = 0;
  let resting = false;
  let bounds = { width: 0, height: 0 };

  function reset() {
    for (const point of members) {
      const home = homes.get(point);
      if (home) Object.assign(point, home);
      point.x = Math.max(0, Math.min(bounds.width, point.x));
      point.y = Math.max(0, Math.min(bounds.height, point.y));
    }
    members.clear();
    homes.clear();
    radii.clear();
    previous = motionAnchor = null;
    quietFrames = 0;
    resting = false;
  }

  return {
    members,
    get center() {
      return previous;
    },
    get settled() {
      return resting;
    },
    reset,
    advance(
      points: Particle[],
      width: number,
      height: number,
      cursor: Position | null,
      step = 1,
    ) {
      bounds.width = width;
      bounds.height = height;
      if (!cursor) {
        reset();
        advanceParticles(points, width, height, null, step);
        return;
      }
      const dx = previous ? cursor.x - previous.x : 0;
      const dy = previous ? cursor.y - previous.y : 0;
      if (Math.hypot(dx, dy) > 160) reset();
      // Preserve the ambient trajectories while their visible nodes are collected.
      for (let remaining = step; remaining > 0; remaining -= 1)
        for (const home of homes.values())
          advanceParticle(home, width, height, Math.min(1, remaining));
      const moved =
        !motionAnchor ||
        Math.hypot(cursor.x - motionAnchor.x, cursor.y - motionAnchor.y) > 1.5;
      if (moved) {
        motionAnchor = { x: cursor.x, y: cursor.y };
        quietFrames = 0;
        resting = false;
      }
      if (resting) {
        for (let remaining = step; remaining > 0; remaining -= 1)
          for (const point of points)
            if (!members.has(point))
              advanceParticle(point, width, height, Math.min(1, remaining));
        return;
      }
      for (const point of members) {
        // The settled rim follows the cursor; incoming particles travel from
        // their own positions rather than translating with the whole cohort.
        const radius = Math.hypot(
          point.x - (previous?.x ?? cursor.x),
          point.y - (previous?.y ?? cursor.y),
        );
        const follow = 1 - rimTransition(radius);
        point.x += dx * follow;
        point.y += dy * follow;
      }
      previous = { x: cursor.x, y: cursor.y };
      for (let remaining = step; remaining > 0; remaining -= 1) {
        const delta = Math.min(1, remaining);
        if (!moved) quietFrames += delta;
        const progress = Math.min(1, quietFrames / 90);
        const settling = progress * progress * (3 - 2 * progress);
        group.length = 0;
        for (const point of points) {
          if (!members.has(point)) {
            advanceParticle(point, width, height, delta);
            const distance = Math.hypot(point.x - cursor.x, point.y - cursor.y);
            if (
              moved &&
              members.size < maximumCapturedParticles &&
              distance < captureRadius
            ) {
              members.add(point);
              homes.set(point, { ...point });
              radii.set(point, 100 + Math.sin(members.size * 2.399963) * 2);
            } else continue;
          } else {
            point.x += point.vx * delta * (1 - settling) * 0.35;
            point.y += point.vy * delta * (1 - settling) * 0.35;
          }
          const x = point.x - cursor.x;
          const y = point.y - cursor.y;
          const radius = Math.hypot(x, y);
          const target = radii.get(point)!;
          // Pull existing nearby nodes in slowly. Never clamp a distant node
          // onto the rim: its changing position must explain every new edge.
          const outer = rimTransition(radius);
          const speed = (0.22 + 0.58 * outer) * delta * gatheringPace;
          const response =
            (0.06 * settling * (1 - outer) + 0.025 * outer) * gatheringPace;
          const change = Math.max(
            -speed,
            Math.min(speed, (target - radius) * -Math.expm1(-response * delta)),
          );
          const nextRadius = Math.max(0.01, radius + change);
          const angle = Math.atan2(y, x);
          point.x = cursor.x + Math.cos(angle) * nextRadius;
          point.y = cursor.y + Math.sin(angle) * nextRadius;
          group.push(point);
        }
        spreadRimParticles(
          group,
          width,
          height,
          cursor,
          delta,
          settling,
          0.004,
        );
        if (quietFrames >= 180 && group.length) {
          restingAngles.length = 0;
          let ready = true;
          for (const point of group) {
            const x = point.x - cursor.x;
            const y = point.y - cursor.y;
            if (Math.abs(Math.hypot(x, y) - radii.get(point)!) > 0.15)
              ready = false;
            restingAngles.push(Math.atan2(y, x));
          }
          restingAngles.sort((a, b) => a - b);
          const spacing = (Math.PI * 2) / group.length;
          if (group.length >= 3)
            for (let index = 0; index < group.length; index++) {
              const gap =
                (restingAngles[index + 1] ?? restingAngles[0]! + Math.PI * 2) -
                restingAngles[index]!;
              if (gap < spacing * 0.93 || gap > spacing * 1.09) ready = false;
            }
          resting = ready;
          if (resting) break;
        }
      }
    },
  };
}

export function createParticleRenderer(ctx: CanvasRenderingContext2D) {
  // Reuse paths grouped by visual strength instead of stroking every edge.
  const levels = 32;
  const captured: boolean[] = [];
  const nearby: boolean[] = [];
  const buckets = Array.from({ length: levels }, (_, index) => {
    const strength = (index + 0.5) / levels;
    return {
      coordinates: [] as number[],
      used: 0,
      width: strength / 2,
      color: `rgba(0,0,255,${strength + 0.2})`,
    };
  });
  function line(a: Position, b: Position, distance: number, range: number) {
    const strength = (range - distance) / range;
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
    interaction?: {
      members: ReadonlySet<Particle>;
    },
  ) {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#000';
    ctx.globalAlpha = 1;
    // Keep triangles with fewer long cross-links in the collected mesh.
    const meshRangeSquared = interaction
      ? 0.55 *
        Math.max(
          particleRangeSquared,
          Math.min(
            14400,
            (204 *
              Math.sin(
                (3 * Math.PI) / Math.max(12, interaction.members.size),
              )) **
              2,
          ),
        )
      : particleRangeSquared;
    for (const bucket of buckets) bucket.used = 0;
    for (let i = 0; i < points.length; i++) {
      const point = points[i]!;
      captured[i] = !!interaction?.members.has(point);
      nearby[i] =
        captured[i] &&
        !!cursor &&
        (point.x - cursor.x) ** 2 + (point.y - cursor.y) ** 2 <
          cursorRangeSquared;
    }
    for (let i = 0; i < points.length; i++) {
      const a = points[i]!;
      ctx.fillRect(a.x - 0.5, a.y - 0.5, 1, 1);
      if (cursor && (!interaction || nearby[i])) {
        const dx = a.x - cursor.x;
        const dy = a.y - cursor.y;
        const distance = dx * dx + dy * dy;
        if (distance < cursorRangeSquared)
          line(a, cursor, distance, cursorRangeSquared);
      }
      for (let j = i + 1; j < points.length; j++) {
        // Incoming nodes keep their background neighbours while travelling.
        // Once inside the rim, exclude nodes outside the selected cohort.
        if (
          interaction &&
          captured[i] !== captured[j] &&
          (nearby[i] || nearby[j])
        )
          continue;
        const b = points[j]!;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const distance = dx * dx + dy * dy;
        const range =
          interaction && nearby[i] && nearby[j]
            ? meshRangeSquared
            : particleRangeSquared;
        if (distance < range) line(a, b, distance, range);
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
    render(points, width, height, simulation.center, simulation);
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
