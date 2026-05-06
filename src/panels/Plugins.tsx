import { useMemo, useState } from "react";
import { nextResourceGeneration, setResourceCache, updateResourceCache } from "../lib/memoryCache";
import { pluginInstall, pluginSetEnabled, pluginUninstall, pluginUninstallPreview, pluginUpdate, pluginsList, pluginsSearch } from "../lib/openclaw";
import type { PluginItem, PluginSearchResult } from "../lib/types";
import { Icon } from "../components/Icons";
import { RefreshButton, RefreshError, RefreshMeta } from "../components/RefreshStatus";
import { errorText, useRefreshResource } from "../lib/refreshState";

type PluginFilter = "all" | "loaded" | "disabled" | "issues";
type PendingKey = "install" | "search" | "update-all" | string;
const PLUGINS_PANEL_CACHE_KEY = "panel:plugins";

export function Plugins() {
  const pluginsResource = useRefreshResource<PluginItem[]>({
    cacheKey: PLUGINS_PANEL_CACHE_KEY,
    load: pluginsList,
  });
  const plugins = pluginsResource.data ?? [];
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<PluginFilter>("all");
  const [pending, setPending] = useState<Record<PendingKey, boolean>>({});
  const [rawSpec, setRawSpec] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PluginSearchResult[]>([]);
  const [uninstall, setUninstall] = useState<{ plugin: PluginItem; preview: string } | null>(null);

  const refresh = async () => {
    const items = await pluginsList();
    setResourceCache(PLUGINS_PANEL_CACHE_KEY, { status: "ready", generation: nextResourceGeneration(PLUGINS_PANEL_CACHE_KEY), updatedAt: Date.now(), data: items });
    pluginsResource.setData(items);
  };

  const counts = useMemo(() => ({
    total: plugins.length,
    loaded: plugins.filter((plugin) => plugin.enabled && plugin.status !== "disabled").length,
    disabled: plugins.filter((plugin) => !plugin.enabled || plugin.status === "disabled").length,
    issues: plugins.filter(hasIssue).length,
  }), [plugins]);

  const visiblePlugins = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return plugins
      .filter((plugin) => {
        if (filter === "loaded") return plugin.enabled && plugin.status !== "disabled";
        if (filter === "disabled") return !plugin.enabled || plugin.status === "disabled";
        if (filter === "issues") return hasIssue(plugin);
        return true;
      })
      .filter((plugin) => {
        if (!needle) return true;
        return searchableText(plugin).toLowerCase().includes(needle);
      })
      .sort((a, b) => Number(hasIssue(b)) - Number(hasIssue(a)) || Number(b.enabled) - Number(a.enabled) || displayName(a).localeCompare(displayName(b)));
  }, [plugins, filter, query]);

  const setActionPending = (key: PendingKey, value: boolean) => {
    setPending((current) => {
      const next = { ...current };
      if (value) next[key] = true;
      else delete next[key];
      return next;
    });
  };

  const afterMutation = async (resultOutput: string) => {
    await refresh();
    setNotice(restartHint(resultOutput) || resultOutput || "Plugin registry updated.");
  };

  const runClawHubSearch = async () => {
    const needle = searchQuery.trim();
    if (!needle) return;
    pluginsResource.setError("");
    setNotice("");
    setActionPending("search", true);
    try {
      setSearchResults(await pluginsSearch(needle, 8));
    } catch (err) {
      pluginsResource.setError(errorText(err));
      setSearchResults([]);
    } finally {
      setActionPending("search", false);
    }
  };

  const installSpec = async (spec: string) => {
    const trimmed = spec.trim();
    if (!trimmed) return;
    pluginsResource.setError("");
    setNotice("");
    setActionPending(`install:${trimmed}`, true);
    try {
      const result = await pluginInstall(trimmed);
      setRawSpec("");
      await afterMutation(result.output);
    } catch (err) {
      pluginsResource.setError(errorText(err));
    } finally {
      setActionPending(`install:${trimmed}`, false);
    }
  };

  return (
    <div className="skills-panel plugins-panel">
      <div className="gateway-head">
        <div>
          <div className="panel-title"><Icon name="plug" size={12} /> Plugins</div>
          <div className="gateway-sub">{pluginsResource.loading ? "Loading OpenClaw plugins" : `${counts.loaded} loaded of ${counts.total} installed or bundled`}</div>
        </div>
        <RefreshMeta loading={pluginsResource.refreshing} updatedAt={pluginsResource.updatedAt} stale={pluginsResource.isStale} />
        <RefreshButton loading={pluginsResource.loading || pluginsResource.refreshing} onClick={pluginsResource.refresh} />
        <div className="skills-search">
          <Icon name="search" size={12} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search plugins" />
        </div>
      </div>

      <RefreshError message={pluginsResource.error} stale={pluginsResource.isStale} onRetry={pluginsResource.refresh} />
      {notice && <div className="plugin-notice">{notice}</div>}

      <div className="skills-summary">
        <PluginMetric label="Total" value={counts.total} />
        <PluginMetric label="Loaded" value={counts.loaded} tone="ok" />
        <PluginMetric label="Disabled" value={counts.disabled} />
        <PluginMetric label="Issues" value={counts.issues} tone="warn" />
      </div>

      <div className="plugin-install">
        <form className="plugin-install-row" onSubmit={(event) => { event.preventDefault(); void runClawHubSearch(); }}>
          <div className="skills-search">
            <Icon name="search" size={12} />
            <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search ClawHub" />
          </div>
          <button className="plugin-action" disabled={pending.search || !searchQuery.trim()} type="submit">Search</button>
        </form>
        {searchResults.length > 0 && (
          <div className="plugin-search-results">
            {searchResults.map((result) => {
              const spec = result.spec || result.id;
              return (
                <div className="plugin-search-result" key={result.id}>
                  <div>
                    <strong>{result.name || result.id}</strong>
                    <span>{[result.version, result.author || result.source].filter(Boolean).join(" / ")}</span>
                    {result.description && <p>{result.description}</p>}
                  </div>
                  <button className="plugin-action" disabled={Boolean(pending[`install:${spec}`])} onClick={() => void installSpec(spec)}>Install</button>
                </div>
              );
            })}
          </div>
        )}
        <form className="plugin-install-row" onSubmit={(event) => { event.preventDefault(); void installSpec(rawSpec); }}>
          <div className="skills-search raw">
            <Icon name="code" size={12} />
            <input value={rawSpec} onChange={(event) => setRawSpec(event.target.value)} placeholder="Raw spec or path" />
          </div>
          <button className="plugin-action" disabled={!rawSpec.trim() || Boolean(pending[`install:${rawSpec.trim()}`])} type="submit">Install</button>
          <button
            className="plugin-action"
            disabled={pending["update-all"]}
            type="button"
            onClick={async () => {
              pluginsResource.setError("");
              setNotice("");
              setActionPending("update-all", true);
              try {
                const result = await pluginUpdate();
                await afterMutation(result.output);
              } catch (err) {
                pluginsResource.setError(errorText(err));
              } finally {
                setActionPending("update-all", false);
              }
            }}
          >
            Update all
          </button>
        </form>
      </div>

      <div className="skills-filters">
        <FilterButton label="All" value="all" count={counts.total} active={filter === "all"} onClick={setFilter} />
        <FilterButton label="Loaded" value="loaded" count={counts.loaded} active={filter === "loaded"} onClick={setFilter} />
        <FilterButton label="Disabled" value="disabled" count={counts.disabled} active={filter === "disabled"} onClick={setFilter} />
        <FilterButton label="Issues" value="issues" count={counts.issues} active={filter === "issues"} onClick={setFilter} />
      </div>

      <div className="skills-list">
        {pluginsResource.loading && <div className="skills-empty">Loading plugins...</div>}
        {!pluginsResource.loading && visiblePlugins.length === 0 && <div className="skills-empty">No matching plugins.</div>}
        {!pluginsResource.loading && visiblePlugins.map((plugin) => (
          <PluginRow
            key={plugin.id}
            plugin={plugin}
            pending={pending[plugin.id]}
            onToggle={async (nextEnabled) => {
              const previous = plugins;
              pluginsResource.setError("");
              setNotice("");
              setActionPending(plugin.id, true);
              const optimistic = plugins.map((item) => item.id === plugin.id ? { ...item, enabled: nextEnabled, status: nextEnabled ? "loaded" : "disabled" } : item);
              pluginsResource.setData(optimistic);
              updateResourceCache<PluginItem[]>(PLUGINS_PANEL_CACHE_KEY, { status: "ready", data: optimistic });
              try {
                const updated = await pluginSetEnabled(plugin.id, nextEnabled);
                setResourceCache(PLUGINS_PANEL_CACHE_KEY, { status: "ready", generation: nextResourceGeneration(PLUGINS_PANEL_CACHE_KEY), updatedAt: Date.now(), data: updated });
                pluginsResource.setData(updated);
              } catch (err) {
                pluginsResource.setData(previous);
                updateResourceCache<PluginItem[]>(PLUGINS_PANEL_CACHE_KEY, { status: "ready", data: previous });
                pluginsResource.setError(errorText(err));
              } finally {
                setActionPending(plugin.id, false);
              }
            }}
            onUpdate={async () => {
              pluginsResource.setError("");
              setNotice("");
              setActionPending(`update:${plugin.id}`, true);
              try {
                const result = await pluginUpdate(plugin.id);
                await afterMutation(result.output);
              } catch (err) {
                pluginsResource.setError(errorText(err));
              } finally {
                setActionPending(`update:${plugin.id}`, false);
              }
            }}
            onUninstallPreview={async () => {
              pluginsResource.setError("");
              setNotice("");
              setActionPending(`uninstall:${plugin.id}`, true);
              try {
                const result = await pluginUninstallPreview(plugin.id);
                setUninstall({ plugin, preview: result.output || "No changes reported by dry run." });
              } catch (err) {
                pluginsResource.setError(errorText(err));
              } finally {
                setActionPending(`uninstall:${plugin.id}`, false);
              }
            }}
          />
        ))}
      </div>

      {uninstall && (
        <div className="plugin-modal-backdrop" onMouseDown={() => setUninstall(null)}>
          <div className="plugin-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="plugin-modal-head">
              <strong>Uninstall {displayName(uninstall.plugin)}</strong>
              <button className="tb-btn icon-only" onClick={() => setUninstall(null)}><Icon name="x" size={12} /></button>
            </div>
            <pre>{uninstall.preview}</pre>
            <div className="plugin-modal-actions">
              <button className="plugin-action" onClick={() => setUninstall(null)}>Cancel</button>
              <button
                className="plugin-action danger"
                disabled={pending[`confirm-uninstall:${uninstall.plugin.id}`]}
                onClick={async () => {
                  const id = uninstall.plugin.id;
                  setActionPending(`confirm-uninstall:${id}`, true);
                  pluginsResource.setError("");
                  try {
                    const result = await pluginUninstall(id);
                    setUninstall(null);
                    await afterMutation(result.output);
                  } catch (err) {
                    pluginsResource.setError(errorText(err));
                  } finally {
                    setActionPending(`confirm-uninstall:${id}`, false);
                  }
                }}
              >
                Uninstall
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PluginMetric({ label, value, tone }: { label: string; value: number; tone?: "ok" | "warn" }) {
  return (
    <div>
      <span>{label}</span>
      <strong className={tone}>{value}</strong>
    </div>
  );
}

function FilterButton({ label, value, count, active, onClick }: {
  label: string;
  value: PluginFilter;
  count: number;
  active: boolean;
  onClick: (value: PluginFilter) => void;
}) {
  return (
    <button className={"skills-filter" + (active ? " active" : "")} onClick={() => onClick(value)}>
      <span>{label}</span>
      <em>{count}</em>
    </button>
  );
}

function PluginRow({ plugin, pending, onToggle, onUpdate, onUninstallPreview }: {
  plugin: PluginItem;
  pending: boolean;
  onToggle: (enabled: boolean) => void;
  onUpdate: () => void;
  onUninstallPreview: () => void;
}) {
  const issue = hasIssue(plugin);
  const enabled = plugin.enabled;
  const caps = capabilityTags(plugin).slice(0, 5);
  return (
    <div className={"skill-row plugin-row" + (issue || !enabled ? " blocked" : "")}>
      <div className={"skill-status " + (issue ? "blocked" : enabled ? "ready" : "disabled")}></div>
      <div className="skill-main">
        <div className="skill-title">
          <strong>{displayName(plugin)}</strong>
          <span>{plugin.id}</span>
          {plugin.origin && <span>{plugin.origin}</span>}
          {plugin.version && <span>{plugin.version}</span>}
          {plugin.status && <span>{plugin.status}</span>}
        </div>
        {plugin.description && <p>{plugin.description}</p>}
        <div className="plugin-meta">
          {plugin.source && <span>{plugin.source}</span>}
          {dependencyWarning(plugin) && <span className="warn">{dependencyWarning(plugin)}</span>}
        </div>
      </div>
      <div className="skill-tags">
        {caps.map((tag) => <span key={tag}>{tag}</span>)}
        {capabilityTags(plugin).length > caps.length && <span>+{capabilityTags(plugin).length - caps.length}</span>}
      </div>
      <div className="plugin-row-actions">
        <button className="plugin-action compact" disabled={pending} onClick={onUpdate}>Update</button>
        <button className="plugin-action compact danger" disabled={pending} onClick={onUninstallPreview}>Uninstall</button>
        <button
          className={"skill-toggle" + (enabled ? " enabled" : "")}
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={`${enabled ? "Disable" : "Enable"} ${displayName(plugin)}`}
          disabled={pending}
          onClick={() => onToggle(!enabled)}
          title={enabled ? "Disable plugin" : "Enable plugin"}
        >
          <span></span>
        </button>
      </div>
    </div>
  );
}

function displayName(plugin: PluginItem) {
  return plugin.name || plugin.id;
}

function hasIssue(plugin: PluginItem) {
  const deps = plugin.dependencyStatus;
  return plugin.status === "error" || deps?.requiredInstalled === false || Boolean(deps?.missing?.length);
}

function dependencyWarning(plugin: PluginItem) {
  const deps = plugin.dependencyStatus;
  if (!deps) return "";
  if (deps.requiredInstalled === false || deps.missing?.length) return `Missing ${deps.missing?.join(", ") || "required dependencies"}`;
  if (deps.optionalInstalled === false || deps.missingOptional?.length) return `Optional missing ${deps.missingOptional?.join(", ") || "dependencies"}`;
  return "";
}

function capabilityTags(plugin: PluginItem) {
  const groups: Array<[string, string[] | undefined]> = [
    ["tools", plugin.toolNames],
    ["hooks", plugin.hookNames],
    ["channels", plugin.channelIds],
    ["cli", plugin.cliBackendIds],
    ["providers", [
      ...(plugin.providerIds || []),
      ...(plugin.speechProviderIds || []),
      ...(plugin.realtimeTranscriptionProviderIds || []),
      ...(plugin.realtimeVoiceProviderIds || []),
      ...(plugin.mediaUnderstandingProviderIds || []),
      ...(plugin.imageGenerationProviderIds || []),
      ...(plugin.videoGenerationProviderIds || []),
      ...(plugin.musicGenerationProviderIds || []),
      ...(plugin.webFetchProviderIds || []),
      ...(plugin.webSearchProviderIds || []),
      ...(plugin.migrationProviderIds || []),
      ...(plugin.memoryEmbeddingProviderIds || []),
    ]],
    ["harness", plugin.agentHarnessIds],
    ["gateway", plugin.gatewayMethods],
    ["commands", [...(plugin.cliCommands || []), ...(plugin.commands || [])]],
    ["services", [...(plugin.services || []), ...(plugin.gatewayDiscoveryServiceIds || [])]],
  ];
  const tags = groups.filter(([, values]) => values && values.length > 0).map(([label, values]) => `${label}:${values?.length}`);
  if ((plugin.httpRoutes || 0) > 0) tags.push(`routes:${plugin.httpRoutes}`);
  if ((plugin.hookCount || 0) > 0 && !tags.some((tag) => tag.startsWith("hooks:"))) tags.push(`hooks:${plugin.hookCount}`);
  return tags;
}

function searchableText(plugin: PluginItem) {
  return [
    plugin.id,
    plugin.name,
    plugin.description,
    plugin.origin,
    plugin.source,
    plugin.status,
    ...capabilityTags(plugin),
    dependencyWarning(plugin),
  ].filter(Boolean).join(" ");
}

function restartHint(output: string) {
  return /restart|reload|gateway/i.test(output) ? output : "";
}
