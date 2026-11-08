import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  CirclePlay,
  Code2,
  Download,
  FileCode2,
  Folder,
  Hammer,
  PanelLeftClose,
  PlugZap,
  RefreshCw,
  Settings2,
  TerminalSquare,
  X,
} from "lucide-react";
import {
  checkGpBridge,
  compileGpSource,
  runGpSource,
  type BridgeHealth,
  type BridgeResult,
} from "./gpClient";

const DEFAULT_BRIDGE = import.meta.env.VITE_GP_BRIDGE_URL || "http://127.0.0.1:8765";

const examples = [
  {
    name: "principal.gp",
    label: "Meu primeiro programa",
    source: `funcao fatorial(numero n) -> numero {
    se (n <= 1) {
        retornar 1
    }
    retornar n * fatorial(n - 1)
}

mostrar("Gabriel Programming")
mostrar("Fatorial de 5:", fatorial(5))
`,
  },
  {
    name: "estruturas.gp",
    label: "Estruturas",
    source: `estrutura Pessoa {
    texto nome;
    numero idade;
}

Pessoa pessoa = Pessoa{nome: "Ada", idade: 37}
pessoa.idade = 38

mostrar("Nome:", pessoa.nome)
mostrar("Idade:", pessoa.idade)
`,
  },
  {
    name: "modulos.gp",
    label: "Funções e coleções",
    source: `funcao dobrar(numero valor) -> numero {
    retornar valor * 2
}

lista<numero> valores = [2, 4, 6, 8]
para (numero i = 0; i < tamanho(valores); i = i + 1) {
    mostrar(dobrar(valores[i]))
}
`,
  },
];

type ConnectionState = "checking" | "connected" | "disconnected";
type OutputKind = "info" | "success" | "error";

