# Contrato HTTP — GP Bridge

O GP Programinha é somente um cliente. O serviço que invoca o compilador pertence ao repositório da linguagem GP.

## Endereço padrão

`http://127.0.0.1:8765`

O servidor deve escutar exclusivamente em loopback (`127.0.0.1` ou `::1`). Não deve ser exposto na rede local nem na internet por padrão.

## Segurança obrigatória

- Aceitar conexões apenas de loopback.
- Aplicar allowlist de origem CORS ao endereço de desenvolvimento do Programinha e à origem de produção configurada.
- Limitar o corpo JSON a 1 MiB nesta primeira versão.
- Validar `fileName` como nome simples; nunca aceitar caminho arbitrário enviado pelo navegador.
- Criar diretório temporário isolado por requisição e removê-lo ao concluir.
- Invocar o compilador com lista de argumentos, sem shell e sem interpolação de comandos.
- Aplicar timeout de compilação/execução e devolver código de saída.
- Não disponibilizar leitura arbitrária de arquivos, shell remoto, variáveis de ambiente ou credenciais.
- Não habilitar endpoints de administração.

## GET /api/health

Resposta:

```json
{
  "ok": true,
  "service": "gp-bridge",
  "version": "0.8.x",
  "compilerAvailable": true
}
```

## POST /api/compile

Corpo:

```json
{
  "fileName": "principal.gp",
  "source": "mostrar(\"Olá GP\")"
}
```

Resposta:

```json
{
  "ok": true,
  "stdout": "",
  "stderr": "",
  "exitCode": 0,
  "durationMs": 18,
  "diagnostics": []
}
```

A compilação deve usar o frontend/CLI oficial do repositório da linguagem e gerar artefatos apenas dentro do diretório temporário. A primeira implementação pode usar o backend de referência; o tipo de backend deve ser explícito.

## POST /api/run

Corpo:

```json
{
  "fileName": "principal.gp",
  "source": "mostrar(\"Olá GP\")",
  "runtime": "reference"
}
```

Resposta tem o mesmo formato de `/api/compile`, com stdout/stderr da execução e código de saída real.

## Erros

Usar HTTP 400 para entrada inválida, 413 para corpo acima do limite, 408 para timeout e 500 para falha interna. Respostas de erro devem seguir:

```json
{
  "ok": false,
  "error": "Descrição segura e útil do erro"
}
```

Nunca retornar stack trace, caminho absoluto interno ou segredos ao navegador.

## Compatibilidade

O contrato é versionado junto ao Programinha. Mudanças incompatíveis devem introduzir `/api/v2` ou um campo de versão negociada no health check. O cliente não deve alegar compilação/execução bem-sucedida quando o Bridge estiver indisponível.
