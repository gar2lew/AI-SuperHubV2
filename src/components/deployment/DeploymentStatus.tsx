import { AlertTriangle, CheckCircle2, ExternalLink, GitCommit, Rocket } from "lucide-react";
import { deploymentChecklist, deploymentMetadata } from "@/lib/deployment/metadata";

export function DeploymentStatus() {
  const statusTone = deploymentChecklist.status === "ready" ? "text-success" : "text-warning";
  const StatusIcon = deploymentChecklist.status === "ready" ? CheckCircle2 : AlertTriangle;

  return (
    <div className="telemetry-card p-3">
      <h4 className="text-xs font-semibold text-text-primary uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <Rocket size={12} className={statusTone} />
        Deployment
      </h4>

      <div className="space-y-2 text-xs">
        <div className="flex items-center justify-between gap-3">
          <span className="text-text-muted">Status</span>
          <span className={`inline-flex items-center gap-1 ${statusTone}`}>
            <StatusIcon size={12} />
            {deploymentChecklist.status}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-text-muted">Version</span>
          <span className="text-text-secondary font-mono truncate max-w-[9rem]">
            {deploymentMetadata.appVersion || "unknown"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-text-muted">Commit</span>
          <span className="text-text-secondary font-mono inline-flex items-center gap-1" data-visual-mask>
            <GitCommit size={11} />
            {deploymentMetadata.shortCommitSha || "unknown"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-text-muted">Environment</span>
          <span className="text-text-secondary">{deploymentMetadata.vercelEnv}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-text-muted">Built</span>
          <span className="text-text-secondary font-mono text-[10px]" data-visual-mask>
            {deploymentMetadata.deploymentTimestamp || "unknown"}
          </span>
        </div>

        {(deploymentMetadata.deploymentUrl || deploymentMetadata.productionUrl) && (
          <a
            href={deploymentMetadata.deploymentUrl || deploymentMetadata.productionUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex max-w-full items-center gap-1 text-accent-hover"
          >
            <ExternalLink size={11} />
            <span className="truncate">
              {deploymentMetadata.deploymentUrl || deploymentMetadata.productionUrl}
            </span>
          </a>
        )}

        <div className="space-y-1 pt-1">
          {deploymentChecklist.items.map((item) => (
            <div key={item.id} className="flex items-start gap-2">
              {item.state === "ready" ? (
                <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-success" />
              ) : (
                <AlertTriangle size={12} className="mt-0.5 shrink-0 text-warning" />
              )}
              <div className="min-w-0">
                <p className="text-text-secondary">{item.label}</p>
                <p
                  className="text-[10px] leading-snug text-text-muted"
                  data-visual-mask={item.id === "commit" || item.id === "timestamp" ? true : undefined}
                >
                  {item.detail}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
