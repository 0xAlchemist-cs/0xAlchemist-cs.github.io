import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceParticle,
  advanceParticles,
  attractParticle,
  createParticleRenderer,
  createParticleSimulation,
  followCursor,
  type Particle,
} from '../src/lib/particles';

const cursor = { x: 500, y: 450 };

test('周围已有粒子从原位置缓慢靠近，连线只随实际距离建立', () => {
  for (const rate of [30, 60, 120, 144]) {
    const points = Array.from({ length: 12 }, (_, index) => {
      const angle = (index / 12) * Math.PI * 2;
      const radius = 180 + index * 10;
      return {
        x: cursor.x + Math.cos(angle) * radius,
        y: cursor.y + Math.sin(angle) * radius,
        vx: 0,
        vy: 0,
      };
    });
    const originals = [...points];
    const simulation = createParticleSimulation();
    let spokes = 0;
    const context = {
      clearRect: () => {
        spokes = 0;
      },
      fillRect: () => {},
      beginPath: () => {},
      moveTo: () => {},
      stroke: () => {},
      lineTo: (x: number, y: number) => {
        if (Math.hypot(x - cursor.x, y - cursor.y) < 1e-8) spokes++;
      },
    } as unknown as CanvasRenderingContext2D;
    const render = createParticleRenderer(context);
    for (let frame = 0; frame < rate * 10; frame++) {
      const before = points.map((point) => ({ ...point }));
      simulation.advance(points, 1200, 900, cursor, 60 / rate);
      render(points, 1200, 900, cursor, simulation);
      const nearby = points.filter(
        (point) =>
          Math.hypot(point.x - cursor.x, point.y - cursor.y) < Math.sqrt(20000),
      );
      assert.equal(
        spokes,
        nearby.length,
        '连接必须由真实距离决定，不能靠计时补出',
      );
      if (frame < rate / 2)
        assert.equal(spokes, 0, '远处粒子尚未靠近时不能凭空连到中心');
      for (let index = 0; index < points.length; index++) {
        const point = points[index]!;
        const old = before[index]!;
        const travelled =
          Math.hypot(point.x - old.x, point.y - old.y) / (60 / rate);
        assert.ok(travelled < 1.25, `粒子从外围瞬移了 ${travelled}px/帧`);
      }
      if (frame === rate)
        assert.ok(
          Math.hypot(points[0]!.x - cursor.x, points[0]!.y - cursor.y) < 160,
          '周围已有粒子没有向鼠标靠近',
        );
    }
    assert.equal(spokes, 12, '选中的周围粒子最终应实际汇入圆周');
    assert.equal(points.length, originals.length);
    for (let index = 0; index < points.length; index++)
      assert.equal(points[index], originals[index], '不能新造粒子替换周围粒子');
    simulation.reset();
    assert.ok(
      Math.hypot(points[0]!.x - cursor.x, points[0]!.y - cursor.y) > 179,
    );
  }
});

test('移动鼠标时外围粒子从原位置追赶，不随圆心整体平移', () => {
  const point = { x: cursor.x + 300, y: cursor.y, vx: 0, vy: 0 };
  const simulation = createParticleSimulation();
  simulation.advance([point], 1200, 900, cursor);
  const before = { ...point };
  simulation.advance([point], 1200, 900, { x: cursor.x + 40, y: cursor.y });
  assert.ok(Math.hypot(point.x - before.x, point.y - before.y) < 1.25);
  assert.ok(point.x < before.x, '周围粒子应该实际靠近新位置');
});

