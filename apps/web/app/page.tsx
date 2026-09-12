"use client";

import { DragEvent, FormEvent, useCallback, useEffect, useRef, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

type User = { id: string; email: string; full_name: string };
type Role = "owner" | "finance_manager" | "advisor" | "viewer";
type Company = {
  id: string;
  legal_name: string;
  national_id: string | null;
  currency: string;
  fiscal_year_start_month: number;
  timezone: string;
  role: Role;
  created_at: string;
};
type Member = { user_id: string; email: string; full_name: string; role: Role };
type ImportStatus = "uploaded" | "inspecting" | "awaiting_mapping" | "validating" | "queued" | "processing" | "completed" | "completed_limited" | "failed" | "cancelled";
type ImportBatch = {
  id: string;
  source_kind: "accounting" | "bank" | "sales";
  source_label: string;
  status: ImportStatus;
  stage: string;
  progress: number;
  original_name: string;
  size_bytes: number;
  sha256: string;
  scan_status: "pending" | "clean" | "infected" | "failed";
  duplicate_detected: boolean;
  failure_message: string | null;
  created_at: string;
};

const roleLabels: Record<Role, string> = {
  owner: "مالک",
  finance_manager: "مدیر مالی",
  advisor: "مشاور",
  viewer: "مشاهده‌گر",
};

function Mark() {
  return <span className="mark" aria-hidden="true"><i /><i /><i /></span>;
}

function Icon({ name }: { name: "home" | "company" | "shield" | "exit" | "plus" | "users" | "upload" | "file" | "download" }) {
  const paths = {
    home: <><path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10M9 20v-6h6v6"/></>,
    company: <><path d="M4 21V5h10v16M14 9h6v12M8 9h2M8 13h2M8 17h2M17 13h1M17 17h1"/></>,
    shield: <><path d="M12 3 4 6v5c0 5 3.4 8.5 8 10 4.6-1.5 8-5 8-10V6l-8-3Z"/><path d="m9 12 2 2 4-4"/></>,
    exit: <><path d="M10 17l5-5-5-5M15 12H3M14 4h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    upload: <><path d="M12 16V3M7 8l5-5 5 5"/><path d="M5 13v7h14v-7"/></>,
    file: <><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5M9 13h6M9 17h6"/></>,
    download: <><path d="M12 3v13M7 11l5 5 5-5"/><path d="M5 21h14"/></>,
  };
  return <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">{paths[name]}</svg>;
}

function csrfFromCookie() {
  if (typeof document === "undefined") return "";
  return decodeURIComponent(document.cookie.split("; ").find((row) => row.startsWith("didban_csrf="))?.split("=")[1] ?? "");
}

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = options.method?.toUpperCase() ?? "GET";
  const hasFormData = options.body instanceof FormData;
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      ...(!hasFormData ? { "Content-Type": "application/json" } : {}),
      ...(method !== "GET" && method !== "HEAD" ? { "X-CSRF-Token": csrfFromCookie() } : {}),
      ...options.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: "ارتباط با سامانه برقرار نشد." }));
    throw new Error(body.detail ?? "خطای پیش‌بینی‌نشده");
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

