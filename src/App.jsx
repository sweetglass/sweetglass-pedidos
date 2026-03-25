import { useState, useEffect, useRef, useCallback } from "react";
import {
  collection, onSnapshot, addDoc, deleteDoc,
  doc, updateDoc, query, orderBy
} from "firebase/firestore";
import { db } from "./firebase";

// ── helpers ───────────────────────────────────────────────────────────────────
function formatDate(d) {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}
function formatCurrency(val) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val || 0);
}
function parseBRL(str) {
  if (!str) return 0;
  return +String(str).replace(/\./g, "").replace(",", ".") || 0;
}
function getDaysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
function getFirstDayOfMonth(y, m) { return new Date(y, m, 1).getDay(); }

// Derived payment status from value + amountPaid
function paymentStatus(order) {
  const total = order.value || 0;
  const paid  = order.amountPaid || 0;
  if (total === 0)      return "pendente";
  if (paid >= total)    return "pago";
  if (paid > 0)         return "parcial";
  return "pendente";
}

const MONTHS_PT = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const DAYS_PT   = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
const PAYMENT_METHODS = ["PIX","Cartão de Crédito","Cartão de Débito","Dinheiro","Transferência"];

// ── styles ────────────────────────────────────────────────────────────────────
const style = `
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=DM+Sans:wght@300;400;500&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --cream: #fdf8f0; --warm: #f5ebe0; --caramel: #c9965a; --caramel-deep: #a97c40;
    --brown: #5c3d2e; --mocha: #3d2b1f; --rose-light: #fceee8;
    --text: #3d2b1f; --muted: #9e7f6e; --border: #e8d9cc; --white: #ffffff;
    --success: #5a9e57;   --success-bg: #edf7ec; --success-border: #a8d4a5;
    --danger: #c05040;    --danger-bg:  #fceee8;
    --pending-bg: #fff5ec; --pending-border: #e8c4a0; --pending-color: #b07030;
    --partial-bg: #f0f0ff; --partial-border: #b0b0e8; --partial-color: #5050b0;
  }
  body { font-family:'DM Sans',sans-serif; background:var(--cream); color:var(--text); min-height:100vh; }
  .app {
    min-height:100vh;
    background-image:
      radial-gradient(ellipse at 15% 10%, rgba(201,150,90,.07) 0%, transparent 55%),
      radial-gradient(ellipse at 85% 90%, rgba(232,180,160,.09) 0%, transparent 55%);
  }

  /* ── Header ── */
  .header {
    background:var(--mocha); padding:0 24px;
    display:flex; align-items:center; justify-content:space-between;
    height:64px; position:sticky; top:0; z-index:100;
    box-shadow:0 2px 20px rgba(61,43,31,.3);
  }
  .header-logo {
    font-family:'Cormorant Garamond',serif; font-size:22px;
    font-weight:600; color:var(--caramel); letter-spacing:.04em;
    display:flex; align-items:center; gap:8px;
  }
  .header-logo span { color:#d4c4b4; font-weight:300; font-style:italic; }
  .nav { display:flex; gap:4px; }
  .nav-btn {
    background:none; border:none; color:#9e8e7e;
    font-family:'DM Sans',sans-serif; font-size:13px; font-weight:500;
    padding:8px 16px; border-radius:8px; cursor:pointer;
    transition:all .2s; display:flex; align-items:center; gap:6px;
  }
  .nav-btn:hover { color:#d4c4b4; background:rgba(255,255,255,.08); }
  .nav-btn.active { background:var(--caramel); color:var(--mocha); }
  .badge { background:var(--caramel); color:white; border-radius:10px; padding:1px 7px; font-size:11px; font-weight:700; }
  .nav-btn.active .badge { background:var(--mocha); color:var(--caramel); }

  /* ── Layout ── */
  .content { max-width:960px; margin:0 auto; padding:32px 20px; }
  .card { background:var(--white); border-radius:20px; padding:36px; border:1px solid var(--border); box-shadow:0 4px 32px rgba(61,43,31,.06); }
  .section-title { font-family:'Cormorant Garamond',serif; font-size:32px; font-weight:300; color:var(--brown); margin-bottom:4px; }
  .section-title em { font-style:italic; color:var(--caramel); }
  .section-sub { font-size:13px; color:var(--muted); margin-bottom:32px; font-weight:300; }

  /* ── Form ── */
  .form-grid { display:grid; grid-template-columns:1fr 1fr; gap:18px; }
  .form-grid .full { grid-column:1/-1; }
  .form-section-label {
    grid-column:1/-1; font-size:11px; font-weight:600;
    letter-spacing:.12em; text-transform:uppercase; color:var(--caramel);
    padding-top:10px; border-top:1px solid var(--border); margin-top:6px;
  }
  .field { display:flex; flex-direction:column; gap:6px; }
  .field label { font-size:11px; font-weight:500; letter-spacing:.1em; text-transform:uppercase; color:var(--muted); }
  .field input, .field select, .field textarea {
    background:var(--cream); border:1.5px solid var(--border); border-radius:10px;
    padding:12px 14px; font-family:'DM Sans',sans-serif; font-size:14px; color:var(--text);
    transition:border-color .2s,box-shadow .2s; outline:none; width:100%;
  }
  .field input:focus,.field select:focus,.field textarea:focus {
    border-color:var(--caramel); box-shadow:0 0 0 3px rgba(201,150,90,.12); background:var(--white);
  }
  .field textarea { resize:vertical; min-height:72px; }
  .field select { appearance:none; cursor:pointer; }
  .field.error input,.field.error select { border-color:var(--danger); }
  .field-hint { font-size:11px; color:var(--muted); margin-top:2px; }

  /* ── Payment row ── */
  .payment-row {
    grid-column:1/-1; display:grid; grid-template-columns:1fr 1fr 1fr; gap:14px;
    background:var(--cream); border:1.5px solid var(--border);
    border-radius:14px; padding:16px;
  }
  .payment-row-title {
    grid-column:1/-1; font-size:11px; font-weight:600;
    letter-spacing:.1em; text-transform:uppercase; color:var(--caramel); margin-bottom:2px;
  }
  .balance-preview {
    grid-column:1/-1; display:flex; align-items:center; gap:10px;
    padding:10px 14px; border-radius:10px; font-size:13px;
    border:1.5px dashed var(--border);
  }
  .balance-preview.full   { background:var(--success-bg); border-color:var(--success-border); color:var(--success); }
  .balance-preview.partial{ background:var(--partial-bg); border-color:var(--partial-border); color:var(--partial-color); }
  .balance-preview.none   { background:var(--pending-bg); border-color:var(--pending-border); color:var(--pending-color); }
  .balance-preview strong { font-weight:600; }

  /* ── Payment method toggle ── */
  .payment-toggle { display:flex; border:1.5px solid var(--border); border-radius:10px; overflow:hidden; background:var(--cream); }
  .toggle-opt {
    flex:1; padding:11px 6px; text-align:center; font-size:12px; font-weight:500;
    cursor:pointer; transition:all .2s; border:none; background:none;
    font-family:'DM Sans',sans-serif; color:var(--muted);
  }
  .toggle-opt.paid-active    { background:var(--success-bg); color:var(--success); }
  .toggle-opt.partial-active { background:var(--partial-bg); color:var(--partial-color); }
  .toggle-opt.unpaid-active  { background:var(--pending-bg); color:var(--pending-color); }

  /* ── Photo ── */
  .photo-upload {
    border:2px dashed var(--border); border-radius:14px; padding:24px 20px;
    text-align:center; cursor:pointer; transition:all .25s;
    background:var(--cream); position:relative; overflow:hidden;
  }
  .photo-upload:hover { border-color:var(--caramel); background:var(--rose-light); }
  .photo-upload.has-photo { border-style:solid; border-color:var(--caramel); padding:0; }
  .photo-upload img { width:100%; max-height:200px; object-fit:cover; border-radius:12px; display:block; }
  .photo-upload input { display:none; }
  .photo-placeholder { display:flex; flex-direction:column; align-items:center; gap:6px; color:var(--muted); }
  .photo-placeholder .icon { font-size:28px; }
  .photo-placeholder p { font-size:13px; }
  .photo-placeholder strong { color:var(--caramel); }
  .photo-change-btn {
    position:absolute; bottom:10px; right:10px; background:rgba(61,43,31,.75);
    color:white; border:none; border-radius:8px; padding:6px 12px; font-size:12px; cursor:pointer;
  }

  /* ── Submit ── */
  .btn-primary {
    background:linear-gradient(135deg,var(--caramel),var(--caramel-deep));
    color:white; border:none; border-radius:12px; padding:14px 32px;
    font-family:'DM Sans',sans-serif; font-size:15px; font-weight:500; cursor:pointer;
    transition:all .2s; box-shadow:0 4px 16px rgba(169,124,64,.35); width:100%; margin-top:8px;
  }
  .btn-primary:hover { transform:translateY(-1px); box-shadow:0 6px 24px rgba(169,124,64,.45); }
  .btn-primary:disabled { opacity:.5; cursor:not-allowed; transform:none; }

  /* ── Financial summary ── */
  .fin-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:14px; margin-bottom:28px; }
  .fin-card { background:var(--white); border-radius:16px; padding:20px 22px; border:1.5px solid var(--border); }
  .fin-card.total   { border-color:var(--caramel); }
  .fin-card.received{ border-color:var(--success-border); background:var(--success-bg); }
  .fin-card.pending { border-color:var(--pending-border); background:var(--pending-bg); }
  .fin-label { font-size:11px; font-weight:500; letter-spacing:.08em; text-transform:uppercase; margin-bottom:6px; color:var(--muted); }
  .fin-card.total .fin-label    { color:var(--caramel-deep); }
  .fin-card.received .fin-label { color:var(--success); }
  .fin-card.pending .fin-label  { color:var(--pending-color); }
  .fin-value { font-family:'Cormorant Garamond',serif; font-size:26px; font-weight:600; color:var(--brown); line-height:1; }
  .fin-card.received .fin-value { color:var(--success); }
  .fin-card.pending .fin-value  { color:var(--pending-color); }
  .fin-sub { font-size:12px; color:var(--muted); margin-top:4px; }
  .progress-bar { height:4px; background:var(--border); border-radius:2px; margin-top:10px; overflow:hidden; }
  .progress-fill { height:100%; background:var(--success); border-radius:2px; transition:width .6s ease; }

  /* ── Calendar ── */
  .cal-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:24px; }
  .cal-nav { display:flex; align-items:center; gap:12px; }
  .cal-nav-btn {
    background:var(--white); border:1.5px solid var(--border); border-radius:10px;
    width:40px; height:40px; display:flex; align-items:center; justify-content:center;
    cursor:pointer; font-size:16px; color:var(--brown); transition:all .15s;
  }
  .cal-nav-btn:hover { background:var(--warm); border-color:var(--caramel); }
  .cal-month-label { font-family:'Cormorant Garamond',serif; font-size:26px; font-weight:400; color:var(--brown); }
  .cal-grid { display:grid; grid-template-columns:repeat(7,1fr); gap:5px; }
  .cal-day-header { text-align:center; font-size:11px; font-weight:500; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); padding-bottom:8px; }
  .cal-cell {
    background:var(--white); border:1.5px solid var(--border); border-radius:12px; aspect-ratio:1;
    display:flex; flex-direction:column; align-items:center; justify-content:center;
    position:relative; cursor:default; transition:all .15s; overflow:hidden; min-height:56px;
  }
  .cal-cell.empty { background:transparent; border-color:transparent; }
  .cal-cell.has-orders { cursor:pointer; border-color:var(--caramel); background:linear-gradient(135deg,var(--rose-light),var(--white)); }
  .cal-cell.has-orders:hover { transform:translateY(-2px); box-shadow:0 6px 20px rgba(201,150,90,.2); }
  .cal-cell.today { border-color:var(--brown); }
  .cal-cell.selected { background:var(--caramel); border-color:var(--caramel-deep); }
  .cal-cell.selected .cal-day-num { color:white; }
  .cal-cell.selected .order-dot  { background:white; }
  .cal-day-num { font-family:'Cormorant Garamond',serif; font-size:18px; font-weight:400; color:var(--text); line-height:1; }
  .cal-cell.today .cal-day-num { color:var(--caramel); font-weight:600; }
  .cal-cell.past  .cal-day-num { color:var(--border); }
  .order-dots { display:flex; gap:3px; margin-top:4px; flex-wrap:wrap; justify-content:center; }
  .order-dot { width:6px; height:6px; border-radius:50%; background:var(--caramel); }
  .order-count-badge {
    position:absolute; top:5px; right:5px; background:var(--caramel); color:white;
    font-size:9px; font-weight:700; border-radius:50%; width:16px; height:16px;
    display:flex; align-items:center; justify-content:center;
  }

  /* ── Order panel ── */
  .order-panel {
    margin-top:24px; background:var(--white); border-radius:20px;
    border:1.5px solid var(--caramel); overflow:hidden;
    box-shadow:0 8px 40px rgba(201,150,90,.15);
  }
  .order-panel-header {
    background:linear-gradient(135deg,var(--mocha),var(--brown));
    padding:18px 28px; display:flex; align-items:center; justify-content:space-between;
  }
  .order-panel-title { font-family:'Cormorant Garamond',serif; font-size:22px; font-weight:400; color:var(--caramel); }
  .order-panel-sub   { font-size:12px; color:rgba(255,255,255,.45); margin-top:2px; }
  .panel-close {
    background:rgba(255,255,255,.1); border:none; color:white;
    width:32px; height:32px; border-radius:8px; cursor:pointer;
    display:flex; align-items:center; justify-content:center; font-size:18px;
  }
  .panel-close:hover { background:rgba(255,255,255,.2); }
  .orders-list { padding:20px 28px; display:flex; flex-direction:column; gap:16px; }

  /* ── Order card ── */
  .order-card {
    border:1.5px solid var(--border); border-radius:14px; overflow:hidden;
    display:grid; grid-template-columns:1fr auto; transition:box-shadow .15s;
  }
  .order-card:hover { box-shadow:0 4px 16px rgba(61,43,31,.08); }
  .order-card.is-pago    { border-color:var(--success-border); }
  .order-card.is-parcial { border-color:var(--partial-border); }
  .order-card.is-pendente{ border-color:var(--pending-border); }

  .order-info { padding:16px 20px; }
  .order-top  { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:10px; gap:10px; }
  .order-client { font-family:'Cormorant Garamond',serif; font-size:20px; font-weight:600; color:var(--brown); }

  .status-badge { border-radius:20px; padding:4px 12px; font-size:11px; font-weight:600; white-space:nowrap; flex-shrink:0; }
  .status-badge.pago    { background:var(--success-bg); color:var(--success);        border:1px solid var(--success-border); }
  .status-badge.parcial { background:var(--partial-bg); color:var(--partial-color);  border:1px solid var(--partial-border); }
  .status-badge.pendente{ background:var(--pending-bg); color:var(--pending-color);  border:1px solid var(--pending-border); }

  .order-chips { display:flex; gap:7px; flex-wrap:wrap; margin-bottom:8px; }
  .chip { background:var(--warm); border-radius:20px; padding:4px 11px; font-size:12px; color:var(--brown); }
  .chip.hl     { background:var(--caramel); color:white; }
  .chip.time   { background:#ede8f5; color:#6050a0; }
  .chip.method { background:#e8f0f5; color:#306080; }

  /* Payment breakdown */
  .payment-breakdown {
    margin:8px 0; padding:12px 14px; border-radius:10px;
    border:1.5px solid var(--border); background:var(--cream);
    display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px;
  }
  .pb-item { display:flex; flex-direction:column; gap:2px; }
  .pb-label { font-size:10px; text-transform:uppercase; letter-spacing:.07em; color:var(--muted); font-weight:500; }
  .pb-value { font-family:'Cormorant Garamond',serif; font-size:18px; font-weight:600; color:var(--brown); }
  .pb-value.paid    { color:var(--success); }
  .pb-value.balance { color:var(--pending-color); }

  /* Progress bar inside card */
  .payment-progress { margin:6px 0 4px; }
  .payment-progress-bar { height:5px; background:var(--border); border-radius:3px; overflow:hidden; }
  .payment-progress-fill { height:100%; border-radius:3px; transition:width .5s ease; }
  .payment-progress-fill.full    { background:var(--success); }
  .payment-progress-fill.partial { background:var(--partial-color); }
  .payment-progress-label { font-size:11px; color:var(--muted); margin-top:3px; }

  .order-deco  { font-size:13px; color:var(--muted); font-style:italic; line-height:1.5; }
  .order-notes { font-size:12px; color:var(--muted); margin-top:6px; padding:8px 12px; background:var(--cream); border-radius:8px; }

  /* Add payment inline */
  .add-payment-section {
    grid-column:1/-1; padding:10px 16px 12px;
    border-top:1px solid var(--border); background:#fdfaf7;
  }
  .add-payment-label { font-size:11px; font-weight:600; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); margin-bottom:8px; }
  .add-payment-row { display:flex; gap:8px; align-items:center; }
  .add-payment-row input {
    flex:1; padding:8px 12px; border:1.5px solid var(--border); border-radius:8px;
    font-family:'DM Sans',sans-serif; font-size:14px; outline:none; background:var(--cream);
    transition:border-color .2s;
  }
  .add-payment-row input:focus { border-color:var(--caramel); background:var(--white); }
  .add-payment-row select {
    padding:8px 12px; border:1.5px solid var(--border); border-radius:8px;
    font-family:'DM Sans',sans-serif; font-size:13px; outline:none;
    background:var(--cream); cursor:pointer; appearance:none;
    transition:border-color .2s; min-width:110px;
  }
  .add-payment-row select:focus { border-color:var(--caramel); }
  .btn-add-payment {
    background:var(--caramel); color:white; border:none; border-radius:8px;
    padding:8px 14px; font-size:13px; font-weight:500; cursor:pointer;
    font-family:'DM Sans',sans-serif; white-space:nowrap; transition:all .15s;
    flex-shrink:0;
  }
  .btn-add-payment:hover { background:var(--caramel-deep); }
  .btn-add-payment:disabled { opacity:.5; cursor:not-allowed; }

  .order-footer { grid-column:1/-1; padding:8px 16px; display:flex; gap:8px; align-items:center; border-top:1px solid var(--border); background:#fdfaf7; }
  .btn-sm {
    background:none; border:1px solid var(--border); color:var(--muted);
    border-radius:8px; padding:5px 12px; font-size:12px; cursor:pointer;
    transition:all .15s; font-family:'DM Sans',sans-serif;
  }
  .btn-sm:hover { border-color:var(--caramel); color:var(--caramel); }
  .btn-danger { margin-left:auto; background:none; border:1px solid #e8c0b0; color:var(--danger); border-radius:8px; padding:5px 12px; font-size:12px; cursor:pointer; font-family:'DM Sans',sans-serif; transition:all .15s; }
  .btn-danger:hover { background:var(--danger-bg); }
  .order-photo { width:120px; background:var(--warm); display:flex; align-items:center; justify-content:center; overflow:hidden; }
  .order-photo img { width:100%; height:100%; object-fit:cover; }
  .order-photo-ph { font-size:28px; opacity:.3; }

  /* Loading / empty / toast */
  .empty-state { text-align:center; padding:60px 20px; color:var(--muted); }
  .empty-state .ei { font-size:48px; margin-bottom:16px; opacity:.45; }
  .empty-state h3 { font-family:'Cormorant Garamond',serif; font-size:22px; font-weight:400; color:var(--brown); margin-bottom:8px; }
  .empty-state p { font-size:13px; }
  .loading-screen { display:flex; align-items:center; justify-content:center; height:100vh; flex-direction:column; gap:16px; }
  .loading-spinner { width:40px; height:40px; border:3px solid var(--border); border-top-color:var(--caramel); border-radius:50%; animation:spin .8s linear infinite; }
  @keyframes spin { to { transform:rotate(360deg); } }
  .toast {
    position:fixed; bottom:32px; left:50%; transform:translateX(-50%) translateY(100px);
    background:var(--brown); color:white; padding:14px 28px; border-radius:14px;
    font-size:14px; box-shadow:0 8px 32px rgba(0,0,0,.2);
    transition:transform .35s cubic-bezier(0.34,1.56,0.64,1);
    z-index:999; display:flex; align-items:center; gap:10px;
  }
  .toast.show { transform:translateX(-50%) translateY(0); }

  @media (max-width:600px) {
    .content { padding:18px 12px; }
    .card { padding:22px 16px; }
    .form-grid { grid-template-columns:1fr; }
    .form-grid .full { grid-column:1; }
    .payment-row { grid-template-columns:1fr; }
    .fin-grid { grid-template-columns:1fr; }
    .order-card { grid-template-columns:1fr; }
    .order-photo { width:100%; height:140px; }
    .orders-list { padding:14px; }
    .payment-breakdown { grid-template-columns:1fr 1fr; }
    .add-payment-row { flex-wrap:wrap; }
    .cal-month-label { font-size:20px; }
  }
`;

