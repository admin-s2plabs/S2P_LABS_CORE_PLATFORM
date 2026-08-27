import { FileText, Loader2, Paperclip, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { isFileAnswer, type RfiAnswerValue, type RfiQuestion } from "./rfi-types";

interface RfiAnswerFieldProps {
  question: RfiQuestion;
  value: RfiAnswerValue;
  onChange: (value: RfiAnswerValue) => void;
  onFileSelect?: (file: File | undefined) => void;
  uploading?: boolean;
  disabled?: boolean;
}

/** Renders the correct input for a question's type. Shared by the staff "Record Response" sheet and the vendor self-service response page — keep both in sync through this one component. */
export function RfiAnswerField({ question, value, onChange, onFileSelect, uploading, disabled }: RfiAnswerFieldProps) {
  const toggleMultiSelect = (option: string) => {
    const current = String(value || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const next = current.includes(option) ? current.filter((o) => o !== option) : [...current, option];
    onChange(next.join(", "));
  };

  if (question.type === "text") {
    return (
      <Textarea
        className="min-h-[80px]"
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    );
  }

  if (question.type === "number") {
    return (
      <Input
        type="number"
        value={typeof value === "string" || typeof value === "number" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    );
  }

  if (question.type === "date") {
    return (
      <Input
        type="date"
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    );
  }

  if (question.type === "single_select") {
    return (
      <Select value={typeof value === "string" ? value : ""} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger>
          <SelectValue placeholder="Select an option" />
        </SelectTrigger>
        <SelectContent>
          {(question.options || []).map((opt) => (
            <SelectItem key={opt} value={opt}>
              {opt}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (question.type === "multi_select") {
    return (
      <div className="space-y-2">
        {(question.options || []).map((opt) => {
          const selected = String(value || "").split(",").map((s) => s.trim()).includes(opt);
          return (
            <label
              key={opt}
              className={`flex items-center gap-2.5 rounded-md border px-3 py-2 text-sm ${
                disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-muted/50"
              }`}
            >
              <Checkbox checked={selected} onCheckedChange={() => toggleMultiSelect(opt)} disabled={disabled} />
              {opt}
            </label>
          );
        })}
      </div>
    );
  }

  // file_upload
  if (isFileAnswer(value)) {
    return (
      <div className="flex items-center gap-3 rounded-md border px-3 py-2">
        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
        <a href={value.url} target="_blank" rel="noreferrer" className="text-sm truncate flex-1 hover:underline">
          {value.name}
        </a>
        {!disabled && (
          <button type="button" onClick={() => onChange(null)} className="text-muted-foreground hover:text-destructive">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }
  if (disabled) {
    return <span className="text-sm italic text-muted-foreground">No response</span>;
  }
  return (
    <label className="flex flex-col items-center justify-center gap-1.5 rounded-md border-2 border-dashed px-4 py-6 text-sm cursor-pointer hover:bg-muted/40">
      {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Paperclip className="h-5 w-5 text-muted-foreground" />}
      <span>Click to upload a file</span>
      <span className="text-xs text-muted-foreground">PDF, DOC, DOCX, JPG or PNG</span>
      <input
        type="file"
        className="hidden"
        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
        onChange={(e) => onFileSelect?.(e.target.files?.[0])}
      />
    </label>
  );
}
