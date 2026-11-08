import * as store from "./store.js";
const { isDemo } = store;
const cfg = window.APP_CONFIG || {};
const $ = (s) => document.querySelector(s);
const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ls = {
  get(k) { try { return localStorage.getItem("tokyo-trip:" + k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem("tokyo-trip:" + k, v); } catch {} },
};

const state = { favorites: [], schedule: [], day: 1, days: +ls.get("days") || 3, tab: "translate" };

function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("on");
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("on"), 2200);
}
const fail = (e) => { console.error(e); toast(e.message || "문제가 생겼어요"); };

/* ───────── 날짜 · Day 색 ───────── */
const DAY_COLORS = [
  { bd: "#FFC9B0", bg: "#FFF1EA", fg: "#A3360C", solid: "#E0662E" }, // Day 1 주황
  { bd: "#BFDDF7", bg: "#EEF7FF", fg: "#1C5FA8", solid: "#1C6FC4" }, // Day 2 하늘
  { bd: "#A9DCC9", bg: "#E8F7F1", fg: "#0B6B50", solid: "#0B6B50" }, // Day 3 초록
  { bd: "#D9CCF5", bg: "#F4EFFF", fg: "#5B3FA8", solid: "#6B4FC0" },
  { bd: "#F5C6DA", bg: "#FFF0F6", fg: "#A0285E", solid: "#C2397A" },
];
const dayColor = (d) => DAY_COLORS[(d - 1) % DAY_COLORS.length];
const dayVars = (d) => { const c = dayColor(d); return `--d-bd:${c.bd};--d-bg:${c.bg};--d-fg:${c.fg};--d-solid:${c.solid}`; };
const PHOTO = [["#FFE3D3", "#A3360C"], ["#D6ECFF", "#1C5FA8"], ["#DDF3EA", "#0B6B50"], ["#F1E8FF", "#5B3FA8"]];
const photoVars = (i) => `--p-bg:${PHOTO[i % PHOTO.length][0]};--p-fg:${PHOTO[i % PHOTO.length][1]}`;

const start = cfg.TRIP_START ? new Date(cfg.TRIP_START + "T00:00:00") : null;
const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
function dayDate(d) {
  if (!start) return "";
  const t = new Date(start); t.setDate(t.getDate() + d - 1);
  return `${t.getMonth() + 1}/${t.getDate()} ${WEEK[t.getDay()]}`;
}
function renderHeaderDates() {
  if (!start) return;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((start - today) / 86400000);
  $("#dday").textContent = diff > 0 ? `D-${diff}` : diff === 0 ? "D-DAY" : "여행 중";
  const end = cfg.TRIP_END ? new Date(cfg.TRIP_END + "T00:00:00") : null;
  const f = (x) => `${x.getMonth() + 1}.${x.getDate()}`;
  $("#tripRange").textContent = end ? `${f(start)} – ${f(end)}` : f(start);
}

/* ───────── 탭 ───────── */
function go(tab) {
  state.tab = tab;
  document.querySelectorAll("#tabs button").forEach((x) => { if (x.dataset.go === tab) x.setAttribute("aria-current", "page"); else x.removeAttribute("aria-current"); });
  document.querySelectorAll("[data-tab]").forEach((p) => (p.hidden = p.dataset.tab !== tab));
  window.scrollTo(0, 0);
  if (tab === "schedule") drawMap();
}
$("#tabs").addEventListener("click", (e) => { const b = e.target.closest("button[data-go]"); if (b) go(b.dataset.go); });

