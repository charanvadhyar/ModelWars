"use client";
// app/blog/page.tsx — Intelligence Log: live feed of all model outputs

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";

const SERVER = process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? "http://localhost:3001";

type Arena = "all" | "battleship" | "quiz";
type PostType = "BATTLESHIP_REASONING" | "QUIZ_ANSWER" | "QUIZ_GRADING";

interface BlogPost {
  id: string;
  arena: "battleship" | "quiz";
  type: PostType;
  model: string;
  player: "A" | "B";
  content: string;
  context: string;
  prompt?: string;
  sourceId: string;
  sourceUrl: string;
  createdAt: string;
}

const TYPE_META: Record<PostType, { label: string; color: string; icon: string }> = {
  BATTLESHIP_REASONING: { label: "TACTICAL REASONING", color: "var(--amber)",  icon: "◈" },
  QUIZ_ANSWER:          { label: "QUIZ ANSWER",         color: "var(--cyan)",   icon: "◎" },
  QUIZ_GRADING:         { label: "GRADING FEEDBACK",    color: "#ff4488",       icon: "◇" },
};

const ARENA_COLOR: Record<string, string> = {
  battleship: "var(--amber)",
  quiz:       "#ff4488",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60)  return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function BlogPage() {
  const [posts, setPosts]         = useState<BlogPost[]>([]);
  const [arena, setArena]         = useState<Arena>("all");
  const [loading, setLoading]     = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset]       = useState(0);
  const [hasMore, setHasMore]     = useState(true);
  const loadedIds                 = useRef(new Set<string>());
  const LIMIT = 30;

  const fetchPosts = useCallback(async (off: number, append: boolean) => {
    const arenaParam = arena === "all" ? "" : `&arena=${arena}`;
    const res = await fetch(`${SERVER}/api/blog?limit=${LIMIT}&offset=${off}${arenaParam}`);
    if (!res.ok) return;
    const data = await res.json();
    const incoming: BlogPost[] = (data.posts ?? []).filter((p: BlogPost) => {
      if (loadedIds.current.has(p.id)) return false;
      loadedIds.current.add(p.id);
      return true;
    });
    if (append) {
      setPosts(prev => [...prev, ...incoming]);
    } else {
      loadedIds.current = new Set(incoming.map(p => p.id));
      setPosts(incoming);
    }
    setHasMore(incoming.length === LIMIT);
  }, [arena]);

  // Initial load + arena filter changes
  useEffect(() => {
    setLoading(true);
    setOffset(0);
    setHasMore(true);
    loadedIds.current = new Set();
    fetchPosts(0, false).finally(() => setLoading(false));
  }, [arena, fetchPosts]);

  // Live poll — only for new posts at offset 0
  useEffect(() => {
    const id = setInterval(() => {
      fetch(`${SERVER}/api/blog?limit=10&offset=0${arena === "all" ? "" : `&arena=${arena}`}`)
        .then(r => r.json())
        .then(data => {
          const incoming: BlogPost[] = (data.posts ?? []).filter((p: BlogPost) => {
            if (loadedIds.current.has(p.id)) return false;
            loadedIds.current.add(p.id);
            return true;
          });
          if (incoming.length > 0) {
            setPosts(prev => [...incoming, ...prev]);
          }
        })
        .catch(() => {});
    }, 10_000);
    return () => clearInterval(id);
  }, [arena]);

  const handleLoadMore = async () => {
    const next = offset + LIMIT;
    setLoadingMore(true);
    await fetchPosts(next, true);
    setOffset(next);
    setLoadingMore(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", fontFamily: "var(--font-mono)", padding: "24px 20px" }}>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div style={{ maxWidth: "760px", margin: "0 auto" }}>
        <Link href="/" style={{ fontSize: "10px", letterSpacing: "3px", color: "var(--text-dim)", textDecoration: "none" }}>
          ← MODEL WARS
        </Link>

        <div style={{ margin: "12px 0 24px" }}>
          <h1 style={{ fontFamily: "var(--font-hud)", fontSize: "28px", fontWeight: 900, letterSpacing: "4px", background: "linear-gradient(90deg, var(--amber), var(--cyan), #ff4488)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", margin: "0 0 4px" }}>
            INTELLIGENCE LOG
          </h1>
          <div style={{ fontSize: "10px", letterSpacing: "3px", color: "var(--text-dim)" }}>
            LIVE FEED · ALL MODEL REASONING &amp; OUTPUTS
          </div>
        </div>

        {/* ── Filter bar ──────────────────────────────────────────────────── */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
          {(["all", "battleship", "quiz"] as Arena[]).map(a => (
            <button
              key={a}
              onClick={() => setArena(a)}
              style={{
                padding: "6px 16px",
                fontFamily: "var(--font-mono)",
                fontSize: "10px",
                letterSpacing: "2px",
                textTransform: "uppercase",
                cursor: "pointer",
                borderRadius: "3px",
                border: arena === a
                  ? `1px solid ${a === "quiz" ? "#ff4488" : a === "battleship" ? "var(--amber)" : "rgba(255,255,255,0.3)"}`
                  : "1px solid rgba(255,255,255,0.08)",
                color: arena === a
                  ? a === "quiz" ? "#ff4488" : a === "battleship" ? "var(--amber)" : "var(--text)"
                  : "var(--text-dim)",
                background: arena === a ? "rgba(255,255,255,0.05)" : "transparent",
              }}
            >
              {a === "all" ? "ALL" : a === "battleship" ? "BATTLESHIP" : "QUIZ"}
            </button>
          ))}

          <div style={{ marginLeft: "auto", fontSize: "10px", color: "var(--text-dim)", display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ width: "5px", height: "5px", borderRadius: "50%", display: "inline-block", background: "#44ff88", animation: "pulseDot 2s infinite" }} />
            LIVE
          </div>
        </div>

        {/* ── Feed ────────────────────────────────────────────────────────── */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "48px", color: "var(--text-dim)", fontSize: "11px", letterSpacing: "3px", animation: "pulseDot 1.2s infinite" }}>
            LOADING INTELLIGENCE LOG...
          </div>
        ) : posts.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px", color: "var(--text-dim)", fontSize: "12px" }}>
            No entries yet. Start a match or quiz to populate the log.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {posts.map(post => (
              <PostCard key={post.id} post={post} />
            ))}

            {hasMore && (
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                style={{ padding: "10px", background: "transparent", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "3px", color: "var(--text-dim)", fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "3px", cursor: loadingMore ? "not-allowed" : "pointer", marginTop: "4px" }}
              >
                {loadingMore ? "LOADING..." : "LOAD MORE"}
              </button>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulseDot { 0%,100%{opacity:1} 50%{opacity:0.3} }
      `}</style>
    </div>
  );
}

function PostCard({ post }: { post: BlogPost }) {
  const [expanded, setExpanded] = useState(false);
  const meta = TYPE_META[post.type] ?? { label: post.type, color: "var(--text-dim)", icon: "○" };
  const playerColor = post.player === "A" ? "var(--amber)" : "var(--cyan)";
  const shortModel = post.model.split("-").slice(0, 2).join("-");

  // Truncate long content
  const PREVIEW_LEN = 280;
  const isLong = post.content.length > PREVIEW_LEN;
  const displayContent = !expanded && isLong
    ? post.content.slice(0, PREVIEW_LEN) + "…"
    : post.content;

  return (
    <article style={{ border: "1px solid rgba(255,255,255,0.07)", borderRadius: "4px", overflow: "hidden", background: "rgba(255,255,255,0.01)" }}>
      {/* Top bar */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "9px 14px", background: "rgba(255,255,255,0.025)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <span style={{ fontSize: "10px", letterSpacing: "2px", color: meta.color }}>{meta.icon} {meta.label}</span>
        <span style={{ width: "1px", height: "10px", background: "rgba(255,255,255,0.1)" }} />
        <span style={{ fontSize: "10px", color: ARENA_COLOR[post.arena], letterSpacing: "1px" }}>
          {post.arena === "battleship" ? "BATTLESHIP" : "QUIZ"}
        </span>
        <span style={{ fontSize: "10px", color: playerColor, letterSpacing: "1px" }}>PLAYER {post.player}</span>
        <span style={{ flex: 1, fontSize: "11px", color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {shortModel}
        </span>
        <span style={{ fontSize: "9px", color: "var(--text-dim)", whiteSpace: "nowrap" }}>
          {timeAgo(post.createdAt)}
        </span>
      </div>

      {/* Context badge */}
      <div style={{ padding: "8px 14px 0", display: "flex", alignItems: "center", gap: "10px" }}>
        <span style={{ fontSize: "9px", letterSpacing: "2px", color: "rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.04)", padding: "2px 8px", borderRadius: "2px" }}>
          {post.context}
        </span>
        <Link href={post.sourceUrl} style={{ fontSize: "9px", color: "var(--text-dim)", textDecoration: "none", letterSpacing: "1px" }}>
          VIEW SOURCE →
        </Link>
      </div>

      {/* Prompt (for quiz answers) */}
      {post.prompt && (
        <div style={{ padding: "8px 14px 0", fontSize: "11px", color: "var(--text-dim)", fontStyle: "italic", borderLeft: "2px solid rgba(255,255,255,0.08)", marginLeft: "14px" }}>
          {post.prompt}
        </div>
      )}

      {/* Content */}
      <div style={{ padding: "10px 14px 12px" }}>
        <p style={{ margin: 0, fontSize: "13px", color: "var(--text)", lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {displayContent}
        </p>
        {isLong && (
          <button
            onClick={() => setExpanded(e => !e)}
            style={{ marginTop: "6px", background: "none", border: "none", color: "var(--text-dim)", fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "2px", cursor: "pointer", padding: 0 }}
          >
            {expanded ? "▲ COLLAPSE" : "▼ EXPAND"}
          </button>
        )}
      </div>
    </article>
  );
}
