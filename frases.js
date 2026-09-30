/* =========================================================================
   frases.js
   -------------------------------------------------------------------------
   Duas tarefas moram aqui:

   (A) LIMPAR o texto que sai de um PDF. O PDF nao guarda paragrafos: ele
       guarda linhas soltas. Se entregarmos isso direto ao sintetizador, a
       voz para no fim de cada linha e o resultado fica picotado. Aqui
       remontamos os paragrafos, colamos palavras cortadas por hifen no fim
       da linha e jogamos fora numeros de pagina soltos.

   (B) DIVIDIR o texto em frases. Parece trivial ("corte nos pontos"), mas
       em texto juridico o ponto quase nunca termina uma frase:
           art. 5.o     n. 1.234       Des. Mauro Ferrandin
           fls. 320     j. 10/06/2025  5029223-53.2024.8.24.0930
       Se cortarmos ingenuamente, a leitura vira uma sucessao de fragmentos.
       A solucao adotada: antes de cortar, escondemos os pontos que sabemos
       nao ser fim de frase, cortamos, e depois devolvemos os pontos.

   Este arquivo nao depende de nada. Ele expoe um objeto global chamado
   Frases, usado pelo app.js.
   ========================================================================= */

const Frases = (() => {
  "use strict";

  // Marcador improvavel de aparecer em texto real. Usado para "esconder"
  // temporariamente os pontos que nao encerram frase.
  const PONTO_FALSO = "\u0001"; // caractere de controle, invisivel e inexistente em texto real

  /* -----------------------------------------------------------------------
     Abreviaturas depois das quais o ponto NAO encerra a frase.
     A lista e generosa de proposito: e melhor juntar duas frases do que
     picotar uma no meio.
     ----------------------------------------------------------------------- */
  const ABREVIATURAS = [
    // juridicas
    "art", "arts", "inc", "incs", "al", "par", "cap", "caput", "proc", "procs",
    "fl", "fls", "f", "vol", "p", "pp", "pag", "pags", "n", "no", "num", "nums",
    "rel", "relª", "red", "ac", "acord", "ap", "apel", "ag", "agr", "emb",
    "sum", "sums", "obs", "cf", "seq", "ss", "loc", "cit", "op", "ob",
    "id", "ibid",
    // Nomes de codigos (CPC, CPP, CC, CLT...) NAO entram nesta lista:
    // quando aparecem seguidos de ponto, quase sempre e fim de frase.
    // tratamento
    "sr", "sra", "srs", "sras", "dr", "dra", "drs", "dras", "prof", "profa",
    "exmo", "exma", "ilmo", "ilma", "mm", "mmo", "des", "desa", "desª",
    "min", "mina", "ministro", "exa", "v", "vv", "sto", "sta", "s",
    // gerais
    "etc", "ex", "eg", "ie", "aprox", "sec", "secs", "ed", "eds", "org",
    "ltda", "cia", "esq", "av", "jan", "fev", "mar", "abr", "mai", "jun",
    "jul", "ago", "set", "out", "nov", "dez", "seg", "ter", "qua", "qui",
    "sex", "sab", "dom", "tel", "cep", "km", "kg", "hab", "j", "dje", "dj"
  ];

  // Monta uma expressao regular unica com todas as abreviaturas.
  // (?<=...) significa "logo depois de", sem consumir o texto.
  const RE_ABREVIATURAS = new RegExp(
    "(?<=\\b(?:" + ABREVIATURAS.join("|") + "))\\.",
    "gi"
  );

  /* =======================================================================
     (A) LIMPEZA DO TEXTO EXTRAIDO DE PDF
     ======================================================================= */

  /**
   * Recebe as linhas cruas de uma pagina de PDF e devolve paragrafos.
   *
   * @param {string[]} linhas
   * @param {object} opcoes
   *   - removerNumerosDePagina: joga fora linhas que sao so um numero
   *   - removerCabecalhos: joga fora linhas curtas TODAS EM MAIUSCULAS
   *   - corretorDeEspacamento: objeto Espacamento, para juntar letras soltas
   * @returns {string} texto com paragrafos separados por linha em branco
   */
  function juntarLinhasDePdf(linhas, opcoes) {
    const op = Object.assign(
      {
        removerNumerosDePagina: true,
        removerCabecalhos: false,
        corretorDeEspacamento: null
      },
      opcoes || {}
    );

    // 1. Limpeza linha a linha.
    //    A correcao de letras afastadas vem ANTES de tudo: ela depende dos
    //    espacos multiplos que marcam as fronteiras de palavra, e o proximo
    //    passo justamente achata todo espaco em um so.
    let limpas = linhas
      .map((l) =>
        op.corretorDeEspacamento ? op.corretorDeEspacamento.corrigirLinha(l).linha : l
      )
      .map((l) => l.replace(/\s+/g, " ").trim())
      .filter((l) => l.length > 0);

    if (op.removerNumerosDePagina) {
      limpas = limpas.filter((l) => !ehNumeroDePagina(l));
    }

    if (op.removerCabecalhos) {
      limpas = limpas.filter((l) => !(l.length <= 60 && /^[^a-z]+$/.test(l) && /[A-Z]/.test(l)));
    }

    // 2. Remontagem dos paragrafos
    const paragrafos = [];
    let atual = "";
    // Quando a linha anterior terminou com palavra cortada por hifen, a
    // proxima linha precisa ser colada SEM espaco no meio.
    let colarSemEspaco = false;

    for (let i = 0; i < limpas.length; i++) {
      const linha = limpas[i];
      const proxima = limpas[i + 1] || "";

      const separador = atual === "" ? "" : (colarSemEspaco ? "" : " ");
      colarSemEspaco = false;

      // Palavra cortada por hifen no fim da linha: "responsabili-" + "dade"
      if (/[a-zà-ÿ]-$/i.test(linha) && /^[a-zà-ÿ]/i.test(proxima)) {
        atual += separador + linha.slice(0, -1);
        colarSemEspaco = true;
        continue;
      }

      atual += separador + linha;

      // Decide se o paragrafo termina aqui.
      const terminaComPontuacao = /[.!?:;”"'’\)]$/.test(linha);
      const proximaComecaMaiuscula = /^[A-ZÀ-Þ0-9“"'(§]/.test(proxima);
      const linhaCurta = linha.length < 55;
      const naoHaProxima = proxima === "";

      // Titulos e cabecalhos costumam vir TODOS EM MAIUSCULAS e sem ponto
      // final. Merecem paragrafo proprio, senao grudam no texto seguinte.
      const ehTitulo =
        linha.length < 90 &&
        /[A-ZÀ-Þ]/.test(linha) &&
        linha === linha.toUpperCase() &&
        !(proxima && proxima === proxima.toUpperCase() && /[A-ZÀ-Þ]/.test(proxima));

      if (naoHaProxima || ehTitulo || (terminaComPontuacao && (proximaComecaMaiuscula || linhaCurta))) {
        paragrafos.push(atual.trim());
        atual = "";
      }
    }
    if (atual.trim()) paragrafos.push(atual.trim());

    return paragrafos.join("\n\n");
  }

  /** "12", "- 12 -", "Pagina 12", "XIV" e afins. */
  function ehNumeroDePagina(linha) {
    const l = linha.trim();
    if (l.length > 24) return false;
    return (
      /^[-–—\s.]*\d{1,4}[-–—\s.]*$/.test(l) ||
      /^p[aá]g(ina)?\.?\s*\d{1,4}$/i.test(l) ||
      /^\d{1,4}\s*\/\s*\d{1,4}$/.test(l) ||
      /^[IVXLCDM]{1,7}$/.test(l)
    );
  }

  /** Limpeza leve, usada para texto colado ou vindo de arquivos .txt */
  function normalizarTextoSimples(texto) {
    return String(texto || "")
      .replace(/\r\n?/g, "\n")
      .replace(/­/g, "")   // hifen invisivel (soft hyphen)
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  /* =======================================================================
     (B) DIVISAO EM FRASES
     ======================================================================= */

  /**
   * Divide um texto em frases, respeitando as abreviaturas juridicas.
   *
   * @param {string} texto
   * @param {number} tamanhoMaximo  frases maiores que isso sao quebradas de
   *                                novo (em virgulas e ponto e virgula), para
   *                                contornar o limite do sintetizador, que
   *                                corta falas muito longas.
   * @returns {string[]}
   */
  function dividirEmFrases(texto, tamanhoMaximo) {
    const limite = tamanhoMaximo || 240;
    const bruto = normalizarTextoSimples(texto);
    if (!bruto) return [];

    const saida = [];

    // Cada paragrafo e tratado separadamente: assim uma quebra de paragrafo
    // sempre encerra a frase, o que costuma estar certo.
    for (const paragrafo of bruto.split(/\n\s*\n/)) {
      const p = paragrafo.replace(/\n/g, " ").trim();
      if (!p) continue;

      // 1. Esconder os pontos que nao encerram frase.
      const protegido = p
        // abreviaturas conhecidas: art. n. fls. Des. ...
        .replace(RE_ABREVIATURAS, PONTO_FALSO)
        // ponto entre digitos: 1.234  ou  5029223-53.2024.8.24.0930
        .replace(/(\d)\.(?=\d)/g, "$1" + PONTO_FALSO)
        // ponto depois de uma inicial isolada: J. Silva
        .replace(/(\b[A-ZÀ-Þ])\.(?=\s+[A-ZÀ-Þ])/g, "$1" + PONTO_FALSO)
        // reticencias
        .replace(/\.\.\./g, PONTO_FALSO + PONTO_FALSO + PONTO_FALSO)
        // ponto seguido de minuscula quase nunca encerra frase
        .replace(/\.(?=\s+[a-zà-ÿ])/g, PONTO_FALSO);

      // 2. Cortar depois de . ! ? seguidos de espaco, ou no fim do texto.
      const pedacos = protegido
        .split(/(?<=[.!?…]["”’)\]]*)\s+/)
        .map((f) => f.replace(new RegExp(PONTO_FALSO, "g"), "."))
        .map((f) => f.trim())
        .filter(Boolean);

      // 3. Quebrar frases longas demais.
      for (const frase of pedacos) {
        if (frase.length <= limite) {
          saida.push(frase);
        } else {
          saida.push(...quebrarFraseLonga(frase, limite));
        }
      }
    }

    return saida;
  }

  /**
   * Quebra uma frase muito longa em pedacos menores, preferindo cortar em
   * ponto e virgula, dois pontos ou virgula. Se nada disso existir, corta
   * no ultimo espaco antes do limite.
   */
  function quebrarFraseLonga(frase, limite) {
    const partes = [];
    let resto = frase;

    while (resto.length > limite) {
      const janela = resto.slice(0, limite);
      let corte = -1;

      for (const sinal of [";", ":", ",", " — ", " – "]) {
        const pos = janela.lastIndexOf(sinal);
        if (pos > limite * 0.4 && pos > corte) corte = pos + sinal.length;
      }
      if (corte < 0) {
        corte = janela.lastIndexOf(" ");
        if (corte < limite * 0.4) corte = limite; // ultimo recurso
      }

      partes.push(resto.slice(0, corte).trim());
      resto = resto.slice(corte).trim();
    }

    if (resto) partes.push(resto);
    return partes.filter(Boolean);
  }

  // O que este arquivo torna publico:
  return {
    juntarLinhasDePdf,
    normalizarTextoSimples,
    dividirEmFrases,
    ehNumeroDePagina
  };
})();

// Permite testar este arquivo fora do navegador (com Node.js), sem atrapalhar
// o uso normal no aplicativo.
if (typeof module !== "undefined" && module.exports) module.exports = Frases;
