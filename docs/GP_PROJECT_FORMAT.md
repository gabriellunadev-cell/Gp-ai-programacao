# Formato de projeto GP — v1

O GP Programinha usa o formato JSON `.gp-project.json` para exportar, importar e transportar um projeto com vários arquivos. O arquivo é independente do compilador e pode ser usado por outras ferramentas GP.

## Estrutura

```json
{
  "format": "gp-project",
  "version": 1,
  "name": "Meu projeto",
  "entryFile": "app/principal.gp",
  "files": [
    {
      "path": "app/principal.gp",
      "source": "usar \"lib/matematica.gp\" como math\nmostrar(math.somar(20, 22))"
    },
    {
      "path": "app/lib/matematica.gp",
      "source": "funcao somar(numero a, numero b) -> numero {\n    retornar a + b\n}"
    }
  ]
}
```

## Campos

| Campo | Tipo | Regra |
|---|---|---|
| `format` | texto | Deve ser `gp-project`. |
| `version` | inteiro | Versão do formato; atualmente `1`. |
| `name` | texto | Nome de exibição do projeto. |
| `entryFile` | texto | Caminho relativo para o arquivo principal, presente em `files`. |
| `files` | lista | De 1 a 128 arquivos, cada um com `path` e `source`. |
| `files[].path` | texto | Caminho relativo, terminado em `.gp`, sem segmentos vazios, `.` ou `..`. |
| `files[].source` | texto | Fonte GP UTF-8 do arquivo. |

## Limites

- Até 128 arquivos.
- Máximo de 4 MiB UTF-8 por arquivo.
- Máximo de 16 MiB UTF-8 somados nas fontes.
- Caminhos de arquivo usam caracteres ASCII alfanuméricos, `_`, `-`, `.` e `/`.
- Caminhos duplicados e arquivo principal ausente tornam o projeto inválido.

Os limites do formato são validados no Programinha e novamente no GP Bridge. O corpo HTTP pode ter limite próprio por causa do envelope JSON e de caracteres escapados.

## Imports e resolução de módulos

Os imports GP são relativos ao diretório do arquivo que contém a declaração `usar`. Por exemplo, `app/principal.gp` pode importar `lib/matematica.gp`, cujo caminho no projeto será `app/lib/matematica.gp`.

Todos os módulos alcançáveis pelo arquivo principal precisam estar incluídos em `files`. O GP Bridge rejeita imports absolutos, caminhos que escapem da raiz do projeto, barras invertidas e módulos ausentes, inclusive quando o import acontece dentro de outro módulo.

## Persistência e compatibilidade

- A IDE armazena o projeto ativo localmente usando IndexedDB quando disponível.
- Projetos salvos pelo armazenamento legado `localStorage` são lidos e migrados para IndexedDB; existe fallback quando IndexedDB não está disponível.
- A persistência local é específica do navegador/dispositivo e está sujeita às quotas do navegador. Exportar `.gp-project.json` continua sendo a forma portátil de backup e transferência.
- Alterações incompatíveis no schema devem incrementar `version`. Um cliente deve rejeitar versões que não conhece em vez de reinterpretar silenciosamente os dados.

## Repositórios

- Implementação do editor: https://github.com/gabriellunadev-cell/Gp-ai-programacao
- Linguagem e GP Bridge: https://github.com/gabriellunadev-cell/Linguagem-GP-