function AuthScreen({ onAuthenticated }: { onAuthenticated: (user: User) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      const result = await api<{ user: User }>(`/auth/${mode}`, { method: "POST", body: JSON.stringify(payload) });
      onAuthenticated(result.user);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ورود انجام نشد.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-story" aria-labelledby="welcome-title">
        <a className="brand brand-light" href="#"><Mark /><span>دیدبان مالی</span></a>
        <div>
          <span className="kicker">سامانه عملیات و کنترل مالی</span>
          <h1 id="welcome-title">تصمیم مالی،<br/><em>با سند و اطمینان.</em></h1>
          <p>یک لایهٔ مستقل روی سیستم حسابداری شما؛ برای کنترل کیفیت داده، تحلیل و پیگیری یافته‌ها.</p>
        </div>
        <div className="trust-row"><span>دادهٔ هر شرکت کاملاً مجزا</span><span>ثبت رویدادهای حساس</span></div>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <div className="mobile-brand"><Mark />دیدبان مالی</div>
          <div className="tabs" role="tablist" aria-label="نوع ورود">
            <button role="tab" aria-selected={mode === "login"} onClick={() => { setMode("login"); setError(""); }}>ورود</button>
            <button role="tab" aria-selected={mode === "register"} onClick={() => { setMode("register"); setError(""); }}>ساخت حساب</button>
          </div>
          <div className="form-title">
            <span>فضای کاری امن شما</span>
            <h2>{mode === "login" ? "خوش آمدید" : "شروع با دیدبان مالی"}</h2>
            <p>{mode === "login" ? "برای ادامه وارد حساب خود شوید." : "حساب مدیر و فضای کاری اولیه را بسازید."}</p>
          </div>
          <form onSubmit={submit} className="auth-form">
            {mode === "register" && <>
              <label>نام و نام خانوادگی<input name="full_name" autoComplete="name" required minLength={2} placeholder="مثلاً مهسا کریمی" /></label>
              <label>نام فضای کاری <span>(اختیاری)</span><input name="workspace_name" placeholder="مثلاً گروه مالی آریا" /></label>
            </>}
            <label>ایمیل کاری<input name="email" type="email" dir="ltr" autoComplete="email" required placeholder="name@company.ir" /></label>
            <label>رمز عبور<input name="password" type="password" dir="ltr" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={mode === "register" ? 12 : 1} placeholder={mode === "register" ? "حداقل ۱۲ نویسه" : "رمز عبور"} /></label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="primary-button" disabled={busy}>{busy ? "کمی صبر کنید…" : mode === "login" ? "ورود به دیدبان" : "ساخت حساب امن"}</button>
          </form>
          <p className="security-note"><Icon name="shield" />اطلاعات نشست در کوکی امن نگهداری می‌شود.</p>
        </div>
      </section>
    </main>
  );
}

function CreateCompany({ onCreated, compact = false }: { onCreated: (company: Company) => void; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const data = new FormData(event.currentTarget);
    try {
      const company = await api<Company>("/companies", { method: "POST", body: JSON.stringify({ legal_name: data.get("legal_name"), national_id: data.get("national_id") || null, fiscal_year_start_month: Number(data.get("fiscal_year_start_month")) }) });
      onCreated(company);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "شرکت ساخته نشد."); }
    finally { setBusy(false); }
  }
  return <form className={compact ? "company-form compact" : "company-form"} onSubmit={submit}>
    <label>نام حقوقی شرکت<input name="legal_name" required minLength={2} placeholder="مثلاً راهکار تجارت آریا" /></label>
    <label>شناسه ملی <span>(اختیاری)</span><input name="national_id" inputMode="numeric" dir="ltr" minLength={8} placeholder="۱۴۰۰۱۲۳۴۵۶۷" /></label>
    <label>ماه شروع سال مالی<select name="fiscal_year_start_month" defaultValue="1">{Array.from({ length: 12 }, (_, index) => <option value={index + 1} key={index + 1}>ماه {new Intl.NumberFormat("fa-IR").format(index + 1)}</option>)}</select></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="primary-button" disabled={busy}><Icon name="plus" />{busy ? "در حال ساخت…" : "ایجاد شرکت"}</button>
  </form>;
}

function MembersPanel({ company, currentUserId }: { company: Company; currentUserId: string }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState("");
  const load = useCallback(() => api<Member[]>(`/companies/${company.id}/members`).then(setMembers).catch((e: Error) => setError(e.message)), [company.id]);
  useEffect(() => { void load(); }, [load]);

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const form = event.currentTarget; const data = new FormData(form);
    try {
      await api(`/companies/${company.id}/members`, { method: "POST", body: JSON.stringify({ email: data.get("email"), role: data.get("role") }) });
      form.reset(); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "عضو افزوده نشد."); }
  }

  async function updateRole(member: Member, role: Role) {
    setError("");
    try {
      await api(`/companies/${company.id}/members/${member.user_id}`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "نقش عضو تغییر نکرد.");
    }
  }

  async function remove(member: Member) {
    setError("");
    try {
      await api(`/companies/${company.id}/members/${member.user_id}`, { method: "DELETE" });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "عضو حذف نشد.");
    }
  }

  return <section className="members-card" aria-labelledby="members-title">
    <div className="card-heading"><div><span className="overline">کنترل دسترسی</span><h3 id="members-title">اعضای شرکت</h3></div><span className="count-pill">{new Intl.NumberFormat("fa-IR").format(members.length)} نفر</span></div>
    {company.role === "owner" && <form className="member-form" onSubmit={add}>
      <label><span className="sr-only">ایمیل عضو جدید</span><input name="email" type="email" dir="ltr" required placeholder="ایمیل عضو جدید" /></label>
      <label><span className="sr-only">نقش عضو جدید</span><select name="role" defaultValue="viewer"><option value="finance_manager">مدیر مالی</option><option value="advisor">مشاور</option><option value="viewer">مشاهده‌گر</option></select></label>
      <button className="secondary-button"><Icon name="plus" />افزودن</button>
    </form>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="member-list">{members.map((member) => <div className="member-row" key={member.user_id}><span className="avatar">{member.full_name.slice(0, 1)}</span><div><strong>{member.full_name}</strong><small dir="ltr">{member.email}</small></div>{company.role === "owner" ? <div className="member-actions"><label><span className="sr-only">نقش {member.full_name}</span><select className="role-select" value={member.role} onChange={(event) => void updateRole(member, event.target.value as Role)}><option value="owner">مالک</option><option value="finance_manager">مدیر مالی</option><option value="advisor">مشاور</option><option value="viewer">مشاهده‌گر</option></select></label>{member.user_id !== currentUserId && <button className="remove-button" onClick={() => void remove(member)}>حذف</button>}</div> : <span className={`role role-${member.role}`}>{roleLabels[member.role]}</span>}</div>)}</div>
  </section>;
}

