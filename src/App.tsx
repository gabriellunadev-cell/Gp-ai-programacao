import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, KeyboardEvent } from "react";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  CirclePlay,
  Code2,
  Download,
  FileCode2,
  FileDown,
  FilePlus2,
  Globe,
  Monitor,
  Folder,
  FolderOpen,
  FolderPlus,
  Hammer,
  PanelLeftClose,
  PlugZap,
  RefreshCw,
  Settings2,
  Smartphone,
  Sparkles,
  Star,
  TerminalSquare,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  checkGpBridge,
  compileGpProject,
  runGpProject,
  type BridgeHealth,
  type BridgeResult,
  type GpProjectFile,
} from "./gpClient";

const DEFAULT_BRIDGE = import.meta.env.VITE_GP_BRIDGE_URL || "http://127.0.0.1:8765";
const PROJECT_STORAGE_KEY = "gp-programinha-project-v2";
const MAX_PROJECT_BYTES = 16 * 1024 * 1024;

type GPProject = {
  format: "gp-project";
  version: 1;
  name: string;
  entryFile: string;
  files: GpProjectFile[];
};

type ConnectionState = "checking" | "connected" | "disconnected";
type OutputKind = "info" | "success" | "error";
type ProjectTarget = "gp" | "web" | "android" | "ios";

const PROJECT_TARGET_LABELS: Record<ProjectTarget, string> = {
  gp: "Gabriel Programming",
  web: "Aplicação web",
  android: "Aplicativo Android",
  ios: "Aplicativo iOS",
};

function toGpComments(value: string): string {
  return value
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => "// " + line.replace(/\*\//g, "* /"))
    .join("\n");
}

function createProjectFromBrief(name: string, idea: string, target: ProjectTarget): GPProject {
  const cleanName = name.trim().slice(0, 64) || "Novo projeto";
  const cleanIdea = idea.trim().slice(0, 2000);
  const targetLabel = PROJECT_TARGET_LABELS[target];
  const plan = [
    "PLANO INICIAL DO PROJETO",
    "Nome: " + cleanName,
    "Plataforma-alvo: " + targetLabel,
    "",
    "BRIEFING",
    cleanIdea,
    "",
    "ETAPAS SUGERIDAS",
    "1. Confirmar público, problema e requisitos essenciais.",
    "2. Definir telas, fluxos e estrutura de dados.",
    "3. Implementar uma primeira entrega pequena e testável.",
    "4. Executar testes, revisar acessibilidade e segurança.",
    "5. Preparar build e publicação quando a plataforma estiver habilitada.",
    "",
    "ESTADO",
    "Este arquivo registra o briefing e um plano inicial. Não representa um build nativo.",
  ].join("\n");
  const entrySource = [
    toGpComments("Projeto: " + cleanName),
    toGpComments("Plataforma-alvo: " + targetLabel),
    toGpComments("Briefing: " + cleanIdea.replace(/\n/g, " ")),
    "",
    'mostrar("Projeto iniciado no Gabriel Programming")',
    'mostrar(' + JSON.stringify("Nome: " + cleanName) + ')',
    'mostrar(' + JSON.stringify("Plataforma-alvo: " + targetLabel) + ')',
    'mostrar("Próximo passo: detalhar requisitos e implementar a primeira funcionalidade.")',
    "",
  ].join("\n");
  return {
    format: "gp-project",
    version: 1,
    name: cleanName,
    entryFile: "app/principal.gp",
    files: [
      { path: "app/principal.gp", source: entrySource },
      { path: "docs/plano.gp", source: toGpComments(plan) + "\n" },
    ],
  };
}

const starterProject: GPProject = {
  format: "gp-project",
  version: 1,
  name: "Meu primeiro projeto",
  entryFile: "app/principal.gp",
  files: [
    {
      path: "app/principal.gp",
      source:
        'usar "lib/matematica.gp" como math\n\n' +
        'mostrar("Gabriel Programming")\n' +
        'mostrar("A resposta é:", math.somar(19, 23))\n',
    },
    {
      path: "app/lib/matematica.gp",
      source:
        "funcao somar(numero a, numero b) -> numero {\n" +
        "    retornar a + b\n" +
        "}\n",
    },
  ],
};

function validProjectPath(path: string): boolean {
  return (
    /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*\.gp$/.test(path) &&
    !path.split("/").some((part) => part === "." || part === ".." || part === "")
  );
}

function validateProject(value: unknown): value is GPProject {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<GPProject>;
  if (
    candidate.format !== "gp-project" ||
    candidate.version !== 1 ||
    typeof candidate.name !== "string" ||
    typeof candidate.entryFile !== "string" ||
    !Array.isArray(candidate.files) ||
    candidate.files.length < 1 ||
    candidate.files.length > 128
  ) {
    return false;
  }
  const paths = new Set<string>();
  let total = 0;
  for (const item of candidate.files) {
    if (
      !item ||
      typeof item.path !== "string" ||
      !validProjectPath(item.path) ||
      typeof item.source !== "string" ||
      paths.has(item.path)
    ) {
      return false;
    }
    paths.add(item.path);
    total += new TextEncoder().encode(item.source).byteLength;
    if (total > MAX_PROJECT_BYTES) return false;
  }
  return paths.has(candidate.entryFile);
}

const PROJECT_DATABASE_NAME = "gp-programinha";
const PROJECT_DATABASE_VERSION = 1;
const PROJECT_OBJECT_STORE = "projects";

function openProjectDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB não está disponível neste navegador."));
      return;
    }
    const request = window.indexedDB.open(
      PROJECT_DATABASE_NAME,
      PROJECT_DATABASE_VERSION,
    );
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(PROJECT_OBJECT_STORE)) {
        database.createObjectStore(PROJECT_OBJECT_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Falha ao abrir o banco de projetos."));
    request.onblocked = () =>
      reject(new Error("O banco de projetos está bloqueado por outra aba."));
  });
}

