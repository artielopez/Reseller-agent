"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="auth-panel panel">
      <h1>Something went wrong.</h1>
      <p>
        Your saved items are still in your workspace. Please try loading it
        again.
      </p>
      <button className="button primary" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
