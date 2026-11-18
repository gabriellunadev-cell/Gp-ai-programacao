# GP Programinha — Visão de produto e paridade funcional com Rork

Status: decisão de produto aprovada; implementação por etapas, ainda não concluída.

## Objetivo

Evoluir o GP Programinha de uma IDE visual da linguagem GP para uma plataforma web de desenvolvimento assistido por IA, com fluxo de trabalho inspirado na experiência da Rork: descrever uma ideia, planejar, gerar e editar um projeto, acompanhar a execução e preparar builds. A implementação será original, usando arquitetura, código e serviços próprios; não copiar código, marca, interface proprietária ou serviços internos da Rork.

## Escopo do produto

1. **Workspace e navegação**
   - Tela inicial para criar projetos por prompt ou iniciar de um template.
   - Navegação lateral para projetos, histórico, configurações e documentação.
   - Workspace responsivo para navegador e dispositivos móveis.

2. **Agente de engenharia**
   - Receber requisitos em linguagem natural.
   - Fazer perguntas apenas quando requisitos essenciais estiverem ausentes.
   - Gerar plano de implementação antes de alterações grandes.
   - Criar e editar arquivos, explicar mudanças, executar verificações e corrigir falhas.
   - Exibir progresso, arquivos alterados, logs e decisões.
   - Exigir confirmação para ações destrutivas, publicação e operações com custo externo.

3. **Ambiente de código**
   - Editor com abas, realce de sintaxe GP e linguagens auxiliares, busca, símbolos e diagnósticos.
   - Explorador de arquivos e gestão de dependências.
   - Terminal/saída de tarefas em ambiente isolado, com limites de CPU, memória, tempo e filesystem.
   - Histórico de alterações e integração Git.

4. **Preview**
   - Preview web executável e atualizável durante o desenvolvimento.
   - Visualização de estados de execução, erros e logs.
   - Simuladores ou dispositivos para Android/iOS quando houver toolchains e infraestrutura compatíveis; não prometer preview nativo antes da validação.

5. **Build, exportação e publicação**
   - Builds web e exportação de projetos.
   - Pipeline Android (APK/AAB) e iOS (projeto/build assinado) por workers adequados.
   - Gestão de artefatos, versões, logs e status de build.
   - Publicação somente após configuração de credenciais e consentimento explícito do proprietário do projeto.

## Plataformas-alvo

- Web: prioridade para a primeira experiência ponta a ponta.
- Android: alvo de primeira classe, incluindo APK/AAB quando toolchain e workers estiverem disponíveis.
- iOS: alvo de primeira classe, com builds dependentes de ambiente macOS/Xcode e assinatura Apple.
- Desktop: evolução posterior por empacotamento compatível.
- Servidores e APIs: suportar projetos backend por templates e runtimes isolados.

A plataforma deve permitir projetos GP e projetos em outras tecnologias. GP é a linguagem própria e integração nativa prioritária, mas não será imposta como única linguagem de todos os projetos.

## Arquitetura e limites entre repositórios

- **Linguagem-GP-**: sintaxe, parser, AST, compilador, GP-IR/bytecode, VMs, runtime, memória, biblioteca padrão, CLI, testes e especificações da linguagem.
- **Gp-ai-programacao (GP Programinha)**: produto web, UX, workspace, editor, projetos, agente, gestão de tarefas, preview UI e integração com provedores.
- **GP Bridge / SDK**: contrato versionado entre IDE/agentes e toolchain GP. A implementação do compilador continua no repositório da linguagem.
- Serviços de execução e build devem ser workers isolados, com API autenticada e contratos versionados; não executar código de usuário no processo principal do backend.

## Arquitetura de IA e execução híbrida

- GP continua sendo a linguagem principal e o runtime oficial dos projetos GP.
- Python pode acelerar ferramentas, automações e integrações, mas não substitui o compilador/runtime GP.
- Interop Python permanece opt-in, restrita a allowlist e sem eval/exec, imports arbitrários, shell ou acesso irrestrito a arquivos/rede.
- O agente deve usar ferramentas tipadas e auditáveis para ler, alterar e testar projetos.
- Segredos e chaves de provedores ficam no backend, nunca no bundle do navegador.

## Segurança obrigatória

- Isolamento por usuário e projeto; autorização no servidor em toda operação.
- Sandboxes efêmeros para builds e execução, com limites e encerramento garantido.
- Sem execução de comandos arbitrários no backend principal.
- Proteção contra path traversal, SSRF, abuso de recursos, dependências maliciosas e vazamento de segredos.
- Logs de auditoria sem registrar tokens ou segredos.
- Builds assinados/publicação exigem credenciais configuradas pelo usuário e confirmação explícita.
- Exportação portátil dos projetos; não depender apenas do armazenamento local do navegador.

## Fases de implementação

### Fase 0 — Fundamentos e auditoria
- Mapear a IDE atual, GP Bridge, contratos e capacidades reais.
- Definir arquitetura de backend, autenticação, persistência e execução isolada.
- Documentar ameaças e critérios de aceitação.

### Fase 1 — Workspace e projetos
- Melhorar navegação, criação de projetos, templates, arquivos, abas, busca e histórico.
- Persistência no servidor com isolamento por usuário, mantendo importação/exportação portátil.

### Fase 2 — Agente de IA
- Chat contextual por projeto, planejamento, edição de arquivos por diff e execução de testes.
- Aprovação para operações destrutivas e rastreabilidade das alterações.

### Fase 3 — Preview web
- Worker isolado para executar projetos web e disponibilizar preview seguro.
- Logs, reinício, hot reload quando suportado e tratamento de erros.

### Fase 4 — Android e iOS
- Pipeline Android com SDK/Gradle e artefatos APK/AAB.
- Pipeline iOS em macOS/Xcode com assinatura e gestão segura de certificados.
- Testes em emuladores/simuladores quando infraestrutura permitir.

### Fase 5 — Desktop, backend e publicação
- Builds desktop, projetos backend, APIs e deploys controlados.
- Catálogo de templates, integrações e observabilidade.

## Critérios de qualidade

- Typecheck, lint e build reproduzíveis em CI.
- Testes unitários e de integração para cada serviço.
- Testes ponta a ponta do fluxo: criar projeto → solicitar mudança → revisar diff → executar → visualizar preview → exportar/build.
- Testes de isolamento e autorização entre usuários.
- Nenhuma plataforma deve ser marcada como suportada sem build real e teste documentado.

## Estado atual

A branch de referência já possui uma IDE React/TypeScript/Vite, projetos GP multiarquivo, persistência local, importação/exportação e integração com GP Bridge 0.2. O agente completo, backend multiusuário, sandbox de execução, preview web integrado e pipelines Android/iOS descritos acima são metas de produto, não capacidades consideradas prontas.

## Princípio de implementação

Priorizar uma fatia vertical funcional por fase. Não reescrever a IDE inteira de uma vez, não misturar o núcleo da linguagem com a aplicação e não declarar suporte a builds ou plataformas sem evidência de execução real.
