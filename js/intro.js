// 인트로 연출: 장면(scene)을 시간 순서대로 켜고 끄는 아주 단순한 타임라인
(() => {
  const $ = (s) => document.querySelector(s);
  const scenes = [...document.querySelectorAll(".scene")];
  const skipBtn = $("#skip"), replayBtn = $("#replay");
  let timers = [];
  const later = (ms, fn) => timers.push(setTimeout(fn, ms));
  const clearAll = () => { timers.forEach(clearTimeout); timers = []; };

  function show(n) {
    scenes.forEach((s) => s.classList.toggle("on", +s.dataset.scene === n));
    skipBtn.classList.toggle("light", n >= 4);
    replayBtn.classList.toggle("light", n >= 4);
  }

  /* ── 1. 타이핑 ── */
  function typeWriter(el) {
    const lines = el.dataset.text.split("|");
    el.innerHTML = "";
    const caret = document.createElement("span"); caret.className = "caret";
    let li = 0, ci = 0, html = "";
    (function tick() {
      if (li >= lines.length) return;
      const line = lines[li];
      if (line[ci] === "<") { const end = line.indexOf(">", ci); html += line.slice(ci, end + 1); ci = end + 1; }
      else { html += line[ci++]; }
      if (ci >= line.length) { li++; ci = 0; if (li < lines.length) html += "<br>"; }
      // 열린 <b> 태그가 있으면 임시로 닫아서 렌더
      const open = (html.match(/<b>/g) || []).length - (html.match(/<\/b>/g) || []).length;
      el.innerHTML = html + (open > 0 ? "</b>" : "");
      el.appendChild(caret);
      later(li >= lines.length ? 0 : 85, tick);
    })();
  }

  /* ── 2. 플랩 전광판 ── */
  const CH = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:";
  const FLIGHTS = [
    ["09:20", "TT101", "TOKYO HND", "BOARDING"],
    ["10:05", "TT205", "TOKYO NRT", "ON TIME"],
    ["11:40", "TT310", "OSAKA KIX", "ON TIME"],
    ["13:15", "TT412", "FUKUOKA FUK", "ON TIME"],
    ["15:50", "TT518", "SAPPORO CTS", "ON TIME"],
    ["18:30", "TT620", "OKINAWA OKA", "ON TIME"],
  ];
  const cellHTML = (txt, cls) =>
    `<span class="cell ${cls}">${[...txt].map((c) => `<span class="flap${c === " " ? " blank" : ""}" data-c="${c}">${c === " " ? "·" : c}</span>`).join("")}</span>`;

  function flip(container, duration = 1600) {
    const flaps = [...container.querySelectorAll(".flap:not(.blank)")];
    const start = performance.now();
    flaps.forEach((f, i) => (f.dataset.stop = start + 300 + Math.random() * duration + i * 6));
    (function frame(now) {
      let busy = false;
      flaps.forEach((f) => {
        if (now < +f.dataset.stop) { busy = true; f.textContent = CH[(Math.random() * CH.length) | 0]; }
        else f.textContent = f.dataset.c;
      });
      if (busy) requestAnimationFrame(frame);
    })(start);
  }

  function runBoard() {
    const rows = $("#rows");
    rows.innerHTML = FLIGHTS.map(([t, f, d, s]) =>
      `<div class="row">${cellHTML(t, "tm")}${cellHTML(f, "fl")}${cellHTML(d.padEnd(12, " "), "ds")}${cellHTML(s.padEnd(8, " "), "st" + (s === "BOARDING" ? " board" : ""))}</div>`
    ).join("");
    flip(rows);
    later(3600, () => {
      rows.innerHTML = `<div class="board-msg">${cellHTML("서울에서  도쿄까지", "ko")}${cellHTML("TO TOKYO", "en")}</div>`;
      flip(rows, 900);
    });
  }

  /* ── 3. 점 지구 + 항로 ── */
  function runGlobe() {
    const cv = $("#globe"), ctx = cv.getContext("2d");
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const W = (cv.width = innerWidth * dpr), H = (cv.height = innerHeight * dpr);
    const cx = W * (innerWidth < 600 ? 0.5 : 0.64), cy = H * (innerWidth < 600 ? 0.68 : 0.5);
    const R = Math.min(W, H) * (innerWidth < 600 ? 0.42 : 0.38);
    // 육지처럼 보이게 하는 간단한 노이즈
    const land = (x, y) => Math.sin(x * 3.1 + 1.3) * Math.cos(y * 2.7 - 0.4) + Math.sin(x * 7.3 + y * 5.1) * 0.45 + Math.cos(x * 1.4 - y * 3.9) * 0.4;
    const ICN = { x: cx - R * 0.12, y: cy - R * 0.05 }, HND = { x: cx + R * 0.28, y: cy + R * 0.08 };
    const start = performance.now();
    (function frame(now) {
      if (!$(".s-globe").classList.contains("on")) return;
      const t = (now - start) / 1000;
      ctx.clearRect(0, 0, W, H);
      // 링
      ctx.strokeStyle = "rgba(120,160,255,.18)"; ctx.lineWidth = dpr;
      [1, 1.35, 1.75, 2.2].forEach((k) => { ctx.beginPath(); ctx.arc(cx, cy, R * k, 0, Math.PI * 2); ctx.stroke(); });
      // 점
      const step = 7 * dpr, grow = Math.min(1, t / 1.2);
      for (let y = -R; y <= R; y += step) for (let x = -R; x <= R; x += step) {
        const d = Math.hypot(x, y); if (d > R * grow) continue;
        const v = land(x / R + 0.3, y / R);
        if (v < 0.15) continue;
        const shade = 1 - (d / R) * 0.6;
        ctx.fillStyle = `rgba(150,185,255,${0.25 + shade * 0.5})`;
        ctx.beginPath(); ctx.arc(cx + x, cy + y, 1.3 * dpr, 0, Math.PI * 2); ctx.fill();
      }
      // 항로 (곡선이 그려짐)
      const p = Math.max(0, Math.min(1, (t - 1.2) / 1.8));
      const mx = (ICN.x + HND.x) / 2, my = Math.min(ICN.y, HND.y) - R * 0.35;
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.6 * dpr; ctx.beginPath();
      for (let i = 0; i <= 60 * p; i++) {
        const u = i / 60, x = (1 - u) ** 2 * ICN.x + 2 * (1 - u) * u * mx + u * u * HND.x, y = (1 - u) ** 2 * ICN.y + 2 * (1 - u) * u * my + u * u * HND.y;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
      // 도시 점
      ctx.font = `500 ${11 * dpr}px "DM Mono", monospace`;
      [[ICN, "ICN", 1], [HND, "HND", p >= 1]].forEach(([c, label, vis]) => {
        if (!vis) return;
        const pulse = 4 + Math.sin(t * 4) * 2;
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(c.x, c.y, 3 * dpr, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,.5)"; ctx.beginPath(); ctx.arc(c.x, c.y, (6 + pulse) * dpr, 0, Math.PI * 2); ctx.stroke();
        ctx.fillText(label, c.x + 10 * dpr, c.y - 10 * dpr);
      });
      $("#km").textContent = `${Math.round(1160 * p).toLocaleString()} KM`;
      requestAnimationFrame(frame);
    })(start);
  }

  /* ── 4. 단어 바꾸기 ── */
  function runWords() {
    const words = [["쉽게", "EASIER"], ["가볍게", "LIGHTER"], ["가까이", "CLOSER"]];
    words.forEach(([ko, en], i) => later(i * 1700, () => {
      const w = $("#word"); w.classList.add("out");
      setTimeout(() => { w.textContent = ko; $("#wordEn").textContent = en; w.classList.remove("out"); }, i ? 350 : 0);
    }));
  }

  /* ── 타임라인 ── */
  function finish() {
    clearAll(); show(5);
    skipBtn.hidden = true; replayBtn.hidden = false;
    try { localStorage.setItem("introSeen", "1"); } catch {}
  }
  function play() {
    clearAll(); skipBtn.hidden = false; replayBtn.hidden = true;
    show(1); typeWriter($(".s-horizon .type"));
    later(5200, () => { show(2); runBoard(); });
    later(11000, () => { show(3); runGlobe(); });
    later(16500, () => { show(4); runWords(); });
    later(22000, finish);
  }

  skipBtn.onclick = finish;
  replayBtn.onclick = play;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) finish();
  else play();
})();
