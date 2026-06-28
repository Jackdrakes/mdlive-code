import { Columns, FileText, Eye, Share2 } from "lucide-react";
import { ViewMode } from "../types";

interface ToolbarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}

const icons: { mode: ViewMode; icon: typeof Columns; label: string }[] = [
  { mode: "split", icon: Columns, label: "Split View" },
  { mode: "editor", icon: FileText, label: "Editor" },
  { mode: "preview", icon: Eye, label: "Preview" },
];

export function Toolbar({ viewMode, onViewModeChange }: ToolbarProps) {
  return (
    <div className="fab-group">
      {icons.map(({ mode, icon: Icon, label }) => (
        <button
          key={mode}
          onClick={() => onViewModeChange(mode)}
          className={`fab-btn ${viewMode === mode ? "active" : ""}`}
          title={label}
        >
          <Icon />
        </button>
      ))}
      <button className="fab-btn" title="Share">
        <Share2 />
      </button>
    </div>
  );
}