// ── Photo uploader ─────────────────────────────────────────────────────────────
function PhotoUploader({ value, onChange }) {
  const ref = useRef();
  const handleFile = e => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => onChange(ev.target.result);
    reader.readAsDataURL(file);
  };
  return (
    <div className={`photo-upload${value?" has-photo":""}`} onClick={() => ref.current.click()}>
      <input ref={ref} type="file" accept="image/*" onChange={handleFile} />
      {value ? (
        <>
          <img src={value} alt="Decoração" />
          <button className="photo-change-btn" onClick={e=>{e.stopPropagation();onChange(null);}}>✕ Remover</button>
        </>
      ) : (
        <div className="photo-placeholder">
          <span className="icon">📸</span>
          <p><strong>Clique para adicionar</strong><br/>foto da decoração</p>
        </div>
      )}
    </div>
  );
}

// ── Balance preview (inside form) ─────────────────────────────────────────────
function BalancePreview({ total, amountPaid }) {
  if (!total) return null;
  const balance = total - amountPaid;
  if (balance <= 0) return (
    <div className="balance-preview full">✅ <strong>Pago integralmente</strong> — {formatCurrency(total)}</div>
  );
  if (amountPaid > 0) return (
    <div className="balance-preview partial">
      🔵 Entrada de <strong>{formatCurrency(amountPaid)}</strong> — saldo em aberto: <strong>{formatCurrency(balance)}</strong>
    </div>
  );
  return (
    <div className="balance-preview none">⏳ Nenhum pagamento registrado — total: <strong>{formatCurrency(total)}</strong></div>
  );
}

