<script lang="ts">
	import { onMount } from 'svelte';
	import chroma from 'chroma-js';
	import * as twgl from 'twgl.js/dist/5.x/twgl-full.js';

	let canvas: HTMLCanvasElement;
	let animate: () => void;

	const vs = `
      uniform mat4 u_matrix;

      attribute vec2 a_position;
      attribute vec4 a_color;

      varying vec4 v_color;

      #define PI 3.14159

      void main() {
        gl_Position = u_matrix * vec4(a_position.x, a_position.y, 0, 1);
        v_color = a_color;
      }
    `;
	const fs = `
      precision mediump float;

      varying vec4 v_color;

      void main() {
        gl_FragColor = v_color;
      }
    `;

	let lines = [] as {
		speed: number;
		x: number;
		y: number;
		xv: number;
		yv: number;
		color: any;
		trails: {
			x: number;
			y: number;
			color: any;
		}[];
	}[];

	let lines_count = 1000;
	let trails_count = 60;

	for (let i = 0; i < lines_count; i++) {
		lines.push({
			speed: Math.random() * 3 + 0.01,
			x: Math.random() * 2 - 1,
			y: Math.random() * 2 - 1,
			xv: Math.random() * 0.01 - 0.005,
			yv: Math.random() * 0.01 - 0.005,
			color: chroma.random().rgb(),
			trails: []
		});
	}

	onMount(() => {
		const gl = canvas.getContext('webgl') as WebGLRenderingContext;
		if (!gl) return console.error('No context');

		const m4 = twgl.m4;
		twgl.setDefaults({ attribPrefix: 'a_' });

		const programInfo = twgl.createProgramInfo(gl, [vs, fs]);

		const arrays = {
			position: twgl.primitives.createAugmentedTypedArray(2, lines_count * 2),
			color: twgl.primitives.createAugmentedTypedArray(3, lines_count * 2, Uint8Array)
		};

		// @ts-expect-error
		function rand(min, max) {
			return min + Math.random() * (max - min);
		}

		const uniforms = {
			u_matrix: m4.identity()
		};

		let delta_time = 0;
		let last_time = 0;

		let bufferInfo = twgl.createBufferInfoFromArrays(gl, arrays);

		animate = (time = 0) => {
			delta_time = time - last_time;
			last_time = time;

			let _arrays_data = {
				position: [] as number[],
				color: [] as number[]
			};

			// update stuff
			for (let i = 0; i < lines.length; i++) {
				let line = lines[i];

				line.x += line.xv * line.speed + Math.random() * 0.01 - 0.005;
				line.y += line.yv * line.speed + Math.random() * 0.01 - 0.005;

				if (line.x > 1) {
					line.x = 1;
					line.xv *= -1;
				}
				if (line.x < -1) {
					line.x = -1;
					line.xv *= -1;
				}
				if (line.y > 1) {
					line.y = 1;
					line.yv *= -1;
				}
				if (line.y < -1) {
					line.y = -1;
					line.yv *= -1;
				}

				line.trails.unshift({
					x: line.x,
					y: line.y,
					color: line.color
				});

				if (line.trails.length > trails_count) {
					line.trails.pop();
				}

				for (let j = 0; j < line.trails.length; j++) {
					let trail = line.trails[j];
					_arrays_data.position.push(trail.x, trail.y);
					_arrays_data.color.push(trail.color);
				}
			}

			if (_arrays_data.position.length % 2 === 1) {
				_arrays_data.position.shift();
				_arrays_data.color.shift();
			}

			let _arrays = {
				position: twgl.primitives.createAugmentedTypedArray(2, _arrays_data.position.length),
				color: twgl.primitives.createAugmentedTypedArray(3, _arrays_data.color.length, Uint8Array)
			};

			_arrays.position.push(..._arrays_data.position);
			_arrays.color.push(..._arrays_data.color);

			bufferInfo = twgl.createBufferInfoFromArrays(gl, _arrays);

			// render stuff

			twgl.resizeCanvasToDisplaySize(canvas);
			gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

			gl.enable(gl.DEPTH_TEST);
			gl.enable(gl.CULL_FACE);
			gl.clearColor(0, 0, 0, 1);
			gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

			// Something with camera
			const aspect = gl.canvas.width / gl.canvas.height;
			m4.ortho(-aspect, aspect, 1, -1, -1, 1, uniforms.u_matrix);

			gl.useProgram(programInfo.program);
			twgl.setBuffersAndAttributes(gl, programInfo, bufferInfo);
			twgl.setUniforms(programInfo, uniforms);

			twgl.drawBufferInfo(gl, bufferInfo, gl.LINES);

			requestAnimationFrame(animate);
		};
		animate();
	});
</script>

<svelte:window
	on:resize={() => {
		canvas.width = window.innerWidth;
		canvas.height = window.innerHeight;
	}}
/>

<canvas bind:this={canvas} id="canvas" class="w-screen h-screen" />
