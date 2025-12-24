import { useState } from "react";

async function callFn(url: string, payload: any) {
  console.log("🚀 Calling function", url, payload);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  console.log("📡 Raw response from", url, text);

  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(text);
  }

  if (!res.ok || json?.ok === false) {
    throw new Error(json?.error || `Request failed: ${res.status}`);
  }

  return json;
}

export function FunctionDebug({ userId }: { userId: string }) {
  const [emailResult, setEmailResult] = useState<string | null>(null);
  const [presaveResult, setPresaveResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const testEmail = async () => {
    setError(null);
    setEmailResult(null);
    try {
      const json = await callFn(
        "/.netlify/functions/email_capture_links",
        {
          user_id: userId,
          title: "Test Email Capture",
          slug: "test-email-capture-" + Date.now(),
        },
      );
      setEmailResult(JSON.stringify(json, null, 2));
    } catch (err: any) {
      console.error("Email debug error:", err);
      setError(err.message || String(err));
    }
  };

  const testPresave = async () => {
    setError(null);
    setPresaveResult(null);
    try {
      const json = await callFn(
        "/.netlify/functions/presave_links",
        {
          user_id: userId,
          slug: "test-presave-slug-" + Date.now(),
          song_title: "Test Song",
          artist_name: "Test Artist",
          release_date: "2030-01-01",
        },
      );
      setPresaveResult(JSON.stringify(json, null, 2));
    } catch (err: any) {
      console.error("Presave debug error:", err);
      setError(err.message || String(err));
    }
  };

  return (
    <div className="border border-yellow-600 border-dashed p-4 mt-4 mb-4 rounded text-xs bg-yellow-900/10">
      <h3 className="font-semibold mb-2 text-yellow-500">🔧 Netlify Function Debug</h3>
      <p className="mb-2 text-gray-400">Current user: <span className="text-white font-mono">{userId || "(no userId passed)"}</span></p>
      <div className="flex gap-2 mb-2">
        <button
          type="button"
          onClick={testEmail}
          className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded border border-purple-500 text-sm"
        >
          Test Email Capture Function
        </button>
        <button
          type="button"
          onClick={testPresave}
          className="px-3 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded border border-pink-500 text-sm"
        >
          Test Presave Function
        </button>
      </div>
      {error && (
        <div className="text-red-400 mb-2 p-2 bg-red-900/20 border border-red-700 rounded">
          <strong>Error:</strong> {error}
        </div>
      )}
      {emailResult && (
        <div className="mb-2">
          <strong className="text-green-400">Email Capture Result:</strong>
          <pre className="bg-black p-2 mt-1 overflow-x-auto rounded border border-gray-700 text-gray-300">
            {emailResult}
          </pre>
        </div>
      )}
      {presaveResult && (
        <div>
          <strong className="text-green-400">Presave Result:</strong>
          <pre className="bg-black p-2 mt-1 overflow-x-auto rounded border border-gray-700 text-gray-300">
            {presaveResult}
          </pre>
        </div>
      )}
    </div>
  );
}
