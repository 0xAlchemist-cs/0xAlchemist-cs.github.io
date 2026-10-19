import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // Astro's initial content-store write can request a full reload after the
  // first paint. Keep the controlled clock/Canvas fixture alive; forward errors
  // and all other Vite messages so actual application failures remain visible.
  await page.routeWebSocket('ws://127.0.0.1:4321/**', (route) => {
    const server = route.connectToServer();
    if (!route.protocols().includes('vite-hmr')) return;
    server.onMessage((message) => {
      if (JSON.parse(message.toString()).type !== 'full-reload')
        route.send(message);
    });
  });
});

test('周围原有粒子逐渐移入并连接，卡片区域立即消散', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', '桌面鼠标交互');
  await page.clock.install();
  await page.addInitScript(() => {
    const harness = window as unknown as {
      hoverMesh: {
        x: number;
        y: number;
        spokes: number;
        opacity: number;
        dots: number;
        minimumDotOpacity: number;
        radii: number[];
        positions: { x: number; y: number }[];
      };
    };
    harness.hoverMesh = {
      x: 500,
      y: 500,
      spokes: 0,
      opacity: 0,
      dots: 0,
      minimumDotOpacity: 1,
      radii: [],
      positions: [],
    };
    const random = Math.random;
    let index = 0;
    Math.random = () => {
      if (!new Error().stack?.includes('/src/lib/particles.ts'))
        return random();
      const particle = Math.floor(index / 4);
      const component = index++ % 4;
      const angle = (particle / 32) * Math.PI * 2;
      const radius = 150 + particle * 1.5;
      const x = particle < 32 ? 500 + Math.cos(angle) * radius : 1250;
      const y = particle < 32 ? 500 + Math.sin(angle) * radius : 850;
      return component === 0 ? x / 1440 : component === 1 ? y / 1000 : 0.5;
    };
    const clear = CanvasRenderingContext2D.prototype.clearRect;
    const line = CanvasRenderingContext2D.prototype.lineTo;
    const fill = CanvasRenderingContext2D.prototype.fillRect;
    CanvasRenderingContext2D.prototype.clearRect = function (x, y, w, h) {
      if (this.canvas.id === 'particle-background') {
        harness.hoverMesh.spokes = 0;
        harness.hoverMesh.opacity = 0;
        harness.hoverMesh.dots = 0;
        harness.hoverMesh.minimumDotOpacity = 1;
        harness.hoverMesh.radii.length = 0;
        harness.hoverMesh.positions.length = 0;
      }
      return clear.call(this, x, y, w, h);
    };
    CanvasRenderingContext2D.prototype.fillRect = function (x, y, w, h) {
      if (this.canvas.id === 'particle-background') {
        harness.hoverMesh.dots++;
        if (harness.hoverMesh.dots <= 32)
          harness.hoverMesh.positions.push({ x: x + 0.5, y: y + 0.5 });
        if (harness.hoverMesh.dots <= 32)
          harness.hoverMesh.radii.push(
            Math.hypot(
              x + 0.5 - harness.hoverMesh.x,
              y + 0.5 - harness.hoverMesh.y,
            ),
          );
        harness.hoverMesh.minimumDotOpacity = Math.min(
          harness.hoverMesh.minimumDotOpacity,
          this.globalAlpha,
        );
      }
      return fill.call(this, x, y, w, h);
    };
    CanvasRenderingContext2D.prototype.lineTo = function (x, y) {
      if (
        this.canvas.id === 'particle-background' &&
        Math.hypot(x - harness.hoverMesh.x, y - harness.hoverMesh.y) < 0.001
      ) {
        harness.hoverMesh.spokes++;
        harness.hoverMesh.opacity = Math.max(
          harness.hoverMesh.opacity,
          this.globalAlpha,
        );
      }
      return line.call(this, x, y);
    };
  });
  await page.goto('http://127.0.0.1:4321/');
  await expect(page.locator('#particle-background')).toHaveAttribute(
    'data-state',
    'running',
  );
  const read = () =>
    page.evaluate(
      () =>
        (
          window as unknown as {
            hoverMesh: {
              spokes: number;
              opacity: number;
              dots: number;
              minimumDotOpacity: number;
              radii: number[];
              positions: { x: number; y: number }[];
            };
          }
        ).hoverMesh,
    );
  const backgroundOnly = await page.addStyleTag({
    content: '.site-shell { visibility: hidden !important; }',
  });
  await page.clock.runFor(32);
  const before = await read();
  await page.mouse.move(500, 500);
  await page.clock.runFor(200);
  const initial = await read();
  expect(initial.spokes).toBe(0);
  expect(
    initial.radii
      .slice(0, 32)
      .every(
        (radius, i) =>
          radius < before.radii[i]! && radius > before.radii[i]! - 15,
      ),
  ).toBe(true);
  expect(initial.dots).toBe(120);
  expect(initial.minimumDotOpacity).toBe(1);
  await page.clock.runFor(1400);
  const growing = await read();
  expect(growing.spokes).toBeGreaterThan(initial.spokes);
  expect(growing.spokes).toBeLessThan(18);
  expect(growing.opacity).toBe(1);
  await page.clock.runFor(4000);
  expect((await read()).spokes).toBeGreaterThan(growing.spokes);
  await page.clock.runFor(7400);
  expect((await read()).spokes).toBe(18);
  expect(Math.max(...(await read()).radii.slice(0, 32))).toBeLessThan(85);
  const collected = await read();
  await backgroundOnly.evaluate((style) =>
    style.parentNode?.removeChild(style),
  );
  const card = await page.locator('.article-card').first().boundingBox();
  const target = { x: card!.x + 2, y: card!.y + card!.height / 2 };
  await page.evaluate(
    ({ x, y }) =>
      Object.assign((window as unknown as { hoverMesh: object }).hoverMesh, {
        x,
        y,
      }),
    target,
  );
  await page.mouse.move(target.x, target.y);
  await page.clock.runFor(32);
  expect((await read()).spokes).toBe(0);
  expect(
    Math.max(
      ...(await read()).positions.map((point, index) =>
        Math.hypot(
          point.x - collected.positions[index]!.x,
          point.y - collected.positions[index]!.y,
        ),
      ),
    ),
  ).toBeLessThan(0.01);
  await page.clock.runFor(1000);
  expect((await read()).spokes).toBe(0);
  await page.evaluate(() =>
    Object.assign((window as unknown as { hoverMesh: object }).hoverMesh, {
      x: 500,
      y: 500,
    }),
  );
  await page.addStyleTag({
    content: '.site-shell { visibility: hidden !important; }',
  });
  await page.mouse.move(500, 500);
  await page.clock.runFor(200);
  expect((await read()).spokes).toBeLessThanOrEqual(18);
  expect((await read()).dots).toBe(120);
});

