import React, { useEffect, useMemo, useRef, useState } from "react";

// --- CONFIG ---------------------------------------------------------------
const DEFAULT_SYSTEM_PRESETS = {
  "Concept Storm": `You are a collaborative lyric ideation engine for a blues‑rock writer. Generate 5 vivid, high‑contrast *concept lenses* (not lyrics) for the user’s seed. Each lens = 1 sentence: mood + image system + stance. Avoid cliches.`,
  "Draft Continuation": `You are a co‑writer who extends an in‑progress lyric. Match the user’s rhythm and tone. Prefer slant rhyme, internal echoes, and stressed monosyllables. DO NOT produce neat end‑rhymes unless the user explicitly asked. Keep lines <= 10 syllables when possible. Give 2 short options.`,
  "Tone Blend": `You are a palette mixer. Given a topic, produce a 6‑8 line imagery bank that blends two named influences (e.g., \"Tom Waits x Brittany Howard\"). Output only images/phrases (no full verses), separated by bullets. Language should be performable and gritty, not purple.`,
  "Polish Pass": `You are a line doctor. Clean grammar and tighten phrasing while preserving *voice*, *slant rhyme*, and *irregular stresses*. Never flatten surprises. Return the revised lyric and a compact change log (why each change improves breath/meter).`
};

// Helper: mobile-friendly clipboard copy
async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

