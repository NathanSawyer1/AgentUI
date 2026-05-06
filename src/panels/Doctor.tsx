import { doctorStatus } from "../lib/openclaw";
import type { DoctorReport } from "../lib/types";
import { Icon } from "../components/Icons";
import { RefreshButton, RefreshError, RefreshMeta } from "../components/RefreshStatus";
import { useRefreshResource } from "../lib/refreshState";

export function Doctor() {
  const doctor = useRefreshResource<DoctorReport>({
    cacheKey: "panel:doctor",
    load: doctorStatus,
  });
  const report = doctor.data;

  return (
    <div className="doctor-panel">
      <div className="gateway-head">
        <div>
          <h2>Doctor</h2>
          <div className="gateway-sub">OpenClaw runtime diagnostics</div>
        </div>
        <RefreshMeta loading={doctor.refreshing} updatedAt={doctor.updatedAt} stale={doctor.isStale} />
        <RefreshButton loading={doctor.loading || doctor.refreshing} onClick={doctor.refresh} label="Run checks" />
      </div>
      <RefreshError message={doctor.error} stale={doctor.isStale} onRetry={doctor.refresh} />
      {doctor.loading && !report && <div className="panel-empty"><Icon name="spinner" size={14} /> Running checks...</div>}
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
