/*
 * 注胶针扫掠几何模块。
 * 把每根针从起始角沿指定方向旋转到终止角所扫过的区域视为带方向的圆扇形，
 * 精确计算保护圆与该扇形的最小净距以及针身首次触及保护圆的角度。
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

  /* ---------------- 动态晕染：半径随旋转经过的真实时间线性增大 ---------------- */

  // 针的旋转时长（秒）：未填写或非正数按 0 处理（0 表示瞬时完成，即静态情形）
  function durationOf(n) {
    return Number.isFinite(n.duration) && n.duration > 0 ? n.duration : 0;
  }

  // 保护圆每秒晕染扩张量：未填写或非正数按 0 处理
  function growthOf(c) {
    return Number.isFinite(c.growth) && c.growth > 0 ? c.growth : 0;
  }

  // 圆心（相对支点距离 d、相对方位角 theta）到针身线段的距离
  function distNeedleAt(d, len, theta) {
    const p = d * Math.cos(theta); // 圆心在针身方向上的投影
    if (p <= 0) return d; // 最近点为支点
    if (p >= len) return Math.hypot(d * Math.sin(theta), p - len); // 最近点为针尖
    return d * Math.abs(Math.sin(theta)); // 垂足落在针身上
  }

  // 在单调区间 [lo, hi] 上二分求 f 的唯一根（f(lo) > 0 >= f(hi)）：连续求根，不是采样
  function bisectRoot(f, lo, hi) {
    let a = lo;
    let b = hi;
    for (let i = 0; i < 80; i++) {
      const m = (a + b) / 2;
      if (m === a || m === b) break;
      if (f(m) > 0) a = m;
      else b = m;
    }
    return (a + b) / 2;
  }

  /*
   * 单针单圆的动态分析：圆半径 r(s) = r0 + lambda·s 随转角 s（沿旋转方向的弧度）线性增大。
   * 净距函数 F(s) = 圆心到针身距离 − r(s) 在角向分段（垂足段 / 针尖段 / 针后平直段）上光滑，
   * 且全部驻点均可闭式求得；相邻评估点之间 F 单调，故最小净距必落在评估点上，
   * 首次触及为首个符号变化区间内的唯一根（二分收敛）。全程连续判定，不以角度或时间采样替代。
   * 返回 { minClearance, touch }；touch 为首次触及的转角偏移（弧度），不触及为 null。
   */
  function dynamicVsCircle(n, amount, c, lambda) {
    const dx = c.x - n.x;
    const dy = c.y - n.y;
    const d = Math.hypot(dx, dy);
    const r0 = c.r;
    const sgn = n.dir === 'cw' ? -1 : 1; // 针角 a(s) = a0 + sgn·s
    const theta0 = Math.atan2(dy, dx) - n.a0; // 圆心相对方位 θ(s) = theta0 − sgn·s（未归一化，随 s 单调）
    const clearanceAt = (s) => distNeedleAt(d, n.len, theta0 - sgn * s) - r0 - lambda * s;

    // 角向分段点：θ ≡ 0、±π/2（|sin| 拐点与垂足/平直分界）；d > len 时另有 ±θ_L（垂足/针尖分界）
    const thetaL = d > n.len ? Math.acos(Math.min(1, n.len / d)) : null;
    const bases = thetaL === null ? [0, Math.PI / 2, -Math.PI / 2] : [0, Math.PI / 2, -Math.PI / 2, thetaL, -thetaL];
    const pts = [0, amount];
    for (const tb of bases) {
      const s = normAngle(sgn * (theta0 - tb));
      if (s > EPS && s < amount - EPS) pts.push(s);
    }
    pts.sort((a, b) => a - b);

    // 各分段内的驻点（闭式解），与分段点共同构成评估点集
    const evalPts = pts.slice();
    for (let i = 0; i + 1 < pts.length; i++) {
      const lo = pts[i];
      const hi = pts[i + 1];
      const tw = wrapPi(theta0 - sgn * ((lo + hi) / 2));
      const absT = Math.abs(tw);
      if (absT >= Math.PI / 2) continue; // 平直段：F 为线性，无驻点
      if (thetaL !== null && absT <= thetaL) {
        // 针尖段：F' = 0 ⟺ d·L·sgn·sinθ = λ·g，平方后化为 cosθ 的二次方程
        const l2 = lambda * lambda;
        const disc = (l2 - d * d) * (l2 - n.len * n.len);
        const discTol = 1e-9 * Math.pow(Math.max(d, n.len, Math.abs(lambda), 1), 4);
        if (disc < -discTol) continue;
        const root = Math.sqrt(Math.max(0, disc));
        for (const u of [(l2 + root) / (d * n.len), (l2 - root) / (d * n.len)]) {
          if (u < -1 || u > 1) continue;
          for (const cand of [Math.acos(u), -Math.acos(u)]) {
            const s = normAngle(sgn * (theta0 - cand));
            if (s > lo + EPS && s < hi - EPS) evalPts.push(s);
          }
        }
      } else {
        // 垂足段：F' = 0 ⟺ cosθ = −λ/(d·ε·sgn)，ε 为 sinθ 在该段的符号
        const epsSign = Math.sign(Math.sin(tw)) || 1;
        const q = -lambda / (d * epsSign * sgn);
        if (Math.abs(q) <= 1) {
          for (const cand of [Math.acos(q), -Math.acos(q)]) {
            const s = normAngle(sgn * (theta0 - cand));
            if (s > lo + EPS && s < hi - EPS) evalPts.push(s);
          }
        }
      }
    }
    evalPts.sort((a, b) => a - b);

    // 最小动态净距：单调段上的极值必在评估点处
    let minClearance = Infinity;
    for (const s of evalPts) {
      const f = clearanceAt(s);
      if (f < minClearance) minClearance = f;
    }

    // 首次触及：沿旋转方向找到首个 F <= 0 的单调区间，二分求唯一根
    let touch = null;
    if (clearanceAt(0) <= SAFE_EPS) {
      touch = 0;
    } else {
      for (let i = 0; i + 1 < evalPts.length; i++) {
        if (clearanceAt(evalPts[i + 1]) <= SAFE_EPS) {
          touch = bisectRoot(clearanceAt, evalPts[i], evalPts[i + 1]);
          break;
        }
      }
    }
    return { minClearance, touch };
  }

  // 单针动态分析：半径随该针旋转经过的真实时间线性增大（durationSec 为全程秒数）
  function analyzeNeedleDynamic(n, circles, durationSec) {
    const amount = sweepAmount(n.a0, n.a1, n.dir);
    let minClearance = Infinity;
    let minClearanceCircle = -1;
    let firstTouch = null;
    circles.forEach((c, i) => {
      // 半径关于转角的增速 = 每秒扩张量 × 全程秒数 / 全程转角
      const lambda = (growthOf(c) * durationSec) / amount;
      const r = dynamicVsCircle(n, amount, c, lambda);
      if (r.minClearance < minClearance - EPS) {
        minClearance = r.minClearance;
        minClearanceCircle = i;
      }
      if (r.touch !== null && (!firstTouch || r.touch < firstTouch.offset - EPS)) {
        firstTouch = { offset: r.touch, angle: advance(n.a0, r.touch, n.dir), circle: i };
      }
    });
    return {
      safe: minClearance > SAFE_EPS,
      minClearance,
      minClearanceCircle,
      firstTouch,
    };
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
   * 校核入口。needles: [{x, y, len, a0, a1, dir, duration?}]（角度制，dir 为 'ccw'|'cw'，
   * duration 为旋转全程秒数，可选，0 或留空表示瞬时完成），circles: [{x, y, r, growth?}]
   * （growth 为每秒晕染扩张量，可选，留空按 0）。
   * 只要某根针录入了时长且至少一个保护圆在扩张，该针即按动态半径连续判定；
   * 扩张量全为零（或未录时长）时保持既有静态结果。
   * 返回每根针的全过程最小动态净距 / 首次触及角度、秒数与保护圆，以及首项冲突
   * （按针的录入顺序、再按该针旋转方向上的最早触及位置）。
   */
  function checkAll(needles, circles) {
    const results = needles.map((n) => {
      const rn = toRadianNeedle(n);
      const amount = sweepAmount(rn.a0, rn.a1, rn.dir);
      const durationSec = durationOf(n);
      const dynamic = durationSec > 0 && amount > EPS && circles.some((c) => growthOf(c) > 0);
      const res = dynamic ? analyzeNeedleDynamic(rn, circles, durationSec) : analyzeNeedle(rn, circles);
      if (res.firstTouch) {
        res.firstTouch = {
          circle: res.firstTouch.circle,
          angleDeg: rad2deg(normAngle(res.firstTouch.angle)),
          offsetDeg: rad2deg(res.firstTouch.offset),
          timeSec: amount > EPS ? (durationSec * res.firstTouch.offset) / amount : 0,
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
          timeSec: res.firstTouch.timeSec,
        };
      }
    });
    return { safe: !firstConflict, results, firstConflict };
  }

  // 录入校验：数量约束、数值有效性、起止角不同、保护圆不得覆盖支点
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
      if (n.duration !== undefined && n.duration !== null) {
        const t = n.duration;
        if (!Number.isFinite(t) || t < 0 || t > 120 || (t > 0 && t < 1)) {
          errors.push(`${label} 的旋转时长须为 1–120 秒（留空按 0 处理）`);
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
      if (c.growth !== undefined && c.growth !== null) {
        if (!Number.isFinite(c.growth) || c.growth < 0) {
          errors.push(`${label} 的每秒晕染扩张量须为非负数（留空按 0 处理）`);
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
    _internal: { distToSector, touchHalfWidth, sweepAmount, firstTouchVsCircle, dynamicVsCircle },
  };
});
