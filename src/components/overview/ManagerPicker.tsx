"use client";

import { ManagerAvatar } from "@/components/ui/ManagerAvatar";
import { Select } from "@/components/ui/Select";
import { managerLabel } from "@/lib/league/managers";
import type { Manager } from "@/lib/types";

export function ManagerPicker({
  managers,
  selected,
  viewerId,
  onSelect,
}: {
  managers: Manager[];
  selected: Manager;
  viewerId: string | null;
  onSelect: (managerId: string) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <ManagerAvatar manager={selected} />
      <Select
        label="Manager"
        value={selected.id}
        onChange={onSelect}
        className="w-52"
        options={managers.map((manager) => ({
          value: manager.id,
          label: manager.id === viewerId ? `${managerLabel(manager)} (you)` : managerLabel(manager),
        }))}
      />
    </div>
  );
}
