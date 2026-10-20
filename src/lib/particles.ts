import { createCanvasNestFrame, type Particle } from '../vendor/canvas-nest';

const animationSpeed = 0.7;
const contentSurfaces =
  '.article-card, .project-card, .hero, .side-panel, .article-paper, .paper, .toc, .empty-state, .topic-card, .archive-row, .search-container, img, video, a, button, input, textarea, select, [data-background-static]';

export function startBackground(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d');
  if (!context) return;
  const ctx = context;
  const paint = createCanvasNestFrame(ctx);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const fine = window.matchMedia('(pointer: fine)');
  let width = 0;
  let height = 0;
  let pixelRatio = 0;
  let points: Particle[] = [];
  let cursor: { x: number; y: number } | null = null;
  let frame = 0;
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
    const count = nextWidth < 768 || !fine.matches ? 32 : 99;
    if (
      width === nextWidth &&
      height === nextHeight &&
      pixelRatio === ratio &&
      points.length === count
    )
      return false;
    const scaleX = width ? nextWidth / width : 1;
    const scaleY = height ? nextHeight / height : 1;
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
  function draw() {
    if (!initialized || document.hidden || reduced.matches || disabled) return;
    paint(points, width, height, cursor, true, animationSpeed);
    frame = requestAnimationFrame(draw);
  }
  function sync() {
    cancelAnimationFrame(frame);
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
        if (cursor) {
          cursor.x = event.clientX;
          cursor.y = event.clientY;
        } else {
          cursor = { x: event.clientX, y: event.clientY };
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
    const active = cursor !== null;
    cursor = null;
    if (
      active &&
      initialized &&
      !document.hidden &&
      !reduced.matches &&
      !disabled
    )
      paint(points, width, height, null, false);
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