// ── New Order Form ─────────────────────────────────────────────────────────────
const EMPTY = {
  name:"", kg:"", flavor:"", decoration:"", photo:null,
  date:"", time:"", notes:"",
  value:"", amountPaid:"", paymentMethod:""
};

function NewOrderForm({ onAdd }) {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setForm(f => ({...f, [k]:v}));

  const totalVal = parseBRL(form.value);
  const paidVal  = parseBRL(form.amountPaid);

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = true;
    if (!form.kg || isNaN(form.kg) || +form.kg <= 0) e.kg = true;
    if (!form.flavor.trim()) e.flavor = true;
    if (!form.date) e.date = true;
    setErrors(e);
    return !Object.keys(e).length;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setLoading(true);
    await onAdd({
      ...form,
      kg: +form.kg,
      value: totalVal,
      amountPaid: paidVal,
      createdAt: new Date().toISOString()
    });
    setForm(EMPTY);
    setErrors({});
    setLoading(false);
  };

  return (
    <div className="card">
      <h2 className="section-title">Novo <em>Pedido</em></h2>
      <p className="section-sub">Preencha os dados recebidos via WhatsApp</p>
      <div className="form-grid">

        <div className="form-section-label">🎂 Dados do pedido</div>

        <div className={`field${errors.name?" error":""}`}>
          <label>Nome do cliente *</label>
          <input placeholder="Ex: Maria Fernanda" value={form.name} onChange={e=>set("name",e.target.value)} />
        </div>
        <div className={`field${errors.kg?" error":""}`}>
          <label>Quilos *</label>
          <input type="number" step="0.5" min="0.5" placeholder="Ex: 2.5" value={form.kg} onChange={e=>set("kg",e.target.value)} />
        </div>
        <div className={`field full${errors.flavor?" error":""}`}>
          <label>Sabor *</label>
          <input placeholder="Ex: Chocolate Belga, Red Velvet, Baunilha com Morango..." value={form.flavor} onChange={e=>set("flavor",e.target.value)} />
        </div>
        <div className={`field${errors.date?" error":""}`}>
          <label>Data de entrega *</label>
          <input type="date" value={form.date} onChange={e=>set("date",e.target.value)} />
        </div>
        <div className="field">
          <label>Horário de entrega</label>
          <input type="time" value={form.time} onChange={e=>set("time",e.target.value)} />
        </div>
        <div className="field full">
          <label>Descrição da decoração</label>
          <textarea placeholder="Ex: Flores brancas, escrita em dourado com nome da aniversariante..." value={form.decoration} onChange={e=>set("decoration",e.target.value)} />
        </div>
        <div className="field full">
          <label>Foto da decoração</label>
          <PhotoUploader value={form.photo} onChange={v=>set("photo",v)} />
        </div>
        <div className="field full">
          <label>Observações</label>
          <textarea placeholder="Ex: Retirada no ateliê, alergia a amendoim, embalagem especial..." value={form.notes} onChange={e=>set("notes",e.target.value)} style={{minHeight:"60px"}} />
        </div>

        <div className="form-section-label">💰 Pagamento</div>

        {/* Payment block */}
        <div className="payment-row">
          <div className="field">
            <label>Valor total (R$)</label>
            <input placeholder="Ex: 300,00" value={form.value} onChange={e=>set("value",e.target.value)} />
          </div>
          <div className="field">
            <label>Valor pago agora (R$)</label>
            <input
              placeholder="Ex: 150,00"
              value={form.amountPaid}
              onChange={e=>set("amountPaid",e.target.value)}
            />
            <span className="field-hint">Deixe 0 se ainda não pagou nada</span>
          </div>
          <div className="field">
            <label>Forma de pagamento</label>
            <select value={form.paymentMethod} onChange={e=>set("paymentMethod",e.target.value)}>
              <option value="">Selecionar...</option>
              {PAYMENT_METHODS.map(m=><option key={m}>{m}</option>)}
            </select>
          </div>
          <BalancePreview total={totalVal} amountPaid={paidVal} />
        </div>

      </div>
      <button className="btn-primary" onClick={handleSubmit} disabled={loading}>
        {loading ? "Salvando..." : "✓ Salvar Pedido"}
      </button>
    </div>
  );
}