/* ───────── ① 번역 ───────── */
// 자주 쓰는 말은 미리 번역해 둠 → 인터넷/서버 없이도 바로 사용
const PHRASES = [
  ["이거 주세요", "これをください", "고레오 쿠다사이"],
  ["화장실 어디예요?", "トイレはどこですか？", "토이레와 도코데스카?"],
  ["카드 되나요?", "カードは使えますか？", "카-도와 츠카에마스카?"],
  ["4명이에요", "4人です", "요닌데스"],
  ["추천 메뉴는 뭐예요?", "おすすめは何ですか？", "오스스메와 난데스카?"],
  ["계산해 주세요", "お会計お願いします", "오카이케- 오네가이시마스"],
  ["고수는 빼고, 덜 맵게 해주세요", "パクチー抜きで、辛さ控えめでお願いします。", "파쿠치- 누키데, 카라사 히카에메데 오네가이시마스"],
];
$("#phrases").innerHTML = PHRASES.slice(0, 6).map((p, i) => `<button class="chip" data-i="${i}">${p[0]}</button>`).join("");
$("#phrases").onclick = (e) => {
  const c = e.target.closest(".chip"); if (!c) return;
  const [ko, ja, read] = PHRASES[c.dataset.i];
  $("#koText").value = ko; showResult(ja, read);
};

function speak(text) {
  if (!("speechSynthesis" in window)) return toast("이 브라우저는 소리 듣기를 지원하지 않아요");
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text); u.lang = "ja-JP"; u.rate = 0.9;
  speechSynthesis.speak(u);
}

const ICON = {
  sound: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M16 9a4 4 0 0 1 0 6"/><path d="M19 6a8 8 0 0 1 0 12"/></svg>',
  expand: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5"/><path d="M20 9V4h-5"/><path d="M4 15v5h5"/><path d="M20 15v5h-5"/></svg>',
  copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
  pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/></svg>',
  photo: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>',
};

function showResult(ja, read) {
  const box = $("#trResult"); box.hidden = false;
  box.innerHTML = `<span class="label">일본어</span>
    <p class="ja">${esc(ja)}</p>${read ? `<p class="read">${esc(read)}</p>` : ""}
    <div class="acts">
      <button data-a="speak" aria-label="소리로 듣기">${ICON.sound}듣기</button>
      <button data-a="show">${ICON.expand}점원에게 보여주기</button>
      <button data-a="copy" class="sq" aria-label="복사">${ICON.copy}</button>
    </div>`;
  box.onclick = (e) => {
    const a = e.target.closest("[data-a]")?.dataset.a;
    if (a === "speak") speak(ja);
    if (a === "copy") navigator.clipboard?.writeText(ja).then(() => toast("복사했어요"), () => toast("복사하지 못했어요"));
    if (a === "show") { const s = $("#show"); s.innerHTML = `${esc(ja)}<small>화면을 누르면 닫혀요</small>`; s.hidden = false; }
  };
}
$("#show").onclick = () => ($("#show").hidden = true);

$("#btnTranslate").onclick = async () => {
  const text = $("#koText").value.trim(); if (!text) return toast("번역할 문장을 입력해주세요");
  const known = PHRASES.find((p) => p[0].replace(/\s/g, "") === text.replace(/\s/g, ""));
  if (known) return showResult(known[1], known[2]);
  if (isDemo) { // 데모 모드: 구글 번역으로 대신 열기
    window.open(`https://translate.google.com/?sl=ko&tl=ja&op=translate&text=${encodeURIComponent(text)}`, "_blank", "noopener");
    return;
  }
  const btn = $("#btnTranslate"); btn.disabled = true; btn.textContent = "번역 중…";
  try {
    const out = await store.translate({ mode: "text", text });
    const ja = (out.match(/JA:\s*(.+)/) || [, out])[1].trim();
    const read = (out.match(/READ:\s*(.+)/) || [, ""])[1].trim();
    showResult(ja, read);
  } catch (e) { fail(e); } finally { btn.disabled = false; btn.textContent = "번역하기"; }
};

// 사진은 폰 카메라 원본이 너무 커서, 보내기 전에 줄여요 (빠르고 저렴하게)
function shrinkImage(file, max = 1568) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL("image/jpeg", 0.85).split(",")[1]);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

