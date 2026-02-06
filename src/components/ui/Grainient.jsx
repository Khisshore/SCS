import React, { useRef, useEffect } from "react";
import { Renderer, Program, Mesh, Triangle } from "ogl";

const vertexShader = `
  attribute vec2 uv;
  attribute vec2 position;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 0, 1);
  }
`;

const fragmentShader = `
  precision highp float;
  uniform float uTime;
  uniform vec3 uColor1;
  uniform vec3 uColor2;
  uniform vec3 uColor3;
  uniform float uNoiseScale;
  uniform float uGrainAmount;
  uniform float uGrainScale;
  uniform bool uGrainAnimated;
  uniform vec2 uResolution;

  varying vec2 vUv;

  // Simplex 2D noise
  vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }

  float snoise(vec2 v){
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
             -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy) );
    vec2 x0 = v -   i + dot(i, C.xx);
    vec2 i1;
    i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod(i, 289.0);
    vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
    + i.x + vec3(0.0, i1.x, 1.0 ));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m = m*m ;
    m = m*m ;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  void main() {
    vec2 uv = vUv;
    
    // Gradient
    vec3 color = mix(uColor1, uColor2, uv.x + snoise(uv * 2.0 + uTime * 0.1) * 0.2);
    color = mix(color, uColor3, uv.y + snoise(uv * 3.0 - uTime * 0.15) * 0.2);

    // Grain
    float grainTime = uGrainAnimated ? uTime : 0.0;
    float noise = (snoise(gl_FragCoord.xy * uGrainScale + grainTime) + 1.0) * 0.5;
    color += (noise - 0.5) * uGrainAmount;

    gl_FragColor = vec4(color, 1.0);
  }
`;

function hexToRgb(hex) {
  const bigint = parseInt(hex.replace("#", ""), 16);
  return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255].map(
    (x) => x / 255
  );
}

const Grainient = ({
  color1 = "#04000b",
  color2 = "#3e3c49",
  color3 = "#68666b",
  timeSpeed = 0.25,
  grainAmount = 0.1,
  grainScale = 2,
  grainAnimated = false,
  noiseScale = 2,
}) => {
  const containerRef = useRef(null);
  const timeRef = useRef(0);

  useEffect(() => {
    if (!containerRef.current) return;

    const renderer = new Renderer({ alpha: true });
    const gl = renderer.gl;
    containerRef.current.appendChild(gl.canvas);

    const program = new Program(gl, {
      vertex: vertexShader,
      fragment: fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uColor1: { value: hexToRgb(color1) },
        uColor2: { value: hexToRgb(color2) },
        uColor3: { value: hexToRgb(color3) },
        uGrainAmount: { value: grainAmount },
        uGrainScale: { value: grainScale },
        uGrainAnimated: { value: grainAnimated },
        uNoiseScale: { value: noiseScale },
        uResolution: { value: [gl.canvas.width, gl.canvas.height] },
      },
    });

    const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });

    function resize() {
      if (!containerRef.current) return;
      renderer.setSize(
        containerRef.current.offsetWidth,
        containerRef.current.offsetHeight
      );
      program.uniforms.uResolution.value = [gl.canvas.width, gl.canvas.height];
    }
    window.addEventListener("resize", resize);
    resize();

    let animateId;
    function update(t) {
      animateId = requestAnimationFrame(update);
      timeRef.current += 0.01 * timeSpeed;
      program.uniforms.uTime.value = timeRef.current;
      renderer.render({ scene: mesh });
    }
    animateId = requestAnimationFrame(update);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animateId);
      if (containerRef.current && gl.canvas.parentNode) {
        containerRef.current.removeChild(gl.canvas);
      }
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [color1, color2, color3, timeSpeed, grainAmount, grainScale, grainAnimated]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
};

export default Grainient;