// ── Add payment inline ─────────────────────────────────────────────────────────
function AddPaymentRow({ order, onAddPayment }) {
  const [val, setVal] = useState("");
  const [method, setMethod] = useState(order.paymentMethod || "");
  const [saving, setSaving] = useState(false);

  const remaining = (order.value || 0) - (order.amountPaid || 0);

  const handleAdd = async () => {
    const amount = parseBRL(val);
    if (!amount || amount <= 0) return;
    setSaving(true);
    await onAddPayment(order.id, amount, method);
    setVal("");
    setSaving(false);
  };

  if (remaining <= 0) return null;

  return (
    <div className="add-payment-section">
      <div className="add-payment-label">Registrar pagamento — saldo: {formatCurrency(remaining)}</div>
      <div className="add-payment-row">
        <input
          placeholder={`Ex: ${formatCurrency(remaining).replace("R$\u00a0","")}`}
          value={val}
          onChange={e=>setVal(e.target.value)}
        />
        <select value={method} onChange={e=>setMethod(e.target.value)}>
          <option value="">Forma...</option>
          {PAYMENT_METHODS.map(m=><option key={m}>{m}</option>)}
        </select>
        <button className="btn-add-payment" onClick={handleAdd} disabled={saving || !val}>
          {saving ? "..." : "+ Pagar"}
        </button>
      </div>
    </div>
  );
}

