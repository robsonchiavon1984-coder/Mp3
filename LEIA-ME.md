# Leitor em Voz — aplicativo web

Le em voz alta, em portugues, PDFs e textos. Depois de instalado no celular,
funciona sem internet. Nenhum arquivo sai do aparelho: nao ha servidor, nao ha
cadastro, nao ha custo.

Esta versao foi montada sem nenhuma subpasta, de proposito: todos os arquivos
ficam lado a lado. E o que permite envia-los ao GitHub pelo navegador, sem
precisar instalar nada e sem depender de arrastar pastas.

---

## 1. Publicar no GitHub Pages, pelo navegador

1. Descompacte o arquivo .zip. Voce vera uma pasta com cerca de trinta
   arquivos soltos — nenhuma subpasta dentro dela.
2. No GitHub, crie um repositorio novo (o botao verde `New`). De um nome
   curto, por exemplo `leitor-em-voz`. Marque `Public` — o GitHub Pages so
   funciona em repositorio publico nas contas gratuitas. Marque tambem
   `Add a README file`, para o repositorio ja nascer com algo dentro.
3. No repositorio, clique em `Add file` e depois em `Upload files`.
4. Abra a pasta descompactada no Explorador de Arquivos do Windows, aperte
   `Ctrl + A` para selecionar TODOS os arquivos e arraste-os para dentro da
   area de envio do GitHub. Como nao ha subpastas, tambem funciona clicar em
   `choose your files` e selecionar tudo pelo seletor comum — que era
   justamente o que nao aceitava pastas.
5. Role a pagina ate o fim e clique em `Commit changes`.
   Sao 31 MB no total. Se o envio falhar no meio — conexao instavel, ou o
   navegador desistindo —, mande em duas levas: primeiro todos os arquivos
   pequenos, e depois, sozinhos, os dois maiores, `piper_phonemize.data` e
   `ort-wasm-simd.wasm`. O resultado e o mesmo.
6. Va em `Settings` › `Pages`. Em `Source`, escolha `Deploy from a branch`;
   em `Branch`, escolha `main` e a pasta `/ (root)`. Clique em `Save`.
7. Espere um ou dois minutos e abra
   `https://SEU-USUARIO.github.io/leitor-em-voz/`.

Sobre o arquivo `.nojekyll`: ele evita que o GitHub trate o site como um blog.
O Windows costuma esconder arquivos que comecam com ponto; se ele nao aparecer
na sua selecao, nao tem problema — nesta versao, sem subpastas e sem nomes
comecados por sublinhado, o site funciona sem ele.

## 2. O limite de 25 MB, e o que isso significa para o modelo de voz

O envio pelo navegador do GitHub recusa qualquer arquivo acima de 25 MB. Todos
os arquivos deste aplicativo cabem: o maior, `piper_phonemize.data`, tem 18 MB.

O modelo de voz usado para gerar MP3 e a excecao: o arquivo `.onnx` da voz
Faber passa dos 25 MB e NAO pode ser enviado por essa via. Ha dois caminhos:

**Caminho simples, sem git.** Nao coloque o modelo no repositorio. Baixe os
dois arquivos direto no celular e, no aplicativo, use Ajustes › Arquivo de
audio › `Escolher arquivos…`, apontando para eles. Ficam guardados no aparelho
e a geracao passa a funcionar sem internet. Enderecos em `VOZES-LEIA-ME.txt`.

**Caminho com git.** Se instalar o GitHub Desktop (gratuito), o limite de
25 MB deixa de existir — pela linha de comando ou pelo aplicativo, o GitHub
aceita arquivos de ate 100 MB. Ai basta colocar os dois arquivos do modelo
junto com os demais, e o botao `Instalar o modelo` traz tudo do site para
qualquer celular que abrir o aplicativo.

Se voce nunca for gerar MP3 no celular — e, para documentos longos, o
computador e mesmo muito mais rapido —, ignore esta secao inteira. A leitura em
voz alta nao depende do modelo.

## 3. Instalar no celular

**Android (Chrome).** Abra o endereco, toque no menu de tres pontos e escolha
`Instalar aplicativo` (ou `Adicionar a tela inicial`). Depois disso o Leitor
aparece no menu Compartilhar do sistema: de qualquer aplicativo voce pode
mandar um PDF ou um trecho de texto direto para ele.

**iPhone (Safari).** Abra o endereco no Safari — nao no Chrome —, toque no
botao Compartilhar e escolha `Adicionar a Tela de Inicio`. E isso que permite
ao iOS guardar os arquivos e abrir o aplicativo sem internet. O iOS nao
repassa arquivos de outros aplicativos, entao os PDFs se abrem pelo botao
`Escolher arquivo`.

Na primeira abertura o aplicativo oferece `Preparar agora`. Faca isso
conectado ao wi-fi: sao cerca de 31 MB, baixados uma unica vez. A partir dai o
aplicativo abre e funciona com o aparelho em modo aviao.

## 4. O que o aplicativo faz

- Abre PDF, TXT e MD; aceita texto colado; no Android recebe arquivos e
  trechos pelo menu Compartilhar.
- Le em voz alta com as vozes do aparelho, destacando a frase — e, quando a voz
  informa, a palavra — que esta sendo lida. Toque em qualquer frase para
  comecar dali.
