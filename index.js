"use strict";

/* ==========================================================================
   ТЕМА
   Три состояния: системное (ничего не проставлено), явно светлое, явно тёмное.
   ========================================================================== */
(function () {
  var root = document.documentElement;
  var btn = document.getElementById("themeBtn");
  var saved = null;
  try { saved = localStorage.getItem("im-theme"); } catch (e) {}
  if (saved === "light" || saved === "dark") root.setAttribute("data-theme", saved);

  btn.addEventListener("click", function () {
    var dark = getComputedStyle(root).getPropertyValue("--ground").trim().toLowerCase() === "#0e1013";
    var next = dark ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try { localStorage.setItem("im-theme", next); } catch (e) {}
  });
})();

/* ==========================================================================
   ПОЯВЛЕНИЕ ПРИ ПРОКРУТКЕ
   ========================================================================== */
(function () {
  var items = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window) ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    items.forEach(function (el) { el.classList.add("is-in"); });
    return;
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); }
    });
  }, { rootMargin: "0px 0px -12% 0px", threshold: 0.08 });
  items.forEach(function (el) { io.observe(el); });
})();

/* ==========================================================================
   ДЕМОНСТРАЦИЯ: настоящая проекция камеры-обскуры и эпиполярная геометрия.
   Никаких заранее нарисованных картинок — оба «снимка» считаются из одной
   трёхмерной модели двумя камерами с известными положениями, а эпиполярная
   линия получается из фундаментальной матрицы, как и в самой программе.
   ========================================================================== */
