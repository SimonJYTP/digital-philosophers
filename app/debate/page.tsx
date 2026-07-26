import type { Metadata } from "next";

import {
  DebateRoom,
  type PublicDebatePhilosopher,
} from "@/components/debate-room";
import { philosophers } from "@/lib/philosophers";

export const metadata: Metadata = {
  title: "The debate chamber",
  description:
    "Convene two or three philosophical voices and enter their debate.",
};

export default function DebatePage() {
  const publicPhilosophers: PublicDebatePhilosopher[] = philosophers.map(
    ({
      id,
      name,
      era,
      bio,
      monogram,
      portrait,
      portraitAlt,
      portraitPosition,
    }) => ({
      id,
      name,
      era,
      bio,
      monogram,
      portrait,
      portraitAlt,
      portraitPosition,
    }),
  );

  return <DebateRoom philosophers={publicPhilosophers} />;
}
