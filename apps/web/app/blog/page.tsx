"use client";
// app/blog/page.tsx — Intelligence Log: one card per completed match/quiz

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";

const SERVER = process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? "http://localhost:3001";

type Arena = "all" | "battleship" | "quiz";

interface MatchCard {
  id: string;
  arena: "battleship" | "quiz";
  modelA: string;
  modelB: string;
  winner: string | null;
  // battleship
  totalTurns?: number;
  durationMs?: number;
  // quiz
  topic?: string;
  scoreA?: number;
  scoreB?: number;
  createdAt: string;
  completedAt: string | null;
}

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

function shortModel(name: string) {
  return name.split("-").slice(0, 2).join("-");
}

export default function BlogPage() {
  const [posts, setPosts]             = useState<MatchCard[]>([]);
  const [arena, setArena]             = useState<Arena>("all");
  const [loading, setLoading]         = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset]           = useState(0);
  const [hasMore, setHasMore]         = useState(true);
  const loadedIds                     = useRef(new Set<string>());
  const LIMIT = 20;

  const fetchPosts = useCallback(async (off: number, append: boolean) => {
    const arenaParam = arena === "all" ? "" : `&arena=${arena}`;
    const res = await fetch(`${SERVER}/api/blog?limit=${LIMIT}&offset=${off}${arenaParam}`);
    if (!res.ok) return;
    const data = await res.json();
    const incoming: MatchCard[] = (data.posts ?? []).filter((p: MatchCard) => {
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

  useEffect(() => {
    setLoading(true);
    setOffset(0);
    setHasMore(true);
    loadedIds.current = new Set();
    fetchPosts(0, false).finally(() => setLoading(false));
  }, [arena, fetchPosts]);

  // Poll for new completed matches
  useEffect(() => {
    const id = setInterval(() => {
      const arenaParam = arena === "all" ? "" : `&arena=${arena}`;
      fetch(`${SERVER}/api/blog?limit=5&offset=0${arenaParam}`)
        .then(r => r.json())
        .then(data => {
          const incoming: MatchCard[] = (data.posts ?? []).filter((p: MatchCard) => {
            if (loadedIds.current.has(p.id)) return false;
            loadedIds.current.add(p.id);
            return true;
          });
          if (incoming.length > 0) setPosts(prev => [...incoming, ...prev]);
        })
        .catch(() => {});
    }, 15_000);
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
      <div style={{ maxWidth: "760px", margin: "0 auto" }}>

        <Link href="/" style={{ fontSize: "10px", letterSpacing: "3px", color: "var(--text-dim)", textDecoration: "none" }}>
          ← MODEL WARS
        </Link>

        <div style={{ margin: "12px 0 24px" }}>
          <h1 style={{ fontFamily: "var(--font-hud)", fontSize: "28px", fontWeight: 900, letterSpacing: "4px", background: "linear-gradient(90deg, var(--amber), var(--cyan), #ff4488)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", margin: "0 0 4px" }}>
            INTELLIGENCE LOG
          </h1>
          <div style={{ fontSize: "10px", letterSpacing: "3px", color: "var(--text-dim)" }}>
            COMPLETED MATCHES &amp; QUIZZES · FULL AI REASONING INSIDE
          </div>
        </div>

        {/* Filter bar */}
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

        {/* Feed */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "48px", color: "var(--text-dim)", fontSize: "11px", letterSpacing: "3px", animation: "pulseDot 1.2s infinite" }}>
            LOADING INTELLIGENCE LOG...
          </div>
        ) : posts.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px", color: "var(--text-dim)", fontSize: "12px" }}>
            No completed matches yet. Start a match or quiz.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {posts.map(post => (
              <MatchPostCard key={post.id} post={post} />
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

function MatchPostCard({ post }: { post: MatchCard }) {
  const isBattleship = post.arena === "battleship";
  const arenaColor   = isBattleship ? "var(--amber)" : "#ff4488";
  const arenaLabel   = isBattleship ? "BATTLESHIP" : "QUIZ";
  const detailUrl    = isBattleship ? `/blog/match/${post.id}` : `/blog/quiz/${post.id}`;

  const winnerModel = post.winner === "A" ? post.modelA
                    : post.winner === "B" ? post.modelB
                    : null;

  return (
    <Link href={detailUrl} style={{ textDecoration: "none" }}>
      <article style={{ border: "1px solid rgba(255,255,255,0.07)", borderRadius: "4px", overflow: "hidden", background: "rgba(255,255,255,0.01)", cursor: "pointer" }}>

        {/* Top bar */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "9px 14px", background: "rgba(255,255,255,0.025)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          <span style={{ fontSize: "10px", letterSpacing: "2px", color: arenaColor }}>◈ {arenaLabel}</span>
          {post.topic && (
            <>
              <span style={{ width: "1px", height: "10px", background: "rgba(255,255,255,0.1)" }} />
              <span style={{ fontSize: "10px", color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                {post.topic.toUpperCase()}
              </span>
            </>
          )}
          <span style={{ marginLeft: "auto", fontSize: "9px", color: "var(--text-dim)", whiteSpace: "nowrap" }}>
            {timeAgo(post.completedAt ?? post.createdAt)}
          </span>
        </div>

        {/* Body */}
        <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: "16px" }}>

          {/* Models + winner */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
              <span style={{ fontSize: "12px", color: post.winner === "A" ? "var(--amber)" : "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {shortModel(post.modelA)}
              </span>
              <span style={{ fontSize: "10px", color: "var(--text-dim)" }}>vs</span>
              <span style={{ fontSize: "12px", color: post.winner === "B" ? "var(--cyan)" : "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {shortModel(post.modelB)}
              </span>
            </div>
            {winnerModel ? (
              <div style={{ fontSize: "10px", color: "var(--text-dim)" }}>
                winner: <span style={{ color: post.winner === "A" ? "var(--amber)" : "var(--cyan)" }}>{shortModel(winnerModel)}</span>
              </div>
            ) : post.winner === "TIE" ? (
              <div style={{ fontSize: "10px", color: "var(--text-dim)" }}>draw</div>
            ) : null}
          </div>

          {/* Stats */}
          {isBattleship && post.totalTurns != null && (
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontFamily: "var(--font-hud)", fontSize: "22px", color: "var(--amber)", letterSpacing: "1px" }}>{post.totalTurns}</div>
              <div style={{ fontSize: "9px", color: "var(--text-dim)", letterSpacing: "1px" }}>TURNS</div>
            </div>
          )}

          {!isBattleship && post.scoreA != null && post.scoreB != null && (
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontFamily: "var(--font-hud)", fontSize: "22px", letterSpacing: "1px" }}>
                <span style={{ color: "var(--amber)" }}>{post.scoreA}</span>
                <span style={{ color: "var(--text-dim)", margin: "0 6px", fontSize: "16px" }}>—</span>
                <span style={{ color: "var(--cyan)" }}>{post.scoreB}</span>
              </div>
              <div style={{ fontSize: "9px", color: "var(--text-dim)", letterSpacing: "1px" }}>SCORE</div>
            </div>
          )}

          <div style={{ fontSize: "9px", color: "var(--text-dim)", letterSpacing: "2px", flexShrink: 0 }}>VIEW →</div>
        </div>
      </article>
    </Link>
  );
}
