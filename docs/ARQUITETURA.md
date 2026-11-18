# AI Perfume Commercial Studio: Arquitetura técnica (proposta v1)

> Documento para aprovação **antes** da implementação. Os preços são estimativas
> baseadas nas tabelas públicas que eu conhecia até meados de 2026. Eles devem ser
> conferidos nas páginas oficiais de cada provedor antes de fechar o orçamento.

---

## 1. Visão geral

```
┌──────────────┐   ┌─────────────────────────── BACKEND (Python / FastAPI) ───────────────────────────┐
│  Frontend    │   │                                                                                   │
│  Next.js     │──▶│  API REST + SSE (progresso em tempo real)                                         │
│  (upload,    │   │        │                                                                          │
│  prévias,    │◀──│        ▼                                                                          │
│  download)   │   │  Orquestrador de Jobs (fila Redis + workers "arq")                                │
└──────────────┘   │        │                                                                          │
                   │        ├─ M1 Identificação ........ Claude Vision                                 │
                   │        ├─ M2 Pesquisa olfativa .... Claude + Web Search/Web Fetch (com citações)  │
                   │        ├─ M3 Direção de arte ...... Claude + brand/CLAUDE.md + histórico          │
                   │        ├─ M4 Isolamento produto ... remoção de fundo (BiRefNet/rembg, local)      │
                   │        ├─ M5 Keyframes ............ Gemini Image / GPT-Image / FLUX Kontext       │
                   │        ├─ M6 Vídeo por cena ....... Veo 3.x / Kling / Runway (image-to-video)     │
                   │        ├─ M7 Áudio ................ ElevenLabs (trilha + SFX) ou trilha própria    │
                   │        └─ M8 Montagem ............. FFmpeg (xfade, LUT, loudnorm, end card)       │
                   │                                                                                   │
                   │  PostgreSQL/SQLite (jobs, cenas, versões)   Armazenamento: disco local ou S3      │
                   └───────────────────────────────────────────────────────────────────────────────────┘
```

Cada módulo é independente, tem entrada e saída tipadas (Pydantic) e grava o
resultado no banco. Assim, qualquer etapa pode ser refeita sem repetir as anteriores.

---

## 2. Módulos

### M1: Identificação do produto
- **API:** Claude (visão), Messages API com saída JSON estruturada.
- Lê o rótulo, o formato do frasco, a tampa e a cor do líquido, e devolve `marca`, `nome`, `concentração`
  (EDP/EDT/Parfum), `volume` e um `grau de confiança`.
- Se a confiança for baixa, a interface pede ao usuário que confirme ou corrija o nome antes de pesquisar.

### M2: Pesquisa olfativa (sem invenção)
- **API:** Claude com as ferramentas de servidor `web_search` e `web_fetch`.
- Ordem de prioridade das fontes: **site oficial da marca ou do grupo fabricante** → varejistas oficiais
  (Sephora, Douglas, Notino) → bases especializadas (Fragrantica, Parfumo, Basenotes).
- Regras rígidas aplicadas no prompt **e validadas no código**:
  - cada nota (saída, coração e fundo), a família, os acordes e o conceito precisam de **URL de origem**;
  - um campo sem fonte fica `null` e aparece como "não encontrado", nunca com valor inventado;
  - quando as fontes divergem, as duas versões aparecem marcadas como conflito, e a oficial tem preferência;
  - a interface mostra as fontes de cada dado.

### M3: Direção de arte automática
- **API:** Claude, com o `brand/CLAUDE.md` do usuário e a ficha olfativa do M2.
- Gera um JSON contendo conceito, ambientação, cenário, elementos naturais, ingredientes flutuantes,
  texturas, iluminação, paleta (cores da marca + cores derivadas das notas), movimentos de câmera e
  um **roteiro em cenas**. Cada cena traz duração, prompt de imagem, prompt de movimento e transição.
- **Anti-repetição:** os conceitos anteriores ficam salvos (com embedding). Cada novo conceito é comparado
  ao histórico e, se for parecido demais, é regenerado com restrições como "não usar deserto, não usar água…".
- **Identidade de marca:** o `brand/CLAUDE.md` é convertido para `brand.json` (HEX, fontes, regras).
  As cores HEX são **injetadas pelo código** nos prompts, no LUT e no end card, sem depender do modelo
  "lembrar". Um validador confere se a paleta final contém as cores institucionais.

> Observação: na raiz do repositório, o arquivo `CLAUDE.md` também é lido pelo Claude Code como instrução
> de desenvolvimento. Por isso, proponho guardar o guia da marca em `brand/CLAUDE.md`. O nome continua o
> mesmo, mas ele não se mistura com as instruções do código.