test('周围选定粒子汇入后稳定，不无限吸收外部粒子，重新移动可继续收集', () => {
  const points = Array.from({ length: 48 }, (_, index) => {
    const angle = (index / 32) * Math.PI * 2;
    const radius = index < 32 ? 104 : index < 40 ? 240 : 360;
    const speed = index < 32 ? 0.4 : -0.5;
    return {
      x: cursor.x + Math.cos(angle) * radius,
      y: cursor.y + Math.sin(angle) * radius,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
    };
  });
  const simulation = createParticleSimulation();
  const ambient = { ...points[0]! };
  for (let frame = 0; frame < 900; frame++) {
    simulation.advance(points, 1200, 900, cursor);
    advanceParticle(ambient, 1200, 900);
  }
  assert.equal(simulation.members.size, 40, '只能吸引已选定的周围粒子');
  const before = [...simulation.members].map((p) => ({ ...p }));
  for (let frame = 0; frame < 1200; frame++) {
    simulation.advance(points, 1200, 900, cursor);
    advanceParticle(ambient, 1200, 900);
  }
  for (const [index, point] of [...simulation.members].entries()) {
    assert.ok(
      Math.hypot(point.x - before[index]!.x, point.y - before[index]!.y) < 0.1,
    );
    assert.ok(Math.hypot(point.x - cursor.x, point.y - cursor.y) < 103);
  }
  points[40]!.x = cursor.x + 160;
  points[40]!.y = cursor.y;
  points[40]!.vx = points[40]!.vy = 0;
  simulation.advance(points, 1200, 900, { x: cursor.x + 40, y: cursor.y });
  advanceParticle(ambient, 1200, 900);
  assert.ok(simulation.members.size > 40, '重新移动后应恢复收集');
  simulation.advance(points, 1200, 900, null);
  advanceParticle(ambient, 1200, 900);
  assert.equal(simulation.members.size, 0);
  assert.deepEqual(points[0], ambient, '消散后应回到持续运行的背景轨迹');
});

test('停留后的重排没有快速扩张阶段，最终整圈密度稳定', () => {
  for (const rate of [30, 60, 144]) {
    const points = Array.from({ length: 48 }, (_, index) => {
      const angle =
        (index < 32 ? 0 : Math.PI) -
        0.24 +
        (index < 32 ? index / 31 : (index - 32) / 15) * 0.48;
      return {
        x: cursor.x + Math.cos(angle) * 104,
        y: cursor.y + Math.sin(angle) * 104,
        vx: Math.cos(angle) * 0.5,
        vy: Math.sin(angle) * 0.5,
      };
    });
    const simulation = createParticleSimulation();
    let maximumJump = 0;
    for (let frame = 0; frame < rate * 15; frame++) {
      const before = points.map((p) => ({ ...p }));
      simulation.advance(points, 1200, 900, cursor, 60 / rate);
      for (let index = 0; index < points.length; index++) {
        const point = points[index]!;
        maximumJump = Math.max(
          maximumJump,
          Math.hypot(point.x - before[index]!.x, point.y - before[index]!.y) /
            (60 / rate),
        );
        assert.ok(Math.hypot(point.x - cursor.x, point.y - cursor.y) < 110);
      }
    }
    assert.ok(
      maximumJump < 1.25,
      `出现快速重排 ${maximumJump.toFixed(2)}px/帧`,
    );
    assert.ok(simulation.settled, '停留后应结束调整，进入稳定状态');
    const before = points.map((p) => ({ ...p }));
    for (let frame = 0; frame < rate * 15; frame++)
      simulation.advance(points, 1200, 900, cursor, 60 / rate);
    const angles = points
      .map((p) => Math.atan2(p.y - cursor.y, p.x - cursor.x))
      .sort((a, b) => a - b);
    const gaps = angles.map(
      (angle, i) => (angles[i + 1] ?? angles[0]! + Math.PI * 2) - angle,
    );
    assert.ok(
      Math.max(...gaps) / Math.min(...gaps) < 1.16,
      '停留后仍存在明显疏密',
    );
    for (let index = 0; index < points.length; index++)
      assert.ok(
        Math.hypot(
          points[index]!.x - before[index]!.x,
          points[index]!.y - before[index]!.y,
        ) < 0.2,
        '停留后仍持续变形',
      );
  }
});

