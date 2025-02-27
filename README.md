# frag-canvas

**A custom element providing a canvas to apply a fragment shader to.**

The `<frag-canvas>` element renders an output canvas and applies a fragment
shader to it. The canvas' input is either determined by an internal input
canvas (that can be drawn to using the usual `getContext()` draw context)
or an input image or video element, passed as a child element.

The fragment shader is sourced from a script child or the element's text
contents.

The fragment shader may either be written in GLSL ES 100 or GLSL ES 300,
but the internal context will always be created using WebGL 2.

The fragment shader may use input uniforms that are roughly the same
as [ShaderToy's](https://www.shadertoy.com/howto) with these
uniforms being supported:

- `iResolution`
- `iChannelResolution` (with one channel only)
- `iTime`
- `iTimeDelta`
- `iFrame`
- `iChannel` (always `0`)
- `iDate`

Only one channel will be provided (`uniform sampler2D iChannel0`)

### Applying a fragment shader to an image

```html
<frag-canvas id="canvas">
  <script type="x-shader/x-fragment">
    precision mediump float;

    uniform vec2 iResolution;
    uniform float iTime;
    uniform sampler2D iChannel0;

    void mainImage(out vec4 fragColor, in vec2 fragCoord) {
      vec2 uv = fragCoord/iResolution.xy;
      vec4 texColor = texture2D(iChannel0, uv);
      float wave = sin(uv.y * 10.0 + iTime) * 0.01;
      vec2 distortedUV = uv + vec2(wave, 0.0);
      vec4 finalColor = texture2D(iChannel0, distortedUV);
      fragColor = finalColor;
    }

    void main() {
      mainImage(gl_FragColor, gl_FragCoord.xy);
    }
  </script>
  <img src="./photo.jpg" />
</frag-canvas>
```

### Applying a fragment shader to canvas contents

```html
<frag-canvas id="example">
  <script type="x-shader/x-fragment">
    precision mediump float;

    uniform vec2 iResolution;
    uniform float iTime;
    uniform sampler2D iChannel0;

    void mainImage(out vec4 fragColor, in vec2 fragCoord) {
      vec2 uv = fragCoord/iResolution.xy;
      vec4 texColor = texture2D(iChannel0, uv);
      float wave = sin(uv.y * 10.0 + iTime) * 0.01;
      vec2 distortedUV = uv + vec2(wave, 0.0);
      vec4 finalColor = texture2D(iChannel0, distortedUV);
      fragColor = finalColor;
    }

    void main() {
      mainImage(gl_FragColor, gl_FragCoord.xy);
    }
  </script>
</frag-canvas>

<script>
  const canvas = document.getElementById('example');
  const ctx = canvas.getContext('2d');

  requestAnimationFrame(draw() => {
    ctx.fillStyle = 'red';
    ctx.fillRect(100, 100, 200, 200);
    ctx.fillStyle = 'blue';
    ctx.beginPath();
    ctx.arc(300, 300, 50, 0, Math.PI * 2);
    ctx.fill();
  });
</script>
```

### Auto-resizing the canvas while redrawing

```html
<frag-canvas id="example" autoresize>
  <script type="x-shader/x-fragment">
    precision mediump float;

    uniform vec2 iResolution;
    uniform float iTime;
    uniform sampler2D iChannel0;

    void mainImage(out vec4 fragColor, in vec2 fragCoord) {
      vec2 uv = fragCoord/iResolution.xy;
      vec4 texColor = texture2D(iChannel0, uv);
      float wave = sin(uv.y * 10.0 + iTime) * 0.01;
      vec2 distortedUV = uv + vec2(wave, 0.0);
      vec4 finalColor = texture2D(iChannel0, distortedUV);
      fragColor = finalColor;
    }

    void main() {
      mainImage(gl_FragColor, gl_FragCoord.xy);
    }
  </script>
</frag-canvas>

<script>
  const canvas = document.getElementById('example');
  const ctx = canvas.getContext('2d');

  requestAnimationFrame(function draw() {
    ctx.fillStyle = 'red';
    ctx.fillRect(100, 100, 200, 200);
    ctx.fillStyle = 'blue';
    ctx.beginPath();
    ctx.arc(300, 300, 50, 0, Math.PI * 2);
    ctx.fill();
    requestAnimationFrame(draw);
  });
</script>
```
