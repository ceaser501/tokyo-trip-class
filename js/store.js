// 저장소: Supabase가 설정돼 있으면 Supabase(DB), 아니면 브라우저(localStorage)에 저장
// 앱 코드는 이 파일의 함수(list/add/update/remove)만 부르면 돼서, 어디에 저장되는지 신경 안 써도 됩니다.
const cfg = window.APP_CONFIG || {};
export const isDemo = !(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);
export let supabase = null;

// Supabase 키가 있을 때만 라이브러리를 불러와요 (데모 모드는 인터넷 라이브러리 없이 동작)
export async function init() {
  if (isDemo || supabase) return supabase;
  const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm");
  supabase = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  return supabase;
}

const KEY = (t) => `tokyo-trip:${t}`;
const readLocal = (t) => { try { return JSON.parse(localStorage.getItem(KEY(t)) || "[]"); } catch { return []; } };
const writeLocal = (t, rows) => { try { localStorage.setItem(KEY(t), JSON.stringify(rows)); } catch {} };
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));

export async function list(table) {
  if (isDemo) return readLocal(table);
  const { data, error } = await supabase.from(table).select("*").order("created_at");
  if (error) throw error;
  return data;
}

export async function add(table, row) {
  if (isDemo) {
    const full = { id: uid(), created_at: new Date().toISOString(), ...row };
    writeLocal(table, [...readLocal(table), full]);
    return full;
  }
  const { data, error } = await supabase.from(table).insert(row).select().single();
  if (error) throw error;
  return data;
}

export async function update(table, id, patch) {
  if (isDemo) {
    writeLocal(table, readLocal(table).map((r) => (r.id === id ? { ...r, ...patch } : r)));
    return;
  }
  const { error } = await supabase.from(table).update(patch).eq("id", id);
  if (error) throw error;
}

export async function remove(table, id) {
  if (isDemo) { writeLocal(table, readLocal(table).filter((r) => r.id !== id)); return; }
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) throw error;
}

// 번역: Supabase Edge Function("translate")을 호출
export async function translate(body) {
  const { data, error } = await supabase.functions.invoke("translate", { body });
  if (error) {
    let msg = "번역 서버에 연결하지 못했어요.";
    try { msg = (await error.context.json()).error || msg; } catch {}
    throw new Error(msg);
  }
  return data.result;
}
