# CLAUDE.md: Virtus Parfums

Arquivo de contexto da marca **Virtus Parfums**. Reúne o resumo da conversa, o manual de marca, todas as cores (hexadecimais), os padrões de boutique de alto padrão e as especificações de posts e vídeos. Leia este arquivo antes de criar qualquer peça nova da marca.

---

## 1. Resumo do projeto

- **Marca:** Virtus Parfums, marca de perfumes em criação por Otávio Augusto (São Carlos, SP). Ele trabalha com social media e marketing digital.
- **Ponto de partida:** um teste de logo com leão dourado, coroa e letra V sobre fundo preto marmorizado, com a tagline "Mias que fragrâncias, propósito em cada essência" (erro de digitação; o correto é **"Mais que fragrâncias, propósito em cada essência."**).
- **Pedido inicial:** rebranding criativo e identidade visual completa.
- **Decisões do usuário, na ordem em que aconteceram:**
  1. Primeira proposta (minha): V com traço grosso e fino, leão removido, paleta preto, ouro, bordeaux, marfim, champagne.
  2. O usuário enviou **sua própria logo preferida** (PDF): V fino em traço, gota champagne acima, VIRTUS com letras bem espaçadas, linha fina dourada e PARFUMS pequeno. Paleta do PDF: Ameixa, Champagne, Marfim, Rosé.
  3. Depois pediu a **mesma logo nas cores da primeira versão**: bordeaux, marfim, preto e ouro. Essa é a identidade oficial atual.
  4. Pediu a foto de perfil do Instagram: **versão preta com o nome Virtus embaixo**.
  5. Pediu anúncios dos perfumes **Club de Nuit** e **Amazônica**. Rejeitou um único anúncio com os dois e pediu **posts separados**, com o frasco de cada um e as notas olfativas combinadas à identidade visual.
  6. Pediu posts em **preto e dourado**, com cara de **boutique de alto padrão**, e usou as fotos dos frascos que ele mesmo enviou.
  7. No Club de Nuit, pediu para usar a imagem **como está, com a escrita branca** na parte de baixo do frasco, e **sem a caixa**.
  8. Pediu **um vídeo para cada perfume**, usando o skill de vídeo, em **1080x1350 (feed)** e **formato Story (1080x1920)**.
  9. Pediu este CLAUDE.md.

---

## 2. Manual de marca

### 2.1 Essência

- **Nome:** Virtus. Do latim: coragem, excelência, virtude.
- **Posicionamento:** perfumaria de boutique, elegante, discreta e segura. O luxo vem do espaço vazio, da tipografia e do dourado fino, não de efeitos.
- **Conceito:** o leão do teste inicial saiu do desenho e entrou no nome. A força está na palavra; a elegância está no traço fino do V.
- **Tagline:** *Mais que fragrâncias, propósito em cada essência.*
- **Chamada de ação padrão:** "Peça pelo direct" (pode ser trocada por "Chame no WhatsApp" ou "Link na bio").

### 2.2 Tom de voz

- Português do Brasil, frases curtas, sofisticado sem ser pedante.
- Títulos em **caixa de título ou sentença** (ex.: "Club de Nuit"), nunca tudo em maiúsculas, exceto o logotipo VIRTUS e PARFUMS.
- Sem exageros ("o melhor do mundo", "imperdível"), sem gírias e sem excesso de emojis.
- Frases de campanha genéricas já criadas: "Os mais desejados do momento.", "Coragem tem perfume.". Frases específicas de cada perfume ficam na ficha do produto (seção 5).
- Legenda modelo: *"[Nome do perfume], agora na Virtus. Chame no direct e garanta o seu. 🖤✨"*

### 2.3 Logo

**Símbolo:** um V desenhado só com duas linhas finas, mais uma **gota** dourada entre os braços, no alto.

Geometria (para redesenhar com precisão; `s` = largura do V):

| Elemento | Medida |
|---|---|
| Braço esquerdo | de (-s/2, yt) até o vértice (0, yt + 0,97 s) |
| Braço direito | do vértice até (+s/2, yt) |
| Espessura do traço | ≈ 2,2% a 2,6% de `s` (logo), 3,2% (foto de perfil), 4% (avatar pequeno) |
| Pontas e vértice | arredondados (círculo com o diâmetro do traço) |
| Gota | círculo de raio 0,118 s, centro em yt + 0,083 s; ponta 2,4 raios acima do centro; triângulo tangente ao círculo |
| Cores | V em marfim ou preto; gota em ouro |

