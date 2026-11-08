# GP Programinha

IDE visual e ambiente de projetos da linguagem Gabriel Programming (GP), desenvolvido em React, TypeScript e Vite, com prioridade para Android e navegador.

## Arquitetura

- GP Programinha: editor, explorador de arquivos, gestão local de projetos e interface de execução.
- GP Client: cliente HTTP tipado para conversar com o Bridge.
- GP Bridge: serviço local que pertence ao repositório da linguagem e invoca o compilador oficial.
- Linguagem GP: lexer, parser, compilador, runtime e biblioteca padrão continuam exclusivamente no repositório Linguagem-GP-.

O Programinha não contém uma cópia do compilador.

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

## Próximas etapas

1. Validar execução real da Bridge 0.2 no Termux/Android e adicionar CI automatizado.
2. Adicionar editor com realce de sintaxe GP e diagnósticos por linha/coluna.
3. Adicionar abas, navegação de símbolos, busca no projeto e formatação.
4. Evoluir gestão de projetos para múltiplos projetos e armazenamento robusto.
5. Integrar assistente de programação opcional sem torná-lo requisito para compilar GP.

## Repositórios

- Linguagem, compilador, runtime e biblioteca: https://github.com/gabriellunadev-cell/Linguagem-GP-
- IDE GP Programinha: https://github.com/gabriellunadev-cell/Gp-ai-programacao