test('停留时新粒子持续接入，移动后旧圈从当前位置松开', async ({
  page,
}, info) => {
  test.skip(info.project.name === 'mobile', '桌面鼠标停留和移动场景');
  test.setTimeout(60000);
  await page.clock.install();
  await page.addInitScript(() => {
    const harness = window as unknown as {
      motionDots: { x: number; y: number }[];
    };
    harness.motionDots = [];
    const random = Math.random;
    let index = 0;
    Math.random = () => {
      if (!new Error().stack?.includes('/src/lib/particles.ts'))
        return random();
      const point = Math.floor(index / 4);
      const component = index++ % 4;
      const angle = (point / (point < 32 ? 32 : 88)) * Math.PI * 2;
      const radius = point < 32 ? 104 : 240 + (point - 32) * 1.5;
      const radial = point < 32 ? 0.4 : -0.85;
      const tangent = point < 32 ? 0.12 : 0;
      if (component === 0) return (500 + Math.cos(angle) * radius) / 1440;
      if (component === 1) return (500 + Math.sin(angle) * radius) / 1000;
      const velocity =
        component === 2
          ? Math.cos(angle) * radial - Math.sin(angle) * tangent
          : Math.sin(angle) * radial + Math.cos(angle) * tangent;
      return (velocity + 1) / 2;
    };
    const clear = CanvasRenderingContext2D.prototype.clearRect;
    const fill = CanvasRenderingContext2D.prototype.fillRect;
    CanvasRenderingContext2D.prototype.clearRect = function (x, y, w, h) {
      if (this.canvas.id === 'particle-background')
        harness.motionDots.length = 0;
      return clear.call(this, x, y, w, h);
    };
    CanvasRenderingContext2D.prototype.fillRect = function (x, y, w, h) {
      if (this.canvas.id === 'particle-background')
        harness.motionDots.push({ x: x + 0.5, y: y + 0.5 });
      return fill.call(this, x, y, w, h);
    };
  });
  await page.goto('http://127.0.0.1:4321/');
  await expect(page.locator('#particle-background')).toHaveAttribute(
    'data-state',
    'running',
  );
  await page.addStyleTag({
    content: '.site-shell { visibility:hidden!important }',
  });
  const read = () =>
    page.evaluate(
      () =>
        (window as unknown as { motionDots: { x: number; y: number }[] })
          .motionDots,
    );
  const radius = (p: { x: number; y: number }) =>
    Math.hypot(p.x - 500, p.y - 500);
  await page.mouse.move(500, 500);
  await page.clock.runFor(6000);
  const early = await read();
  await page.clock.runFor(19000);
  const collected = await read();
  expect(collected).toHaveLength(120);
  expect(radius(collected[70]!)).toBeLessThan(90);
  expect(radius(early[70]!) - radius(collected[70]!)).toBeGreaterThan(10);
  await page.clock.runFor(5000);
  const drifting = await read();
  expect(
    Math.hypot(
      drifting[0]!.x - collected[0]!.x,
      drifting[0]!.y - collected[0]!.y,
    ),
  ).toBeGreaterThan(1);
  await page.mouse.move(850, 500);
  await page.clock.runFor(200);
  const released = await read();
  expect(
    Math.hypot(
      released[0]!.x - drifting[0]!.x,
      released[0]!.y - drifting[0]!.y,
    ),
  ).toBeLessThan(15);
  await page.clock.runFor(2000);
  const dispersed = await read();
  expect(
    Math.hypot(
      dispersed[0]!.x - released[0]!.x,
      dispersed[0]!.y - released[0]!.y,
    ),
  ).toBeGreaterThan(30);
});