test('稳定线网不与外部粒子连接，周围背景仍独立绘制', () => {
  let start = { x: 0, y: 0 };
  const edges: {
    from: { x: number; y: number };
    to: { x: number; y: number };
  }[] = [];
  let dots = 0;
  const context = {
    clearRect: () => {
      edges.length = 0;
      dots = 0;
    },
    fillRect: () => {
      dots++;
    },
    beginPath: () => {},
    moveTo: (x: number, y: number) => {
      start = { x, y };
    },
    lineTo: (x: number, y: number) => {
      edges.push({ from: start, to: { x, y } });
    },
    stroke: () => {},
  } as unknown as CanvasRenderingContext2D;
  const member = { x: cursor.x + 100, y: cursor.y, vx: 0, vy: 0 };
  const points = [
    member,
    ...[150, 190, 200].map((radius) => ({
      x: cursor.x + radius,
      y: cursor.y,
      vx: -0.5,
      vy: 0,
    })),
  ];
  const render = createParticleRenderer(context);
  render(points, 1200, 900, null);
  const ambientEdges = structuredClone(edges);
  render(points, 1200, 900, cursor, {
    members: new Set([points[1]!]),
  });
  assert.equal(dots, points.length, '开始聚拢不能挖空原有背景');
  assert.equal(context.globalAlpha, 1, '背景不能随着整组淡入而消失');
  assert.deepEqual(edges, ambientEdges, '尚未接入的粒子应保留原有连线');
  render(points, 1200, 900, cursor, {
    members: new Set([member]),
  });
  assert.equal(dots, 4, '附近的独立背景仍然可见');
  assert.equal(edges.length, 4);
  assert.equal(edges.filter((edge) => edge.from.x === member.x).length, 1);
  assert.ok(
    edges.some((edge) => edge.from.x === member.x && edge.to.x === cursor.x),
  );
  assert.ok(
    edges.some(
      (edge) => edge.from.x === cursor.x + 190 && edge.to.x === cursor.x + 200,
    ),
  );
});

function largestGap(points: Particle[]) {
  const angles = points
    .map((point) => Math.atan2(point.y - cursor.y, point.x - cursor.x))
    .sort((a, b) => a - b);
  return Math.max(
    ...angles.map(
      (angle, index) => (angles[index + 1] ?? angles[0]! + Math.PI * 2) - angle,
    ),
  );
}

test('两处密集堆积会逐渐散开，不长期挤在两个点上', () => {
  for (const rate of [30, 60, 144]) {
    const points = Array.from({ length: 64 }, (_, index) => {
      const group = index < 48 ? 0 : Math.PI;
      const offset = index < 48 ? index / 47 : (index - 48) / 15;
      const angle = group - 0.24 + offset * 0.48;
      const speed = 0.3 + (index % 5) * 0.05;
      return {
        x: cursor.x + Math.cos(angle) * 104,
        y: cursor.y + Math.sin(angle) * 104,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
      };
    });
    function concentration() {
      const angles = points.map((p) =>
        Math.atan2(p.y - cursor.y, p.x - cursor.x),
      );
      const peaks =
        Math.hypot(
          angles.reduce((sum, angle) => sum + Math.cos(2 * angle), 0),
          angles.reduce((sum, angle) => sum + Math.sin(2 * angle), 0),
        ) / points.length;
      const sideBias =
        Math.hypot(
          angles.reduce((sum, angle) => sum + Math.cos(angle), 0),
          angles.reduce((sum, angle) => sum + Math.sin(angle), 0),
        ) / points.length;
      const largestCrowd = Math.max(
        ...angles.map(
          (start) =>
            angles.filter(
              (angle) =>
                (angle - start + Math.PI * 2) % (Math.PI * 2) < Math.PI / 6,
            ).length,
        ),
      );
      return { peaks, sideBias, largestCrowd };
    }
    assert.ok(concentration().peaks > 0.9);
    for (let frame = 0; frame < rate * 10; frame++)
      advanceParticles(points, 1200, 900, cursor, 60 / rate);
    let result = concentration();
    assert.ok(result.peaks < 0.35, `双点聚集程度 ${result.peaks.toFixed(2)}`);
    assert.ok(
      result.sideBias < 0.16,
      `整半圈仍偏密：${result.sideBias.toFixed(2)}`,
    );
    assert.ok(
      result.largestCrowd <= 9,
      `30° 内仍挤了 ${result.largestCrowd} 个粒子`,
    );
    for (let frame = 0; frame < rate * 20; frame++)
      advanceParticles(points, 1200, 900, cursor, 60 / rate);
    result = concentration();
    assert.ok(
      result.peaks < 0.25,
      `长期停留又聚集到两个点：${result.peaks.toFixed(2)}`,
    );
    assert.ok(
      result.sideBias < 0.16,
      `长期停留后半圈偏密：${result.sideBias.toFixed(2)}`,
    );
    assert.ok(
      result.largestCrowd <= 9,
      `长期停留后 30° 内挤了 ${result.largestCrowd} 个粒子`,
    );
  }
});

