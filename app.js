/* =========================================================================
   app.js — o cerebro do Leitor em Voz
   -------------------------------------------------------------------------
   Este e o mesmo programa que rodava como extensao do Chrome, adaptado para
   viver como aplicativo web: nada de APIs de extensao, caminhos todos
   relativos (para funcionar em qualquer subpasta do GitHub Pages) e
   preferencias guardadas no proprio navegador.

   O que ele faz, em ordem:
     1. carrega documentos — PDF pelo pdf.js, arquivos .txt/.md, texto colado
        ou recebido pelo menu Compartilhar do Android;
     2. limpa o texto, junta letras afastadas e o divide em frases;
     3. le em voz alta com as vozes do proprio aparelho;
     4. quando pedido, gera um arquivo MP3 com um segundo sintetizador;
     5. guarda tudo em cache para funcionar sem internet.

   As secoes estao numeradas; leia de cima para baixo.
   ========================================================================= */

"use strict";

/* =========================================================================
   1) ATALHOS PARA OS ELEMENTOS DA TELA
   ========================================================================= */
const $ = (id) => document.getElementById(id);

const el = {
  abas: document.querySelectorAll(".aba"),
  painelLeitor: $("painel-leitor"),
  painelAjustes: $("painel-ajustes"),
  seloOffline: $("selo-offline"),

  areaOffline: $("area-offline"),
  offlineTitulo: $("offline-titulo"),
  offlineDetalhe: $("offline-detalhe"),
  caixaBarraOffline: $("caixa-barra-offline"),
  barraOffline: $("barra-offline"),
  btnPreparar: $("btn-preparar"),
  btnAdiar: $("btn-adiar"),

  areaEntrada: $("area-entrada"),
  zonaArraste: $("zona-arraste"),
  btnEscolher: $("btn-escolher"),
  entradaArquivo: $("entrada-arquivo"),
  btnColar: $("btn-colar"),
  areaColagem: $("area-colagem"),
  txtColado: $("txt-colado"),
  btnLerColado: $("btn-ler-colado"),
  btnCancelarColagem: $("btn-cancelar-colagem"),

  areaCarregando: $("area-carregando"),
  textoCarregando: $("texto-carregando"),
  barraCarregando: $("barra-carregando"),

  areaAviso: $("area-aviso"),
  textoAviso: $("texto-aviso"),
  btnFecharAviso: $("btn-fechar-aviso"),

  areaRetomar: $("area-retomar"),
  textoRetomar: $("texto-retomar"),
  btnRetomar: $("btn-retomar"),
  btnDoInicio: $("btn-do-inicio"),

  areaDocumento: $("area-documento"),
  docNome: $("doc-nome"),
  docInfo: $("doc-info"),
  btnFecharDoc: $("btn-fechar-doc"),

  entradaPagina: $("entrada-pagina"),
  rotuloTotalPaginas: $("rotulo-total-paginas"),
  btnIrPagina: $("btn-ir-pagina"),
  entradaBusca: $("entrada-busca"),
  btnBuscar: $("btn-buscar"),

  leitura: $("leitura"),
  btnExportar: $("btn-exportar"),
  btnMp3: $("btn-mp3"),
  rotuloCaracteres: $("rotulo-caracteres"),

  areaMp3: $("area-mp3"),
  mp3Titulo: $("mp3-titulo"),
  mp3Barra: $("mp3-barra"),
  mp3Detalhe: $("mp3-detalhe"),
  mp3Restante: $("mp3-restante"),
  btnMp3Cancelar: $("btn-mp3-cancelar"),

  barraTocador: $("barra-tocador"),
  tocadorBarra: $("tocador-barra"),
  btnAnterior: $("btn-anterior"),
  btnTocar: $("btn-tocar"),
  btnParar: $("btn-parar"),
  btnProxima: $("btn-proxima"),
  rotuloPosicao: $("rotulo-posicao"),

  selVoz: $("sel-voz"),
  chkSoPortugues: $("chk-so-portugues"),
  dicaVozes: $("dica-vozes"),
  rngVelocidade: $("rng-velocidade"),
  valVelocidade: $("val-velocidade"),
  rngTom: $("rng-tom"),
  valTom: $("val-tom"),
  rngVolume: $("rng-volume"),
  valVolume: $("val-volume"),
  btnTestarVoz: $("btn-testar-voz"),

  chkAbreviaturas: $("chk-abreviaturas"),
  chkProcessos: $("chk-processos"),
  txtDicionario: $("txt-dicionario"),
  btnSalvarDicionario: $("btn-salvar-dicionario"),
  btnRestaurarDicionario: $("btn-restaurar-dicionario"),

  chkNumPagina: $("chk-num-pagina"),
  chkCabecalhos: $("chk-cabecalhos"),
  chkEspacamento: $("chk-espacamento"),
  dicaEspacamento: $("dica-espacamento"),
  rngTrecho: $("rng-trecho"),
  valTrecho: $("val-trecho"),

  selVozMp3: $("sel-voz-mp3"),
  estadoModelo: $("estado-modelo"),
  btnInstalarModelo: $("btn-instalar-modelo"),
  btnModeloDisco: $("btn-modelo-disco"),
  btnApagarModelo: $("btn-apagar-modelo"),
  entradaModelo: $("entrada-modelo"),
  caixaBarraModelo: $("caixa-barra-modelo"),
  barraModelo: $("barra-modelo"),
  rngVelocidadeMp3: $("rng-velocidade-mp3"),
  valVelocidadeMp3: $("val-velocidade-mp3"),
  selKbps: $("sel-kbps"),

  selTema: $("sel-tema"),
  rngFonte: $("rng-fonte"),
  valFonte: $("val-fonte"),
  chkRolagem: $("chk-rolagem"),
  chkTelaLigada: $("chk-tela-ligada"),
  chkMemoria: $("chk-memoria"),
  btnLimparMemoria: $("btn-limpar-memoria"),

  estadoArmazenamento: $("estado-armazenamento"),
  btnPreparar2: $("btn-preparar-2"),
  btnAtualizar: $("btn-atualizar"),
  estadoVersao: $("estado-versao"),
  dicaPlataforma: $("dica-plataforma")
};

/* =========================================================================
   2) ESTADO E CONFIGURACAO
   ========================================================================= */

const estado = {
  frases: [],        // [{ texto, fala, pagina, paragrafo, el }]
  indice: 0,
  lendo: false,
  pausado: false,
  documento: null,
  vozes: [],
  buscaUltima: "",
  buscaPosicao: -1,
  travaDeTela: null
};

const CONFIG_PADRAO = {
  voz: "",
  soPortugues: true,
  velocidade: 1,
  tom: 1,
  volume: 1,
  abreviaturas: true,
  processos: true,
  dicionario: "",
  removerNumerosDePagina: true,
  removerCabecalhos: false,
  corrigirEspacamento: true,
  tamanhoTrecho: 240,
  vozMp3: "pt_BR-faber-medium",
  velocidadeMp3: 1,
  kbps: 48,
  tema: "auto",
  tamanhoFonte: 17,
  rolagemAutomatica: true,
  manterTelaLigada: true,
  lembrarPosicao: true,
  jaPreparou: false
};

let config = { ...CONFIG_PADRAO };

// "token" invalida falas antigas: toda vez que paramos ou mudamos de posicao
// ele muda, e os avisos de falas anteriores se calam.
let token = 0;

/* ---------- preferencias ---------- */

const CHAVE_CONFIG = "leitor-em-voz:config";

function carregarConfig() {
  try {
    const bruto = localStorage.getItem(CHAVE_CONFIG);
    config = Object.assign({}, CONFIG_PADRAO, bruto ? JSON.parse(bruto) : {});
  } catch (_) {
    config = { ...CONFIG_PADRAO };
  }
}

let temporizadorGravacao = null;
function salvarConfig() {
  clearTimeout(temporizadorGravacao);
  temporizadorGravacao = setTimeout(() => {
    try { localStorage.setItem(CHAVE_CONFIG, JSON.stringify(config)); } catch (_) {}
  }, 300);
}

