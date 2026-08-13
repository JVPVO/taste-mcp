import {
  ArrowRight,
  BookOpen,
  Check,
  Checks,
  CircleNotch,
  Code,
  GearSix,
  GitFork,
  GithubLogo,
  GridFour,
  LinkSimple,
  MagnifyingGlass,
  Moon,
  Plus,
  Queue,
  Rows,
  Star,
  SidebarSimple,
  Sparkle,
  Sun,
  Trash,
  XLogo,
  X,
} from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";

type Item = {
  id: number;
  title: string;
  url: string;
  description: string;
  imageUrl: string | null;
  categories: string[];
  tags: string[];
  kind: string;
  status: "reviewed" | "pending";
  prod: "Pronto" | "Experimental" | "Não revisado";
  favorability: "Recomendado" | "Neutro" | "Evitar" | "Não revisado";
  sourceMetadata?: {
    provider: "github";
    owner: string;
    repo: string;
    stars: number;
    forks: number;
    language: string | null;
    license: string | null;
    topics: string[];
    updatedAt: string;
    archived: boolean;
    avatarUrl: string;
  } | {
    provider: "x";
    postId: string;
    handle: string;
    authorName: string;
    text: string;
    publishedAt: string | null;
    capturedAt: string;
    originalMediaUrl: string | null;
    localMediaUrl: string | null;
  } | null;
};

type ProgressEvent = { step: string; label: string; detail: string };

const seedItems: Item[] = [
  {
    id: 1,
    title: "shadcn/ui",
    url: "https://ui.shadcn.com",
    description: "Componentes acessíveis que você copia para o projeto e adapta sem depender de uma biblioteca fechada.",
    imageUrl: "https://ui.shadcn.com/og?title=The%20Foundation%20for%20your%20Design%20System",
    categories: ["component", "design", "frontend"],
    tags: ["react", "tailwind"],
    kind: "component",
    status: "reviewed",
    prod: "Pronto",
    favorability: "Recomendado",
  },
  {
    id: 2,
    title: "Hono",
    url: "https://hono.dev",
    description: "Framework web pequeno e rápido que funciona em Workers, Bun, Node e outros runtimes.",
    imageUrl: "https://hono.dev/images/hono-title.png",
    categories: ["framework", "backend", "api"],
    tags: ["typescript", "edge"],
    kind: "framework",
    status: "reviewed",
    prod: "Pronto",
    favorability: "Recomendado",
  },
  {
    id: 3,
    title: "Motion",
    url: "https://motion.dev",
    description: "Biblioteca de animação para interfaces React com gestos, layout transitions e presença.",
    imageUrl: "https://images.motion.dev/og/fresh/v1/site/home-3jhn8b0abpu66.png",
    categories: ["component", "design", "frontend"],
    tags: ["animation", "react"],
    kind: "tool",
    status: "pending",
    prod: "Não revisado",
    favorability: "Não revisado",
  },
  {
    id: 4,
    title: "Valibot",
    url: "https://valibot.dev",
    description: "Schemas modulares e type-safe para validar dados em runtime com bundle pequeno.",
    imageUrl: "https://valibot.dev/og/index.png",
    categories: ["tool", "backend", "frontend"],
    tags: ["validation", "typescript"],
    kind: "tool",
    status: "reviewed",
    prod: "Pronto",
    favorability: "Recomendado",
  },
];

const stages = [
  { id: "fetch", label: "Buscar página" },
  { id: "extract", label: "Extrair conteúdo" },
  { id: "model", label: "Consultar DeepSeek" },
  { id: "validate", label: "Validar estrutura" },
  { id: "save", label: "Salvar rascunho" },
];

