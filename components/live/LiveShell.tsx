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
import type { HomeArchiveItem, HomeLive, HomeScheduleItem, TopicTally } from "@/lib/live-home";
import type { MomentumResult } from "@/lib/topic-breadth";
import OffAir from "./OffAir";
import LiveExperience from "./LiveExperience";

export default function LiveShell({
  initial, requested = null,
}: {
  /** A specific broadcast asked for by ?v=, already checked against the live
   *  state and the archive by the server. */
  requested?: string | null;
  initial: {
    live: HomeLive | null; archive: HomeArchiveItem[]; schedule: HomeScheduleItem[];
    topics: TopicTally[];
    topicTail: TopicTally | null;
    topicMomentum: MomentumResult[];
    topicTotals: { claims: number; broadcasts: number; since: string | null };
  };
}) {
  // A live broadcast means the page IS the broadcast — go straight in.
  //
  // A ?v= that names the CURRENTLY live broadcast is the same thing. One that
  // names an ended broadcast opens its replay, so an alert read late still
  // lands on what it was about rather than on an index.
  const [enter, setEnter] = useState<string | null>(() => {
    if (initial.live) return "live";
    if (requested) return requested;
    return null;
  });

  if (enter) {
    // "Go straight in" previously stopped one step short. LiveExperience
    // opens with isPlaying false, so a live visitor still landed on its index
    // — hero, LIVE NOW card, "Watch with AI Fact-Check" — and had to press
    // play on a broadcast the server had already confirmed was running.
    // Handing it the video outright removes that click, and the title comes
    // from the same server payload, so there is no wait on a client fetch and
    // no flash of the index first.
    const live = enter === "live" && initial.live
      ? { videoId: initial.live.videoId, title: initial.live.title }
      : undefined;
    return (
      <LiveExperience
        autoStartReplay={enter === "live" ? undefined : enter}
        autoStartLive={live}
        pendingTitle={live?.title ?? initial.archive.find(a => a.id === enter)?.title}
        onExit={() => {
          // Drop ?v= too, or a reload would reopen the replay just left.
          if (typeof window !== "undefined" && window.location.search) {
            window.history.replaceState(null, "", "/live");
          }
          setEnter(null);
          if (typeof window !== "undefined") window.scrollTo({ top: 0 });
        }}
      />
    );
  }

  return (
    <OffAir
      archive={initial.archive}
      schedule={initial.schedule}
      topics={initial.topics}
      topicTail={initial.topicTail}
      topicMomentum={initial.topicMomentum}
      topicTotals={initial.topicTotals}
      onWatch={id => setEnter(id)}
    />
  );
}