function guardarLocal(chave, valor) {
  try { localStorage.setItem(chave, JSON.stringify(valor)); } catch (_) {}
}
function lerLocal(chave) {
  try {
    const v = localStorage.getItem(chave);
    return v ? JSON.parse(v) : null;
  } catch (_) { return null; }
}

/* =========================================================================
   3) VOZES DO APARELHO
   ========================================================================= */

function carregarVozes() {
  estado.vozes = speechSynthesis.getVoices() || [];
  desenharListaDeVozes();
}

function vozesVisiveis() {
  if (!config.soPortugues) return estado.vozes;
  const pt = estado.vozes.filter((v) => (v.lang || "").toLowerCase().startsWith("pt"));
  return pt.length ? pt : estado.vozes;
}

function desenharListaDeVozes() {
  const lista = vozesVisiveis();
  el.selVoz.innerHTML = "";

  if (!lista.length) {
    const o = document.createElement("option");
    o.textContent = "Nenhuma voz encontrada";
    el.selVoz.appendChild(o);
    el.dicaVozes.textContent =
      "O navegador ainda nao reportou vozes. Toque em “Ouvir uma amostra” uma vez: " +
      "em alguns aparelhos a lista so aparece depois da primeira interacao.";
    return;
  }

  for (const v of lista) {
    const o = document.createElement("option");
    o.value = v.name;
    o.textContent = `${v.name} — ${v.lang}${v.localService ? "" : " (rede)"}`;
    el.selVoz.appendChild(o);
  }

  if (!config.voz || !lista.some((v) => v.name === config.voz)) {
    const preferidas = ["Luciana", "Google português do Brasil", "Felipe", "Joana", "Fernanda"];
    const achada =
      lista.find((v) => preferidas.some((p) => v.name.includes(p))) ||
      lista.find((v) => (v.lang || "").toLowerCase() === "pt-br") ||
      lista[0];
    config.voz = achada.name;
    salvarConfig();
  }
  el.selVoz.value = config.voz;

  const quantasPt = estado.vozes.filter((v) => (v.lang || "").toLowerCase().startsWith("pt")).length;
  el.dicaVozes.textContent = quantasPt
    ? `${quantasPt} voz(es) em portugues neste aparelho.`
    : "Nenhuma voz em portugues instalada. No Android: Ajustes › Sistema › Idiomas › " +
      "Saida de texto para voz. No iPhone: Ajustes › Acessibilidade › Conteudo Falado › Vozes.";
}

function vozEscolhida() {
  return estado.vozes.find((v) => v.name === config.voz) || null;
}

/* =========================================================================
   4) O MOTOR DE FALA
   ========================================================================= */

function cancelarFala() {
  token++;
  try { speechSynthesis.cancel(); } catch (_) {}
}

/**
 * Aplica voz, velocidade, tom e volume. A atribuicao da voz vai dentro de um
 * try: se o objeto nao for aceito, preferimos falar com a voz padrao a
 * interromper a leitura com um erro.
 */
function aplicarVoz(u) {
  const voz = vozEscolhida();
  u.lang = voz && voz.lang ? voz.lang : "pt-BR";
  if (voz) { try { u.voice = voz; } catch (_) {} }
  u.rate = config.velocidade;
  u.pitch = config.tom;
  u.volume = config.volume;
  return u;
}

function falar(i) {
  if (i < 0 || i >= estado.frases.length) { terminarLeitura(); return; }

  estado.indice = i;
  const frase = estado.frases[i];
  const meuToken = token;

  marcarFraseAtual(i);
  atualizarProgresso();

  const u = aplicarVoz(new SpeechSynthesisUtterance(frase.fala));

  // Destaque palavra a palavra. So faz sentido quando o texto exibido e
  // igual ao falado — se o dicionario trocou "art." por "artigo", as
  // posicoes nao batem e o destaque ficaria errado.
  if (frase.texto === frase.fala) {
    u.onboundary = (ev) => {
      if (meuToken !== token) return;
      if (ev.name && ev.name !== "word") return;
      destacarPalavra(frase, ev.charIndex, ev.charLength);
    };
  }

  u.onend = () => {
    if (meuToken !== token || !estado.lendo) return;
    limparDestaqueDePalavra(frase);
    frase.el.classList.add("lida");
    guardarPosicao();
    falar(i + 1);
  };

  u.onerror = (ev) => {
    if (meuToken !== token) return;
    const motivo = ev && ev.error ? ev.error : "";
    if (motivo === "interrupted" || motivo === "canceled") return;
    if (estado.lendo) falar(i + 1);   // pula a frase problematica
  };

  speechSynthesis.speak(u);
}

function iniciarLeitura(i) {
  if (!estado.frases.length) return;
  cancelarFala();
  estado.lendo = true;
  estado.pausado = false;
  pedirTelaLigada();
  atualizarBotoes();
  falar(typeof i === "number" ? i : estado.indice);
}

function pausarLeitura() {
  if (!estado.lendo || estado.pausado) return;
  estado.pausado = true;
  try { speechSynthesis.pause(); } catch (_) {}
  atualizarBotoes();
  guardarPosicao();
}

function retomarLeitura() {
  if (!estado.lendo || !estado.pausado) return;
  estado.pausado = false;
  atualizarBotoes();
  try { speechSynthesis.resume(); } catch (_) {}

  // Rede de seguranca: em varios celulares o resume() nao volta a falar.
  // Se meio segundo depois continuar tudo em silencio, recomecamos a frase.
  setTimeout(() => {
    if (estado.lendo && !estado.pausado && !speechSynthesis.speaking) {
      iniciarLeitura(estado.indice);
    }
  }, 500);
}

function pararLeitura() {
  cancelarFala();
  estado.lendo = false;
  estado.pausado = false;
  soltarTelaLigada();
  if (estado.frases[estado.indice]) limparDestaqueDePalavra(estado.frases[estado.indice]);
  atualizarBotoes();
  guardarPosicao();
}

function terminarLeitura() {
  estado.lendo = false;
  estado.pausado = false;
  soltarTelaLigada();
  atualizarBotoes();
  atualizarProgresso();
  apagarPosicao();
}

function alternarLeitura() {
  if (!estado.frases.length) return;
  if (estado.lendo && !estado.pausado) pausarLeitura();
  else if (estado.lendo && estado.pausado) retomarLeitura();
  else iniciarLeitura(estado.indice);
}

function irParaFrase(i, tocar) {
  if (!estado.frases.length) return;
  const destino = Math.max(0, Math.min(i, estado.frases.length - 1));
  const estavaLendo = estado.lendo && !estado.pausado;
  cancelarFala();
  estado.indice = destino;
  marcarFraseAtual(destino);
  atualizarProgresso();
  if (tocar || estavaLendo) iniciarLeitura(destino);
  else atualizarBotoes();
}

/* O sintetizador adormece em falas longas; chamar resume() de tempos em
   tempos e o contorno consagrado. Quando nada esta pausado, nao tem efeito. */
setInterval(() => {
  if (estado.lendo && !estado.pausado && speechSynthesis.speaking) {
    try { speechSynthesis.resume(); } catch (_) {}
  }
}, 8000);

/* ---------- manter a tela ligada ---------- */

async function pedirTelaLigada() {
  if (!config.manterTelaLigada || !("wakeLock" in navigator) || estado.travaDeTela) return;
  try {
    estado.travaDeTela = await navigator.wakeLock.request("screen");
    estado.travaDeTela.addEventListener("release", () => { estado.travaDeTela = null; });
  } catch (_) { estado.travaDeTela = null; }
}

function soltarTelaLigada() {
  if (estado.travaDeTela) {
    try { estado.travaDeTela.release(); } catch (_) {}
    estado.travaDeTela = null;
  }
}

/* =========================================================================
   5) DESENHAR O TEXTO
   ========================================================================= */

