import * as React from "react";
import { useRef, useState, useLayoutEffect } from "react";
import { Send, Loader2, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MicButton } from "@/components/ui/MicButton";
import { cn } from "@/lib/utils";

export interface ChatComposerProps extends Omit<React.ComponentPropsWithoutRef<"textarea">, "children"> {
  value: string;
  onSubmit: () => void;
  /**
   * Cancel an in-flight request. When provided and `isStreaming` is true, the send
   * button becomes a Stop button that calls this instead of the spinner.
   */
  onStop?: () => void;
  isStreaming?: boolean;
  colorTheme?: "purple" | "amber" | "blue" | "cyan" | "emerald" | "primary";
  /** Extra classes for the send/stop button (e.g. "rounded-full" for a circular button). */
  submitButtonClassName?: string;
  /**
   * ChatGPT-style single-row layout: left actions, textarea, mic, and send button
   * all sit on one line (the textarea still auto-grows). Renders as a rounded pill.
   */
  singleRow?: boolean;
  textareaDataTestId?: string;
  submitDataTestId?: string;
  backdrop?: React.ReactNode;
  leftActions?: React.ReactNode;
  rightActions?: React.ReactNode;
  isCompact?: boolean;
  isSubmitDisabled?: boolean;
  children?: React.ReactNode;
  /** When provided, a mic button appears in the footer; transcript text is passed to this callback. */
  onMicTranscript?: (text: string) => void;
}

const themeStyles = {
  purple: {
    focusRing: "focus-within:ring-purple-500/20 dark:focus-within:ring-purple-400/20 focus-within:border-purple-500/70 dark:focus-within:border-purple-400/70",
    submitButton: "bg-purple-600 hover:bg-purple-700 text-white dark:bg-purple-600 dark:hover:bg-purple-700",
  },
  amber: {
    focusRing: "focus-within:ring-amber-500/20 dark:focus-within:ring-amber-400/20 focus-within:border-amber-500/70 dark:focus-within:border-amber-400/70",
    submitButton: "bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-600 dark:hover:bg-amber-700",
  },
  blue: {
    focusRing: "focus-within:ring-blue-500/20 dark:focus-within:ring-blue-400/20 focus-within:border-blue-500/70 dark:focus-within:border-blue-400/70",
    submitButton: "bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-600 dark:hover:bg-blue-700",
  },
  cyan: {
    focusRing: "focus-within:ring-cyan-500/20 dark:focus-within:ring-cyan-400/20 focus-within:border-cyan-500/70 dark:focus-within:border-cyan-400/70",
    submitButton: "bg-cyan-600 hover:bg-cyan-700 text-white dark:bg-cyan-600 dark:hover:bg-cyan-700",
  },
  emerald: {
    focusRing: "focus-within:ring-emerald-500/20 dark:focus-within:ring-emerald-400/20 focus-within:border-emerald-500/70 dark:focus-within:border-emerald-400/70",
    submitButton: "bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-emerald-600 dark:hover:bg-emerald-700",
  },
  primary: {
    focusRing: "focus-within:ring-primary/20 focus-within:border-primary/70",
    submitButton: "bg-primary hover:bg-primary/90 text-primary-foreground",
  },
};

