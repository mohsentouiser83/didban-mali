"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  command,
  ApiError,
  type Command,
  type Schema,
} from "@didban/api-client";
import { api, message } from "@/lib/api";
import { pathFor } from "./use-intake";
type Job = { file: File; key: Command; version?: number; finished: boolean };
type Batch = {
  jobs: Job[];
  create: Command;
  session?: string;
  period: string | null;
  seal?: { key: Command; version: number; files: string[] };
};
export function useUploadBatch(company: string, existingSession?: string) {
  const router = useRouter(),
    cache = useQueryClient(),
    batch = useRef<Batch | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string>(),
    [retryable, setRetryable] = useState(false),
    [progress, setProgress] = useState<{
      completed: number;
      total: number;
      name: string;
    }>();
  const run = async () => {
    const current = batch.current;
    if (!current) return;
    setBusy(true);
    setError(undefined);
    setRetryable(false);
    try {
      if (!current.session) {
        const session = await api.mutate<Schema<"ProcessingSession">>(
          `${pathFor(company)}/processing-sessions`,
          "POST",
          { period_id: current.period },
          current.create,
        );
        current.session = session.id;
        await cache.invalidateQueries({ queryKey: ["sessions", company] });
      }
      const base = `${pathFor(company)}/processing-sessions/${current.session}`;
      for (const job of current.jobs) {
        if (job.finished) continue;
        setProgress({
          completed: current.jobs.filter((j) => j.finished).length,
          total: current.jobs.length,
          name: job.file.name,
        });
        if (job.version === undefined)
          job.version = (
            await api.get<Schema<"ProcessingSession">>(base)
          ).session_version;
        await api.upload<Schema<"File">>(
          `${base}/files`,
          job.file,
          job.key,
          job.version,
        );
        job.finished = true;
        setProgress({
          completed: current.jobs.filter((j) => j.finished).length,
          total: current.jobs.length,
          name: job.file.name,
        });
      }
      if (!current.seal) {
        const session = await api.get<Schema<"ProcessingSession">>(base),
          files = await api.get<Schema<"FilePage">>(`${base}/files?limit=100`);
        current.seal = {
          key: command(),
          version: session.session_version,
          files: files.items.map((f) => f.id),
        };
      }
      await api.mutate(
        `${base}/seal`,
        "POST",
        { expected_file_ids: current.seal.files },
        current.seal.key,
        current.seal.version,
      );
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["sessions", company] }),
        cache.invalidateQueries({
          queryKey: ["session", company, current.session],
        }),
        cache.invalidateQueries({
          queryKey: ["files", company, current.session],
        }),
      ]);
      router.push(`/companies/${company}/uploads/${current.session}`);
      batch.current = null;
    } catch (e) {
      setError(message(e));
      setRetryable(!(e instanceof ApiError) || e.status >= 500);
    } finally {
      setBusy(false);
    }
  };
  const start = (files: File[], period: string | null) => {
    if (busy || !files.length) return;
    if (files.length > 10) {
      setError("حداکثر ۱۰ فایل انتخاب کنید.");
      return;
    }
    if (
      files.some(
        (f) => !/[.](csv|xls|xlsx)$/i.test(f.name) || f.size > 20971520,
      )
    ) {
      setError("فقط Excel و CSV تا حجم ۲۰ مگابایت برای هر فایل مجاز است.");
      return;
    }
    batch.current = {
      jobs: files.map((file) => ({ file, key: command(), finished: false })),
      create: command(),
      period,
      session: existingSession,
    };
    void run();
  };
  return {
    start,
    retry: () => {
      void run();
    },
    busy,
    error,
    retryable,
    progress,
  };
}