**Assinatura completa (lockup)**, de cima para baixo e centralizada: símbolo, **VIRTUS** em serifada fina e espaçada, linha fina dourada curta, **PARFUMS** pequeno em sans, espaçado.

| Parte | Proporção (k = fator de escala) |
|---|---|
| Símbolo | largura 110 k |
| VIRTUS | corpo 84 k, espaçamento entre letras ≈ 30 k (≈ 0,36 em) |
| Linha dourada | 72 k de comprimento, 1,5 k de espessura |
| PARFUMS | corpo 13 k, espaçamento ≈ 13 k |

**Versões:**
- Logo sobre marfim (V e VIRTUS pretos, gota ouro)
- Logo sobre preto (V e VIRTUS marfim, gota ouro claro)
- Logo sobre bordeaux (V e VIRTUS marfim, gota ouro claro)
- Fundos transparentes: preto e marfim
- Só símbolo (fotos de perfil)
- Foto de perfil oficial: **fundo preto, V marfim, gota ouro claro, VIRTUS embaixo em marfim** (arquivo `foto-perfil-instagram-virtus-preta`)

**Regras de uso:**
- Deixar ao redor da logo um espaço livre de pelo menos a altura da gota.
- Nunca esticar, inclinar, aplicar sombra ou contorno.
- Nunca recolocar o leão, a coroa ou o dourado metálico com brilho do primeiro teste.
- Em tamanhos pequenos (avatar), engrossar levemente o traço do V.
- Não usar o dourado sobre marfim para textos pequenos (contraste baixo): usar `#7A5C2E`.

### 2.4 Tipografia

| Uso | Fonte oficial da marca | Fonte usada nos arquivos renderizados |
|---|---|---|
| Títulos, logotipo, nomes dos perfumes, notas | **Cormorant Garamond** (serifada clássica, fina) | FreeSerif (e FreeSerif Italic nos itálicos) |
| Textos, rótulos, CTA, PARFUMS | **Jost** (sans leve) | Inter Regular |

- As fontes oficiais não estão instaladas no ambiente de geração; as substitutas são parecidas, porém mais pesadas. Quando houver SVG ou arquivo original da logo, usar as fontes oficiais.
- **Aviso técnico:** a fonte **GFS Baskerville** não tem letras latinas e gera texto em branco. Não usar.
- Títulos grandes: serifada regular, marfim, sem negrito.
- Subtítulos e rótulos de notas: **serifada itálica**, ouro claro.
- Textos pequenos: sans leve; caixa alta apenas no logotipo e no PARFUMS, com espaçamento largo.

---

## 3. Cores (todos os hexadecimais)

### 3.1 Paleta oficial atual (identidade em uso)

| Nome | Hex | Uso |
|---|---|---|
| **Bordeaux (Bordô Resina)** | `#4A1A17` | Fundos de marca, rótulos, foto de perfil bordeaux |
| **Marfim** | `#F3EDE2` | Textos sobre fundo escuro, fundos claros, V do logo |
| **Preto (Noir Ébano)** | `#0E0C0B` | Fundo principal dos posts e vídeos, texto sobre marfim |
| **Ouro Antigo** | `#B8955A` | Linhas, molduras, gota sobre fundos claros |
| **Ouro Claro** | `#C9A66B` | Gota e textos dourados sobre fundos escuros |
| **Champagne** | `#E6D3A8` | Texto secundário dourado claro (ex.: rótulo de frasco), destaques suaves |

### 3.2 Cores de apoio usadas nos posts e vídeos

