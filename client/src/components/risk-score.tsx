import { Progress } from "@/components/ui/progress";
import { ShieldCheck, ShieldAlert, ShieldX } from "lucide-react";

interface RiskScoreProps {
  score: number;
  showLabel?: boolean;
  size?: "sm" | "default" | "lg";
}

function getRiskLevel(score: number): { level: string; color: string; bgColor: string; icon: typeof ShieldCheck } {
  if (score >= 80) {
    return { 
      level: "Low Risk", 
      color: "text-emerald-600 dark:text-emerald-400", 
      bgColor: "bg-emerald-500",
      icon: ShieldCheck 
    };
  } else if (score >= 50) {
    return { 
      level: "Medium Risk", 
      color: "text-amber-600 dark:text-amber-400", 
      bgColor: "bg-amber-500",
      icon: ShieldAlert 
    };
  } else {
    return { 
      level: "High Risk", 
      color: "text-red-600 dark:text-red-400", 
      bgColor: "bg-red-500",
      icon: ShieldX 
    };
  }
}

export function RiskScore({ score, showLabel = true, size = "default" }: RiskScoreProps) {
  const { level, color, bgColor, icon: Icon } = getRiskLevel(score);

  const sizeClasses = {
    sm: { progress: "h-1.5", text: "text-xs", icon: "h-3.5 w-3.5" },
    default: { progress: "h-2", text: "text-sm", icon: "h-4 w-4" },
    lg: { progress: "h-2.5", text: "text-base", icon: "h-5 w-5" },
  };

  return (
    <div className="flex flex-col gap-2" data-testid="risk-score">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Icon className={`${sizeClasses[size].icon} ${color}`} />
          {showLabel && (
            <span className={`${sizeClasses[size].text} font-medium ${color}`}>
              {level}
            </span>
          )}
        </div>
        <span className={`${sizeClasses[size].text} font-mono font-semibold`} data-testid="risk-score-value">
          {score}/100
        </span>
      </div>
      <Progress 
        value={score} 
        className={sizeClasses[size].progress}
        style={{ 
          ["--progress-background" as string]: bgColor 
        }}
      />
    </div>
  );
}