test('窗口由半屏扩到全屏后，左右两侧都有背景粒子', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', '桌面窗口展开场景');
  await page.setViewportSize({ width: 900, height: 900 });
  await page.clock.install();
  await page.addInitScript(() => {
    const harness = window as unknown as { backgroundXs: number[] };
    harness.backgroundXs = [];
    const random = Math.random;
    let seed = 42;
    Math.random = () => {
      if (!new Error().stack?.includes('/src/lib/particles.ts'))
        return random();
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 0x100000000;
    };
    const clear = CanvasRenderingContext2D.prototype.clearRect;
    const fill = CanvasRenderingContext2D.prototype.fillRect;
    CanvasRenderingContext2D.prototype.clearRect = function (
      x,
      y,
      width,
      height,
    ) {
      if (this.canvas.id === 'particle-background')
        harness.backgroundXs.length = 0;
      return clear.call(this, x, y, width, height);
    };
    CanvasRenderingContext2D.prototype.fillRect = function (
      x,
      y,
      width,
      height,
    ) {
      if (this.canvas.id === 'particle-background')
        harness.backgroundXs.push(x + 0.5);
      return fill.call(this, x, y, width, height);
    };
  });
  await page.goto('http://127.0.0.1:4321/');
  await expect(page.locator('#particle-background')).toHaveAttribute(
    'data-state',
    'running',
  );
  await page.clock.runFor(100);
  await page.setViewportSize({ width: 1800, height: 900 });
  await expect
    .poll(() =>
      page
        .locator('#particle-background')
        .evaluate((canvas) => (canvas as HTMLCanvasElement).width),
    )
    .toBe(1800);
  await page.clock.runFor(100);
  const sides = await page.evaluate(() => {
    const xs = (window as unknown as { backgroundXs: number[] }).backgroundXs;
    return {
      left: xs.filter((x) => x < 900).length,
      right: xs.filter((x) => x >= 900).length,
    };
  });
  expect(sides.left).toBeGreaterThanOrEqual(25);
  expect(sides.right).toBeGreaterThanOrEqual(25);
});

