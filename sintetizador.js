/* =========================================================================
   sintetizador.js — worker que produz o arquivo MP3
   -------------------------------------------------------------------------
   POR QUE UM MOTOR DIFERENTE DO DA LEITURA?

   A leitura em voz alta usa a Web Speech API, que entrega o som direto ao
   sistema e nao devolve nenhuma amostra a pagina. Nao ha como gravar o que
   ela fala: a especificacao recusa esse acesso de proposito. Para ter um
   arquivo e preciso um sintetizador que DEVOLVA as amostras em vez de apenas
   toca-las. Aqui esse sintetizador e o Piper, da Rhasspy, compilado para
   WebAssembly e executado pelo ONNX Runtime — tudo dentro do aplicativo, sem
   servidor e sem custo.

   POR QUE UM WORKER?

   Sintetizar e trabalho pesado de processador. Se rodasse na mesma linha de
   execucao da pagina, a tela congelaria do inicio ao fim. O worker roda em
   paralelo: a interface continua respondendo, mostrando progresso e aceitando
   o cancelamento.

   O CAMINHO DE UM DOCUMENTO ATE O MP3

     1. a pagina manda a lista de trechos (o texto JA com as abreviaturas
        expandidas, o mesmo que a leitura em voz pronuncia);
     2. para cada trecho, o Piper devolve um WAV curto;
     3. lemos as amostras desse WAV e as entregamos ao codificador de MP3,
        junto com um silencio proporcional a pontuacao;
     4. no fim, fechamos o codificador e devolvemos o arquivo pronto.

   Codificar em pedacos, e nao no fim, evita guardar horas de audio bruto na
   memoria — o que importa muito num celular.
   ========================================================================= */

import "./ambiente.js"; // PRECISA vir antes dos demais — ver o arquivo
import { TtsSession, stored, remove } from "./piper-tts-web.js";
import { Mp3Encoder } from "./lamejs.js";

/* A biblioteca guarda cada arquivo do modelo pelo ultimo trecho da URL de
   origem, dentro de uma pasta "piper" no armazenamento privado do navegador.
   Tanto a copia vinda do site quanto a escolhida a mao precisam respeitar
   exatamente esses nomes. */
const PASTA_MODELOS = "piper";

let sessao = null;
let vozDaSessao = null;
let cancelado = false;

/* =========================================================================
   RECEBIMENTO DE ORDENS
   ========================================================================= */

self.onmessage = async (evento) => {
  const ordem = evento.data || {};
  try {
    switch (ordem.tipo) {
      case "estado":
        responder("estado", { vozesGuardadas: await stored() });
        break;

      case "instalarModeloDaRede":
        await instalarModeloDaRede(ordem.vozId, ordem.urls);
        responder("modeloPronto", { vozId: ordem.vozId, vozesGuardadas: await stored() });
        break;

      case "instalarModeloDoDisco":
        await gravarArquivos(ordem.arquivos);
        responder("modeloPronto", { vozId: ordem.vozId, vozesGuardadas: await stored() });
        break;

      case "apagarModelo":
        await remove(ordem.vozId);
        sessao = null;
        vozDaSessao = null;
        responder("estado", { vozesGuardadas: await stored() });
        break;

      case "gerar":
        cancelado = false;
        await gerarMp3(ordem);
        break;

      case "cancelar":
        cancelado = true;
        break;

      default:
        responder("erro", { mensagem: "Ordem desconhecida: " + ordem.tipo });
    }
  } catch (erro) {
    responder("erro", { mensagem: descreverErro(erro) });
  }
};

function responder(tipo, dados) {
  self.postMessage(Object.assign({ tipo }, dados || {}));
}

function descreverErro(erro) {
  if (!erro) return "erro desconhecido";
  if (typeof erro === "string") return erro;
  return erro.message || String(erro);
}

