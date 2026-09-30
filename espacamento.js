/* =========================================================================
   espacamento.js
   -------------------------------------------------------------------------
   O PROBLEMA

   Muitos PDFs — sobretudo cabecalhos de tribunal, ementas e paginas passadas
   por OCR — trazem o texto com as letras afastadas umas das outras:

       P O D E R   J U D I C I A R I O
       E M E N T A

   Ao copiar esse trecho, as letras vem separadas por espaco. O sintetizador
   de voz entao soletra: "pe, o, de, e, erre...". Ilegivel.

   A CORRECAO INGENUA NAO SERVE

   Apagar todos os espacos resolveria a soletracao e criaria um problema
   pior: "PODERJUDICIARIO". E preciso apagar apenas os espacos que estao
   DENTRO das palavras, preservando os que separam palavras.

   COMO DISTINGUIR UM DO OUTRO

   Quem diagramou o documento afastou as letras, mas afastou AINDA MAIS as
   palavras. Esse degrau sobrevive a extracao: entre letras costuma sobrar um
   espaco, entre palavras sobram dois ou mais. A regra, portanto, e:

       o menor vao da linha separa letras;
       qualquer vao maior que ele separa palavras.

   Isso funciona seja o degrau 1 contra 2 espacos, seja 2 contra 3, e nao
   depende de dicionario nenhum.

   QUANDO NAO HA DEGRAU

   Ha casos em que a extracao achata tudo em espacos iguais e a informacao se
   perde de vez. So nesse caso recorremos a um dicionario de frequencia do
   portugues (palavras-pt.txt) para reencontrar as palavras. Se
   o dicionario nao resolver a linha inteira com seguranca, deixamos o texto
   como estava: e melhor uma linha soletrada do que uma linha adivinhada
   errado.

   Este arquivo expoe o objeto global Espacamento.
   ========================================================================= */

