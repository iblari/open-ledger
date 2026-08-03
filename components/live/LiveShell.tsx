"use client";

/**
 * Routes between the two states of /live.
 *
 * The server has already decided which one the visitor gets. From off air,
 * choosing a broadcast hands off to the full experience (pinned player,
 * credibility timeline, the downloadable record) — the spec's "one step
 * away".
 */

import { useState } from "react";
import type { HomeArchiveItem, HomeLive, HomeScheduleItem } from "@/lib/live-home";
import OffAir from "./OffAir";
import LiveExperience from "./LiveExperience";

export default function LiveShell({
  initial,
}: { initial: { live: HomeLive | null; archive: HomeArchiveItem[]; schedule: HomeScheduleItem[] } }) {
  // A live broadcast means the page IS the broadcast — go straight in.
  const [enter, setEnter] = useState<string | null>(initial.live ? "live" : null);

  if (enter) return <LiveExperience autoStartReplay={enter === "live" ? undefined : enter} />;

  return (
    <OffAir
      archive={initial.archive}
      schedule={initial.schedule}
      onWatch={id => setEnter(id)}
    />
  );
}