function desenharTexto() {
  el.leitura.innerHTML = "";
  const fragmento = document.createDocumentFragment();

  let paginaAtual = null;
  let paragrafoAtual = null;
  let caixaParagrafo = null;

  estado.frases.forEach((frase, i) => {
    if (frase.pagina && frase.pagina !== paginaAtual) {
      paginaAtual = frase.pagina;
      paragrafoAtual = null;
      if (estado.documento && estado.documento.paginas > 1) {
        const marca = document.createElement("span");
        marca.className = "marca-pagina";
        marca.textContent = `pagina ${frase.pagina}`;
        fragmento.appendChild(marca);
      }
    }

    if (frase.paragrafo !== paragrafoAtual || !caixaParagrafo) {
      paragrafoAtual = frase.paragrafo;
      caixaParagrafo = document.createElement("p");
      caixaParagrafo.className = "paragrafo";
      fragmento.appendChild(caixaParagrafo);
    }

    const span = document.createElement("span");
    span.className = "frase";
    span.dataset.i = String(i);
    span.textContent = frase.texto;
    frase.el = span;

    caixaParagrafo.appendChild(span);
    // O espaco fica FORA do span: assim o destaque de palavra pode
    // reconstruir o conteudo sem mexer no espacamento.
    caixaParagrafo.appendChild(document.createTextNode(" "));
  });

  el.leitura.appendChild(fragmento);
}

function marcarFraseAtual(i) {
  const anterior = el.leitura.querySelector(".frase.atual");
  if (anterior) anterior.classList.remove("atual");

  const frase = estado.frases[i];
  if (!frase || !frase.el) return;
  frase.el.classList.add("atual");

  if (config.rolagemAutomatica) {
    const caixa = el.leitura;
    caixa.scrollTo({
      top: Math.max(0, frase.el.offsetTop - caixa.clientHeight / 2),
      behavior: "smooth"
    });
  }

  if (frase.pagina) el.entradaPagina.value = String(frase.pagina);
}

