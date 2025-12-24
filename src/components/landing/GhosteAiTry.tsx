import { useEffect, useState } from "react";

type Msg = { role: "ai" | "user"; content: string };

const demoLines = [
  "Drop your song link and I'll build the campaign.",
  "Want a 12s UGC script or a Smart Link funnel?",
  "Tell me your goal: streams, followers, or conversions."
];

export default function GhosteAiTry() {
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "ai", content: "Yo — I'm Ghoste AI. What are you promoting today?" }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const [demoIdx, setDemoIdx] = useState(0);
  const [typed, setTyped] = useState("");

  // animated typewriter hint for the placeholder
  useEffect(() => {
    const line = demoLines[demoIdx % demoLines.length];
    setTyped("");
    let i = 0;

    const t = setInterval(() => {
      i++;
      setTyped(line.slice(0, i));
      if (i >= line.length) {
        clearInterval(t);
        setTimeout(() => setDemoIdx((x) => x + 1), 1400);
      }
    }, 26);

    return () => clearInterval(t);
  }, [demoIdx]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    setMsgs((m) => [...m, { role: "user", content: text }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/.netlify/functions/ghoste-ai-try", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text })
      });

      const data = await res.json();
      setMsgs((m) => [
        ...m,
        { role: "ai", content: data.reply ?? "Try again in a sec." }
      ]);
    } catch {
      setMsgs((m) => [...m, { role: "ai", content: "Quick glitch — try again." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="aiTrySection">
      <div className="aiTryHeader">
        <h2>Test Ghoste AI</h2>
        <p>Ask for a campaign plan, UGC script, hooks, or a Smart Link funnel.</p>
      </div>

      <div className="aiCard">
        <div className="aiChat">
          {msgs.slice(-6).map((m, idx) => (
            <div key={idx} className={`bubble ${m.role}`}>
              {m.content}
            </div>
          ))}
          {loading && <div className="bubble ai">Thinking…</div>}
        </div>

        <div className="aiComposer">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={typed || "Type a message…"}
            onKeyDown={(e) => (e.key === "Enter" ? send() : null)}
          />
          <button onClick={send} disabled={loading || !input.trim()}>
            Send
          </button>
        </div>
      </div>
    </section>
  );
}
