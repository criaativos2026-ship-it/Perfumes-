# AI Perfume Commercial Studio

Plataforma que transforma a foto de um perfume em um comercial cinematográfico. A identidade visual vem do
guia de marca em `brand/CLAUDE.md`. A arquitetura completa, os custos e o plano de fases estão em
[`docs/ARQUITETURA.md`](docs/ARQUITETURA.md).

## Status

| Fase | Conteúdo | Situação |
|---|---|---|
| 1 | Upload, identificação (Claude Vision), pesquisa olfativa com fontes verificadas, direção de arte com guia da marca, acompanhamento em tempo real | **implementada** |
| 2 | Recorte do frasco + keyframes por cena (Gemini Image) | próxima |
| 3 | Vídeo por cena (Veo + Kling), refazer cena individual | pendente |
| 4 | Áudio (ElevenLabs SFX) + montagem FFmpeg + download MP4 | pendente |

## Como rodar

```bash
cd backend
pip install -r requirements.txt
export ANTHROPIC_API_KEY=...        # obrigatória na Fase 1
uvicorn app.main:app --port 8000
# abra http://localhost:8000
```

Variáveis opcionais: `STUDIO_DATA_DIR` (padrão `./data`), `STUDIO_BRAND_FILE` (padrão `brand/CLAUDE.md`),
`STUDIO_CLAUDE_MODEL` (padrão `claude-opus-5-5`), `STUDIO_RESEARCH_MAX_SEARCHES` (padrão 8).

Para os testes, rode `cd backend && python -m pytest -q`. Eles cobrem a lógica local e **não** chamam APIs externas.

## Garantias da Fase 1

- **Sem informação olfativa inventada.** Cada dado precisa de uma URL, e o código confere se essa URL foi
  realmente retornada pela busca ou leitura feita na pesquisa. Um dado sem fonte verificável é descartado e
  aparece como "não encontrado".
- **Cores da marca extraídas pelo código.** O sistema lê as cores HEX do guia; as cores antigas (ameixa, rosé)
  são marcadas como proibidas e a paleta de cada conceito é validada contra o guia.
- **Conceitos que não se repetem.** Cada conceito aprovado fica salvo, e um conceito novo parecido demais com
  um anterior é refeito automaticamente.
- **Catálogo atualizado.** Ao aprovar um conceito, a ficha do produto é gravada na seção 5 de `brand/CLAUDE.md`,
  como o guia pede.
- **Erros visíveis.** A mensagem real da API aparece na interface, e cada etapa pode ser refeita sozinha.
