# GP Programinha

Ambiente de desenvolvimento visual da linguagem **Gabriel Programming (GP)**, pensado primeiro para Android e navegador, sem acoplar o editor ao compilador.

## Objetivo

Oferecer um ambiente simples e extensível para criar, editar, compilar e executar projetos GP. O aplicativo é um cliente do GP Bridge; a implementação da linguagem, compilador, runtime e biblioteca padrão permanece no repositório [Linguagem-GP-](https://github.com/gabriellunadev-cell/Linguagem-GP-).

## Arquitetura

- **Interface:** React + TypeScript + Vite, responsiva e instalável como PWA em evolução.
- **Editor:** editor de código isolado da camada de execução.
- **GP Client:** cliente HTTP tipado para conversar com o serviço local da linguagem.
- **GP Bridge:** serviço local executado junto à instalação da GP. A API está especificada em `docs/GP_BRIDGE_API.md`.
- **Separação:** este repositório não copia nem mantém uma segunda implementação do compilador.

## Estado inicial

O repositório começa com um shell funcional de IDE: explorador de arquivos de exemplo, editor, ações de compilar/executar, painel de saída, verificação de conexão e download do arquivo atual. As ações de compilação e execução dependem do GP Bridge no endereço local configurado. O aplicativo informa claramente quando o serviço não está disponível; não simula uma compilação bem-sucedida.

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

## Integração com a linguagem

Consulte [GP Bridge API](docs/GP_BRIDGE_API.md). O endpoint padrão é `http://127.0.0.1:8765`. O serviço deve escutar somente em loopback, limitar o tamanho das fontes e executar o compilador em diretório temporário isolado.

## Direção de evolução

1. Concluir e testar o GP Bridge no repositório da linguagem.
2. Substituir a área de texto pelo editor com realce da sintaxe GP.
3. Implementar abertura/salvamento de projetos e múltiplos arquivos.
4. Integrar diagnósticos, navegação de símbolos e biblioteca padrão.
5. Adicionar assistente de programação opcional sem torná-lo requisito para compilar GP.

## Repositórios relacionados

- Linguagem, compilador, runtime e biblioteca: https://github.com/gabriellunadev-cell/Linguagem-GP-
- Aplicativo GP Programinha: https://github.com/gabriellunadev-cell/Gp-ai-programacao