/* =========================================================================
   INSTALACAO DO MODELO DE VOZ
   -------------------------------------------------------------------------
   Dois caminhos, que terminam no mesmo lugar:

     - da rede: os dois arquivos vem do proprio site (estao ao lado dos
       demais, na raiz do repositorio), com barra de progresso;
     - do disco: o usuario escolhe os arquivos que ja baixou.

   Em ambos gravamos no armazenamento privado do navegador, que sobrevive ao
   fechamento do aplicativo e funciona sem rede depois.
   ========================================================================= */

async function instalarModeloDaRede(vozId, urls) {
  const arquivos = [];

  for (const item of urls) {
    const resposta = await fetch(item.url);
    if (!resposta.ok) {
      throw new Error(
        `Nao encontrei ${item.nome} (resposta ${resposta.status}). ` +
          "Confira se o arquivo foi enviado ao repositorio, junto com os demais."
      );
    }

    // Leitura em pedacos, para poder mostrar progresso em arquivos grandes.
    const total = Number(resposta.headers.get("content-length")) || 0;
    const leitor = resposta.body && resposta.body.getReader ? resposta.body.getReader() : null;

    if (!leitor) {
      arquivos.push({ nome: item.nome, dados: await resposta.arrayBuffer() });
      continue;
    }

    const partes = [];
    let recebido = 0;
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      partes.push(value);
      recebido += value.length;
      responder("progressoModelo", { carregado: recebido, total, nome: item.nome });
    }
    arquivos.push({ nome: item.nome, dados: new Blob(partes) });
  }

  await gravarArquivos(arquivos);
}

async function gravarArquivos(arquivos) {
  const raiz = await navigator.storage.getDirectory();
  const pasta = await raiz.getDirectoryHandle(PASTA_MODELOS, { create: true });

  for (const arquivo of arquivos) {
    const destino = await pasta.getFileHandle(arquivo.nome, { create: true });
    const canal = await destino.createWritable();
    await canal.write(arquivo.dados);
    await canal.close();
  }
}

/* =========================================================================
   GERACAO DO MP3
   ========================================================================= */

async function gerarMp3(ordem) {
  const trechos = ordem.trechos || [];
  if (!trechos.length) {
    responder("erro", { mensagem: "Nao ha texto para converter." });
    return;
  }

  /* --- 1. sessao de sintese ------------------------------------------- */
  responder("fase", { fase: "preparando" });

  if (!sessao || vozDaSessao !== ordem.vozId) {
    sessao = await TtsSession.create({
      voiceId: ordem.vozId,
      wasmPaths: ordem.caminhos
    });
    vozDaSessao = ordem.vozId;
  }
  // Velocidade da fala. No Piper o numero e uma ESCALA DE DURACAO: quanto
  // maior, mais devagar. Invertemos para que a tela fale em "velocidade".
  sessao.escalaDeDuracao = 1 / Math.max(0.5, Math.min(2, ordem.velocidade || 1));

  /* --- 2. trecho a trecho ---------------------------------------------- */
  let codificador = null;
  let taxaDeAmostragem = 0;
  const pedacos = [];
  let amostrasTotais = 0;
  const comecou = Date.now();

  for (let i = 0; i < trechos.length; i++) {
    if (cancelado) {
      responder("cancelado", {});
      return;
    }

    const trecho = trechos[i];
    const texto = (trecho.fala || "").trim();

    if (texto) {
      const wav = await sessao.predict(texto);
      const audio = lerWav(await wav.arrayBuffer());

      if (!codificador) {
        taxaDeAmostragem = audio.taxa;
        codificador = new Mp3Encoder(1, audio.taxa, ordem.kbps || 48);
      }
      amostrasTotais += audio.amostras.length;
      codificar(codificador, audio.amostras, pedacos);
    }

    // Silencio depois do trecho: e o que transforma uma sequencia de pedacos
    // em algo que soa como leitura, e nao como uma lista.
    if (codificador && trecho.pausa > 0) {
      const silencio = new Int16Array(Math.round(taxaDeAmostragem * trecho.pausa));
      amostrasTotais += silencio.length;
      codificar(codificador, silencio, pedacos);
    }

    const decorrido = (Date.now() - comecou) / 1000;
    responder("progresso", {
      feitas: i + 1,
      total: trechos.length,
      segundosDeAudio: taxaDeAmostragem ? amostrasTotais / taxaDeAmostragem : 0,
      decorrido,
      // Estimativa simples: o ritmo medio ate agora vale para o que falta.
      restante: decorrido * ((trechos.length - (i + 1)) / (i + 1))
    });
  }

  /* --- 3. fechamento --------------------------------------------------- */
  if (!codificador) {
    responder("erro", { mensagem: "Nao ha texto para converter." });
    return;
  }

  const sobra = codificador.flush();
  if (sobra && sobra.length) pedacos.push(new Uint8Array(sobra));

  const arquivo = new Blob(pedacos, { type: "audio/mpeg" });
  responder("pronto", {
    arquivo,
    segundosDeAudio: amostrasTotais / taxaDeAmostragem,
    bytes: arquivo.size
  });
}

