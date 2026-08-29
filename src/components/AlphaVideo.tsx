import { useEffect, useRef, type CSSProperties } from 'react'

/**
 * Renders an alpha-packed H.264 MP4 (see lib/alphaPack) as a transparent video
 * on any browser — including iOS Safari, which can't decode WebM alpha. The MP4
 * stacks colour (premultiplied, top) over an alpha matte (bottom); a WebGL shader
 * samples both halves and emits real per-pixel transparency, composited over
 * whatever sits behind the <canvas>.
 */
export function AlphaVideo({
  src,
  style,
  className,
  onReady,
}: {
  src: string
  style?: CSSProperties
  className?: string
  onReady?: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false })
    if (!gl) return

    const video = document.createElement('video')
    video.src = src
    video.crossOrigin = 'anonymous'
    video.muted = true
    video.loop = true
    video.playsInline = true
    // @ts-expect-error non-standard but needed for iOS inline autoplay
    video['webkit-playsinline'] = true
    video.autoplay = true

    // ── shader: sample top half (premultiplied colour) + bottom half (alpha) ──
    const vsrc = 'attribute vec2 p; varying vec2 uv; void main(){ uv = vec2((p.x+1.0)*0.5, (1.0-p.y)*0.5); gl_Position = vec4(p,0.0,1.0); }'
    const fsrc =
      'precision mediump float; varying vec2 uv; uniform sampler2D tex;' +
      'void main(){' +
      '  vec3 c = texture2D(tex, vec2(uv.x, uv.y*0.5)).rgb;' + // top: premultiplied colour
      '  float a = texture2D(tex, vec2(uv.x, uv.y*0.5 + 0.5)).r;' + // bottom: alpha matte
      '  gl_FragColor = vec4(c, a);' + // premultipliedAlpha:true → colour already ×alpha
      '}'
    const compile = (type: number, s: string) => {
      const sh = gl.createShader(type)!
      gl.shaderSource(sh, s)
      gl.compileShader(sh)
      return sh
    }
    const prog = gl.createProgram()!
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vsrc))
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fsrc))
    gl.linkProgram(prog)
    gl.useProgram(prog)

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'p')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

    const tex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0)
    gl.clearColor(0, 0, 0, 0)

    let raf = 0
    let started = false
    const render = () => {
      if (video.readyState >= 2 && video.videoWidth) {
        if (!started) {
          // Output frame is W × H (half the packed height).
          canvas.width = video.videoWidth
          canvas.height = video.videoHeight / 2
          gl.viewport(0, 0, canvas.width, canvas.height)
          started = true
          onReady?.()
        }
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video)
        gl.clear(gl.COLOR_BUFFER_BIT)
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      }
      raf = requestAnimationFrame(render)
    }

    const kick = () => video.play().catch(() => {})
    video.addEventListener('loadeddata', kick)
    kick()
    raf = requestAnimationFrame(render)

    return () => {
      cancelAnimationFrame(raf)
      video.removeEventListener('loadeddata', kick)
      video.pause()
      video.src = ''
      const lose = gl.getExtension('WEBGL_lose_context')
      lose?.loseContext()
    }
  }, [src, onReady])

  return <canvas ref={canvasRef} className={className} style={style} />
}
