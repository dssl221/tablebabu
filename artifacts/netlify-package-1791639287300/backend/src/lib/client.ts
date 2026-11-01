"use client";
import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T = any>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(`/api${url}`, {
    ...options,
    headers: {
      ...(options?.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...options?.headers,
    },
    credentials: "same-origin",
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok)
    throw new ApiError(data.error || "Something went wrong.", response.status);
  return data;
}
export const post = <T = any>(url: string, body?: unknown) =>
  api<T>(url, { method: "POST", body: JSON.stringify(body || {}) });
export const patch = <T = any>(url: string, body: unknown) =>
  api<T>(url, { method: "PATCH", body: JSON.stringify(body) });
export const money = (value: string | number, currency = "INR") =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: Number(value) % 1 ? 2 : 0,
  }).format(Number(value));
export const timeAgo = (date: string) => {
  const mins = Math.max(
    0,
    Math.floor((Date.now() - new Date(date).getTime()) / 60000),
  );
  return mins < 1
    ? "Just now"
    : mins < 60
      ? `${mins} min ago`
      : `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
};
export function useLive(
  auth: { role?: string; slug?: string },
  onEvent: (event: string, payload?: any) => void,
  sessionId?: string,
) {
  const callback = useRef(onEvent);
  callback.current = onEvent;
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    const socket = io({
      auth,
      withCredentials: true,
      reconnectionDelayMax: 5000,
    });
    socketRef.current = socket;
    socket.on("connect", () => {
      setConnected(true);
      callback.current("reconnect");
    });
    socket.on("disconnect", (reason) => {
      setConnected(false);
      if (reason === "io server disconnect")
        reconnectTimer = setTimeout(() => socket.connect(), 1500);
    });
    socket.onAny((event, payload) => callback.current(event, payload));
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") callback.current("sync");
    }, 20000);
    const visible = () => {
      if (document.visibilityState === "visible") callback.current("sync");
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearInterval(poll);
      clearTimeout(reconnectTimer);
      document.removeEventListener("visibilitychange", visible);
      socket.removeAllListeners();
      socket.disconnect();
    };
    // The auth object is reconstructed by renders; only its scalar identity matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.role, auth.slug, sessionId]);
  return connected;
}