| Hex | Uso |
|---|---|
| `#6B5636` | Moldura fina, separadores verticais, linhas discretas |
| `#7A5C2E` | Textos pequenos dourados sobre marfim (contraste legível) |
| `#CFC4B0` | Texto secundário claro sobre fundo escuro |
| `#5A4521` | Luz dourada (glow) atrás do frasco |
| `#7A6030` | Luz dourada no piso, sob o frasco |
| `#3A2B14` | Glow mais discreto (versão anterior do post) |
| `#6B2A25` | Glow bordeaux (versão anterior) |
| `#12100E`, `#150F0D`, `#171310`, `#1A1613` | Pretos aquecidos para painéis e fundos de apresentação |
| `#3A1311` | Interior do arco sobre bordeaux (versão anterior) |
| `#6B4F28` | Líquido ilustrado no frasco genérico (descartado) |

### 3.3 Versões anteriores (histórico, não usar nas peças novas)

**Primeira proposta (dourado e preto):**
- Noir Ébano `#0E0C0B`, Ouro Antigo `#B8955A`, Champagne `#E6D3A8`, Bordô Resina `#4A1A17`, Marfim `#F3EDE2`
- Ouro claro de apoio `#C9A66B`; marrom de linha `#6B5636`; texto auxiliar `#CFC4B0`

**Paleta do PDF enviado pelo usuário (ameixa):**
- Ameixa `#34203A`
- Champagne `#C2A06B`
- Marfim `#F8F3EE`
- Rosé `#E9D3CC`
- Cinza-lilás de texto pequeno `#6B5870`

### 3.4 Combinações recomendadas

- Preto `#0E0C0B` + marfim `#F3EDE2` + ouro claro `#C9A66B` (padrão dos posts e vídeos)
- Bordeaux `#4A1A17` + marfim + ouro claro (rótulo, fundo de marca)
- Marfim `#F3EDE2` + preto + ouro antigo `#B8955A` (peças claras, textos pequenos em `#7A5C2E`)

---

## 4. Padrões de boutique de alto padrão

Princípios pedidos pelo usuário: **preto e dourado**, aspecto de **boutique de alto padrão**, produto como protagonista, muito espaço vazio.

### 4.1 Regras gerais

1. Fundo preto `#0E0C0B` com **foco de luz dourada** atrás do frasco (gradiente radial `#5A4521`) e brilho no piso (`#7A6030`).
2. **Uma moldura fina** (1 px, `#6B5636`), recuada 36 px das bordas. Sem moldura dupla.
3. **Logo Virtus pequena no topo**, como assinatura de loja, centralizada.
4. **Nome do perfume grande**, em serifada marfim, com o fabricante em itálico dourado logo abaixo ("Intense Man, Armaf", "Rayhaan by Junior Barreiros").
5. **Frasco como herói**, centralizado, só o frasco (sem caixa), sobre uma **linha de piso** dourada que desvanece nas pontas, com **reflexo** suave.
6. **Notas em três colunas** (Topo, Coração, Fundo), com separadores verticais finos. Rótulos em itálico dourado, sentença normal (nunca caixa alta espaçada), frases corridas, separadas por vírgulas e terminando com "e" (sem pontos centrais entre as notas).
7. **CTA discreto** no rodapé: texto "Peça pelo direct" com um fio dourado embaixo. **Sem botão, sem pílula, sem caixa.**
8. Poucos elementos: se algo não informa, remover. Sem arco, sem selo, sem ícones, sem emojis na arte.
9. Textos centralizados, margens generosas, nada encostando na moldura.
10. Evitar: dourado metálico com brilho, sombras duras, caixa alta espalhada, tarjas, "bolinhas" separando notas (usar vírgulas), mais de uma ideia por peça.

### 4.2 Especificação do post (1080x1350, exportado em 2160x2700)

| Elemento | Posição / medida |
|---|---|
| Moldura | retângulo a 36 px das bordas, 1 px, `#6B5636` |
| Símbolo Virtus | centro, topo y ≈ 78, largura 46 px |
| VIRTUS | corpo 30 px, espaçamento 12, marfim, y ≈ 142 |
| Nome do perfume | serifada 100 px, marfim, y ≈ 228 |
| Subtítulo | serifada itálica 38 px, `#C9A66B`, y ≈ 345 |
| Frasco | altura 480 px, centralizado, topo y ≈ 410 |
| Linha de piso | 480 px de largura, ouro `#B8955A`, desvanece nas pontas |
| Reflexo | frasco espelhado, opacidade inicial 0,32, some em 28% da altura |
| Rótulos das notas | serifada itálica 32 px, `#C9A66B`, y ≈ 1035, centros x = 240, 540, 840 |
| Texto das notas | serifada 27 px, marfim, espaçamento de linha 36 px |
| Separadores | 2 linhas verticais finas em x = 390 e 690, `#6B5636` |
| CTA | sans 21 px, `#C9A66B`, y ≈ 1262, fio ouro 120 px em y ≈ 1296 |

