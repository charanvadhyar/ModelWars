"use client";
// components/reasoning/ReasoningPanel.tsx

import { useRef, useEffect } from "react";

interface Props {
  text:       string;
  isActive:   boolean;
  isStreaming: boolean;
  color:      "amber" | "cyan";
}

const SECTION_LABELS = ["BOARD", "STRATEGY", "DECISION"] as const;

/** Parse "LABEL: content\nLABEL: content" into typed segments */
function parseThinkingTrail(text: string) {
  if (!text) return null;

  const segments: { label: string | null; content: string }[] = [];
  const lines = text.split("\n");

  for (const line of lines) {
    const match = line.match(/^(BOARD|STRATEGY|DECISION):\s*(.*)/);
    if (match) {
      segments.push({ label: match[1], content: match[2] });
    } else if (line.trim()) {
      // Unlabelled line — attach to last segment or create bare entry
      if (segments.length > 0) {
        segments[segments.length - 1].content += " " + line.trim();
      } else {
        segments.push({ label: null, content: line.trim() });
      }
    }
  }

  return segments.length > 0 ? segments : null;
}

export function ReasoningPanel({ text, isActive, isStreaming, color }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const accent    = color === "amber" ? "var(--amber)"     : "var(--cyan)";
  const dim       = color === "amber" ? "var(--amber-dim)" : "var(--cyan-dim)";

  useEffect(() => {
    if (scrollRef.current && isStreaming && isActive) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [text, isStreaming, isActive]);

  const segments = parseThinkingTrail(text);

  return (
    <div style={{
      padding:"12px 14px",
      background:"var(--bg2)",
      border:`1px solid ${dim}`,
      borderRadius:"4px",
      height:"220px",
      display:"flex",
      flexDirection:"column",
      overflow:"hidden",
    }}>
      {/* Label */}
      <div style={{
        fontSize:"9px", letterSpacing:"3px",
        color: accent, marginBottom:"8px",
        display:"flex", alignItems:"center", gap:"6px",
        flexShrink: 0,
      }}>
        <span style={{
          width:"5px", height:"5px", borderRadius:"50%",
          background: accent, boxShadow:`0 0 6px ${accent}`,
          display:"inline-block",
          animation: isActive && isStreaming ? "pulseGlow 1s infinite" : "none",
        }} />
        COGNITIVE PROCESS
      </div>

      {/* Text area */}
      <div ref={scrollRef} style={{
        overflow:"auto",
        flex:1,
        WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 12%)",
        maskImage:        "linear-gradient(to bottom, transparent 0%, black 12%)",
      }}>
        {segments ? (
          <div style={{ display:"flex", flexDirection:"column", gap:"10px", paddingTop:"4px" }}>
            {segments.map((seg, i) => (
              <div key={i}>
                {seg.label && (
                  <div style={{
                    fontSize:"8px", letterSpacing:"2px", fontWeight:700,
                    color: accent, marginBottom:"3px",
                    fontFamily:"var(--font-mono)",
                  }}>
                    ◈ {seg.label}
                  </div>
                )}
                <div style={{
                  fontSize:"11px", lineHeight:"1.65",
                  color: seg.label ? "#8aa8c0" : "#6888a0",
                }}>
                  {seg.content}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{
            fontSize:"11px", lineHeight:"1.7",
            color:"#6888a0",
          }}>
            {text || (isActive && isStreaming
              ? ""
              : "AWAITING COGNITIVE PROCESS..."
            )}
            {isActive && isStreaming && (
              <span style={{
                display:"inline-block", width:"2px", height:"12px",
                background: accent, verticalAlign:"text-bottom",
                marginLeft:"2px",
                animation:"blink 0.7s step-end infinite",
              }} />
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulseGlow {
          0%,100% { opacity:1; } 50% { opacity:0.2; }
        }
        @keyframes blink {
          0%,100% { opacity:1; } 50% { opacity:0; }
        }
      `}</style>
    </div>
  );
}
