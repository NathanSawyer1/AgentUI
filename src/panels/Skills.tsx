import { useMemo, useState } from "react";
import { nextResourceGeneration, setResourceCache, updateResourceCache } from "../lib/memoryCache";
import { skillSetEnabled, skillsList } from "../lib/openclaw";
import type { SkillItem } from "../lib/types";
import { Icon } from "../components/Icons";
import { RefreshButton, RefreshError, RefreshMeta } from "../components/RefreshStatus";
import { errorText, useRefreshResource } from "../lib/refreshState";

type SkillFilter = "all" | "ready" | "blocked" | "model";
const SKILLS_PANEL_CACHE_KEY = "panel:skills";

export function Skills() {
  const skillsResource = useRefreshResource<SkillItem[]>({
    cacheKey: SKILLS_PANEL_CACHE_KEY,
    load: skillsList,
  });
  const skills = skillsResource.data ?? [];
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<SkillFilter>("all");
  const [pending, setPending] = useState<Record<string, boolean>>({});

  const counts = useMemo(() => ({
    total: skills.length,
    ready: skills.filter((skill) => skill.eligible && !skill.disabled).length,
    model: skills.filter((skill) => skill.modelVisible).length,
    blocked: skills.filter((skill) => !skill.eligible || skill.disabled).length,
  }), [skills]);

  const visibleSkills = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return skills
      .filter((skill) => {
        if (filter === "ready") return skill.eligible && !skill.disabled;
        if (filter === "blocked") return !skill.eligible || skill.disabled;
        if (filter === "model") return skill.modelVisible;
        return true;
      })
      .filter((skill) => {
        if (!needle) return true;
        return [skill.name, skill.description, skill.source, missingText(skill)].filter(Boolean).join(" ").toLowerCase().includes(needle);
      })
      .sort((a, b) => Number(b.eligible) - Number(a.eligible) || a.name.localeCompare(b.name));
  }, [skills, filter, query]);

  return (
    <div className="skills-panel">
      <div className="gateway-head">
        <div>
          <div className="panel-title"><Icon name="tool" size={12} /> Skills</div>
          <div className="gateway-sub">{skillsResource.loading ? "Loading OpenClaw skills" : `${counts.ready} ready of ${counts.total} installed or bundled`}</div>
        </div>
        <RefreshMeta loading={skillsResource.refreshing} updatedAt={skillsResource.updatedAt} stale={skillsResource.isStale} />
        <RefreshButton loading={skillsResource.loading || skillsResource.refreshing} onClick={skillsResource.refresh} />
        <div className="skills-search">
          <Icon name="search" size={12} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search skills" />
        </div>
      </div>

      <RefreshError message={skillsResource.error} stale={skillsResource.isStale} onRetry={skillsResource.refresh} />

      <div className="skills-summary">
        <SkillMetric label="Total" value={counts.total} />
        <SkillMetric label="Ready" value={counts.ready} tone="ok" />
        <SkillMetric label="Model visible" value={counts.model} />
        <SkillMetric label="Blocked" value={counts.blocked} tone="warn" />
      </div>

      <div className="skills-filters">
        <FilterButton label="All" value="all" count={counts.total} active={filter === "all"} onClick={setFilter} />
        <FilterButton label="Ready" value="ready" count={counts.ready} active={filter === "ready"} onClick={setFilter} />
        <FilterButton label="Model" value="model" count={counts.model} active={filter === "model"} onClick={setFilter} />
        <FilterButton label="Blocked" value="blocked" count={counts.blocked} active={filter === "blocked"} onClick={setFilter} />
      </div>

      <div className="skills-list">
        {skillsResource.loading && <div className="skills-empty">Loading skills...</div>}
        {!skillsResource.loading && visibleSkills.length === 0 && <div className="skills-empty">No matching skills.</div>}
        {!skillsResource.loading && visibleSkills.map((skill) => (
          <SkillRow
            key={skill.name}
            skill={skill}
            pending={Boolean(pending[skill.name])}
            onToggle={async (nextEnabled) => {
              const previous = skills;
              const optimistic = skills.map((item) => item.name === skill.name ? { ...item, disabled: !nextEnabled } : item);
              setPending((current) => ({ ...current, [skill.name]: true }));
              skillsResource.setData(optimistic);
              updateResourceCache<SkillItem[]>(SKILLS_PANEL_CACHE_KEY, { status: "ready", data: optimistic });
              try {
                const updated = await skillSetEnabled(skill.name, nextEnabled);
                if (updated) {
                  setResourceCache(SKILLS_PANEL_CACHE_KEY, { status: "ready", generation: nextResourceGeneration(SKILLS_PANEL_CACHE_KEY), updatedAt: Date.now(), data: updated });
                  skillsResource.setData(updated);
                }
              } catch (err) {
                skillsResource.setData(previous);
                updateResourceCache<SkillItem[]>(SKILLS_PANEL_CACHE_KEY, { status: "ready", data: previous });
                skillsResource.setError(errorText(err));
              } finally {
                setPending((current) => {
                  const next = { ...current };
                  delete next[skill.name];
                  return next;
                });
              }
            }}
          />
        ))}
      </div>
    </div>
  );
}

function SkillMetric({ label, value, tone }: { label: string; value: number; tone?: "ok" | "warn" }) {
  return (
    <div>
      <span>{label}</span>
      <strong className={tone}>{value}</strong>
    </div>
  );
}

function FilterButton({ label, value, count, active, onClick }: {
  label: string;
  value: SkillFilter;
  count: number;
  active: boolean;
  onClick: (value: SkillFilter) => void;
}) {
  return (
    <button className={"skills-filter" + (active ? " active" : "")} onClick={() => onClick(value)}>
      <span>{label}</span>
      <em>{count}</em>
    </button>
  );
}

function SkillRow({ skill, pending, onToggle }: { skill: SkillItem; pending: boolean; onToggle: (enabled: boolean) => void }) {
  const blocked = !skill.eligible || skill.disabled;
  const missing = missingText(skill);
  const enabled = !skill.disabled;
  return (
    <div className={"skill-row" + (blocked ? " blocked" : "")}>
      <div className={"skill-status " + (blocked ? "blocked" : "ready")}></div>
      <div className="skill-main">
        <div className="skill-title">
          <strong>{skill.name}</strong>
          <span>{skill.source || "unknown"}</span>
          {skill.bundled && <span>bundled</span>}
        </div>
        {skill.description && <p>{skill.description}</p>}
        {missing && <div className="skill-missing">Missing {missing}</div>}
      </div>
      <div className="skill-tags">
        {skill.modelVisible && <span>model</span>}
        {skill.userInvocable && <span>user</span>}
        {skill.commandVisible && <span>command</span>}
        {skill.homepage && <a href={skill.homepage} target="_blank" rel="noreferrer">home</a>}
      </div>
      <button
        className={"skill-toggle" + (enabled ? " enabled" : "")}
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={`${enabled ? "Disable" : "Enable"} ${skill.name}`}
        disabled={pending}
        onClick={() => onToggle(!enabled)}
        title={enabled ? "Disable skill" : "Enable skill"}
      >
        <span></span>
      </button>
    </div>
  );
}

function missingText(skill: SkillItem) {
  const missing = skill.missing;
  if (!missing) return "";
  const parts = [
    ...missing.bins,
    ...missing.anyBins.map((bin) => `any:${bin}`),
    ...missing.env,
    ...missing.config,
    ...missing.os,
  ];
  return parts.join(", ");
}