// ── Order Card ─────────────────────────────────────────────────────────────────
function OrderCard({ order, onDelete, onAddPayment }) {
  const status  = paymentStatus(order);
  const total   = order.value || 0;
  const paid    = order.amountPaid || 0;
  const balance = total - paid;
  const pct     = total > 0 ? Math.min(100, (paid / total) * 100) : 0;

  const statusLabel = { pago:"✓ Pago", parcial:"◑ Parcial", pendente:"⏳ Pendente" }[status];

  return (
    <div className={`order-card is-${status}`}>
      <div>
        <div className="order-info">
          <div className="order-top">
            <div className="order-client">🎂 {order.name}</div>
            <span className={`status-badge ${status}`}>{statusLabel}</span>
          </div>
          <div className="order-chips">
            <span className="chip hl">{order.kg} kg</span>
            <span className="chip">🍫 {order.flavor}</span>
            {order.time && <span className="chip time">🕐 {order.time}</span>}
            {order.paymentMethod && <span className="chip method">💳 {order.paymentMethod}</span>}
          </div>

          {total > 0 && (
            <>
              <div className="payment-breakdown">
                <div className="pb-item">
                  <span className="pb-label">Total</span>
                  <span className="pb-value">{formatCurrency(total)}</span>
                </div>
                <div className="pb-item">
                  <span className="pb-label">Pago</span>
                  <span className={`pb-value paid`}>{formatCurrency(paid)}</span>
                </div>
                <div className="pb-item">
                  <span className="pb-label">Em aberto</span>
                  <span className={`pb-value balance`}>{formatCurrency(Math.max(0, balance))}</span>
                </div>
              </div>
              {total > 0 && (
                <div className="payment-progress">
                  <div className="payment-progress-bar">
                    <div className={`payment-progress-fill ${pct >= 100 ? "full" : "partial"}`} style={{width:`${pct}%`}} />
                  </div>
                  <div className="payment-progress-label">{pct.toFixed(0)}% pago</div>
                </div>
              )}
            </>
          )}

          {order.decoration && <div className="order-deco">"{order.decoration}"</div>}
          {order.notes      && <div className="order-notes">📝 {order.notes}</div>}
        </div>

        {/* Inline payment input — only shows if there's a remaining balance */}
        <AddPaymentRow order={order} onAddPayment={onAddPayment} />

        <div className="order-footer">
          <button className="btn-danger" onClick={() => onDelete(order.id)}>Excluir</button>
        </div>
      </div>
      <div className="order-photo">
        {order.photo ? <img src={order.photo} alt="Decoração" /> : <span className="order-photo-ph">🌸</span>}
      </div>
    </div>
  );
}

