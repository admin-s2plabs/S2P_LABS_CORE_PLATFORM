import { useState, useRef, useCallback, useEffect } from "react";
import { apiRequest } from "@/lib/queryClient";

export type RecorderState =
  | "idle"
  | "requesting"
  | "recording"
  | "processing"
  | "done"
  | "error";

export interface UseAudioRecorderResult {
  state: RecorderState;
  transcript: string;
  errorMessage: string;
  isSupported: boolean;
  toggle: () => void;
  reset: () => void;
}

const MAX_RECORDING_MS = 60_000;

export function useAudioRecorder(): UseAudioRecorderResult {
  const [state, setState] = useState<RecorderState>("idle");
  const [transcript, setTranscript] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const isSupported =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined";

  const cleanup = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (mediaRecorderRef.current) {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // already stopped
      }
      mediaRecorderRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    chunksRef.current = [];
  }, []);

  const stopAndTranscribe = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    recorder.stop();
  }, []);

  const startRecording = useCallback(async () => {
    if (!isSupported) {
      setState("error");
      setErrorMessage("Your browser does not support audio recording.");
      return;
    }

    setState("requesting");

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,       // mono — halves bitrate, Whisper is mono anyway
          sampleRate: 16000,     // hint: match Whisper's native rate (browser may ignore)
        },
        video: false,
      });
    } catch (err: unknown) {
      const e = err as { name?: string };
      if (e?.name === "NotAllowedError" || e?.name === "PermissionDeniedError") {
        setState("error");
        setErrorMessage("Microphone access denied. Please allow microphone permission and try again.");
      } else {
        setState("error");
        setErrorMessage("Could not access the microphone. Please check your device settings.");
      }
      return;
    }

    streamRef.current = stream;
    chunksRef.current = [];

    // Prefer webm/opus; fall back to whatever the browser supports
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm")
      ? "audio/webm"
      : undefined;

    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = async () => {
      const rawBlob = new Blob(chunksRef.current, {
        type: recorder.mimeType || "audio/webm",
      });
      cleanup();

      if (rawBlob.size < 1000) {
        setState("error");
        setErrorMessage("Recording was too short. Please try speaking longer.");
        return;
      }

      setState("processing");

      try {
        const formData = new FormData();
        formData.append("audio", rawBlob, "recording.webm");

        const res = await apiRequest("POST", "/api/ai-console/speech-to-text", formData);
        const data = (await res.json()) as { transcript?: string; error?: string };

        if (!data.transcript) {
          setState("error");
          setErrorMessage(data.error ?? "No speech detected. Try Again.");
          return;
        }

        setTranscript(data.transcript);
        setState("done");
      } catch (err: unknown) {
        const e = err as { message?: string };
        setState("error");
        setErrorMessage(e?.message ?? "Transcription failed. Please try again.");
      }
    };

    recorder.start(250); // collect chunks every 250 ms — ensures no audio is lost on stop
    setState("recording");

    timeoutRef.current = setTimeout(() => {
      stopAndTranscribe();
    }, MAX_RECORDING_MS);
  }, [isSupported, cleanup, stopAndTranscribe]);

  const toggle = useCallback(() => {
    if (state === "recording") {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      stopAndTranscribe();
    } else if (state === "idle" || state === "done" || state === "error") {
      setTranscript("");
      setErrorMessage("");
      startRecording();
    }
  }, [state, stopAndTranscribe, startRecording]);

  const reset = useCallback(() => {
    cleanup();
    setTranscript("");
    setErrorMessage("");
    setState("idle");
  }, [cleanup]);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return { state, transcript, errorMessage, isSupported, toggle, reset };
}
