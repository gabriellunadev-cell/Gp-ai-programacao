import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, KeyboardEvent } from "react";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  CirclePlay,
  Code2,
  Download,
  FileCode2,
  FileDown,
  FilePlus2,
  Folder,
  FolderOpen,
  FolderPlus,
  Hammer,
  PanelLeftClose,
  PlugZap,
  RefreshCw,
  Settings2,
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

function readSavedProject(): GPProject {
  try {
    const raw = localStorage.getItem(PROJECT_STORAGE_KEY);
    if (!raw) return starterProject;
    const value: unknown = JSON.parse(raw);
    return validateProject(value) ? value : starterProject;
  } catch {
    return starterProject;
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
  const [project, setProject] = useState<GPProject>(readSavedProject);
  const [activePath, setActivePath] = useState(project.entryFile);
  const [bridgeUrl, setBridgeUrl] = useState(
    () => localStorage.getItem("gp-bridge-url") ?? DEFAULT_BRIDGE,
  );
  const [connection, setConnection] = useState<ConnectionState>("checking");
  const [health, setHealth] = useState<BridgeHealth | null>(null);
  const [busy, setBusy] = useState(false);
  const [output, setOutput] = useState(
    "O console está pronto. Conecte o GP Bridge para compilar ou executar o projeto.",
  );
  const [outputKind, setOutputKind] = useState<OutputKind>("info");
  const [lastAction, setLastAction] = useState("Projeto aberto neste dispositivo");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<"editor" | "output">("editor");
  const importInput = useRef<HTMLInputElement>(null);

  const activeFile = project.files.find((file) => file.path === activePath) ?? project.files[0];
  const source = activeFile?.source ?? "";
  const lineCount = useMemo(() => Math.max(1, source.split("\n").length), [source]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(project));
        setLastAction("Projeto salvo neste dispositivo");
      } catch {
        setOutput("Não foi possível salvar automaticamente. Exporte o projeto para não perder as alterações.");
        setOutputKind("error");
        setActiveTab("output");
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [project]);

  async function refreshConnection(): Promise<void> {
    setConnection("checking");
    try {
      const result = await checkGpBridge(bridgeUrl.trim());
      setHealth(result);
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
          : await runGpProject(bridgeUrl, project.entryFile, project.files);
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
    const name = window.prompt("Nome do novo projeto:", "Novo projeto");
    if (!name?.trim()) return;
    const next: GPProject = {
      format: "gp-project",
      version: 1,
      name: name.trim(),
      entryFile: "principal.gp",
      files: [{ path: "principal.gp", source: 'mostrar("Olá, GP!")\n' }],
    };
    setProject(next);
    setActivePath(next.entryFile);
    setActiveTab("editor");
    setLastAction("Novo projeto criado");
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
          <a className="github-link" href="https://github.com/gabriellunadev-cell/Gp-ai-programacao" target="_blank" rel="noreferrer">GitHub</a>
        </div>
      </header>

      <div className="workbench">
        {sidebarOpen && (
          <aside className="sidebar">
            <div className="sidebar-heading"><span>PROJETO</span><button className="subtle-button" title="Fechar explorador" onClick={() => setSidebarOpen(false)}><PanelLeftClose size={15} /></button></div>
            <div className="project-root"><ChevronDown size={14} /><FolderOpen size={15} /> {project.name.toUpperCase()}</div>
            <div className="project-actions">
              <button className="subtle-button" title="Novo arquivo" onClick={createFile}><FilePlus2 size={15} /></button>
              <button className="subtle-button" title="Novo projeto" onClick={newProject}><FolderPlus size={15} /></button>
              <button className="subtle-button" title="Importar projeto" onClick={() => importInput.current?.click()}><Upload size={15} /></button>
              <button className="subtle-button" title="Exportar projeto" onClick={exportProject}><FileDown size={15} /></button>
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
                  <button className="file-row" onClick={() => { setActivePath(file.path); setActiveTab("editor"); }}>
                    <FileCode2 size={15} className="file-icon" />
                    <span title={file.path}>{file.path}</span>
                    {project.entryFile === file.path && <Star size={12} className="entry-star" fill="currentColor" />}
                  </button>
                  <div className="file-row-tools">
                    {project.entryFile !== file.path && <button className="tiny-icon-button" title="Definir como arquivo principal" onClick={() => setEntryFile(file.path)}><Star size={12} /></button>}
                    <button className="tiny-icon-button danger" title="Excluir arquivo" onClick={() => deleteFile(file.path)}><Trash2 size={12} /></button>
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
              <button className="secondary-button" onClick={downloadCurrentFile}><Download size={15} /> Arquivo</button>
              <button className="secondary-button" onClick={exportProject}><FileDown size={15} /> Exportar projeto</button>
              <button className="secondary-button" disabled={busy || connection !== "connected"} onClick={() => void execute("compile")}><Hammer size={15} /> Compilar</button>
              <button className="primary-button" disabled={busy || connection !== "connected"} onClick={() => void execute("run")}><CirclePlay size={16} /> {busy ? "Processando..." : "Executar"}</button>
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
                  value={source}
                  onChange={(event) => updateActiveSource(event.target.value)}
                  onKeyDown={handleEditorKeyDown}
                />
              </div>
              <div className="editor-footer"><span><span className="footer-dot" /> {lineCount} linhas · {project.files.length} arquivos</span><span>Português · GP</span></div>
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

      {settingsOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false); }}>
          <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <div className="modal-heading"><div><span className="eyebrow">INTEGRAÇÃO</span><h2 id="settings-title">Conexão com a linguagem GP</h2></div><button className="icon-button" aria-label="Fechar" onClick={() => setSettingsOpen(false)}><X size={18} /></button></div>
            <p>O Programinha usa o GP Bridge local. Para compilar projetos com módulos, conecte a Bridge 0.2 ou superior.</p>
            <label htmlFor="bridge-url">Endereço do GP Bridge</label>
            <input id="bridge-url" value={bridgeUrl} onChange={(event) => setBridgeUrl(event.target.value)} placeholder={DEFAULT_BRIDGE} />
            <div className="modal-actions"><button className="secondary-button" onClick={() => void refreshConnection()}><RefreshCw size={14} /> Testar agora</button><button className="primary-button" onClick={saveBridgeUrl}>Salvar conexão</button></div>
            <small>Endereço padrão: {DEFAULT_BRIDGE} · acesso somente local</small>
          </section>
        </div>
      )}
    </div>
  );
}
