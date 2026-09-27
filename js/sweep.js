/*
 * 注胶针扫掠几何模块。
 * 静态：把每根针从起始角沿指定方向旋转到终止角所扫过的区域视为带方向的圆扇形，
 * 精确计算保护圆与该扇形的最小净距以及针身首次触及保护圆的角度。
 * 动态：针录入旋转时长（秒）且保护圆录入每秒非负晕染扩张量时，圆半径随该针旋转
 * 经过的真实时间线性增大，对针身与动态圆做全过程连续判定（枚举临界时刻使相邻
 * 区间严格单调，再对变号区间二分求根，不按角度或时间采样），给出全过程最小动态
 * 净距与首次触及的角度、秒数、保护圆。扩张量均为零时保持既有静态结果。
 * 纯函数、无 DOM 依赖：浏览器中挂在 window.Sweep，Node 中通过 module.exports 导出。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.Sweep = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  const TAU = Math.PI * 2;
  const EPS = 1e-9; // 几何计算容差
  const SAFE_EPS = 1e-7; // 净距判定容差：<= 此值视为相切/相交，即不安全

  const deg2rad = (d) => (d * Math.PI) / 180;
  const rad2deg = (r) => (r * 180) / Math.PI;

  // 归一化到 [0, 2π)
  function normAngle(a) {
    let w = a % TAU;
    if (w < 0) w += TAU;
    return w;
  }

  // 归一化到 (-π, π]
  function wrapPi(a) {
    const w = normAngle(a);
    return w > Math.PI ? w - TAU : w;
  }

  // 从 a0 沿 dir 转到 a1 的扫掠幅度（弧度，范围 (0, 2π)）
  function sweepAmount(a0, a1, dir) {
    return normAngle(dir === 'cw' ? a0 - a1 : a1 - a0);
  }

  // 角 ang 是否落在从 a0 沿 dir 旋转 amount 的扫掠范围内
  function angleInSweep(a0, amount, dir, ang) {
    const off = dir === 'cw' ? normAngle(a0 - ang) : normAngle(ang - a0);
    return off <= amount + EPS;
  }

  // 从 a0 沿 dir 前进 offset 后的角度
  function advance(a0, offset, dir) {
    return dir === 'cw' ? a0 - offset : a0 + offset;
  }

  function pointSegDist(px, py, ax, ay, bx, by) {
    const abx = bx - ax;
    const aby = by - ay;
    const len2 = abx * abx + aby * aby;
    let t = 0;
    if (len2 > 0) t = ((px - ax) * abx + (py - ay) * aby) / len2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + t * abx), py - (ay + t * aby));
  }

  /*
   * 圆心到扫掠扇形区域（含边界）的最短距离。
   * n: { x, y, len, a0, dir }（弧度制），amount 为扫掠幅度。
   */
  function distToSector(c, n, amount) {
    const dx = c.x - n.x;
    const dy = c.y - n.y;
    const d = Math.hypot(dx, dy);
    if (d < EPS) return 0; // 圆心即支点，位于扇形内部
    const phi = Math.atan2(dy, dx);
    if (angleInSweep(n.a0, amount, n.dir, phi)) {
      return Math.max(0, d - n.len); // 圆心角向落在扇形内：在径向内部为 0，否则超出弧长的部分
    }
    // 角向落在扇形外：最近点必在两条径向边界线段之一上
    const a1 = advance(n.a0, amount, n.dir);
    return Math.min(
      pointSegDist(c.x, c.y, n.x, n.y, n.x + n.len * Math.cos(n.a0), n.y + n.len * Math.sin(n.a0)),
      pointSegDist(c.x, c.y, n.x, n.y, n.x + n.len * Math.cos(a1), n.y + n.len * Math.sin(a1))
    );
  }

  /*
   * 针身（从支点出发、长 len 的线段）绕支点旋转时，触及圆 (d, r) 的角度区间半宽。
   * d 为圆心到支点距离。返回 null 表示任何角度都不会触及。
   * 推导：触及区间是以圆心方位角 φ 为中心、半宽 γ 的连续区间 [φ-γ, φ+γ]。
   *  - 若切点 sqrt(d²-r²) 落在针长内，边界由切线决定：γ = asin(r/d)；
   *  - 否则边界由针尖掠过圆周决定：γ = acos((d²+len²-r²)/(2·d·len))。
   */
  function touchHalfWidth(d, r, len) {
    if (d <= r + EPS) return Math.PI; // 支点被圆覆盖或相切：任何角度都触及
    if (d - r > len + EPS) return null; // 圆整体在针长范围之外
    const tangentLen = Math.sqrt(Math.max(0, d * d - r * r));
    if (tangentLen <= len + EPS) return Math.asin(Math.min(1, r / d));
    const cosBeta = (d * d + len * len - r * r) / (2 * d * len);
    if (cosBeta > 1 + EPS) return null; // 针尖也无法够到圆
    return Math.acos(Math.max(-1, Math.min(1, cosBeta)));
  }

  /*
   * 针从 a0 沿 dir 扫过 amount 的过程中，首次触及圆 c 的位置。
   * 返回 { offset, angle }（弧度，offset 为沿旋转方向转过的量），不触及返回 null。
   */
  function firstTouchVsCircle(n, amount, c) {
    const dx = c.x - n.x;
    const dy = c.y - n.y;
    const d = Math.hypot(dx, dy);
    const gamma = touchHalfWidth(d, c.r, n.len);
    if (gamma === null) return null;
    const phi = Math.atan2(dy, dx);
    // 起始角已处于触及区间内
    if (Math.abs(wrapPi(phi - n.a0)) <= gamma + EPS) return { offset: 0, angle: n.a0 };
    // 沿旋转方向首先遇到的区间边界（ccw 为 φ-γ，cw 为 φ+γ）
    const boundary = n.dir === 'cw' ? phi + gamma : phi - gamma;
    const off = n.dir === 'cw' ? normAngle(n.a0 - boundary) : normAngle(boundary - n.a0);
    if (off > amount + EPS) return null;
    const clamped = Math.min(off, amount);
    return { offset: clamped, angle: advance(n.a0, clamped, n.dir) };
  }

  // 单根针对全部保护圆的分析（内部使用弧度制针）
  function analyzeNeedle(n, circles) {
    const amount = sweepAmount(n.a0, n.a1, n.dir);
    let minClearance = Infinity;
    let minClearanceCircle = -1;
    let firstTouch = null;
    circles.forEach((c, i) => {
      const clearance = distToSector(c, n, amount) - c.r;
      if (clearance < minClearance - EPS) {
        minClearance = clearance;
        minClearanceCircle = i;
      }
      const t = firstTouchVsCircle(n, amount, c);
      if (t && (!firstTouch || t.offset < firstTouch.offset - EPS)) {
        firstTouch = { offset: t.offset, angle: t.angle, circle: i };
      }
    });
    return {
      safe: minClearance > SAFE_EPS,
      minClearance,
      minClearanceCircle,
      firstTouch,
    };
  }

  /*
   * 动态净距分析（单针单圆，连续判定）。
   * 针在 dur 秒内匀速扫过 amount（弧度），圆半径 r(t) = r0 + grow·t 线性扩张。
   * 瞬时净距 g(t) = 圆心到 t 时刻针身线段的最短距离 − r(t)。
   * δ(t) = 圆心方位角 − 针向角 随时间线性变化，圆心到针身的距离是 δ 的分段光滑函数
   * （垂足在针身内 / 垂足在支点之后 / 最近点为针尖）。把全部分段边界、|sin δ| 拐点
   * 以及各分段内 g′(t)=0 的解析解枚举为临界时刻后，g 在相邻临界时刻之间严格单调：
   * 最小动态净距即各临界时刻函数值之最；首次触及时刻由首个非正临界点或变号单调
   * 区间内的二分求根给出。返回 { minClearance, touchTime }（touchTime 为秒或 null）。
   */
  function dynamicPair(n, amount, dur, c) {
    const dx = c.x - n.x;
    const dy = c.y - n.y;
    const d = Math.hypot(dx, dy);
    const r0 = c.r;
    const k = c.grow;
    if (d < EPS) {
      // 圆心即支点：针身始终压住圆心（录入校验会拒绝，此处防御）
      return { minClearance: -(r0 + k * dur), touchTime: 0 };
    }
    if (amount < EPS) {
      // 针不旋转（防御分支；正常录入要求起止角不同）：g 随时间线性变化
      const g0 = distToSector(c, n, 0) - r0;
      const g1 = g0 - k * dur;
      let touchTime = null;
      if (g0 <= SAFE_EPS) touchTime = 0;
      else if (g1 <= SAFE_EPS && k > 0) touchTime = Math.min(dur, g0 / k);
      return { minClearance: Math.min(g0, g1), touchTime };
    }
    const phi = Math.atan2(dy, dx);
    const delta0 = phi - n.a0;
    const s = n.dir === 'cw' ? -1 : 1;
    const L = n.len;
    // 圆心到针身线段的最短距离，仅依赖 δ = 圆心方位角 − 针向角
    const segDist = (delta) => {
      const u = Math.cos(delta);
      if (u <= 0) return d; // 垂足落在支点之后：最近点为支点
      if (d * u <= L) return d * Math.abs(Math.sin(delta)); // 垂足在针身上
      return Math.sqrt(Math.max(0, d * d + L * L - 2 * d * L * u)); // 最近点为针尖
    };
    const g = (t) => segDist(delta0 - (s * amount * t) / dur) - r0 - k * t;

    // 临界偏移量 θ（沿旋转方向转过的弧度）：端点 + δ 经过特殊角的位置
    const offsets = [0, amount];
    const addDelta = (target) => {
      const off = normAngle(s * (delta0 - target));
      if (off <= amount + EPS) offsets.push(Math.min(off, amount));
    };
    addDelta(0); // |sin δ| 拐点 / 针向正对圆心
    addDelta(Math.PI);
    addDelta(Math.PI / 2); // 垂足越过支点（分段边界）
    addDelta((3 * Math.PI) / 2);
    if (d > L + EPS) {
      // 垂足越过针尖（分段边界）：cos δ = L/d
      const beta = Math.acos(Math.max(-1, Math.min(1, L / d)));
      addDelta(beta);
      addDelta(TAU - beta);
    }
    if (k > 0) {
      const w = amount / dur; // 角速度 ω
      // 垂足段驻点：cos δ = ±k/(d·ω)
      const ratio = k / (d * w);
      if (ratio <= 1 + EPS) {
        const al = Math.acos(Math.max(-1, Math.min(1, ratio)));
        addDelta(al);
        addDelta(TAU - al);
        addDelta(Math.PI - al);
        addDelta(Math.PI + al);
      }
      if (d > L + EPS) {
        // 针尖段驻点：cos δ 满足 c² − 2K²dL·c + (K²(d²+L²) − 1) = 0，K = k/(d·L·ω)
        const K = k / (d * L * w);
        const B = K * K * d * L;
        const disc = B * B - (K * K * (d * d + L * L) - 1);
        if (disc > EPS) {
          const sq = Math.sqrt(disc);
          [B + sq, B - sq].forEach((root) => {
            if (Math.abs(root) <= 1) {
              const aa = Math.acos(Math.max(-1, Math.min(1, root)));
              addDelta(aa);
              addDelta(TAU - aa);
            }
          });
        } else if (disc > -EPS && Math.abs(B) <= 1) {
          const aa = Math.acos(Math.max(-1, Math.min(1, B)));
          addDelta(aa);
          addDelta(TAU - aa);
        }
      }
    }
    // 排序并去重，得到单调子区间的分界时刻
    offsets.sort((a, b) => a - b);
    const offs = [];
    offsets.forEach((o) => {
      if (!offs.length || o - offs[offs.length - 1] > 1e-12) offs.push(o);
    });
    const times = offs.map((o) => (o * dur) / amount);
    const vals = times.map(g);
    let minClearance = Infinity;
    vals.forEach((v) => {
      if (v < minClearance) minClearance = v;
    });
    // 首次触及：首个非正临界点，或首个由正转非正的单调区间（二分求根）
    let touchTime = null;
    for (let i = 0; i < times.length; i += 1) {
      if (vals[i] <= SAFE_EPS) {
        touchTime = times[i];
        break;
      }
      if (i + 1 < times.length && vals[i + 1] <= SAFE_EPS) {
        let lo = times[i];
        let hi = times[i + 1];
        const tol = 1e-12 * Math.max(1, dur);
        while (hi - lo > tol) {
          const mid = (lo + hi) / 2;
          if (g(mid) > 0) lo = mid;
          else hi = mid;
        }
        touchTime = hi;
        break;
      }
    }
    return { minClearance, touchTime };
  }

  // 单根针的动态分析：对全部保护圆做连续判定（内部使用弧度制针）
  function analyzeNeedleDynamic(n, circles, amount, dur) {
    let minClearance = Infinity;
    let minClearanceCircle = -1;
    let firstTouch = null;
    circles.forEach((c, i) => {
      const r = dynamicPair(n, amount, dur, c);
      if (r.minClearance < minClearance - EPS) {
        minClearance = r.minClearance;
        minClearanceCircle = i;
      }
      if (r.touchTime !== null && (!firstTouch || r.touchTime < firstTouch.seconds - EPS)) {
        firstTouch = { seconds: r.touchTime, circle: i };
      }
    });
    if (firstTouch) {
      const offset = amount >= EPS ? Math.min(amount, (firstTouch.seconds * amount) / dur) : 0;
      firstTouch.offset = offset;
      firstTouch.angle = advance(n.a0, offset, n.dir);
    }
    return {
      safe: minClearance > SAFE_EPS,
      minClearance,
      minClearanceCircle,
      firstTouch,
    };
  }

  // 时长/扩张量缺省（未填写）按 0 处理
  const asDur = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
  const asGrow = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

  function toRadianNeedle(n) {
    return {
      x: n.x,
      y: n.y,
      len: n.len,
      a0: deg2rad(n.a0),
      a1: deg2rad(n.a1),
      dir: n.dir === 'cw' ? 'cw' : 'ccw',
    };
  }

  /*
   * 校核入口。needles: [{x, y, len, a0, a1, dir, dur?}]（角度制，dir 为 'ccw'|'cw'；
   * dur 为该针从起始朝向转到注入朝向的秒数，1–120，未填写/0 表示不计时），
   * circles: [{x, y, r, grow?}]（grow 为每秒非负晕染扩张量，未填写按 0）。
   * 当某根针录入了时长且至少一个保护圆有非零扩张量时，对该针做动态连续判定：
   * 圆半径随该针旋转经过的真实时间线性增大，针身与动态圆在全过程相交或相切即
   * 不安全；否则（时长为 0 或扩张量均为零）保持既有静态结果。
   * 返回每根针的最小（动态）净距/首次触及（角度、秒数、保护圆），以及首项冲突
   * （按针的录入顺序、再按该针旋转方向上的最早触及时刻）。
   */
  function checkAll(needles, circles) {
    const cs = (circles || []).map((c) => ({ x: c.x, y: c.y, r: c.r, grow: asGrow(c.grow) }));
    const anyGrow = cs.some((c) => c.grow > 0);
    const results = needles.map((nd) => {
      const n = toRadianNeedle(nd);
      const dur = asDur(nd.dur);
      const amount = sweepAmount(n.a0, n.a1, n.dir);
      let res;
      if (anyGrow && dur > 0) {
        res = analyzeNeedleDynamic(n, cs, amount, dur);
        res.dynamic = true;
      } else {
        res = analyzeNeedle(n, cs);
        res.dynamic = false;
        if (res.firstTouch) {
          res.firstTouch.seconds = dur > 0 && amount >= EPS ? (res.firstTouch.offset / amount) * dur : 0;
        }
      }
      res.dur = dur;
      if (res.firstTouch) {
        res.firstTouch = {
          circle: res.firstTouch.circle,
          angleDeg: rad2deg(normAngle(res.firstTouch.angle)),
          offsetDeg: rad2deg(res.firstTouch.offset),
          seconds: res.firstTouch.seconds,
        };
      }
      return res;
    });
    let firstConflict = null;
    results.forEach((res, i) => {
      if (!firstConflict && res.firstTouch) {
        firstConflict = {
          needle: i,
          circle: res.firstTouch.circle,
          angleDeg: res.firstTouch.angleDeg,
          offsetDeg: res.firstTouch.offsetDeg,
          seconds: res.firstTouch.seconds,
        };
      }
    });
    return { safe: !firstConflict, results, firstConflict };
  }

  // 录入校验：数量约束、数值有效性、起止角不同、保护圆不得覆盖支点、
  // 旋转时长 1–120 秒（未填按 0）、晕染扩张量非负（未填按 0）
  function validate(needles, circles) {
    const errors = [];
    if (!Array.isArray(needles) || needles.length < 2 || needles.length > 5) {
      errors.push('针的数量必须为 2 至 5 根');
    }
    if (!Array.isArray(circles) || circles.length < 1 || circles.length > 6) {
      errors.push('保护圆的数量必须为 1 至 6 个');
    }
    (needles || []).forEach((n, i) => {
      const label = `针 #${i + 1}`;
      if (!n || ![n.x, n.y, n.len, n.a0, n.a1].every(Number.isFinite)) {
        errors.push(`${label} 存在无效数值`);
        return;
      }
      if (n.len <= 0) errors.push(`${label} 的针长必须为正数`);
      if (n.dir !== 'cw' && n.dir !== 'ccw') errors.push(`${label} 的旋转方向无效`);
      if (Math.abs(wrapPi(deg2rad(n.a1) - deg2rad(n.a0))) < 1e-9) {
        errors.push(`${label} 的起始角与终止角必须不同`);
      }
      // 旋转时长可补录：未填写（缺省/空值）按 0，否则须为 0 或 1–120 秒
      if (n.dur !== undefined && n.dur !== null && !Number.isNaN(n.dur)) {
        if (!Number.isFinite(n.dur) || !(n.dur === 0 || (n.dur >= 1 && n.dur <= 120))) {
          errors.push(`${label} 的旋转时长须为 1–120 秒（未填写按 0 计）`);
        }
      }
    });
    (circles || []).forEach((c, j) => {
      const label = `保护圆 #${j + 1}`;
      if (!c || ![c.x, c.y, c.r].every(Number.isFinite)) {
        errors.push(`${label} 存在无效数值`);
        return;
      }
      if (c.r <= 0) errors.push(`${label} 的半径必须为正数`);
      // 晕染扩张量可补录：未填写（缺省/空值）按 0，否则须为每秒非负数值
      if (c.grow !== undefined && c.grow !== null && !Number.isNaN(c.grow)) {
        if (!Number.isFinite(c.grow) || c.grow < 0) {
          errors.push(`${label} 的晕染扩张量须为每秒非负数值（未填写按 0 计）`);
        }
      }
      (needles || []).forEach((n, i) => {
        if (!n || ![n.x, n.y].every(Number.isFinite)) return;
        if (Math.hypot(c.x - n.x, c.y - n.y) < c.r - EPS) {
          errors.push(`${label} 覆盖了针 #${i + 1} 的支点`);
        }
      });
    });
    return errors;
  }

  return {
    checkAll,
    validate,
    // 供测试与调试使用的内部函数
    _internal: { distToSector, touchHalfWidth, sweepAmount, firstTouchVsCircle, dynamicPair },
  };
});