(function () {

  /* ---------- маленькая линейная алгебра ---------- */
  function v3(x, y, z) { return { x: x, y: y, z: z }; }
  function sub(a, b) { return v3(a.x - b.x, a.y - b.y, a.z - b.z); }
  function cross(a, b) {
    return v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
  }
  function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
  function norm(a) {
    var n = Math.hypot(a.x, a.y, a.z) || 1;
    return v3(a.x / n, a.y / n, a.z / n);
  }
  // матрицы 3x3, по строкам
  function mul(A, B) {
    var C = new Array(9);
    for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) {
      var s = 0;
      for (var k = 0; k < 3; k++) s += A[i * 3 + k] * B[k * 3 + j];
      C[i * 3 + j] = s;
    }
    return C;
  }
  function tr(A) { return [A[0], A[3], A[6], A[1], A[4], A[7], A[2], A[5], A[8]]; }
  function mv(A, v) {
    return v3(A[0] * v.x + A[1] * v.y + A[2] * v.z,
              A[3] * v.x + A[4] * v.y + A[5] * v.z,
              A[6] * v.x + A[7] * v.y + A[8] * v.z);
  }
  function inv(A) {
    var a = A[0], b = A[1], c = A[2], d = A[3], e = A[4], f = A[5], g = A[6], h = A[7], i = A[8];
    var det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
    if (Math.abs(det) < 1e-12) return null;
    var s = 1 / det;
    return [(e * i - f * h) * s, (c * h - b * i) * s, (b * f - c * e) * s,
            (f * g - d * i) * s, (a * i - c * g) * s, (c * d - a * f) * s,
            (d * h - e * g) * s, (b * g - a * h) * s, (a * e - b * d) * s];
  }

  /* ---------- камера ---------- */
  var W = 480, H = 340, FX = 430, FY = 430, CX = 240, CY = 170;
  var K = [FX, 0, CX, 0, FY, CY, 0, 0, 1];

  // Соглашение компьютерного зрения: камера смотрит вдоль +Z,
  // X вправо, Y вниз. Мир — с Z вверх.
  function camera(C, target) {
    var f = norm(sub(target, C));
    var r = norm(cross(f, v3(0, 0, 1)));
    var d = cross(f, r);
    var R = [r.x, r.y, r.z, d.x, d.y, d.z, f.x, f.y, f.z];
    var Rc = mv(R, C);
    return { R: R, t: v3(-Rc.x, -Rc.y, -Rc.z), C: C, K: K };
  }

  function project(cam, X) {
    var p = mv(cam.R, X);
    var z = p.z + cam.t.z;
    if (z <= 1e-6) return null;
    return {
      u: FX * (p.x + cam.t.x) / z + CX,
      v: FY * (p.y + cam.t.y) / z + CY,
      z: z
    };
  }

  // Фундаментальная матрица: F = K^-T [t]x R K^-1
  function fundamental(c1, c2) {
    var R = mul(c2.R, tr(c1.R));
    var Rt1 = mv(R, c1.t);
    var t = v3(c2.t.x - Rt1.x, c2.t.y - Rt1.y, c2.t.z - Rt1.z);
    var tx = [0, -t.z, t.y, t.z, 0, -t.x, -t.y, t.x, 0];
    var E = mul(tx, R);
    var Ki = inv(K);
    return mul(tr(Ki), mul(E, Ki));
  }

  // Триангуляция серединой общего перпендикуляра двух лучей
  function triangulate(c1, p1, c2, p2) {
    var Ki = inv(K);
    var d1 = norm(mv(tr(c1.R), mv(Ki, v3(p1.u, p1.v, 1))));
    var d2 = norm(mv(tr(c2.R), mv(Ki, v3(p2.u, p2.v, 1))));
    var w = sub(c1.C, c2.C);
    var a = dot(d1, d1), b = dot(d1, d2), c = dot(d2, d2);
    var d = dot(d1, w), e = dot(d2, w);
    var den = a * c - b * b;
    if (Math.abs(den) < 1e-9) return null;
    var s = (b * e - c * d) / den, t = (a * e - b * d) / den;
    var A = v3(c1.C.x + d1.x * s, c1.C.y + d1.y * s, c1.C.z + d1.z * s);
    var B = v3(c2.C.x + d2.x * t, c2.C.y + d2.y * t, c2.C.z + d2.z * t);
    return v3((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
  }

  /* ---------- сарай: выпуклая призма, пятиугольник в сечении ---------- */
  var V = [
    v3(0, 0, 0), v3(4, 0, 0), v3(4, 3, 0), v3(0, 3, 0),
    v3(0, 0, 2), v3(4, 0, 2), v3(4, 3, 2), v3(0, 3, 2),
    v3(2, 0, 3), v3(2, 3, 3)
  ];
  // Названия — те, какими объект называет человек, а не «локатор 7»
  var NAMES = [
    "основание, ЮЗ", "основание, ЮВ", "основание, СВ", "основание, СЗ",
    "карниз, ЮЗ", "карниз, ЮВ", "карниз, СВ", "карниз, СЗ",
    "конёк, юг", "конёк, север"
  ];
  var R5 = 1 / Math.sqrt(5);
  var FACES = [
    { idx: [0, 4, 8, 5, 1], n: v3(0, -1, 0), tone: "wall" },
    { idx: [3, 2, 6, 9, 7], n: v3(0, 1, 0), tone: "wall" },
    { idx: [0, 3, 7, 4], n: v3(-1, 0, 0), tone: "wall" },
    { idx: [1, 5, 6, 2], n: v3(1, 0, 0), tone: "wall" },
    { idx: [4, 7, 9, 8], n: v3(-R5, 0, 2 * R5), tone: "roof" },
    { idx: [5, 8, 9, 6], n: v3(R5, 0, 2 * R5), tone: "roof" },
    { idx: [0, 1, 2, 3], n: v3(0, 0, -1), tone: "wall" }
  ];
  var LIGHT = norm(v3(-0.45, -0.7, 0.85));

  var camA = camera(v3(-3.6, -5.1, 3.0), v3(2, 1.5, 1.2));
  var camB = camera(v3(7.6, -4.0, 2.6), v3(2, 1.5, 1.2));

  /* ---------- отрисовка «снимка» ---------- */
  function shade(base, k) {
    return "rgb(" + Math.round(base[0] * k) + "," +
                    Math.round(base[1] * k) + "," +
                    Math.round(base[2] * k) + ")";
  }
  // Полуплоскость под линией горизонта — земля
  function halfPlane(l, ref) {
    var s = (l[0] * ref.u + l[1] * ref.v + l[2]) >= 0 ? 1 : -1;
    var pts = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }];
    var out = [];
    for (var i = 0; i < 4; i++) {
      var a = pts[i], b = pts[(i + 1) % 4];
      var fa = (l[0] * a.x + l[1] * a.y + l[2]) * s;
      var fb = (l[0] * b.x + l[1] * b.y + l[2]) * s;
      if (fa >= 0) out.push(a);
      if ((fa >= 0) !== (fb >= 0)) {
        var t = fa / (fa - fb);
        out.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
      }
    }
    return out;
  }

  var grain = null;
  function grainPattern(ctx) {
    if (grain) return grain;
    var g = document.createElement("canvas");
    g.width = g.height = 64;
    var gc = g.getContext("2d");
    var im = gc.createImageData(64, 64);
    for (var i = 0; i < im.data.length; i += 4) {
      var n = 120 + Math.random() * 135;
      im.data[i] = im.data[i + 1] = im.data[i + 2] = n;
      im.data[i + 3] = 255;
    }
    gc.putImageData(im, 0, 0);
    grain = ctx.createPattern(g, "repeat");
    return grain;
  }

  // Каждый «снимок» рисуется один раз в закадровый холст, дальше только копируется
  function renderPhoto(cam, exposure) {
    var off = document.createElement("canvas");
    off.width = W; off.height = H;
    var ctx = off.getContext("2d");

    // небо
    var sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, shade([150, 178, 198], exposure));
    sky.addColorStop(1, shade([206, 216, 218], exposure));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // земля: заливка полуплоскости под линией схода плоскости z = 0
    var Kt = tr(inv(K));
    var w = v3(cam.R[2], cam.R[5], cam.R[8]);
    var lv = mv(Kt, w);
    var horizon = [lv.x, lv.y, lv.z];
    var ref = project(cam, v3(2, 1.5, 0));
    if (ref) {
      var poly = halfPlane(horizon, ref);
      if (poly.length > 2) {
        var gr = ctx.createLinearGradient(0, H * 0.35, 0, H);
        gr.addColorStop(0, shade([122, 118, 96], exposure));
        gr.addColorStop(1, shade([96, 94, 76], exposure));
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.moveTo(poly[0].x, poly[0].y);
        for (var i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
        ctx.closePath();
        ctx.fill();
      }
    }

    // грани: тело выпуклое, поэтому достаточно отбросить обращённые от камеры
    FACES.forEach(function (f) {
      var p0 = V[f.idx[0]];
      if (dot(f.n, sub(cam.C, p0)) <= 0) return;
      var pts = [];
      for (var i = 0; i < f.idx.length; i++) {
        var p = project(cam, V[f.idx[i]]);
        if (!p) return;
        pts.push(p);
      }
      var lam = Math.max(0, dot(f.n, LIGHT));
      var k = (0.42 + 0.58 * lam) * exposure;
      var base = f.tone === "roof" ? [116, 122, 132] : [168, 154, 134];
      ctx.fillStyle = shade(base, k);
      ctx.beginPath();
      ctx.moveTo(pts[0].u, pts[0].v);
      for (var j = 1; j < pts.length; j++) ctx.lineTo(pts[j].u, pts[j].v);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(30,28,26,.34)";
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    // зерно и виньетка — чтобы читалось как фотография, а не как схема
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = grainPattern(ctx);
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    var vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.92);
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(0,0,0,.30)");
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);

    return off;
  }

  /* ---------- состояние ---------- */
  var F_AB = fundamental(camA, camB);
  var views = [
    { cam: camA, canvas: document.getElementById("cvA"), photo: null, hover: null, exposure: 1.0 },
    { cam: camB, canvas: document.getElementById("cvB"), photo: null, hover: null, exposure: 0.94 }
  ];
  views[0].photo = renderPhoto(camA, 1.0);
  views[1].photo = renderPhoto(camB, 0.94);

  var state = { corner: -1, markA: null, markB: null, residual: 0, xyz: null };

  var el = {
    name: document.getElementById("roName"),
    a: document.getElementById("roA"),
    b: document.getElementById("roB"),
    xyz: document.getElementById("roXYZ"),
    hint: document.getElementById("demoHint"),
    reset: document.getElementById("demoReset")
  };

  function visibleCorners(cam) {
    var vis = [];
    for (var i = 0; i < V.length; i++) {
      var on = false;
      for (var f = 0; f < FACES.length; f++) {
        if (FACES[f].idx.indexOf(i) < 0) continue;
        if (dot(FACES[f].n, sub(cam.C, V[FACES[f].idx[0]])) > 0) { on = true; break; }
      }
      if (!on) continue;
      var p = project(cam, V[i]);
      if (p && p.u > 4 && p.u < W - 4 && p.v > 4 && p.v < H - 4) vis.push({ i: i, p: p });
    }
    return vis;
  }
  var visA = visibleCorners(camA);
  var visB = visibleCorners(camB);
  var shared = visA.filter(function (a) {
    return visB.some(function (b) { return b.i === a.i; });
  });

  function nearest(list, u, v) {
    var best = null, bd = 1e9;
    list.forEach(function (c) {
      var d = Math.hypot(c.p.u - u, c.p.v - v);
      if (d < bd) { bd = d; best = c; }
    });
    return { c: best, d: bd };
  }

  /* ---------- рисование поверх снимка ---------- */
  function crosshair(ctx, u, v, color, label) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(u - 11, v); ctx.lineTo(u - 3.5, v);
    ctx.moveTo(u + 3.5, v); ctx.lineTo(u + 11, v);
    ctx.moveTo(u, v - 11); ctx.lineTo(u, v - 3.5);
    ctx.moveTo(u, v + 3.5); ctx.lineTo(u, v + 11);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(u, v, 3.2, 0, Math.PI * 2);
    ctx.stroke();
    if (label) {
      ctx.font = "11px ui-monospace, Consolas, monospace";
      var w = ctx.measureText(label).width;
      var bx = u + 14, by = v - 20;
      if (bx + w + 10 > W) bx = u - 14 - w - 8;
      ctx.fillStyle = "rgba(12,15,20,.74)";
      ctx.fillRect(bx, by, w + 9, 16);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.strokeRect(bx + .5, by + .5, w + 8, 15);
      ctx.fillStyle = "#EEF1F5";
      ctx.fillText(label, bx + 4.5, by + 12);
    }
    ctx.restore();
  }

  function drawLoupe(ctx, view, u, v) {
    var Z = 6, Rp = 46;
    var cxp = u < W / 2 ? u + Rp + 22 : u - Rp - 22;
    var cyp = v < H / 2 ? v + Rp + 22 : v - Rp - 22;
    cxp = Math.max(Rp + 2, Math.min(W - Rp - 2, cxp));
    cyp = Math.max(Rp + 2, Math.min(H - Rp - 2, cyp));

    ctx.save();
    ctx.beginPath();
    ctx.arc(cxp, cyp, Rp, 0, Math.PI * 2);
    ctx.clip();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(view.photo,
      u - Rp / Z, v - Rp / Z, (Rp * 2) / Z, (Rp * 2) / Z,
      cxp - Rp, cyp - Rp, Rp * 2, Rp * 2);
    // сетка пикселей — видно, что увеличение настоящее
    ctx.strokeStyle = "rgba(255,255,255,.10)";
    ctx.lineWidth = 1;
    for (var g = -Math.ceil(Rp / Z); g <= Math.ceil(Rp / Z); g++) {
      var o = g * Z - ((u % 1) * Z);
      ctx.beginPath(); ctx.moveTo(cxp + o, cyp - Rp); ctx.lineTo(cxp + o, cyp + Rp); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cxp - Rp, cyp + o); ctx.lineTo(cxp + Rp, cyp + o); ctx.stroke();
    }
    ctx.strokeStyle = "rgba(244,118,42,.95)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cxp - 9, cyp); ctx.lineTo(cxp - 3, cyp);
    ctx.moveTo(cxp + 3, cyp); ctx.lineTo(cxp + 9, cyp);
    ctx.moveTo(cxp, cyp - 9); ctx.lineTo(cxp, cyp - 3);
    ctx.moveTo(cxp, cyp + 3); ctx.lineTo(cxp, cyp + 9);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.arc(cxp, cyp, Rp, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(233,237,242,.55)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  function clipLine(l) {
    var pts = [];
    var a = l[0], b = l[1], c = l[2];
    if (Math.abs(b) > 1e-9) {
      [0, W].forEach(function (x) {
        var y = -(a * x + c) / b;
        if (y >= -0.5 && y <= H + 0.5) pts.push({ x: x, y: y });
      });
    }
    if (Math.abs(a) > 1e-9) {
      [0, H].forEach(function (y) {
        var x = -(b * y + c) / a;
        if (x >= -0.5 && x <= W + 0.5) pts.push({ x: x, y: y });
      });
    }
    return pts.length >= 2 ? [pts[0], pts[1]] : null;
  }

  function paint() {
    views.forEach(function (view, vi) {
      var ctx = view.canvas.getContext("2d");
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(view.photo, 0, 0);

      // Пунктиром — углы, которые в кадре есть, но ещё не отмечены.
      // Ровно то, что программа показывает как «оставшуюся работу».
      var list = vi === 0 ? visA : visB;
      var markedHere = vi === 0 ? state.markA : state.markB;
      ctx.save();
      ctx.setLineDash([2.5, 3]);
      ctx.strokeStyle = "rgba(53,184,190,.55)";
      ctx.lineWidth = 1;
      list.forEach(function (c) {
        if (state.corner === c.i && markedHere) return;
        ctx.beginPath();
        ctx.arc(c.p.u, c.p.v, 4.5, 0, Math.PI * 2);
        ctx.stroke();
      });
      ctx.restore();

      // Эпиполярная линия на втором снимке
      if (vi === 1 && state.markA) {
        var l = [
          F_AB[0] * state.markA.u + F_AB[1] * state.markA.v + F_AB[2],
          F_AB[3] * state.markA.u + F_AB[4] * state.markA.v + F_AB[5],
          F_AB[6] * state.markA.u + F_AB[7] * state.markA.v + F_AB[8]
        ];
        var seg = clipLine(l);
        if (seg) {
          ctx.save();
          ctx.strokeStyle = "rgba(53,184,190,.28)";
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.moveTo(seg[0].x, seg[0].y); ctx.lineTo(seg[1].x, seg[1].y);
          ctx.stroke();
          ctx.strokeStyle = "#35B8BE";
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(seg[0].x, seg[0].y); ctx.lineTo(seg[1].x, seg[1].y);
          ctx.stroke();
          ctx.restore();
        }
      }

      var m = vi === 0 ? state.markA : state.markB;
      if (m) crosshair(ctx, m.u, m.v, "#F4762A", NAMES[state.corner]);

      if (view.hover) drawLoupe(ctx, view, view.hover.u, view.hover.v);
    });
  }

  function fmt(n, d) { return n.toFixed(d === undefined ? 1 : d); }

  function refresh() {
    el.name.textContent = state.corner >= 0 ? NAMES[state.corner] : "—";
    el.a.textContent = state.markA ? fmt(state.markA.u) + " , " + fmt(state.markA.v) : "—";
    el.b.textContent = state.markB ? fmt(state.markB.u) + " , " + fmt(state.markB.v) : "—";
    el.xyz.textContent = state.xyz
      ? fmt(state.xyz.x, 2) + "  " + fmt(state.xyz.y, 2) + "  " + fmt(state.xyz.z, 2)
      : "—";
    paint();
  }

  function toImage(canvas, ev) {
    var r = canvas.getBoundingClientRect();
    return {
      u: (ev.clientX - r.left) * (W / r.width),
      v: (ev.clientY - r.top) * (H / r.height)
    };
  }

  views.forEach(function (view, vi) {
    view.canvas.addEventListener("pointermove", function (ev) {
      view.hover = toImage(view.canvas, ev);
      paint();
    });
    view.canvas.addEventListener("pointerleave", function () {
      view.hover = null;
      paint();
    });

    view.canvas.addEventListener("pointerdown", function (ev) {
      ev.preventDefault();
      var p = toImage(view.canvas, ev);

      if (vi === 0) {
        // Снимок 1: метка садится на ближайший угол — субпиксельная посадка
        var hit = nearest(shared, p.u, p.v);
        if (!hit.c || hit.d > 34) {
          el.hint.innerHTML = "Мимо: рядом нет угла. Кликните по углу сарая — " +
            "бирюзовым пунктиром отмечено то, что можно поставить.";
          return;
        }
        state.corner = hit.c.i;
        state.markA = { u: hit.c.p.u, v: hit.c.p.v };
        state.markB = null;
        state.xyz = null;
        state.residual = hit.d;
        el.hint.innerHTML = "Метка села на угол <b>«" + NAMES[state.corner] + "»</b>, " +
          "подтянувшись на <span class=\"k\">" + fmt(hit.d) + " px</span> от места клика — " +
          "это и есть субпиксельная посадка. На правом снимке появилась " +
          "<b>линия-подсказка</b>: та же точка может быть только на ней. " +
          "Кликните по ней.";
      } else {
        // Снимок 2: проверяем, что клик действительно возле эпиполярной линии
        if (!state.markA) {
          el.hint.innerHTML = "Сначала отметьте угол на <b>левом</b> снимке.";
          return;
        }
        var l = [
          F_AB[0] * state.markA.u + F_AB[1] * state.markA.v + F_AB[2],
          F_AB[3] * state.markA.u + F_AB[4] * state.markA.v + F_AB[5],
          F_AB[6] * state.markA.u + F_AB[7] * state.markA.v + F_AB[8]
        ];
        var dist = Math.abs(l[0] * p.u + l[1] * p.v + l[2]) / Math.hypot(l[0], l[1]);
        if (dist > 26) {
          el.hint.innerHTML = "Эта точка не может быть той же: она в " +
            "<span class=\"k\">" + fmt(dist) + " px</span> от линии-подсказки. " +
            "Геометрия двух камер запрещает такое соответствие — программа поэтому " +
            "и рисует линию.";
          paint();
          return;
        }
        var trueP = project(camB, V[state.corner]);
        state.markB = { u: trueP.u, v: trueP.v };
        state.xyz = triangulate(camA, state.markA, camB, state.markB);
        var off = Math.hypot(trueP.u - p.u, trueP.v - p.v);
        el.hint.innerHTML = "Точка решена. Два луча пересеклись в " +
          "<b>X " + fmt(state.xyz.x, 2) + " · Y " + fmt(state.xyz.y, 2) +
          " · Z " + fmt(state.xyz.z, 2) + " м</b> — отметка подтянулась на " +
          "<span class=\"k\">" + fmt(off) + " px</span>. " +
          "В программе так же: две отметки дают точку, а десятки точек — модель. " +
          "Отметьте следующий угол на левом снимке.";
        state.markA = { u: project(camA, V[state.corner]).u, v: project(camA, V[state.corner]).v };
      }
      refresh();
    });
  });

  el.reset.addEventListener("click", function () {
    state = { corner: -1, markA: null, markB: null, residual: 0, xyz: null };
    el.hint.innerHTML = "Сброшено. Наведите курсор на левый снимок — под ним появится " +
      "<b>лупа</b>. Кликните по любому углу сарая.";
    refresh();
  });

  refresh();
})();