// ── Financial Summary ──────────────────────────────────────────────────────────
function FinancialSummary({ orders, year, month }) {
  const mo = orders.filter(o => {
    const [oy, om] = o.date.split("-");
    return +oy === year && +om - 1 === month;
  });
  const total    = mo.reduce((s, o) => s + (o.value || 0), 0);
  const received = mo.reduce((s, o) => s + (o.amountPaid || 0), 0);
  const pending  = total - received;
  const pct      = total > 0 ? (received / total) * 100 : 0;

  return (
    <div className="fin-grid">
      <div className="fin-card total">
        <div className="fin-label">📊 Total faturado</div>
        <div className="fin-value">{formatCurrency(total)}</div>
        <div className="fin-sub">{mo.length} pedido{mo.length!==1?"s":""} em {MONTHS_PT[month]}</div>
        <div className="progress-bar"><div className="progress-fill" style={{width:`${pct}%`}} /></div>
      </div>
      <div className="fin-card received">
        <div className="fin-label">✅ Recebido</div>
        <div className="fin-value">{formatCurrency(received)}</div>
        <div className="fin-sub">{mo.filter(o=>(o.amountPaid||0)>=(o.value||0)&&(o.value||0)>0).length} pago{mo.filter(o=>(o.amountPaid||0)>=(o.value||0)&&(o.value||0)>0).length!==1?"s":""} · {mo.filter(o=>(o.amountPaid||0)>0&&(o.amountPaid||0)<(o.value||0)).length} parcial</div>
      </div>
      <div className="fin-card pending">
        <div className="fin-label">⏳ A receber</div>
        <div className="fin-value">{formatCurrency(Math.max(0, pending))}</div>
        <div className="fin-sub">{mo.filter(o=>(o.amountPaid||0)<(o.value||0)).length} pedido{mo.filter(o=>(o.amountPaid||0)<(o.value||0)).length!==1?"s":""} em aberto</div>
      </div>
    </div>
  );
}

