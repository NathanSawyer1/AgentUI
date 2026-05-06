import { invoke } from "@tauri-apps/api/core";

export function startDragging() {
  void invoke("window_start_dragging").catch(() => undefined);
}

export function minimizeWindow(event: React.MouseEvent) {
  event.stopPropagation();
  void invoke("window_minimize").catch(() => undefined);
}

export function toggleMaximizeWindow(event?: React.MouseEvent) {
  event?.stopPropagation();
  void invoke("window_toggle_maximize").catch(() => undefined);
}

export function closeWindow(event: React.MouseEvent) {
  event.stopPropagation();
  void invoke("window_close").catch(() => undefined);
}
