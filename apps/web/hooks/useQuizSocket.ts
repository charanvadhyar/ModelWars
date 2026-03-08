"use client";
// hooks/useQuizSocket.ts — Same as useSocket but joins/leaves quiz rooms

import { useEffect, useRef, useCallback, useState } from "react";

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

let _socket: any = null;

function getSocket(url: string) {
  if (typeof window === "undefined") return null;
  if (_socket && (_socket.connected || _socket.connecting)) return _socket;
  const { io } = require("socket.io-client");
  _socket = io(url, {
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
  });
  return _socket;
}

export function useQuizSocket(quizId: string) {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const socketRef = useRef<any>(null);
  const SERVER = process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? "http://localhost:3001";

  useEffect(() => {
    const socket = getSocket(SERVER);
    if (!socket) return;
    socketRef.current = socket;
    if (socket.connected) setStatus("connected");

    const onConnect    = () => setStatus("connected");
    const onDisconnect = () => setStatus("disconnected");
    const onError      = () => setStatus("error");

    socket.on("connect",       onConnect);
    socket.on("disconnect",    onDisconnect);
    socket.on("connect_error", onError);
    socket.emit("JOIN_QUIZ", quizId);

    return () => {
      socket.off("connect",       onConnect);
      socket.off("disconnect",    onDisconnect);
      socket.off("connect_error", onError);
      socket.emit("LEAVE_QUIZ", quizId);
    };
  }, [quizId, SERVER]);

  const on = useCallback((event: string, handler: (...args: any[]) => void) => {
    socketRef.current?.on(event, handler);
    return () => socketRef.current?.off(event, handler);
  }, []);

  return { status, on };
}
