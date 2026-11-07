import * as store from "./store.js";
const { supabase, isDemo } = store;
const cfg = window.APP_CONFIG || {};
const $ = (s) => document.querySelector(s);
const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const state = { favorites: [], schedule: [], day: 1, days: 3 };
try { state.days = +localStorage.getItem("tokyo-trip:days") || 3; } catch {}

function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("on");
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("on"), 2200);
}
const fail = (e) => { console.error(e); toast(e.message || "문제가 생겼어요"); };

/* ───────── 탭 ───────── */
$("#tabs").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-go]"); if (!b) return;
  document.querySelectorAll("#tabs button").forEach((x) => x.classList.toggle("on", x === b));
  document.querySelectorAll("[data-tab]").forEach((p) => (p.hidden = p.dataset.tab !== b.dataset.go));
  if (b.dataset.go === "schedule") drawMap();
});

/* ───────── ① 번역 ───────── */
// 자주 쓰는 문장은 미리 번역해 둠 → 인터넷/서버 없이도 바로 사용
const PHRASES = [
  ["이거 주세요", "これをください", "고레오 쿠다사이"],
  ["화장실 어디예요?", "トイレはどこですか？", "토이레와 도코데스카?"],
  ["카드 되나요?", "カードは使えますか？", "카-도와 츠카에마스카?"],
  ["추천 메뉴는 뭐예요?", "おすすめは何ですか？", "오스스메와 난데스카?"],
  ["두 명이에요", "二人です", "후타리데스"],
  ["계산해 주세요", "お会計お願いします", "오카이케- 오네가이시마스"],
];
$("#phrases").innerHTML = PHRASES.map((p, i) => `<button class="chip" data-i="${i}">${p[0]}</button>`).join("");
$("#phrases").onclick = (e) => {
  const c = e.target.closest(".chip"); if (!c) return;
  const [ko, ja, read] = PHRASES[c.dataset.i];
  $("#koText").value = ko; showResult(ja, read);
};

function speak(text) {
  if (!("speechSynthesis" in window)) return toast("이 브라우저는 음성을 지원하지 않아요");
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text); u.lang = "ja-JP"; u.rate = 0.9;
  speechSynthesis.speak(u);
}

function showResult(ja, read) {
  const box = $("#trResult"); box.hidden = false;
  box.innerHTML = `<div class="ja">${esc(ja)}</div><div class="read">${esc(read || "")}</div>
    <div class="row"><button class="btn ghost small" data-a="speak">🔊 듣기</button>
    <button class="btn ghost small" data-a="show">🔍 크게 보여주기</button>
    <button class="btn ghost small" data-a="copy">📋 복사</button></div>`;
  box.onclick = (e) => {
    const a = e.target.closest("[data-a]")?.dataset.a;
    if (a === "speak") speak(ja);
    if (a === "copy") navigator.clipboard?.writeText(ja).then(() => toast("복사했어요"));
    if (a === "show") { const s = $("#show"); s.innerHTML = `${esc(ja)}<small>화면을 누르면 닫혀요</small>`; s.hidden = false; }
  };
}
$("#show").onclick = () => ($("#show").hidden = true);

$("#btnTranslate").onclick = async () => {
  const text = $("#koText").value.trim(); if (!text) return toast("번역할 문장을 입력해주세요");
  if (isDemo) { // 데모 모드: 구글 번역으로 대신 열기
    window.open(`https://translate.google.com/?sl=ko&tl=ja&op=translate&text=${encodeURIComponent(text)}`, "_blank");
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
    box.innerHTML = `<p class="hint">메뉴판 사진 번역은 Supabase 연결 후 사용할 수 있어요.<br>지금은 <a href="https://translate.google.com/?sl=ja&tl=ko&op=images" target="_blank" rel="noopener">구글 번역 이미지 모드</a>를 이용해주세요.</p>`;
    return;
  }
  box.innerHTML = `<p class="hint">📷 메뉴판을 읽는 중… (10초 정도 걸려요)</p>`;
  try {
    const image = await shrinkImage(file);
    const out = await store.translate({ mode: "image", image, mediaType: "image/jpeg" });
    const lines = out.split("\n").map((l) => l.split("|").map((s) => s.trim())).filter((p) => p.length >= 2);
    box.innerHTML = lines.length
      ? `<h3 style="margin:0 0 8px">메뉴 번역</h3>` + lines.map(([jp, ko, price]) =>
          `<div class="menu-line"><span class="jp">${esc(jp)}</span><span>${esc(ko)}</span><span class="price">${esc(price && price !== "-" ? price : "")}</span></div>`).join("")
      : `<p>${esc(out)}</p>`;
  } catch (err) { box.innerHTML = ""; box.hidden = true; fail(err); }
};