// ── Calendar ───────────────────────────────────────────────────────────────────
function Calendar({ orders, onDelete, onAddPayment }) {
  const today = new Date();
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selected, setSelected] = useState(null);

  const byDate = {};
  orders.forEach(o => { if (!byDate[o.date]) byDate[o.date]=[]; byDate[o.date].push(o); });

  const prevMonth = () => { if(month===0){setMonth(11);setYear(y=>y-1);}else setMonth(m=>m-1); setSelected(null); };
  const nextMonth = () => { if(month===11){setMonth(0);setYear(y=>y+1);}else setMonth(m=>m+1); setSelected(null); };

  const handleCell = day => {
    const ds = `${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    if (byDate[ds]?.length) setSelected(selected===ds?null:ds);
  };

  const selectedOrders = selected ? (byDate[selected]||[]) : [];
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay    = getFirstDayOfMonth(year, month);
  const cells = [];
  for (let i=0; i<firstDay; i++) cells.push(null);
  for (let d=1; d<=daysInMonth; d++) cells.push(d);

  return (
    <div>
      <FinancialSummary orders={orders} year={year} month={month} />
      <div className="cal-header">
        <div className="cal-nav">
          <button className="cal-nav-btn" onClick={prevMonth}>‹</button>
          <div className="cal-month-label">{MONTHS_PT[month]} {year}</div>
          <button className="cal-nav-btn" onClick={nextMonth}>›</button>
        </div>
      </div>
      <div className="card" style={{padding:"24px"}}>
        <div className="cal-grid">
          {DAYS_PT.map(d=><div key={d} className="cal-day-header">{d}</div>)}
          {cells.map((day,i)=>{
            if(!day) return <div key={`e${i}`} className="cal-cell empty"/>;
            const ds=`${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
            const dayOrders=byDate[ds]||[];
            const isToday=today.getFullYear()===year&&today.getMonth()===month&&today.getDate()===day;
            const isPast=new Date(ds)<new Date(today.toDateString());
            const isSelected=selected===ds;
            const cls=["cal-cell",dayOrders.length?"has-orders":"",isToday?"today":"",isPast&&!isToday?"past":"",isSelected?"selected":""].filter(Boolean).join(" ");
            return (
              <div key={day} className={cls} onClick={()=>dayOrders.length&&handleCell(day)}>
                {dayOrders.length>1&&<div className="order-count-badge">{dayOrders.length}</div>}
                <div className="cal-day-num">{day}</div>
                {dayOrders.length>0&&<div className="order-dots">{dayOrders.slice(0,3).map((_,idx)=><div key={idx} className="order-dot"/>)}</div>}
              </div>
            );
          })}
        </div>
      </div>

      {selected && (
        <div className="order-panel">
          <div className="order-panel-header">
            <div>
              <div className="order-panel-title">📅 {formatDate(selected)}</div>
              <div className="order-panel-sub">
                {selectedOrders.length} pedido{selectedOrders.length!==1?"s":""} · {formatCurrency(selectedOrders.reduce((s,o)=>s+(o.value||0),0))}
              </div>
            </div>
            <button className="panel-close" onClick={()=>setSelected(null)}>×</button>
          </div>
          <div className="orders-list">
            {selectedOrders.map(o=>(
              <OrderCard key={o.id} order={o}
                onDelete={id=>{onDelete(id);if(selectedOrders.length===1)setSelected(null);}}
                onAddPayment={onAddPayment}
              />
            ))}
          </div>
        </div>
      )}

      {orders.length===0&&(
        <div className="empty-state">
          <div className="ei">🎂</div>
          <h3>Nenhum pedido ainda</h3>
          <p>Adicione pedidos pela aba "Novo Pedido"</p>
        </div>
      )}
    </div>
  );
}