### 4.3 Especificação dos vídeos

- **Formatos:** Story/Reels **1080x1920** e feed **1080x1350**. Duração **11,5 s**, 30 fps, H.264 com áudio AAC.
- **Estrutura (uma ideia por cena, tempos longos de pausa):**

| Tempo | Cena |
|---|---|
| 0,2 a 1,2 s | Moldura surge |
| 0,4 a 2,4 s | Logo desenhada traço a traço; gota cai no lugar; VIRTUS aparece |
| 2,3 a 4,5 s | Luz dourada cresce; o frasco surge da escuridão e faz um push-in lento (escala 0,90 a 1,0) |
| 4,3 a 5,6 s | Brilho dourado diagonal atravessa o frasco; surgem nome e subtítulo |
| 6,1 / 7,2 / 8,3 s | Entram as notas Topo, Coração e Fundo, uma a uma |
| 9,3 a 10,1 s | Entra "Peça pelo direct"; o quadro final fica parado até 11,5 s |

- **Som (apenas efeitos, sem música de fundo)**, da biblioteca do skill video-shotcraft (`assets/audio/sfx`):

| Efeito | Arquivo | Tempo | Volume |
|---|---|---|---|
| Riser que termina na entrada do frasco | `riser/riser-cine` | termina em 2,9 s | 0,55 |
| Impacto | `impact/impact-cine-big` | 2,9 s | 0,5 |
| Brilho do título | `light/sparkle-touch` | 4,3 s | 0,4 |
| Varredura de luz | `light/light-sweep-magic` | 4,3 s | 0,35 |
| Brilhos das notas | `light/sparkle-touch` | 6,1 / 7,2 / 8,3 s | 0,4 |
| Brilho final | `light/sparkle` | 9,3 s | 0,4 |

- **Layout do vídeo 1080x1350:** logo no topo (≈ y 20), nome 100 px (y ≈ 280), subtítulo 40 px (y ≈ 400), frasco de 440 px de altura com piso em y ≈ 900, notas em y ≈ 1030 (rótulos 38 px, texto 28 px), CTA em y ≈ 1250.
- **Layout do vídeo 1080x1920:** logo em y ≈ 150, nome 124 px (y ≈ 430), subtítulo 48 px (y ≈ 585), frasco de 640 px de altura com piso em y ≈ 1305, notas em y ≈ 1500, CTA em y ≈ 1790.
- Música de fundo: as faixas da biblioteca (hip-hop e tech house) não combinam com o tom de boutique. Usar música instrumental sua, adicionada no editor do Instagram.

### 4.4 Tratamento das fotos dos frascos

- Receber a foto do frasco **em fundo branco**, de boa qualidade; recortar o fundo branco e colocar sobre o preto com o foco dourado.
- Usar **só o frasco** (sem caixa), mantendo a escrita original do frasco (no Club de Nuit, a escrita branca "club de nuit intense man" fica).
- Prints de telas de busca têm baixa resolução e deixam o recorte serrilhado; pedir a foto original.
- Frasco totalmente preto (Club de Nuit) lê como silhueta; o foco dourado atrás cria o contraste. Opcional: clarear levemente as sombras ou acrescentar brilho dourado fino nas bordas.

---

## 5. Catálogo de produtos

**A marca terá muitos produtos.** Este arquivo **não guarda notas olfativas fixas**: as informações de cada perfume mudam a cada peça criada.

**Regra de atualização:** a cada novo produto que o usuário pedir para criar, o Claude deve **acrescentar ou atualizar a ficha do produto nesta seção** com as informações dele (e, se houver foto, registrar que foi enviada).

**Modelo de ficha de produto:**

```
### Nome do produto (fabricante)
- Tipo / concentração:
- Notas (topo, coração, fundo):
- Frase de campanha:
- Frasco (descrição visual):
- Foto fornecida pelo usuário: sim / não
- Peças criadas (posts, vídeos):
- Fonte das informações: (conferir com o fornecedor antes de publicar)
```

