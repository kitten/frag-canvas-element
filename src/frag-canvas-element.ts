import { trackVisibility, trackResizes, trackTextUpdates } from './observers';

const VERSION_300 = '#version 300 es';

const VS_SOURCE_100 =
  'attribute vec2 vPos;\n' +
  'void main() {\n' +
  '  gl_Position = vec4(vPos, 0.0, 1.0);\n' +
  '}';
const VS_SOURCE_300 =
  `${VERSION_300}\n` +
  'in vec4 vPos;\n' +
  'void main() {\n' +
  '  gl_Position = vPos;\n' +
  '}';

const makeDateVector = () => {
  const DATE = new Date();
  const year = DATE.getFullYear();
  const month = DATE.getMonth() + 1;
  const day = DATE.getDate();
  const time =
    DATE.getHours() * 60 * 60 +
    DATE.getMinutes() * 60 +
    DATE.getSeconds() +
    DATE.getMilliseconds() * 0.001;
  return [year, month, day, time] as const;
};

const isImageElement = (tex: TexImageSource): tex is HTMLImageElement =>
  (tex as Element).tagName === 'IMG';

const preprocessShader = (source: string) => {
  let header = '';
  let output = source.trim();
  let isES300 = false;
  if (output.startsWith(VERSION_300)) {
    isES300 = true;
    output = output.slice(VERSION_300.length + 1);
    header += `${VERSION_300}\n`;
  }

  if (!/^\s*precision /.test(output)) header += 'precision highp float;\n';

  if (!/main\s*\(/.test(output)) {
    const ioRe = /\(\s*out\s+vec4\s+(\S+)\s*,\s*in\s+vec2\s+(\S+)\s*\)/g;
    const io = ioRe.exec(source);
    output = output.replace(/mainImage\s*\(/, 'main(').replace(ioRe, '()');
    if (isES300 && io) {
      header += `out vec4 ${io[1]};\n`;
      if (io[2] !== 'gl_FragCoord')
        header += `#define ${io[2]} gl_FragCoord.xy\n`;
    } else if (io) {
      if (io[1] !== 'gl_FragColor') header += `#define ${io[1]} gl_FragColor\n`;
      if (io[2] !== 'gl_FragCoord')
        header += `#define ${io[2]} gl_FragCoord.xy\n`;
    }
  }

  if (isES300 && output.includes('gl_FragColor')) {
    header += 'out vec4 aFragColor;\n';
    header += '#define gl_FragColor aFragColor.xy\n';
  }

  if (output.includes('iChannel0')) header += 'uniform sampler2D iChannel0;\n';
  if (output.includes('iResolution')) header += 'uniform vec2 iResolution;\n';
  if (output.includes('iChannelResolution'))
    header += 'uniform vec3 iChannelResolution[1];\n';
  if (output.includes('iTime')) header += 'uniform float iTime;\n';
  if (output.includes('iTimeDelta')) header += 'uniform float iTimeDelta;\n';
  if (output.includes('iFrame')) header += 'uniform float iFrame;\n';
  if (output.includes('iChannel')) header += 'uniform float iChannel;\n';
  if (output.includes('iDate')) header += 'uniform vec4 iDate;\n';

  if (isES300) output = output.replace(/texture2D\s*\(/g, 'texture(');

  return {
    source: `${header}\n${output}`,
    isES300,
  };
};

interface InitState {
  width: number;
  height: number;
  fragSource: string;
}

function createState(gl: WebGL2RenderingContext, init: InitState) {
  const program = gl.createProgram();

  const vertShader300 = gl.createShader(gl.VERTEX_SHADER);
  const vertShader100 = gl.createShader(gl.VERTEX_SHADER);

  const fragShader = gl.createShader(gl.FRAGMENT_SHADER);
  if (!vertShader100 || !vertShader300 || !fragShader) {
    return null;
  }

  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

  gl.shaderSource(vertShader100, VS_SOURCE_100);
  gl.compileShader(vertShader100);
  gl.shaderSource(vertShader300, VS_SOURCE_300);
  gl.compileShader(vertShader300);

  const screenVertex = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
  const vertexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, screenVertex, gl.STATIC_DRAW);

  const texture = gl.createTexture();
  gl.activeTexture(gl['TEXTURE0']);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  let width = init.width;
  let height = init.height;

  let vertexPos: GLint = 0;
  let iResolution: WebGLUniformLocation | null = null;
  let iChannelResolution: WebGLUniformLocation | null = null;
  let iTime: WebGLUniformLocation | null = null;
  let iTimeDelta: WebGLUniformLocation | null = null;
  let iFrame: WebGLUniformLocation | null = null;
  let iChannel: WebGLUniformLocation | null = null;
  let iDate: WebGLUniformLocation | null = null;

  let frameCount = 0;
  let prevTimestamp: DOMHighResTimeStamp;
  let prevSource: string | null;

  const state = {
    draw(source: TexImageSource, timestamp: DOMHighResTimeStamp) {
      prevTimestamp = timestamp;

      gl.useProgram(program);

      if (isImageElement(source)) {
        if (source.complete) {
          const { currentSrc } = source;
          if (prevSource !== currentSrc) {
            prevSource = currentSrc;
            gl.texImage2D(
              gl.TEXTURE_2D,
              0,
              gl.RGBA,
              gl.RGBA,
              gl.UNSIGNED_BYTE,
              source
            );
          }
        }
      } else if (source) {
        prevSource = null;
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          source
        );
        if (iChannelResolution)
          gl.uniform3fv(iChannelResolution, [width, height, 0]);
      } else {
        prevSource = null;
        if (iChannelResolution) gl.uniform3fv(iChannelResolution, [0, 0, 0]);
      }

      if (iResolution) gl.uniform2f(iResolution, width, height);
      if (iTime) gl.uniform1f(iTime, timestamp / 1000);
      if (iTimeDelta) gl.uniform1f(iTime, (timestamp - prevTimestamp) / 1000);
      if (iFrame) gl.uniform1f(iFrame, frameCount++);
      if (iChannel) gl.uniform1i(iChannel, 0);
      if (iDate) gl.uniform4f(iDate, ...makeDateVector());

      gl.enableVertexAttribArray(vertexPos);
      gl.vertexAttribPointer(vertexPos, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },

    updateViewport(newWidth: number, newHeight: number) {
      gl.canvas.width = width = newWidth;
      gl.canvas.height = height = newHeight;
      gl.viewport(0, 0, width, height);
    },

    updateFragShader(fragSource: string) {
      const preprocessed = preprocessShader(fragSource);
      gl.shaderSource(fragShader, preprocessed.source);
      gl.compileShader(fragShader);
      const vertShader = preprocessed.isES300 ? vertShader300 : vertShader100;
      gl.attachShader(program, vertShader);
      gl.attachShader(program, fragShader);

      gl.linkProgram(program);

      vertexPos = gl.getAttribLocation(program, 'vPos');
      iResolution = gl.getUniformLocation(program, 'iResolution');
      iChannelResolution = gl.getUniformLocation(program, 'iChannelResolution');
      iTime = gl.getUniformLocation(program, 'iTime');
      iTimeDelta = gl.getUniformLocation(program, 'iTimeDelta');
      iFrame = gl.getUniformLocation(program, 'iFrame');
      iChannel = gl.getUniformLocation(program, 'iChannel');
      iDate = gl.getUniformLocation(program, 'iDate');
    },

    drawImmediate() {
      gl.useProgram(program);
      gl.enableVertexAttribArray(vertexPos);
      gl.vertexAttribPointer(vertexPos, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
  };

  state.updateViewport(width, height);
  state.updateFragShader(init.fragSource);
  return state;
}

class FragCanvas extends HTMLElement implements HTMLCanvasElement {
  static observedAttributes = ['pause'];

  private subscriptions: (() => void)[] = [];
  private state: ReturnType<typeof createState> | null = null;
  private input: HTMLCanvasElement | HTMLImageElement | HTMLVideoElement;
  private output: HTMLCanvasElement;
  public pause: boolean = false;

  constructor() {
    super();

    const sheet = new CSSStyleSheet();
    sheet.insertRule(':host([hidden]) { display: none; }');
    sheet.insertRule(':host { display: block; position: relative; }');
    sheet.insertRule(
      ':host * { position: absolute; width: 100%; height: 100%; }'
    );
    sheet.insertRule(':host *:not(:last-child) { visibility: hidden; }');

    const shadow = this.attachShadow({ mode: 'closed' });
    const output = (this.output = document.createElement('canvas'));
    const input = (this.input =
      this.querySelector(':not(canvas, script)') ||
      document.createElement('canvas'));

    shadow.adoptedStyleSheets = [sheet];
    shadow.appendChild(input);
    shadow.appendChild(output);
  }

  getContext(
    contextId: '2d',
    options?: CanvasRenderingContext2DSettings
  ): CanvasRenderingContext2D | null;
  getContext(
    contextId: 'bitmaprenderer',
    options?: ImageBitmapRenderingContextSettings
  ): ImageBitmapRenderingContext | null;
  getContext(
    contextId: 'webgl',
    options?: WebGLContextAttributes
  ): WebGLRenderingContext | null;
  getContext(
    contextId: 'webgl2',
    options?: WebGLContextAttributes
  ): WebGL2RenderingContext | null;

  getContext(contextId: string, options?: any) {
    if (!(this.input instanceof HTMLCanvasElement)) {
      return null;
    }
    this.input.width = this.width;
    this.input.height = this.height;
    return this.input.getContext(contextId, {
      alpha: true,
      desynchronized: true,
      preserveDrawingBuffer: true,
      ...options,
    });
  }

  toBlob(callback: BlobCallback, type?: string, quality?: any): void {
    return this.output.toBlob(callback, type, quality);
  }

  toDataURL(type?: string, quality?: any): string {
    return this.output.toDataURL(type, quality);
  }

  captureStream(frameRequestRate?: number): MediaStream {
    return this.output.captureStream(frameRequestRate);
  }

  transferControlToOffscreen(): OffscreenCanvas {
    return (
      this.input instanceof HTMLCanvasElement ? this.input : this.output
    ).transferControlToOffscreen();
  }

  get autoresize() {
    return this.hasAttribute('autoresize');
  }

  set autoresize(autoresize: boolean) {
    if (autoresize) {
      this.setAttribute('autoresize', '');
    } else {
      this.removeAttribute('autoresize');
    }
  }

  get source() {
    let text = '';
    for (const child of this.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        text += child.textContent || '';
      } else if (child instanceof HTMLScriptElement) {
        text = child.textContent || '';
        break;
      }
    }
    return text.trim();
  }

  get width() {
    if (this.state) {
      return this.output.width;
    } else {
      return this.clientWidth * devicePixelRatio;
    }
  }

  set width(width) {
    this.input.width = width;
  }

  get height() {
    if (this.state) {
      return this.output.height;
    } else {
      return this.clientHeight * devicePixelRatio;
    }
  }

  set height(height) {
    this.input.height = height;
  }

  #frameID: number | undefined;
  #rescheduleDraw() {
    const self = this;
    if (this.#frameID !== undefined) {
      cancelAnimationFrame(this.#frameID);
      this.#frameID = undefined;
    }
    if (!this.pause) {
      this.#frameID = requestAnimationFrame(function draw(
        timestamp: DOMHighResTimeStamp
      ) {
        if (self.state && !self.pause) {
          self.state.draw(self.input, timestamp);
          self.#frameID = requestAnimationFrame(draw);
        }
      });
    }
  }

  connectedCallback() {
    this.pause = !!this.getAttribute('pause');

    const gl = this.output.getContext('webgl2', {
      alpha: true,
      desynchronized: true,
      preserveDrawingBuffer: true,
    });

    const init = {
      fragSource: this.source,
      width: this.clientWidth * devicePixelRatio,
      height: this.clientHeight * devicePixelRatio,
    };

    const state = (this.state = gl && createState(gl, init));
    if (state) {
      this.subscriptions.push(
        trackResizes(this, entry => {
          const { inlineSize: width, blockSize: height } = entry;
          if (this.autoresize) {
            this.input.width = width;
            this.input.height = height;
          }
          state.updateViewport(width, height);
          state.drawImmediate();
          this.#rescheduleDraw();
        }),
        trackTextUpdates(this, () => {
          state.updateFragShader(this.source);
        }),
        trackVisibility(this, isVisible => {
          this.pause = !isVisible;
          this.#rescheduleDraw();
        })
      );
      this.#rescheduleDraw();
    }
  }

  attributeChangedCallback(
    name: string,
    _oldValue: unknown,
    newValue: unknown
  ) {
    if (name === 'pause') {
      this.pause = !!newValue;
      this.#rescheduleDraw();
    }
  }

  disconnectedCallback() {
    this.pause = true;
    this.subscriptions.forEach(unsubscribe => unsubscribe());
    this.subscriptions.length = 0;
    if (this.#frameID !== undefined) {
      cancelAnimationFrame(this.#frameID);
      this.#frameID = undefined;
    }
  }
}

customElements.define('frag-canvas', FragCanvas);
export { FragCanvas };
