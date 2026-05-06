import { useEffect, useState } from "react";
import { doctorStatus } from "../lib/openclaw";
import type { DoctorReport } from "../lib/types";
import { Icon } from "../components/Icons";

export function Doctor() {
  const [report, setReport] = useState<DoctorReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const refresh = () => {
    setLoading(true);
    setError("");
    void doctorStatus()
      .then(setReport)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, []);

  return (
    <div className="doctor-panel">
      <div className="gateway-head">
        <div>
          <h2>Doctor</h2>
          <div className="gateway-sub">OpenClaw runtime diagnostics</div>
        </div>
        <button className="panel-btn" onClick={refresh} disabled={loading}>
          <Icon name={loading ? "spinner" : "cpu"} size={12} />
          {loading ? "Checking" : "Run checks"}
        </button>
      </div>
      {error && <div className="error-banner inline">{error}</div>}
      {report && (
        <>
          <div className="gateway-metrics">
            <div><span>mode</span><strong>{report.mode}</strong></div>
            <div><span>version</span><strong>{report.appVersion}</strong></div>
            <div><span>token</span><strong>{report.tokenPresent ? "present" : "missing"}</strong></div>
          </div>
          <div className="doctor-checks">
            {report.checks.map((check) => (
              <div key={check.id} className="doctor-check">
                <span className={`doctor-dot ${check.status}`} />
                <div>
                  <strong>{check.label}</strong>
                  <p>{check.detail}</p>
                </div>
              </div>
            ))}
          </div>
          {report.binaryPath && (
            <div className="doctor-path">
              <span>binary</span>
              <code>{report.binaryPath}</code>
            </div>
          )}
        </>
      )}
    </div>
  );
}