async function readProjectFromIndexedDB(): Promise<unknown> {
  const database = await openProjectDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(PROJECT_OBJECT_STORE, "readonly");
    const request = transaction.objectStore(PROJECT_OBJECT_STORE).get("active");
    request.onsuccess = () => {
      database.close();
      resolve(request.result);
    };
    request.onerror = () => {
      database.close();
      reject(request.error ?? new Error("Falha ao ler o projeto local."));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error ?? new Error("Leitura do projeto foi cancelada."));
    };
  });
}

async function writeProjectToIndexedDB(project: GPProject): Promise<void> {
  const database = await openProjectDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(PROJECT_OBJECT_STORE, "readwrite");
    transaction.objectStore(PROJECT_OBJECT_STORE).put(project, "active");
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("Falha ao salvar o projeto local."));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error ?? new Error("Salvamento do projeto foi cancelado."));
    };
  });
}

async function readSavedProject(): Promise<GPProject> {
  try {
    const stored: unknown = await readProjectFromIndexedDB();
    if (validateProject(stored)) return stored;
  } catch {
    // Continue with the v0.2 localStorage migration/fallback.
  }

  try {
    const raw = localStorage.getItem(PROJECT_STORAGE_KEY);
    if (raw) {
      const legacy: unknown = JSON.parse(raw);
      if (validateProject(legacy)) {
        void writeProjectToIndexedDB(legacy)
          .then(() => localStorage.removeItem(PROJECT_STORAGE_KEY))
          .catch(() => undefined);
        return legacy;
      }
    }
  } catch {
    // A clean starter project remains available when browser storage is unavailable.
  }
  return starterProject;
}

