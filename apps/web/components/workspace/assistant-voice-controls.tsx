"use client";
import { useRef, useState } from "react";
import { MicrophoneIcon, StopIcon, TrashIcon, PlayIcon, PauseIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import type { AssistantVoice } from "@/hooks/use-assistant-voice";

export function AssistantVoiceButton({ voice, disabled }: { voice: AssistantVoice; disabled: boolean }) {
  const recording = voice.phase === "recording";
  return (
    <Button
      variant={recording ? "danger" : "secondary"}
      disabled={disabled || voice.phase === "preview" || voice.phase === "transcribing"}
      busy={voice.phase === "requesting"}
      aria-label={recording ? "پایان ضبط" : "ضبط ویس"}
      aria-pressed={recording}
      onClick={recording ? voice.stop : () => void voice.start()}
      className="size-11 shrink-0 p-0"
    >
      {recording ? <StopIcon size={18} aria-hidden /> : <MicrophoneIcon size={18} aria-hidden />}
    </Button>
  );
}

export function AssistantVoiceControls({ voice }: { voice: AssistantVoice }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [playbackError, setPlaybackError] = useState(false);
  const preview = voice.phase === "preview" || voice.phase === "transcribing";
  const elapsed = `${Math.floor(voice.seconds / 60)}:${String(voice.seconds % 60).padStart(2, "0")}`.replace(/\d/g, (n) => "۰۱۲۳۴۵۶۷۸۹"[Number(n)]);
  if (voice.phase === "idle" && !voice.error) return null;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {voice.phase !== "idle" && (
          <>
            {preview && voice.url && (
              <>
                <audio ref={audio} src={voice.url} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onError={() => setPlaybackError(true)} />
                <Button
                  variant="secondary" aria-label={playing ? "توقف پخش ویس" : "پخش ویس"}
                  className="size-11 p-0" disabled={voice.phase === "transcribing"}
                  onClick={() => {
                    if (playing) audio.current?.pause();
                    else {
                      setPlaybackError(false);
                      void audio.current?.play().catch(() => setPlaybackError(true));
                    }
                  }}
                >
                  {playing ? <PauseIcon size={18} aria-hidden /> : <PlayIcon size={18} aria-hidden />}
                </Button>
                <Button variant="soft" busy={voice.phase === "transcribing"} onClick={() => { audio.current?.pause(); void voice.transcribe(); }} className="px-3 text-xs">
                  {voice.phase === "transcribing" ? "در حال تبدیل" : "تبدیل به متن"}
                </Button>
              </>
            )}
            <span className="text-xs tabular-nums text-muted" role="status">
              {voice.phase === "recording" ? `در حال ضبط ${elapsed} / ۱:۰۰` : preview ? `ویس ${elapsed}` : ""}
            </span>
            <Button variant="ghost" aria-label="لغو و حذف ویس" onClick={voice.cancel} className="ms-auto size-11 p-0">
              <TrashIcon size={18} aria-hidden />
            </Button>
          </>
        )}
      </div>
      {preview && <p className="text-xs leading-6 text-muted">صدا برای تبدیل به سرویس گفتار ارسال می‌شود؛ متن را پیش از ارسال بررسی کنید.</p>}
      <FieldError>{voice.error || (playbackError && preview ? "پخش ویس انجام نشد. دوباره تلاش کنید." : undefined)}</FieldError>
    </div>
  );
}