export default function App() {
  const [source, setSource] = useState(examples[0].source);
  const [fileName, setFileName] = useState(examples[0].name);
  const [bridgeUrl, setBridgeUrl] = useState(
    () => localStorage.getItem("gp-bridge-url") ?? DEFAULT_BRIDGE,
  );
  const [connection, setConnection] = useState<ConnectionState>("checking");
  const [health, setHealth] = useState<BridgeHealth | null>(null);
  const [busy, setBusy] = useState(false);
  const [output, setOutput] = useState("O console está pronto. Conecte o GP Bridge para compilar e executar.");
  const [outputKind, setOutputKind] = useState<OutputKind>("info");
  const [lastAction, setLastAction] = useState("Aguardando conexão");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<"editor" | "output">("editor");

  const lineCount = useMemo(() => Math.max(1, source.split("\n").length), [source]);

  async function refreshConnection() {
    setConnection("checking");
    try {
      const result = await checkGpBridge(bridgeUrl);
      setHealth(result);
      setConnection(result.ok ? "connected" : "disconnected");
      setLastAction(result.ok ? "GP Bridge conectado" : "Serviço GP indisponível");
    } catch {
      setHealth(null);
      setConnection("disconnected");
      setLastAction("GP Bridge desconectado");
    }
  }

  useEffect(() => {
    void refreshConnection();
    // A mudança do endereço deve disparar uma nova verificação.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridgeUrl]);

  async function execute(mode: "compile" | "run") {
    setBusy(true);
    setActiveTab("output");
    setOutputKind("info");
    setLastAction(mode === "compile" ? "Compilando..." : "Executando...");
    setOutput(mode === "compile" ? "Enviando código para o compilador GP..." : "Enviando código para o runtime GP...");
    try {
      const result: BridgeResult =
        mode === "compile"
          ? await compileGpSource(bridgeUrl, source, fileName)
          : await runGpSource(bridgeUrl, source, fileName);
      const combined = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
      setOutput(combined || (result.ok ? "Operação concluída sem saída." : "A operação falhou sem detalhes."));
      setOutputKind(result.ok ? "success" : "error");
      setLastAction(
        result.ok
          ? `${mode === "compile" ? "Compilação" : "Execução"} concluída${result.durationMs ? ` em ${result.durationMs} ms` : ""}`
          : `Falha na ${mode === "compile" ? "compilação" : "execução"} (código ${result.exitCode ?? "desconhecido"})`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro inesperado ao acessar o GP Bridge.";
      setOutput(message);
      setOutputKind("error");
      setLastAction("Falha de conexão");
      setConnection("disconnected");
    } finally {
      setBusy(false);
    }
  }

  function downloadSource() {
    const blob = new Blob([source], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName.endsWith(".gp") ? fileName : `${fileName}.gp`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function selectExample(example: (typeof examples)[number]) {
    setFileName(example.name);
    setSource(example.source);
    setActiveTab("editor");
    setLastAction(`Arquivo ${example.name} aberto`);
  }

  function saveBridgeUrl() {
    localStorage.setItem("gp-bridge-url", bridgeUrl.trim());
    setBridgeUrl(bridgeUrl.trim().replace(/\/$/, ""));
    setSettingsOpen(false);
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
          <div className="workspace-name"><Folder size={15} /> Projeto sem título <ChevronDown size={13} /></div>
        </div>
        <div className="top-actions">
          <div className={`connection-chip ${connection}`}>
            {connection === "connected" ? <CheckCircle2 size={14} /> : connection === "checking" ? <Activity size={14} className="spin" /> : <AlertCircle size={14} />}
            <span>{connection === "connected" ? "GP conectado" : connection === "checking" ? "Conectando" : "Sem conexão"}</span>
          </div>
          <button className="icon-button" aria-label="Configurações do bridge" title="Configurar GP Bridge" onClick={() => setSettingsOpen(true)}>
            <Settings2 size={18} />
          </button>
          <a className="github-link" href="https://github.com/gabriellunadev-cell/Gp-ai-programacao" target="_blank" rel="noreferrer">GitHub</a>
        </div>
      </header>

      <div className="workbench">
        {sidebarOpen && (
          <aside className="sidebar">
            <div className="sidebar-heading"><span>EXPLORADOR</span><button className="subtle-button" title="Fechar explorador" onClick={() => setSidebarOpen(false)}><PanelLeftClose size={15} /></button></div>
            <div className="project-root"><ChevronDown size={14} /><Folder size={15} /> PROJETO GP</div>
            <div className="file-list">
              {examples.map((example, index) => (
                <button key={example.name} className={`file-row ${fileName === example.name ? "selected" : ""}`} onClick={() => selectExample(example)}>
                  <FileCode2 size={15} className="file-icon" />
                  <span>{example.name}</span>
                  {index === 0 && <span className="file-dot" />}
                </button>
              ))}
            </div>
            <div className="sidebar-bottom">
              <div className="sidebar-note">
                <div className="note-icon"><PlugZap size={15} /></div>
                <div><strong>Motor GP</strong><span>{connection === "connected" ? health?.version ? `Versão ${health.version}` : "Pronto para compilar" : "Aguardando GP Bridge"}</span></div>
              </div>
              <button className="bridge-refresh" onClick={() => void refreshConnection()}><RefreshCw size={14} /> Verificar conexão</button>
            </div>
          </aside>
        )}

        <main className="main-area">
          <div className="tabbar">
            <div className="tabs">
              <button className={activeTab === "editor" ? "tab active" : "tab"} onClick={() => setActiveTab("editor")}><FileCode2 size={14} /> {fileName}</button>
              <button className={activeTab === "output" ? "tab active" : "tab"} onClick={() => setActiveTab("output")}><TerminalSquare size={14} /> Saída</button>
            </div>
            <div className="editor-actions">
              <button className="secondary-button" onClick={downloadSource}><Download size={15} /> Salvar arquivo</button>
              <button className="secondary-button" disabled={busy} onClick={() => void execute("compile")}><Hammer size={15} /> Compilar</button>
              <button className="primary-button" disabled={busy} onClick={() => void execute("run")}><CirclePlay size={16} /> {busy ? "Processando..." : "Executar"}</button>
            </div>
          </div>

          <section className="editor-heading">
            <div><span className="eyebrow">EDITOR GP</span><h1>Transforme ideias em programas.</h1><p>Escreva em GP, compile e execute pelo motor local.</p></div>
            <div className="language-pill"><span /> GP Language</div>
          </section>

          {activeTab === "editor" ? (
            <div className="editor-frame">
              <div className="editor-toolbar"><div><span className="file-type-icon">GP</span><span>{fileName}</span><span className="dirty-dot" title="Arquivo em edição" /></div><span>UTF-8&nbsp;&nbsp; · &nbsp;&nbsp;LF</span></div>
              <div className="code-editor">
                <div className="line-numbers" aria-hidden="true">{Array.from({ length: lineCount }, (_, index) => <span key={index}>{index + 1}</span>)}</div>
                <textarea
                  aria-label="Editor de código GP"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  value={source}
                  onChange={(event) => setSource(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Tab") {
                      event.preventDefault();
                      const target = event.currentTarget;
                      const start = target.selectionStart;
                      const end = target.selectionEnd;
                      const next = source.slice(0, start) + "    " + source.slice(end);
                      setSource(next);
                      requestAnimationFrame(() => target.setSelectionRange(start + 4, start + 4));
                    }
                    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                      event.preventDefault();
                      void execute("run");
                    }
                  }}
                />
              </div>
              <div className="editor-footer"><span><span className="footer-dot" /> {lineCount} linhas</span><span>Português · GP</span></div>
            </div>
          ) : (
            <section className="output-panel">
              <div className="output-title"><div><TerminalSquare size={16} /> CONSOLE DE SAÍDA</div><span className={`output-status ${outputKind}`}>{outputKind === "success" ? "Concluído" : outputKind === "error" ? "Erro" : "Informação"}</span></div>
              <pre>{output}</pre>
              <div className="output-hint">{lastAction}</div>
            </section>
          )}

          <footer className="statusbar">
            <div><span className={`status-indicator ${connection}`} /> {connection === "connected" ? "GP Bridge online" : connection === "checking" ? "Verificando serviço" : "GP Bridge offline"}</div>
            <div>{lastAction}</div>
            <div>GP Programinha <span className="status-version">v0.1.0</span></div>
          </footer>
        </main>
      </div>

      {settingsOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false); }}>
          <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <div className="modal-heading"><div><span className="eyebrow">INTEGRAÇÃO</span><h2 id="settings-title">Conexão com a linguagem GP</h2></div><button className="icon-button" aria-label="Fechar" onClick={() => setSettingsOpen(false)}><X size={18} /></button></div>
            <p>O Programinha conversa com o GP Bridge executado no mesmo dispositivo. O compilador continua no repositório da linguagem.</p>
            <label htmlFor="bridge-url">Endereço do GP Bridge</label>
            <input id="bridge-url" value={bridgeUrl} onChange={(event) => setBridgeUrl(event.target.value)} placeholder={DEFAULT_BRIDGE} />
            <div className="modal-actions"><button className="secondary-button" onClick={() => void refreshConnection()}><RefreshCw size={14} /> Testar agora</button><button className="primary-button" onClick={saveBridgeUrl}>Salvar conexão</button></div>
            <small>Endereço padrão: {DEFAULT_BRIDGE}</small>
          </section>
        </div>
      )}
    </div>
  );
}