function destacarPalavra(frase, inicio, comprimento) {
  const t = frase.texto;
  if (inicio == null || inicio < 0 || inicio >= t.length) return;

  let fim = comprimento ? inicio + comprimento : -1;
  if (fim <= inicio) {
    const m = t.slice(inicio).match(/^[\wÀ-ÿ'’-]+/);
    fim = inicio + (m ? m[0].length : 1);
  }

  frase.el.textContent = "";
  frase.el.appendChild(document.createTextNode(t.slice(0, inicio)));
  const marca = document.createElement("span");
  marca.className = "palavra-atual";
  marca.textContent = t.slice(inicio, fim);
  frase.el.appendChild(marca);
  frase.el.appendChild(document.createTextNode(t.slice(fim)));
}

function limparDestaqueDePalavra(frase) {
  if (frase && frase.el && frase.el.querySelector(".palavra-atual")) {
    frase.el.textContent = frase.texto;
  }
}

function atualizarProgresso() {
  const total = estado.frases.length;
  const atual = total ? estado.indice + 1 : 0;
  const percentual = total ? (estado.indice / total) * 100 : 0;

  el.tocadorBarra.style.width = percentual.toFixed(2) + "%";

  let caracteresRestantes = 0;
  for (let i = estado.indice; i < total; i++) caracteresRestantes += estado.frases[i].fala.length;
  const segundos = caracteresRestantes / (16 * Math.max(0.5, config.velocidade));

  el.rotuloPosicao.textContent = total
    ? `${atual} de ${total}\nrestam ${formatarDuracao(segundos)}`
    : "—";
}

function formatarDuracao(segundos) {
  const s = Math.max(0, Math.round(segundos));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h) return `${h} h ${String(m).padStart(2, "0")} min`;
  if (m) return `${m} min ${String(r).padStart(2, "0")} s`;
  return `${r} s`;
}

function formatarBytes(n) {
  if (!n) return "0 B";
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + " KB";
  return (n / (1024 * 1024)).toFixed(1) + " MB";
}

function atualizarBotoes() {
  const tocando = estado.lendo && !estado.pausado;
  el.btnTocar.textContent = tocando ? "⏸" : "▶";
  el.btnTocar.setAttribute("aria-label", tocando ? "Pausar" : "Ler");
  const semTexto = estado.frases.length === 0;
  [el.btnTocar, el.btnParar, el.btnAnterior, el.btnProxima].forEach((b) => { b.disabled = semTexto; });
  el.barraTocador.classList.toggle("oculto", semTexto);
}

/* =========================================================================
   6) CARREGAR DOCUMENTOS
   ========================================================================= */

function prepararFrases(blocos) {
  const dicionarioDoUsuario = config.dicionario.trim()
    ? Abreviaturas.lerDicionarioDoUsuario(config.dicionario)
    : null;

  const opcoesFala = {
    ativo: config.abreviaturas,
    dicionario: dicionarioDoUsuario,
    soletrarProcessos: config.processos
  };

  const frases = [];
  let paragrafo = 0;

  for (const bloco of blocos) {
    const texto = Frases.normalizarTextoSimples(bloco.texto);
    if (!texto) continue;

    for (const par of texto.split(/\n\s*\n/)) {
      if (!par.trim()) continue;
      paragrafo++;
      for (const t of Frases.dividirEmFrases(par, config.tamanhoTrecho)) {
        frases.push({
          texto: t,
          fala: Abreviaturas.paraFala(t, opcoesFala),
          pagina: bloco.pagina || 0,
          paragrafo,
          el: null
        });
      }
    }
  }
  return frases;
}

async function abrirDocumento(blocos, info) {
  pararLeitura();

  // Letras afastadas ("E M E N T A"). No caminho do PDF a correcao ja rodou
  // linha a linha; aqui ela pega o texto colado, o compartilhado e o que
  // tiver sobrado. Precisa vir antes de qualquer normalizacao de espacos.
  if (config.corrigirEspacamento) {
    if (blocos.some((b) => Espacamento.pareceEspacado(b.texto))) {
      await Espacamento.pronto();
    }
    blocos = blocos.map((b) => ({
      texto: Espacamento.corrigirTexto(b.texto).texto,
      pagina: b.pagina
    }));
  }
  const trechosCorrigidos = Espacamento.lerContagem();
  Espacamento.zerarContagem();

  estado.frases = prepararFrases(blocos);
  estado.indice = 0;
  estado.buscaUltima = "";
  estado.buscaPosicao = -1;

  const caracteres = estado.frases.reduce((s, f) => s + f.texto.length, 0);
  estado.documento = Object.assign({ paginas: 0, caracteres }, info);

  if (!estado.frases.length) {
    mostrarAviso(
      "Nao encontrei texto neste documento. Se ele for um PDF digitalizado " +
      "(imagem), passe-o antes por um programa de OCR e abra o arquivo com a " +
      "camada de texto ja reconhecida."
    );
    return;
  }

  desenharTexto();

  el.docNome.textContent = estado.documento.nome;
  el.docNome.title = estado.documento.nome;
  const partes = [];
  if (estado.documento.paginas) partes.push(`${estado.documento.paginas} pagina(s)`);
  partes.push(`${estado.frases.length} frases`);
  partes.push(`${caracteres.toLocaleString("pt-BR")} caracteres`);
  if (trechosCorrigidos) partes.push(`${trechosCorrigidos} trecho(s) com letras afastadas corrigido(s)`);
  el.docInfo.textContent = partes.join(" · ");
  el.rotuloTotalPaginas.textContent = estado.documento.paginas ? `/ ${estado.documento.paginas}` : "/ —";
  el.rotuloCaracteres.textContent =
    "leitura estimada: " + formatarDuracao(caracteres / (16 * Math.max(0.5, config.velocidade)));

  el.areaEntrada.classList.add("oculto");
  el.areaOffline.classList.add("oculto");
  el.areaDocumento.classList.remove("oculto");

  atualizarBotoes();
  marcarFraseAtual(0);
  atualizarProgresso();
  oferecerRetomada();
}

function fecharDocumento() {
  pararLeitura();
  estado.frases = [];
  estado.documento = null;
  estado.indice = 0;
  el.leitura.innerHTML = "";
  el.areaDocumento.classList.add("oculto");
  el.areaRetomar.classList.add("oculto");
  el.areaEntrada.classList.remove("oculto");
  atualizarBotoes();
}

/* ---------- PDF ---------- */

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdf.worker.min.js", location.href).href;

async function carregarPdf(arquivo) {
  mostrarCarregando("Abrindo o PDF…", 2);
  Espacamento.zerarContagem();
  if (config.corrigirEspacamento) await Espacamento.pronto();

  const dados = new Uint8Array(await arquivo.arrayBuffer());

  let pdf;
  try {
    pdf = await pdfjsLib.getDocument({
      data: dados,
      isEvalSupported: false,
      useSystemFonts: false
    }).promise;
  } catch (erro) {
    esconderCarregando();
    if (erro && erro.name === "PasswordException") {
      mostrarAviso("Este PDF esta protegido por senha. Remova a protecao e tente de novo.");
    } else {
      mostrarAviso("Nao consegui abrir este PDF: " + (erro && erro.message ? erro.message : erro));
    }
    return;
  }

  const blocos = [];
  const opcoesLinhas = {
    removerNumerosDePagina: config.removerNumerosDePagina,
    removerCabecalhos: config.removerCabecalhos,
    corretorDeEspacamento: config.corrigirEspacamento ? Espacamento : null
  };

  for (let n = 1; n <= pdf.numPages; n++) {
    mostrarCarregando(`Lendo a pagina ${n} de ${pdf.numPages}…`, (n / pdf.numPages) * 100);
    const pagina = await pdf.getPage(n);
    const conteudo = await pagina.getTextContent();
    const texto = Frases.juntarLinhasDePdf(montarLinhas(conteudo.items), opcoesLinhas);
    if (texto.trim()) blocos.push({ texto, pagina: n });
    pagina.cleanup();
  }

  esconderCarregando();
  await abrirDocumento(blocos, {
    nome: arquivo.name,
    chave: chaveDoArquivo(arquivo),
    paginas: pdf.numPages
  });
}

/**
 * Junta os fragmentos que o pdf.js devolve em linhas legiveis.
 *
 * O ponto delicado sao os documentos com letras afastadas. O pdf.js entrega
 * sequencias de espaco ja achatadas em um so, de modo que a diferenca entre
 * "espaco de letra" e "espaco de palavra" nao sobrevive no texto — mas
 * sobrevive na geometria, porque cada espaco tem largura propria. Medimos,
 * para cada pedaco visivel, quanto espaco existe antes dele; o valor tipico
 * separa letras, e o que for bem maior separa palavras, marcado com DOIS
 * espacos. E a pista que espacamento.js usa em seguida.
 */
function montarLinhas(itens) {
  const linhas = [];
  let fragmentos = [];
  let fimAnterior = null;

  const fecharLinha = () => {
    if (fragmentos.length) linhas.push(montarUmaLinha(fragmentos));
    fragmentos = [];
    fimAnterior = null;
  };

  for (const item of itens) {
    if (typeof item.str !== "string") continue;
    const x = item.transform ? item.transform[4] : null;
    const largura = typeof item.width === "number" ? item.width : 0;
    const vao = x !== null && fimAnterior !== null ? x - fimAnterior : 0;
    fragmentos.push({ str: item.str, vao, largura });
    if (x !== null) fimAnterior = x + largura;
    if (item.hasEOL) fecharLinha();
  }
  fecharLinha();
  return linhas.filter((l) => l.trim());
}

const VAO_IRRELEVANTE = 1;   // abaixo disso e so acabamento tipografico

function montarUmaLinha(fragmentos) {
  const unidades = [];
  let separacao = 0;
  let espacoEscrito = false;

  for (const f of fragmentos) {
    separacao += Math.max(0, f.vao);
    if (!f.str) continue;
    if (!/\S/.test(f.str)) {
      separacao += Math.max(0, f.largura);
      espacoEscrito = true;
      continue;
    }
    unidades.push({ str: f.str, separacao, espacoEscrito });
    separacao = 0;
    espacoEscrito = false;
  }
  if (!unidades.length) return "";

  const medidas = unidades
    .map((u) => u.separacao)
    .filter((v) => v > VAO_IRRELEVANTE)
    .sort((a, b) => a - b);
  const tipica = medidas.length ? medidas[Math.floor(medidas.length / 2)] : 0;
  const limiarPalavra = tipica ? tipica * 1.8 : Infinity;

  let linha = "";
  for (const u of unidades) {
    if (linha) {
      if (u.separacao > limiarPalavra) linha += "  ";
      else if (u.separacao > VAO_IRRELEVANTE || u.espacoEscrito) linha += " ";
    }
    linha += u.str;
  }
  return linha;
}

/* ---------- arquivos de texto e texto colado ---------- */

async function carregarTexto(arquivo) {
  const conteudo = await arquivo.text();
  await abrirDocumento([{ texto: conteudo, pagina: 0 }], {
    nome: arquivo.name,
    chave: chaveDoArquivo(arquivo),
    paginas: 0
  });
}

function chaveDoArquivo(arquivo) {
  return `pos:${arquivo.name}:${arquivo.size}`;
}

async function receberArquivo(arquivo) {
  if (!arquivo) return;
  esconderAviso();
  const nome = (arquivo.name || "").toLowerCase();
  try {
    if (nome.endsWith(".pdf") || arquivo.type === "application/pdf") {
      await carregarPdf(arquivo);
    } else if (/\.(txt|md|markdown|csv)$/.test(nome) || (arquivo.type || "").startsWith("text/")) {
      await carregarTexto(arquivo);
    } else {
      mostrarAviso("Formato nao reconhecido. Abra um arquivo .pdf, .txt ou .md.");
    }
  } catch (erro) {
    esconderCarregando();
    mostrarAviso("Nao consegui ler o arquivo: " + (erro && erro.message ? erro.message : erro));
  }
}

async function receberTexto(texto, titulo) {
  if (!texto || !texto.trim()) return;
  const nome = titulo || "Texto colado";
  await abrirDocumento([{ texto, pagina: 0 }], {
    nome,
    chave: "pos:texto:" + nome.slice(0, 60),
    paginas: 0
  });
}

/* =========================================================================
   7) POSICAO DE LEITURA
   ========================================================================= */

let ultimaGravacaoDePosicao = 0;

function guardarPosicao() {
  if (!config.lembrarPosicao || !estado.documento || !estado.documento.chave) return;
  const agora = Date.now();
  if (agora - ultimaGravacaoDePosicao < 3000) return;
  ultimaGravacaoDePosicao = agora;
  guardarLocal(estado.documento.chave, {
    indice: estado.indice,
    total: estado.frases.length,
    nome: estado.documento.nome,
    quando: agora
  });
}

function apagarPosicao() {
  if (!estado.documento || !estado.documento.chave) return;
  try { localStorage.removeItem(estado.documento.chave); } catch (_) {}
}

function oferecerRetomada() {
  el.areaRetomar.classList.add("oculto");
  if (!config.lembrarPosicao || !estado.documento || !estado.documento.chave) return;

  const marca = lerLocal(estado.documento.chave);
  if (!marca || !marca.indice || marca.indice >= estado.frases.length - 1) return;

  const percentual = Math.round((marca.indice / estado.frases.length) * 100);
  el.textoRetomar.textContent =
    `Voce parou na frase ${marca.indice + 1} deste documento (${percentual}% lido).`;
  el.areaRetomar.dataset.indice = String(marca.indice);
  el.areaRetomar.classList.remove("oculto");
}

/* =========================================================================
   8) AVISOS, BUSCA E EXPORTACAO
   ========================================================================= */

function mostrarCarregando(mensagem, percentual) {
  el.areaCarregando.classList.remove("oculto");
  el.textoCarregando.textContent = mensagem;
  el.barraCarregando.style.width = Math.max(0, Math.min(100, percentual || 0)) + "%";
}
function esconderCarregando() { el.areaCarregando.classList.add("oculto"); }
function mostrarAviso(m) { el.textoAviso.textContent = m; el.areaAviso.classList.remove("oculto"); }
function esconderAviso() { el.areaAviso.classList.add("oculto"); }

function semAcento(s) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function buscar() {
  const alvo = el.entradaBusca.value.trim();
  if (!alvo || !estado.frases.length) return;

  const procurado = semAcento(alvo);
  if (procurado !== estado.buscaUltima) {
    estado.buscaUltima = procurado;
    estado.buscaPosicao = -1;
  }

  const total = estado.frases.length;
  for (let passo = 1; passo <= total; passo++) {
    const i = (estado.buscaPosicao + passo + total) % total;
    if (semAcento(estado.frases[i].texto).includes(procurado)) {
      estado.buscaPosicao = i;
      const anterior = el.leitura.querySelector(".frase.achada");
      if (anterior) anterior.classList.remove("achada");
      estado.frases[i].el.classList.add("achada");
      irParaFrase(i, false);
      return;
    }
  }
  mostrarAviso(`Nao encontrei "${alvo}" neste documento.`);
}

function irParaPagina() {
  const n = parseInt(el.entradaPagina.value, 10);
  if (!n || !estado.frases.length) return;
  const i = estado.frases.findIndex((f) => f.pagina === n);
  if (i >= 0) irParaFrase(i, false);
}

function baixarArquivo(blob, nome) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function nomeBase() {
  return (estado.documento && estado.documento.nome ? estado.documento.nome : "leitura")
    .replace(/\.[^.]+$/, "")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .slice(0, 80);
}

function exportarTexto() {
  if (!estado.frases.length) return;
  const linhas = [];
  let paragrafo = null;
  let atual = "";
  for (const f of estado.frases) {
    if (f.paragrafo !== paragrafo) {
      if (atual) linhas.push(atual.trim());
      paragrafo = f.paragrafo;
      atual = "";
    }
    atual += f.texto + " ";
  }
  if (atual) linhas.push(atual.trim());
  baixarArquivo(new Blob([linhas.join("\n\n")], { type: "text/plain;charset=utf-8" }), nomeBase() + ".txt");
}

/* =========================================================================
   9) GERACAO DO ARQUIVO MP3
   -------------------------------------------------------------------------
   A voz da leitura em tempo real nao pode ser gravada: a Web Speech API toca
   o som e nao devolve amostra nenhuma a pagina. O MP3 e sintetizado de novo,
   pelo Piper, dentro do worker sintetizador.js.
   ========================================================================= */

// Nesta versao todos os arquivos ficam na mesma pasta, inclusive o modelo.
const BASE_VOZES = "";

const mp3 = { worker: null, gerando: false, vozesGuardadas: [] };

function caminhosDoPiper() {
  const u = (p) => new URL(p, location.href).href;
  return {
    onnxWasm: u("./"),                          // precisa terminar em barra
    piperData: u("piper_phonemize.data"),
    piperWasm: u("piper_phonemize.wasm")
  };
}

function urlsDoModelo(vozId) {
  const u = (p) => new URL(p, location.href).href;
  return [
    { nome: vozId + ".onnx.json", url: u(BASE_VOZES + vozId + ".onnx.json") },
    { nome: vozId + ".onnx", url: u(BASE_VOZES + vozId + ".onnx") }
  ];
}

function garantirWorker() {
  if (mp3.worker) return mp3.worker;
  mp3.worker = new Worker(new URL("sintetizador.js", location.href), { type: "module" });
  mp3.worker.onmessage = (ev) => receberDoWorker(ev.data || {});
  mp3.worker.onerror = (erro) => {
    encerrarGeracao();
    mostrarAviso("O gerador de audio nao pode ser iniciado: " + (erro.message || "erro desconhecido"));
  };
  return mp3.worker;
}

function falarComWorker(ordem) { garantirWorker().postMessage(ordem); }

function receberDoWorker(msg) {
  switch (msg.tipo) {
    case "estado":
      mp3.vozesGuardadas = msg.vozesGuardadas || [];
      desenharEstadoDoModelo();
      break;

    case "progressoModelo": {
      const pct = msg.total ? (msg.carregado / msg.total) * 100 : 0;
      el.caixaBarraModelo.classList.remove("oculto");
      el.barraModelo.style.width = pct.toFixed(1) + "%";
      el.estadoModelo.textContent =
        `Instalando o modelo de voz… ${formatarBytes(msg.carregado)}` +
        (msg.total ? ` de ${formatarBytes(msg.total)}` : "");
      break;
    }

    case "modeloPronto":
      mp3.vozesGuardadas = msg.vozesGuardadas || [];
      el.caixaBarraModelo.classList.add("oculto");
      el.btnInstalarModelo.disabled = false;
      desenharEstadoDoModelo();
      break;

    case "fase":
      el.mp3Titulo.textContent =
        msg.fase === "preparando" ? "Carregando o modelo de voz…" : "Gerando o arquivo de audio…";
      break;

    case "progresso": {
      el.mp3Barra.style.width = ((msg.feitas / msg.total) * 100).toFixed(1) + "%";
      el.mp3Titulo.textContent = "Gerando o arquivo de audio…";
      el.mp3Detalhe.textContent =
        `trecho ${msg.feitas} de ${msg.total} · ${formatarDuracao(msg.segundosDeAudio)} de audio`;
      el.mp3Restante.textContent = msg.restante ? "faltam cerca de " + formatarDuracao(msg.restante) : "";
      break;
    }

    case "pronto":
      encerrarGeracao();
      baixarArquivo(msg.arquivo, nomeBase() + ".mp3");
      el.rotuloCaracteres.textContent =
        `MP3 gerado: ${formatarDuracao(msg.segundosDeAudio)} · ${formatarBytes(msg.bytes)}`;
      break;

    case "cancelado":
      encerrarGeracao();
      break;

    case "erro":
      encerrarGeracao();
      el.btnInstalarModelo.disabled = false;
      el.caixaBarraModelo.classList.add("oculto");
      mostrarAviso("Gerador de audio: " + msg.mensagem);
      break;
  }
}

function modeloDisponivel() { return mp3.vozesGuardadas.includes(config.vozMp3); }

function desenharEstadoDoModelo() {
  const tem = modeloDisponivel();
  el.estadoModelo.textContent = tem
    ? "Modelo instalado neste aparelho. A geracao funciona sem internet."
    : "Modelo ainda nao instalado. Sao cerca de 60 MB, uma vez so.";
  el.btnInstalarModelo.disabled = tem;
  el.btnApagarModelo.disabled = !tem;
}

function instalarModelo() {
  el.btnInstalarModelo.disabled = true;
  el.estadoModelo.textContent = "Instalando o modelo de voz…";
  el.caixaBarraModelo.classList.remove("oculto");
  el.barraModelo.style.width = "0%";
  falarComWorker({
    tipo: "instalarModeloDaRede",
    vozId: config.vozMp3,
    urls: urlsDoModelo(config.vozMp3)
  });
}

async function instalarModeloDoDisco(lista) {
  const arquivos = [];
  for (const f of lista) {
    const nome = f.name.endsWith(".json") ? `${config.vozMp3}.onnx.json` : `${config.vozMp3}.onnx`;
    arquivos.push({ nome, dados: await f.arrayBuffer() });
  }
  const temOnnx = arquivos.some((a) => a.nome.endsWith(".onnx"));
  const temJson = arquivos.some((a) => a.nome.endsWith(".onnx.json"));
  if (!temOnnx || !temJson) {
    mostrarAviso("Selecione os DOIS arquivos do modelo de uma vez: o .onnx e o .onnx.json.");
    return;
  }
  el.estadoModelo.textContent = "Gravando o modelo…";
  falarComWorker({ tipo: "instalarModeloDoDisco", vozId: config.vozMp3, arquivos });
}

/**
 * As frases nao vao uma a uma ao sintetizador: sao agrupadas em trechos de
 * ate 350 caracteres, sem atravessar paragrafo nem pagina. Isso acelera (o
 * phonemizador e recriado a cada chamada) e melhora a entonacao, porque o
 * modelo enxerga o periodo inteiro em vez de frases coladas depois.
 */
const LIMITE_DO_TRECHO = 350;

function trechosParaAudio() {
  const trechos = [];
  let atual = null;

  for (const f of estado.frases) {
    const fala = (f.fala || "").trim();
    if (!fala) continue;
    const quebra =
      !atual ||
      atual.paragrafo !== f.paragrafo ||
      atual.pagina !== f.pagina ||
      atual.fala.length + fala.length + 1 > LIMITE_DO_TRECHO;
    if (quebra) {
      if (atual) trechos.push(atual);
      atual = { fala, paragrafo: f.paragrafo, pagina: f.pagina };
    } else {
      atual.fala += " " + fala;
    }
  }
  if (atual) trechos.push(atual);

  return trechos.map((t, i) => {
    const proximo = trechos[i + 1];
    let pausa = 0.25;
    if (!proximo) pausa = 0.6;
    else if (proximo.pagina !== t.pagina) pausa = 0.9;
    else if (proximo.paragrafo !== t.paragrafo) pausa = 0.55;
    return { fala: t.fala, pausa };
  });
}

function gerarMp3() {
  if (mp3.gerando || !estado.frases.length) return;
  esconderAviso();

  if (!modeloDisponivel()) {
    mostrarAviso(
      "O modelo de voz ainda nao esta neste aparelho. Abra Ajustes › Arquivo " +
      "de audio e toque em “Instalar o modelo”."
    );
    return;
  }

  pararLeitura();
  mp3.gerando = true;
  el.areaMp3.classList.remove("oculto");
  el.btnMp3.disabled = true;
  el.mp3Barra.style.width = "0%";
  el.mp3Titulo.textContent = "Carregando o modelo de voz…";
  el.mp3Detalhe.textContent = "—";
  el.mp3Restante.textContent = "";
  pedirTelaLigada();

  falarComWorker({
    tipo: "gerar",
    vozId: config.vozMp3,
    caminhos: caminhosDoPiper(),
    velocidade: config.velocidadeMp3,
    kbps: parseInt(config.kbps, 10) || 48,
    trechos: trechosParaAudio()
  });
}

function cancelarMp3() {
  if (!mp3.gerando) return;
  el.mp3Titulo.textContent = "Cancelando…";
  falarComWorker({ tipo: "cancelar" });
}

function encerrarGeracao() {
  mp3.gerando = false;
  el.areaMp3.classList.add("oculto");
  el.btnMp3.disabled = false;
  soltarTelaLigada();
}

/* =========================================================================
   10) FUNCIONAMENTO SEM INTERNET
   -------------------------------------------------------------------------
   O service worker (sw.js) guarda os arquivos do aplicativo. Em duas etapas:
   o essencial entra no cache logo na primeira visita, e o restante — os 29 MB
   do sintetizador de MP3 — so quando voce manda, para nao consumir dados
   moveis sem aviso.
   ========================================================================= */

const sw = { registro: null, preparando: false };

async function registrarServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    el.estadoArmazenamento.textContent =
      "Este navegador nao suporta funcionamento sem internet.";
    return;
  }
  try {
    sw.registro = await navigator.serviceWorker.register(
      new URL("sw.js", location.href),
      { scope: "./" }
    );
    navigator.serviceWorker.addEventListener("message", (ev) => receberDoServiceWorker(ev.data || {}));
    await navigator.serviceWorker.ready;
    perguntarEstadoDoCache();
  } catch (erro) {
    el.estadoArmazenamento.textContent = "Nao consegui preparar o modo offline: " + erro.message;
  }
}

