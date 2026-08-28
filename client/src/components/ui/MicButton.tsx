import { useEffect } from "react";
import { Mic, Loader2, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { cn } from "@/lib/utils";

interface MicButtonProps {
  onTranscript: (text: string) => void;
  compact?: boolean;
  className?: string;
}

export function MicButton({ onTranscript, compact = false, className }: MicButtonProps) {
  const { state, transcript, errorMessage, isSupported, toggle, reset } = useAudioRecorder();
  const { toast } = useToast();

  useEffect(() => {
    if (state === "done" && transcript) {
      onTranscript(transcript);
      reset();
    }
  }, [state, transcript, onTranscript, reset]);

  useEffect(() => {
    if (state === "error" && errorMessage) {
      toast({ title: "Microphone error", description: errorMessage, variant: "destructive" });
      reset();
    }
  }, [state, errorMessage, toast, reset]);

  if (!isSupported) return null;

  const isRecording = state === "recording";
  const isProcessing = state === "processing" || state === "requesting";

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={toggle}
      disabled={isProcessing}
      title={isRecording ? "Stop recording" : "Speak your message"}
      className={cn(
        compact ? "h-7 w-7" : "h-8 w-8",
        "rounded-lg transition-all duration-200 flex-shrink-0",
        isRecording && "text-red-500 bg-red-50 dark:bg-red-900/20 animate-pulse",
        className,
      )}
    >
      {isProcessing ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : isRecording ? (
        <Square className="h-3 w-3 fill-current text-red-500" />
      ) : (
        <Mic className="h-3.5 w-3.5" />
      )}
    </Button>
  );
}
