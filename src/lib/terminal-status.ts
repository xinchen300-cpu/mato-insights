// Payter holds a standing connection to each terminal and reconnects it once a
// night, so a terminal is up until Payter records a disconnect after its last
// connect. A short grace keeps that nightly reconnect from raising an alarm.
const GRACE_MS = 10 * 60 * 1000;

export type TerminalStatus = "online" | "offline" | "unknown";

export function terminalStatus(
  lastConnectedAt: string | null,
  lastDisconnectedAt: string | null,
  now = Date.now(),
): TerminalStatus {
  if (!lastConnectedAt) return "unknown";
  if (!lastDisconnectedAt) return "online";
  const connected = new Date(lastConnectedAt).getTime();
  const disconnected = new Date(lastDisconnectedAt).getTime();
  return disconnected > connected && now - disconnected > GRACE_MS ? "offline" : "online";
}
