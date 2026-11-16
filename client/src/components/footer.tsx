import { formatDate } from "@/lib/common-functions";

interface FooterProps {
  lastLoginDate?: string | null;
}

function formatLastLogin(dateString?: string | null) {
  if (!dateString) return "-";
  const date = formatDate(dateString, true);
  return date;
}

export function Footer({ lastLoginDate }: FooterProps) {
  return (
    <div className="pt-4 pb-3 px-4 border-t bg-background shrink-0">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-1 flex-wrap justify-center sm:justify-start">
          <span>Copyright © 2026 S2P Labs Tech Private Limited, All rights reserved.</span>
        </div>
        <div>
          Last Login: {formatLastLogin(lastLoginDate)}
        </div>
      </div>
    </div>
  );
}
