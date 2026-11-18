# Perfume Commercial Studio (app para celular, 100% gratuito)

App que roda **inteiro no navegador do celular** e pode ser instalado na tela inicial.
Ele transforma a foto de um perfume num comercial em vídeo MP4 com a identidade da marca (`brand/CLAUDE.md`).
Não precisa de servidor, computador nem placa de vídeo.

## O que o app faz

1. **Foto do frasco:** tirada na hora ou escolhida da galeria, em formato Story (1080×1920) ou Feed
   (1080×1350), com 12, 20 ou 30 s.
2. **Identificação:** o Gemini lê o frasco, transcreve os textos e avisa sobre nomes parecidos. Você confirma.
3. **Ficha olfativa:** o Gemini pesquisa com a busca do Google. Cada dado precisa de uma fonte, e o app confere
   se essa fonte apareceu de fato na busca. Um dado sem fonte comprovada é descartado e aparece como
   "não encontrado".
4. **Conceito criativo:** criado a partir do guia da marca e das notas reais. Inclui roteiro em cenas, paleta,
   partículas, ilustrações e câmera. As cores proibidas pelo guia são removidas, e conceitos parecidos com
   anteriores são refeitos.
5. **Prévia e cenas:** a animação roda ao vivo e cada cena pode ser editada e refeita sozinha (texto, duração,
   partículas, câmera, ilustrações, variação de movimento).
6. **MP4:** o vídeo é gerado no próprio aparelho (H.264, 30 fps) e pode ser baixado ou compartilhado.
7. **Catálogo:** a ficha do produto é gravada na seção 5 do guia. Em **Ajustes → Baixar guia atualizado**,
   você leva a versão atualizada de volta para o repositório.

## Por que é gratuito

| Parte | Como é feita | Custo |
|---|---|---|
| Identificação, pesquisa, conceito | API Gemini do Google, plano gratuito, com a chave do próprio usuário (criada em aistudio.google.com/apikey) | grátis, com limite diário |
| Recorte do frasco | no aparelho: remove o fundo branco sem redesenhar o frasco | grátis |
| Animação | motor próprio em Canvas: névoa volumétrica, partículas (pétalas, poeira dourada, gotas, fumaça, bokeh, folhas, faíscas), raios de luz, ilustrações em traço dourado que se desenham, frasco real com foco dourado, piso, reflexo e brilho, câmera com profundidade (parallax) e tipografia oficial (Cormorant Garamond e Jost, licença OFL) | grátis |
| Som | efeitos sintetizados no aparelho (riser, impacto, brilho, varredura, sopro, borrifo, vidro), como o guia pede (sem música) | grátis |
| Vídeo | WebCodecs + mp4-muxer (MIT) no navegador | grátis |
| Hospedagem | GitHub Pages, Cloudflare Pages ou Netlify (planos gratuitos) | grátis |

**Limite honesto:** o vídeo é animação real feita pelo motor do app, **não** vídeo gerado por IA (como Veo ou
Kling). Vídeo generativo não tem API gratuita oficial e não roda num celular.

## Compatibilidade

- **Android:** Chrome atualizado gera MP4 com áudio.
- **iPhone:** Safari 17 ou mais recente. Se o navegador não codificar o áudio, o vídeo sai sem som e o app avisa.
  Em navegadores sem WebCodecs, o app grava em tempo real.

## Como publicar (grátis)

- **GitHub Pages:** o workflow `.github/workflows/pages.yml` publica a cada push na `main`. Ative em
  *Settings → Pages → Source: GitHub Actions*. No plano gratuito do GitHub, o Pages exige repositório público.
- **Repositório privado:** conecte o repositório ao Cloudflare Pages ou ao Netlify (grátis). Use o comando de
  build `mkdir -p _site/brand && cp -r web/. _site/ && cp brand/CLAUDE.md _site/brand/` e a pasta `_site`.
- Depois, no celular, abra o endereço e use **Adicionar à tela inicial**.

## Desenvolvimento

- `web/`: o app (HTML/CSS/JS puro, sem etapa de build).
- `web/js/engine.js`: motor de animação.
- `web/js/ai.js`: prompts e regras da IA.
- `brand/CLAUDE.md`: guia da marca.
- `tests/`: testes das regras. Rode com `node --test tests/*.test.mjs`.
