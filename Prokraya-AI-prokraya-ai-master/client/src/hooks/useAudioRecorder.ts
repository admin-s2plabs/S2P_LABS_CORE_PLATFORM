import { useState, useRef, useCallback, useEffect } from "react";

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

const MAX_RECORDING_MS = 120_000;
const MAX_AUTO_RESTARTS = 10;

function getSpeechRecognitionCtor(): (new () => any) | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
}

export function useAudioRecorder(): UseAudioRecorderResult {
  const [state, setState] = useState<RecorderState>("idle");
  const [transcript, setTranscript] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const recognitionRef = useRef<any>(null);
  const finalTranscriptRef = useRef("");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Chrome's no-speech timeout can fire within a second or two of start() —
  // long before a person has actually begun talking. Treat that (and
  // "aborted") as a blip and keep listening instead of ending the session;
  // stoppingRef distinguishes that from a real end (manual stop / hard error).
  const stoppingRef = useRef(false);
  const hardErrorRef = useRef(false);
  const restartCountRef = useRef(0);

  const isSupported = typeof window !== "undefined" && !!getSpeechRecognitionCtor();

  const cleanup = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (recognitionRef.current) {
      recognitionRef.current.onresult = null;
      recognitionRef.current.onerror = null;
      recognitionRef.current.onend = null;
      recognitionRef.current.onstart = null;
      try {
        recognitionRef.current.stop();
      } catch {
        // already stopped
      }
      recognitionRef.current = null;
    }
  }, []);

  // Browser's built-in speech recognition (Web Speech API) — no audio leaves
  // the device. Not supported in Firefox/older Safari; isSupported gates that.
  const startRecording = useCallback(() => {
    const SpeechRecognitionCtor = getSpeechRecognitionCtor();
    if (!SpeechRecognitionCtor) {
      setState("error");
      setErrorMessage("Your browser does not support speech recognition.");
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = navigator.language || "en-US";
    recognition.continuous = true;
    recognition.interimResults = false;
    finalTranscriptRef.current = "";
    stoppingRef.current = false;
    hardErrorRef.current = false;
    restartCountRef.current = 0;

    recognition.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          finalTranscriptRef.current += e.results[i][0].transcript;
        }
      }
    };

    recognition.onerror = (e: any) => {
      if (e.error === "no-speech" || e.error === "aborted") return; // handled in onend
      stoppingRef.current = true;
      hardErrorRef.current = true;
      setState("error");
      setErrorMessage(
        e.error === "not-allowed" || e.error === "service-not-allowed"
          ? "Microphone access denied. Please allow microphone permission and try again."
          : "Speech recognition failed. Please try again.",
      );
    };

    recognition.onend = () => {
      if (!stoppingRef.current && restartCountRef.current < MAX_AUTO_RESTARTS) {
        restartCountRef.current += 1;
        try {
          recognition.start();
          return;
        } catch {
          // fall through and finalize below
        }
      }

      cleanup();
      if (hardErrorRef.current) return; // already surfaced in onerror
      const text = finalTranscriptRef.current.trim();
      if (!text) {
        setState("error");
        setErrorMessage("No speech detected. Please try again.");
        return;
      }
      setTranscript(text);
      setState("done");
    };

    recognition.onstart = () => setState("recording");

    recognitionRef.current = recognition;
    setState("requesting");
    try {
      recognition.start();
    } catch {
      setState("error");
      setErrorMessage("Could not start speech recognition. Please try again.");
      return;
    }

    timeoutRef.current = setTimeout(() => {
      stoppingRef.current = true;
      recognition.stop();
    }, MAX_RECORDING_MS);
  }, [cleanup]);

  const toggle = useCallback(() => {
    if (state === "recording") {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      stoppingRef.current = true;
      recognitionRef.current?.stop();
    } else if (state === "idle" || state === "done" || state === "error") {
      setTranscript("");
      setErrorMessage("");
      startRecording();
    }
  }, [state, startRecording]);

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
