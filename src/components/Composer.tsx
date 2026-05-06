import { useEffect, useMemo, useRef, useState } from "react";
import { agentCapabilities, agentsList, chatSend, modelsList, skillsList, slashCommandsList } from "../lib/openclaw";
import { CATEGORY_ORDER, categoryLabel, filterSlashCommands, nextArgIndex, shouldKeepArgPicker, slashFilterMatch, commandAlias } from "../lib/slashCommands";
import { PERMISSION_MODES, DEFAULT_MODELS, DEFAULT_AGENTS, THINKING_LEVELS } from "../lib/composerOptions";
import { applyChatEvent } from "../lib/chatReducer";
import { nowTime } from "../lib/chatHistory";
import { getResourceCache, nextResourceGeneration, payloadEqual, setResourceCache, updateResourceCache } from "../lib/memoryCache";
import { buildSuggestions } from "../lib/suggestions";
import type { AgentCapabilities, ChatEvent, ChatSendOptions, OptionItem, SkillItem, SlashCommand } from "../lib/types";
import { Icon } from "./Icons";

const CAPABILITIES_CACHE_KEY = "composer:agentCapabilities";
const SLASH_CACHE_KEY = "composer:slashCommands";
const SKILLS_CACHE_KEY = "composer:skills";
const MODELS_CACHE_KEY = "composer:models";
const AGENTS_CACHE_KEY = "composer:agents";

// ---------------------------------------------------------------------------
// Dropdown shell
// ---------------------------------------------------------------------------

function Dropdown({ open, onClose, children, align = "left" }: { open: boolean; onClose: () => void; children: React.ReactNode; align?: "left" | "right" }) {
  if (!open) return null;
  return <div className={"dd-menu " + align}>{children}</div>;
}

// ---------------------------------------------------------------------------
// Option menu
// ---------------------------------------------------------------------------

