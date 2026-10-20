import { test, expect, type Page } from '@playwright/test';

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

type Scene = {
  x: number;
  y: number;
  dots: { x: number; y: number }[];
  spokes: number;
  centreDots: number;
};
async function referenceScene(page: Page, incoming: boolean) {
  await page.clock.install();
  await page.addInitScript(
    ({ incoming }) => {
      const harness = window as unknown as { nestScene: Scene };
      harness.nestScene = {
        x: 500,
        y: 500,
        dots: [],
        spokes: 0,
        centreDots: 0,
      };
      const random = Math.random;
      let index = 0;
      Math.random = () => {
        if (!new Error().stack?.includes('/src/lib/particles.ts'))
          return random();
        const particle = Math.floor(index / 4);
        const component = index++ % 4;
        const angle = (particle / 12) * Math.PI * 2;
        const radius = incoming ? 160 + particle * 4 : 110;
        const x =
          particle < 12
            ? 500 + Math.cos(angle) * radius
            : 1000 + (particle % 9) * 45;
        const y =
          particle < 12
            ? 500 + Math.sin(angle) * radius
            : 100 + Math.floor((particle - 12) / 9) * 80;
        if (component === 0) return x / 1440;
        if (component === 1) return y / 1000;
        const velocity =
          particle >= 12
            ? 0
            : incoming
              ? (component === 2 ? Math.cos(angle) : Math.sin(angle)) * -0.3
              : component === 2
                ? Math.cos(angle) * 0.4 - Math.sin(angle) * 0.2
                : Math.sin(angle) * 0.4 + Math.cos(angle) * 0.2;
        return (velocity + 1) / 2;
      };
      const clear = CanvasRenderingContext2D.prototype.clearRect;
      const fill = CanvasRenderingContext2D.prototype.fillRect;
      const line = CanvasRenderingContext2D.prototype.lineTo;
      CanvasRenderingContext2D.prototype.clearRect = function (x, y, w, h) {
        if (this.canvas.id === 'particle-background') {
          harness.nestScene.dots.length = 0;
          harness.nestScene.spokes = harness.nestScene.centreDots = 0;
        }
        return clear.call(this, x, y, w, h);
      };
      CanvasRenderingContext2D.prototype.fillRect = function (x, y, w, h) {
        if (this.canvas.id === 'particle-background') {
          const scene = harness.nestScene;
          scene.dots.push({ x: x + 0.5, y: y + 0.5 });
          if (Math.hypot(x + 0.5 - scene.x, y + 0.5 - scene.y) < 0.001)
            scene.centreDots++;
        }
        return fill.call(this, x, y, w, h);
      };
      CanvasRenderingContext2D.prototype.lineTo = function (x, y) {
        if (
          this.canvas.id === 'particle-background' &&
          Math.hypot(x - harness.nestScene.x, y - harness.nestScene.y) < 0.001
        )
          harness.nestScene.spokes++;
        return line.call(this, x, y);
      };
    },
    { incoming },
  );
  await page.goto('http://127.0.0.1:4321/');
  await expect(page.locator('#particle-background')).toHaveAttribute(
    'data-state',
    'running',
  );
  const style = await page.addStyleTag({
    content: '.site-shell { visibility:hidden!important }',
  });
  const read = () =>
    page.evaluate(() => (window as unknown as { nestScene: Scene }).nestScene);
  const move = async (x: number, y: number) => {
    await page.evaluate(
      ({ x, y }) =>
        Object.assign((window as unknown as { nestScene: Scene }).nestScene, {
          x,
          y,
        }),
      { x, y },
    );
    await page.mouse.move(x, y);
  };
  return { read, move, style };
}

test('原版99个真实粒子，鼠标不增中心点，漂入范围才自然连线', async ({
  page,
}, info) => {
  test.skip(info.project.name === 'mobile', '桌面原站鼠标效果');
  const { read, move, style } = await referenceScene(page, true);
  await move(800, 100);
  await page.clock.runFor(200);
  expect((await read()).dots).toHaveLength(99);
  expect((await read()).spokes).toBe(0);
  expect((await read()).centreDots).toBe(0);
  await move(500, 500);
  await page.clock.runFor(200);
  expect((await read()).spokes).toBe(0);
  await page.clock.runFor(1400);
  const growing = await read();
  expect(growing.spokes).toBeGreaterThan(0);
  expect(growing.spokes).toBeLessThan(12);
  await page.clock.runFor(4000);
  const collected = await read();
  expect(collected.spokes).toBe(12);
  expect(collected.dots).toHaveLength(99);
  expect(collected.centreDots).toBe(0);
  await style.evaluate((element) => element.parentNode?.removeChild(element));
  const card = await page.locator('.article-card').first().boundingBox();
  await move(card!.x + 2, card!.y + card!.height / 2);
  await page.clock.runFor(32);
  const released = await read();
  expect(released.spokes).toBe(0);
  expect(released.dots).toHaveLength(99);
  expect(
    Math.max(
      ...released.dots
        .slice(0, 12)
        .map((point, i) =>
          Math.hypot(
            point.x - collected.dots[i]!.x,
            point.y - collected.dots[i]!.y,
          ),
        ),
    ),
  ).toBeLessThan(6);
});

test('原版鼠标移开后旧圈自然散开，不刚性拖动或恢复隐藏轨迹', async ({
  page,
}, info) => {
  test.skip(info.project.name === 'mobile', '桌面原站鼠标效果');
  const { read, move } = await referenceScene(page, false);
  await move(500, 500);
  await page.clock.runFor(2000);
  const collected = await read();
  expect(collected.spokes).toBe(12);
  expect(collected.centreDots).toBe(0);
  await move(850, 500);
  await page.clock.runFor(200);
  const released = await read();
  expect(released.spokes).toBe(0);
  expect(
    Math.hypot(
      released.dots[0]!.x - collected.dots[0]!.x,
      released.dots[0]!.y - collected.dots[0]!.y,
    ),
  ).toBeLessThan(15);
  await page.clock.runFor(2000);
  const dispersed = await read();
  expect(
    Math.hypot(
      dispersed.dots[0]!.x - released.dots[0]!.x,
      dispersed.dots[0]!.y - released.dots[0]!.y,
    ),
  ).toBeGreaterThan(30);
  expect(dispersed.dots).toHaveLength(99);
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

test('鼠标位置直接使用原站输入，不额外插值或拖动粒子', async ({
  page,
}, info) => {
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
  expect(samples).toEqual([140, 140, 140, 140]);
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
