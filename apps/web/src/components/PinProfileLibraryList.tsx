import { X } from "lucide-react";
import type { PinProfile } from "../types/project.ts";

interface PinProfileLibraryListProps {
  profiles: PinProfile[];
  expandedId: string | undefined;
  onToggle: (id: string | undefined) => void;
  onDelete?: (id: string) => void;
}

export function PinProfileLibraryList({ profiles, expandedId, onToggle, onDelete }: PinProfileLibraryListProps) {
  return (
    <div className="pin-profile-library">
      {profiles.map((profile) => {
        const mapped = profile.pins.filter((pin) => pin.logical);
        const bound = profile.pins.filter((pin) => pin.connection === "bound" && pin.net);
        return (
          <div className="pin-profile-item" key={profile.id}>
            <div className="pin-profile-item-header">
              <button
                className="pin-profile-row"
                type="button"
                onClick={() => onToggle(expandedId === profile.id ? undefined : profile.id)}
              >
                <span>{profile.identity.value}</span>
                <small>{profile.identity.package || "-"} · {profile.pinCount}p</small>
              </button>
              {onDelete && (
                <button
                  className="pin-profile-remove"
                  type="button"
                  title="删除"
                  onClick={() => onDelete(profile.id)}
                >
                  <X size={14} />
                </button>
              )}
            </div>
            {expandedId === profile.id && (
              <div className="pin-profile-pins">
                {mapped.map((pin) => (
                  <span key={`${pin.unit ?? ""}-${pin.logical}`}>
                    {pin.unit ? `${pin.unit}:` : ""}{pin.logical} → {pin.physical}
                  </span>
                ))}
                {bound.map((pin) => (
                  <span key={`bound-${pin.physical}`}>pin {pin.physical} → {pin.net}</span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