test('鼠标停留后顶部大缺口会收拢，过渡连续且保留自然间距', () => {
  for (const rate of [30, 60, 120, 144]) {
    const points = Array.from({ length: 48 }, (_, index) => {
      const angle = -Math.PI / 2 + 0.75 + (index / 47) * (Math.PI * 2 - 1.5);
      const speed = 0.3 + (index % 5) * 0.08;
      return {
        x: cursor.x + Math.cos(angle) * 104,
        y: cursor.y + Math.sin(angle) * 104,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
      };
    });
    assert.ok(largestGap(points) > 1.4);
    let maximumSpeed = 0;
    for (let frame = 0; frame < rate * 6; frame++) {
      const before = points.map((point) => ({ ...point }));
      advanceParticles(points, 1200, 900, cursor, 60 / rate);
      for (let index = 0; index < points.length; index++)
        maximumSpeed = Math.max(
          maximumSpeed,
          Math.hypot(
            points[index]!.x - before[index]!.x,
            points[index]!.y - before[index]!.y,
          ) /
            (60 / rate),
        );
    }
    assert.ok(
      largestGap(points) < 0.4,
      `${rate}Hz 顶部仍缺 ${((largestGap(points) * 180) / Math.PI).toFixed(1)}°`,
    );
    assert.ok(maximumSpeed < 3, `${rate}Hz 出现瞬移 ${maximumSpeed}px/帧`);
    const released = { ...points[0]! };
    advanceParticles(points, 1200, 900, null);
    assert.equal(points[0]!.x, released.x + released.vx);
    assert.equal(points[0]!.y, released.y + released.vy);
  }
});

test('没有大缺口的自然间距不被重新等分', () => {
  const points = Array.from({ length: 24 }, (_, index) => {
    const angle = (index / 24) * Math.PI * 2 + (index % 3) * 0.012;
    return {
      x: cursor.x + Math.cos(angle) * (102 + (index % 5)),
      y: cursor.y + Math.sin(angle) * (102 + (index % 5)),
      vx: 0,
      vy: 0,
    };
  });
  const angles = points.map((p) => Math.atan2(p.y - cursor.y, p.x - cursor.x));
  for (let frame = 0; frame < 360; frame++)
    advanceParticles(points, 1200, 900, cursor);
  for (let index = 0; index < points.length; index++) {
    const angle = Math.atan2(
      points[index]!.y - cursor.y,
      points[index]!.x - cursor.x,
    );
    assert.ok(Math.abs(angle - angles[index]!) < 1e-8);
  }
});

