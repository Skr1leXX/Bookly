"use client";

// Last resort: the root layout itself failed, so this page brings its own <html>.
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="ru">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0 }}>
        <div style={{ textAlign: "center" }}>
          <h1>Что-то пошло не так</h1>
          <button onClick={reset}>Повторить</button>
        </div>
      </body>
    </html>
  );
}
