"use client";
// components/reasoning/ReasoningPanel.tsx

import { useRef, useEffect } from "react";

interface Props {
  text:       string;
  isActive:   boolean;
  isStreaming: boolean;
  color:      "amber" | "cyan";
}

export function ReasoningPanel({ text, isActive, isStreaming, color }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const accent    = color === "amber" ? "var(--amber)"     : "var(--cyan)";
  const dim       = color === "amber" ? "var(--amber-dim)" : "var(--cyan-dim)";

  // Auto-scroll as text streams in
  useEffect(() => {
    if (scrollRef.current && isStreaming && isActive) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [text, isStreaming, isActive]);

  const displayText = text || (isActive && isStreaming ? "" : "AWAITING COGNITIVE PROCESS...");

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
        fontSize:"11px", lineHeight:"1.7",
        color:"#6888a0", overflow:"hidden",
        flex:1,
        // Fade top edge for overflow text
        WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 15%)",
        maskImage:        "linear-gradient(to bottom, transparent 0%, black 15%)",
      }}>
        {displayText}
        {isActive && isStreaming && (
          <span style={{
            display:"inline-block", width:"2px", height:"12px",
            background: accent, verticalAlign:"text-bottom",
            marginLeft:"2px",
            animation:"blink 0.7s step-end infinite",
          }} />
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