/* ───────── 구글 지도 ───────── */
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

async function drawMap() {
  if (!(await loadMaps())) return;
  if (!map) {
    $("#map").innerHTML = "";
    map = new google.maps.Map($("#map"), { center: { lat: 35.681, lng: 139.767 }, zoom: 11, mapId: "DEMO_MAP_ID", disableDefaultUI: true, zoomControl: true });
  }
  markers.forEach((m) => (m.map = null)); markers = [];
  line?.setMap(null);
  const pts = dayItems().filter((p) => p.lat != null);
  pts.forEach((p, i) => {
    const el = document.createElement("div"); el.className = "pin"; el.innerHTML = `<b>${i + 1}</b>`;
    markers.push(new google.maps.marker.AdvancedMarkerElement({ map, position: { lat: p.lat, lng: p.lng }, content: el, title: p.name }));
  });
  if (pts.length > 1) {
    line = new google.maps.Polyline({ map, path: pts.map((p) => ({ lat: p.lat, lng: p.lng })), strokeColor: "#e8483b", strokeOpacity: 0.7, strokeWeight: 3 });
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

function renderDays() {
  const n = totalDays();
  $("#days").innerHTML = Array.from({ length: n }, (_, i) =>
    `<button class="chip ${state.day === i + 1 ? "on" : ""}" data-d="${i + 1}">Day ${i + 1} · ${dayItems(i + 1).length}</button>`).join("")
    + `<button class="chip" data-d="+">＋ Day</button>`;
}
$("#days").onclick = (e) => {
  const d = e.target.closest("[data-d]")?.dataset.d; if (!d) return;
  if (d === "+") { state.days = totalDays() + 1; state.day = state.days; try { localStorage.setItem("tokyo-trip:days", state.days); } catch {} }
  else state.day = +d;
  renderSchedule();
};

function renderSchedule() {
  renderDays();
  const items = dayItems();
  $("#dayList").innerHTML = items.length ? items.map((p, i) => `
    <li class="item" data-id="${p.id}">
      <span class="num">${i + 1}</span>
      <div class="body"><div class="name">${p.time ? `<small>${esc(p.time)}</small> ` : ""}${esc(p.name)}</div>
        <div class="meta">${esc(p.memo || p.address || "")}</div></div>
      <div class="acts">
        <button class="icon" data-a="up" title="위로">↑</button>
        <button class="icon" data-a="down" title="아래로">↓</button>
        <a class="icon" href="${gmapsLink(p)}" target="_blank" rel="noopener" title="구글지도">📍</a>
        <button class="icon" data-a="del" title="삭제">✕</button>
      </div></li>`).join("")
    : `<li class="empty">Day ${state.day}에 아직 장소가 없어요.<br>위에서 추가하거나 즐겨찾기에서 ＋를 눌러보세요.</li>`;

  // 구글지도 앱으로 하루 경로 열기 (API 키 없어도 동작)
  const link = $("#routeLink");
  if (items.length >= 2) {
    const q = (p) => (p.lat != null ? `${p.lat},${p.lng}` : `${p.name} 東京`);
    const mid = items.slice(1, -1).slice(0, 8).map(q).join("|");
    link.href = `https://www.google.com/maps/dir/?api=1&travelmode=transit&origin=${encodeURIComponent(q(items[0]))}&destination=${encodeURIComponent(q(items.at(-1)))}${mid ? `&waypoints=${encodeURIComponent(mid)}` : ""}`;
    link.hidden = false;
  } else link.hidden = true;
  if (!$('[data-tab="schedule"]').hidden) drawMap();
}

async function addToSchedule(place, day) {
  const position = Math.max(-1, ...dayItems(day).map((s) => s.position)) + 1;
  const row = await store.add("schedule_items", {
    day, position, time: place.time || null, name: place.name, memo: place.memo || null,
    address: place.address || null, lat: place.lat ?? null, lng: place.lng ?? null,
  });
  state.schedule.push(row);
}

$("#addPlace").onsubmit = async (e) => {
  e.preventDefault();
  const name = $("#plName").value.trim(); if (!name) return;
  const btn = e.submitter; btn.disabled = true;
  try {
    const geo = await geocode(name);
    await addToSchedule({ name, time: $("#plTime").value, memo: $("#plMemo").value.trim(), ...geo }, state.day);
    e.target.reset(); renderSchedule();
    if (cfg.GOOGLE_MAPS_API_KEY && geo.lat == null) toast("지도에서 위치를 못 찾았어요 (목록엔 저장됨)");
  } catch (err) { fail(err); } finally { btn.disabled = false; }
};

$("#dayList").onclick = async (e) => {
  const a = e.target.closest("[data-a]")?.dataset.a; if (!a) return;
  const id = e.target.closest(".item").dataset.id;
  try {
    if (a === "del") {
      await store.remove("schedule_items", id);
      state.schedule = state.schedule.filter((s) => s.id !== id);
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
function renderFavs() {
  $("#favList").innerHTML = state.favorites.length ? state.favorites.slice().reverse().map((f) => `
    <li class="item" data-id="${f.id}">
      <div class="body"><div class="name">★ ${esc(f.name)}</div><div class="meta">${esc(f.memo || f.address || "")}</div></div>
      <div class="acts">
        <a class="icon" href="${gmapsLink(f)}" target="_blank" rel="noopener" title="구글지도">📍</a>
        <button class="btn primary small" data-a="plan" title="일정에 추가">＋ 일정</button>
        <button class="icon" data-a="del" title="삭제">✕</button>
      </div></li>`).join("")
    : `<li class="empty">가고 싶은 곳을 생각나는 대로 저장해두세요 ✈️</li>`;
}

$("#addFav").onsubmit = async (e) => {
  e.preventDefault();
  const name = $("#favName").value.trim(); if (!name) return;
  const btn = e.submitter; btn.disabled = true;
  try {
    const geo = await geocode(name);
    const row = await store.add("favorites", { name, memo: $("#favMemo").value.trim() || null, address: geo.address || null, lat: geo.lat ?? null, lng: geo.lng ?? null });
    state.favorites.push(row); e.target.reset(); renderFavs(); toast("저장했어요 ★");
  } catch (err) { fail(err); } finally { btn.disabled = false; }
};

function pickDay() {
  const dlg = $("#dayPick");
  $("#dayPickBtns").innerHTML = Array.from({ length: totalDays() }, (_, i) => `<button class="chip" value="${i + 1}">Day ${i + 1}</button>`).join("");
  return new Promise((resolve) => {
    dlg.onclose = () => resolve(dlg.returnValue ? +dlg.returnValue : null);
    dlg.returnValue = ""; dlg.showModal();
  });
}

$("#favList").onclick = async (e) => {
  const a = e.target.closest("[data-a]")?.dataset.a; if (!a) return;
  const id = e.target.closest(".item").dataset.id, fav = state.favorites.find((f) => f.id === id);
  try {
    if (a === "del") {
      await store.remove("favorites", id);
      state.favorites = state.favorites.filter((f) => f.id !== id); renderFavs();
    }
    if (a === "plan") {
      const day = await pickDay(); if (!day) return;
      await addToSchedule(fav, day); state.day = day; renderSchedule();
      toast(`Day ${day} 일정에 넣었어요`);
    }
  } catch (err) { fail(err); }
};

/* ───────── 시작 & 로그인 ───────── */
async function loadAll() {
  [state.favorites, state.schedule] = await Promise.all([store.list("favorites"), store.list("schedule_items")]);
  renderFavs(); renderSchedule();
}

function showApp(on) {
  $("#app").hidden = !on; $("#tabs").hidden = !on; $("#login").hidden = on;
}

async function boot() {
  if (isDemo) {
    const b = $("#banner"); b.hidden = false;
    b.innerHTML = "🧪 <b>데모 모드</b> — 데이터가 이 브라우저에만 저장돼요. <code>js/config.js</code>에 Supabase 정보를 넣으면 어디서든 동기화돼요.";
    showApp(true); return loadAll().catch(fail);
  }
  const onSession = (session) => {
    if (session) {
      $("#who").innerHTML = `${esc(session.user.email || "")} <button class="btn ghost small" id="logout">로그아웃</button>`;
      $("#logout").onclick = () => supabase.auth.signOut();
      showApp(true); loadAll().catch(fail);
    } else { $("#who").innerHTML = ""; showApp(false); }
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
