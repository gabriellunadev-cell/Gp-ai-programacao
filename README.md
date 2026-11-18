# GP Programinha

IDE visual e ambiente de projetos da linguagem Gabriel Programming (GP), desenvolvido em React, TypeScript e Vite, com prioridade para Android e navegador.

## Arquitetura

- GP Programinha: editor, explorador de arquivos, gestão local de projetos e interface de execução.
- GP Client: cliente HTTP tipado para conversar com o Bridge.
- GP Bridge: serviço local que pertence ao repositório da linguagem e invoca o compilador oficial.
- Linguagem GP: lexer, parser, compilador, runtime e biblioteca padrão continuam exclusivamente no repositório Linguagem-GP-.

O Programinha não contém uma cópia do compilador.

## Criador de projetos por briefing — primeira etapa

A interface inclui um fluxo inicial para registrar a ideia, escolher a plataforma-alvo e criar uma estrutura GP com arquivo principal e plano comentado. A geração desta etapa é local e baseada em estrutura/template; ela não chama um modelo de IA e não gera APK/IPA nem preview web. Os alvos Web, Android e iOS são registrados como intenção do projeto enquanto os respectivos geradores e pipelines são implementados. A interface informa essas limitações antes da criação.

## Recursos do ciclo 0.2

- Projetos GP com múltiplos arquivos e caminhos relativos.
- Explorador para criar, selecionar e excluir arquivos.
- Definição do arquivo principal do projeto.
- Salvamento automático local no IndexedDB, com migração dos projetos salvos no localStorage legado e fallback quando IndexedDB não está disponível.
- Importação e exportação do formato .gp-project.json.
- Download individual de arquivos .gp.
- Compilação e execução do projeto completo por meio dos endpoints de projeto da GP Bridge 0.2.
- Atalhos Ctrl+Enter para executar e Ctrl+S para exportar o projeto.
- Validação de caminhos e limites do projeto no cliente; o Bridge realiza a validação de segurança definitiva.

O armazenamento local é deste navegador/dispositivo. Exporte o projeto para manter uma cópia independente ou transferi-lo para outro dispositivo. A IDE valida os 16 MiB de fontes do projeto; a disponibilidade efetiva de espaço continua sujeita às quotas de armazenamento do navegador.

## Desenvolvimento

Requisitos: Node.js 20 ou superior e npm.

```bash
npm install
npm run dev
```

Verificação de tipos e build:

```bash
npm run typecheck
npm run build
```

Formato de projeto e regras de importação: [GP Project Format v1](docs/GP_PROJECT_FORMAT.md).

## GP Bridge

O endereço padrão é http://127.0.0.1:8765. Execute python3 gp_ide_server.py na raiz do repositório da linguagem GP. A interface requer projectApi: true no health check, disponível na Bridge 0.2.

Veja o contrato completo em docs/GP_BRIDGE_API.md e a implementação em gp_ide_server.py no repositório da linguagem.

O serviço de planejamento do agente está documentado em [GP Agent Planner API](docs/GP_AGENT_API.md). Ele é executado separadamente, mantém as chaves no backend e, nesta etapa, somente produz planos estruturados — não executa código nem modifica arquivos.

## Visão de produto: plataforma de criação com IA

O GP Programinha evoluirá para uma plataforma de desenvolvimento assistido por IA, com experiência de workspace inspirada no fluxo da Rork, implementada com tecnologia e serviços próprios. O objetivo é permitir criar projetos por descrição em linguagem natural, planejar alterações, editar código, executar testes, acompanhar preview e gerar artefatos.

Escopo aprovado:
- Workspace com projetos, histórico, configurações e templates.
- Agente de engenharia que planeja, altera arquivos por diff, executa verificações e apresenta logs.
- Editor avançado, explorador, terminal isolado e integração Git.
- Preview web em tempo real quando suportado pelo projeto.
- Builds web, Android (APK/AAB) e iOS (ambiente macOS/Xcode e assinatura necessários).
- Evolução posterior para desktop, servidores, APIs e publicação controlada.

A primeira entrega ponta a ponta prioriza web. Android e iOS são plataformas-alvo, mas só serão anunciadas como suportadas após toolchains, workers e testes reais. Projetos poderão usar GP e outras tecnologias; GP será a linguagem própria prioritária, não uma restrição exclusiva.

A arquitetura permanece separada: o repositório Linguagem-GP- contém compilador, runtime, VMs e biblioteca; este repositório contém a plataforma, IDE, agente e UX. GP Bridge/SDK conecta os dois por contratos versionados. Python pode acelerar ferramentas e integrações, sem substituir GP. Execução de código de usuário ocorrerá em workers isolados, nunca no processo principal do backend.

Especificação, fases, segurança e critérios de aceitação: [Visão de produto e roadmap](docs/PRODUCT_VISION_RORK_PARITY.md).

## Próximas etapas

1. Validar execução real da Bridge 0.2 no Termux/Android e adicionar CI automatizado.
2. Adicionar editor com realce de sintaxe GP e diagnósticos por linha/coluna.
3. Adicionar abas, navegação de símbolos, busca no projeto e formatação.
4. Evoluir gestão de projetos para múltiplos projetos e armazenamento robusto.
5. Integrar assistente de programação opcional sem torná-lo requisito para compilar GP.

## Repositórios

- Linguagem, compilador, runtime e biblioteca: https://github.com/gabriellunadev-cell/Linguagem-GP-
- IDE GP Programinha: https://github.com/gabriellunadev-cell/Gp-ai-programacao

## Execução híbrida

O Programinha pode habilitar a execução híbrida Python + GP em Configurações. A opção é desligada por padrão e utiliza uma allowlist de funções da biblioteca padrão. Consulte docs/GP_BRIDGE_API.md para o contrato HTTP e os limites.