function OptionMenu({ title, items, value, onChange, onClose }: { title: string; items: OptionItem[]; value: string; onChange: (id: string) => void; onClose: () => void }) {
  return (
    <>
      <div className="dd-head">{title}</div>
      {items.map((it) => (
        <div key={it.id} className={"dd-item" + (value === it.id ? " active" : "")} onClick={() => { onChange(it.id); onClose(); }}>
          <span className="check">{value === it.id ? <Icon name="check" size={10} /> : null}</span>
          <div className="text">
            <div>{it.name}</div>
            {it.desc && <div className="desc">{it.desc}</div>}
          </div>
          <span className="meta">{it.meta}</span>
        </div>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Slash popover (grouped or flat)
// ---------------------------------------------------------------------------

function SlashPopover({ matches, highlight, filter, onSelect, onHighlight }: {
  matches: SlashCommand[];
  highlight: number;
  filter: string;
  onSelect: (cmd: SlashCommand) => void;
  onHighlight: (i: number) => void;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${highlight}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest" });
  }, [highlight]);

  if (matches.length === 0) {
    return (
      <div className="slash-pop">
        <div className="slash-empty">{filter ? "No matching commands." : "No commands available — check that the gateway is running."}</div>
      </div>
    );
  }

  const useGroups = !filter;

  if (useGroups) {
    const grouped: Record<string, { cmd: SlashCommand; idx: number }[]> = {};
    let idx = 0;
    for (const cmd of matches) {
      const cat = cmd.category ?? "other";
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push({ cmd, idx: idx++ });
    }
    const orderedCats = [
      ...CATEGORY_ORDER.filter((c) => grouped[c]),
      ...Object.keys(grouped).filter((c) => !CATEGORY_ORDER.includes(c)),
    ];

    return (
      <div className="slash-pop" ref={listRef}>
        {orderedCats.map((cat) => (
          <div key={cat}>
            <div className="slash-group-head">{categoryLabel(cat)}</div>
            {grouped[cat].map(({ cmd, idx: i }) => (
              <SlashRow key={cmd.name} cmd={cmd} active={i === highlight} idx={i} onSelect={onSelect} onHighlight={onHighlight} />
            ))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="slash-pop" ref={listRef}>
      {matches.map((cmd, i) => (
        <SlashRow key={cmd.name} cmd={cmd} active={i === highlight} idx={i} onSelect={onSelect} onHighlight={onHighlight} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Slash row
// ---------------------------------------------------------------------------

function SlashRow({ cmd, active, idx, onSelect, onHighlight }: { cmd: SlashCommand; active: boolean; idx: number; onSelect: (cmd: SlashCommand) => void; onHighlight: (i: number) => void }) {
  const alias = commandAlias(cmd);
  const extraAliases = cmd.textAliases.slice(1).join(", ");
  const meta = [cmd.source !== "native" ? cmd.source : null, extraAliases || null].filter(Boolean).join(" · ");
  return (
    <div
      data-idx={idx}
      className={"dd-item" + (active ? " active" : "")}
      onMouseEnter={() => onHighlight(idx)}
      onClick={() => onSelect(cmd)}
    >
      <span className="check" />
      <div className="text">
        <div>{alias}</div>
        {cmd.description && <div className="desc">{cmd.description}</div>}
      </div>
      {meta && <span className="meta">{meta}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Argument picker popover
// ---------------------------------------------------------------------------

function ArgPickerPopover({ command, argIndex, highlight, onSelect, onHighlight }: {
  command: SlashCommand;
  argIndex: number;
  highlight: number;
  onSelect: (choice: string) => void;
  onHighlight: (i: number) => void;
}) {
  const arg = command.args?.[argIndex];
  if (!arg?.choices?.length) return null;
  return (
    <div className="slash-pop">
      <div className="dd-head">{arg.name}{arg.description ? ` — ${arg.description}` : ""}</div>
      {arg.choices.map((choice, i) => (
        <div
          key={choice.value}
          data-idx={i}
          className={"dd-item" + (i === highlight ? " active" : "")}
          onMouseEnter={() => onHighlight(i)}
          onClick={() => onSelect(choice.value)}
        >
          <span className="check">{i === highlight ? <Icon name="check" size={10} /> : null}</span>
          <div className="text"><div>{choice.label ?? choice.value}</div></div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Textarea resize helper
// ---------------------------------------------------------------------------

function resizeTextarea(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = Math.min(160, el.scrollHeight) + "px";
}

// ---------------------------------------------------------------------------
// Composer
// ---------------------------------------------------------------------------

export function Composer({ sessionId, onUserMessage, onChatEvents, onError }: { sessionId: string; onUserMessage: (text: string) => void; onChatEvents: (events: ChatEvent[]) => void; onError: (message: string) => void }) {
  const [text, setText] = useState("");
  const [models, setModels] = useState<OptionItem[]>(DEFAULT_MODELS);
  const [agents, setAgents] = useState<OptionItem[]>(DEFAULT_AGENTS);
  const [model, setModel] = useState("");
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [agentsLoaded, setAgentsLoaded] = useState(false);
  const [agentId, setAgentId] = useState("main");
  const [thinking, setThinking] = useState<ChatSendOptions["thinking"]>("off");
  const [openDd, setOpenDd] = useState<"model" | "agent" | "thinking" | "permission" | null>(null);
  const [permission, setPermission] = useState<"default" | "plan" | "yolo">("default");
  const [attached, setAttached] = useState<Array<{ name: string; size: number }>>([]);
  const [commands, setCommands] = useState<SlashCommand[]>([]);
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [commandsLoaded, setCommandsLoaded] = useState(false);
  const [capabilities, setCapabilities] = useState<AgentCapabilities>({ permissionFlags: false, archiveSession: false });
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashFilter, setSlashFilter] = useState("");
  const [slashHighlight, setSlashHighlight] = useState(0);
  const [argPicker, setArgPicker] = useState<{ command: SlashCommand; argIndex: number } | null>(null);

  const textRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const agentDdRef = useRef<HTMLDivElement | null>(null);
  const modelDdRef = useRef<HTMLDivElement | null>(null);
  const thinkingDdRef = useRef<HTMLDivElement | null>(null);
  const permDdRef = useRef<HTMLDivElement | null>(null);

  const applyCachedMetadata = () => {
    const cachedCapabilities = getResourceCache<AgentCapabilities>(CAPABILITIES_CACHE_KEY)?.data;
    const cachedCommands = getResourceCache<SlashCommand[]>(SLASH_CACHE_KEY)?.data;
    const cachedSkills = getResourceCache<SkillItem[]>(SKILLS_CACHE_KEY)?.data;
    const cachedModels = getResourceCache<OptionItem[]>(MODELS_CACHE_KEY)?.data;
    const cachedAgents = getResourceCache<OptionItem[]>(AGENTS_CACHE_KEY)?.data;
    if (cachedCapabilities) setCapabilities(cachedCapabilities);
    if (cachedCommands) {
      setCommands(cachedCommands);
      setCommandsLoaded(true);
    }
    if (cachedSkills) setSkills(cachedSkills);
    if (cachedModels) {
      setModels(cachedModels);
    }
    if (cachedAgents) {
      setAgents(cachedAgents);
    }
  };

  const refreshCached = async <T,>(key: string, load: () => Promise<T>, apply: (value: T) => void) => {
    const generation = nextResourceGeneration(key);
    updateResourceCache<T>(key, { status: "loading", generation });
    try {
      const next = await load();
      const current = getResourceCache<T>(key);
      if (current?.generation !== generation) return;
      setResourceCache<T>(key, { status: "ready", generation, updatedAt: Date.now(), data: next });
      apply(next);
    } catch (error) {
      updateResourceCache<T>(key, { status: "error", generation, error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  };

  // Reset only transient UI on session change; keep metadata visible while it refreshes.
  useEffect(() => {
    setSlashOpen(false);
    setArgPicker(null);
  }, [sessionId]);

  useEffect(() => {
    applyCachedMetadata();
    void refreshCached(CAPABILITIES_CACHE_KEY, agentCapabilities, (next) => {
      setCapabilities((current) => payloadEqual(current, next) ? current : next);
    }).catch(() => setCapabilities((current) => current ?? { permissionFlags: false, archiveSession: false }));
    void refreshCached(SLASH_CACHE_KEY, slashCommandsList, (next) => {
      setCommandsLoaded(true);
      setCommands((current) => payloadEqual(current, next) ? current : next);
    }).catch(() => undefined);
    void refreshCached(SKILLS_CACHE_KEY, skillsList, (next) => {
      setSkills((current) => payloadEqual(current, next) ? current : next);
    }).catch(() => undefined);
  }, [sessionId]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!openDd) return;
    const refs: Record<string, React.RefObject<HTMLElement | null>> = { agent: agentDdRef, model: modelDdRef, thinking: thinkingDdRef, permission: permDdRef };
    const closeWhenOutside = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (refs[openDd].current?.contains(target)) return;
      setOpenDd(null);
    };
    document.addEventListener("mousedown", closeWhenOutside);
    return () => document.removeEventListener("mousedown", closeWhenOutside);
  }, [openDd]);

  // Load models / agents / commands lazily
  const loadModels = () => {
    const cached = getResourceCache<OptionItem[]>(MODELS_CACHE_KEY)?.data;
    if (cached) {
      setModels(cached);
    }
    if (modelsLoaded) return;
    setModelsLoaded(true);
    void refreshCached(MODELS_CACHE_KEY, async () => {
      const items = await modelsList();
      return items.length ? [...DEFAULT_MODELS, ...items] : DEFAULT_MODELS;
    }, (next) => {
      setModels(next);
      setModel((current) => next.some((item) => item.id === current) ? current : "");
    }).catch((error) => onError(error instanceof Error ? error.message : String(error)));
  };

  const loadAgents = () => {
    const cached = getResourceCache<OptionItem[]>(AGENTS_CACHE_KEY)?.data;
    if (cached) {
      setAgents(cached);
    }
    if (agentsLoaded) return;
    setAgentsLoaded(true);
    void refreshCached(AGENTS_CACHE_KEY, agentsList, (items) => {
      if (!items.length) return;
      setAgents(items);
      setAgentId((current) => items.some((item) => item.id === current) ? current : (items.find((item) => item.id === "main")?.id ?? items[0].id));
    }).catch((error) => onError(error instanceof Error ? error.message : String(error)));
  };

  const loadSlashCommands = () => {
    if (commandsLoaded) return;
    setCommandsLoaded(true);
    void refreshCached(SLASH_CACHE_KEY, slashCommandsList, (next) => {
      setCommands((current) => payloadEqual(current, next) ? current : next);
    }).catch((error) => onError(error instanceof Error ? error.message : String(error)));
  };

  const modelItem = models.find((m) => m.id === model) ?? models[0] ?? DEFAULT_MODELS[0];
  const agentItem = agents.find((a) => a.id === agentId) ?? agents[0] ?? DEFAULT_AGENTS[0];
  const thinkingItem = THINKING_LEVELS.find((t) => t.id === thinking) ?? THINKING_LEVELS[0];
  const permItem = PERMISSION_MODES.find((p) => p.id === permission) ?? PERMISSION_MODES[0];

  const slashMatches = useMemo(() => filterSlashCommands(commands, slashFilter), [commands, slashFilter]);

  const handleSend = async () => {
    const outgoing = text.trim();
    if (!outgoing) return;
    setText("");
    setAttached([]);
    setSlashOpen(false);
    setArgPicker(null);
    if (textRef.current) textRef.current.style.height = "auto";
    onUserMessage(outgoing);
    try {
      await chatSend(sessionId, outgoing, { agentId, model: model || undefined, thinking });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      onChatEvents([{ type: "error", session_id: sessionId, error: message }, { type: "done", session_id: sessionId }]);
      onError(message);
    }
  };

  const selectCommand = (cmd: SlashCommand) => {
    const alias = commandAlias(cmd);
    const next = alias + (cmd.acceptsArgs ? " " : "");
    setText(next);
    setSlashOpen(false);
    setSlashFilter("");
    if (cmd.acceptsArgs && cmd.args?.[0]?.choices?.length) {
      setArgPicker({ command: cmd, argIndex: 0 });
      setSlashHighlight(0);
    } else {
      setArgPicker(null);
    }
    textRef.current?.focus();
  };

  const applyArgChoice = (cmd: SlashCommand, argIndex: number, highlightIdx: number) => {
    const choice = cmd.args![argIndex].choices![highlightIdx];
    setText((t) => t.replace(/\s*$/, "") + " " + choice.value);
    const nextIdx = nextArgIndex(cmd, argIndex);
    if (nextIdx >= 0) {
      setArgPicker({ command: cmd, argIndex: nextIdx });
      setSlashHighlight(0);
    } else {
      setArgPicker(null);
    }
    textRef.current?.focus();
  };

  const updateText = (next: string) => {
    setText(next);
    if (textRef.current) resizeTextarea(textRef.current);
    const match = slashFilterMatch(next);
    if (match) {
      setSlashOpen(true);
      setSlashFilter(match.filter);
      setSlashHighlight(0);
      loadSlashCommands();
    } else {
      setSlashOpen(false);
      if (!shouldKeepArgPicker(next, argPicker)) setArgPicker(null);
    }
  };

  const popoverOpen = slashOpen || argPicker !== null;
  const popoverSize = slashOpen ? slashMatches.length : (argPicker?.command.args?.[argPicker.argIndex]?.choices?.length ?? 0);
  const suggestions = useMemo(() => buildSuggestions(commands, skills, false), [commands, skills]);

  const freeFormArg = argPicker
    ? (argPicker.command.args?.[argPicker.argIndex]?.choices?.length ?? 0) === 0
      ? argPicker.command.args?.[argPicker.argIndex]
      : null
    : null;

  return (
    <div className="composer-wrap">
      <div className="composer-inner">
        {slashOpen && (
          <SlashPopover
            matches={slashMatches}
            highlight={slashHighlight}
            filter={slashFilter}
            onSelect={selectCommand}
            onHighlight={setSlashHighlight}
          />
        )}
        {argPicker && !slashOpen && argPicker.command.args?.[argPicker.argIndex]?.choices?.length ? (
          <ArgPickerPopover
            command={argPicker.command}
            argIndex={argPicker.argIndex}
            highlight={slashHighlight}
            onSelect={(val) => applyArgChoice(argPicker.command, argPicker.argIndex, argPicker.command.args![argPicker.argIndex].choices!.findIndex((c) => c.value === val))}
            onHighlight={setSlashHighlight}
          />
        ) : null}
        {suggestions.length > 0 && !text && (
          <div className="suggestions">
            {suggestions.map((suggestion) => (
              <button key={`${suggestion.source}:${suggestion.label}`} className="suggestion" onClick={() => { updateText(suggestion.insert); textRef.current?.focus(); }}>
                {suggestion.label}
              </button>
            ))}
          </div>
        )}
        <div className="composer">
          {attached.length > 0 && (
            <div className="attachments">
              {attached.map((f, i) => (
                <div key={i} className="att">
                  <Icon name="file" size={10} />
                  {f.name}
                  <span className="x" onClick={() => setAttached((a) => a.filter((_, j) => j !== i))}><Icon name="x" size={10} /></span>
                </div>
              ))}
            </div>
          )}
          <textarea
            ref={textRef}
            className="composer-text"
            placeholder="Your message here..."
            value={text}
            rows={1}
            onChange={(e) => updateText(e.target.value)}
            onKeyDown={(e) => {
              if (popoverOpen && popoverSize > 0) {
                if (e.key === "Escape") {
                  e.preventDefault();
                  setSlashOpen(false);
                  setArgPicker(null);
                  return;
                }
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setSlashHighlight((i) => Math.min(i + 1, popoverSize - 1));
                  return;
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setSlashHighlight((i) => Math.max(i - 1, 0));
                  return;
                }
                if (e.key === "Enter" || e.key === "Tab") {
                  e.preventDefault();
                  if (argPicker && !slashOpen) {
                    applyArgChoice(argPicker.command, argPicker.argIndex, slashHighlight);
                  } else if (slashOpen && slashMatches[slashHighlight]) {
                    selectCommand(slashMatches[slashHighlight]);
                  }
                  return;
                }
              }
              if (e.key === "Escape" && popoverOpen) {
                e.preventDefault();
                setSlashOpen(false);
                setArgPicker(null);
                return;
              }
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
          />
          {freeFormArg && (
            <div className="slash-hint">
              {freeFormArg.name}{freeFormArg.description ? ` — ${freeFormArg.description}` : ""}
            </div>
          )}
          <div className="composer-bar">
            <input ref={fileRef} type="file" multiple hidden onChange={(e) => {
              const files = Array.from(e.target.files ?? []).map((f) => ({ name: f.name, size: f.size }));
              setAttached((a) => [...a, ...files]);
              e.currentTarget.value = "";
            }} />
            <button className="cb-btn plus" title="Attach files" onClick={() => fileRef.current?.click()}><Icon name="plus" size={14} /></button>
            <div className="cb-spacer"></div>
            <div className="dd-wrap" ref={permDdRef}>
              <button className={"cb-btn mode-" + permission} title="Permission mode" onClick={() => setOpenDd(openDd === "permission" ? null : "permission")}><Icon name="layers" size={11} />{permItem.name}<Icon name="chevDown" size={10} /></button>
              <Dropdown open={openDd === "permission"} onClose={() => setOpenDd(null)} align="left">
                <div className="dd-head">Mode</div>
                {PERMISSION_MODES.map((it) => {
                  const unavailable = it.id !== "default" && !capabilities.permissionFlags;
                  return (
                    <div key={it.id} className={"dd-item" + (permission === it.id ? " active" : "") + (unavailable ? " disabled" : "")} onClick={() => { if (!unavailable) { setPermission(it.id as "default" | "plan" | "yolo"); setOpenDd(null); } }}>
                      <span className="check">{permission === it.id ? <Icon name="check" size={10} /> : null}</span>
                      <div className="text">
                        <div>{it.name}</div>
                        <div className="desc">{unavailable ? "Unavailable until OpenClaw exposes permission flags." : it.desc}</div>
                      </div>
                      <span className="meta">{unavailable ? "disabled" : it.meta}</span>
                    </div>
                  );
                })}
              </Dropdown>
            </div>
            <div className="dd-wrap" ref={agentDdRef}>
              <button className="cb-btn" onClick={() => { loadAgents(); setOpenDd(openDd === "agent" ? null : "agent"); }}><Icon name="tool" size={11} />{agentItem.name}<Icon name="chevDown" size={10} /></button>
              <Dropdown open={openDd === "agent"} onClose={() => setOpenDd(null)} align="right">
                <OptionMenu title="Agent" items={agents} value={agentId} onChange={setAgentId} onClose={() => setOpenDd(null)} />
              </Dropdown>
            </div>
            <div className="dd-wrap" ref={modelDdRef}>
              <button className="cb-btn" onClick={() => { loadModels(); setOpenDd(openDd === "model" ? null : "model"); }}><Icon name="cpu" size={11} />{modelItem.name}<Icon name="chevDown" size={10} /></button>
              <Dropdown open={openDd === "model"} onClose={() => setOpenDd(null)} align="right">
                <OptionMenu title="Model" items={models} value={model} onChange={setModel} onClose={() => setOpenDd(null)} />
              </Dropdown>
            </div>
            <div className="dd-wrap" ref={thinkingDdRef}>
              <button className={"cb-btn" + (thinking !== "off" ? " active" : "")} title="Thinking level" onClick={() => setOpenDd(openDd === "thinking" ? null : "thinking")}><Icon name="eye" size={11} />{thinkingItem.name}<Icon name="chevDown" size={10} /></button>
              <Dropdown open={openDd === "thinking"} onClose={() => setOpenDd(null)} align="right">
                <OptionMenu title="Thinking" items={THINKING_LEVELS} value={thinking ?? "off"} onChange={(id) => setThinking(id as ChatSendOptions["thinking"])} onClose={() => setOpenDd(null)} />
              </Dropdown>
            </div>
            <button className="cb-send" disabled={!text.trim()} onClick={() => void handleSend()}><Icon name="arrowUp" size={14} stroke={2} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}
