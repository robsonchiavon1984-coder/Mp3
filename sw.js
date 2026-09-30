/* =========================================================================
   sw.js — o service worker
   -------------------------------------------------------------------------
   E ele que faz o aplicativo funcionar sem internet: guarda os arquivos num
   cache do navegador e, dali em diante, responde aos pedidos da pagina a
   partir do que esta guardado.

   O carregamento vem em duas etapas de proposito:

     - o ESSENCIAL (a interface, o leitor de PDF, a lista de palavras — uns
       dois megabytes) entra no cache sozinho, na primeira visita;
     - o PESADO (os quase trinta megabytes do sintetizador que gera MP3) so
       entra quando voce manda, pelo botao "Preparar agora". Baixar isso sem
       avisar consumiria dados moveis de quem so quer ler.

   O modelo de voz e caso a parte: ele nao passa por aqui. E gravado no
   armazenamento privado do navegador pelo worker do gerador, para nao
   existirem duas copias de sessenta megabytes no aparelho.
   ========================================================================= */

const VERSAO = "leitor-em-voz-v1";
const CACHE = VERSAO;

/* Arquivos indispensaveis para abrir e ler documentos. */
const ESSENCIAIS = [
  "./",
  "index.html",
  "app.css",
  "app.js",
  "manifest.webmanifest",
  "espacamento.js",
  "frases.js",
  "abreviaturas.js",
  "pdf.min.js",
  "pdf.worker.min.js",
  "palavras-pt.txt",
  "icone-192.png",
  "icone-512.png",
  "icone-mascara-512.png",
  "apple-touch-icon.png",
  "favicon-32.png"
];

/* Arquivos do gerador de MP3. */
const PESADOS = [
  "sintetizador.js",
  "ambiente.js",
  "piper-tts-web.js",
  "piper-o91UDS6e.js",
  "voices_static-D_OtJDHM.js",
  "ort.wasm.min.js",
  "ort-wasm-simd.wasm",
  "piper_phonemize.js",
  "piper_phonemize.wasm",
  "piper_phonemize.data",
  "lamejs.js"
];

const TUDO = ESSENCIAIS.concat(PESADOS);

/* O modelo de voz nao e guardado aqui: quem o guarda e o worker do gerador,
   no armazenamento privado. Sem esta excecao, o cache ficaria com uma
   segunda copia de sessenta megabytes. */
const FORA_DO_CACHE = /\/pt_BR-[A-Za-z0-9_-]+\.onnx(\.json)?$/;

/* =========================================================================
   INSTALACAO E ATIVACAO
   ========================================================================= */

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches.open(CACHE).then((cache) =>
      // Um a um, tolerando falhas: um arquivo ausente nao pode impedir a
      // instalacao inteira.
      Promise.all(
        ESSENCIAIS.map((caminho) =>
          cache.add(new Request(caminho, { cache: "reload" })).catch(() => null)
        )
      )
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((nomes) =>
        Promise.all(
          nomes
            .filter((n) => n !== CACHE && n !== "compartilhado")
            .map((n) => caches.delete(n))
        )
      )
      .then(() => self.clients.claim())
  );
});

/* =========================================================================
   PEDIDOS
   ========================================================================= */

self.addEventListener("fetch", (evento) => {
  const pedido = evento.request;
  const url = new URL(pedido.url);

  // 1. Compartilhamento vindo de outro aplicativo (Android).
  if (pedido.method === "POST" && url.pathname.endsWith("/compartilhar")) {
    evento.respondWith(receberCompartilhamento(pedido));
    return;
  }

  if (pedido.method !== "GET") return;
  if (url.origin !== location.origin) return;         // nada de terceiros
  if (FORA_DO_CACHE.test(url.pathname)) return;       // modelo de voz

  // 2. Navegacao: devolvemos a pagina guardada, para abrir sem internet.
  if (pedido.mode === "navigate") {
    evento.respondWith(
      fetch(pedido).catch(() =>
        caches.match("index.html", { ignoreSearch: true }).then(
          (r) => r || caches.match("./", { ignoreSearch: true })
        )
      )
    );
    return;
  }

  // 3. Demais arquivos: primeiro o cache, depois a rede — e o que vier da
  //    rede fica guardado para a proxima vez.
  evento.respondWith(
    caches.match(pedido, { ignoreSearch: true }).then((guardado) => {
      if (guardado) return guardado;
      return fetch(pedido).then((resposta) => {
        if (resposta && resposta.ok && resposta.type === "basic") {
          const copia = resposta.clone();
          caches.open(CACHE).then((c) => c.put(pedido, copia)).catch(() => {});
        }
        return resposta;
      });
    })
  );
});

/**
 * O menu Compartilhar do Android entrega os dados por POST. Nao da para
 * passa-los direto a pagina, entao guardamos num cache temporario e
 * redirecionamos para a pagina, que os recolhe e apaga.
 */
async function receberCompartilhamento(pedido) {
  try {
    const dados = await pedido.formData();
    const cache = await caches.open("compartilhado");

    const arquivo = dados.get("arquivo");
    if (arquivo && arquivo.size) {
      await cache.put(
        "arquivo",
        new Response(arquivo, {
          headers: {
            "content-type": arquivo.type || "application/octet-stream",
            "x-nome": encodeURIComponent(arquivo.name || "compartilhado").replace(/%20/g, " ")
          }
        })
      );
    } else {
      const texto = [dados.get("titulo"), dados.get("texto"), dados.get("url")]
        .filter(Boolean)
        .join("\n\n");
      if (texto) await cache.put("texto", new Response(texto));
    }
  } catch (_) {
    // Um compartilhamento malformado nao deve travar o aplicativo.
  }
  return Response.redirect("./?compartilhado=1", 303);
}

/* =========================================================================
   CONVERSA COM A PAGINA
   ========================================================================= */

self.addEventListener("message", (evento) => {
  const msg = evento.data || {};
  if (msg.tipo === "precarregar") evento.waitUntil(precarregarTudo());
  else if (msg.tipo === "estadoDoCache") evento.waitUntil(relatarEstado());
});

async function avisarClientes(mensagem) {
  const clientes = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
  for (const cliente of clientes) cliente.postMessage(mensagem);
}

async function precarregarTudo() {
  const cache = await caches.open(CACHE);
  let feitos = 0;
  const faltaram = [];

  for (const caminho of TUDO) {
    try {
      const jaTem = await cache.match(caminho, { ignoreSearch: true });
      if (!jaTem) await cache.add(new Request(caminho, { cache: "reload" }));
    } catch (_) {
      faltaram.push(caminho);
    }
    feitos++;
    await avisarClientes({ tipo: "progressoCache", feitos, total: TUDO.length });
  }

  if (faltaram.length) {
    await avisarClientes({
      tipo: "erroCache",
      mensagem: faltaram.slice(0, 3).join(", ") + (faltaram.length > 3 ? "…" : "")
    });
    return;
  }
  await avisarClientes({ tipo: "cachePronto", completo: true });
}

async function relatarEstado() {
  const cache = await caches.open(CACHE);
  let presentes = 0;
  for (const caminho of TUDO) {
    if (await cache.match(caminho, { ignoreSearch: true })) presentes++;
  }
  await avisarClientes({
    tipo: "estadoDoCache",
    completo: presentes === TUDO.length,
    presentes,
    total: TUDO.length
  });
}