const importStatusLabels: Record<ImportStatus, string> = {
  uploaded: "دریافت شد",
  inspecting: "در حال بررسی امنیتی",
  awaiting_mapping: "آمادهٔ تطبیق ستون‌ها",
  validating: "در حال اعتبارسنجی",
  queued: "در صف پردازش",
  processing: "در حال پردازش",
  completed: "تکمیل‌شده",
  completed_limited: "تکمیل محدود",
  failed: "رد شده",
  cancelled: "لغوشده",
};

function formatBytes(bytes: number) {
  const megabytes = bytes / (1024 * 1024);
  return `${new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 1 }).format(megabytes)} مگابایت`;
}

function ImportsPanel({ company }: { company: Company }) {
  const [items, setItems] = useState<ImportBatch[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const canUpload = company.role !== "viewer";

  const load = useCallback(async () => {
    try {
      setItems(await api<ImportBatch[]>(`/companies/${company.id}/imports`));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "فهرست فایل‌ها دریافت نشد.");
    }
  }, [company.id]);

  useEffect(() => {
    let ignore = false;
    void api<ImportBatch[]>(`/companies/${company.id}/imports`)
      .then((results) => { if (!ignore) setItems(results); })
      .catch((caught: Error) => { if (!ignore) setError(caught.message); });
    const timer = window.setInterval(() => void load(), 4000);
    return () => { ignore = true; window.clearInterval(timer); };
  }, [company.id, load]);

  function acceptFile(file: File | undefined) {
    setError("");
    setNotice("");
    if (!file) return;
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!extension || !["csv", "xlsx"].includes(extension)) {
      setSelectedFile(null);
      setError("فقط فایل‌های CSV و XLSX پذیرفته می‌شوند.");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setSelectedFile(null);
      setError("حجم فایل نباید بیشتر از ۵۰ مگابایت باشد.");
      return;
    }
    setSelectedFile(file);
  }

  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    acceptFile(event.dataTransfer.files[0]);
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFile) {
      setError("ابتدا یک فایل انتخاب کنید.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    const form = new FormData(event.currentTarget);
    form.set("file", selectedFile);
    try {
      const created = await api<ImportBatch>(`/companies/${company.id}/imports/uploads`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: form,
      });
      setItems((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      setSelectedFile(null);
      if (inputRef.current) inputRef.current.value = "";
      setNotice("فایل با موفقیت دریافت شد و بررسی امنیتی آن آغاز شده است.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "بارگذاری فایل انجام نشد.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="imports-card" id="imports" aria-labelledby="imports-title">
    <div className="card-heading imports-heading">
      <div><span className="overline">ورودی امن داده</span><h3 id="imports-title">فایل‌های مالی</h3><p>فایل پس از بررسی نوع، ساختار و بدافزار وارد فضای امن شرکت می‌شود.</p></div>
      <span className="secure-badge"><Icon name="shield" />قرنطینه و اسکن فعال</span>
    </div>
    {canUpload ? <form className="upload-form" onSubmit={upload}>
      <div
        className={`dropzone${dragging ? " dragging" : ""}${selectedFile ? " has-file" : ""}`}
        onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={drop}
      >
        <input ref={inputRef} className="sr-only" id="financial-file" name="file-picker" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => acceptFile(event.target.files?.[0])} />
        <span className="upload-icon"><Icon name={selectedFile ? "file" : "upload"} /></span>
        {selectedFile ? <><strong>{selectedFile.name}</strong><small>{formatBytes(selectedFile.size)}</small></> : <><strong>فایل را اینجا رها کنید</strong><small>CSV یا XLSX، حداکثر ۵۰ مگابایت</small></>}
        <button type="button" className="secondary-button" onClick={() => inputRef.current?.click()}>{selectedFile ? "تغییر فایل" : "انتخاب فایل"}</button>
      </div>
      <div className="upload-fields">
        <label>نوع منبع<select name="source_kind" defaultValue="accounting"><option value="accounting">نرم‌افزار حسابداری</option><option value="bank">گردش حساب بانکی</option><option value="sales">فروش و درآمد</option></select></label>
        <label>عنوان منبع<input name="source_label" required minLength={2} maxLength={160} defaultValue="ورودی مالی" placeholder="مثلاً دفتر کل شهریور" /></label>
        <button className="primary-button" disabled={busy}><Icon name="upload" />{busy ? "در حال دریافت…" : "بارگذاری امن"}</button>
      </div>
    </form> : <div className="viewer-note"><Icon name="shield" /><span><strong>دسترسی مشاهده‌گر</strong>برای بارگذاری فایل، نقش مدیر مالی یا مشاور لازم است.</span></div>}
    <div className="upload-messages" aria-live="polite">{error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="form-success">{notice}</p>}</div>
    <div className="imports-list" aria-label="فایل‌های اخیر">
      <div className="list-title"><strong>فایل‌های اخیر</strong><span>{new Intl.NumberFormat("fa-IR").format(items.length)} مورد</span></div>
      {!items.length ? <div className="imports-empty"><Icon name="file" /><p>هنوز فایلی برای این شرکت بارگذاری نشده است.</p></div> : items.map((item) => <article className="import-row" key={item.id}>
        <span className={`file-state state-${item.scan_status}`}><Icon name="file" /></span>
        <div className="file-info"><strong>{item.original_name}</strong><small>{item.source_label} · {formatBytes(item.size_bytes)} · {new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.created_at))}</small>{item.duplicate_detected && <span className="duplicate-note">نسخه‌ای با محتوای یکسان قبلاً ثبت شده است.</span>}{item.failure_message && <span className="failure-note">{item.failure_message}</span>}</div>
        <div className="file-progress"><span className={`status status-${item.status}`}>{importStatusLabels[item.status]}</span>{["uploaded", "inspecting"].includes(item.status) && <span className="progress-track"><i style={{ width: `${item.progress}%` }} /></span>}</div>
        {item.scan_status === "clean" ? <a className="download-button" href={`${API_URL}/companies/${company.id}/imports/${item.id}/download`}><Icon name="download" /><span className="sr-only">دریافت {item.original_name}</span></a> : <span className="download-placeholder" aria-hidden="true" />}
      </article>)}
    </div>
  </section>;
}

function Dashboard({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [activeId, setActiveId] = useState("");
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState("");
  const active = companies.find((company) => company.id === activeId) ?? companies[0];

  useEffect(() => {
    api<Company[]>("/companies").then((items) => { setCompanies(items); setActiveId(items[0]?.id ?? ""); }).catch((e: Error) => setError(e.message)).finally(() => setLoading(false));
  }, []);
  function addCompany(company: Company) { setCompanies((items) => [company, ...items]); setActiveId(company.id); setShowCreate(false); }

  return <main className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#"><Mark /><span>دیدبان مالی</span></a>
      <nav aria-label="منوی اصلی">
        <a className="nav-item active" href="#overview"><Icon name="home" /><span>نمای کلی</span></a>
        <a className="nav-item" href="#imports"><Icon name="upload" /><span>ورود داده</span></a>
        <a className="nav-item" href="#company"><Icon name="company" /><span>شرکت و دسترسی‌ها</span></a>
        <span className="nav-label">ماژول‌های بعدی</span>
        <span className="nav-item disabled"><span className="nav-dot"/>کنترل کیفیت</span>
        <span className="nav-item disabled"><span className="nav-dot"/>تحلیل و گزارش</span>
      </nav>
      <div className="user-box"><span className="avatar">{user.full_name.slice(0, 1)}</span><div><strong>{user.full_name}</strong><small dir="ltr">{user.email}</small></div><button onClick={onLogout} title="خروج"><Icon name="exit" /><span className="sr-only">خروج</span></button></div>
    </aside>
    <section className="workspace">
      <header className="topbar">
        <div><span className="breadcrumb">فضای کاری / نمای کلی</span><h1>سلام، {user.full_name.split(" ")[0]}</h1></div>
        <div className="company-switcher"><label htmlFor="company-select">شرکت فعال</label><select id="company-select" value={active?.id ?? ""} onChange={(e) => setActiveId(e.target.value)} disabled={!companies.length}>{companies.length ? companies.map((company) => <option key={company.id} value={company.id}>{company.legal_name}</option>) : <option>هنوز شرکتی ندارید</option>}</select><button className="icon-button" onClick={() => setShowCreate((value) => !value)} title="شرکت جدید"><Icon name="plus" /></button></div>
      </header>
      <div className="content" id="overview">
        {error && <p className="form-error global" role="alert">{error}</p>}
        {loading ? <div className="empty-state"><span className="loading-ring"/><h2>در حال آماده‌سازی فضای کاری…</h2></div> : !active ? <section className="empty-state"><span className="empty-icon"><Icon name="company" /></span><span className="overline">اولین گام عملیاتی</span><h2>اولین شرکت را تعریف کنید</h2><p>تمام داده‌ها، اعضا و گزارش‌ها زیر همین مرز امنیتی نگهداری می‌شوند.</p><CreateCompany onCreated={addCompany} /></section> : <>
          <section className="welcome-strip"><div><span className="status-dot"/>فاز ۳ فعال است</div><p>دریافت امن فایل، قرنطینه، بررسی بدافزار و دانلود مجاز آماده است.</p></section>
          <div className="summary-grid">
            <article><span className="summary-icon"><Icon name="company" /></span><div><small>شرکت فعال</small><strong>{active.legal_name}</strong><p>{active.national_id ? `شناسه ملی ${active.national_id}` : "شناسه ملی ثبت نشده"}</p></div></article>
            <article><span className="summary-icon"><Icon name="shield" /></span><div><small>سطح دسترسی شما</small><strong>{roleLabels[active.role]}</strong><p>کنترل‌شده در API و پایگاه‌داده</p></div></article>
            <article><span className="summary-icon"><Icon name="users" /></span><div><small>وضعیت امنیتی</small><strong>جداسازی فعال</strong><p>نشست چرخشی و محافظت CSRF</p></div></article>
          </div>
          {showCreate && <section className="inline-create"><div className="card-heading"><div><span className="overline">شرکت تازه</span><h3>افزودن شرکت</h3></div><button className="text-button" onClick={() => setShowCreate(false)}>بستن</button></div><CreateCompany onCreated={addCompany} compact /></section>}
          <ImportsPanel company={active} />
          <div className="detail-grid" id="company"><section className="company-card"><div className="card-heading"><div><span className="overline">مشخصات پایه</span><h3>پروفایل شرکت</h3></div><span className="role role-owner">{active.currency}</span></div><dl><div><dt>نام حقوقی</dt><dd>{active.legal_name}</dd></div><div><dt>شناسه ملی</dt><dd dir="ltr">{active.national_id ?? "—"}</dd></div><div><dt>شروع سال مالی</dt><dd>ماه {new Intl.NumberFormat("fa-IR").format(active.fiscal_year_start_month)}</dd></div><div><dt>منطقه زمانی</dt><dd dir="ltr">{active.timezone}</dd></div></dl></section><MembersPanel company={active} currentUserId={user.id} /></div>
        </>}
      </div>
    </section>
  </main>;
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    api<User>("/auth/me")
      .then(setUser)
      .catch(async () => {
        try {
          const refreshed = await api<{ user: User }>("/auth/refresh", { method: "POST" });
          setUser(refreshed.user);
        } catch {
          // نبودن نشست معتبر، حالت عادی صفحه ورود است.
        }
      })
      .finally(() => setChecking(false));
  }, []);
  async function logout() { try { await api("/auth/logout", { method: "POST" }); } finally { setUser(null); } }
  if (checking) return <main className="splash"><Mark /><strong>دیدبان مالی</strong><span className="loading-ring" /></main>;
  return user ? <Dashboard user={user} onLogout={logout} /> : <AuthScreen onAuthenticated={setUser} />;
}
