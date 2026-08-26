/*
 * Shared inspiration-orb renderer.
 * Upstream: https://github.com/LerSent001/orb (MIT)
 * The exported WGSL stays in liquid-orb.html; the four editor snapshots below
 * are rendered through one WebGPU device and one pipeline.
 */
(function inspirationOrbRenderer(global) {
  "use strict";

  const PRESETS = Object.freeze([
    Object.freeze({
      id: "orb-sunlit",
      label: "晨光",
      seed: Object.freeze([1,1,0,0.5799999833106995,0.7200000286102295,0.36000001430511475,3.799999952316284,0.4399999976158142,5.199999809265137,0.5799999833106995,0.36000001430511475,0.2800000011920929,0.20000000298023224,0.2199999988079071,1.0800000429153442,12,0.004999999888241291,0,0,1,0.41999998688697815,0,2,0.41999998688697815,0.7699999809265137,0.23000000417232513,65,0,0,1,0.2199999988079071,0.25,1,1,1,1,0.7254902124404907,0.7529411911964417,0.7921568751335144,1,0.20392157137393951,0.22745098173618317,0.26274511218070984,1,0.0117647061124444,0.01568627543747425,0.019607843831181526,1,1,1,1,1,0.9254902005195618,0.8745098114013672,0.8745098114013672,1,0.05882352963089943,0.37254902720451355,0.8235294222831726,1,0.929411768913269,0.9490196108818054,0.5686274766921997,1,0.9058823585510254,0.9921568632125854,0.6274510025978088,1,0.8627451062202454,0.9176470637321472,1,1,0.019607843831181526,0.0235294122248888,0.0313725508749485,1,1,1,1,1,0.9686274528503418,0.9843137264251709,1,1,0.9372549057006836,0.9647058844566345,0.9921568632125854,1,0.8784313797950745,0.9333333373069763,0.9764705896377563,1,0.8313725590705872,0.9019607901573181,0.9686274528503418,1,0.7333333492279053,0.8352941274642944,0.9529411792755127,1,0.6509804129600525,0.7803921699523926,0.9411764740943909,1,0.529411792755127,0.6901960968971252,0.9215686321258545,1,0.43529412150382996,0.6196078658103943,0.9098039269447327,1,0.43529412150382996,0.6196078658103943,0.9098039269447327,1,0.43529412150382996,0.6196078658103943,0.9098039269447327,1,0.43529412150382996,0.6196078658103943,0.9098039269447327,1,0.43529412150382996,0.6196078658103943,0.9098039269447327,1])
    }),
    Object.freeze({
      id: "orb-neon",
      label: "霓虹",
      seed: Object.freeze([1,1,0,1.2100000381469727,0.7200000286102295,0.4000000059604645,4.199999809265137,0.6200000047683716,2.0999999046325684,0.18000000715255737,0.36000001430511475,0.2800000011920929,0.20000000298023224,0.2199999988079071,1.1799999475479126,10,0.004999999888241291,0,0,1,0.2199999988079071,0.07999999821186066,2,0.41999998688697815,0.7699999809265137,0.23000000417232513,65,0,0,1,0.2199999988079071,0.25,0.0117647061124444,0.0313725508749485,0.08627451211214066,1,0.125490203499794,0.9411764740943909,0.7137255072593689,1,0.19607843458652496,0.658823549747467,1,1,0.6392157077789307,0.29411765933036804,1,1,1,1,1,1,1,1,1,1,0.22745098173618317,0.6000000238418579,0.8745098114013672,1,0.16078431904315948,0.7607843279838562,0.5921568870544434,1,0.007843137718737125,0.4274509847164154,0.8901960849761963,1,0.21176470816135406,0.4745098054409027,0.8666666746139526,1,0.003921568859368563,0.007843137718737125,0.027450980618596077,1,0.125490203499794,0.9411764740943909,0.7137255072593689,1,0.9686274528503418,0.9843137264251709,1,1,0.9372549057006836,0.9647058844566345,0.9921568632125854,1,0.8784313797950745,0.9333333373069763,0.9764705896377563,1,0.8313725590705872,0.9019607901573181,0.9686274528503418,1,0.7333333492279053,0.8352941274642944,0.9529411792755127,1,0.6509804129600525,0.7803921699523926,0.9411764740943909,1,0.529411792755127,0.6901960968971252,0.9215686321258545,1,0.43529412150382996,0.6196078658103943,0.9098039269447327,1,0.43529412150382996,0.6196078658103943,0.9098039269447327,1,0.43529412150382996,0.6196078658103943,0.9098039269447327,1,0.43529412150382996,0.6196078658103943,0.9098039269447327,1,0.43529412150382996,0.6196078658103943,0.9098039269447327,1])
    }),
    Object.freeze({
      id: "orb-pearl",
      label: "珍珠",
      seed: Object.freeze([1,1,0,0.4099999964237213,0.7200000286102295,0.30000001192092896,3,0.5,2.200000047683716,0.10000000149011612,0.699999988079071,0.9200000166893005,0.20000000298023224,0.1599999964237213,1.0800000429153442,22,0.004999999888241291,0,0,1,0.7699999809265137,0,2,0.41999998688697815,0.7699999809265137,0.23000000417232513,65,0,0,1,0.1599999964237213,0.3799999952316284,0.9843137264251709,0.9882352948188782,0.9843137264251709,1,0.49803921580314636,0.5254902243614197,0.5137255191802979,1,0.8392156958580017,0.8549019694328308,0.8470588326454163,1,0.20000000298023224,0.21568627655506134,0.22745098173618317,1,1,1,1,1,0.9686274528503418,0.9882352948188782,1,1,0.4313725531101227,0.8627451062202454,1,1,0.5254902243614197,0.9058823585510254,0.0313725508749485,1,0.9686274528503418,0.9882352948188782,1,1,0.8509804010391235,0.9529411792755127,1,1,0.019607843831181526,0.0235294122248888,0.0235294122248888,1,0.7411764860153198,0.9372549057006836,1,1,0.9686274528503418,0.9843137264251709,1,1,0.9372549057006836,0.9647058844566345,0.9921568632125854,1,0.8784313797950745,0.9333333373069763,0.9764705896377563,1,0.8313725590705872,0.9019607901573181,0.9686274528503418,1,0.7333333492279053,0.8352941274642944,0.9529411792755127,1,0.6509804129600525,0.7803921699523926,0.9411764740943909,1,0.529411792755127,0.6901960968971252,0.9215686321258545,1,0.43529412150382996,0.6196078658103943,0.9098039269447327,1,0.43529412150382996,0.6196078658103943,0.9098039269447327,1,0.43529412150382996,0.6196078658103943,0.9098039269447327,1,0.43529412150382996,0.6196078658103943,0.9098039269447327,1,0.43529412150382996,0.6196078658103943,0.9098039269447327,1])
    }),
    Object.freeze({
      id: "orb-cosmos",
      label: "星云",
      seed: Object.freeze([1,1,0,1.7599999904632568,0.699999988079071,0.36000001430511475,2.5999999046325684,0.46000000834465027,2.200000047683716,0.07999999821186066,0.2199999988079071,0.11999999731779099,0.18000000715255737,0.8100000023841858,1.350000023841858,19,0.004999999888241291,0,0,1,0.47999998927116394,0.10000000149011612,2,0.41999998688697815,0.7699999809265137,0.23000000417232513,65,0,0,1,0.2199999988079071,0.25,0.03529411926865578,0.0117647061124444,0.054901961237192154,1,0.8078431487083435,0.1725490242242813,0.7960784435272217,1,1,0.3607843220233917,0.4431372582912445,1,0.48235294222831726,0.32549020648002625,1,1,1,0.8509804010391235,0.9411764740943909,1,0.9411764740943909,0.6196078658103943,0.6196078658103943,1,0.8784313797950745,0.9764705896377563,0.24313725531101227,1,1,0.47058823704719543,0.5647059082984924,1,1,0.9450980424880981,0.9803921580314636,1,0.9058823585510254,0.8509804010391235,1,1,0.007843137718737125,0.003921568859368563,0.019607843831181526,1,0.21960784494876862,0.5058823823928833,0.01568627543747425,1,0.9686274528503418,0.9843137264251709,1,1,0.9372549057006836,0.9647058844566345,0.9921568632125854,1,0.8784313797950745,0.9333333373069763,0.9764705896377563,1,0.8313725590705872,0.9019607901573181,0.9686274528503418,1,0.7333333492279053,0.8352941274642944,0.9529411792755127,1,0.6509804129600525,0.7803921699523926,0.9411764740943909,1,0.529411792755127,0.6901960968971252,0.9215686321258545,1,0.43529412150382996,0.6196078658103943,0.9098039269447327,1,0.43529412150382996,0.6196078658103943,0.9098039269447327,1,0.43529412150382996,0.6196078658103943,0.9098039269447327,1,0.43529412150382996,0.6196078658103943,0.9098039269447327,1,0.43529412150382996,0.6196078658103943,0.9098039269447327,1])
    })
  ]);

  const PRESET_MAP = new Map(PRESETS.map(preset => [preset.id, preset]));
  const STATE_TUNING = Object.freeze({
    idle: Object.freeze({ speed: 1, glow: 0, deform: 0 }),
    thinking: Object.freeze({ speed: 1.45, glow: 0.16, deform: 0.08 }),
    ready: Object.freeze({ speed: 0.82, glow: 0.12, deform: 0 }),
    attention: Object.freeze({ speed: 1.08, glow: 0.2, deform: 0.04 }),
    error: Object.freeze({ speed: 0.35, glow: 0.08, deform: 0 })
  });
  const reducedMotionQuery = global.matchMedia?.("(prefers-reduced-motion: reduce)");
  const canvasStates = new Map();
  let initialization = null;
  let engine = null;
  let animationFrame = 0;
  let stopped = false;
  let warned = false;

  const visibilityObserver = "IntersectionObserver" in global ? new IntersectionObserver(entries => {
    entries.forEach(entry => {
      const state = canvasStates.get(entry.target);
      if (state) state.visible = entry.isIntersecting;
    });
    requestRender();
  }, { rootMargin: "140px" }) : null;

  function warnOnce(error) {
    if (warned) return;
    warned = true;
    console.warn("Inspiration orbs are using the static fallback.", error);
  }

  function loadShaderSource() {
    return new Promise((resolve, reject) => {
      const bridge = document.createElement("iframe");
      bridge.hidden = true;
      bridge.tabIndex = -1;
      bridge.setAttribute("aria-hidden", "true");
      bridge.src = new URL("liquid-orb.html?shader-bridge=v2", document.baseURI).href;
      const timeout = window.setTimeout(() => finish(new Error("The orb shader bridge did not respond.")), 8000);
      function finish(error, source) {
        window.clearTimeout(timeout);
        window.removeEventListener("message", receive);
        bridge.remove();
        if (error) reject(error); else resolve(source);
      }
      function receive(event) {
        if (event.source !== bridge.contentWindow || event.data?.type !== "project-os:liquid-orb-shader") return;
        if (typeof event.data.shaderSource !== "string" || !event.data.shaderSource.includes("@fragment")) {
          finish(new Error("The orb shader bridge returned invalid source."));
          return;
        }
        finish(null, event.data.shaderSource);
      }
      window.addEventListener("message", receive);
      document.body.appendChild(bridge);
    });
  }

  async function initializeEngine() {
    if (!navigator.gpu) throw new Error("WebGPU is not supported in this environment.");
    const [shaderSource, adapter] = await Promise.all([loadShaderSource(), navigator.gpu.requestAdapter()]);
    if (!adapter) throw new Error("No compatible WebGPU adapter was found.");
    const device = await adapter.requestDevice();
    const format = navigator.gpu.getPreferredCanvasFormat();
    const shader = device.createShaderModule({ code: shaderSource });
    const compilation = await shader.getCompilationInfo();
    const errors = compilation.messages.filter(message => message.type === "error");
    if (errors.length) throw new Error(errors.map(message => `${message.lineNum}:${message.linePos} ${message.message}`).join("\n"));
    const pipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: { module: shader, entryPoint: "vs_main" },
      fragment: { module: shader, entryPoint: "fs_main", targets: [{ format }] },
      primitive: { topology: "triangle-list" }
    });
    device.lost.then(info => fail(new Error(`WebGPU device lost: ${info.message || info.reason}`)));
    device.addEventListener("uncapturederror", event => {
      event.preventDefault();
      fail(new Error(`WebGPU rendering error: ${event.error.message}`));
    });
    return { device, format, pipeline, startedAt: performance.now() };
  }

  function ensureEngine() {
    if (engine) return Promise.resolve(engine);
    if (stopped || !navigator.gpu) return Promise.resolve(null);
    if (!initialization) {
      initialization = initializeEngine().then(value => {
        engine = value;
        return value;
      }).catch(error => {
        warnOnce(error);
        document.documentElement.dataset.inspirationOrbRenderer = "fallback";
        return null;
      });
    }
    return initialization;
  }

  function removeCanvas(canvas, state) {
    visibilityObserver?.unobserve(canvas);
    state.uniformBuffer?.destroy();
    canvasStates.delete(canvas);
  }

  function registerCanvas(canvas) {
    if (!engine || canvasStates.has(canvas)) return;
    const preset = PRESET_MAP.get(canvas.dataset.orbPreset) || PRESETS[0];
    const context = canvas.getContext("webgpu");
    if (!context) return;
    context.configure({ device: engine.device, format: engine.format, alphaMode: "premultiplied" });
    const values = new Float32Array(preset.seed);
    const uniformBuffer = engine.device.createBuffer({
      size: values.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    const bindGroup = engine.device.createBindGroup({
      layout: engine.pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: uniformBuffer } }]
    });
    const state = { canvas, context, preset, values, uniformBuffer, bindGroup, visible: !visibilityObserver, ready: false };
    canvasStates.set(canvas, state);
    visibilityObserver?.observe(canvas);
  }

  function currentCanvases() {
    return [...document.querySelectorAll("canvas.inspiration-orb-canvas")];
  }

  function sync() {
    if (stopped) return;
    const canvases = currentCanvases();
    const current = new Set(canvases);
    canvasStates.forEach((state, canvas) => {
      if (!current.has(canvas) || !canvas.isConnected) removeCanvas(canvas, state);
    });
    if (!canvases.length) {
      cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      return;
    }
    void ensureEngine().then(value => {
      if (!value || stopped) return;
      currentCanvases().forEach(registerCanvas);
      document.documentElement.dataset.inspirationOrbRenderer = "webgpu";
      requestRender();
    });
  }

  function renderState(state, encoder, now) {
    const { canvas, context, preset, values } = state;
    const dpr = Math.min(global.devicePixelRatio || 1, 1.75);
    const width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    values.set(preset.seed);
    values[0] = width;
    values[1] = height;
    values[2] = reducedMotionQuery?.matches ? 0.6 : (now - engine.startedAt) / 1000;
    const tuning = STATE_TUNING[canvas.dataset.aiState] || STATE_TUNING.idle;
    values[3] = reducedMotionQuery?.matches ? 0 : preset.seed[3] * tuning.speed;
    values[17] = Math.max(preset.seed[17], tuning.glow);
    values[20] = Math.min(1, Math.max(0, preset.seed[20] + tuning.deform));
    engine.device.queue.writeBuffer(state.uniformBuffer, 0, values);
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: context.getCurrentTexture().createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        loadOp: "clear",
        storeOp: "store"
      }]
    });
    pass.setPipeline(engine.pipeline);
    pass.setBindGroup(0, state.bindGroup);
    pass.draw(3);
    pass.end();
    if (!state.ready) {
      state.ready = true;
      canvas.classList.add("is-ready");
    }
  }

  function frame(now) {
    animationFrame = 0;
    if (stopped || document.hidden || !engine) return;
    const visibleStates = [...canvasStates.values()].filter(state => state.canvas.isConnected && state.visible);
    if (!visibleStates.length) return;
    try {
      const encoder = engine.device.createCommandEncoder();
      visibleStates.forEach(state => renderState(state, encoder, now));
      engine.device.queue.submit([encoder.finish()]);
      if (!reducedMotionQuery?.matches) animationFrame = requestAnimationFrame(frame);
    } catch (error) {
      fail(error);
    }
  }

  function requestRender() {
    if (animationFrame || stopped || document.hidden || !engine) return;
    if (![...canvasStates.values()].some(state => state.canvas.isConnected && state.visible)) return;
    animationFrame = requestAnimationFrame(frame);
  }

  function fail(error) {
    if (stopped) return;
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    engine?.device.destroy();
    engine = null;
    initialization = Promise.resolve(null);
    canvasStates.forEach(state => {
      state.canvas.classList.remove("is-ready");
      state.uniformBuffer?.destroy();
    });
    canvasStates.clear();
    document.documentElement.dataset.inspirationOrbRenderer = "fallback";
    warnOnce(error);
  }

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      sync();
      requestRender();
    } else {
      cancelAnimationFrame(animationFrame);
      animationFrame = 0;
    }
  });
  global.addEventListener("resize", requestRender, { passive: true });
  reducedMotionQuery?.addEventListener?.("change", requestRender);
  global.addEventListener("pagehide", () => {
    stopped = true;
    cancelAnimationFrame(animationFrame);
    canvasStates.forEach(state => state.uniformBuffer?.destroy());
    canvasStates.clear();
    engine?.device.destroy();
  }, { once: true });

  global.ProjectOSInspirationOrbs = Object.freeze({
    presets: PRESETS.map(({ id, label }) => Object.freeze({ id, label })),
    presetIds: PRESETS.map(preset => preset.id),
    sync
  });
})(window);
