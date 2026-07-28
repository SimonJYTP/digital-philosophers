import Image from "next/image";
import Link from "next/link";

import { philosophers } from "@/lib/philosophers";

export default function Home() {
  return (
    <main className="home-shell">
      <header className="site-header">
        <Link className="wordmark" href="/" aria-label="Digital Philosophers home">
          <span className="wordmark-seal">DP</span>
          <span>
            Digital Philosophers
            <small>Dialogues across time</small>
          </span>
        </Link>
        <span className="catalog-mark">
          Volume I · {philosophers.length} voices
        </span>
      </header>

      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-kicker">
          <span>Private reading room</span>
          <span aria-hidden="true">№ 01</span>
        </div>
        <h1 id="hero-title">
          The dead do not answer.
          <em>Unless we ask well.</em>
        </h1>
        <div className="hero-foot">
          <p>
            Choose a thinker. Bring a question. Enter a conversation shaped by
            their language, their century, and the limits of what they knew.
          </p>
          <div className="hero-links">
            <a href="#philosophers" className="text-link">
              Browse the archive <span aria-hidden="true">↓</span>
            </a>
            <Link href="/debate" className="text-link debate-entry-link">
              Convene a debate <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </section>

      <section
        className="archive-section"
        id="philosophers"
        aria-labelledby="archive-title"
      >
        <div className="section-heading">
          <p>Resident voices</p>
          <h2 id="archive-title">Select a philosopher</h2>
        </div>

        <nav className="archive-index" aria-label="Philosopher archive index">
          <ol>
            {philosophers.map((philosopher, index) => (
              <li key={philosopher.id}>
                <a href={`#voice-${philosopher.id}`}>
                  <span aria-hidden="true">0{index + 1}</span>
                  <strong>{philosopher.name}</strong>
                  <small>{philosopher.era.split("·")[0].trim()}</small>
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="philosopher-list">
          {philosophers.map((philosopher, index) => (
            <Link
              href={`/philosophers/${philosopher.id}`}
              className="philosopher-entry"
              id={`voice-${philosopher.id}`}
              key={philosopher.id}
              aria-label={`Begin a dialogue with ${philosopher.name}`}
            >
              <span className="entry-number" aria-hidden="true">
                0{index + 1}
              </span>
              <div className="portrait-frame">
                <Image
                  src={philosopher.portrait}
                  alt={philosopher.portraitAlt}
                  fill
                  sizes="(max-width: 760px) 92vw, 34vw"
                  priority={index === 0}
                  style={{ objectPosition: philosopher.portraitPosition }}
                />
                <span className="portrait-monogram" aria-hidden="true">
                  {philosopher.monogram}
                </span>
              </div>
              <div className="entry-copy">
                <p className="entry-era">{philosopher.era}</p>
                <h3>{philosopher.name}</h3>
                <p className="entry-bio">{philosopher.bio}</p>
                <span className="enter-link">
                  Enter the dialogue <span aria-hidden="true">↗</span>
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <footer className="site-footer">
        <p>
          An interpretive AI experience. Replies are generated, not historical
          records.
        </p>
        <div>
          Portraits:{" "}
          {philosophers.map((philosopher, index) => (
            <span key={philosopher.id}>
              {philosopher.portraitCreditUrl ? (
                <a href={philosopher.portraitCreditUrl}>{philosopher.name}</a>
              ) : (
                philosopher.name
              )}{" "}
              ({philosopher.portraitCredit})
              {index < philosophers.length - 1 ? ", " : ""}
            </span>
          ))}
        </div>
      </footer>
    </main>
  );
}
