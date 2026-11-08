# Contrato HTTP — GP Bridge

O GP Programinha é um cliente independente. A implementação do compilador, runtime e biblioteca pertence ao repositório da linguagem GP.

## Endereço e segurança

- Endereço padrão: http://127.0.0.1:8765
- O servidor deve escutar exclusivamente em loopback.
- O Bridge valida Host e CORS, usa lista de argumentos sem shell e executa em workspace temporário.
- Não deve ser publicado na rede local ou na internet.
- Não existem endpoints de shell, leitura arbitrária de arquivos, administração ou acesso a credenciais.

## GET /api/health

A resposta identifica as versões e os recursos:

```json
{
  "ok": true,
  "service": "gp-bridge",
  "version": "0.8.52",
  "bridgeVersion": "0.2",
  "compilerAvailable": true,
  "projectApi": true,
  "limits": { "files": 128, "fileBytes": 4194304, "projectBytes": 16777216 }
}
```

## API de arquivo único

POST /api/compile e POST /api/run recebem um objeto com fileName e source; /api/run também aceita runtime com o valor reference.

A API de arquivo único aceita somente fontes sem imports. Fontes que usam módulos devem ser enviadas à API de projeto para que o Bridge receba e valide todo o grafo.

## API de projeto

POST /api/compile-project e POST /api/run-project recebem:

```json
{
  "entryFile": "app/principal.gp",
  "files": [
    {
      "path": "app/principal.gp",
      "source": "usar \"lib/matematica.gp\" como math\\nmostrar(math.somar(19, 23))"
    },
    {
      "path": "app/lib/matematica.gp",
      "source": "funcao somar(numero a, numero b) -> numero {\\n    retornar a + b\\n}"
    }
  ]
}
```

entryFile identifica o arquivo de entrada. Cada item de files contém um caminho relativo e sua fonte GP. Imports são resolvidos em relação ao arquivo que os declara, seguindo as regras do compilador GP.

O Bridge rejeita caminhos absolutos, caminhos enviados com segmentos vazios, ponto ou ponto-ponto, caminhos fora do workspace, imports absolutos, barras invertidas, módulos ausentes e imports que escapem da raiz do projeto. A validação também percorre os imports dos módulos alcançáveis a partir do arquivo principal.

## Limites operacionais

- Corpo HTTP: 20 MiB.
- Arquivos por projeto: 1 a 128.
- Fonte por arquivo: 4 MiB.
- Fontes somadas: 16 MiB.
- Timeout de compilação: 30 segundos.
- Timeout de execução: 10 segundos.
- Limite da VM de referência: 1.000.000 de instruções.

## Resposta

As operações retornam ok, stdout, stderr, exitCode e durationMs. Erros de entrada usam HTTP 400; limites excedidos usam HTTP 413; erros internos não expõem stack trace, caminhos absolutos ou segredos.

A Bridge 0.2 não altera a linguagem, que permanece GP 0.8.52. A execução usa a VM Python de referência. Runtime nativo, depuração interativa e serviços de pacotes não fazem parte deste contrato.