test('字体与首屏绘制未就绪时不提前启动动画', async ({ page }) => {
  await page.addInitScript(() => {
    const idle: IdleRequestCallback[] = [];
    let releaseFonts = () => {};
    let frames = 0;
    const fontsReady = new Promise<FontFaceSet>((resolve) => {
      releaseFonts = () => resolve(document.fonts);
    });
    Object.defineProperty(document.fonts, 'ready', { get: () => fontsReady });
    window.requestIdleCallback = (callback) => {
      idle.push(callback);
      return idle.length;
    };
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => {
      frames++;
      return raf(callback);
    };
    (window as unknown as { startupHarness: unknown }).startupHarness = {
      releaseFonts,
      get frames() {
        return frames;
      },
      get pendingIdle() {
        return idle.length;
      },
      finishPaint: () => {
        for (const callback of idle.splice(0))
          callback({ didTimeout: false, timeRemaining: () => 50 });
      },
    };
  });
  await page.goto('http://127.0.0.1:4321/');
  await expect(page.locator('#particle-background')).toHaveAttribute(
    'data-state',
    'initializing',
  );
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { startupHarness: { frames: number } })
          .startupHarness.frames,
    ),
  ).toBe(0);
  await page.evaluate(() =>
    (
      window as unknown as { startupHarness: { releaseFonts: () => void } }
    ).startupHarness.releaseFonts(),
  );
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { startupHarness: { pendingIdle: number } })
            .startupHarness.pendingIdle,
      ),
    )
    .toBe(1);
  await expect(page.locator('#particle-background')).toHaveAttribute(
    'data-state',
    'initializing',
  );
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { startupHarness: { frames: number } })
          .startupHarness.frames,
    ),
  ).toBe(0);
  await page.evaluate(() =>
    (
      window as unknown as { startupHarness: { finishPaint: () => void } }
    ).startupHarness.finishPaint(),
  );
  await expect(page.locator('#particle-background')).toHaveAttribute(
    'data-state',
    'running',
  );
});

test('视口尺寸变化时保留已有粒子，不整批重新随机生成', async ({ page }) => {
  await page.addInitScript(() => {
    const harness = window as unknown as { backgroundRandomCalls: number };
    harness.backgroundRandomCalls = 0;
    const random = Math.random;
    Math.random = () => {
      if (new Error().stack?.includes('/src/lib/particles.ts'))
        harness.backgroundRandomCalls++;
      return random();
    };
  });
  await page.goto('http://127.0.0.1:4321/');
  await expect(page.locator('#particle-background')).toHaveAttribute(
    'data-state',
    'running',
  );
  const before = await page.evaluate(
    () =>
      (window as unknown as { backgroundRandomCalls: number })
        .backgroundRandomCalls,
  );
  const viewport = page.viewportSize()!;
  await page.setViewportSize({
    width: viewport.width - 40,
    height: viewport.height - 60,
  });
  await expect
    .poll(() =>
      page
        .locator('#particle-background')
        .evaluate((canvas) => (canvas as HTMLCanvasElement).height),
    )
    .toBe(
      Math.round(
        (viewport.height - 60) *
          (await page.evaluate(() => Math.min(devicePixelRatio, 2))),
      ),
    );
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { backgroundRandomCalls: number })
          .backgroundRandomCalls,
    ),
  ).toBe(before);
});