// --- UI COMPONENT ---------------------------------------------------------
export default function PromptLab() {
  const [apiKey, setApiKey] = useState(localStorage.getItem("or_key") || "");
  const [proxyUrl, setProxyUrl] = useState(localStorage.getItem("or_proxy") || "");
  const [models, setModels] = useState([]);
  const [model, setModel] = useState("");
  const [preset, setPreset] = useState("Draft Continuation");
  const [system, setSystem] = useState(DEFAULT_SYSTEM_PRESETS[preset]);
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [temp, setTemp] = useState(0.8);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState(() => JSON.parse(localStorage.getItem("or_history") || "[]"));

  // persist settings
  useEffect(() => { localStorage.setItem("or_key", apiKey); }, [apiKey]);
  useEffect(() => { localStorage.setItem("or_proxy", proxyUrl); }, [proxyUrl]);
  useEffect(() => { localStorage.setItem("or_history", JSON.stringify(history.slice(0, 25))); }, [history]);

  // update system when preset changes
  useEffect(() => { setSystem(DEFAULT_SYSTEM_PRESETS[preset]); }, [preset]);

  // fetch models (filter for free)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("https://openrouter.ai/api/v1/models");
        const json = await res.json();
        const items = (json.data || [])
          .filter(m => {
            // Treat as free if input & output pricing are zero or missing
            const p = m?.pricing || {}; const in0 = +p?.prompt || 0; const out0 = +p?.completion || 0; 
            return (in0 === 0 && out0 === 0);
          })
          .map(m => ({ id: m.id, name: m.name || m.id }))
          .sort((a,b)=> a.name.localeCompare(b.name));
        setModels(items);
        if (items.length && !model) setModel(items[0].id);
      } catch (e) {
        // fallback: common free models snapshot
        const fallback = [
          { id: "openrouter/auto", name: "openrouter/auto (router)" },
          { id: "google/gemma-2-9b-it:free", name: "gemma-2-9b-it:free" },
          { id: "meta-llama/llama-3.1-8b-instruct:free", name: "llama-3.1-8b-instruct:free" },
          { id: "qwen/qwen-2.5-7b-instruct:free", name: "qwen-2.5-7b-instruct:free" }
        ];
        setModels(fallback); if (!model) setModel(fallback[0].id);
      }
    })();
  }, []);

  const disabled = loading || !model || (!apiKey && !proxyUrl);

  async function run() {
    setLoading(true); setError(""); setOutput("");
    const body = {
      model,
      temperature: temp,
      messages: [
        { role: "system", content: system.trim() },
        { role: "user", content: input.trim() }
      ]
    };

    try {
      const endpoint = proxyUrl || "https://openrouter.ai/api/v1/chat/completions";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(proxyUrl ? {} : { Authorization: `Bearer ${apiKey}` }),
          "HTTP-Referer": "https://lyric-smith-mini.local",
          "X-Title": "LyricSmith Mini"
        },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content?.trim() || JSON.stringify(data, null, 2);
      setOutput(text);
      setHistory([{ ts: Date.now(), preset, model, input, output: text }, ...history]);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  function clearAll() { setInput(""); setOutput(""); setError(""); }

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-zinc-900 to-black text-zinc-100 px-4 py-6 sm:py-8">
      <div className="mx-auto max-w-xl">
        <header className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">LyricSmith Mini</h1>
          <p className="text-sm text-zinc-400">AI-assisted lyric lab — mobile-first, slant-rhyme friendly.</p>
        </header>

        {/* Settings Card */}
        <div className="rounded-2xl border border-zinc-800 p-4 mb-4 bg-zinc-950/40 shadow-lg">
          <div className="grid grid-cols-1 gap-3">
            <label className="text-sm">OpenRouter API Key (stored locally)
              <input value={apiKey} onChange={e=>setApiKey(e.target.value)} placeholder="sk-or-..." className="mt-1 w-full rounded-xl bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm"/>
            </label>
            <label className="text-xs text-zinc-400">Optional Proxy URL (recommended)
              <input value={proxyUrl} onChange={e=>setProxyUrl(e.target.value)} placeholder="https://your-proxy.example.com/chat" className="mt-1 w-full rounded-xl bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm"/>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-sm">Model (free only)
                <select value={model} onChange={e=>setModel(e.target.value)} className="mt-1 w-full rounded-xl bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm">
                  {models.map(m=> <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </label>
              <label className="text-sm">Temperature: {temp.toFixed(2)}
                <input type="range" min={0} max={1} step={0.05} value={temp} onChange={e=>setTemp(parseFloat(e.target.value))} className="w-full"/>
              </label>
            </div>
          </div>
        </div>

        {/* Preset & System */}
        <div className="rounded-2xl border border-zinc-800 p-4 mb-4 bg-zinc-950/40">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm">Preset</span>
            <select value={preset} onChange={e=>setPreset(e.target.value)} className="flex-1 rounded-xl bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm">
              {Object.keys(DEFAULT_SYSTEM_PRESETS).map(k=> <option key={k}>{k}</option>)}
            </select>
            <button onClick={()=>copy(system)} className="text-xs px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700">Copy System</button>
          </div>
          <textarea value={system} onChange={e=>setSystem(e.target.value)} rows={5} className="w-full rounded-xl bg-zinc-900 border border-zinc-800 p-3 text-sm"/>
        </div>

        {/* IO panes */}
        <div className="grid grid-cols-1 gap-4">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm">Input</span>
              <div className="flex gap-2">
                <button onClick={()=>setInput("")} className="text-xs px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700">Clear</button>
                <button onClick={()=>copy(input)} className="text-xs px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700">Copy</button>
              </div>
            </div>
            <textarea value={input} onChange={e=>setInput(e.target.value)} rows={6} placeholder="Paste a verse, seed, or brief..." className="w-full rounded-xl bg-zinc-900 border border-zinc-800 p-3 text-sm"/>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm">Output</span>
              <div className="flex gap-2">
                <button onClick={()=>copy(output)} className="text-xs px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700">Copy</button>
                <button onClick={clearAll} className="text-xs px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700">Clear</button>
              </div>
            </div>
            <textarea readOnly value={output} rows={10} className="w-full rounded-xl bg-zinc-900 border border-zinc-800 p-3 text-sm"/>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-4 flex gap-3">
          <button disabled={disabled} onClick={run} className={`flex-1 rounded-2xl px-4 py-3 text-sm font-medium shadow-lg ${disabled?"bg-zinc-800 text-zinc-500":"bg-emerald-600 hover:bg-emerald-500"}`}>
            {loading ? "Thinking…" : "Run"}
          </button>
          <button onClick={()=>{setHistory([]); localStorage.removeItem("or_history");}} className="rounded-2xl px-4 py-3 text-sm bg-zinc-800 hover:bg-zinc-700">Clear History</button>
        </div>

        {error && (
          <div className="mt-3 rounded-xl border border-red-900 bg-red-950/30 p-3 text-red-300 text-xs whitespace-pre-wrap">{error}</div>
        )}

        {/* History */}
        {history.length > 0 && (
          <div className="mt-6">
            <h2 className="text-sm font-semibold mb-2">Recent</h2>
            <div className="grid gap-3">
              {history.map((h, i) => (
                <div key={i} className="rounded-xl border border-zinc-800 p-3 bg-zinc-950/40">
                  <div className="text-xs text-zinc-400 mb-1">{new Date(h.ts).toLocaleString()} • {h.preset} • {h.model}</div>
                  <div className="text-xs text-zinc-300 whitespace-pre-wrap">{h.input}</div>
                  <hr className="my-2 border-zinc-800"/>
                  <div className="text-xs whitespace-pre-wrap">{h.output}</div>
                  <div className="mt-2 flex gap-2">
                    <button onClick={()=>copy(h.output)} className="text-xs px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700">Copy Out</button>
                    <button onClick={()=>{setInput(h.input); setPreset(h.preset); setSystem(DEFAULT_SYSTEM_PRESETS[h.preset]);}} className="text-xs px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700">Reuse</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <footer className="mt-8 text-[11px] text-zinc-500 leading-relaxed">
          <p><strong>Security note:</strong> For production, set a tiny server proxy and remove the client-side key. This demo supports a Proxy URL so your key stays on the server.</p>
        </footer>
      </div>
    </div>
  );
}

