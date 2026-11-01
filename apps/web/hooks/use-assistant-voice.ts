"use client";
import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";

const MAX_SECONDS = 60;
const MAX_BYTES = 10 * 1024 * 1024;
const FORMATS = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"];
type Phase = "idle" | "requesting" | "recording" | "preview" | "transcribing";

export function useAssistantVoice({
  path, active, onTranscript, onSessionExpired,
}: {
  path: string | null;
  active: boolean;
  onTranscript: (text: string) => void;
  onSessionExpired: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [url, setUrl] = useState<string>();
  const [error, setError] = useState<string>();
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const blob = useRef<Blob | null>(null);
  const objectUrl = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const generation = useRef(0);
  const lock = useRef(false);
  const request = useRef<AbortController | null>(null);

  const releaseMicrophone = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  };
  const dispose = () => {
    generation.current++;
    request.current?.abort();
    request.current = null;
    const current = recorder.current;
    recorder.current = null;
    if (current && current.state !== "inactive") current.stop();
    releaseMicrophone();
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = null;
    blob.current = null;
    lock.current = false;
  };
  const cancel = () => {
    dispose();
    setPhase("idle");
    setUrl(undefined);
    setSeconds(0);
    setError(undefined);
  };
  useEffect(() => {
    return dispose;
    // Resource lifetime follows the panel and company, not render callbacks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, path]);

  const start = async () => {
    if (lock.current || !active || !path) return;
    cancel();
    lock.current = true;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("ضبط صدا در این مرورگر در دسترس نیست؛ از مرورگر به‌روز و اتصال امن استفاده کنید.");
      lock.current = false;
      return;
    }
    const mimeType = FORMATS.find((type) => MediaRecorder.isTypeSupported(type));
    if (!mimeType) {
      setError("قالب ضبط صدا در این مرورگر پشتیبانی نمی‌شود.");
      lock.current = false;
      return;
    }
    const version = generation.current;
    setPhase("requesting");
    try {
      const abort = new AbortController();
      request.current = abort;
      const status = await api<{ enabled: boolean }>(path.replace(/transcriptions$/, "voice-status"), { signal: abort.signal });
      if (version !== generation.current) return;
      if (!status.enabled) throw new Error("تبدیل ویس فعال نیست؛ مدیر نصب باید سرویس گفتار را تنظیم کند.");
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (version !== generation.current) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = media;
      const recording = new MediaRecorder(media, { mimeType });
      recorder.current = recording;
      const chunks: Blob[] = [];
      let size = 0;
      let oversized = false;
      recording.ondataavailable = (event) => {
        if (version !== generation.current) return;
        size += event.data.size;
        if (size > MAX_BYTES) {
          oversized = true;
          if (recording.state !== "inactive") recording.stop();
          return;
        }
        chunks.push(event.data);
      };
      recording.onerror = () => {
        if (version !== generation.current) return;
        cancel();
        setError("ضبط صدا انجام نشد. دوباره تلاش کنید.");
      };
      recording.onstop = () => {
        if (version !== generation.current) return;
        releaseMicrophone();
        recorder.current = null;
        const audio = new Blob(chunks, { type: recording.mimeType });
        if (oversized || !audio.size) {
          lock.current = false;
          setPhase("idle");
          setError(oversized ? "حجم ویس بیشتر از ۱۰ مگابایت است." : "صدایی ضبط نشد.");
          return;
        }
        blob.current = audio;
        objectUrl.current = URL.createObjectURL(audio);
        setUrl(objectUrl.current);
        setPhase("preview");
        lock.current = false;
      };
      recording.start(250);
      setPhase("recording");
      const began = Date.now();
      timer.current = setInterval(() => {
        const elapsed = Math.min(MAX_SECONDS, Math.floor((Date.now() - began) / 1000));
        setSeconds(elapsed);
        if (elapsed >= MAX_SECONDS && recording.state === "recording") recording.stop();
      }, 250);
    } catch (cause) {
      if (version !== generation.current) return;
      releaseMicrophone();
      lock.current = false;
      setPhase("idle");
      if (cause instanceof ApiError && cause.status === 401) {
        cancel();
        onSessionExpired();
        return;
      }
      setError(cause instanceof DOMException && cause.name === "NotAllowedError"
        ? "دسترسی میکروفون مجاز نیست. مجوز مرورگر را بررسی کنید."
        : cause instanceof Error && !(cause instanceof DOMException) ? cause.message : "میکروفون در دسترس نیست. دوباره تلاش کنید.");
    }
  };
  const stop = () => {
    if (recorder.current?.state === "recording") recorder.current.stop();
  };
  const transcribe = async () => {
    if (lock.current || !blob.current || !path || !active) return;
    lock.current = true;
    setError(undefined);
    setPhase("transcribing");
    const version = generation.current;
    const abort = new AbortController();
    request.current = abort;
    const data = new FormData();
    const type = blob.current.type;
    const extension = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
    data.append("file", blob.current, `voice.${extension}`);
    try {
      const result = await api<{ text: string }>(path, { method: "POST", body: data, signal: abort.signal });
      if (version !== generation.current) return;
      if (!result.text.trim()) throw new Error("گفتاری تشخیص داده نشد. دوباره ضبط کنید.");
      onTranscript(result.text.trim());
      cancel();
    } catch (cause) {
      if (version !== generation.current || abort.signal.aborted) return;
      if (cause instanceof ApiError && cause.status === 401) {
        cancel();
        onSessionExpired();
        return;
      }
      setError(cause instanceof Error ? cause.message : "تبدیل ویس انجام نشد.");
      setPhase("preview");
      lock.current = false;
    }
  };
  return { phase, seconds, url, error, start, stop, cancel, transcribe };
}
export type AssistantVoice = ReturnType<typeof useAssistantVoice>;
