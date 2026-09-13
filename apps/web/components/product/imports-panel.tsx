"use client";

import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { DragEvent, FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

import { API_URL, api } from "@/lib/product-api";
import type { Company, ImportBatch, ImportStatus } from "@/lib/product-types";

import { Icon } from "./icons";

const importStatusLabels: Record<ImportStatus, string> = { uploaded: "دریافت شد", inspecting: "در حال بررسی امنیتی", awaiting_mapping: "آمادهٔ تطبیق ستون‌ها", validating: "در حال اعتبارسنجی", queued: "در صف پردازش", processing: "در حال پردازش", completed: "تکمیل‌شده", completed_limited: "تکمیل محدود", failed: "رد شده", cancelled: "لغوشده" };
const formatBytes = (bytes: number) => `${new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 1 }).format(bytes / (1024 * 1024))} مگابایت`;

export function ImportsPanel({ company }: { company: Company }) {
  const [items, setItems] = useState<ImportBatch[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const canUpload = company.role !== "viewer";
  const load = useCallback(async () => { try { setItems(await api<ImportBatch[]>(`/companies/${company.id}/imports`)); } catch (caught) { setError(caught instanceof Error ? caught.message : "فهرست فایل‌ها دریافت نشد."); } }, [company.id]);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(), 4000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, [load]);
  function acceptFile(file: File | undefined) {
    setError(""); setNotice(""); if (!file) return;
    if (!["csv", "xlsx"].includes(file.name.split(".").pop()?.toLowerCase() ?? "")) { setSelectedFile(null); setError("فقط فایل‌های CSV و XLSX پذیرفته می‌شوند."); return; }
    if (file.size > 50 * 1024 * 1024) { setSelectedFile(null); setError("حجم فایل نباید بیشتر از ۵۰ مگابایت باشد."); return; }
    setSelectedFile(file);
  }
  function drop(event: DragEvent<HTMLDivElement>) { event.preventDefault(); setDragging(false); acceptFile(event.dataTransfer.files[0]); }
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selectedFile) { setError("ابتدا یک فایل انتخاب کنید."); return; }
    setBusy(true); setError(""); setNotice(""); const form = new FormData(event.currentTarget); form.set("file", selectedFile);
    try { const created = await api<ImportBatch>(`/companies/${company.id}/imports/uploads`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: form }); setItems((current) => [created, ...current.filter((item) => item.id !== created.id)]); setSelectedFile(null); if (inputRef.current) inputRef.current.value = ""; setNotice("فایل با موفقیت دریافت شد و بررسی امنیتی آن آغاز شده است."); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "بارگذاری فایل انجام نشد."); }
    finally { setBusy(false); }
  }

  return <section className="imports-card" aria-labelledby="imports-title">
    <div className="card-heading imports-heading"><div><span className="overline">ورودی امن داده</span><h3 id="imports-title">فایل‌های مالی</h3><p>فایل پس از بررسی نوع، ساختار و بدافزار وارد فضای امن شرکت می‌شود.</p></div><span className="secure-badge"><Icon name="shield" />قرنطینه و اسکن فعال</span></div>
    {canUpload ? <form className="upload-form" onSubmit={upload}><div className={`dropzone${dragging ? " dragging" : ""}${selectedFile ? " has-file" : ""}`} onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={drop}><Input ref={inputRef} className="sr-only" id="financial-file" name="file-picker" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => acceptFile(event.target.files?.[0])} /><span className="upload-icon"><Icon name={selectedFile ? "file" : "upload"} /></span>{selectedFile ? <><strong>{selectedFile.name}</strong><small>{formatBytes(selectedFile.size)}</small></> : <><strong>فایل را اینجا رها کنید</strong><small>CSV یا XLSX، حداکثر ۵۰ مگابایت</small></>}<Button type="button" className="secondary-button" onClick={() => inputRef.current?.click()}>{selectedFile ? "تغییر فایل" : "انتخاب فایل"}</Button></div><div className="upload-fields"><label>نوع منبع<NativeSelect name="source_kind" defaultValue="accounting"><NativeSelectOption value="accounting">نرم‌افزار حسابداری</NativeSelectOption><NativeSelectOption value="bank">گردش حساب بانکی</NativeSelectOption><NativeSelectOption value="sales">فروش و درآمد</NativeSelectOption></NativeSelect></label><label>عنوان منبع<Input name="source_label" required minLength={2} maxLength={160} defaultValue="ورودی مالی" placeholder="مثلاً دفتر کل شهریور" /></label><Button className="primary-button" disabled={busy}><Icon name="upload" />{busy ? "در حال دریافت…" : "بارگذاری امن"}</Button></div></form> : <div className="viewer-note"><Icon name="shield" /><span><strong>دسترسی مشاهده‌گر</strong>برای بارگذاری فایل، نقش مدیر مالی یا مشاور لازم است.</span></div>}
    <div className="upload-messages" aria-live="polite">{error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="form-success">{notice}</p>}</div>
    <div className="imports-list" aria-label="فایل‌های اخیر"><div className="list-title"><strong>فایل‌های اخیر</strong><span>{new Intl.NumberFormat("fa-IR").format(items.length)} مورد</span></div>{!items.length ? <div className="imports-empty"><Icon name="file" /><p>هنوز فایلی برای این شرکت بارگذاری نشده است.</p></div> : items.map((item) => <article className="import-row" key={item.id}><span className={`file-state state-${item.scan_status}`}><Icon name="file" /></span><div className="file-info"><strong>{item.original_name}</strong><small>{item.source_label} · {formatBytes(item.size_bytes)} · {new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.created_at))}</small>{item.duplicate_detected && <span className="duplicate-note">نسخه‌ای با محتوای یکسان قبلاً ثبت شده است.</span>}{item.failure_message && <span className="failure-note">{item.failure_message}</span>}</div><div className="file-progress"><span className={`status status-${item.status}`}>{importStatusLabels[item.status]}</span>{["uploaded", "inspecting"].includes(item.status) && <span className="progress-track"><i style={{ width: `${item.progress}%` }} /></span>}</div><div className="import-actions">{item.scan_status === "clean" ? <Link className="prepare-link" href={`/companies/${company.id}/imports/${item.id}`}><Icon name="table" /><span>{item.stage === "normalized" ? "مشاهده" : "آماده‌سازی"}</span></Link> : null}{item.scan_status === "clean" ? <a className="download-button" href={`${API_URL}/companies/${company.id}/imports/${item.id}/download`}><Icon name="download" /><span className="sr-only">دریافت {item.original_name}</span></a> : <span className="download-placeholder" aria-hidden="true" />}</div></article>)}</div>
  </section>;
}