- Corrige letras afastadas: `P O D E R  J U D I C I A R I O` vira
  `PODER JUDICIARIO`, e nao `PODERJUDICIARIO`. Usa o proprio espacamento do
  documento — o menor vao separa letras, os maiores separam palavras — e, so
  quando nem isso resta, uma lista de frequencia do portugues com vocabulario
  forense.
- Divide o texto em frases entendendo abreviaturas juridicas: `art.`, `n.`,
  `fls.`, `Des.`, `j.`, numeros de processo e valores com ponto de milhar nao
  sao confundidos com fim de periodo.
- Pronuncia por extenso o que esta abreviado: "artigo" onde se le `art.`,
  "codigo de processo civil" onde se le `CPC`. O texto na tela nao muda; so a
  fala. Todas as regras sao editaveis em Ajustes.
- Le numeros de processo digito a digito.
- Lembra onde voce parou em cada documento, marca as paginas do PDF, busca sem
  acento e exporta o texto extraido em `.txt`.
- Gera um arquivo MP3 do documento inteiro.
- Mantem a tela ligada enquanto le, se o aparelho permitir.

## 5. Limitacoes — vale ler antes

**A fala para quando a tela bloqueia.** Isso vale para qualquer pagina web, no
iPhone sempre e no Android na maioria dos aparelhos. Para ouvir um acordao
caminhando ou dirigindo, gere o MP3 e toque no player de musica do celular,
que continua com a tela apagada.

**Gerar MP3 no celular e demorado.** O sintetizador roda em WebAssembly, numa
unica linha de execucao — o GitHub Pages nao envia os cabecalhos que
permitiriam usar varios nucleos. Num computador a conversao fica proxima do
tempo real; num celular, bem mais lenta. Para documentos longos, gere o arquivo
no computador, pela extensao, e mande o MP3 para o telefone.

**PDF digitalizado nao e lido.** Se o PDF for apenas imagem, nao ha texto a
falar: o aplicativo avisa e para. Passe o arquivo antes por um programa de OCR.

**O primeiro download e grande.** Sao 31 MB do aplicativo, mais o modelo de voz
se voce quiser MP3. Faca no wi-fi.

**O navegador pode limpar o cache.** O aplicativo pede ao sistema que nao
apague seus dados, mas em aparelhos com pouco espaco livre isso pode acontecer
mesmo assim. Nesse caso basta abrir o aplicativo conectado uma vez e tocar em
`Baixar tudo para uso offline`, em Ajustes.

## 6. O que cada arquivo faz

Arquivos escritos para este projeto:

```
index.html              a tela
app.css                 aparencia, incluindo o tema escuro
app.js                  o cerebro: documentos, fala, ajustes, offline
sw.js                   service worker: guarda os arquivos para uso offline e
                        recebe o compartilhamento do Android
manifest.webmanifest    identidade do aplicativo para instalacao
espacamento.js          junta letras afastadas sem colar as palavras
frases.js               limpeza do texto de PDF e divisao em frases
abreviaturas.js         dicionario de pronuncia juridica
sintetizador.js         worker que produz o MP3 com o Piper
ambiente.js             remendo de compatibilidade do Emscripten em worker de
                        modulo (explicado no proprio arquivo)
icone-*.png             icones do aplicativo
```

Bibliotecas de terceiros, embutidas:

```
pdf.min.js              pdf.js, da Mozilla
pdf.worker.min.js       o processo paralelo que o pdf.js usa
palavras-pt.txt         lista de frequencia do portugues com vocabulario
                        forense, usada so no ultimo recurso do espacamento
piper-tts-web.js        o sintetizador que gera o MP3
piper-o91UDS6e.js       phonemizador do Piper (codigo)
piper_phonemize.*       phonemizador do Piper (WebAssembly e dados do eSpeak)
ort.wasm.min.js         ONNX Runtime Web
ort-wasm-simd.wasm      o motor de inferencia propriamente dito
voices_static-*.js      catalogo de vozes do Piper
lamejs.js               codificador de MP3
```

Todos os arquivos `.js` escritos para este projeto estao comentados linha a
linha, em portugues, com a explicacao do porque de cada decisao.

## 7. Atualizar o aplicativo depois

Envie os arquivos alterados para o repositorio e mude o numero da versao no
alto do `sw.js` (a constante `VERSAO`). Sem essa mudanca, os celulares que ja
instalaram continuam servindo a versao antiga do cache. No proprio aplicativo,
em Ajustes › Armazenamento, o botao `Procurar atualizacao` forca a verificacao.

## 8. Licencas

pdf.js e da Mozilla Foundation, sob licenca Apache 2.0 (copia em
`LICENSE-pdfjs.txt`). Sob licenca MIT ou compativel: piper-tts-web (Mintplex
Labs, derivado do @diffusionstudio/vits-web), o phonemizador do Piper com os
dados do eSpeak NG, o ONNX Runtime Web (Microsoft) e o lamejs (copia em
`LICENSE-lamejs.txt`). O arquivo `piper-tts-web.js` traz tres alteracoes
assinaladas em um comentario no topo dele. O restante do codigo foi escrito
para este projeto e pode ser usado e modificado livremente.