const ChatComposer = React.forwardRef<HTMLTextAreaElement, ChatComposerProps>(
  (
    {
      value,
      onSubmit,
      onStop,
      isStreaming = false,
      colorTheme = "primary",
      submitButtonClassName,
      singleRow = false,
      textareaDataTestId,
      submitDataTestId,
      backdrop,
      leftActions,
      rightActions,
      isCompact = false,
      isSubmitDisabled,
      children,
      className,
      disabled,
      placeholder,
      onKeyDown,
      onScroll,
      onChange,
      onMicTranscript,
      ...props
    },
    forwardedRef
  ) => {
    const [isComposing, setIsComposing] = useState(false);
    const internalRef = useRef<HTMLTextAreaElement | null>(null);
    const backdropRef = useRef<HTMLDivElement | null>(null);

    const setRef = React.useCallback(
      (node: HTMLTextAreaElement | null) => {
        internalRef.current = node;
        if (typeof forwardedRef === "function") {
          forwardedRef(node);
        } else if (forwardedRef) {
          forwardedRef.current = node;
        }
      },
      [forwardedRef]
    );

    const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
      if (onScroll) onScroll(e);
      if (backdropRef.current) {
        backdropRef.current.scrollTop = e.currentTarget.scrollTop;
        backdropRef.current.scrollLeft = e.currentTarget.scrollLeft;
      }
    };

    useLayoutEffect(() => {
      const textarea = internalRef.current;
      if (!textarea) return;

      let isAdjusting = false;
      const adjustHeight = () => {
        if (isAdjusting) return;
        isAdjusting = true;

        const style = window.getComputedStyle(textarea);

        // Reset height to single line size dynamically to measure scrollHeight correctly on delete
        textarea.style.height = "auto";

        const scrollHeight = textarea.scrollHeight;

        let lineHeight = parseFloat(style.lineHeight);
        if (isNaN(lineHeight)) {
          const fontSize = parseFloat(style.fontSize) || 14;
          lineHeight = fontSize * 1.5;
        }

        const paddingTop = parseFloat(style.paddingTop) || 0;
        const paddingBottom = parseFloat(style.paddingBottom) || 0;
        const borderTop = parseFloat(style.borderTopWidth) || 0;
        const borderBottom = parseFloat(style.borderBottomWidth) || 0;
        const paddingY = paddingTop + paddingBottom + borderTop + borderBottom;

        const maxHeight = lineHeight * 5 + paddingY;
        const targetHeight = Math.min(scrollHeight, maxHeight);

        textarea.style.height = `${targetHeight}px`;

        if (scrollHeight > maxHeight) {
          textarea.style.overflowY = "auto";
        } else {
          textarea.style.overflowY = "hidden";
          textarea.scrollTop = 0;
        }

        if (backdropRef.current) {
          backdropRef.current.scrollTop = textarea.scrollTop;
        }

        isAdjusting = false;
      };

      adjustHeight();

      // adjustHeight writes textarea.style.height, i.e. it resizes the very element this
      // observer watches. Calling it inside the callback re-enters the observation cycle and
      // Chromium reports "ResizeObserver loop completed with undelivered notifications" as an
      // ErrorEvent with error === null, which the Vite runtime-error overlay renders as
      // "(unknown runtime error)". Deferring to the next frame breaks the cycle.
      let raf = 0;
      const resizeObserver = new ResizeObserver(() => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(adjustHeight);
      });
      resizeObserver.observe(textarea);

      return () => {
        cancelAnimationFrame(raf);
        resizeObserver.disconnect();
      };
    }, [value]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (onKeyDown) {
        onKeyDown(e);
      }

      if (e.defaultPrevented) return;

      if (e.key === "Enter" && !e.shiftKey && !e.altKey ) {
        if (isComposing) return;
        e.preventDefault();
        const canSubmit = isSubmitDisabled !== undefined
          ? !isSubmitDisabled
          : (value.trim() && !isStreaming && !disabled);
        if (onSubmit && canSubmit) {
          onSubmit();
        }
      }
    };

    const activeTheme = themeStyles[colorTheme] || themeStyles.primary;

    // Single-row mode keeps the textarea on one comfortable line (ChatGPT-style)
    // since the buttons sit beside it, not below.
    const textMinHeight = singleRow ? "36px" : isCompact ? "36px" : "44px";
    const textPadding = singleRow
      ? "text-base leading-6 py-1.5 px-2"
      : isCompact
        ? "text-xs leading-5 py-1.5 px-3"
        : "text-sm leading-6 py-2.5 px-4";

    const textareaEl = (
      <div className="relative flex-1 flex" style={{ minHeight: textMinHeight }}>
        {backdrop && (
          <div
            ref={backdropRef}
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute inset-0 w-full h-full whitespace-pre-wrap break-words overflow-hidden text-transparent select-none z-0",
              textPadding
            )}
          >
            {backdrop}
          </div>
        )}
        <textarea
          ref={setRef}
          rows={1}
          value={value}
          onChange={onChange}
          onScroll={handleScroll}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={() => setIsComposing(false)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled || isStreaming}
          className={cn(
            "w-full bg-transparent resize-none focus:outline-none focus:ring-0 focus-visible:ring-0",
            textPadding,
            "placeholder:text-muted-foreground/60 transition-colors duration-150",
            "[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-muted-foreground/20 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/30 [&::-webkit-scrollbar-track]:bg-transparent",
            backdrop ? "text-transparent caret-foreground relative z-10" : "text-foreground"
          )}
          style={{
            minHeight: textMinHeight,
            maxHeight: isCompact ? "96px" : "144px",
          }}
          data-testid={textareaDataTestId}
          {...props}
        />
        {children}
      </div>
    );

    const submitButtonEl = isStreaming && onStop ? (
      <Button
        onClick={onStop}
        size="icon"
        className={cn(
          "h-8 w-8 rounded-lg shadow-sm transition-all duration-200",
          activeTheme.submitButton,
          submitButtonClassName
        )}
        aria-label="Stop generating"
        title="Stop"
      >
        <Square className="h-3.5 w-3.5 fill-current" />
      </Button>
    ) : (
      <Button
        onClick={onSubmit}
        disabled={isSubmitDisabled !== undefined ? isSubmitDisabled : (disabled || !value.trim() || isStreaming)}
        size="icon"
        className={cn(
          "h-8 w-8 rounded-lg shadow-sm transition-all duration-200",
          activeTheme.submitButton,
          submitButtonClassName
        )}
        data-testid={submitDataTestId}
        aria-label="Send message"
      >
        {isStreaming ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Send className="h-4 w-4" />
        )}
      </Button>
    );

    // ChatGPT-style single-row pill: everything on one line. Vertically centered
    // so a single line of text sits level with the buttons; when the textarea
    // grows to multiple lines the row simply grows with it.
    const disclaimer = (
      <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
        Prokraya AI can make mistakes. Verify important information.
      </p>
    );

    if (singleRow) {
      return (
        <>
        <div
          className={cn(
            "relative flex items-center gap-2 w-full rounded-full border border-input bg-background/95 shadow-sm transition-all duration-200",
            "focus-within:ring-4 focus-within:ring-offset-0 focus-within:shadow-md",
            "px-3 py-2",
            activeTheme.focusRing,
            className
          )}
        >
          {(leftActions || rightActions) && (
            <div className="flex items-center gap-1.5 flex-shrink-0">{leftActions}{rightActions}</div>
          )}
          {textareaEl}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {onMicTranscript && (
              <MicButton onTranscript={onMicTranscript} compact={isCompact} />
            )}
            {submitButtonEl}
          </div>
        </div>
        {disclaimer}
        </>
      );
    }

    return (
      <>
      <div
        className={cn(
          "relative flex flex-col w-full rounded-xl border border-input bg-background/95 shadow-sm transition-all duration-200",
          "focus-within:ring-4 focus-within:ring-offset-0 focus-within:shadow-md",
          activeTheme.focusRing,
          className
        )}
      >
        {textareaEl}

        {/* Footer Row */}
        <div className={cn(
          "flex items-center justify-between border-t border-muted/50 bg-muted/5 rounded-b-xl flex-shrink-0",
          isCompact ? "px-2 py-1" : "px-3 py-2"
        )}>
          <div className="flex-1 min-w-0 flex items-center gap-1.5 mr-3">{leftActions}</div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {rightActions}
            {onMicTranscript && (
              <MicButton onTranscript={onMicTranscript} compact={isCompact} />
            )}
            {submitButtonEl}
          </div>
        </div>
      </div>
      {disclaimer}
      </>
    );
  }
);

ChatComposer.displayName = "ChatComposer";

export { ChatComposer };