test('鼠标事件之间仍逐帧平滑跟随', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', '触屏不启用鼠标吸引');
  await page.addInitScript(() => {
    let next = 1;
    let pending = new Map<number, FrameRequestCallback>();
    const endpoints = new Map<string, { x: number; count: number }>();
    window.requestAnimationFrame = (callback) => {
      const id = next++;
      pending.set(id, callback);
      return id;
    };
    window.cancelAnimationFrame = (id) => {
      pending.delete(id);
    };
    const clear = CanvasRenderingContext2D.prototype.clearRect;
    const lineTo = CanvasRenderingContext2D.prototype.lineTo;
    CanvasRenderingContext2D.prototype.clearRect = function (
      x,
      y,
      width,
      height,
    ) {
      if (this.canvas.id === 'particle-background') endpoints.clear();
      return clear.call(this, x, y, width, height);
    };
    CanvasRenderingContext2D.prototype.lineTo = function (x, y) {
      // Inspect only the cursor's path; ambient vertices can have more edges.
      if (
        this.canvas.id === 'particle-background' &&
        Math.abs(y - 450) < 0.000001 &&
        x >= 110 &&
        x <= 140
      ) {
        const key = `${x},${y}`;
        const endpoint = endpoints.get(key) ?? { x, count: 0 };
        endpoint.count++;
        endpoints.set(key, endpoint);
      }
      return lineTo.call(this, x, y);
    };
    const random = Math.random;
    let index = 0;
    Math.random = () => {
      if (!new Error().stack?.includes('/src/lib/particles.ts'))
        return random();
      const angle = (Math.floor(index / 4) / 120) * Math.PI * 2;
      const component = index++ % 4;
      if (component === 0) return (110 + Math.cos(angle) * 90) / 1440;
      if (component === 1) return (450 + Math.sin(angle) * 90) / 1000;
      return 0.5;
    };
    (window as unknown as { tickCursor: (time: number) => number }).tickCursor =
      (time) => {
        const callbacks = pending;
        pending = new Map();
        for (const callback of callbacks.values()) callback(time);
        return (
          [...endpoints.values()].sort((a, b) => b.count - a.count)[0]?.x ?? NaN
        );
      };
  });
  await page.goto('http://127.0.0.1:4321/');
  await expect(page.locator('#particle-background')).toHaveAttribute(
    'data-state',
    'running',
  );
  await page.mouse.move(110, 450);
  await page.evaluate(() =>
    (window as unknown as { tickCursor: (time: number) => number }).tickCursor(
      1000,
    ),
  );
  await page.mouse.move(140, 450);
  const samples = await page.evaluate(() =>
    [1007, 1014, 1021, 1028].map((time) =>
      (
        window as unknown as { tickCursor: (time: number) => number }
      ).tickCursor(time),
    ),
  );
  expect(samples[0]).toBeGreaterThan(110);
  expect(samples[0]).toBeLessThan(140);
  for (let i = 1; i < samples.length; i++)
    expect(samples[i]!).toBeGreaterThan(samples[i - 1]!);
  expect(140 - samples[3]!).toBeLessThan(8);
});

test('背景初始化不会同步触发视口布局', async ({ page }) => {
  await page.addInitScript(() => {
    const reads: string[] = [];
    (
      window as unknown as { backgroundViewportReads: string[] }
    ).backgroundViewportReads = reads;
    for (const property of ['innerWidth', 'innerHeight']) {
      const descriptor = Object.getOwnPropertyDescriptor(window, property);
      if (!descriptor?.get) continue;
      Object.defineProperty(window, property, {
        ...descriptor,
        get() {
          if (new Error().stack?.includes('/src/lib/particles.ts'))
            reads.push(property);
          return descriptor.get!.call(window);
        },
      });
    }
  });
  await page.goto('http://127.0.0.1:4321/');
  await expect(page.locator('#particle-background')).toHaveAttribute(
    'data-state',
    'running',
  );
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { backgroundViewportReads: string[] })
          .backgroundViewportReads,
    ),
  ).toEqual([]);
});

test('背景在 60、120、144Hz 下每个显示帧只绘制一次', async ({ page }) => {
  await page.addInitScript(() => {
    let next = 1;
    let pending = new Map<number, FrameRequestCallback>();
    let draws = 0;
    window.requestAnimationFrame = (callback) => {
      const id = next++;
      pending.set(id, callback);
      return id;
    };
    window.cancelAnimationFrame = (id) => {
      pending.delete(id);
    };
    const clear = CanvasRenderingContext2D.prototype.clearRect;
    CanvasRenderingContext2D.prototype.clearRect = function (
      x,
      y,
      width,
      height,
    ) {
      if (this.canvas.id === 'particle-background') draws++;
      return clear.call(this, x, y, width, height);
    };
    (
      window as unknown as { tickBackground: (time: number) => number }
    ).tickBackground = (time) => {
      const before = draws;
      const callbacks = pending;
      pending = new Map();
      for (const callback of callbacks.values()) callback(time);
      return draws - before;
    };
  });
  await page.goto('http://127.0.0.1:4321/');
  await expect(page.locator('#particle-background')).toHaveAttribute(
    'data-state',
    'running',
  );
  const results = await page.evaluate(() => {
    const tick = (
      window as unknown as { tickBackground: (time: number) => number }
    ).tickBackground;
    let time = 1000;
    return [60, 120, 144].map((rate) => {
      const draws = Array.from({ length: rate }, () => {
        time += 1000 / rate;
        return tick(time);
      });
      return {
        rate,
        skipped: draws.filter((n) => n === 0).length,
        duplicated: draws.filter((n) => n > 1).length,
      };
    });
  });
  for (const result of results) {
    expect(result.skipped, `${result.rate}Hz 跳过显示帧`).toBe(0);
    expect(result.duplicated, `${result.rate}Hz 重复绘制`).toBe(0);
  }
});
