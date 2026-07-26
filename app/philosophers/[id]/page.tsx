import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ChatRoom } from "@/components/chat-room";
import { getPhilosopher, philosophers } from "@/lib/philosophers";

type PhilosopherPageProps = {
  params: Promise<{ id: string }>;
};

export function generateStaticParams() {
  return philosophers.map(({ id }) => ({ id }));
}

export async function generateMetadata({
  params,
}: PhilosopherPageProps): Promise<Metadata> {
  const { id } = await params;
  const philosopher = getPhilosopher(id);

  if (!philosopher) {
    return {};
  }

  return {
    title: `A dialogue with ${philosopher.name}`,
    description: philosopher.bio,
  };
}

export default async function PhilosopherPage({
  params,
}: PhilosopherPageProps) {
  const { id } = await params;
  const philosopher = getPhilosopher(id);

  if (!philosopher) {
    notFound();
  }

  const publicPhilosopher = {
    id: philosopher.id,
    name: philosopher.name,
    era: philosopher.era,
    bio: philosopher.bio,
    monogram: philosopher.monogram,
  };

  return (
    <main className="chat-page">
      <aside className="philosopher-aside">
        <nav className="chat-nav">
          <Link href="/" aria-label="Back to the archive">
            <span aria-hidden="true">←</span> The archive
          </Link>
          <span>Private dialogue</span>
        </nav>

        <div className="aside-portrait">
          <Image
            src={philosopher.portrait}
            alt={philosopher.portraitAlt}
            fill
            sizes="(max-width: 900px) 100vw, 42vw"
            priority
            style={{ objectPosition: philosopher.portraitPosition }}
          />
          <div className="aside-vignette" />
        </div>

        <div className="aside-caption">
          <span className="large-monogram" aria-hidden="true">
            {philosopher.monogram}
          </span>
          <div>
            <p>{philosopher.era}</p>
            <h1>{philosopher.name}</h1>
          </div>
        </div>
      </aside>

      <ChatRoom philosopher={publicPhilosopher} />
    </main>
  );
}