function mandarAoServiceWorker(msg) {
  const destino = navigator.serviceWorker.controller ||
    (sw.registro && (sw.registro.active || sw.registro.waiting));
  if (destino) destino.postMessage(msg);
}

function perguntarEstadoDoCache() { mandarAoServiceWorker({ tipo: "estadoDoCache" }); }

function receberDoServiceWorker(msg) {
  if (msg.tipo === "progressoCache") {
    sw.preparando = true;
    el.caixaBarraOffline.classList.remove("oculto");
    el.barraOffline.style.width = ((msg.feitos / msg.total) * 100).toFixed(1) + "%";
    el.offlineTitulo.textContent = "Baixando para uso sem internet…";
    el.offlineDetalhe.textContent = `${msg.feitos} de ${msg.total} arquivos`;
    el.estadoArmazenamento.textContent = `Baixando: ${msg.feitos} de ${msg.total} arquivos.`;
  } else if (msg.tipo === "cachePronto") {
    sw.preparando = false;
    el.areaOffline.classList.add("oculto");
    el.seloOffline.classList.remove("oculto");
    config.jaPreparou = true;
    salvarConfig();
    descreverArmazenamento(msg);
  } else if (msg.tipo === "estadoDoCache") {
    if (msg.completo) {
      el.seloOffline.classList.remove("oculto");
      el.areaOffline.classList.add("oculto");
    } else if (!config.jaPreparou) {
      el.areaOffline.classList.remove("oculto");
    }
    descreverArmazenamento(msg);
  } else if (msg.tipo === "erroCache") {
    sw.preparando = false;
    el.offlineTitulo.textContent = "Nao consegui baixar tudo";
    el.offlineDetalhe.textContent =
      "Faltou: " + msg.mensagem + ". Tente de novo com uma conexao estavel.";
  }
}