### M4: Preservação da embalagem
É o maior risco técnico, porque modelos generativos tendem a redesenhar rótulos e logos. A solução tem três camadas:
1. **Recorte fiel:** a foto original é recortada localmente (BiRefNet/rembg), o que gera um PNG do frasco com alfa.
2. **Keyframes com referência:** os modelos de edição com imagem de referência recebem o frasco recortado.
3. **Composição real nos planos-herói:** nos planos em que o frasco aparece nítido e frontal (normalmente o packshot
   final), o **frasco original é composto por cima** do cenário gerado, com sombra e reflexo. Dessa forma o rótulo
   fica 100% fiel. Os planos com frasco em movimento usam image-to-video a partir do keyframe, e um verificador
   (Claude Vision) compara o rótulo com o original e reprova cenas com logo deformado.

### M5: Keyframes (imagens cinematográficas)
Os provedores ficam atrás de uma interface comum (`ImageProvider`):

| Provedor | Uso | API oficial |
|---|---|---|
| **Google Gemini 2.5 Flash Image / Imagen 4** | edição com referência do frasco, boa fidelidade, barato | Gemini API / Vertex AI |
| **OpenAI gpt-image-1** | alternativa com bom texto e boa composição | OpenAI Images API |
| **FLUX.1 Kontext Pro/Max** (Black Forest Labs) | edição contextual que preserva o objeto | api.bfl.ai |

Proposta: **Gemini** como padrão e os outros como fallback.

### M6: Vídeo (animação real)
Interface comum `VideoProvider` com `submit()`, `poll()` e `download()`:

| Provedor | Pontos fortes | Limitações | API |
|---|---|---|---|
| **Google Veo 3 / 3.1** | realismo superior, física de líquidos e partículas, áudio nativo, image-to-video, 1080p | clipes de 4 a 8 s; mais caro | Gemini API / Vertex AI |
| **Kling (2.x)** | ótimo movimento orgânico (pétalas, fumaça, tecido), start + end frame (transições), mais barato | fila às vezes lenta | API oficial Kling (klingai) |
| **Runway Gen-4 / Gen-4 Turbo** | rápido, barato, bom controle de câmera | menos realismo em líquidos | Runway API |
| Luma Ray 2 (opcional) | bom movimento de câmera | menor fidelidade de produto | Luma API |

Proposta: **Veo** para os planos-herói do frasco e **Kling** para os planos de ingredientes e ambiente
e para as transições com start e end frame. O provedor de cada cena pode ser trocado na interface.

### M7: Áudio
- **ElevenLabs Music API**: trilha original no clima do conceito, com duração exata.
- **ElevenLabs Sound Effects API**: borrifo, vidro, vento, água, tecido.
- Alternativa: o usuário envia uma trilha licenciada própria.
- O áudio nativo do Veo pode ser aproveitado como camada de ambiência.

### M8: Montagem (FFmpeg)
- Normalização de todos os clipes (fps, resolução e espaço de cor).
- Transições `xfade` (dissolve, fadeblack, smoothleft…) e transições geradas (Kling start/end frame).
- Corte no ritmo da música (detecção de batidas com `librosa`).
- Color grading com **LUT .cube gerado a partir da paleta da marca** (`lut3d`) e ajuste fino com `eq`/`colorbalance`.
- Mixagem de trilha + SFX + ambiência, com `loudnorm` a −14 LUFS (padrão de redes e web).
- End card com logo, tipografia e cores oficiais, renderizado em Pillow ou Skia com as fontes do guia.
- Exportação em H.264 High (MP4) e, opcionalmente, ProRes. Formatos: **9:16, 16:9, 1:1 e 4:5**.
  Durações: **15, 30 e 60 s**.

---

## 3. Fluxo de execução

```
1 Upload ─▶ 2 Identificação ─▶ [confirmação do usuário] ─▶ 3 Pesquisa (com fontes)
   ─▶ 4 Conceito + roteiro ─▶ [aprovação / pedir outro conceito]
   ─▶ 5 Keyframes por cena ─▶ [prévia; refazer cena X]
   ─▶ 6 Vídeo por cena (em paralelo) ─▶ [prévia; refazer cena X / trocar provedor]
   ─▶ 7 Áudio ─▶ 8 Montagem ─▶ 9 Download MP4
```

- **Estados por cena:** `pending → generating_image → image_ready → generating_video → video_ready → approved | failed`.
- **Tratamento de erros:** retry com backoff exponencial em 429/5xx, timeout por provedor, fallback
  automático para outro provedor (configurável) e mensagem clara com o erro real da API. Nenhum erro é escondido.
