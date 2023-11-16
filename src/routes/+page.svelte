<script lang="ts">
	import { onMount } from 'svelte';
	import chroma from 'chroma-js';
	import * as twgl from 'twgl.js/dist/5.x/twgl-full.js';

	const m4 = twgl.m4;
	twgl.setDefaults({ attribPrefix: 'a_' });

	let canvas: HTMLCanvasElement;
	let animate: () => void;

	const vs = `
      uniform mat4 u_matrix;

      attribute vec2 a_position;
      attribute vec4 a_color;

      varying vec4 v_color;

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

	const LINE_COUNT = 20000;
	const TRAIL_COUNT = 1;
	const LINE_PAYLOAD_SIZE = 9 + TRAIL_COUNT * 10;

	// trail_length, speed, color, x, y, xv, yv, [...[color, x, y]]
	let line_data_buffer = new Float32Array(LINE_PAYLOAD_SIZE * LINE_COUNT);

	let gl: WebGLRenderingContext;


	function instantiateLines(gl: WebGLRenderingContext) {

		let color_array = [];
		let position_array = [];

		for (let i = 0; i < line_data_buffer.length; i += LINE_PAYLOAD_SIZE) {
			line_data_buffer[i] = 0; // trail length
			line_data_buffer[i + 1] = 1; // speed

			// color
			let color = chroma.random().rgb(); // color
			line_data_buffer[i + 2] = color[0]; // r
			line_data_buffer[i + 3] = color[1]; // g
			line_data_buffer[i + 4] = color[2]; // b

			// position
			line_data_buffer[i + 5] = Math.random() * 0.002 + -0.001; // x
			line_data_buffer[i + 6] = Math.random() * 0.002 + -0.001; // y

			// velocity
			line_data_buffer[i + 7] = Math.random() * 0.002 + -0.001; // x
			line_data_buffer[i + 8] = Math.random() * 0.002 + -0.001; // y

			// creates TRAIL_COUNT * 2 particles for lines
			for (let k = 0; k < TRAIL_COUNT * 2; k++) {

				// color
				let color = chroma.random().rgb(); // color
				line_data_buffer[i + 9 + k * 5] = color[0]; // r
				line_data_buffer[i + 10 + k * 5] = color[1]; // g
				line_data_buffer[i + 11 + k * 5] = color[2]; // b
				color_array.push(...color);

				// position
				line_data_buffer[i + 12 + k * 5] = line_data_buffer[i + 5]; // x
				line_data_buffer[i + 13 + k * 5] = line_data_buffer[i + 6]; // y
				position_array.push(line_data_buffer[i + 12 + k * 5], line_data_buffer[i + 13 + k * 5]);
				
			}
		}

		return twgl.createBufferInfoFromArrays(gl, {
			position: { 
				data: position_array, 
				numComponents: 2,
				drawType: gl.DYNAMIC_DRAW 
				
			},
			color: { 
				data: color_array, 
				numComponents: 3,
				drawType: gl.DYNAMIC_DRAW 
			},
		});

	}

	onMount(() => {
		gl = canvas.getContext('webgl') as WebGLRenderingContext;
		if (!gl) return console.error('No context');

		const programInfo = twgl.createProgramInfo(gl, [vs, fs]);

		let position_array = [] as number[];
		let color_array = [] as number[];

		let bufferInfo = instantiateLines(gl);;

		const uniforms = {
			u_matrix: m4.identity()
		};

		let delta_time = 0;
		let last_time = 0;

		animate = (time = 0) => {
			delta_time = time - last_time;
			last_time = time;

			position_array = [];
			color_array = [];

			for (let i = 0; i < line_data_buffer.length; i += LINE_PAYLOAD_SIZE) {

				let trail_length = line_data_buffer[i];
				let speed = line_data_buffer[i + 1];

				let lx = line_data_buffer[i + 5];
				let ly = line_data_buffer[i + 6];

				// update position
				line_data_buffer[i + 5] += line_data_buffer[i + 7]; // x
				line_data_buffer[i + 6] += line_data_buffer[i + 8]; // y

				let nx = line_data_buffer[i + 5];
				let ny = line_data_buffer[i + 6];

				line_data_buffer[i + 7] += Math.random() * 0.0001 + -0.00005; // x
				line_data_buffer[i + 8] += Math.random() * 0.0001 + -0.00005; // y

				if (line_data_buffer[i + 5] > 1 || line_data_buffer[i + 5] < -1) {
					line_data_buffer[i + 7] *= -1;
				}

				if (line_data_buffer[i + 6] > 1 || line_data_buffer[i + 6] < -1) {
					line_data_buffer[i + 8] *= -1;
				}


				// Trail

				// update trail length
				trail_length += 1;
				if (trail_length % TRAIL_COUNT === 0 && trail_length > TRAIL_COUNT) {
					trail_length = TRAIL_COUNT;
				}

				let slot = trail_length % TRAIL_COUNT;

				// update line data
				line_data_buffer[i] = trail_length;

				line_data_buffer[i + 12 + (slot*2) * 5] = lx;
				line_data_buffer[i + 13 + (slot*2) * 5] = ly;

				line_data_buffer[i + 12 + (slot*2+1) * 5] = nx// + xv * speed * delta_time / 1000;
				line_data_buffer[i + 13 + (slot*2+1) * 5] = ny //+ xv * speed * delta_time / 1000;

				for (let k = 0; k < TRAIL_COUNT * 2; k++) {

					// color
					let color = chroma.random().rgb(); // color
					line_data_buffer[i + 9 + k * 5] = color[0]; // r
					line_data_buffer[i + 10 + k * 5] = color[1]; // g
					line_data_buffer[i + 11 + k * 5] = color[2]; // b
					color_array.push(Math.floor(color[0]), Math.floor(color[1]), Math.floor(color[2]));

					let x = line_data_buffer[i + 12 + k * 5];
					let y = line_data_buffer[i + 13 + k * 5];
					position_array.push(x, y);
					
				}

			}
			
			// @ts-expect-error
			twgl.setAttribInfoBufferFromArray(gl, bufferInfo.attribs.a_position, position_array);
			// @ts-expect-error
			twgl.setAttribInfoBufferFromArray(gl, bufferInfo.attribs.a_color, color_array);

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