async function descreverArmazenamento(msg) {
  const partes = [];
  if (msg && typeof msg.completo === "boolean") {
    partes.push(msg.completo
      ? "Aplicativo guardado no aparelho: abre sem internet."
      : "Aplicativo ainda nao guardado por completo.");
  }
  if (navigator.storage && navigator.storage.estimate) {
    try {
      const e = await navigator.storage.estimate();
      if (e && e.usage) partes.push(`Ocupando ${formatarBytes(e.usage)}.`);
    } catch (_) {}
  }
  if (navigator.storage && navigator.storage.persisted) {
    try {
      const fixo = await navigator.storage.persisted();
      partes.push(fixo
        ? "O navegador foi instruido a nao apagar estes dados."
        : "O navegador pode apagar estes dados se faltar espaco.");
    } catch (_) {}
  }
  el.estadoArmazenamento.textContent = partes.join(" ");
}

async function prepararOffline() {
  // Pede ao navegador que nao descarte o cache quando faltar espaco.
  if (navigator.storage && navigator.storage.persist) {
    try { await navigator.storage.persist(); } catch (_) {}
  }
  el.caixaBarraOffline.classList.remove("oculto");
  el.barraOffline.style.width = "0%";
  el.offlineTitulo.textContent = "Baixando para uso sem internet…";
  mandarAoServiceWorker({ tipo: "precarregar" });
}

async function procurarAtualizacao() {
  if (!sw.registro) return;
  el.estadoVersao.textContent = "Procurando…";
  try {
    await sw.registro.update();
    el.estadoVersao.textContent = sw.registro.waiting
      ? "Ha uma versao nova pronta. Feche e abra o aplicativo para usa-la."
      : "Voce ja esta na versao mais recente.";
  } catch (erro) {
    el.estadoVersao.textContent = "Nao consegui verificar: " + erro.message;
  }
}

/* ---------- texto e arquivo vindos do menu Compartilhar (Android) ---------- */

async function recolherCompartilhado() {
  const params = new URLSearchParams(location.search);
  if (!params.has("compartilhado")) return false;

  // Limpa o endereco para nao repetir a importacao ao recarregar.
  history.replaceState(null, "", location.pathname);

  try {
    const cache = await caches.open("compartilhado");
    const respostaTexto = await cache.match("texto");
    const respostaArquivo = await cache.match("arquivo");
    await cache.delete("texto");
    await cache.delete("arquivo");

    if (respostaArquivo) {
      const nome = respostaArquivo.headers.get("x-nome") || "compartilhado.pdf";
      const blob = await respostaArquivo.blob();
      await receberArquivo(new File([blob], nome, { type: blob.type }));
      return true;
    }
    if (respostaTexto) {
      const t = await respostaTexto.text();
      await receberTexto(t, "Texto compartilhado");
      return true;
    }
  } catch (_) {}
  return false;
}

/* =========================================================================
   11) AJUSTES NA TELA
   ========================================================================= */

function aplicarTema() { document.documentElement.dataset.tema = config.tema; }

function aplicarFonte() {
  document.documentElement.style.setProperty("--fonte-leitura", config.tamanhoFonte + "px");
  el.valFonte.textContent = config.tamanhoFonte + " px";
}

