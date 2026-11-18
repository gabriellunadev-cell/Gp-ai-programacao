# GP Agent Planner — API v0.1

Serviço Node.js sem dependências externas para planejar projetos com um provedor compatível com OpenAI Chat Completions.

## Escopo atual

- Planejamento de requisitos e milestones.
- Resposta JSON normalizada e validada.
- Autenticação Bearer, CORS por allowlist e limite de 12 req/min por IP.
- Corpo limitado a 32 KiB e timeout de 25 segundos.
- Segredos mantidos somente no backend.
- Não executa código, comandos, ferramentas nem altera arquivos.

## Endpoints

GET /api/agent/health informa capacidades e estados booleanos sem expor segredos.

POST /api/agent/plan recebe Authorization: Bearer <AGENT_API_TOKEN> e JSON:

```json
{
  "projectName": "Meu projeto",
  "target": "gp",
  "prompt": "Descreva a aplicação e os requisitos desejados.",
  "context": "Contexto opcional."
}
```

A resposta contém summary, assumptions, questions, milestones, files, risks e acceptanceCriteria. Caminhos de arquivo são relativos e validados. A resposta é somente um plano; não representa execução.

## Configuração

Copie .env.example para .env e configure:

- AGENT_HOST=127.0.0.1
- AGENT_PORT=18787
- AGENT_API_TOKEN=<segredo forte>
- AGENT_ALLOWED_ORIGINS=<origens exatas separadas por vírgula>
- AI_BASE_URL=https://api.openai.com/v1
- AI_API_KEY=<chave do provedor>
- AI_MODEL=<modelo habilitado>

Não faça commit de .env e nunca coloque chaves no frontend. O serviço escuta somente em loopback por padrão. Exposição por proxy reverso exige configuração consciente de autenticação, TLS e origens.

## Executar e testar

```bash
npm run agent:dev
npm run test:agent
```

Os testes usam um provedor mock e não exigem chave externa.
