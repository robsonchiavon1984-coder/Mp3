/* =========================================================================
   ambiente.js
   -------------------------------------------------------------------------
   Um remendo de tres linhas, mas que precisa de explicacao.

   O phonemizador do Piper e o ONNX Runtime foram compilados com Emscripten.
   Para decidir como carregar os proprios arquivos, o codigo gerado pelo
   Emscripten pergunta em que ambiente esta rodando, e a pergunta que ele faz
   para reconhecer um worker e literalmente esta:

       typeof importScripts == "function"

   Acontece que o nosso worker e um WORKER DE MODULO (type: "module"), e nesse
   tipo de worker a funcao importScripts nao existe — ela e propria dos
   workers classicos. Resultado: as duas bibliotecas concluem que nao estao
   nem na pagina nem no worker, e nao montam a funcao que le os arquivos .wasm
   e .data. Nada carrega.

   A correcao e declarar importScripts para que a checagem passe. Nenhuma das
   duas bibliotecas chega a CHAMAR a funcao no caminho que usamos — o unico
   uso real esta no suporte a varias threads, que aqui esta desligado —, e por
   isso a deixamos lancando erro: se algum dia alguma delas chamar, o erro
   aparece em vez de um comportamento silenciosamente errado.

   Este arquivo e importado antes de qualquer outro pelo sintetizador.
   ========================================================================= */

if (typeof importScripts !== "function") {
  self.importScripts = function () {
    throw new Error(
      "importScripts foi chamado dentro do worker de modulo — ver ambiente.js"
    );
  };
}

export const ambientePreparado = true;