- **Recusa por moderação** (os provedores às vezes bloqueiam prompts): o prompt é reescrito e reenviado uma única vez,
  e depois a falha é mostrada ao usuário.
- **Acompanhamento:** eventos SSE com etapa, porcentagem, custo acumulado e logs.
- **Versionamento:** cada regeneração cria uma nova versão da cena, e o usuário escolhe qual entra na montagem.
- **Controle de custo:** estimativa antes de gerar e limite de gasto por job.

---

## 4. Custo estimado por comercial (30 s, cerca de 6 cenas)

Premissa: são gerados cerca de 45 s de vídeo para 30 s finais (margem de 1,5× para refações e cortes).

| Etapa | Econômico | Premium |
|---|---|---|
| Claude (identificação, pesquisa com ~10 buscas, direção e verificação) | US$ 0,30 | US$ 1,00 |
| Keyframes (cerca de 12 a 18 imagens) | US$ 0,50 | US$ 3,00 |
| Vídeo | Kling std/Runway Turbo: ~US$ 0,05–0,10/s → **US$ 3–5** | Veo 3.x padrão: ~US$ 0,40/s → **US$ 15–18** |
| Áudio (trilha + SFX) | US$ 0,50 | US$ 1,50 |
| FFmpeg/servidor | ~US$ 0 | ~US$ 0,10 |
| **Total por vídeo de 30 s** | **≈ US$ 4–7** | **≈ US$ 18–25** |

- Misto recomendado (Veo nos planos-herói e Kling no restante): **≈ US$ 8–12** por 30 s.
- Para 15 s, considere cerca de metade. Para 60 s, cerca do dobro.
- O vídeo representa entre 70% e 85% do custo total.

---

## 5. APIs e chaves necessárias

| Variável | Serviço | Obrigatória |
|---|---|---|
| `ANTHROPIC_API_KEY` | Claude (visão, pesquisa, direção) | sim |
| `GEMINI_API_KEY` (ou Vertex) | Veo + Gemini Image | sim (no plano recomendado) |
| `KLING_ACCESS_KEY` / `KLING_SECRET_KEY` | Kling | recomendada |
| `RUNWAY_API_KEY` | Runway | opcional |
| `OPENAI_API_KEY` | gpt-image-1 | opcional |
| `BFL_API_KEY` | FLUX Kontext | opcional |
| `ELEVENLABS_API_KEY` | trilha e SFX | recomendada |

Nenhuma integração será simulada. Se uma chave estiver ausente, o provedor aparece como **indisponível** na
interface e não é usado.

---

## 6. Estrutura do repositório

```
backend/
  app/
    api/            rotas REST + SSE
    core/           config, banco, fila, storage, custos
    modules/
      identify/     M1
      research/     M2
      direction/    M3 (+ anti-repetição)
      product/      M4 (recorte, composição, verificação de rótulo)
      images/       M5  providers/{gemini,openai,bfl}.py
      video/        M6  providers/{veo,kling,runway}.py
      audio/        M7  providers/{elevenlabs}.py
      assembly/     M8 (ffmpeg, LUT, end card)
    workers/        tarefas da fila
  tests/
frontend/           Next.js + Tailwind
brand/CLAUDE.md     guia de identidade visual (fornecido pelo usuário)
docker-compose.yml  api + worker + redis + postgres + frontend
```

---

## 7. Plano de entrega por fases

1. **Fase 1:** backbone (jobs, fila, storage, SSE), M1, M2 e M3, e a interface até a apresentação do conceito.
2. **Fase 2:** M4 e M5 (recorte, keyframes, prévia e refação por cena).
3. **Fase 3:** M6 com Veo e Kling (geração, polling, refação e troca de provedor).
4. **Fase 4:** M7 e M8 (áudio e montagem final), formatos, durações e download.
5. **Fase 5:** testes ponta a ponta com chaves reais, ajuste de prompts e limites de custo.

## 8. Pontos de atenção
- **Marcas registradas:** usar o frasco e o nome de perfumes de terceiros em publicidade exige direito de uso
  (revenda autorizada, por exemplo). Essa responsabilidade é do operador da plataforma.
- **Rede do ambiente de execução:** os domínios das APIs (api.anthropic.com, generativelanguage.googleapis.com,
  api.klingai.com etc.) precisam estar liberados onde o sistema rodar.
- **Tempo de geração:** de 5 a 20 minutos por comercial, a depender das filas dos provedores.