function Toast({message,show}){
  return <div className={`toast${show?" show":""}`}><span>🎂</span> {message}</div>;
}

// ── App ────────────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab]       = useState("new");
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast]   = useState({show:false,msg:""});

  useEffect(()=>{
    const q = query(collection(db,"orders"), orderBy("createdAt","desc"));
    const unsub = onSnapshot(q, snap=>{
      setOrders(snap.docs.map(d=>({id:d.id,...d.data()})));
      setLoading(false);
    }, err=>{ console.error(err); setLoading(false); });
    return ()=>unsub();
  },[]);

  const showToast = msg => { setToast({show:true,msg}); setTimeout(()=>setToast({show:false,msg:""}),3000); };

  const addOrder = useCallback(async order=>{
    try {
      await addDoc(collection(db,"orders"), order);
      showToast(`Pedido de ${order.name} salvo!`);
      setTab("calendar");
    } catch(e){ console.error(e); showToast("Erro ao salvar."); }
  },[]);

  const deleteOrder = useCallback(async id=>{
    try { await deleteDoc(doc(db,"orders",id)); showToast("Pedido removido."); }
    catch(e){ console.error(e); }
  },[]);

  // Add partial or full payment to an existing order
  const addPayment = useCallback(async (id, amount, method) => {
    try {
      const order = orders.find(o => o.id === id);
      if (!order) return;
      const newPaid = Math.min((order.amountPaid || 0) + amount, order.value || Infinity);
      const update = { amountPaid: newPaid };
      if (method) update.paymentMethod = method;
      await updateDoc(doc(db,"orders",id), update);
      const balance = (order.value||0) - newPaid;
      if (balance <= 0) showToast(`Pagamento confirmado — pedido de ${order.name} quitado! ✅`);
      else showToast(`Pago ${formatCurrency(amount)} — saldo em aberto: ${formatCurrency(balance)}`);
    } catch(e){ console.error(e); }
  },[orders]);

  if (loading) return (
    <><style>{style}</style>
    <div className="loading-screen"><div className="loading-spinner"/><p style={{color:"#9e7f6e",fontSize:"14px"}}>Carregando pedidos...</p></div>
    </>
  );

  return (
    <><style>{style}</style>
    <div className="app">
      <header className="header">
        <div className="header-logo">🍰 Sweetglass <span>· pedidos</span></div>
        <nav className="nav">
          <button className={`nav-btn${tab==="new"?" active":""}`} onClick={()=>setTab("new")}>✏️ Novo Pedido</button>
          <button className={`nav-btn${tab==="calendar"?" active":""}`} onClick={()=>setTab("calendar")}>
            📅 Calendário
            {orders.length>0&&<span className="badge">{orders.length}</span>}
          </button>
        </nav>
      </header>
      <div className="content">
        {tab==="new"      && <NewOrderForm onAdd={addOrder}/>}
        {tab==="calendar" && <Calendar orders={orders} onDelete={deleteOrder} onAddPayment={addPayment}/>}
      </div>
      <Toast show={toast.show} message={toast.msg}/>
    </div>
    </>
  );
}