test('内圈保留自然位置和独立漂移，不强制排列成等距圆环', () => {
  const points: Particle[] = [
    { x: 450, y: 450, vx: 0, vy: 0 },
    { x: 445, y: 460, vx: 0, vy: 0 },
    { x: 480, y: 380, vx: 0, vy: 0 },
    { x: 520, y: 510, vx: 0, vy: 0 },
  ];
  const before = structuredClone(points);
  for (let frame = 0; frame < 60; frame++)
    advanceParticles(points, 1200, 900, cursor);
  assert.deepEqual(points, before);
  for (const point of points) {
    point.vx = 0.2;
    point.vy = -0.3;
  }
  advanceParticles(points, 1200, 900, cursor);
  for (let index = 0; index < points.length; index++) {
    assert.equal(points[index]!.x, before[index]!.x + 0.2);
    assert.equal(points[index]!.y, before[index]!.y - 0.3);
  }
});

test('鼠标靠近画布边缘时，聚拢粒子保持有效坐标', () => {
  const edge = { x: 0, y: 400 };
  const points = Array.from({ length: 48 }, (_, index) => {
    const angle = -1.45 + (index / 47) * 2.9;
    return {
      x: Math.cos(angle) * 104,
      y: edge.y + Math.sin(angle) * 104,
      vx: 0.7,
      vy: 0.3,
    };
  });
  for (let frame = 0; frame < 360; frame++)
    advanceParticles(points, 1200, 900, edge);
  for (const point of points) {
    assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
    assert.ok(
      point.x >= -1 && point.x <= 1201 && point.y >= -1 && point.y <= 901,
    );
  }
});

test('鼠标跟随按时间平滑补齐事件间隔，松开后立即清除', () => {
  const target = { x: 100, y: 200 };
  let current = followCursor(null, target)!;
  assert.notEqual(current, target);
  target.x = 130;
  current = followCursor(current, target, 7 / (1000 / 60))!;
  assert.ok(current.x > 100 && current.x < 130);
  const before = current.x;
  current = followCursor(current, target, 7 / (1000 / 60))!;
  assert.ok(current.x > before && current.x < 130);
  assert.equal(followCursor(current, null), null);
});

test('鼠标跟随在不同刷新率下具有相同响应时间', () => {
  const samples = [60, 120, 144].map((rate) => {
    let current = { x: 0, y: 0 };
    for (let frame = 0; frame < rate / 12; frame++)
      current = followCursor(current, { x: 100, y: 200 }, 60 / rate)!;
    return current;
  });
  assert.ok(samples[0]!.x > 90 && samples[0]!.x < 100);
  for (const sample of samples)
    assert.ok(
      Math.hypot(sample.x - samples[0]!.x, sample.y - samples[0]!.y) < 1e-8,
    );
});

test('粒子停留在圆形边缘时不会反复发生像素级跳变', () => {
  const point: Particle = { x: 600, y: 450, vx: 0.6, vy: 0 };
  for (let frame = 0; frame < 300; frame++)
    advanceParticles([point], 1200, 900, cursor);
  let maximumJump = 0;
  for (let frame = 0; frame < 120; frame++) {
    const before = point.x;
    advanceParticles([point], 1200, 900, cursor);
    maximumJump = Math.max(maximumJump, Math.abs(point.x - before));
  }
  assert.ok(maximumJump < 0.15, `停留时最大跳变 ${maximumJump.toFixed(2)}px`);
  assert.ok(point.x - cursor.x >= 100 && point.x - cursor.x < 112);
});

test('内圈和远处自由漂移，外圈逐渐收拢', () => {
  for (const radius of [0, 70, 99, 100, 142, 200]) {
    const point: Particle = { x: cursor.x + radius, y: cursor.y, vx: 0, vy: 0 };
    const before = { ...point };
    attractParticle(point, cursor);
    assert.deepEqual(point, before);
  }
  for (const radius of [100.001, 105, 120, 130, 141]) {
    const point: Particle = { x: cursor.x + radius, y: cursor.y, vx: 0, vy: 0 };
    attractParticle(point, cursor);
    assert.ok(point.x < cursor.x + radius);
    assert.ok(point.x > cursor.x + 100);
  }
});