$("#menuPhoto").onchange = async (e) => {
  const file = e.target.files[0]; e.target.value = ""; if (!file) return;
  const box = $("#menuResult"); box.hidden = false;
  if (isDemo) {
    box.innerHTML = `<h2 class="label">방금 찍은 메뉴판</h2>
      <p class="hint">메뉴판 사진 번역은 Claude API를 연결하면 쓸 수 있어요.<br>지금은 <a href="https://translate.google.com/?sl=ja&tl=ko&op=images" target="_blank" rel="noopener">구글 번역 이미지 모드</a>를 이용해주세요.</p>`;
    return;
  }
  box.innerHTML = `<h2 class="label">방금 찍은 메뉴판</h2><p class="hint">메뉴판을 읽는 중… (10초 정도 걸려요)</p>`;
  try {
    const image = await shrinkImage(file);
    const out = await store.translate({ mode: "image", image, mediaType: "image/jpeg" });
    const lines = out.split("\n").map((l) => l.split("|").map((s) => s.trim())).filter((p) => p.length >= 2);
    box.innerHTML = `<h2 class="label">방금 찍은 메뉴판</h2>` + (lines.length
      ? `<div class="menu-grid">${lines.map(([jp, ko, price]) =>
          `<span class="jp">${esc(jp)}</span><span>${esc(ko)}</span><span class="price">${esc(price && price !== "-" ? price : "")}</span>`).join("")}</div>`
      : `<p class="hint">${esc(out)}</p>`);
  } catch (err) { box.hidden = true; fail(err); }
};