async function persistProject(project: GPProject): Promise<string> {
  try {
    await writeProjectToIndexedDB(project);
    try {
      localStorage.removeItem(PROJECT_STORAGE_KEY);
    } catch {
      // A stale legacy copy is harmless once the IndexedDB write is committed.
    }
    return "IndexedDB";
  } catch (indexedError) {
    try {
      localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(project));
      return "armazenamento local alternativo";
    } catch {
      const detail =
        indexedError instanceof Error ? " " + indexedError.message : "";
      throw new Error(
        "Não foi possível salvar automaticamente." + detail +
          " Exporte o projeto para preservar suas alterações.",
      );
    }
  }
}

function downloadText(fileName: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export default function App() {
  const [project, setProject] = useState<GPProject>(starterProject);
  const [activePath, setActivePath] = useState(starterProject.entryFile);
  const [storageReady, setStorageReady] = useState(false);
  const [bridgeUrl, setBridgeUrl] = useState(
    () => localStorage.getItem("gp-bridge-url") ?? DEFAULT_BRIDGE,
  );
  const [connection, setConnection] = useState<ConnectionState>("checking");
  const [health, setHealth] = useState<BridgeHealth | null>(null);
  const [pythonInteropEnabled, setPythonInteropEnabled] = useState(
    () => localStorage.getItem("gp-python-interop") === "true",
  );
  const [busy, setBusy] = useState(false);
  const [output, setOutput] = useState(
    "O console está pronto. Conecte o GP Bridge para compilar ou executar o projeto.",
  );
  const [outputKind, setOutputKind] = useState<OutputKind>("info");
  const [lastAction, setLastAction] = useState("Projeto aberto neste dispositivo");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [builderName, setBuilderName] = useState("");
  const [builderIdea, setBuilderIdea] = useState("");
  const [builderTarget, setBuilderTarget] = useState<ProjectTarget>("gp");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<"editor" | "output">("editor");
  const importInput = useRef<HTMLInputElement>(null);

  const activeFile = project.files.find((file) => file.path === activePath) ?? project.files[0];
  const source = activeFile?.source ?? "";
  const lineCount = useMemo(() => Math.max(1, source.split("\n").length), [source]);

  useEffect(() => {
    let cancelled = false;
    void readSavedProject().then((savedProject) => {
      if (cancelled) return;
      setProject(savedProject);
      setActivePath(savedProject.entryFile);
      setStorageReady(true);
      setLastAction("Projeto recuperado do armazenamento local");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    const timer = window.setTimeout(() => {
      void persistProject(project)
        .then((storageName) => {
          setLastAction("Projeto salvo localmente · " + storageName);
        })
        .catch((error: unknown) => {
          setOutput(
            error instanceof Error
              ? error.message
              : "Não foi possível salvar o projeto automaticamente. Exporte uma cópia.",
          );
          setOutputKind("error");
          setActiveTab("output");
        });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [project, storageReady]);

  async function refreshConnection(): Promise<void> {
    setConnection("checking");
    try {
      const result = await checkGpBridge(bridgeUrl.trim());
      setHealth(result);
      if (!result.pythonInterop?.available) {
        setPythonInteropEnabled(false);
        localStorage.removeItem("gp-python-interop");
      }
      setConnection(result.ok && result.projectApi ? "connected" : "disconnected");
      setLastAction(
        result.ok && result.projectApi
          ? "GP Bridge " + (result.bridgeVersion ?? "conectado") + " disponível"
          : "Bridge respondeu, mas não oferece a API de projetos necessária",
      );
    } catch {
      setHealth(null);
      setConnection("disconnected");
      setLastAction("GP Bridge desconectado");
    }
  }

  useEffect(() => {
    void refreshConnection();
    // A verificação é refeita sempre que o endereço muda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridgeUrl]);

  function updateActiveSource(nextSource: string): void {
    setProject((current) => ({
      ...current,
      files: current.files.map((file) =>
        file.path === activePath ? { ...file, source: nextSource } : file,
      ),
    }));
  }

  async function execute(mode: "compile" | "run"): Promise<void> {
    if (!health?.projectApi) {
      setOutput("O GP Bridge 0.2 com suporte a projetos não está conectado.");
      setOutputKind("error");
      setActiveTab("output");
      return;
    }
    setBusy(true);
    setActiveTab("output");
    setOutputKind("info");
    setLastAction(mode === "compile" ? "Compilando projeto..." : "Executando projeto...");
    setOutput(
      mode === "compile"
        ? "Enviando todos os arquivos do projeto para o compilador GP..."
        : "Enviando o projeto completo para o runtime GP...",
    );
    try {
      const result: BridgeResult =
        mode === "compile"
          ? await compileGpProject(bridgeUrl, project.entryFile, project.files)
          : await runGpProject(
              bridgeUrl,
              project.entryFile,
              project.files,
              pythonInteropEnabled,
            );
      const combined = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
      setOutput(
        combined ||
          (result.ok ? "Operação concluída sem saída." : "A operação falhou sem detalhes."),
      );
      setOutputKind(result.ok ? "success" : "error");
      setLastAction(
        result.ok
          ? (mode === "compile" ? "Compilação" : "Execução") +
            " concluída" +
            (result.durationMs ? " em " + result.durationMs + " ms" : "")
          : "Falha na " + (mode === "compile" ? "compilação" : "execução") +
            " (código " + String(result.exitCode ?? "desconhecido") + ")",
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro inesperado ao acessar o GP Bridge.";
      setOutput(message);
      setOutputKind("error");
      setLastAction("Falha na operação");
      if (error instanceof Error && "status" in error && error.status === 404) {
        setConnection("disconnected");
      }
    } finally {
      setBusy(false);
    }
  }

  function createFile(): void {
    const path = window.prompt("Caminho do novo arquivo GP:", "app/novo.gp");
    if (!path) return;
    const normalized = path.trim();
    if (!validProjectPath(normalized)) {
      window.alert("Use um caminho relativo terminado em .gp, sem segmentos . ou ..");
      return;
    }
    if (project.files.some((file) => file.path === normalized)) {
      window.alert("Já existe um arquivo com esse caminho.");
      return;
    }
    if (project.files.length >= 128) {
      window.alert("O limite do projeto é de 128 arquivos.");
      return;
    }
    setProject((current) => ({
      ...current,
      files: [...current.files, { path: normalized, source: "" }],
    }));
    setActivePath(normalized);
    setActiveTab("editor");
    setLastAction("Arquivo " + normalized + " criado");
  }

  function deleteFile(path: string): void {
    if (project.files.length <= 1) {
      window.alert("O projeto precisa manter pelo menos um arquivo GP.");
      return;
    }
    if (!window.confirm("Excluir o arquivo " + path + "?")) return;
    const nextFiles = project.files.filter((file) => file.path !== path);
    const nextEntry = project.entryFile === path ? nextFiles[0].path : project.entryFile;
    setProject((current) => ({
      ...current,
      entryFile: nextEntry,
      files: current.files.filter((file) => file.path !== path),
    }));
    if (activePath === path) setActivePath(nextEntry);
    setLastAction("Arquivo " + path + " removido");
  }

  function setEntryFile(path: string): void {
    setProject((current) => ({ ...current, entryFile: path }));
    setLastAction(path + " definido como arquivo principal");
  }

  function newProject(): void {
    setBuilderName("");
    setBuilderIdea("");
    setBuilderTarget("gp");
    setBuilderOpen(true);
  }

  function createProjectFromPrompt(): void {
    const idea = builderIdea.trim();
    if (idea.length < 12) {
      window.alert("Descreva a ideia com pelo menos 12 caracteres para preparar o projeto.");
      return;
    }
    const next = createProjectFromBrief(builderName, idea, builderTarget);
    setProject(next);
    setActivePath(next.entryFile);
    setActiveTab("editor");
    setBuilderOpen(false);
    setLastAction("Estrutura inicial criada a partir do briefing · " + PROJECT_TARGET_LABELS[builderTarget]);
  }

  function exportProject(): void {
    const safeName = project.name.toLowerCase().replace(/[^a-z0-9_-]+/g, "-") || "projeto-gp";
    downloadText(
      safeName + ".gp-project.json",
      JSON.stringify(project, null, 2),
      "application/json;charset=utf-8",
    );
    setLastAction("Projeto exportado em formato GP Project JSON");
  }

  async function importProject(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > MAX_PROJECT_BYTES + 1024 * 1024) {
        throw new Error("O arquivo de projeto excede o limite de tamanho.");
      }
      const parsed: unknown = JSON.parse(await file.text());
      if (!validateProject(parsed)) {
        throw new Error("Formato inválido. Esperado um projeto GP versão 1 com caminhos seguros.");
      }
      setProject(parsed);
      setActivePath(parsed.entryFile);
      setActiveTab("editor");
      setLastAction("Projeto " + parsed.name + " importado");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível importar o projeto.";
      setOutput(message);
      setOutputKind("error");
      setActiveTab("output");
    } finally {
      event.target.value = "";
    }
  }

  function saveBridgeUrl(): void {
    const nextUrl = bridgeUrl.trim().replace(/\/$/, "");
    if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(nextUrl)) {
      window.alert("Por segurança, informe um endereço HTTP local (localhost ou 127.0.0.1).");
      return;
    }
    localStorage.setItem("gp-bridge-url", nextUrl);
    setBridgeUrl(nextUrl);
    setSettingsOpen(false);
  }

  function downloadCurrentFile(): void {
    const fileName = activeFile?.path.split("/").pop() ?? "principal.gp";
    downloadText(fileName, source, "text/plain;charset=utf-8");
  }

  function handleEditorKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    const target = event.currentTarget;
    if (event.key === "Tab") {
      event.preventDefault();
      const start = target.selectionStart;
      const end = target.selectionEnd;
      updateActiveSource(source.slice(0, start) + "    " + source.slice(end));
      window.requestAnimationFrame(() => target.setSelectionRange(start + 4, start + 4));
    }
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      void execute("run");
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      exportProject();
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <button className="icon-button mobile-only" aria-label="Alternar explorador" onClick={() => setSidebarOpen(!sidebarOpen)}>
            <PanelLeftClose size={18} />
          </button>
          <div className="brand-mark"><Code2 size={19} strokeWidth={2.5} /></div>
          <div className="brand-copy">
            <strong>GP <span>Programinha</span></strong>
            <small>Gabriel Programming</small>
          </div>
          <div className="top-separator" />
          <div className="workspace-name"><Folder size={15} /> {project.name} <ChevronDown size={13} /></div>
        </div>
        <div className="top-actions">
          <div className={"connection-chip " + connection}>
            {connection === "connected" ? <CheckCircle2 size={14} /> : connection === "checking" ? <Activity size={14} className="spin" /> : <AlertCircle size={14} />}
            <span>{connection === "connected" ? "GP conectado" : connection === "checking" ? "Conectando" : "Sem conexão"}</span>
          </div>
          <button className="icon-button" aria-label="Configurações do Bridge" title="Configurar GP Bridge" onClick={() => setSettingsOpen(true)}>
            <Settings2 size={18} />
          </button>
          <button className="primary-button header-create-button" onClick={newProject}><Sparkles size={14} /> Criar projeto</button>
          <a className="github-link" href="https://github.com/gabriellunadev-cell/Gp-ai-programacao" target="_blank" rel="noreferrer">GitHub</a>
        </div>
      </header>

      <div className="workbench">
        {sidebarOpen && (
          <aside className="sidebar">
            <div className="sidebar-heading"><span>PROJETO</span><button className="subtle-button" title="Fechar explorador" onClick={() => setSidebarOpen(false)}><PanelLeftClose size={15} /></button></div>
            <div className="project-root"><ChevronDown size={14} /><FolderOpen size={15} /> {project.name.toUpperCase()}</div>
            <div className="project-actions">
              <button className="subtle-button" title="Novo arquivo" disabled={!storageReady} onClick={createFile}><FilePlus2 size={15} /></button>
              <button className="subtle-button" title="Novo projeto" disabled={!storageReady} onClick={newProject}><FolderPlus size={15} /></button>
              <button className="subtle-button" title="Importar projeto" disabled={!storageReady} onClick={() => importInput.current?.click()}><Upload size={15} /></button>
              <button className="subtle-button" title="Exportar projeto" disabled={!storageReady} onClick={exportProject}><FileDown size={15} /></button>
            </div>
            <input
              ref={importInput}
              type="file"
              accept=".json,.gp-project.json,application/json"
              className="hidden-file-input"
              onChange={(event) => void importProject(event)}
            />
            <div className="file-list">
              {project.files.map((file) => (
                <div key={file.path} className={"file-row-wrap " + (activePath === file.path ? "selected" : "")}>
                  <button className="file-row" disabled={!storageReady} onClick={() => { setActivePath(file.path); setActiveTab("editor"); }}>
                    <FileCode2 size={15} className="file-icon" />
                    <span title={file.path}>{file.path}</span>
                    {project.entryFile === file.path && <Star size={12} className="entry-star" fill="currentColor" />}
                  </button>
                  <div className="file-row-tools">
                    {project.entryFile !== file.path && <button className="tiny-icon-button" disabled={!storageReady} title="Definir como arquivo principal" onClick={() => setEntryFile(file.path)}><Star size={12} /></button>}
                    <button className="tiny-icon-button danger" disabled={!storageReady} title="Excluir arquivo" onClick={() => deleteFile(file.path)}><Trash2 size={12} /></button>
                  </div>
                </div>
              ))}
            </div>
            <div className="sidebar-bottom">
              <div className="sidebar-note">
                <div className="note-icon"><PlugZap size={15} /></div>
                <div><strong>Motor GP</strong><span>{connection === "connected" ? "Bridge " + (health?.bridgeVersion ?? "0.2") + " · GP " + (health?.version ?? "0.8.x") : "Aguardando GP Bridge 0.2"}</span></div>
              </div>
              <button className="bridge-refresh" onClick={() => void refreshConnection()}><RefreshCw size={14} /> Verificar conexão</button>
            </div>
          </aside>
        )}

        <main className="main-area">
          <div className="tabbar">
            <div className="tabs">
              <button className={activeTab === "editor" ? "tab active" : "tab"} onClick={() => setActiveTab("editor")}><FileCode2 size={14} /> {activeFile?.path ?? "principal.gp"}</button>
              <button className={activeTab === "output" ? "tab active" : "tab"} onClick={() => setActiveTab("output")}><TerminalSquare size={14} /> Saída</button>
            </div>
            <div className="editor-actions">
              <button className="secondary-button" disabled={!storageReady} onClick={downloadCurrentFile}><Download size={15} /> Arquivo</button>
              <button className="secondary-button" disabled={!storageReady} onClick={exportProject}><FileDown size={15} /> Exportar projeto</button>
              <button className="secondary-button" disabled={!storageReady || busy || connection !== "connected"} onClick={() => void execute("compile")}><Hammer size={15} /> Compilar</button>
              <button className="primary-button" disabled={!storageReady || busy || connection !== "connected"} onClick={() => void execute("run")}><CirclePlay size={16} /> {busy ? "Processando..." : "Executar"}</button>
            </div>
          </div>

          <section className="editor-heading">
            <div><span className="eyebrow">EDITOR GP · PROJETO MULTIARQUIVOS</span><h1>Transforme ideias em programas.</h1><p>Organize módulos GP, compile e execute o projeto completo pelo motor local.</p></div>
            <div className="language-pill"><span /> GP Language</div>
          </section>

          {activeTab === "editor" ? (
            <div className="editor-frame">
              <div className="editor-toolbar">
                <div><span className="file-type-icon">GP</span><span>{activeFile?.path ?? "principal.gp"}</span>{project.entryFile === activeFile?.path && <span className="entry-label">ARQUIVO PRINCIPAL</span>}</div>
                <span>UTF-8&nbsp;&nbsp; · &nbsp;&nbsp;LF</span>
              </div>
              <div className="code-editor">
                <div className="line-numbers" aria-hidden="true">{Array.from({ length: lineCount }, (_, index) => <span key={index}>{index + 1}</span>)}</div>
                <textarea
                  aria-label="Editor de código GP"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  disabled={!storageReady}
                  value={source}
                  onChange={(event) => updateActiveSource(event.target.value)}
                  onKeyDown={handleEditorKeyDown}
                />
              </div>
              <div className="editor-footer"><span><span className="footer-dot" /> {storageReady ? lineCount + " linhas · " + project.files.length + " arquivos" : "Carregando projeto local..."}</span><span>Português · GP</span></div>
            </div>
          ) : (
            <section className="output-panel">
              <div className="output-title"><div><TerminalSquare size={16} /> CONSOLE DE SAÍDA</div><span className={"output-status " + outputKind}>{outputKind === "success" ? "Concluído" : outputKind === "error" ? "Erro" : "Informação"}</span></div>
              <pre>{output}</pre>
              <div className="output-hint">{lastAction}</div>
            </section>
          )}

          <footer className="statusbar">
            <div><span className={"status-indicator " + connection} /> {connection === "connected" ? "GP Bridge online" : connection === "checking" ? "Verificando serviço" : "GP Bridge offline"}</div>
            <div>{lastAction}</div>
            <div>GP Programinha <span className="status-version">v0.2.0</span></div>
          </footer>
        </main>
      </div>

      {builderOpen && (
        <div className="modal-backdrop builder-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setBuilderOpen(false); }}>
          <section className="builder-modal" role="dialog" aria-modal="true" aria-labelledby="builder-title">
            <div className="modal-heading">
              <div>
                <span className="eyebrow">NOVO PROJETO · GP BUILDER</span>
                <h2 id="builder-title">O que vamos construir?</h2>
                <p>Comece com uma ideia. O Programinha prepara um projeto GP e registra o briefing para orientar a implementação.</p>
              </div>
              <button className="icon-button" aria-label="Fechar criador" onClick={() => setBuilderOpen(false)}><X size={18} /></button>
            </div>
            <div className="builder-grid">
              <div className="builder-form">
                <label htmlFor="builder-name">Nome do projeto</label>
                <input id="builder-name" value={builderName} maxLength={64} onChange={(event) => setBuilderName(event.target.value)} placeholder="Ex.: Meu aplicativo de tarefas" />
                <label htmlFor="builder-idea">Descreva seu aplicativo ou sistema</label>
                <textarea id="builder-idea" rows={6} maxLength={2000} value={builderIdea} onChange={(event) => setBuilderIdea(event.target.value)} placeholder="Quero criar um aplicativo para organizar tarefas, com cadastro de usuários, calendário, notificações e um painel simples..." />
                <div className="builder-counter">{builderIdea.length}/2000 caracteres</div>
                <span className="builder-label">PLATAFORMA-ALVO</span>
                <div className="target-options">
                  <button type="button" className={builderTarget === "gp" ? "target-option selected" : "target-option"} onClick={() => setBuilderTarget("gp")}><Code2 size={17} /><span>GP</span><small>Projeto GP</small></button>
                  <button type="button" className={builderTarget === "web" ? "target-option selected" : "target-option"} onClick={() => setBuilderTarget("web")}><Globe size={17} /><span>Web</span><small>Planejamento</small></button>
                  <button type="button" className={builderTarget === "android" ? "target-option selected" : "target-option"} onClick={() => setBuilderTarget("android")}><Smartphone size={17} /><span>Android</span><small>Planejamento</small></button>
                  <button type="button" className={builderTarget === "ios" ? "target-option selected" : "target-option"} onClick={() => setBuilderTarget("ios")}><Monitor size={17} /><span>iOS</span><small>Planejamento</small></button>
                </div>
                <div className="builder-disclaimer"><AlertCircle size={15} /><span>Nesta etapa, o briefing e a estrutura GP são preparados localmente. A geração por modelo de IA, o preview web e os builds Android/iOS serão conectados em fases próprias; ainda não há build nativo nesta ação.</span></div>
                <div className="builder-actions">
                  <button className="secondary-button" onClick={() => setBuilderOpen(false)}>Cancelar</button>
                  <button className="primary-button" disabled={builderIdea.trim().length < 12} onClick={createProjectFromPrompt}>Criar estrutura <ArrowRight size={15} /></button>
                </div>
              </div>
              <aside className="builder-preview">
                <div className="preview-kicker"><Sparkles size={15} /> PLANO INICIAL</div>
                <h3>{builderName.trim() || "Seu novo projeto"}</h3>
                <p>{builderIdea.trim() || "O briefing aparecerá aqui enquanto você descreve sua ideia."}</p>
                <div className="preview-step"><span>01</span><div><strong>Entender requisitos</strong><small>Objetivo, público e necessidades</small></div></div>
                <div className="preview-step"><span>02</span><div><strong>Desenhar a solução</strong><small>Telas, fluxos e dados</small></div></div>
                <div className="preview-step"><span>03</span><div><strong>Implementar e validar</strong><small>Primeira entrega testável</small></div></div>
                <div className="preview-target">Destino: <strong>{PROJECT_TARGET_LABELS[builderTarget]}</strong></div>
              </aside>
            </div>
          </section>
        </div>
      )}
      {settingsOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false); }}>
          <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <div className="modal-heading"><div><span className="eyebrow">INTEGRAÇÃO</span><h2 id="settings-title">Conexão com a linguagem GP</h2></div><button className="icon-button" aria-label="Fechar" onClick={() => setSettingsOpen(false)}><X size={18} /></button></div>
            <p>O Programinha usa o GP Bridge local. Para compilar projetos com módulos, conecte a Bridge 0.2 ou superior.</p>
            <label htmlFor="bridge-url">Endereço do GP Bridge</label>
            <input id="bridge-url" value={bridgeUrl} onChange={(event) => setBridgeUrl(event.target.value)} placeholder={DEFAULT_BRIDGE} />
            <div className="python-interop-setting">
              <div className="python-interop-copy">
                <strong>Execução híbrida Python + GP</strong>
                <span>
                  {health?.pythonInterop?.available
                    ? "Permite chamadas à lista segura de funções Python. Limite de " +
                      health.pythonInterop.maxCallsPerRun +
                      " chamadas por execução."
                    : "Conecte uma GP Bridge atualizada para habilitar esta opção."}
                </span>
              </div>
              <label className="python-interop-toggle" htmlFor="python-interop">
                <input
                  id="python-interop"
                  type="checkbox"
                  checked={pythonInteropEnabled}
                  disabled={!health?.pythonInterop?.available}
                  onChange={(event) => {
                    const enabled = event.target.checked;
                    setPythonInteropEnabled(enabled);
                    localStorage.setItem("gp-python-interop", String(enabled));
                  }}
                />
                <span>{pythonInteropEnabled ? "Ativada" : "Desativada"}</span>
              </label>
            </div>
            <p className="python-interop-note">
              Desativada por padrão. Não habilita eval, importação livre de módulos, shell, arquivos ou rede.
            </p>
            <div className="modal-actions"><button className="secondary-button" onClick={() => void refreshConnection()}><RefreshCw size={14} /> Testar agora</button><button className="primary-button" onClick={saveBridgeUrl}>Salvar conexão</button></div>
            <small>Endereço padrão: {DEFAULT_BRIDGE} · acesso somente local</small>
          </section>
        </div>
      )}
    </div>
  );
}