function preencherAjustes() {
  el.chkSoPortugues.checked = config.soPortugues;
  el.rngVelocidade.value = config.velocidade;
  el.valVelocidade.textContent = Number(config.velocidade).toFixed(1).replace(".", ",") + "×";
  el.rngTom.value = config.tom;
  el.valTom.textContent = Number(config.tom).toFixed(1).replace(".", ",");
  el.rngVolume.value = config.volume;
  el.valVolume.textContent = Math.round(config.volume * 100) + "%";

  el.chkAbreviaturas.checked = config.abreviaturas;
  el.chkProcessos.checked = config.processos;
  el.txtDicionario.value = config.dicionario || Abreviaturas.dicionarioPadraoComoTexto();

  el.chkNumPagina.checked = config.removerNumerosDePagina;
  el.chkCabecalhos.checked = config.removerCabecalhos;
  el.chkEspacamento.checked = config.corrigirEspacamento;
  el.rngTrecho.value = config.tamanhoTrecho;
  el.valTrecho.textContent = config.tamanhoTrecho;

  el.selVozMp3.value = config.vozMp3;
  el.rngVelocidadeMp3.value = config.velocidadeMp3;
  el.valVelocidadeMp3.textContent = Number(config.velocidadeMp3).toFixed(1).replace(".", ",") + "×";
  el.selKbps.value = String(config.kbps);

  el.selTema.value = config.tema;
  el.rngFonte.value = config.tamanhoFonte;
  el.chkRolagem.checked = config.rolagemAutomatica;
  el.chkTelaLigada.checked = config.manterTelaLigada;
  el.chkMemoria.checked = config.lembrarPosicao;

  aplicarTema();
  aplicarFonte();
  descreverPlataforma();
}

/**
 * Recalcula o texto FALADO de cada frase. O exibido nao muda — a menos que o
 * tamanho do trecho tenha mudado, que altera a propria divisao.
 */
function recalcularFala(redividir) {
  if (!estado.frases.length) return;

  if (redividir) {
    const blocos = [];
    let paragrafo = null;
    let atual = null;
    for (const f of estado.frases) {
      if (f.paragrafo !== paragrafo || (atual && atual.pagina !== f.pagina)) {
        if (atual) blocos.push(atual);
        paragrafo = f.paragrafo;
        atual = { texto: "", pagina: f.pagina };
      }
      atual.texto += f.texto + " ";
    }
    if (atual) blocos.push(atual);

    const proporcao = estado.indice / Math.max(1, estado.frases.length);
    pararLeitura();
    estado.frases = prepararFrases(blocos.map((b) => ({ texto: b.texto.trim(), pagina: b.pagina })));
    desenharTexto();
    estado.indice = Math.min(estado.frases.length - 1, Math.round(proporcao * estado.frases.length));
    marcarFraseAtual(estado.indice);
    atualizarProgresso();
    return;
  }

  const dicionarioDoUsuario = config.dicionario.trim()
    ? Abreviaturas.lerDicionarioDoUsuario(config.dicionario)
    : null;
  const opcoes = {
    ativo: config.abreviaturas,
    dicionario: dicionarioDoUsuario,
    soletrarProcessos: config.processos
  };
  for (const f of estado.frases) f.fala = Abreviaturas.paraFala(f.texto, opcoes);
}

function descreverPlataforma() {
  const ua = navigator.userAgent || "";
  const ehIOS = /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const ehAndroid = /Android/.test(ua);

  const comuns =
    "A fala do navegador para quando a tela bloqueia. Para ouvir um documento " +
    "longo com o aparelho no bolso, gere o MP3 e toque no seu player de musica.";

  if (ehIOS) {
    el.dicaPlataforma.textContent =
      "iPhone: instale pelo Safari, no botao Compartilhar, em “Adicionar a " +
      "Tela de Inicio” — so assim o aplicativo guarda os arquivos e abre " +
      "sem internet. O iOS nao repassa arquivos de outros aplicativos para cá, " +
      "entao abra os PDFs pelo botao “Escolher arquivo”. " + comuns;
  } else if (ehAndroid) {
    el.dicaPlataforma.textContent =
      "Android: instale pelo menu do Chrome, em “Instalar aplicativo”. " +
      "Depois disso o Leitor aparece no menu Compartilhar do sistema, e voce " +
      "pode mandar um PDF ou um trecho de texto direto de outro aplicativo. " + comuns;
  } else {
    el.dicaPlataforma.textContent =
      "No computador o aplicativo tambem funciona e pode ser instalado pela " +
      "barra de enderecos do navegador. " + comuns;
  }
}

/* =========================================================================
   12) LIGACOES COM A TELA
   ========================================================================= */

