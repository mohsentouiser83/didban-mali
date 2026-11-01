import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { useAssistantVoice } from "./use-assistant-voice";
vi.mock("@/lib/api", async (original) => ({ ...(await original<typeof import("@/lib/api")>()), api: vi.fn() }));
const stopTrack = vi.fn();
const getUserMedia = vi.fn();
class Recorder {
  static isTypeSupported = () => true;
  static latest: Recorder;
  state = "inactive";
  mimeType = "audio/webm;codecs=opus";
  ondataavailable?: (e: { data: Blob }) => void;
  onstop?: () => void;
  constructor() { Recorder.latest = this; }
  start() { this.state = "recording"; }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["test-audio"], { type: this.mimeType }) });
    this.onstop?.();
  }
}
const onTranscript = vi.fn();
const options = { path: "/companies/a/assistant/transcriptions", active: true, onTranscript, onSessionExpired: vi.fn() };
beforeEach(() => {
  vi.mocked(api).mockReset().mockResolvedValue({ enabled: true });
  onTranscript.mockReset();
  stopTrack.mockReset();
  getUserMedia.mockReset().mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] });
  vi.stubGlobal("MediaRecorder", Recorder);
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
  URL.createObjectURL = vi.fn(() => "blob:voice-preview");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => vi.unstubAllGlobals());
it("does not request microphone access when speech is disabled", async () => {
  vi.mocked(api).mockResolvedValue({ enabled: false });
  const { result } = renderHook(() => useAssistantVoice(options));
  await act(() => result.current.start());
  expect(getUserMedia).not.toHaveBeenCalled();
  expect(result.current.error).toContain("فعال نیست");
});
it("releases microphone, previews locally, and returns editable text only on explicit transcription", async () => {
  const { result } = renderHook(() => useAssistantVoice(options));
  await act(() => result.current.start());
  expect(result.current.phase).toBe("recording");
  act(() => result.current.stop());
  expect(stopTrack).toHaveBeenCalledOnce();
  expect(result.current.phase).toBe("preview");
  expect(vi.mocked(api)).toHaveBeenCalledTimes(1);
  vi.mocked(api).mockResolvedValueOnce({ text: "  موجودی چقدر است؟  " });
  await act(() => result.current.transcribe());
  expect(onTranscript).toHaveBeenCalledWith("موجودی چقدر است؟");
  expect(result.current.phase).toBe("idle");
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:voice-preview");
});
it("discards a late microphone grant after cancel", async () => {
  let grant!: (value: unknown) => void;
  getUserMedia.mockReturnValue(new Promise((resolve) => { grant = resolve; }));
  const { result } = renderHook(() => useAssistantVoice(options));
  act(() => { void result.current.start(); });
  await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
  act(() => result.current.cancel());
  await act(async () => grant({ getTracks: () => [{ stop: stopTrack }] }));
  expect(stopTrack).toHaveBeenCalledOnce();
  expect(result.current.phase).toBe("idle");
});
it("keeps the recording available after failed transcription", async () => {
  const { result } = renderHook(() => useAssistantVoice(options));
  await act(() => result.current.start());
  act(() => result.current.stop());
  vi.mocked(api).mockRejectedValueOnce(new Error("ارتباط برقرار نشد."));
  await act(() => result.current.transcribe());
  expect(result.current.phase).toBe("preview");
  expect(result.current.url).toBe("blob:voice-preview");
  expect(onTranscript).not.toHaveBeenCalled();
});
it("stops microphone capture on unmount", async () => {
  const { result, unmount } = renderHook(() => useAssistantVoice(options));
  await act(() => result.current.start());
  unmount();
  expect(stopTrack).toHaveBeenCalledOnce();
  expect(Recorder.latest.state).toBe("inactive");
});
