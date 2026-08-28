import { useState } from "react";
import { ThumbsUp, ThumbsDown, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

/**
 * Thumbs up/down on a single assistant reply, with an optional comment on thumbs-down.
 *
 * A thumbs-down is recorded the moment it is clicked — before any comment is typed — so the
 * signal survives the user walking away or pressing Skip. The comment, if given, PATCHes the
 * same row. Agent-agnostic: pass `agentType` to reuse this on the other agents.
 */

interface MessageFeedbackProps {
  agentType: string;
  conversationId: number | null;
  messageIndex: number;
  /** The user's question that produced this reply — stored as compact evidence. */
  queryText: string;
  /** The reply itself — stored truncated, used to self-review when no comment is given. */
  responseText: string;
}

type Rating = 1 | -1 | null;

export function MessageFeedback({
  agentType,
  conversationId,
  messageIndex,
  queryText,
  responseText,
}: MessageFeedbackProps) {
  const { toast } = useToast();
  const [rating, setRating] = useState<Rating>(null);
  const [feedbackId, setFeedbackId] = useState<number | null>(null);
  const [showComment, setShowComment] = useState(false);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const send = async (value: 1 | -1, commentText?: string) => {
    const res = await apiRequest("POST", "/api/agent-feedback", {
      agentType,
      conversationId,
      messageIndex,
      rating: value,
      comment: commentText ?? null,
      queryText,
      responseText,
    });
    const body = await res.json();
    return body?.id as number | undefined;
  };

  const handleRate = async (value: 1 | -1) => {
    if (submitting || done) return;
    const previous = rating;
    setRating(value); // optimistic

    try {
      const id = await send(value);
      if (id) setFeedbackId(id);

      if (value === -1) {
        setShowComment(true);
      } else {
        setDone(true);
      }
    } catch {
      setRating(previous); // roll back the icon state
      toast({
        title: "Couldn't save feedback",
        description: "Please try again in a moment.",
        variant: "destructive",
      });
    }
  };

  const handleSubmitComment = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await send(-1, comment.trim() || undefined);
      setShowComment(false);
      setDone(true);
    } catch {
      toast({
        title: "Couldn't save your comment",
        description: "Your rating was still recorded.",
        variant: "destructive",
      });
      setShowComment(false);
      setDone(true);
    } finally {
      setSubmitting(false);
    }
  };

  /** Skip still leaves the rating recorded — the agent self-reviews without a comment. */
  const handleSkip = () => {
    setShowComment(false);
    setDone(true);
  };

  const handleUndo = async () => {
    if (!feedbackId) return;
    try {
      await apiRequest("PATCH", `/api/agent-feedback/${feedbackId}`, { status: "disabled" });
      setRating(null);
      setDone(false);
      setComment("");
      setFeedbackId(null);
    } catch {
      toast({ title: "Couldn't undo", variant: "destructive" });
    }
  };

  if (done) {
    return (
      <div className="flex items-center gap-2 mt-1 ml-11 text-xs text-muted-foreground">
        <Check className="h-3.5 w-3.5 text-emerald-600" />
        <span>
          {rating === 1 ? "Thanks — glad that helped." : "Thanks — I'll use this next time."}
        </span>
        {feedbackId && (
          <Button
            variant="ghost"
            size="sm"
            className="h-auto p-0 text-xs underline hover:bg-transparent"
            onClick={handleUndo}
            data-testid="button-feedback-undo"
          >
            Undo
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="mt-1 ml-11">
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className={`h-7 w-7 ${rating === 1 ? "text-emerald-600" : "text-muted-foreground"}`}
          onClick={() => handleRate(1)}
          aria-label="Good response"
          title="Good response"
          data-testid="button-feedback-up"
        >
          <ThumbsUp className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={`h-7 w-7 ${rating === -1 ? "text-red-600" : "text-muted-foreground"}`}
          onClick={() => handleRate(-1)}
          aria-label="Bad response"
          title="Bad response"
          data-testid="button-feedback-down"
        >
          <ThumbsDown className="h-3.5 w-3.5" />
        </Button>
      </div>

      {showComment && (
        <div className="mt-1.5 max-w-xl">
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            /* Native placeholder: shown as light text, clears as soon as the user types. */
            placeholder="What was wrong with this response, and what did you expect instead?"
            className="text-xs min-h-[64px] resize-none"
            autoFocus
            data-testid="input-feedback-comment"
          />
          <div className="flex justify-end gap-2 mt-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={handleSkip}
              disabled={submitting}
              data-testid="button-feedback-skip"
            >
              Skip
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={handleSubmitComment}
              disabled={submitting}
              data-testid="button-feedback-submit"
            >
              {submitting && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              Submit
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
