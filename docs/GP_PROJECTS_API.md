# GP Projects API v0.1

Status: backend implementado e testado; ainda não integrado à interface nem instalado como serviço público.

## Responsabilidade

A API fornece persistência de projetos GP no servidor. O ID do usuário é obtido exclusivamente pela validação do access token no Supabase Auth (GET /auth/v1/user). IDs enviados pelo navegador nunca definem o proprietário do projeto.

O armazenamento inicial usa diretórios privados por UUID de usuário em PROJECTS_DATA_DIR. Cada registro tem UUID próprio, revisão incremental e timestamps. Arquivos são gravados por substituição atômica, com permissões restritas no filesystem. O serviço não usa a chave service_role do Supabase e não executa código dos projetos.

## Configuração

Defina no ambiente do serviço: SUPABASE_URL, SUPABASE_ANON_KEY, PROJECTS_HOST=127.0.0.1, PROJECTS_PORT=18788, PROJECTS_DATA_DIR=/var/lib/gp-programinha/projects e PROJECTS_ALLOWED_ORIGINS.

A SUPABASE_ANON_KEY é a chave pública anon. O access token de cada usuário é validado em cada chamada. Não configure service_role. Não coloque access tokens ou chaves privadas no bundle Vite.

## Endpoints

Todas as rotas, exceto health e preflight CORS, exigem Authorization: Bearer <supabase_access_token>.

- GET /api/projects/health — status não sensível do serviço.
- GET /api/projects — lista somente projetos do usuário autenticado.
- POST /api/projects — cria um projeto.
- GET /api/projects/:id — consulta projeto pertencente ao usuário.
- PUT /api/projects/:id — substitui conteúdo, exigindo If-Match: "revision".
- DELETE /api/projects/:id — remove projeto, exigindo If-Match: "revision".

Formato de escrita: objeto JSON com name, entryFile e files; cada arquivo contém path e source.

## Limites e segurança

- 100 projetos por usuário; 128 arquivos por projeto.
- 4 MiB por arquivo e 16 MiB de fontes por projeto; corpo HTTP limitado a 18 MiB.
- Caminhos relativos terminados em .gp; segmentos . e .., caminhos absolutos e duplicados são rejeitados.
- Rate limit de 60 solicitações por minuto por IP e CORS por allowlist.
- Sessões inválidas recebem 401; falhas do serviço de identidade falham fechadas.
- If-Match impede sobrescrita silenciosa: revisão divergente recebe 412.
- Consultas a IDs de outros usuários retornam 404, sem revelar se o projeto existe.
- O backend nunca aceita ownerId do cliente para definir propriedade.

## Limitações conhecidas

- A integração React ainda usa IndexedDB/localStorage; esta API ainda não foi ligada à interface.
- O armazenamento é local ao filesystem de um único servidor. Para múltiplas réplicas, alta disponibilidade ou backup transacional, migrar para Postgres com RLS antes de escalar.
- O diretório precisa ser criado e protegido pelo operador, fora do repositório.
- A API permanece em loopback e não está publicada; domínio, proxy e credenciais ainda não foram configurados.
- Ainda não existe fluxo de login/cadastro na interface.