**Produtos já trabalhados (somente identificação):**
- Club de Nuit Intense Man (Armaf): post 1080x1350 e vídeos de feed e Story.
- Amazonica (Rayhaan by Junior Barreiros): post 1080x1350 e vídeos de feed e Story.

**Regras gerais para qualquer produto:**
- Não afirmar dados de produto sem fonte; indicar que as notas vêm de lojas e sites de venda e devem ser conferidas com o fornecedor.
- Não colocar preço sem o usuário informar.
- Confirmar o nome exato do produto e do fabricante com as fotos enviadas (já houve confusão entre o Amazônico da Granado e o Amazonica da Rayhaan).

---

## 6. Arquivos gerados

| Peça | Arquivo |
|---|---|
| Logo sobre marfim, preto e bordeaux (v3, cores oficiais) | `virtus-v3/01-logo-marfim`, `02-logo-preto`, `03-logo-bordeaux` |
| Paleta e tipografia | `virtus-v3/04-paleta-tipografia` |
| Rótulo e post de exemplo | `virtus-v3/05-rotulo-e-post` |
| Fotos de perfil (4 opções) | `virtus-v3/perfil-1-preto`, `perfil-2-bordeaux`, `perfil-3-marfim`, `perfil-4-circulo-bordeaux` |
| Foto de perfil final (preta, com nome) | `virtus-v3/foto-perfil-instagram-virtus-preta` |
| Logos transparentes | `virtus-v3/logo-preto-transparente`, `logo-marfim-transparente` |
| Posts da campanha (1080x1350) | `virtus-campanha/post-1-club-de-nuit`, `post-2-amazonica` |
| Vídeos feed (1080x1350) | `virtus-videos/club-de-nuit-feed-1080x1350`, `amazonica-feed-1080x1350` |
| Vídeos Story (1080x1920) | `virtus-videos/club-de-nuit-story-1080x1920`, `amazonica-story-1080x1920` |
| Pastas antigas (versão anterior, não usar) | `virtus`, `virtus-v2`, `virtus-anuncio` |

---

## 7. Instruções para o Claude ao trabalhar com este usuário

- Responder em **português do Brasil**. As mensagens do usuário são muitas vezes **ditadas** e podem ter erros de transcrição (ex.: "Tem 10 mil vendas"); se uma frase não fizer sentido, avisar e perguntar.
- O usuário entrega as **fotos dos frascos** e quer usá-las **como estão**. Não alterar o produto (não remover escritas, não adicionar elementos) sem ele pedir.
- Ele prefere **resultados prontos para postar** (PNG em 2x; MP4 com áudio). Entregar arquivos, não só descrições.
- Antes de entregar qualquer imagem ou vídeo, **conferir visualmente** os quadros (um erro de fonte já deixou textos em branco).
- A identidade vigente é **bordeaux, marfim, preto e ouro**. Ameixa e rosé foram abandonadas.
- Nos posts de perfume, o fundo é **preto e dourado**; o bordeaux aparece em rótulos e fundos de marca.
- Ao inventar nomes de fragrâncias (ex.: "Nº 01 · Âmbar Nobre"), tratar como sugestão e avisar.
- **A cada novo produto pedido, atualizar a seção 5 (Catálogo de produtos) com a ficha do produto.** Não usar notas ou dados de um produto em outro.
- Não afirmar dados de produto sem fonte; indicar que as notas vêm de lojas e devem ser conferidas.

---

## 8. Pendências e próximos passos sugeridos

- Receber o **arquivo original da logo** (PDF ou SVG) para refazer os arquivos com o desenho e as fontes exatas.
- Criar **Stories estáticos** dos dois posts (1080x1920).
- **Post conjunto** com os dois perfumes e/ou carrossel (capa, notas, CTA).
- Kit de Instagram: **destaques de Stories** (ícones), capa de Reels, bio.
- Embalagem: rótulo definitivo, cartão de visita, sacola.
- Definir o canal de venda do CTA (direct, WhatsApp ou link na bio) e inserir preços, se for o caso.
- Música instrumental para os vídeos (sem efeitos de hip-hop ou house).