const Espacamento = (() => {
  "use strict";

  /* Espacos "exoticos" que os PDFs usam para afastar letras. */
  const OUTROS_ESPACOS = /[   -   　\t]/g;

  /* =======================================================================
     O DICIONARIO (usado so no ultimo recurso)
     ======================================================================= */

  let ranking = null;          // Map: palavra -> posicao na lista (0 = mais comum)
  let rankingSemAcento = null; // a mesma lista sem acentos, porque cabecalhos
                               // em caixa alta costumam vir sem acentuacao
  let promessaCarga = null;

  function semAcento(s) {
    return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
  }

  /** Posicao da palavra na lista de frequencia, ou undefined. */
  function posicaoDaPalavra(p) {
    if (!ranking) return undefined;
    const minuscula = p.toLowerCase();
    const exata = ranking.get(minuscula);
    if (exata !== undefined) return exata;
    return rankingSemAcento ? rankingSemAcento.get(semAcento(minuscula)) : undefined;
  }

  /**
   * Carrega a lista de palavras. E chamada uma vez, na abertura do
   * aplicativo, e nao bloqueia nada.
   */
  function carregarDicionario(url) {
    if (promessaCarga) return promessaCarga;
    promessaCarga = fetch(url)
      .then((r) => (r.ok ? r.text() : ""))
      .then((texto) => {
        const mapa = new Map();
        const mapaSemAcento = new Map();
        const linhas = texto.split("\n");
        for (let i = 0; i < linhas.length; i++) {
          const p = linhas[i].trim();
          if (!p) continue;
          // Guardamos a PRIMEIRA posicao, que e a mais frequente.
          if (!mapa.has(p)) mapa.set(p, i);
          const sem = semAcento(p);
          if (!mapaSemAcento.has(sem)) mapaSemAcento.set(sem, i);
        }
        ranking = mapa.size ? mapa : null;
        rankingSemAcento = mapa.size ? mapaSemAcento : null;
        return ranking;
      })
      .catch(() => {
        ranking = null;   // sem dicionario o aplicativo continua funcionando
        return null;
      });
    return promessaCarga;
  }

  function pronto() {
    return promessaCarga || Promise.resolve(null);
  }

  function temDicionario() {
    return !!ranking;
  }

  /* -----------------------------------------------------------------------
     Contador de correcoes, para avisar o usuario que a correcao atuou.
     ----------------------------------------------------------------------- */
  let contagem = 0;
  function zerarContagem() { contagem = 0; }
  function lerContagem() { return contagem; }

  /* =======================================================================
     FUNCAO PRINCIPAL
     ======================================================================= */

  /**
   * Corrige o espacamento de um texto inteiro, linha a linha.
   * @returns {{texto: string, trechos: number}}
   */
  function corrigirTexto(texto) {
    // Normaliza as quebras de linha antes de qualquer coisa. Texto vindo do
    // Windows, de formularios ou do menu Compartilhar chega com \r\n, e um
    // \r pendurado no fim da linha faria "E M E N T A" virar "EMENTA\r" —
    // que nao passa nas checagens seguintes e ficaria sem correcao.
    const entrada = String(texto || "").replace(/\r\n?/g, "\n");
    if (!entrada) return { texto: entrada, trechos: 0 };

    let trechos = 0;
    const saida = entrada.split("\n").map((linha) => {
      const r = corrigirLinha(linha);
      trechos += r.trechos;
      return r.linha;
    });

    return { texto: saida.join("\n"), trechos };
  }

  /**
   * Corrige uma linha. Devolve a propria linha, intacta, quando nao ha nada
   * a fazer ou quando nao ha como decidir com seguranca.
   */
  function corrigirLinha(linhaOriginal) {
    const resultado = analisarLinha(linhaOriginal);
    contagem += resultado.trechos;
    return resultado;
  }

  function analisarLinha(linhaOriginal) {
    const original = String(linhaOriginal || "").replace(/[\r\u000b\f]/g, "");
    const linha = original.replace(OUTROS_ESPACOS, " ");
    if (!/ /.test(linha)) return { linha: original, trechos: 0 };

    const { pedacos, lacunas } = repartir(linha);
    if (pedacos.length < 4) return { linha: original, trechos: 0 };

    const soltos = pedacos.reduce((s, p) => s + (p.length === 1 ? 1 : 0), 0);
    const soltosLetra = pedacos.reduce(
      (s, p) => s + (p.length === 1 && /\p{L}/u.test(p) ? 1 : 0),
      0
    );
    const proporcaoSolta = soltos / pedacos.length;

    // A linha inteira esta soletrada? Duas exigencias:
    //   - quase TODOS os pedacos tem um caractere so (um limite frouxo
    //     confundiria frases legitimas cheias de palavras curtas, como
    //     "de A a Z e de 1 a 9");
    //   - pelo menos cinco desses pedacos sao LETRAS, porque quem espaca
    //     texto espaca letras; uma linha cheia de algarismos soltos, como um
    //     numero de processo, e caso para o tratamento de trechos isolados.
    if (soltos >= 5 && soltosLetra >= 5 && proporcaoSolta >= 0.8) {
      return corrigirLinhaSoletrada(original, pedacos, lacunas);
    }

    // Nao esta: pode haver, ainda assim, uma palavra solta no meio de texto
    // normal, como em  Trata-se de A P E L A C A O civel.
    return corrigirTrechosSoltos(original, pedacos, lacunas);
  }

  /* Divide a linha em pedacos (sem espaco) e lacunas (quantos espacos ha
     entre um pedaco e o seguinte). */
  function repartir(linha) {
    const pedacos = [];
    const lacunas = [];
    const partes = linha.split(/( +)/);

    for (const parte of partes) {
      if (parte === "") continue;
      if (/^ +$/.test(parte)) {
        if (pedacos.length) lacunas[pedacos.length - 1] = parte.length;
      } else {
        pedacos.push(parte);
      }
    }
    lacunas.length = Math.max(0, pedacos.length - 1);
    for (let i = 0; i < lacunas.length; i++) {
      if (!lacunas[i]) lacunas[i] = 1;
    }
    return { pedacos, lacunas };
  }

  /* ---------------------- linha inteira soletrada ---------------------- */
  function corrigirLinhaSoletrada(original, pedacos, lacunas) {
    const menorLacuna = Math.min.apply(null, lacunas);
    const haDegrau = lacunas.some((l) => l > menorLacuna);

    if (haDegrau) {
      // O caminho bom: o proprio espacamento diz onde termina cada palavra.
      let saida = pedacos[0];
      for (let i = 1; i < pedacos.length; i++) {
        saida += (lacunas[i - 1] > menorLacuna ? " " : "") + pedacos[i];
      }
      return { linha: saida, trechos: 1 };
    }

    // Sem degrau: ultimo recurso, o dicionario. So o acionamos em linhas
    // feitas apenas de letras — tipicamente cabecalhos e titulos. Misturar
    // algarismos e pontuacao multiplicaria as divisoes possiveis e, com elas,
    // a chance de errar.
    const colado = pedacos.join("");
    if (!/^\p{L}+[.:;]?$/u.test(colado)) return { linha: original, trechos: 0 };

    const reconstruida = separarPorDicionario(colado);
    if (reconstruida && reconstruida !== pedacos.join(" ")) {
      return { linha: reconstruida, trechos: 1 };
    }

    return { linha: original, trechos: 0 };
  }

  /* ------------------- palavras soltas em linha normal ------------------ */

  /** "L" para letras, "N" para algarismos e pontuacao. */
  function classeDoCaractere(c) {
    return /\p{L}/u.test(c) ? "L" : "N";
  }

  /**
   * Decide se vale colar uma sequencia solta encontrada no meio de texto
   * normal. Colamos quando o resultado e um numero ou referencia, quando e
   * palavra que o dicionario reconhece, ou quando a sequencia tem seis ou
   * mais caracteres isolados. "A a Z e", com quatro e sem ser palavra, fica
   * como esta.
   */
  function vaiColar(colado, quantos) {
    if (/^[\d.,\-/:§º°ª]+$/.test(colado)) return true;
    if (posicaoDaPalavra(colado.replace(/[^\p{L}]/gu, "")) !== undefined) return true;
    return quantos >= 6;
  }

  function corrigirTrechosSoltos(original, pedacos, lacunas) {
    const menorLacuna = Math.min.apply(null, lacunas);
    const saida = [];
    let trechos = 0;
    let i = 0;

    while (i < pedacos.length) {
      if (pedacos[i].length === 1) {
        // A sequencia tem de ser homogenea: ou so letras, ou so algarismos e
        // pontuacao. Isso impede que "fls. 3 2 0 e 4 5 1" vire "320e451" —
        // ali o "e" e a conjuncao, nao uma letra solta.
        const classe = classeDoCaractere(pedacos[i]);
        let j = i;
        while (
          j + 1 < pedacos.length &&
          pedacos[j + 1].length === 1 &&
          classeDoCaractere(pedacos[j + 1]) === classe &&
          lacunas[j] === menorLacuna
        ) {
          j++;
        }
        const quantos = j - i + 1;
        const colado = pedacos.slice(i, j + 1).join("");
        if (quantos >= 4 && vaiColar(colado, quantos)) {
          saida.push(colado);
          trechos++;
          i = j + 1;
          continue;
        }
      }
      saida.push(pedacos[i]);
      i++;
    }

    if (!trechos) return { linha: original, trechos: 0 };
    return { linha: saida.join(" "), trechos };
  }

  /* =======================================================================
     ULTIMO RECURSO: separar por dicionario
     -------------------------------------------------------------------------
     Recebe algo como "PODERJUDICIARIODOESTADO" e tenta devolver
     "PODER JUDICIARIO DO ESTADO".

     Programacao dinamica: para cada posicao da cadeia guardamos o menor
     custo de chegar ate ali. Cada palavra conhecida custa pouco (e tanto
     menos quanto mais comum ela for); cada pedaco desconhecido custa caro.
     Assim a divisao escolhida usa poucas palavras e palavras frequentes —
     que e como um leitor humano tambem resolveria.
     ======================================================================= */

  const TAMANHO_MAXIMO_PALAVRA = 22;
  const CUSTO_POR_PALAVRA = 4;        // desestimula picotar demais
  const CUSTO_DESCONHECIDA = 22;

  function custoDaPalavra(p) {
    const posicao = posicaoDaPalavra(p);
    if (posicao === undefined) return CUSTO_DESCONHECIDA + p.length * 2;
    return CUSTO_POR_PALAVRA + Math.log(posicao + 2);
  }

  function separarPorDicionario(colado) {
    if (!ranking || colado.length < 4) return null;

    const blocos = colado.split(/([^\p{L}]+)/u);
    let letrasConhecidas = 0;
    let totalLetras = 0;
    const saida = [];

    for (const bloco of blocos) {
      if (!bloco) continue;
      if (!/\p{L}/u.test(bloco)) {
        saida.push(bloco);
        continue;
      }
      totalLetras += bloco.length;
      const palavras = dividirBloco(bloco);
      if (!palavras) return null;
      for (const p of palavras) {
        if (posicaoDaPalavra(p) !== undefined) letrasConhecidas += p.length;
      }
      saida.push(palavras.join(" "));
    }

    // Exigimos que quase tudo tenha caido em palavras reconhecidas; caso
    // contrario a divisao e chute, e chute nao entra no texto do usuario.
    if (!totalLetras || letrasConhecidas / totalLetras < 0.85) return null;

    return saida.join("").replace(/\s{2,}/g, " ").trim();
  }

  function dividirBloco(bloco) {
    const n = bloco.length;
    const custo = new Array(n + 1).fill(Infinity);
    const anterior = new Array(n + 1).fill(-1);
    custo[0] = 0;

    for (let fim = 1; fim <= n; fim++) {
      const inicioMinimo = Math.max(0, fim - TAMANHO_MAXIMO_PALAVRA);
      for (let inicio = inicioMinimo; inicio < fim; inicio++) {
        if (custo[inicio] === Infinity) continue;
        const candidato = custo[inicio] + custoDaPalavra(bloco.slice(inicio, fim));
        if (candidato < custo[fim]) {
          custo[fim] = candidato;
          anterior[fim] = inicio;
        }
      }
    }

    if (custo[n] === Infinity) return null;

    const palavras = [];
    let fim = n;
    while (fim > 0) {
      const inicio = anterior[fim];
      palavras.unshift(bloco.slice(inicio, fim));
      fim = inicio;
    }
    return palavras;
  }

  /* Diagnostico: a linha parece soletrada? */
  function pareceEspacado(texto) {
    const linhas = String(texto || "").split("\n");
    for (const linha of linhas) {
      const pedacos = linha.trim().split(/ +/).filter(Boolean);
      if (pedacos.length < 5) continue;
      const soltos = pedacos.reduce((s, p) => s + (p.length === 1 ? 1 : 0), 0);
      if (soltos >= 5 && soltos / pedacos.length >= 0.5) return true;
    }
    return false;
  }

  return {
    carregarDicionario,
    pronto,
    temDicionario,
    corrigirTexto,
    corrigirLinha,
    pareceEspacado,
    separarPorDicionario,
    zerarContagem,
    lerContagem
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = Espacamento;
