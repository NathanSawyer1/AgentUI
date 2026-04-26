import { useEffect, useState } from "react";
import { gatewayStatus } from "../lib/openclaw";
import type { GatewayStatus as GatewayStatusType } from "../lib/types";
import { Icon } from "../components/Icons";

export function GatewayStatus() {
  const [status, setStatus] = useState<GatewayStatusType | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const next = await gatewayStatus();
        if (!cancelled) {
          setStatus(next);
          setError("");
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    };
    void load();
    const timer = window.setInterval(load, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div className="gateway-panel">
      <div className="gateway-head">
        <div>
          <div className="panel-title"><Icon name="layers" size={12} /> Gateway Overview</div>
          <div className="gateway-sub">openclaw local gateway status</div>
        </div>
        {status && <div className={"gateway-pill " + status.status}>{status.status} - {status.latency_ms}ms</div>}
      </div>
      {error && <div className="error-banner">{error}</div>}
      {status && (
        <>
          <div className="gateway-metrics">
            <div><span>Checked</span><strong>{new Date(status.checked_at).toLocaleTimeString()}</strong></div>
            <div><span>Version</span><strong>{status.version || "unknown"}</strong></div>
            <div><span>Latency</span><strong>{status.latency_ms}ms</strong></div>
          </div>
          <div className="gateway-bars">
            {status.history.map((h, i) => <div key={i} className={"hb-bar" + (i === status.history.length - 1 ? " last" : "")} style={{ height: Math.max(8, Math.min(100, h)) + "%" }} />)}
          </div>
          <div className="gateway-nodes">
            {status.nodes.map((node) => (
              <div key={node.name} className="gateway-node">
                <span className={"sb-dot " + (node.status === "online" ? "ok" : node.status === "degraded" ? "working" : "idle")}></span>
                <span>{node.name}</span>
                <strong>{node.latency_ms}ms</strong>
                <em>{node.status}</em>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function StubPanel({ title }: { title: string }) {
  return (
    <div className="gateway-panel">
      <div className="gateway-head">
        <div>
          <div className="panel-title"><Icon name="tool" size={12} /> {title}</div>
          <div className="gateway-sub">Coming soon</div>
        </div>
      </div>
    </div>
  );
}
