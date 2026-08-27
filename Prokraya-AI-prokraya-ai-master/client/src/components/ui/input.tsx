import { formatDate } from "@/lib/common-functions";
import { cn } from "@/lib/utils";
import { Calendar } from "lucide-react";
import * as React from "react";

const baseStyles =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-base md:text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    const localRef = React.useRef<HTMLInputElement>(null);
    const orgDetails = JSON.parse(localStorage.getItem("orgDetails") || "{}");
    const date_format = orgDetails.date_format || "DD-MMM-YYYY";

    if (type === "date" || type === "datetime-local") {
      return (
        <div
          className="relative w-full"
          onClick={() => {
            localRef.current?.showPicker?.()
            localRef.current?.focus()
          }}
        >
          <input
            type="text"
            value={props.value ? 
              formatDate(props.value as string, type === 'datetime-local' ? true : false) : ''}
            placeholder={date_format}
            readOnly
            className={cn(baseStyles, "pr-10 cursor-pointer", className)}
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
            <Calendar size={16} />
          </span>
          <input
            type={type}
            ref={localRef}
            value={props.value || ""}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            {...props}
          />
        </div>
      )
    }

    return (
      <input
        type={type}
        className={cn(baseStyles, className)}
        ref={ref}
        {...props}
      />
    )
  }
)

Input.displayName = "Input"

export { Input };