function IconSwap({ done, active }: { done: boolean; active: boolean }) {
  return (
    <span className="icon-swap" aria-hidden="true">
      <motion.span
        animate={{ opacity: done ? 1 : 0, scale: done ? 1 : 0.25, filter: done ? "blur(0px)" : "blur(4px)" }}
        transition={{ type: "spring", duration: 0.3, bounce: 0 }}
      >
        <Check weight="bold" />
      </motion.span>
      <motion.span
        animate={{ opacity: active ? 1 : 0, scale: active ? 1 : 0.25, filter: active ? "blur(0px)" : "blur(4px)" }}
        transition={{ type: "spring", duration: 0.3, bounce: 0 }}
      >
        <CircleNotch className="spin" weight="bold" />
      </motion.span>
      <motion.span
        animate={{ opacity: !done && !active ? 1 : 0, scale: !done && !active ? 1 : 0.25, filter: !done && !active ? "blur(0px)" : "blur(4px)" }}
        transition={{ type: "spring", duration: 0.3, bounce: 0 }}
        className="stage-dot"
      />
    </span>
  );
}

function EnrichmentPanel({ progress, error }: { progress: ProgressEvent[]; error: string | null }) {
  const activeIndex = progress.length ? stages.findIndex((stage) => stage.id === progress.at(-1)?.step) : 0;
  const last = progress.at(-1);

  return (
    <motion.div
      className="enrichment-panel"
      initial={{ opacity: 0, y: 12, filter: "blur(4px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
    >
      <div className="enrichment-heading">
        <div className="agent-mark"><Sparkle weight="fill" /></div>
        <div>
          <strong>{error ? "Algo interrompeu a análise" : last?.label || "Preparando a análise"}</strong>
          <p>{error || last?.detail || "Isso leva só alguns segundos."}</p>
        </div>
        {!error && <span className="elapsed tabular">{Math.max(1, progress.length * 2)}s</span>}
      </div>

      <div className="progress-track" aria-label="Progresso da análise">
        <motion.div
          className="progress-fill"
          animate={{ scaleX: error ? 1 : Math.max(0.05, (activeIndex + 0.45) / stages.length) }}
          transition={{ duration: 0.45, ease: [0.2, 0, 0, 1] }}
        />
      </div>

      <ol className="stage-list">
        {stages.map((stage, index) => {
          const done = index < activeIndex || progress.some((entry) => entry.step === "save") && index <= activeIndex;
          const active = index === activeIndex && !error;
          return (
            <li key={stage.id} className={active ? "active" : done ? "done" : ""}>
              <IconSwap done={done} active={active} />
              <span>{stage.label}</span>
            </li>
          );
        })}
      </ol>
    </motion.div>
  );
}

function ItemRow({ item, index, onOpen }: { item: Item; index: number; onOpen: (item: Item) => void }) {
  const host = new URL(item.url).hostname.replace("www.", "");
  const github = item.sourceMetadata?.provider === "github" ? item.sourceMetadata : null;
  const xPost = item.sourceMetadata?.provider === "x" ? item.sourceMetadata : null;
  const compactNumber = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
  return (
    <motion.article
      className="item-row"
      style={{ viewTransitionName: `item-${item.id}` }}
      initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ delay: Math.min(index * 0.055, 0.22), duration: 0.32 }}
    >
      <div className="item-visual">
        {item.imageUrl ? <img src={item.imageUrl} alt="" loading="lazy" /> : <span>{item.title.slice(0, 1).toUpperCase()}</span>}
      </div>
      <div className="item-copy">
        <div className="item-title-line">
          <h3>{item.title}</h3>
          <span className="host">{host}</span>
        </div>
        <p>{item.description}</p>
        {github && (
          <div className="repo-meta" aria-label="Metadados do GitHub">
            <span className="repo-name"><GithubLogo weight="fill" />{github.owner}/{github.repo}</span>
            <span title={`${github.stars.toLocaleString("pt-BR")} stars`}><Star weight="fill" />{compactNumber.format(github.stars)}</span>
            <span title={`${github.forks.toLocaleString("pt-BR")} forks`}><GitFork />{compactNumber.format(github.forks)}</span>
            {github.language && <span><i className="language-dot" />{github.language}</span>}
            {github.license && <span>{github.license}</span>}
            {github.archived && <span className="archived">Arquivado</span>}
          </div>
        )}
        {xPost && (
          <div className="repo-meta source-snapshot" aria-label="Snapshot local do X">
            <span className="repo-name"><XLogo weight="fill" />@{xPost.handle}</span>
            <span className="snapshot-ok"><Check weight="bold" />Capturado localmente</span>
            {xPost.publishedAt && <span>{new Date(xPost.publishedAt).toLocaleDateString("pt-BR")}</span>}
          </div>
        )}
        <div className="tag-row">
          {item.categories.map((category) => <span className="category" key={category}>{category}</span>)}
          {item.tags.slice(0, 2).map((tag) => <span className="tag" key={tag}>#{tag}</span>)}
        </div>
      </div>
      <div className="human-signals">
        <span className={item.prod === "Pronto" ? "signal positive" : "signal"}>{item.prod}</span>
        <span className={item.favorability === "Recomendado" ? "signal positive" : "signal"}>{item.favorability}</span>
      </div>
      <button className="icon-button row-action" onClick={() => onOpen(item)} aria-label={`Abrir ${item.title}`}><ArrowRight /></button>
    </motion.article>
  );
}

export function App() {
  const [items, setItems] = useState(seedItems);
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState<"add" | "settings" | "review" | null>(null);
  const [view, setView] = useState<"library" | "review" | "categories">("library");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [url, setUrl] = useState("https://ui.shadcn.com");
  const [note, setNote] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<ProgressEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState(false);
  const [configSource, setConfigSource] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [reviewProd, setReviewProd] = useState<Item["prod"]>("Não revisado");
  const [reviewFavorability, setReviewFavorability] = useState<Item["favorability"]>("Não revisado");
  const [savingReview, setSavingReview] = useState(false);
  const [deletingItem, setDeletingItem] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [itemActionError, setItemActionError] = useState<string | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const saved = localStorage.getItem("commonplace-theme");
    if (saved === "light" || saved === "dark") return saved;
    return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  useEffect(() => {
    fetch("/api/config").then((response) => response.json()).then((data) => {
      setConfigured(data.configured);
      setConfigSource(data.source);
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    fetch("/api/items").then((response) => response.json()).then((data) => setItems(data.items)).catch(() => undefined);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("commonplace-theme", theme);
  }, [theme]);

  const filtered = useMemo(() => {
    const value = query.toLowerCase();
    return items.filter((item) => {
      const matchesQuery = `${item.title} ${item.description} ${item.categories.join(" ")} ${item.tags.join(" ")}`.toLowerCase().includes(value);
      const matchesCategory = categoryFilter === "all" || item.categories.some((category) => category.toLowerCase() === categoryFilter);
      return matchesQuery && matchesCategory;
    });
  }, [items, query, categoryFilter]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      for (const category of item.categories) counts.set(category, (counts.get(category) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [items]);
  const visibleItems = view === "review" ? filtered.filter((item) => item.status === "pending") : filtered;

  async function addItem(event: FormEvent) {
    event.preventDefault();
    setRunning(true);
    setProgress([]);
    setError(null);

    try {
      const response = await fetch("/api/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, humanDescription: note || undefined }),
      });
      if (!response.ok || !response.body) throw new Error("Não foi possível iniciar a análise.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let eventName = "message";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const messages = buffer.split("\n\n");
        buffer = messages.pop() || "";

        for (const message of messages) {
          for (const line of message.split("\n")) {
            if (line.startsWith("event:")) eventName = line.slice(6).trim();
            if (!line.startsWith("data:")) continue;
            const data = JSON.parse(line.slice(5).trim());
            if (eventName === "progress") setProgress((current) => [...current, data]);
            if (eventName === "error") setError(data.message);
            if (eventName === "complete") {
              setItems((current) => [data.item, ...current]);
              window.setTimeout(() => {
                setModal(null);
                setRunning(false);
                setProgress([]);
                setNote("");
              }, 650);
            }
          }
          eventName = "message";
        }
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha inesperada.");
      setRunning(false);
    }
  }

  async function saveKey(event: FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey }),
    });
    if (response.ok) {
      setConfigured(true);
      setConfigSource("session");
      setApiKey("");
      setModal(null);
    }
  }

  function openItem(item: Item) {
    setSelectedItem(item);
    setReviewProd(item.prod);
    setReviewFavorability(item.favorability);
    setConfirmDelete(false);
    setItemActionError(null);
    setModal("review");
  }

  async function saveReview(event: FormEvent) {
    event.preventDefault();
    if (!selectedItem || reviewProd === "Não revisado" || reviewFavorability === "Não revisado") return;
    setSavingReview(true);
    try {
      const response = await fetch(`/api/items/${selectedItem.id}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prod: reviewProd, favorability: reviewFavorability }),
      });
      if (!response.ok) throw new Error("Não foi possível salvar a revisão.");
      const data = await response.json();
      setItems((current) => current.map((item) => item.id === data.item.id ? data.item : item));
      setModal(null);
      setSelectedItem(null);
    } catch (caught) {
      setItemActionError(caught instanceof Error ? caught.message : "Não foi possível salvar a revisão.");
    } finally {
      setSavingReview(false);
    }
  }

  async function removeSelectedItem() {
    if (!selectedItem) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      setItemActionError(null);
      return;
    }

    setDeletingItem(true);
    setItemActionError(null);
    try {
      const response = await fetch(`/api/items/${selectedItem.id}`, { method: "DELETE" });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || "Não foi possível remover o bookmark.");
      }
      setItems((current) => current.filter((item) => item.id !== selectedItem.id));
      setModal(null);
      setSelectedItem(null);
      setConfirmDelete(false);
    } catch (caught) {
      setItemActionError(caught instanceof Error ? caught.message : "Não foi possível remover o bookmark.");
    } finally {
      setDeletingItem(false);
    }
  }

  function changeViewMode(mode: "list" | "grid") {
    if (mode === viewMode) return;
    const transitionDocument = document as Document & {
      startViewTransition?: (callback: () => void) => { finished: Promise<void> };
    };
    if (!transitionDocument.startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setViewMode(mode);
      return;
    }
    transitionDocument.startViewTransition(() => flushSync(() => setViewMode(mode)));
  }

  const reviewCount = items.filter((item) => item.status === "pending").length;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><Checks weight="bold" /></div><span>commonplace</span></div>
        <nav>
          <button className={view === "library" ? "nav-item active" : "nav-item"} onClick={() => setView("library")}><BookOpen /><span>Biblioteca</span></button>
          <button className={view === "review" ? "nav-item active" : "nav-item"} onClick={() => setView("review")}><Queue /><span>Revisar</span><b className="count tabular">{reviewCount}</b></button>
          <button className={view === "categories" ? "nav-item active" : "nav-item"} onClick={() => setView("categories")}><GridFour /><span>Categorias</span></button>
        </nav>
        <div className="sidebar-bottom">
          <div className={configured ? "model-status online" : "model-status"}>
            <span className="status-dot" />
            <div><strong>DeepSeek</strong><small>{configured ? `conectado via ${configSource}` : "modo demonstração"}</small></div>
          </div>
          <button className="nav-item" onClick={() => setModal("settings")}><GearSix /><span>Configurações</span></button>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <button className="icon-button mobile-menu" aria-label="Abrir menu"><SidebarSimple /></button>
          <label className="search"><MagnifyingGlass /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar ferramentas, stacks e referências..." /><kbd>⌘ K</kbd></label>
          <div className="topbar-actions">
            <button className="icon-button theme-toggle" onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")} aria-label={theme === "dark" ? "Usar tema claro" : "Usar tema escuro"}>
              <span className={theme === "dark" ? "theme-icon visible" : "theme-icon"}><Sun /></span>
              <span className={theme === "light" ? "theme-icon visible" : "theme-icon"}><Moon /></span>
            </button>
            <button className="primary-button" onClick={() => setModal("add")}><Plus weight="bold" /><span>Adicionar</span></button>
          </div>
        </header>

        <section className="content">
          <div className="page-heading">
            <div>
              <h1>{view === "library" ? "Biblioteca" : view === "review" ? "Revisar" : "Categorias"}</h1>
              <p>{view === "library" ? "O que seus agentes devem conhecer antes de decidir." : view === "review" ? "Decisões que precisam de julgamento humano." : "As áreas que organizam suas referências."}</p>
            </div>
            {view !== "categories" && (
              <div className="view-toggle">
                <button className={viewMode === "list" ? "selected" : ""} onClick={() => changeViewMode("list")} aria-label="Visualização em lista" aria-pressed={viewMode === "list"}><Rows /></button>
                <button className={viewMode === "grid" ? "selected" : ""} onClick={() => changeViewMode("grid")} aria-label="Visualização em grade" aria-pressed={viewMode === "grid"}><GridFour /></button>
              </div>
            )}
          </div>
          {view === "categories" ? (
            <div className="category-grid">
              {categoryCounts.map(([category, count], index) => (
                <motion.button
                  className="category-card"
                  key={category}
                  initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  transition={{ delay: Math.min(index * .045, .22) }}
                  onClick={() => { setCategoryFilter(category.toLowerCase()); setView("library"); }}
                >
                  <span>{category}</span><b className="tabular">{count}</b><ArrowRight />
                </motion.button>
              ))}
            </div>
          ) : (
            <>
              <div className="filter-row">
                {["Todos", "Skill", "Component", "Framework", "Design", "Backend", "API"].map((filter) => {
                  const value = filter === "Todos" ? "all" : filter.toLowerCase();
                  return <button className={categoryFilter === value ? "filter active" : "filter"} onClick={() => setCategoryFilter(value)} key={filter}>{filter}</button>;
                })}
              </div>
              <div className={viewMode === "grid" ? "library-list grid-view" : "library-list"}>
                <AnimatePresence initial={false} mode="popLayout">
                  {visibleItems.map((item, index) => <ItemRow key={item.id} item={item} index={index} onOpen={openItem} />)}
                </AnimatePresence>
                {visibleItems.length === 0 && <div className="empty-filter"><MagnifyingGlass /><strong>{view === "review" ? "Tudo revisado" : "Nenhuma referência aqui"}</strong><p>{view === "review" ? "Novos itens que precisarem da sua decisão aparecerão aqui." : "Tente outra categoria ou limpe a busca."}</p></div>}
              </div>
            </>
          )}
        </section>
      </main>

      <AnimatePresence initial={false}>
        {modal && (
          <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={() => !running && !savingReview && !deletingItem && setModal(null)}>
            <motion.div className="modal" initial={{ opacity: 0, y: 12, scale: 0.98, filter: "blur(4px)" }} animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }} exit={{ opacity: 0, y: 8, scale: 0.99, filter: "blur(3px)" }} transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }} onMouseDown={(event) => event.stopPropagation()}>
              <div className="modal-header">
                <div className="modal-icon">{modal === "add" ? <LinkSimple /> : modal === "settings" ? <Code /> : <Checks />}</div>
                <div>
                  <h2>{modal === "add" ? "Adicionar referência" : modal === "settings" ? "Conectar DeepSeek" : `Revisar ${selectedItem?.title || "item"}`}</h2>
                  <p>{modal === "add" ? "A IA prepara o rascunho; você decide se confia." : modal === "settings" ? "A chave fica apenas na memória do servidor nesta sessão." : "Esses sinais são humanos e serão usados pelos seus agentes."}</p>
                </div>
                <button className="icon-button" disabled={running || savingReview || deletingItem} onClick={() => setModal(null)} aria-label="Fechar"><X /></button>
              </div>

              {modal === "add" ? (
                <form onSubmit={addItem}>
                  <div className="field"><label htmlFor="url">URL</label><div className="input-with-icon"><LinkSimple /><input id="url" type="url" required value={url} onChange={(event) => setUrl(event.target.value)} disabled={running} /></div></div>
                  <div className="field"><label htmlFor="note">Sua observação <span>opcional</span></label><textarea id="note" value={note} onChange={(event) => setNote(event.target.value)} disabled={running} placeholder="O que chamou sua atenção nessa referência?" /></div>
                  <AnimatePresence>{running && <EnrichmentPanel progress={progress} error={error} />}</AnimatePresence>
                  <div className="modal-actions"><button type="button" className="ghost-button" disabled={running} onClick={() => setModal(null)}>Cancelar</button><button className="primary-button" disabled={running}>{running ? <><CircleNotch className="spin" />Analisando</> : <>Adicionar<ArrowRight /></>}</button></div>
                </form>
              ) : modal === "settings" ? (
                <form onSubmit={saveKey}>
                  <div className="field"><label htmlFor="api-key">API key</label><input id="api-key" type="password" required minLength={8} value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="sk-••••••••••••••••" /><small>Para persistir entre reinícios, use DEEPSEEK_API_KEY no arquivo .env.</small></div>
                  <div className="security-note"><Check weight="bold" /><span>A chave não é enviada ao navegador depois de salva.</span></div>
                  <div className="modal-actions"><button type="button" className="ghost-button" onClick={() => setModal(null)}>Cancelar</button><button className="primary-button">Conectar</button></div>
                </form>
              ) : selectedItem ? (
                <form onSubmit={saveReview}>
                  <div className="review-source">
                    <div className="review-image">{selectedItem.imageUrl ? <img src={selectedItem.imageUrl} alt="" /> : <span>{selectedItem.title[0]}</span>}</div>
                    <div><strong>{selectedItem.title}</strong><small>{new URL(selectedItem.url).hostname.replace("www.", "")}</small><p>{selectedItem.description}</p>{selectedItem.sourceMetadata?.provider === "github" && <div className="repo-meta modal-repo-meta"><span><Star weight="fill" />{selectedItem.sourceMetadata.stars.toLocaleString("pt-BR")}</span><span><GitFork />{selectedItem.sourceMetadata.forks.toLocaleString("pt-BR")}</span>{selectedItem.sourceMetadata.language && <span><i className="language-dot" />{selectedItem.sourceMetadata.language}</span>}{selectedItem.sourceMetadata.license && <span>{selectedItem.sourceMetadata.license}</span>}</div>}{selectedItem.sourceMetadata?.provider === "x" && <div className="repo-meta modal-repo-meta source-snapshot"><span><XLogo weight="fill" />@{selectedItem.sourceMetadata.handle}</span><span className="snapshot-ok"><Check weight="bold" />Texto e mídia preservados</span></div>}</div>
                  </div>

                  <fieldset className="review-fieldset">
                    <legend>Está pronto para produção?</legend>
                    <div className="choice-group">
                      {(["Pronto", "Experimental"] as const).map((option) => <button type="button" className={reviewProd === option ? "choice-button selected" : "choice-button"} aria-pressed={reviewProd === option} onClick={() => setReviewProd(option)} key={option}>{option}</button>)}
                    </div>
                  </fieldset>

                  <fieldset className="review-fieldset">
                    <legend>Você recomenda?</legend>
                    <div className="choice-group three">
                      {(["Recomendado", "Neutro", "Evitar"] as const).map((option) => <button type="button" className={reviewFavorability === option ? "choice-button selected" : "choice-button"} aria-pressed={reviewFavorability === option} onClick={() => setReviewFavorability(option)} key={option}>{option}</button>)}
                    </div>
                  </fieldset>

                  <div className="review-notice"><Sparkle weight="fill" /><span>A IA não pode alterar essas duas decisões.</span></div>
                  <AnimatePresence initial={false}>
                    {(confirmDelete || itemActionError) && (
                      <motion.p className={itemActionError ? "action-feedback error" : "action-feedback"} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} role={itemActionError ? "alert" : "status"}>
                        {itemActionError || "Esta remoção é permanente e também apaga qualquer mídia local associada."}
                      </motion.p>
                    )}
                  </AnimatePresence>
                  <div className="modal-actions split">
                    <button type="button" className={confirmDelete ? "danger-button confirming" : "danger-button"} disabled={savingReview || deletingItem} onClick={removeSelectedItem}>
                      {deletingItem ? <><CircleNotch className="spin" />Removendo</> : <><Trash />{confirmDelete ? "Confirmar remoção" : "Remover bookmark"}</>}
                    </button>
                    <div className="action-group"><button type="button" className="ghost-button" disabled={savingReview || deletingItem} onClick={() => setModal(null)}>Agora não</button><button className="primary-button" disabled={savingReview || deletingItem || reviewProd === "Não revisado" || reviewFavorability === "Não revisado"}>{savingReview ? <><CircleNotch className="spin" />Salvando</> : <>Salvar revisão<Check /></>}</button></div>
                  </div>
                </form>
              ) : null}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
