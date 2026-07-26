import Link from "next/link";

export default function NotFound() {
  return (
    <main className="not-found">
      <p>Archive reference not found</p>
      <h1>This voice is not in the collection.</h1>
      <Link href="/">Return to the archive</Link>
    </main>
  );
}

