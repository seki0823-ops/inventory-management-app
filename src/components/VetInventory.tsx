"use client";
import { useState, useMemo, useEffect } from "react";
import { supabase } from "@/lib/supabase";

const SPECIES = ["すべて","犬","猫","エキゾチック"];
const MAKERS  = ["すべて","ロイヤルカナン","ヒルズ","ドクターズ","ピュリナ","その他"];
const UNITS   = ["袋","缶","箱","個","kg"];

const nowStr = () => new Date().toLocaleString("ja-JP",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"});
const daysUntil = (d: string) => Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
const lotStatus = (days: number) => {
  if (days <= 0)  return { key:"expired", label:"期限切れ", color:"#DC2626", bg:"#FEE2E2" };
  if (days <= 14) return { key:"danger",  label:`残${days}日`, color:"#D97706", bg:"#FEF3C7" };
  if (days <= 30) return { key:"warn",    label:`残${days}日`, color:"#A16207", bg:"#FEF9C3" };
  return              { key:"ok",      label:`残${days}日`, color:"#16A34A", bg:"#F0FDF4" };
};

// ── 型定義 ──────────────────────────────────────
type Master = { id:number; name:string; maker:string; species:string; unit:string; low_alert:number; };
type Lot    = { id:number; master_id:number; qty:number; expiry:string; added_at:string; note:string; };
type Order  = { id:number; master_id:number; product_name:string; qty:number; unit:string; ordered_by:string; status:string; memo:string; ordered_at:string; edited_at?:string; received_at?:string; received_by?:string; received_qty?:number; };

// ── Icon ────────────────────────────────────────
const Icon = ({ name, size=20, color="currentColor" }: { name:string; size?:number; color?:string }) => {
  const d: Record<string,React.ReactNode> = {
    plus:    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/>,
    search:  <><circle cx="11" cy="11" r="8"/><path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35"/></>,
    edit:    <path strokeLinecap="round" strokeLinejoin="round" d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z"/>,
    trash:   <><polyline points="3 6 5 6 21 6"/><path strokeLinecap="round" strokeLinejoin="round" d="M19 6l-1 14H6L5 6m5 0V4h4v2"/></>,
    x:       <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
    alert:   <><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></>,
    truck:   <><rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></>,
    package: <><path strokeLinecap="round" strokeLinejoin="round" d="M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16v-2"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></>,
    chevron: <polyline points="6 9 12 15 18 9"/>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">{d[name]}</svg>;
};

const inp: React.CSSProperties = { width:"100%", padding:"10px 12px", borderRadius:10, border:"1.5px solid #CBD5E1", fontSize:15, boxSizing:"border-box", outline:"none", color:"#0F172A", background:"#F8FAFC" };
const sel: React.CSSProperties = { ...inp, appearance:"none" };
const Field = ({ label, children }: { label:string; children:React.ReactNode }) => (
  <div style={{ marginBottom:14 }}>
    <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#475569", marginBottom:5 }}>{label}</label>
    {children}
  </div>
);

const Modal = ({ title, onClose, children }: { title:string; onClose:()=>void; children:React.ReactNode }) => (
  <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", display:"flex", alignItems:"flex-end", justifyContent:"center", zIndex:100 }}>
    <div style={{ background:"#fff", borderRadius:"20px 20px 0 0", width:"100%", maxWidth:480, padding:"24px 20px 40px", boxShadow:"0 -8px 40px rgba(0,0,0,0.18)", animation:"slideUp .25s ease" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <h2 style={{ margin:0, fontSize:18, fontWeight:700, color:"#134E4A" }}>{title}</h2>
        <button onClick={onClose} style={{ background:"#F1F5F9", border:"none", borderRadius:9999, width:32, height:32, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer" }}>
          <Icon name="x" size={16} color="#64748B"/>
        </button>
      </div>
      {children}
    </div>
  </div>
);

// ── ローディング画面 ─────────────────────────────
const Loading = () => (
  <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", flexDirection:"column", gap:12 }}>
    <div style={{ width:40, height:40, border:"4px solid #E2E8F0", borderTop:"4px solid #0D9488", borderRadius:"50%", animation:"spin 1s linear infinite" }}/>
    <p style={{ color:"#64748B", fontSize:14 }}>データを読み込み中…</p>
  </div>
);

// ── MasterFormModal ──────────────────────────────
const MasterFormModal = ({ master, onClose, onSave }: { master?:Master; onClose:()=>void; onSave:(m:Omit<Master,"id">)=>Promise<void> }) => {
  const blank = { name:"", maker:"ロイヤルカナン", species:"犬", unit:"袋", low_alert:5 };
  const [form, setForm] = useState<Omit<Master,"id">>(master ? { name:master.name, maker:master.maker, species:master.species, unit:master.unit, low_alert:master.low_alert } : blank);
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string|number) => setForm(f=>({...f,[k]:v}));
  const save = async () => {
    if (!form.name.trim()) return alert("商品名を入力してください");
    setSaving(true);
    await onSave(form);
    setSaving(false);
    onClose();
  };
  return (
    <Modal title={master ? "商品マスターを編集" : "商品マスターを追加"} onClose={onClose}>
      <div style={{ maxHeight:"60vh", overflowY:"auto" }}>
        <Field label="商品名"><input style={inp} value={form.name} onChange={e=>set("name",e.target.value)} placeholder="例：消化器サポート（犬用）"/></Field>
        <Field label="メーカー">
          <select style={sel} value={form.maker} onChange={e=>set("maker",e.target.value)}>
            {MAKERS.filter(m=>m!=="すべて").map(m=><option key={m}>{m}</option>)}
          </select>
        </Field>
        <Field label="対象動物">
          <div style={{ display:"flex", gap:8 }}>
            {SPECIES.filter(s=>s!=="すべて").map(s=>(
              <button key={s} onClick={()=>set("species",s)} style={{ flex:1, padding:"8px 0", borderRadius:9, border:"none", fontWeight:600, fontSize:13, cursor:"pointer", background:form.species===s?"#0D9488":"#F1F5F9", color:form.species===s?"#fff":"#64748B" }}>{s}</button>
            ))}
          </div>
        </Field>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
          <Field label="単位">
            <select style={sel} value={form.unit} onChange={e=>set("unit",e.target.value)}>
              {UNITS.map(u=><option key={u}>{u}</option>)}
            </select>
          </Field>
          <Field label="在庫アラート閾値">
            <input style={inp} type="number" value={form.low_alert} min={1} onChange={e=>set("low_alert",Number(e.target.value))}/>
          </Field>
        </div>
      </div>
      <button onClick={save} disabled={saving} style={{ width:"100%", padding:"14px 0", borderRadius:12, border:"none", background:"#0D9488", color:"#fff", fontWeight:700, fontSize:16, cursor:"pointer", marginTop:12, opacity:saving?0.7:1 }}>
        {saving ? "保存中…" : master ? "変更を保存" : "マスターを登録"}
      </button>
    </Modal>
  );
};

// ── LotFormModal ─────────────────────────────────
const LotFormModal = ({ master, onClose, onSave }: { master:Master; onClose:()=>void; onSave:(l:Omit<Lot,"id">)=>Promise<void> }) => {
  const [qty, setQty]       = useState(1);
  const [expiry, setExpiry] = useState("");
  const [note, setNote]     = useState("");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!expiry) return alert("消費期限を入力してください");
    setSaving(true);
    await onSave({ master_id:master.id, qty, expiry, added_at:nowStr(), note });
    setSaving(false);
    onClose();
  };
  return (
    <Modal title={`在庫ロットを追加：${master.name}`} onClose={onClose}>
      <Field label="数量">
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <button onClick={()=>setQty(q=>Math.max(1,q-1))} style={{ width:40, height:40, borderRadius:10, border:"1.5px solid #CBD5E1", background:"#F8FAFC", cursor:"pointer", fontSize:20 }}>－</button>
          <span style={{ flex:1, textAlign:"center", fontSize:28, fontWeight:900, color:"#0F172A" }}>{qty}</span>
          <button onClick={()=>setQty(q=>q+1)} style={{ width:40, height:40, borderRadius:10, border:"1.5px solid #CBD5E1", background:"#F8FAFC", cursor:"pointer", fontSize:20 }}>＋</button>
        </div>
      </Field>
      <Field label="消費期限"><input style={inp} type="date" value={expiry} onChange={e=>setExpiry(e.target.value)}/></Field>
      <Field label="メモ（任意）"><input style={inp} value={note} onChange={e=>setNote(e.target.value)} placeholder="例：〇〇ロット"/></Field>
      <button onClick={save} disabled={saving} style={{ width:"100%", padding:"14px 0", borderRadius:12, border:"none", background:"#0D9488", color:"#fff", fontWeight:700, fontSize:16, cursor:"pointer", marginTop:4, opacity:saving?0.7:1 }}>
        {saving ? "保存中…" : "＋ ロットを追加"}
      </button>
    </Modal>
  );
};

// ── LotSellModal ─────────────────────────────────
const LotSellModal = ({ master, lots, onClose, onSell }: { master:Master; lots:Lot[]; onClose:()=>void; onSell:(lotId:number, qty:number)=>Promise<void> }) => {
  const sorted = [...lots].sort((a,b)=>a.expiry.localeCompare(b.expiry));
  const [lotId, setLotId] = useState(sorted[0]?.id ?? 0);
  const [qty, setQty]     = useState(1);
  const [saving, setSaving] = useState(false);
  const selected = lots.find(l=>l.id===lotId);
  const sell = async () => {
    if (!selected || qty > selected.qty) return alert("在庫が足りません");
    setSaving(true);
    await onSell(lotId, qty);
    setSaving(false);
    onClose();
  };
  return (
    <Modal title={`販売記録：${master.name}`} onClose={onClose}>
      <Field label="ロットを選択（期限の近い順）">
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {sorted.map(l => {
            const st = lotStatus(daysUntil(l.expiry));
            return (
              <button key={l.id} onClick={()=>setLotId(l.id)} style={{ padding:"10px 12px", borderRadius:10, border:`2px solid ${lotId===l.id?st.color:"#E2E8F0"}`, background:lotId===l.id?st.bg:"#F8FAFC", textAlign:"left", cursor:"pointer" }}>
                <div style={{ display:"flex", justifyContent:"space-between" }}>
                  <span style={{ fontSize:13, fontWeight:700, color:"#0F172A" }}>{l.expiry}</span>
                  <span style={{ fontSize:12, fontWeight:700, color:st.color, background:st.bg, padding:"2px 8px", borderRadius:999 }}>{st.label}</span>
                </div>
                <div style={{ fontSize:12, color:"#64748B", marginTop:3 }}>在庫 {l.qty}{master.unit}{l.note&&`　📝 ${l.note}`}</div>
              </button>
            );
          })}
        </div>
      </Field>
      {selected && (
        <Field label="販売数">
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <button onClick={()=>setQty(q=>Math.max(1,q-1))} style={{ width:40, height:40, borderRadius:10, border:"1.5px solid #CBD5E1", background:"#F8FAFC", cursor:"pointer", fontSize:20 }}>－</button>
            <span style={{ flex:1, textAlign:"center", fontSize:28, fontWeight:900, color:"#0F172A" }}>{qty}</span>
            <button onClick={()=>setQty(q=>Math.min(selected.qty,q+1))} style={{ width:40, height:40, borderRadius:10, border:"1.5px solid #CBD5E1", background:"#F8FAFC", cursor:"pointer", fontSize:20 }}>＋</button>
          </div>
          <div style={{ textAlign:"center", fontSize:12, color:"#94A3B8", marginTop:4 }}>
            残: <strong>{selected.qty}</strong> → <strong style={{ color:"#DC2626" }}>{selected.qty-qty}</strong>{master.unit}
          </div>
        </Field>
      )}
      <button onClick={sell} disabled={saving} style={{ width:"100%", padding:"14px 0", borderRadius:12, border:"none", background:"#DC2626", color:"#fff", fontWeight:700, fontSize:16, cursor:"pointer", marginTop:4, opacity:saving?0.7:1 }}>
        {saving ? "記録中…" : "販売を記録"}
      </button>
    </Modal>
  );
};

// ── OrderFormModal ───────────────────────────────
const OrderFormModal = ({ master, orders, onClose, onOrder }: { master:Master; orders:Order[]; onClose:()=>void; onOrder:(o:Omit<Order,"id">)=>Promise<void> }) => {
  const pending = orders.filter(o=>o.master_id===master.id && o.status==="ordered");
  const [qty, setQty]   = useState(1);
  const [who, setWho]   = useState("");
  const [memo, setMemo] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!who.trim()) return alert("発注者名を入力してください");
    setSaving(true);
    await onOrder({ master_id:master.id, product_name:master.name, qty, unit:master.unit, ordered_by:who, status:"ordered", memo, ordered_at:nowStr() });
    setSaving(false);
    onClose();
  };
  return (
    <Modal title={`発注を起票：${master.name}`} onClose={onClose}>
      {pending.length>0 && (
        <div style={{ background:"#FEF3C7", border:"1px solid #FDE68A", borderRadius:12, padding:"12px 14px", marginBottom:16 }}>
          <div style={{ fontSize:13, fontWeight:700, color:"#92400E", marginBottom:4 }}>⚠️ 発注中の注文があります</div>
          {pending.map(o=><div key={o.id} style={{ fontSize:12, color:"#78350F" }}>• {o.ordered_at}　{o.qty}{o.unit}　担当:{o.ordered_by}</div>)}
        </div>
      )}
      <Field label="発注数">
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <button onClick={()=>setQty(q=>Math.max(1,q-1))} style={{ width:40, height:40, borderRadius:10, border:"1.5px solid #CBD5E1", background:"#F8FAFC", cursor:"pointer", fontSize:20 }}>－</button>
          <span style={{ flex:1, textAlign:"center", fontSize:28, fontWeight:900, color:"#0F172A" }}>{qty}</span>
          <button onClick={()=>setQty(q=>q+1)} style={{ width:40, height:40, borderRadius:10, border:"1.5px solid #CBD5E1", background:"#F8FAFC", cursor:"pointer", fontSize:20 }}>＋</button>
        </div>
      </Field>
      <Field label="発注者名"><input style={inp} value={who} onChange={e=>setWho(e.target.value)} placeholder="例：田中"/></Field>
      <Field label="メモ（任意）"><input style={inp} value={memo} onChange={e=>setMemo(e.target.value)} placeholder="例：緊急、定期発注"/></Field>
      <button onClick={submit} disabled={saving} style={{ width:"100%", padding:"14px 0", borderRadius:12, border:"none", background:pending.length>0?"#D97706":"#6366F1", color:"#fff", fontWeight:700, fontSize:16, cursor:"pointer", marginTop:4, opacity:saving?0.7:1 }}>
        {saving ? "起票中…" : pending.length>0 ? "⚠️ 二重承知で発注する" : "📋 発注を起票する"}
      </button>
    </Modal>
  );
};

// ── OrderListModal ───────────────────────────────
const OrderListModal = ({ orders, onClose, onReceive, onCancel }: { orders:Order[]; onClose:()=>void; onReceive:(o:Order)=>void; onCancel:(id:number)=>Promise<void> }) => {
  const [tab, setTab]       = useState("ordered");
  const [confirmId, setConfirmId] = useState<number|null>(null);
  const list = orders.filter(o=>o.status===tab);
  return (
    <Modal title="📋 発注一覧" onClose={onClose}>
      <div style={{ display:"flex", gap:6, marginBottom:16 }}>
        {(["ordered","received","cancelled"] as const).map((v,_,__)=>{
          const labels: Record<string,string> = { ordered:"発注中", received:"入荷済み", cancelled:"キャンセル" };
          const cnt = orders.filter(o=>o.status===v).length;
          return (
            <button key={v} onClick={()=>{setTab(v);setConfirmId(null);}} style={{ flex:1, padding:"8px 4px", borderRadius:9, border:"none", fontWeight:700, fontSize:12, cursor:"pointer", background:tab===v?"#6366F1":"#F1F5F9", color:tab===v?"#fff":"#64748B" }}>
              {labels[v]}{cnt>0&&<span style={{ marginLeft:4, background:tab===v?"rgba(255,255,255,0.3)":"#E2E8F0", borderRadius:999, padding:"0 5px", fontSize:11 }}>{cnt}</span>}
            </button>
          );
        })}
      </div>
      <div style={{ maxHeight:"52vh", overflowY:"auto" }}>
        {list.length===0 ? <p style={{ textAlign:"center", color:"#94A3B8", padding:"32px 0" }}>なし</p>
          : list.map(o=>(
            <div key={o.id} style={{ background:"#F8FAFC", borderRadius:12, padding:"12px 14px", marginBottom:10, border:confirmId===o.id?"1.5px solid #FCA5A5":"1px solid #E2E8F0" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:"#0F172A" }}>{o.product_name}</div>
                  <div style={{ fontSize:12, color:"#64748B", marginTop:2 }}>{o.ordered_at}　担当: {o.ordered_by}</div>
                  {o.memo&&<div style={{ fontSize:11, color:"#94A3B8", marginTop:2 }}>📝 {o.memo}</div>}
                  {o.received_at&&<div style={{ fontSize:11, color:"#0D9488", marginTop:2 }}>✅ {o.received_at}　受取: {o.received_by}</div>}
                </div>
                <div style={{ textAlign:"right", flexShrink:0, marginLeft:8 }}>
                  <div style={{ fontSize:20, fontWeight:900, color:o.status==="ordered"?"#6366F1":o.status==="received"?"#0D9488":"#94A3B8" }}>{o.status==="received"?(o.received_qty??o.qty):o.qty}{o.unit}</div>
                  {o.status==="ordered"&&confirmId!==o.id&&(
                    <div style={{ display:"flex", gap:4, marginTop:6, justifyContent:"flex-end" }}>
                      <button onClick={()=>onReceive(o)} style={{ padding:"5px 9px", borderRadius:7, border:"none", background:"#0D9488", color:"#fff", fontSize:11, fontWeight:700, cursor:"pointer" }}>入荷確定</button>
                      <button onClick={()=>setConfirmId(o.id)} style={{ padding:"5px 9px", borderRadius:7, border:"none", background:"#FEE2E2", color:"#DC2626", fontSize:11, fontWeight:700, cursor:"pointer" }}>取消</button>
                    </div>
                  )}
                </div>
              </div>
              {o.status==="ordered"&&confirmId===o.id&&(
                <div style={{ marginTop:10, padding:"10px 12px", borderRadius:10, background:"#FEF2F2", border:"1px solid #FECACA" }}>
                  <div style={{ fontSize:13, fontWeight:700, color:"#DC2626", marginBottom:8 }}>この発注をキャンセルしますか？</div>
                  <div style={{ display:"flex", gap:8 }}>
                    <button onClick={async()=>{await onCancel(o.id);setConfirmId(null);}} style={{ flex:1, padding:"8px 0", borderRadius:8, border:"none", background:"#DC2626", color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer" }}>キャンセルする</button>
                    <button onClick={()=>setConfirmId(null)} style={{ flex:1, padding:"8px 0", borderRadius:8, border:"none", background:"#F1F5F9", color:"#64748B", fontSize:13, fontWeight:700, cursor:"pointer" }}>戻る</button>
                  </div>
                </div>
              )}
            </div>
          ))}
      </div>
    </Modal>
  );
};

// ── ReceiveModal ─────────────────────────────────
const ReceiveModal = ({ order, onClose, onReceive }: { order:Order; onClose:()=>void; onReceive:(orderId:number, qty:number, expiry:string, who:string, note:string)=>Promise<void> }) => {
  const [qty, setQty]       = useState(order.qty);
  const [expiry, setExpiry] = useState("");
  const [who, setWho]       = useState("");
  const [note, setNote]     = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!expiry) return alert("消費期限を入力してください");
    if (!who.trim()) return alert("受取者名を入力してください");
    setSaving(true);
    await onReceive(order.id, qty, expiry, who, note);
    setSaving(false);
    onClose();
  };
  return (
    <Modal title="入荷を確定" onClose={onClose}>
      <div style={{ background:"#F0FDF4", borderRadius:12, padding:"12px 14px", marginBottom:16 }}>
        <div style={{ fontSize:13, fontWeight:700, color:"#134E4A" }}>{order.product_name}</div>
        <div style={{ fontSize:12, color:"#166534", marginTop:3 }}>発注日: {order.ordered_at}　担当: {order.ordered_by}　発注数: {order.qty}{order.unit}</div>
      </div>
      <Field label="実際の受取数量">
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <button onClick={()=>setQty(q=>Math.max(1,q-1))} style={{ width:40, height:40, borderRadius:10, border:"1.5px solid #CBD5E1", background:"#F8FAFC", cursor:"pointer", fontSize:20 }}>－</button>
          <span style={{ flex:1, textAlign:"center", fontSize:28, fontWeight:900, color:"#0F172A" }}>{qty}</span>
          <button onClick={()=>setQty(q=>q+1)} style={{ width:40, height:40, borderRadius:10, border:"1.5px solid #CBD5E1", background:"#F8FAFC", cursor:"pointer", fontSize:20 }}>＋</button>
        </div>
        {qty!==order.qty&&<div style={{ textAlign:"center", fontSize:12, color:"#D97706", marginTop:4 }}>⚠️ 発注数（{order.qty}{order.unit}）と異なります</div>}
      </Field>
      <Field label="消費期限（このロット）"><input style={inp} type="date" value={expiry} onChange={e=>setExpiry(e.target.value)}/></Field>
      <Field label="受取者名"><input style={inp} value={who} onChange={e=>setWho(e.target.value)} placeholder="例：山田"/></Field>
      <Field label="メモ（任意）"><input style={inp} value={note} onChange={e=>setNote(e.target.value)} placeholder="例：〇〇ロット"/></Field>
      <button onClick={submit} disabled={saving} style={{ width:"100%", padding:"14px 0", borderRadius:12, border:"none", background:"#0D9488", color:"#fff", fontWeight:700, fontSize:16, cursor:"pointer", marginTop:4, opacity:saving?0.7:1 }}>
        {saving ? "確定中…" : "✅ 入荷を確定して在庫に追加"}
      </button>
    </Modal>
  );
};

// ── LotStatusBar ─────────────────────────────────
const LotStatusBar = ({ counts }: { counts:Record<string,number> }) => {
  const items = [
    { key:"expired", color:"#DC2626", label:"期限切れ" },
    { key:"danger",  color:"#F97316", label:"14日以内" },
    { key:"warn",    color:"#EAB308", label:"30日以内" },
    { key:"ok",      color:"#22C55E", label:"余裕あり" },
  ].filter(i=>counts[i.key]>0);
  if (!items.length) return null;
  return (
    <div style={{ marginTop:10 }}>
      <div style={{ display:"flex", height:6, borderRadius:999, overflow:"hidden", gap:1 }}>
        {items.map(i=><div key={i.key} style={{ flex:counts[i.key], background:i.color }}/>)}
      </div>
      <div style={{ display:"flex", gap:10, marginTop:5, flexWrap:"wrap" }}>
        {items.map(i=><span key={i.key} style={{ fontSize:11, color:i.color, fontWeight:600 }}>● {i.label} {counts[i.key]}ロット</span>)}
      </div>
    </div>
  );
};

// ── ProductCard ──────────────────────────────────
const speciesEmoji: Record<string,string> = { 犬:"🐶", 猫:"🐱", エキゾチック:"🐰" };

const ProductCard = ({ master, lots, pendingOrders, onAddLot, onSell, onOrder, onEditMaster, onDeleteLot, onDeleteMaster }:
  { master:Master; lots:Lot[]; pendingOrders:Order[]; onAddLot:()=>void; onSell:()=>void; onOrder:()=>void; onEditMaster:()=>void; onDeleteLot:(id:number)=>Promise<void>; onDeleteMaster:()=>void }) => {
  const [expanded, setExpanded]     = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [confirmLotId, setConfirmLotId] = useState<number|null>(null);

  const myOrders   = pendingOrders.filter(o=>o.master_id===master.id);
  const pendingQty = myOrders.reduce((s,o)=>s+o.qty,0);
  const totalQty   = lots.reduce((s,l)=>s+l.qty,0);
  const counts     = { ok:0, warn:0, danger:0, expired:0 } as Record<string,number>;
  lots.forEach(l=>{ counts[lotStatus(daysUntil(l.expiry)).key]++; });
  const soonest  = lots.length ? lots.reduce((a,b)=>a.expiry<b.expiry?a:b) : null;
  const isOut    = totalQty===0;
  const isLow    = totalQty>0 && totalQty<=master.low_alert;
  const borderColor = isOut?"#DC2626":(counts.expired>0||counts.danger>0)?"#F97316":isLow?"#D97706":"#0D9488";

  return (
    <div style={{ background:"#fff", borderRadius:16, boxShadow:"0 1px 6px rgba(0,0,0,0.07)", padding:"14px", marginBottom:12, borderLeft:`4px solid ${borderColor}` }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
        <div style={{ flex:1, marginRight:8 }}>
          <div style={{ display:"flex", alignItems:"center", gap:5, flexWrap:"wrap", marginBottom:4 }}>
            <span style={{ fontSize:13 }}>{speciesEmoji[master.species]}</span>
            <span style={{ fontSize:11, fontWeight:600, color:"#64748B", background:"#F1F5F9", padding:"2px 7px", borderRadius:999 }}>{master.maker}</span>
            {myOrders.length>0&&<span style={{ fontSize:11, fontWeight:700, color:"#fff", background:"#6366F1", padding:"2px 8px", borderRadius:999 }}>📋 発注中 {pendingQty}{master.unit}</span>}
            {isOut&&<span style={{ fontSize:11, fontWeight:700, color:"#fff", background:"#DC2626", padding:"2px 7px", borderRadius:999 }}>在庫切れ</span>}
            {isLow&&!isOut&&<span style={{ fontSize:11, fontWeight:700, color:"#D97706", background:"#FEF3C7", padding:"2px 7px", borderRadius:999 }}>残り少</span>}
          </div>
          <div style={{ fontSize:15, fontWeight:700, color:"#0F172A" }}>{master.name}</div>
        </div>
        <div style={{ display:"flex", gap:5 }}>
          <button onClick={onEditMaster} style={{ background:"#F1F5F9", border:"none", borderRadius:8, width:30, height:30, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer" }}><Icon name="edit" size={13} color="#475569"/></button>
          <button onClick={()=>setConfirmDel(true)} style={{ background:"#FEE2E2", border:"none", borderRadius:8, width:30, height:30, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer" }}><Icon name="trash" size={13} color="#DC2626"/></button>
        </div>
      </div>

      {confirmDel&&(
        <div style={{ margin:"8px 0", padding:"10px 12px", borderRadius:10, background:"#FEF2F2", border:"1px solid #FECACA" }}>
          <div style={{ fontSize:13, fontWeight:700, color:"#DC2626", marginBottom:8 }}>この商品を削除しますか？（全ロット削除）</div>
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={()=>{onDeleteMaster();setConfirmDel(false);}} style={{ flex:1, padding:"8px 0", borderRadius:8, border:"none", background:"#DC2626", color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer" }}>削除する</button>
            <button onClick={()=>setConfirmDel(false)} style={{ flex:1, padding:"8px 0", borderRadius:8, border:"none", background:"#F1F5F9", color:"#64748B", fontSize:13, fontWeight:700, cursor:"pointer" }}>戻る</button>
          </div>
        </div>
      )}

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginTop:10 }}>
        <div>
          <div style={{ fontSize:11, color:"#94A3B8", marginBottom:1 }}>合計在庫</div>
          <div style={{ display:"flex", alignItems:"baseline", gap:3 }}>
            <span style={{ fontSize:30, fontWeight:900, lineHeight:1, color:isOut?"#DC2626":isLow?"#D97706":"#0F766E" }}>{totalQty}</span>
            <span style={{ fontSize:13, color:"#64748B" }}>{master.unit}</span>
            <span style={{ fontSize:12, color:"#94A3B8", marginLeft:4 }}>{lots.length}ロット</span>
          </div>
          {pendingQty>0&&<div style={{ fontSize:11, color:"#6366F1", marginTop:2 }}>入荷後の見込み: <strong>{totalQty+pendingQty}{master.unit}</strong></div>}
        </div>
        {soonest&&(()=>{const st=lotStatus(daysUntil(soonest.expiry));return(
          <div style={{ textAlign:"right" }}>
            <div style={{ fontSize:11, color:"#94A3B8", marginBottom:1 }}>最短期限</div>
            <div style={{ fontSize:12, color:"#334155" }}>{soonest.expiry}</div>
            <span style={{ fontSize:11, fontWeight:700, color:st.color, background:st.bg, padding:"2px 7px", borderRadius:999, display:"inline-block", marginTop:2 }}>{st.label}</span>
          </div>
        );})()}
      </div>

      <LotStatusBar counts={counts}/>

      {expanded&&lots.length>0&&(
        <div style={{ marginTop:12, borderTop:"1px solid #F1F5F9", paddingTop:10 }}>
          <div style={{ fontSize:11, fontWeight:700, color:"#94A3B8", marginBottom:6 }}>ロット一覧</div>
          {[...lots].sort((a,b)=>a.expiry.localeCompare(b.expiry)).map(l=>{
            const st=lotStatus(daysUntil(l.expiry));
            return (
              <div key={l.id} style={{ padding:"7px 0", borderBottom:"1px solid #F8FAFC" }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <div>
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <span style={{ fontSize:12, fontWeight:700, color:"#0F172A" }}>{l.expiry}</span>
                      <span style={{ fontSize:11, fontWeight:700, color:st.color, background:st.bg, padding:"1px 6px", borderRadius:999 }}>{st.label}</span>
                    </div>
                    <div style={{ fontSize:11, color:"#94A3B8", marginTop:1 }}>{l.added_at}{l.note&&`　📝 ${l.note}`}</div>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <span style={{ fontSize:16, fontWeight:800, color:"#0F172A" }}>{l.qty}<span style={{ fontSize:11, color:"#94A3B8" }}>{master.unit}</span></span>
                    <button onClick={()=>setConfirmLotId(id=>id===l.id?null:l.id)} style={{ background:"#FEE2E2", border:"none", borderRadius:6, width:24, height:24, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer" }}><Icon name="trash" size={11} color="#DC2626"/></button>
                  </div>
                </div>
                {confirmLotId===l.id&&(
                  <div style={{ marginTop:6, padding:"8px 10px", borderRadius:8, background:"#FEF2F2", border:"1px solid #FECACA" }}>
                    <div style={{ fontSize:12, fontWeight:700, color:"#DC2626", marginBottom:6 }}>このロットを削除しますか？</div>
                    <div style={{ display:"flex", gap:6 }}>
                      <button onClick={async()=>{await onDeleteLot(l.id);setConfirmLotId(null);}} style={{ flex:1, padding:"6px 0", borderRadius:7, border:"none", background:"#DC2626", color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer" }}>削除する</button>
                      <button onClick={()=>setConfirmLotId(null)} style={{ flex:1, padding:"6px 0", borderRadius:7, border:"none", background:"#F1F5F9", color:"#64748B", fontSize:12, fontWeight:700, cursor:"pointer" }}>戻る</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display:"flex", gap:6, marginTop:12 }}>
        <button onClick={onAddLot} style={{ flex:1, padding:"9px 0", borderRadius:10, border:"none", background:"#F0FDF4", color:"#0D9488", fontWeight:700, fontSize:12, cursor:"pointer" }}>＋ 入荷</button>
        <button onClick={()=>lots.length>0?onSell():null} disabled={lots.length===0} style={{ flex:1, padding:"9px 0", borderRadius:10, border:"none", background:lots.length===0?"#F8FAFC":"#FFF1F2", color:lots.length===0?"#CBD5E1":"#E11D48", fontWeight:700, fontSize:12, cursor:lots.length===0?"default":"pointer" }}>－ 販売</button>
        <button onClick={onOrder} style={{ flex:1, padding:"9px 0", borderRadius:10, border:"none", background:myOrders.length>0?"#EEF2FF":"#F5F3FF", color:myOrders.length>0?"#4338CA":"#6366F1", fontWeight:700, fontSize:12, cursor:"pointer" }}>📋 発注</button>
        <button onClick={()=>setExpanded(e=>!e)} style={{ width:36, padding:"9px 0", borderRadius:10, border:"none", background:"#F8FAFC", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ transform:expanded?"rotate(180deg)":"rotate(0)", transition:"transform .2s" }}><Icon name="chevron" size={16} color="#64748B"/></div>
        </button>
      </div>
    </div>
  );
};

// ── AlertBanner ──────────────────────────────────
const AlertBanner = ({ masters, lots }: { masters:Master[]; lots:Lot[] }) => {
  const items = masters.flatMap(m=>{
    const ml=lots.filter(l=>l.master_id===m.id);
    const total=ml.reduce((s,l)=>s+l.qty,0);
    const msgs:string[]=[];
    if(total===0) msgs.push("在庫切れ");
    else if(total<=m.low_alert) msgs.push(`残り${total}${m.unit}`);
    const bad=ml.filter(l=>daysUntil(l.expiry)<=30);
    if(bad.length>0) msgs.push(`期限注意 ${bad.length}ロット`);
    return msgs.length>0?[{name:m.name,msgs}]:[];
  });
  if(!items.length) return null;
  return (
    <div style={{ background:"#FEF3C7", borderRadius:12, padding:"12px 14px", marginBottom:12, display:"flex", gap:10, border:"1px solid #FDE68A" }}>
      <Icon name="alert" size={18} color="#D97706"/>
      <div>
        <div style={{ fontSize:13, fontWeight:700, color:"#92400E", marginBottom:3 }}>要確認 {items.length}件</div>
        {items.slice(0,3).map((x,i)=><div key={i} style={{ fontSize:12, color:"#78350F" }}>• {x.name}（{x.msgs.join(" / ")}）</div>)}
        {items.length>3&&<div style={{ fontSize:12, color:"#78350F" }}>…他{items.length-3}件</div>}
      </div>
    </div>
  );
};

// ── Main ─────────────────────────────────────────
export default function VetInventory() {
  const [masters, setMasters] = useState<Master[]>([]);
  const [lots,    setLots]    = useState<Lot[]>([]);
  const [orders,  setOrders]  = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const [search,   setSearch]   = useState("");
  const [speciesF, setSpeciesF] = useState("すべて");
  const [makerF,   setMakerF]   = useState("すべて");
  const [sortKey,  setSortKey]  = useState("name");
  const [mainTab,  setMainTab]  = useState("list");

  const [addLotFor,     setAddLotFor]     = useState<Master|null>(null);
  const [sellFor,       setSellFor]       = useState<Master|null>(null);
  const [orderFor,      setOrderFor]      = useState<Master|null>(null);
  const [editMasterFor, setEditMasterFor] = useState<Master|null>(null);
  const [addMasterOpen, setAddMasterOpen] = useState(false);
  const [orderListOpen, setOrderListOpen] = useState(false);
  const [recvOrder,     setRecvOrder]     = useState<Order|null>(null);
  const [toast,         setToast]         = useState<{message:string;onUndo:()=>void}|null>(null);

  const showToast = (message: string, onUndo: ()=>void) => {
    setToast({ message, onUndo });
    setTimeout(()=>setToast(null), 5000);
  };

  // ── Supabaseからデータ取得 ──
  useEffect(()=>{
    const load = async () => {
      const [{ data:m },{ data:l },{ data:o }] = await Promise.all([
        supabase.from("masters").select("*").order("name"),
        supabase.from("lots").select("*").order("expiry"),
        supabase.from("orders").select("*").order("ordered_at", { ascending:false }),
      ]);
      setMasters(m??[]);
      setLots(l??[]);
      setOrders(o??[]);
      setLoading(false);
    };
    load();
  },[]);

  const pendingOrders = orders.filter(o=>o.status==="ordered");

  const filtered = useMemo(()=>{
    let list=[...masters];
    if(search)              list=list.filter(m=>m.name.includes(search)||m.maker.includes(search));
    if(speciesF!=="すべて") list=list.filter(m=>m.species===speciesF);
    if(makerF!=="すべて")   list=list.filter(m=>m.maker===makerF);
    if(mainTab==="alert")   list=list.filter(m=>{
      const ml=lots.filter(l=>l.master_id===m.id);
      const total=ml.reduce((s,l)=>s+l.qty,0);
      return total===0||total<=m.low_alert||ml.some(l=>daysUntil(l.expiry)<=30);
    });
    list.sort((a,b)=>{
      if(sortKey==="stock"){
        const qa=lots.filter(l=>l.master_id===a.id).reduce((s,l)=>s+l.qty,0);
        const qb=lots.filter(l=>l.master_id===b.id).reduce((s,l)=>s+l.qty,0);
        return qa-qb;
      }
      if(sortKey==="expiry"){
        const ea=lots.filter(l=>l.master_id===a.id).map(l=>l.expiry).sort()[0]??"9999";
        const eb=lots.filter(l=>l.master_id===b.id).map(l=>l.expiry).sort()[0]??"9999";
        return ea.localeCompare(eb);
      }
      return a.name.localeCompare(b.name,"ja");
    });
    return list;
  },[masters,lots,search,speciesF,makerF,sortKey,mainTab]);

  const alertCount = masters.filter(m=>{
    const ml=lots.filter(l=>l.master_id===m.id);
    const total=ml.reduce((s,l)=>s+l.qty,0);
    return total===0||total<=m.low_alert||ml.some(l=>daysUntil(l.expiry)<=30);
  }).length;

  // ── ハンドラ ──
  const handleSaveMaster = async (form: Omit<Master,"id">) => {
    if(editMasterFor){
      const { data } = await supabase.from("masters").update(form).eq("id",editMasterFor.id).select().single();
      if(data) setMasters(prev=>prev.map(m=>m.id===editMasterFor.id?data:m));
    } else {
      const { data } = await supabase.from("masters").insert(form).select().single();
      if(data) setMasters(prev=>[...prev,data]);
    }
  };

  const handleDeleteMaster = async (master: Master) => {
    const deletedLots = lots.filter(l=>l.master_id===master.id);
    await supabase.from("masters").delete().eq("id",master.id);
    setMasters(prev=>prev.filter(m=>m.id!==master.id));
    setLots(prev=>prev.filter(l=>l.master_id!==master.id));
    showToast(`「${master.name}」を削除しました`, async()=>{
      const { data:rm } = await supabase.from("masters").insert({ name:master.name, maker:master.maker, species:master.species, unit:master.unit, low_alert:master.low_alert }).select().single();
      if(rm){
        setMasters(prev=>[...prev,rm]);
        for(const l of deletedLots){
          const { data:rl } = await supabase.from("lots").insert({ master_id:rm.id, qty:l.qty, expiry:l.expiry, added_at:l.added_at, note:l.note }).select().single();
          if(rl) setLots(prev=>[...prev,rl]);
        }
      }
    });
  };

  const handleAddLot = async (form: Omit<Lot,"id">) => {
    const { data } = await supabase.from("lots").insert(form).select().single();
    if(data) setLots(prev=>[...prev,data]);
  };

  const handleDeleteLot = async (id: number) => {
    const deleted = lots.find(l=>l.id===id)!;
    await supabase.from("lots").delete().eq("id",id);
    setLots(prev=>prev.filter(l=>l.id!==id));
    showToast(`ロット（${deleted.expiry}）を削除しました`, async()=>{
      const { data } = await supabase.from("lots").insert({ master_id:deleted.master_id, qty:deleted.qty, expiry:deleted.expiry, added_at:deleted.added_at, note:deleted.note }).select().single();
      if(data) setLots(prev=>[...prev,data]);
    });
  };

  const handleSell = async (lotId: number, qty: number) => {
    const lot = lots.find(l=>l.id===lotId)!;
    const newQty = lot.qty - qty;
    if(newQty<=0){
      await supabase.from("lots").delete().eq("id",lotId);
      setLots(prev=>prev.filter(l=>l.id!==lotId));
    } else {
      await supabase.from("lots").update({ qty:newQty }).eq("id",lotId);
      setLots(prev=>prev.map(l=>l.id===lotId?{...l,qty:newQty}:l));
    }
  };

  const handleOrder = async (form: Omit<Order,"id">) => {
    const { data } = await supabase.from("orders").insert(form).select().single();
    if(data) setOrders(prev=>[data,...prev]);
  };

  const handleReceive = async (orderId: number, qty: number, expiry: string, who: string, note: string) => {
    const order = orders.find(o=>o.id===orderId)!;
    const update = { status:"received", received_at:nowStr(), received_by:who, received_qty:qty };
    await supabase.from("orders").update(update).eq("id",orderId);
    setOrders(prev=>prev.map(o=>o.id===orderId?{...o,...update}:o));
    const { data } = await supabase.from("lots").insert({ master_id:order.master_id, qty, expiry, added_at:nowStr(), note:note||"入荷確定" }).select().single();
    if(data) setLots(prev=>[...prev,data]);
  };

  const handleCancelOrder = async (id: number) => {
    await supabase.from("orders").update({ status:"cancelled" }).eq("id",id);
    setOrders(prev=>prev.map(o=>o.id===id?{...o,status:"cancelled"}:o));
  };

  if(loading) return <Loading/>;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;600;700;900&display=swap');
        *{font-family:'Noto Sans JP',-apple-system,sans-serif;box-sizing:border-box;}
        body{margin:0;background:#F0FDFA;}
        @keyframes slideUp{from{transform:translateY(60px);opacity:0}to{transform:translateY(0);opacity:1}}
        @keyframes spin{to{transform:rotate(360deg)}}
        input:focus,select:focus{border-color:#0D9488!important;outline:none;}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#CBD5E1;border-radius:4px}
      `}</style>

      <div style={{ maxWidth:480, margin:"0 auto", minHeight:"100vh", background:"#F0FDFA" }}>
        {/* Header */}
        <div style={{ background:"linear-gradient(135deg,#134E4A 0%,#0D9488 100%)", padding:"20px 16px 16px", position:"sticky", top:0, zIndex:10 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div>
              <div style={{ fontSize:11, color:"rgba(255,255,255,0.7)", letterSpacing:"0.08em" }}>🏥 動物病院フード在庫</div>
              <div style={{ fontSize:22, fontWeight:900, color:"#fff" }}>在庫管理</div>
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={()=>setOrderListOpen(true)} style={{ background:"rgba(255,255,255,0.15)", border:"none", borderRadius:10, width:38, height:38, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", position:"relative" }}>
                <Icon name="truck" size={18} color="#fff"/>
                {pendingOrders.length>0&&<span style={{ position:"absolute", top:4, right:4, width:16, height:16, background:"#6366F1", borderRadius:999, fontSize:10, fontWeight:700, color:"#fff", display:"flex", alignItems:"center", justifyContent:"center" }}>{pendingOrders.length}</span>}
              </button>
              <button onClick={()=>setAddMasterOpen(true)} style={{ background:"rgba(255,255,255,0.15)", border:"none", borderRadius:10, width:38, height:38, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer" }}>
                <Icon name="plus" size={20} color="#fff"/>
              </button>
            </div>
          </div>
          <div style={{ display:"flex", gap:8, marginTop:12 }}>
            {[
              { label:"商品数",      value:masters.length,                                                                    bg:"rgba(255,255,255,0.15)" },
              { label:"在庫切れ",    value:masters.filter(m=>lots.filter(l=>l.master_id===m.id).reduce((s,l)=>s+l.qty,0)===0).length, bg:"rgba(220,38,38,0.35)" },
              { label:"期限30日以内", value:lots.filter(l=>daysUntil(l.expiry)<=30).length,                                   bg:"rgba(245,158,11,0.35)" },
              { label:"発注中",      value:pendingOrders.length,                                                              bg:"rgba(99,102,241,0.45)", onClick:()=>setOrderListOpen(true) },
            ].map(c=>(
              <div key={c.label} onClick={c.onClick} style={{ background:c.bg, borderRadius:10, padding:"6px 8px", textAlign:"center", minWidth:56, cursor:c.onClick?"pointer":"default" }}>
                <div style={{ fontSize:17, fontWeight:900, color:"#fff" }}>{c.value}</div>
                <div style={{ fontSize:10, color:"rgba(255,255,255,0.85)", lineHeight:1.2 }}>{c.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Search */}
        <div style={{ padding:"12px 16px 0" }}>
          <div style={{ position:"relative" }}>
            <div style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)" }}><Icon name="search" size={16} color="#94A3B8"/></div>
            <input style={{ ...inp, paddingLeft:36, borderRadius:12 }} value={search} onChange={e=>setSearch(e.target.value)} placeholder="商品名・メーカーで検索…"/>
          </div>
        </div>

        {/* Filters */}
        <div style={{ padding:"10px 16px 0", display:"flex", gap:6, overflowX:"auto" }}>
          {SPECIES.map(s=>(
            <button key={s} onClick={()=>setSpeciesF(s)} style={{ flexShrink:0, padding:"5px 12px", borderRadius:999, border:"none", fontWeight:600, fontSize:12, cursor:"pointer", background:speciesF===s?"#0D9488":"#fff", color:speciesF===s?"#fff":"#64748B", boxShadow:"0 1px 3px rgba(0,0,0,0.08)" }}>
              {{すべて:"全種",犬:"🐶 犬",猫:"🐱 猫",エキゾチック:"🐰 エキゾ"}[s]}
            </button>
          ))}
          <div style={{ width:1, background:"#E2E8F0", margin:"0 4px", flexShrink:0 }}/>
          {MAKERS.map(m=>(
            <button key={m} onClick={()=>setMakerF(m)} style={{ flexShrink:0, padding:"5px 12px", borderRadius:999, border:"none", fontWeight:600, fontSize:12, cursor:"pointer", background:makerF===m?"#134E4A":"#fff", color:makerF===m?"#fff":"#64748B", boxShadow:"0 1px 3px rgba(0,0,0,0.08)" }}>{m}</button>
          ))}
        </div>

        {/* Tab + Sort */}
        <div style={{ padding:"10px 16px 0", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ display:"flex", gap:4 }}>
            {[["list","すべて"],["alert","アラート"]].map(([v,l])=>(
              <button key={v} onClick={()=>setMainTab(v)} style={{ padding:"6px 14px", borderRadius:999, border:"none", fontWeight:600, fontSize:13, cursor:"pointer", background:mainTab===v?"#0F172A":"transparent", color:mainTab===v?"#fff":"#64748B" }}>
                {l}{v==="alert"&&alertCount>0&&<span style={{ marginLeft:5, background:"#F97316", color:"#fff", borderRadius:999, fontSize:11, padding:"1px 6px" }}>{alertCount}</span>}
              </button>
            ))}
          </div>
          <select value={sortKey} onChange={e=>setSortKey(e.target.value)} style={{ ...sel, width:"auto", padding:"5px 10px", fontSize:12, borderRadius:8 }}>
            <option value="name">名前順</option>
            <option value="stock">在庫数順</option>
            <option value="expiry">期限順</option>
          </select>
        </div>

        {/* List */}
        <div style={{ padding:"12px 16px 100px" }}>
          <AlertBanner masters={masters} lots={lots}/>
          {filtered.length===0
            ? <div style={{ textAlign:"center", padding:"60px 0", color:"#94A3B8" }}><Icon name="package" size={40} color="#CBD5E1"/><p>商品が見つかりません</p></div>
            : filtered.map(m=>(
                <ProductCard key={m.id} master={m}
                  lots={lots.filter(l=>l.master_id===m.id)}
                  pendingOrders={pendingOrders}
                  onAddLot={()=>setAddLotFor(m)}
                  onSell={()=>setSellFor(m)}
                  onOrder={()=>setOrderFor(m)}
                  onEditMaster={()=>setEditMasterFor(m)}
                  onDeleteLot={handleDeleteLot}
                  onDeleteMaster={()=>handleDeleteMaster(m)}
                />
              ))
          }
        </div>

        <button onClick={()=>setAddMasterOpen(true)} style={{ position:"fixed", bottom:28, right:"calc(50% - 240px + 16px)", width:56, height:56, borderRadius:999, background:"#0D9488", border:"none", boxShadow:"0 4px 20px rgba(13,148,136,0.45)", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", zIndex:20 }}>
          <Icon name="plus" size={24} color="#fff"/>
        </button>
      </div>

      {addMasterOpen    && <MasterFormModal onClose={()=>setAddMasterOpen(false)} onSave={handleSaveMaster}/>}
      {editMasterFor    && <MasterFormModal master={editMasterFor} onClose={()=>setEditMasterFor(null)} onSave={handleSaveMaster}/>}
      {addLotFor        && <LotFormModal master={addLotFor} onClose={()=>setAddLotFor(null)} onSave={handleAddLot}/>}
      {sellFor          && <LotSellModal master={sellFor} lots={lots.filter(l=>l.master_id===sellFor.id)} onClose={()=>setSellFor(null)} onSell={handleSell}/>}
      {orderFor         && <OrderFormModal master={orderFor} orders={orders} onClose={()=>setOrderFor(null)} onOrder={handleOrder}/>}
      {orderListOpen    && <OrderListModal orders={orders} onClose={()=>setOrderListOpen(false)} onReceive={o=>{setOrderListOpen(false);setRecvOrder(o);}} onCancel={handleCancelOrder}/>}
      {recvOrder        && <ReceiveModal order={recvOrder} onClose={()=>setRecvOrder(null)} onReceive={handleReceive}/>}

      {toast&&(
        <div style={{ position:"fixed", bottom:100, left:"50%", transform:"translateX(-50%)", background:"#1E293B", borderRadius:14, padding:"12px 16px", display:"flex", alignItems:"center", gap:12, boxShadow:"0 8px 32px rgba(0,0,0,0.25)", zIndex:200, maxWidth:380, width:"calc(100% - 32px)" }}>
          <span style={{ fontSize:13, color:"#E2E8F0", flex:1 }}>{toast.message}</span>
          <button onClick={()=>{toast.onUndo();setToast(null);}} style={{ background:"#0D9488", border:"none", borderRadius:8, padding:"6px 14px", color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer" }}>元に戻す</button>
        </div>
      )}
    </>
  );
}