/* ───────── 지도 ───────── */
let map, markers = [], line, geocoder, mapsReady;
function loadMaps() {
  if (!cfg.GOOGLE_MAPS_API_KEY) return Promise.resolve(false);
  if (mapsReady) return mapsReady;
  mapsReady = new Promise((resolve) => {
    window.__initMap = () => resolve(true);
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(cfg.GOOGLE_MAPS_API_KEY)}&v=weekly&libraries=marker&language=ko&region=JP&loading=async&callback=__initMap`;
    s.async = true; s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
  return mapsReady;
}

async function geocode(name) {
  if (!(await loadMaps())) return {};
  geocoder ||= new google.maps.Geocoder();
  try {
    const { results } = await geocoder.geocode({ address: name, componentRestrictions: { country: "JP" } });
    const r = results[0]; if (!r) return {};
    return { lat: r.geometry.location.lat(), lng: r.geometry.location.lng(), address: r.formatted_address };
  } catch { return {}; } // 못 찾으면 좌표 없이 저장 (목록에는 보임)
}

// 지도 키가 없을 때: 시안처럼 그린 그림 지도 위에 그날 장소를 핀으로 표시
function drawFakeMap() {
  const box = $("#map"); const c = dayColor(state.day);
  const pts = dayItems().filter((p) => p.lat != null);
  const W = 100, H = 100;
  let pos = [];
  if (pts.length) {
    const lats = pts.map((p) => p.lat), lngs = pts.map((p) => p.lng);
    const [a, b] = [Math.min(...lats), Math.max(...lats)], [l, r] = [Math.min(...lngs), Math.max(...lngs)];
    pos = pts.map((p) => ({
      x: 14 + (r === l ? 0.5 : (p.lng - l) / (r - l)) * 72,
      y: 16 + (b === a ? 0.5 : (b - p.lat) / (b - a)) * 66,
    }));
  }
  const path = pos.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" ");
  box.innerHTML = `
    <svg class="fake" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
      <path d="M66 0 C60 26 72 39 67 61 C63 80 74 91 71 100 L100 100 L100 0 Z" fill="#BFE0F7"/>
      <path d="M0 30 L100 17" stroke="#fff" stroke-width="2.6"/>
      <path d="M0 70 L100 52" stroke="#fff" stroke-width="2.6"/>
      <path d="M26 0 L34 100" stroke="#fff" stroke-width="2.2"/>
      <path d="M49 0 L53 100" stroke="#fff" stroke-width="1.8"/>
      <rect x="37" y="35" width="10" height="11" rx="2" fill="#CFE6D4"/>
      <rect x="6" y="78" width="14" height="13" rx="2" fill="#CFE6D4"/>
      ${pos.length > 1 ? `<path class="route" d="${path}" style="stroke:${c.solid}"/>` : ""}
    </svg>
    ${pos.map((p, i) => `<div class="fake-pin" style="left:${p.x}%;top:${p.y}%;${dayVars(state.day)}"><div class="pin">${i + 1}</div></div>`).join("")}
    <span class="note">${pts.length ? "그림 지도 · 구글 지도 키를 넣으면 실제 지도로 바뀌어요" : `Day ${state.day}에 장소를 넣으면 여기에 핀이 찍혀요`}</span>`;
}

async function drawMap() {
  if (!(await loadMaps())) return drawFakeMap();
  if (!map) {
    $("#map").innerHTML = "";
    map = new google.maps.Map($("#map"), { center: { lat: 35.681, lng: 139.767 }, zoom: 11, mapId: "DEMO_MAP_ID", disableDefaultUI: true, zoomControl: true });
  }
  markers.forEach((m) => (m.map = null)); markers = [];
  line?.setMap(null);
  const pts = dayItems().filter((p) => p.lat != null);
  pts.forEach((p, i) => {
    const el = document.createElement("div"); el.className = "pin"; el.style.cssText = dayVars(state.day); el.textContent = i + 1;
    markers.push(new google.maps.marker.AdvancedMarkerElement({ map, position: { lat: p.lat, lng: p.lng }, content: el, title: p.name }));
  });
  if (pts.length > 1) {
    line = new google.maps.Polyline({ map, path: pts.map((p) => ({ lat: p.lat, lng: p.lng })), strokeColor: dayColor(state.day).solid, strokeOpacity: 0, icons: [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 1, scale: 3 }, offset: "0", repeat: "12px" }] });
  }
  if (pts.length) {
    const b = new google.maps.LatLngBounds(); pts.forEach((p) => b.extend(p));
    pts.length === 1 ? (map.setCenter(pts[0]), map.setZoom(15)) : map.fitBounds(b, 40);
  }
}

/* ───────── ② 일정 ───────── */
const dayItems = (d = state.day) => state.schedule.filter((s) => s.day === d).sort((a, b) => a.position - b.position);
const gmapsLink = (p) => p.lat != null
  ? `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`
  : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name + " 東京")}`;
const totalDays = () => Math.max(state.days, ...state.schedule.map((s) => s.day), 1);
let openTools = null;

function renderDays() {
  const n = totalDays();
  $("#days").innerHTML = Array.from({ length: n }, (_, i) => {
    const d = i + 1;
    return `<button class="day-tab" role="tab" aria-selected="${state.day === d}" data-d="${d}" style="${dayVars(d)}"><b>Day ${d}</b>${start ? `<br><small>${dayDate(d)}</small>` : ""}</button>`;
  }).join("") + `<button class="day-add" data-d="+" aria-label="날짜 추가">+</button>`;
}
$("#days").onclick = (e) => {
  const d = e.target.closest("[data-d]")?.dataset.d; if (!d) return;
  if (d === "+") { state.days = totalDays() + 1; state.day = state.days; ls.set("days", state.days); }
  else state.day = +d;
  openTools = null; renderSchedule();
};

function renderSchedule() {
  renderDays();
  const items = dayItems();
  $("#dayList").style.cssText = dayVars(state.day);
  $("#dayList").innerHTML = items.length ? items.map((p, i) => `
    <li data-id="${p.id}">
      <div class="stop">
        <button class="num" data-a="tools" aria-label="${i + 1}번 순서 바꾸기·삭제" aria-expanded="${openTools === p.id}">${i + 1}</button>
        <div class="body">
          ${p.time ? `<div class="time">${esc(p.time)}</div>` : ""}
          <div class="name">${esc(p.name)}</div>
          ${p.memo || p.address ? `<div class="memo">${esc(p.memo || p.address)}</div>` : ""}
        </div>
        <a class="go" href="${gmapsLink(p)}" target="_blank" rel="noopener" aria-label="구글지도에서 열기">${ICON.pin}</a>
      </div>
      ${openTools === p.id ? `<div class="stop-tools"><button data-a="up">↑ 위로</button><button data-a="down">↓ 아래로</button><button data-a="del" class="del">삭제</button></div>` : ""}
    </li>`).join("")
    : `<li class="empty">Day ${state.day}에 아직 장소가 없어요.<br>아래 <b>+ 장소 추가</b>나 즐겨찾기의 <b>+ 일정</b>으로 넣어보세요.</li>`;

  // 구글지도 앱으로 하루 경로 열기 (API 키 없어도 동작)
  const link = $("#routeLink");
  const q = (p) => (p.lat != null ? `${p.lat},${p.lng}` : `${p.name} 東京`);
  if (items.length >= 2) {
    const mid = items.slice(1, -1).slice(0, 8).map(q).join("|");
    link.href = `https://www.google.com/maps/dir/?api=1&travelmode=transit&origin=${encodeURIComponent(q(items[0]))}&destination=${encodeURIComponent(q(items.at(-1)))}${mid ? `&waypoints=${encodeURIComponent(mid)}` : ""}`;
  } else if (items.length === 1) link.href = gmapsLink(items[0]);
  else link.removeAttribute("href");
  link.toggleAttribute("aria-disabled", !items.length);
  link.style.opacity = items.length ? "" : ".5";
  if (state.tab === "schedule") drawMap();
}

async function addToSchedule(place, day) {
  const position = Math.max(-1, ...dayItems(day).map((s) => s.position)) + 1;
  const row = await store.add("schedule_items", {
    day, position, time: place.time || null, name: place.name, memo: place.memo || null,
    address: place.address || null, lat: place.lat ?? null, lng: place.lng ?? null,
  });
  state.schedule.push(row);
}

$("#openAddPlace").onclick = () => { $("#addPlace").hidden = false; $("#planActions").hidden = true; $("#plName").focus(); };
$("#cancelPlace").onclick = () => { $("#addPlace").hidden = true; $("#planActions").hidden = false; $("#addPlace").reset(); };
$("#addPlace").onsubmit = async (e) => {
  e.preventDefault();
  const name = $("#plName").value.trim(); if (!name) return;
  const btn = e.submitter; btn.disabled = true;
  try {
    const geo = await geocode(name);
    await addToSchedule({ name, time: $("#plTime").value, memo: $("#plMemo").value.trim(), ...geo }, state.day);
    $("#cancelPlace").click(); renderSchedule(); renderFavs();
    if (cfg.GOOGLE_MAPS_API_KEY && geo.lat == null) toast("지도에서 위치를 못 찾았어요 (목록엔 저장됨)");
  } catch (err) { fail(err); } finally { btn.disabled = false; }
};

$("#dayList").onclick = async (e) => {
  const a = e.target.closest("[data-a]")?.dataset.a; if (!a) return;
  const id = e.target.closest("li[data-id]").dataset.id;
  if (a === "tools") { openTools = openTools === id ? null : id; return renderSchedule(); }
  try {
    if (a === "del") {
      await store.remove("schedule_items", id);
      state.schedule = state.schedule.filter((s) => s.id !== id); openTools = null;
      renderFavs();
    } else {
      const items = dayItems(), i = items.findIndex((s) => s.id === id), j = a === "up" ? i - 1 : i + 1;
      if (j < 0 || j >= items.length) return;
      const pi = items[i].position, pj = items[j].position === pi ? pi + (a === "up" ? -1 : 1) : items[j].position;
      items[i].position = pj; items[j].position = pi;
      await Promise.all([store.update("schedule_items", items[i].id, { position: pj }), store.update("schedule_items", items[j].id, { position: pi })]);
    }
    renderSchedule();
  } catch (err) { fail(err); }
};

/* ───────── ③ 즐겨찾기 ───────── */
const daysOf = (name) => [...new Set(state.schedule.filter((s) => s.name === name).map((s) => s.day))].sort((a, b) => a - b);

function renderFavs() {
  const favs = state.favorites.slice().reverse();
  $("#favCount").textContent = `가고 싶은 곳 ${favs.length}`;
  $("#favList").innerHTML = favs.length ? favs.map((f, i) => {
    const ds = daysOf(f.name);
    const action = ds.length
      ? `<button class="in-day" data-a="plan" style="${dayVars(ds[0])}" aria-label="Day ${ds.join(", ")}에 있음. 다른 날에도 넣기">${ICON.check}Day ${ds.join(", ")}</button>`
      : `<button class="btn primary" data-a="plan">+ 일정</button>`;
    return `
    <li class="fav" data-id="${f.id}">
      <div class="photo" role="img" aria-label="장소 사진 자리" style="${photoVars(i)}">${ICON.photo}<span>장소 사진</span>
        <button class="x" data-a="del" aria-label="${esc(f.name)} 삭제">✕</button></div>
      <div class="fav-foot">
        <div class="grow"><div class="name">${esc(f.name)}</div>${f.memo || f.address ? `<div class="memo">${esc(f.memo || f.address)}</div>` : ""}</div>
        ${action}
      </div>
    </li>`;
  }).join("")
    : `<li class="empty">가고 싶은 곳을 생각나는 대로 저장해두세요 ✈️</li>`;
}

$("#addFav").onsubmit = async (e) => {
  e.preventDefault();
  const name = $("#favName").value.trim(); if (!name) return;
  const btn = e.submitter; btn.disabled = true;
  try {
    const geo = await geocode(name);
    const row = await store.add("favorites", { name, memo: null, address: geo.address || null, lat: geo.lat ?? null, lng: geo.lng ?? null });
    state.favorites.push(row); e.target.reset(); renderFavs(); toast("저장했어요 ★");
  } catch (err) { fail(err); } finally { btn.disabled = false; }
};

// 몇 일차에 넣을까요? (아래에서 올라오는 시트)
function pickDay(fav, photoIdx) {
  const wrap = $("#sheet"), ok = $("#sheetOk");
  let chosen = null;
  $("#sheetName").textContent = fav.name;
  $("#sheetThumb").style.cssText = photoVars(photoIdx);
  const draw = () => {
    $("#sheetDays").innerHTML = Array.from({ length: totalDays() }, (_, i) => {
      const d = i + 1;
      return `<button class="day-pick" data-d="${d}" aria-pressed="${chosen === d}" style="${dayVars(d)}">Day ${d}${start ? `<br><small>${dayDate(d)}</small>` : ""}</button>`;
    }).join("");
    ok.disabled = !chosen;
    ok.textContent = chosen ? `Day ${chosen} 일정에 넣기` : "날짜를 골라주세요";
    ok.style.cssText = chosen ? dayVars(chosen) : "";
  };
  draw(); wrap.hidden = false;
  return new Promise((resolve) => {
    const close = (v) => { wrap.hidden = true; wrap.onclick = null; resolve(v); };
    wrap.onclick = (e) => {
      if (e.target.closest("[data-close]")) return close(null);
      const b = e.target.closest(".day-pick"); if (b) { chosen = +b.dataset.d; draw(); }
      if (e.target === ok && chosen) close(chosen);
    };
  });
}
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#sheet").hidden) $(".sheet-back").click(); });

$("#favList").onclick = async (e) => {
  const a = e.target.closest("[data-a]")?.dataset.a; if (!a) return;
  const li = e.target.closest("li.fav"), id = li.dataset.id, fav = state.favorites.find((f) => f.id === id);
  const idx = [...li.parentNode.children].indexOf(li);
  try {
    if (a === "del") {
      await store.remove("favorites", id);
      state.favorites = state.favorites.filter((f) => f.id !== id); renderFavs();
    }
    if (a === "plan") {
      const day = await pickDay(fav, idx); if (!day) return;
      await addToSchedule(fav, day); state.day = day; renderFavs(); renderSchedule();
      toast(`Day ${day} 일정에 넣었어요`);
    }
  } catch (err) { fail(err); }
};

/* ───────── 데모용 예시 (처음 한 번만) ───────── */
async function seedDemo() {
  if (!isDemo || ls.get("seeded")) return;
  const favs = [
    ["도쿄타워", "밤에 불 켜지면 사진", 35.6586, 139.7454],
    ["아키하바라", "게임센터 투어", 35.6984, 139.7731],
    ["시부야 스카이", "해 질 녘 전망대 예약", 35.6585, 139.7022],
    ["아사쿠사 센소지", "기모노 대여하고 단체사진", 35.7148, 139.7967],
    ["하라주쿠 다케시타 거리", "크레페 먹기", 35.6717, 139.7036],
    ["이치란 라멘 시부야", "24시간 · 칸막이 혼밥석", 35.6614, 139.7008],
  ];
  for (const [name, memo, lat, lng] of favs) await store.add("favorites", { name, memo, lat, lng, address: null });
  const plan = [
    [1, "11:00", "하라주쿠 다케시타 거리", "크레페 먹기", 35.6717, 139.7036],
    [1, "15:00", "메이지 신궁", "숲길 산책", 35.6764, 139.6993],
    [2, "09:30", "츠키지 장외시장", "아침은 여기서 해산물 꼬치", 35.6655, 139.7707],
    [2, "13:00", "팀랩 플래닛 도요스", "물에 들어가니까 반바지 챙기기", 35.6492, 139.7898],
    [2, "17:30", "오다이바 해변공원", "레인보우 브리지 야경 단체사진", 35.6300, 139.7744],
  ];
  const pos = {};
  for (const [day, time, name, memo, lat, lng] of plan) {
    pos[day] = (pos[day] ?? -1) + 1;
    await store.add("schedule_items", { day, position: pos[day], time, name, memo, lat, lng, address: null });
  }
  ls.set("seeded", "1");
  state.day = 2;
}

/* ───────── 시작 & 로그인 ───────── */
async function loadAll() {
  await seedDemo();
  [state.favorites, state.schedule] = await Promise.all([store.list("favorites"), store.list("schedule_items")]);
  renderFavs(); renderSchedule();
}

function showApp(on) {
  $("#app").hidden = !on; $("#tabs").hidden = !on; $("#login").hidden = on;
}

async function boot() {
  renderHeaderDates();
  if (location.hash === "#schedule" || location.hash === "#favorites") go(location.hash.slice(1));
  if (isDemo) { showApp(true); return loadAll().catch(fail); }
  const supabase = await store.init();
  const onSession = (session) => {
    if (session) { showApp(true); loadAll().catch(fail); } else showApp(false);
  };
  const { data } = await supabase.auth.getSession();
  onSession(data.session);
  supabase.auth.onAuthStateChange((evt, session) => { if (evt !== "INITIAL_SESSION" && evt !== "TOKEN_REFRESHED") onSession(session); });

  $("#loginForm").onsubmit = async (e) => {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithOtp({
      email: $("#email").value.trim(),
      options: { emailRedirectTo: location.origin + location.pathname },
    });
    $("#loginMsg").textContent = error ? `오류: ${error.message}` : "메일함을 확인해주세요! 링크를 누르면 자동으로 로그인돼요 📮";
  };
}
boot();
