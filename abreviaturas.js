/* =========================================================================
   abreviaturas.js
   -------------------------------------------------------------------------
   O sintetizador de voz le o que esta escrito, literalmente. Em texto comum
   isso basta; em texto juridico, nao. Sem ajuda, a voz diz:

       "art" em vez de "artigo"
       "stj" como se fosse palavra
       um numero de processo lido como um numero de treze digitos

   Este arquivo guarda um dicionario de pronuncia e a funcao que o aplica.

   REGRA IMPORTANTE: a substituicao vale SOMENTE para o que e FALADO.
   O texto exibido na tela permanece exatamente como no documento original.
   Por isso o aplicativo guarda, para cada frase, duas versoes: "texto" (o que
   voce le) e "fala" (o que a voz pronuncia).
   ========================================================================= */

const Abreviaturas = (() => {
  "use strict";

  /* -----------------------------------------------------------------------
     Dicionario padrao.
     Formato: [ "o que esta escrito", "como deve ser falado" ]
     Voce pode acrescentar, remover ou corrigir tudo isso na aba
     "Ajustes" do aplicativo, sem mexer no codigo.
     ----------------------------------------------------------------------- */

  // (1) Abreviaturas que viram palavras inteiras.
  const PADRAO_PALAVRAS = [
    ["art.", "artigo"],
    ["arts.", "artigos"],
    ["inc.", "inciso"],
    ["incs.", "incisos"],
    ["al.", "alinea"],
    ["par.", "paragrafo"],
    ["§§", "paragrafos"],
    ["§", "paragrafo"],
    ["n.º", "numero"],
    ["nº", "numero"],
    ["n.", "numero"],
    ["fls.", "folhas"],
    ["fl.", "folha"],
    ["p.", "pagina"],
    ["pp.", "paginas"],
    ["pag.", "pagina"],
    ["cf.", "confira"],
    ["cit.", "citada"],
    ["op. cit.", "obra citada"],
    ["ss.", "e seguintes"],
    ["e/ou", "e ou"],
    ["Des.", "Desembargador"],
    ["Des.ª", "Desembargadora"],
    ["Desa.", "Desembargadora"],
    ["Min.", "Ministro"],
    ["Min.ª", "Ministra"],
    ["Rel.", "Relator"],
    ["Rel.ª", "Relatora"],
    ["Exmo.", "Excelentissimo"],
    ["Exma.", "Excelentissima"],
    ["Ilmo.", "Ilustrissimo"],
    ["Ilma.", "Ilustrissima"],
    ["MM.", "Meritissimo"],
    ["V. Exa.", "Vossa Excelencia"],
    ["V.Exa.", "Vossa Excelencia"],
    ["Dr.", "Doutor"],
    ["Dra.", "Doutora"],
    ["Prof.", "Professor"],
    ["Profa.", "Professora"],
    ["Sr.", "Senhor"],
    ["Sra.", "Senhora"],
    ["j.", "julgado em"],
    ["DJe", "Diario da Justica eletronico"],
    ["ed.", "edicao"],
    ["Ltda.", "Limitada"],
    ["etc.", "etcetera"]
  ];

  // (2) Siglas: soletradas do jeito que soam em portugues.
  //     A comparacao aqui e sensivel a maiusculas, para nao estragar
  //     palavras comuns.
  const PADRAO_SIGLAS = [
    ["STF", "esse-te-efe"],
    ["STJ", "esse-te-jota"],
    ["TST", "te-esse-te"],
    ["TSE", "te-esse-e"],
    ["STM", "esse-te-eme"],
    ["CNJ", "ce-ene-jota"],
    ["OAB", "o-a-be"],
    ["INSS", "i-ene-esse-esse"],
    ["TJSC", "te-jota-esse-ce"],
    ["TJSP", "te-jota-esse-pe"],
    ["TJRS", "te-jota-erre-esse"],
    ["TJPR", "te-jota-pe-erre"],
    ["TJMG", "te-jota-eme-ge"],
    ["TRF", "te-erre-efe"],
    ["CPC", "codigo de processo civil"],
    ["CPP", "codigo de processo penal"],
    ["CDC", "codigo de defesa do consumidor"],
    ["CLT", "consolidacao das leis do trabalho"],
    ["CTN", "codigo tributario nacional"],
    ["CTB", "codigo de transito brasileiro"],
    ["ECA", "estatuto da crianca e do adolescente"],
    ["CF/88", "Constituicao Federal de 1988"],
    ["REsp", "recurso especial"],
    ["AREsp", "agravo em recurso especial"],
    ["AgRg", "agravo regimental"],
    ["AgInt", "agravo interno"],
    ["EDcl", "embargos de declaracao"],
    ["IRDR", "i-erre-de-erre"],
    ["IAC", "i-a-ce"],
    ["PUIL", "pu-il"],
    ["ADI", "acao direta de inconstitucionalidade"],
    ["ADPF", "arguicao de descumprimento de preceito fundamental"]
  ];

  const LETRA = "A-Za-zÀ-ÿ0-9";

  function escapar(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /**
   * Monta a expressao regular de um termo, cercando-o de "fronteiras" para
   * que ele nunca case dentro de outra palavra. Sem isso, a regra "p."
   * estragaria "cap." e assim por diante.
   */
  function regexDoTermo(de, sensivelACaixa) {
    const corpo = escapar(de).replace(/\s+/g, "\\s+");

    // Fronteira a esquerda apenas se o termo comeca com letra ou digito.
    // (o simbolo § nao precisa, e costuma vir grudado no numero)
    const inicio = new RegExp("^[" + LETRA + "]").test(de)
      ? "(?<![" + LETRA + "])"
      : "";

    // Fronteira a direita apenas se o termo termina com letra ou digito.
    // (termos terminados em ponto, como "art.", ja se delimitam sozinhos)
    const fim = new RegExp("[" + LETRA + "]$").test(de)
      ? "(?![" + LETRA + "])"
      : "";

    return new RegExp(inicio + corpo + fim, sensivelACaixa ? "g" : "gi");
  }

  /** Uma sigla e um termo com duas ou mais letras e nenhuma minuscula. */
  function pareceSigla(de) {
    return /^[^a-zà-ÿ]*$/.test(de) && (de.match(/[A-ZÀ-Þ]/g) || []).length >= 2;
  }

  function compilar(paresPalavras, paresSiglas) {
    const palavras = [...paresPalavras]
      // do termo mais longo para o mais curto: "arts." antes de "art.",
      // "§§" antes de "§"
      .sort((a, b) => b[0].length - a[0].length)
      .map(([de, para]) => ({ re: regexDoTermo(de, false), para }));

    const siglas = [...paresSiglas]
      .sort((a, b) => b[0].length - a[0].length)
      .map(([de, para]) => ({ re: regexDoTermo(de, true), para }));

    return { palavras, siglas };
  }

  /* -----------------------------------------------------------------------
     Numeros de processo no padrao do CNJ:
        5029223-53.2024.8.24.0930
     Lidos inteiros, viram um amontoado. Lidos digito a digito, ficam
     compreensiveis.
     ----------------------------------------------------------------------- */
  const RE_PROCESSO = /\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/g;

  function soletrarProcesso(texto) {
    return texto.replace(RE_PROCESSO, (n) =>
      n
        .replace(/[-.]/g, ", ")            // os separadores viram pequenas pausas
        .replace(/\d/g, (d) => d + " ")    // um espaco depois de cada digito
        .replace(/\s+,/g, ",")
        .replace(/\s{2,}/g, " ")
        .trim()
    );
  }

  /* Valores em reais: "R$ 1.500,00" -> "1.500,00 reais" */
  function converterReais(texto) {
    return texto.replace(/R\$\s*([\d.]+(?:,\d{1,2})?)/g, "$1 reais");
  }

  /* -----------------------------------------------------------------------
     Le as linhas escritas pelo usuario na tela de ajustes.
     Uma por linha, no formato:   termo = pronuncia
     Linhas vazias e linhas comecadas por # sao ignoradas.
     ----------------------------------------------------------------------- */
  function lerDicionarioDoUsuario(texto) {
    const pares = [];
    for (const linha of String(texto || "").split("\n")) {
      const l = linha.trim();
      if (!l || l.startsWith("#")) continue;
      const pos = l.indexOf("=");
      if (pos <= 0) continue;
      const de = l.slice(0, pos).trim();
      const para = l.slice(pos + 1).trim();
      if (de) pares.push([de, para]);
    }
    return pares;
  }

  /** Devolve o dicionario padrao no mesmo formato de texto editavel. */
  function dicionarioPadraoComoTexto() {
    const linhas = [
      "# Uma substituicao por linha, no formato:  termo = como deve ser falado",
      "# Linhas comecadas por # sao comentarios.",
      "# Estas sao as regras de fabrica; edite a vontade.",
      "",
      "# --- abreviaturas ---"
    ];
    for (const [de, para] of PADRAO_PALAVRAS) linhas.push(`${de} = ${para}`);
    linhas.push("", "# --- siglas (aqui maiusculas e minusculas importam) ---");
    for (const [de, para] of PADRAO_SIGLAS) linhas.push(`${de} = ${para}`);
    return linhas.join("\n");
  }

  /* =======================================================================
     A funcao principal: recebe a frase escrita e devolve a frase falada.
     ======================================================================= */

  /**
   * @param {string} texto  a frase como aparece no documento
   * @param {object} opcoes
   *    - ativo: false devolve o texto intacto
   *    - dicionario: pares [de, para] vindos da tela de ajustes
   *    - soletrarProcessos: le numeros de processo digito a digito
   * @returns {string} a frase pronta para ser falada
   */
  function paraFala(texto, opcoes) {
    const op = Object.assign(
      { ativo: true, dicionario: null, soletrarProcessos: true },
      opcoes || {}
    );

    let t = String(texto || "");
    if (!op.ativo) return t;

    if (op.soletrarProcessos) t = soletrarProcesso(t);
    t = converterReais(t);

    // Se o usuario editou o dicionario, separamos automaticamente as siglas
    // (termos sem nenhuma letra minuscula, como STJ ou CPC) das abreviaturas
    // comuns: so as siglas sao comparadas respeitando maiusculas.
    let compilado;
    if (op.dicionario && op.dicionario.length) {
      const siglas = op.dicionario.filter(([de]) => pareceSigla(de));
      const palavras = op.dicionario.filter(([de]) => !pareceSigla(de));
      compilado = compilar(palavras, siglas);
    } else {
      compilado = compilar(PADRAO_PALAVRAS, PADRAO_SIGLAS);
    }

    for (const { re, para } of compilado.siglas) t = t.replace(re, para);
    for (const { re, para } of compilado.palavras) t = t.replace(re, para);

    // Sobras que atrapalham a leitura em voz.
    t = t
      .replace(/[«»""'']/g, '"')
      .replace(/\s{2,}/g, " ")
      .trim();

    return t;
  }

  return {
    paraFala,
    lerDicionarioDoUsuario,
    dicionarioPadraoComoTexto,
    PADRAO_PALAVRAS,
    PADRAO_SIGLAS
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = Abreviaturas;