/**
 * O codificador de MP3 trabalha em quadros de 1152 amostras. Entregar o audio
 * nesse tamanho evita alocacoes grandes e mantem o uso de memoria estavel
 * mesmo em documentos de horas.
 */
function codificar(codificador, amostras, pedacos) {
  const QUADRO = 1152;
  for (let i = 0; i < amostras.length; i += QUADRO) {
    const bloco = amostras.subarray(i, Math.min(i + QUADRO, amostras.length));
    const saida = codificador.encodeBuffer(bloco);
    if (saida && saida.length) pedacos.push(new Uint8Array(saida));
  }
}

/* =========================================================================
   LEITURA DO WAV DEVOLVIDO PELO PIPER
   -------------------------------------------------------------------------
   O Piper devolve WAV de 16 bits, um canal. Ainda assim percorremos os blocos
   do arquivo em vez de assumir o cabecalho de 44 bytes: se algum dia a
   biblioteca acrescentar um bloco extra, a leitura continua correta.
   ========================================================================= */

function lerWav(buffer) {
  const visao = new DataView(buffer);

  if (texto4(visao, 0) !== "RIFF" || texto4(visao, 8) !== "WAVE") {
    throw new Error("O sintetizador devolveu um formato de audio inesperado.");
  }

  let posicao = 12;
  let taxa = 22050;
  let bits = 16;
  let canais = 1;
  let inicioDados = -1;
  let tamanhoDados = 0;

  while (posicao + 8 <= visao.byteLength) {
    const nome = texto4(visao, posicao);
    const tamanho = visao.getUint32(posicao + 4, true);
    const corpo = posicao + 8;

    if (nome === "fmt ") {
      canais = visao.getUint16(corpo + 2, true);
      taxa = visao.getUint32(corpo + 4, true);
      bits = visao.getUint16(corpo + 14, true);
    } else if (nome === "data") {
      inicioDados = corpo;
      tamanhoDados = Math.min(tamanho, visao.byteLength - corpo);
      break;
    }
    posicao = corpo + tamanho + (tamanho % 2); // blocos tem tamanho par
  }

  if (inicioDados < 0) throw new Error("O audio veio sem bloco de dados.");
  if (bits !== 16) throw new Error("Esperava audio de 16 bits, veio de " + bits + ".");

  // Int16Array exige endereco par dentro do buffer. Normalmente os dados
  // comecam no byte 44, mas se um bloco extra deslocar isso, copiamos.
  let amostras;
  if (inicioDados % 2 === 0) {
    amostras = new Int16Array(buffer, inicioDados, Math.floor(tamanhoDados / 2));
  } else {
    amostras = new Int16Array(buffer.slice(inicioDados, inicioDados + tamanhoDados));
  }

  // Se algum modelo devolver dois canais, ficamos com o primeiro.
  if (canais > 1) {
    const mono = new Int16Array(Math.floor(amostras.length / canais));
    for (let i = 0; i < mono.length; i++) mono[i] = amostras[i * canais];
    amostras = mono;
  }

  return { amostras, taxa };
}

function texto4(visao, posicao) {
  return String.fromCharCode(
    visao.getUint8(posicao),
    visao.getUint8(posicao + 1),
    visao.getUint8(posicao + 2),
    visao.getUint8(posicao + 3)
  );
}