function ligarEventos() {
  /* --- abas --- */
  el.abas.forEach((b) => {
    b.addEventListener("click", () => {
      el.abas.forEach((x) => x.classList.toggle("ativa", x === b));
      const leitor = b.dataset.aba === "leitor";
      el.painelLeitor.classList.toggle("oculto", !leitor);
      el.painelAjustes.classList.toggle("oculto", leitor);
      window.scrollTo({ top: 0 });
    });
  });

  /* --- entrada --- */
  el.btnEscolher.addEventListener("click", () => el.entradaArquivo.click());
  el.entradaArquivo.addEventListener("change", (e) => {
    const f = e.target.files[0];
    e.target.value = "";
    receberArquivo(f);
  });

  ["dragenter", "dragover"].forEach((evt) =>
    el.zonaArraste.addEventListener(evt, (e) => {
      e.preventDefault();
      el.zonaArraste.classList.add("sobre");
    })
  );
  ["dragleave", "drop"].forEach((evt) =>
    el.zonaArraste.addEventListener(evt, (e) => {
      e.preventDefault();
      el.zonaArraste.classList.remove("sobre");
    })
  );
  el.zonaArraste.addEventListener("drop", (e) => {
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    receberArquivo(f);
  });
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => e.preventDefault());

  el.btnColar.addEventListener("click", () => {
    el.areaColagem.classList.toggle("oculto");
    if (!el.areaColagem.classList.contains("oculto")) el.txtColado.focus();
  });
  el.btnLerColado.addEventListener("click", () => {
    const t = el.txtColado.value;
    if (!t.trim()) return;
    el.areaColagem.classList.add("oculto");
    receberTexto(t, "Texto colado");
  });
  el.btnCancelarColagem.addEventListener("click", () => {
    el.areaColagem.classList.add("oculto");
    el.txtColado.value = "";
  });

  el.btnFecharDoc.addEventListener("click", fecharDocumento);
  el.btnFecharAviso.addEventListener("click", esconderAviso);

  /* --- retomada --- */
  el.btnRetomar.addEventListener("click", () => {
    const i = parseInt(el.areaRetomar.dataset.indice || "0", 10);
    el.areaRetomar.classList.add("oculto");
    irParaFrase(i, true);
  });
  el.btnDoInicio.addEventListener("click", () => {
    el.areaRetomar.classList.add("oculto");
    irParaFrase(0, true);
  });

  /* --- reproducao --- */
  el.btnTocar.addEventListener("click", alternarLeitura);
  el.btnParar.addEventListener("click", pararLeitura);
  el.btnAnterior.addEventListener("click", () => irParaFrase(estado.indice - 1, false));
  el.btnProxima.addEventListener("click", () => irParaFrase(estado.indice + 1, false));

  document.querySelector(".tocador-progresso").addEventListener("click", (e) => {
    if (!estado.frases.length) return;
    const caixa = e.currentTarget.getBoundingClientRect();
    const fracao = (e.clientX - caixa.left) / caixa.width;
    irParaFrase(Math.floor(fracao * estado.frases.length), false);
  });

  el.leitura.addEventListener("click", (e) => {
    const alvo = e.target.closest(".frase");
    if (!alvo) return;
    irParaFrase(parseInt(alvo.dataset.i, 10), true);
  });

  el.btnIrPagina.addEventListener("click", irParaPagina);
  el.entradaPagina.addEventListener("keydown", (e) => { if (e.key === "Enter") irParaPagina(); });
  el.btnBuscar.addEventListener("click", buscar);
  el.entradaBusca.addEventListener("keydown", (e) => { if (e.key === "Enter") buscar(); });
  el.btnExportar.addEventListener("click", exportarTexto);
  el.btnMp3.addEventListener("click", gerarMp3);
  el.btnMp3Cancelar.addEventListener("click", cancelarMp3);

  /* --- teclado (util no computador) --- */
  document.addEventListener("keydown", (e) => {
    if (/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(e.target.tagName)) return;
    if (e.key === " ") { e.preventDefault(); alternarLeitura(); }
    else if (e.key === "ArrowRight") { e.preventDefault(); irParaFrase(estado.indice + 1, false); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); irParaFrase(estado.indice - 1, false); }
  });

  /* --- ajustes: voz --- */
  el.selVoz.addEventListener("change", () => { config.voz = el.selVoz.value; salvarConfig(); });
  el.chkSoPortugues.addEventListener("change", () => {
    config.soPortugues = el.chkSoPortugues.checked;
    salvarConfig();
    desenharListaDeVozes();
  });
  el.rngVelocidade.addEventListener("input", () => {
    config.velocidade = parseFloat(el.rngVelocidade.value);
    el.valVelocidade.textContent = config.velocidade.toFixed(1).replace(".", ",") + "×";
    salvarConfig();
    atualizarProgresso();
  });
  el.rngTom.addEventListener("input", () => {
    config.tom = parseFloat(el.rngTom.value);
    el.valTom.textContent = config.tom.toFixed(1).replace(".", ",");
    salvarConfig();
  });
  el.rngVolume.addEventListener("input", () => {
    config.volume = parseFloat(el.rngVolume.value);
    el.valVolume.textContent = Math.round(config.volume * 100) + "%";
    salvarConfig();
  });
  el.btnTestarVoz.addEventListener("click", () => {
    cancelarFala();
    // Em varios celulares a lista de vozes so fica disponivel depois da
    // primeira interacao; aproveitamos este toque para recarrega-la.
    carregarVozes();
    const u = aplicarVoz(new SpeechSynthesisUtterance(
      "Esta e a voz escolhida. Nos termos do artigo 373 do Codigo de Processo Civil, o onus da prova incumbe ao autor."
    ));
    speechSynthesis.speak(u);
  });

  /* --- ajustes: texto juridico --- */
  el.chkAbreviaturas.addEventListener("change", () => {
    config.abreviaturas = el.chkAbreviaturas.checked; salvarConfig(); recalcularFala(false);
  });
  el.chkProcessos.addEventListener("change", () => {
    config.processos = el.chkProcessos.checked; salvarConfig(); recalcularFala(false);
  });
  el.btnSalvarDicionario.addEventListener("click", () => {
    config.dicionario = el.txtDicionario.value;
    salvarConfig();
    recalcularFala(false);
    el.btnSalvarDicionario.textContent = "Salvo ✓";
    setTimeout(() => (el.btnSalvarDicionario.textContent = "Salvar dicionario"), 1500);
  });
  el.btnRestaurarDicionario.addEventListener("click", () => {
    el.txtDicionario.value = Abreviaturas.dicionarioPadraoComoTexto();
    config.dicionario = "";
    salvarConfig();
    recalcularFala(false);
  });

  /* --- ajustes: importacao --- */
  el.chkNumPagina.addEventListener("change", () => {
    config.removerNumerosDePagina = el.chkNumPagina.checked; salvarConfig();
  });
  el.chkCabecalhos.addEventListener("change", () => {
    config.removerCabecalhos = el.chkCabecalhos.checked; salvarConfig();
  });
  el.chkEspacamento.addEventListener("change", () => {
    config.corrigirEspacamento = el.chkEspacamento.checked; salvarConfig();
  });
  el.rngTrecho.addEventListener("input", () => { el.valTrecho.textContent = el.rngTrecho.value; });
  el.rngTrecho.addEventListener("change", () => {
    config.tamanhoTrecho = parseInt(el.rngTrecho.value, 10);
    salvarConfig();
    recalcularFala(true);
  });

  /* --- ajustes: MP3 --- */
  el.selVozMp3.addEventListener("change", () => {
    config.vozMp3 = el.selVozMp3.value; salvarConfig(); desenharEstadoDoModelo();
  });
  el.btnInstalarModelo.addEventListener("click", instalarModelo);
  el.btnModeloDisco.addEventListener("click", () => el.entradaModelo.click());
  el.entradaModelo.addEventListener("change", (e) => {
    const lista = Array.from(e.target.files || []);
    e.target.value = "";
    if (lista.length) instalarModeloDoDisco(lista);
  });
  el.btnApagarModelo.addEventListener("click", () => {
    falarComWorker({ tipo: "apagarModelo", vozId: config.vozMp3 });
  });
  el.rngVelocidadeMp3.addEventListener("input", () => {
    config.velocidadeMp3 = parseFloat(el.rngVelocidadeMp3.value);
    el.valVelocidadeMp3.textContent = config.velocidadeMp3.toFixed(1).replace(".", ",") + "×";
    salvarConfig();
  });
  el.selKbps.addEventListener("change", () => {
    config.kbps = parseInt(el.selKbps.value, 10); salvarConfig();
  });

  /* --- ajustes: aparencia --- */
  el.selTema.addEventListener("change", () => { config.tema = el.selTema.value; salvarConfig(); aplicarTema(); });
  el.rngFonte.addEventListener("input", () => {
    config.tamanhoFonte = parseInt(el.rngFonte.value, 10); salvarConfig(); aplicarFonte();
  });
  el.chkRolagem.addEventListener("change", () => {
    config.rolagemAutomatica = el.chkRolagem.checked; salvarConfig();
  });
  el.chkTelaLigada.addEventListener("change", () => {
    config.manterTelaLigada = el.chkTelaLigada.checked;
    salvarConfig();
    if (!config.manterTelaLigada) soltarTelaLigada();
  });
  el.chkMemoria.addEventListener("change", () => {
    config.lembrarPosicao = el.chkMemoria.checked; salvarConfig();
  });
  el.btnLimparMemoria.addEventListener("click", () => {
    let apagadas = 0;
    try {
      for (const chave of Object.keys(localStorage)) {
        if (chave.startsWith("pos:")) { localStorage.removeItem(chave); apagadas++; }
      }
    } catch (_) {}
    el.btnLimparMemoria.textContent = `${apagadas} posicao(oes) apagada(s)`;
    setTimeout(() => (el.btnLimparMemoria.textContent = "Apagar as posicoes guardadas"), 2000);
  });

  /* --- offline --- */
  el.btnPreparar.addEventListener("click", prepararOffline);
  el.btnPreparar2.addEventListener("click", () => {
    prepararOffline();
    el.abas[0].click();
  });
  el.btnAdiar.addEventListener("click", () => {
    el.areaOffline.classList.add("oculto");
    config.jaPreparou = true;   // nao insiste; o botao continua em Ajustes
    salvarConfig();
  });
  el.btnAtualizar.addEventListener("click", procurarAtualizacao);

  /* --- ciclo de vida --- */
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && estado.lendo && !estado.pausado) {
      pedirTelaLigada();   // a trava e perdida quando o aplicativo vai ao fundo
    }
  });
  window.addEventListener("pagehide", () => { ultimaGravacaoDePosicao = 0; guardarPosicao(); });
}

/* =========================================================================
   13) PARTIDA
   ========================================================================= */

async function iniciar() {
  carregarConfig();
  preencherAjustes();
  ligarEventos();

  Espacamento.carregarDicionario(new URL("palavras-pt.txt", location.href).href)
    .then(() => {
      el.dicaEspacamento.textContent = Espacamento.temDicionario()
        ? "Lista de palavras carregada — usada so quando o proprio espacamento do documento nao revela onde termina cada palavra."
        : "Nao foi possivel carregar a lista de palavras. A correcao continua funcionando pelo espacamento do documento.";
    });

  carregarVozes();
  speechSynthesis.onvoiceschanged = carregarVozes;
  setTimeout(carregarVozes, 400);
  setTimeout(carregarVozes, 1500);

  atualizarBotoes();

  // O worker do gerador de MP3 sobe depois que a tela ja esta utilizavel:
  // ele carrega algumas centenas de kilobytes que nao servem para ler.
  setTimeout(() => {
    try { falarComWorker({ tipo: "estado" }); } catch (_) {
      el.estadoModelo.textContent = "Gerador de audio indisponivel neste navegador.";
    }
  }, 1200);

  await registrarServiceWorker();
  const veioCompartilhado = await recolherCompartilhado();
  if (!veioCompartilhado && !config.jaPreparou) {
    el.areaOffline.classList.remove("oculto");
  }
}

iniciar();