test('吸引力在内外边界平滑启停', () => {
  for (const radius of [100, Math.sqrt(20000)]) {
    const displacements = [-0.001, 0.001].map((offset) => {
      const point: Particle = {
        x: cursor.x + radius + offset,
        y: cursor.y,
        vx: 0,
        vy: 0,
      };
      const before = point.x;
      attractParticle(point, cursor);
      return point.x - before;
    });
    assert.ok(Math.abs(displacements[0]! - displacements[1]!) < 0.001);
  }
});

test('持续吸引保留圆形范围和自由漂移，移动鼠标后无瞬移', () => {
  const point: Particle = { x: 620, y: 450, vx: 0.6, vy: 0.2 };
  for (let frame = 0; frame < 600; frame++) {
    advanceParticles([point], 1200, 900, cursor);
    assert.ok(Math.hypot(point.x - cursor.x, point.y - cursor.y) < 142);
  }
  assert.deepEqual({ vx: point.vx, vy: point.vy }, { vx: 0.6, vy: 0.2 });
  const beforeMove = { ...point };
  advanceParticles([point], 1200, 900, { x: 540, y: 470 });
  assert.ok(Math.hypot(point.x - beforeMove.x, point.y - beforeMove.y) < 5);
  const beforeRelease = { ...point };
  advanceParticles([point], 1200, 900, null);
  assert.equal(point.x, beforeRelease.x + 0.6);
  assert.equal(point.y, beforeRelease.y + 0.2);
});

test('不同刷新率下移动速度和圆形聚拢范围一致', () => {
  function simulate(rate: number) {
    const point: Particle = { x: 620, y: 450, vx: 0.6, vy: 0.25 };
    for (let frame = 0; frame < rate * 8; frame++)
      advanceParticles([point], 1200, 900, cursor, 60 / rate);
    return point;
  }
  const reference = simulate(60);
  for (const rate of [30, 120, 144]) {
    const point = simulate(rate);
    assert.ok(
      Math.hypot(point.x - reference.x, point.y - reference.y) < 1,
      `${rate}Hz 运动偏离`,
    );
  }
});

test('视口边界反弹，零时长更新不会移动或产生 NaN', () => {
  const point: Particle = { x: 99.5, y: 0.5, vx: 1, vy: -1 };
  advanceParticle(point, 100, 100);
  assert.equal(point.vx, -1);
  assert.equal(point.vy, 1);
  advanceParticle(point, 100, 100);
  assert.equal(point.x, 99.5);
  assert.equal(point.y, 0.5);
  const before = { ...point };
  advanceParticles([point], 100, 100, cursor, 0);
  assert.deepEqual(point, before);
  attractParticle(point, { x: point.x, y: point.y });
  assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
});

test('密集线网完整绘制且最多描边 32 次，重绘不会修改运动状态或残留旧线', () => {
  const calls = { strokes: 0, edges: 0, clears: 0, dots: 0 };
  const context = {
    clearRect: () => {
      calls.clears++;
      calls.strokes = calls.edges = calls.dots = 0;
    },
    fillRect: () => {
      calls.dots++;
    },
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {
      calls.edges++;
    },
    stroke: () => {
      calls.strokes++;
    },
  } as unknown as CanvasRenderingContext2D;
  const points = Array.from({ length: 120 }, (_, index) => ({
    x: cursor.x + ((index % 11) - 5) * 2,
    y: cursor.y + (Math.floor(index / 11) - 4) * 2,
    vx: 0.6,
    vy: 0.2,
  }));
  const before = structuredClone(points);
  const render = createParticleRenderer(context);
  render(points, 1200, 900, cursor);
  assert.equal(calls.clears, 1);
  assert.equal(calls.dots, 120);
  assert.equal(calls.edges, (120 * 119) / 2 + 120);
  assert.ok(calls.strokes > 0 && calls.strokes <= 32);
  assert.deepEqual(points, before, '绘制不能顺带推进运动状态');
  render([{ x: 1, y: 1, vx: 0, vy: 0 }], 1200, 900, cursor);
  assert.equal(calls.clears, 2);
  assert.equal(calls.edges, 0);
  assert.equal(calls.strokes, 0);
});
