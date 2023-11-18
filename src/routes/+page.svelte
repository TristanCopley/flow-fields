<script lang="ts">
	import { onMount } from 'svelte';
	import chroma from 'chroma-js';
	import * as twgl from 'twgl.js/dist/5.x/twgl-full.js';
	
	let mounted = false;

	import ColorPicker from 'svelte-awesome-color-picker';

	let rgba: {
		r: number;
		g: number;
		b: number;
		a: number;
	} = {
		r: 0,
		g: 0,
		b: 0,
		a: 1
	}

	let files: File[] = [];

	// $: {
	// 	if (file) {
	// 		IMAGE = URL.createObjectURL( new Blob(file));
	// 	}
	// }

	import img from '$lib/images/flag.png';
	const m4 = twgl.m4;
	twgl.setDefaults({ attribPrefix: 'a_' });

	let canvas: HTMLCanvasElement;
	let ff_canvas: HTMLCanvasElement;
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

	let IMAGE = img;
	let LINE_COUNT = 10000;
	let TRAIL_COUNT = 4;
	let INTERVAL_LENGTH = 40;
	let SCALE = 0.5;
	let OPACITY = 1;
	let BACKGROUND_COLOR = 'black';
	let CANVAS_DETAIL = 600;

	let image_bind = 9;
	let line_count_bind = 40;
	let trail_count_bind = 4;
	let interval_length_bind = 40;
	let scale_bind = 0.5;
	let opacity_bind = 1;
	let background_color_bind = 'black';
	let canvas_detail_bind = 600;

	$: {
		lines = [];
		LINE_COUNT = line_count_bind * line_count_bind
	};
	$: {
		lines = [];
		TRAIL_COUNT = trail_count_bind
	};
	$: {
		lines = [];
		INTERVAL_LENGTH = interval_length_bind
	};
	$: {
		SCALE = scale_bind
	};
	$: {
		OPACITY = opacity_bind
	};
	$: {
		BACKGROUND_COLOR = background_color_bind
	};
	$: {
		if (mounted) createFlowField();
		lines = [];
		CANVAS_DETAIL = canvas_detail_bind * 1.5
	};

	let lines = [] as {
		speed: number;
		life: number;
		x: number;
		y: number;
		xv: number;
		yv: number;
		color: number[];
		max_trail_length: number;
		trail: {
			x: number;
			y: number;
			color: number[];
		}[];
	}[];

	let gl: WebGLRenderingContext;

	function createLine() {
		let trails = [];
		let x = Math.random() * 4 + -2;
		let y = Math.random() * 2 + -1;
		let color = [0, 0, 0, 1];

		for (let k = 0; k < Math.floor(Math.random() * TRAIL_COUNT + 1); k++) {
			let trail_1 = {
				x: x,
				y: y,
				color: color
			};
			trails.push(trail_1);

			let trail_2 = {
				x: x,
				y: y,
				color: color
			};
			trails.push(trail_2);
		}

		lines.push({
			speed: Math.random() * 1 + 0.3,
			life: 100 + Math.random() * 300,
			x: x,
			y: y,
			max_trail_length: trails.length,
			xv: 0,
			yv: 0,
			color: color,
			trail: trails
		});
	}

	function addImageProcess(src: string): Promise<HTMLImageElement> {
		return new Promise((resolve, reject) => {
			let img = new Image()
			img.onload = () => resolve(img)
			img.onerror = reject
			img.src = src
		})
	}

	function instantiateBuffer(gl: WebGLRenderingContext) {
		let position_array = [] as number[];
		let color_array = [] as number[];

		return twgl.createBufferInfoFromArrays(gl, {
			position: {
				data: position_array,
				numComponents: 2
			},
			color: {
				data: color_array,
				numComponents: 3
			}
		});
	}

	async function createFlowField() {

		let flow_field_array = [] as number[][][];

		const cw = CANVAS_DETAIL * 2;
		const ch = CANVAS_DETAIL;

		ff_canvas.width = cw;
		ff_canvas.height = ch;

		let ff_ctx = ff_canvas.getContext('2d') as CanvasRenderingContext2D;

		ff_ctx.fillStyle = 'gray';
		ff_ctx.fillRect(0, 0, CANVAS_DETAIL * 2, CANVAS_DETAIL);

		ff_ctx.fillStyle = 'yellow';
		ff_ctx.fillRect(0, 0, cw * 0.5, ch * 0.5);

		ff_ctx.fillStyle = 'blue';
		ff_ctx.fillRect(cw * 0.5, 0, cw * 0.5, ch * 0.5);

		ff_ctx.fillStyle = 'green';
		ff_ctx.fillRect(cw * 0.5, ch * 0.5, cw * 0.5, ch * 0.5);

		ff_ctx.fillStyle = 'white';
		ff_ctx.fillRect(cw * 0.25, ch * 0.25, cw * 0.5, ch * 0.5);

		let image = await addImageProcess(IMAGE);
		ff_ctx.drawImage(image, 0, 0, cw, ch);

		let { data, height, width} = ff_ctx.getImageData(0, 0, cw, ch);

		for (let x = 0; x < width; x++) {
			flow_field_array[x] = [];
			for (let y = 0; y < height; y++) {
				let i = (x + y * width) * 4;
				let r = data[i];
				let g = data[i + 1];
				let b = data[i + 2];
				let a = data[i + 3];

				flow_field_array[x][y] = [r, g, b, a];//(r+g+b)/(3*255) * Math.PI * 2;

			}
		}

		return {
			array: flow_field_array,
			width,
			height
		};
		
	}

	function clamp(x: number, min: number, max: number) {
		return Math.min(Math.max(x, min), max);
	}

	function getNearestFlowFieldDirection(flow_field: {array: number[][][], height: number, width: number}, x: number, y: number) {

		return flow_field.array[
			clamp(Math.floor(((x + 2) / 4) * flow_field.width), 0, flow_field.width - 1)
		][
			clamp(Math.floor(((y + 1) / 2) * flow_field.height), 0, flow_field.height - 1)
		];

	}

	onMount(async () => {


		gl = canvas.getContext('webgl', {
			premultipliedAlpha: false,
		}) as WebGLRenderingContext;
		if (!gl) return console.error('No context');

		let flow_field = await createFlowField();

		mounted = true;

		const programInfo = twgl.createProgramInfo(gl, [vs, fs]);

		let position_array = [] as number[];
		let color_array = [] as number[];

		let bufferInfo = instantiateBuffer(gl);

		const uniforms = {
			u_matrix: m4.identity()
		};

		let delta_time = 0;
		let last_time = 0;
		let interval = 0;

		animate = (time = 0) => {
			delta_time = time - last_time;
			last_time = time;

			position_array = [];
			color_array = [];

			interval++;
			interval = interval % INTERVAL_LENGTH;

			for (let i = 0; i < lines.length; i++) {
				let line = lines[i];
				line.life--;

				if (line.life < 0) {
					line.max_trail_length--;
					line.trail.pop();
					line.trail.pop();
				}
				if (line.max_trail_length <= 0) {
					lines.splice(i, 1);
					i--;
				}
			}

			while (lines.length < LINE_COUNT) {
				createLine();
			}

			for (let i = 0; i < lines.length; i++) {
				let line = lines[i];

				// update position
				line.x += line.xv * line.speed;
				line.y += line.yv * line.speed;

				let flow_direction_data = getNearestFlowFieldDirection(flow_field, line.x, line.y);

				let r = flow_direction_data[0];
				let g = flow_direction_data[1];
				let b = flow_direction_data[2];

				let color = (r+g+b)/(3*255) * Math.PI * 2;

				line.xv += Math.sin(color) * 0.0001;
				line.yv += Math.cos(color) * 0.0001;

				line.xv *= 0.95;
				line.yv *= 0.95;

				line.color = chroma(r, g, b).gl();// chroma((line.xv * 600) ** 2, (line.yv * 600)** 2, 0.5, 'hsl').gl();


				if (line.x > 2.1 || line.x < -2.1) {
					line.life = 0;
				}

				if (line.y > 1.05 || line.y < -1.05) {
					line.life = 0;
				}

				let a = 1 - interval / INTERVAL_LENGTH;

				if (line.trail.length >= 1) {
					line.trail[0].x = line.x;
					line.trail[0].y = line.y;
				}

				if (interval === 0) {
					line.trail.unshift(
						{
							x: line.x,
							y: line.y,
							color: line.color
						},
						{
							x: line.trail[0]?.x || line.x,
							y: line.trail[0]?.y || line.y,
							color: line.color
						}
					);

					if (line.trail.length > line.max_trail_length) {
						line.trail.pop();
						line.trail.pop();
					}
				}

				for (let k = 0; k < line.trail.length; k++) {
					let trail = line.trail[k];

					if (k + 1 === line.trail.length) {
						let x = a * trail.x + (1 - a) * line.trail[k - 1].x;
						let y = a * trail.y + (1 - a) * line.trail[k - 1].y;

						position_array.push(x * SCALE, y * SCALE);
						color_array.push(...trail.color);
						continue;
					}

					position_array.push(trail.x * SCALE, trail.y * SCALE);
					color_array.push(...trail.color);
				}
			}

			bufferInfo = twgl.createBufferInfoFromArrays(gl, {
				position: {
					data: position_array,
					numComponents: 2
				},
				color: {
					data: color_array,
					numComponents: 4
				}
			});

			// render stuff
			twgl.resizeCanvasToDisplaySize(canvas);
			gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

			gl.enable(gl.DEPTH_TEST);
			gl.enable(gl.CULL_FACE);
			gl.clearColor(1, 1, 1, 0);
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

<!--

	let IMAGE = img;
	let LINE_COUNT = 10000;
	let TRAIL_COUNT = 4;
	let INTERVAL_LENGTH = 40;
	let SCALE = 0.5;
	let OPACITY = 1;
	let CANVAS_DETAIL = 600;
	let BACKGROUND_COLOR = 'black';

-->

<div class='w-screen h-screen flex flex-col justify-center overflow-clip' style='background-color: {`rgba(${rgba.r},${rgba.g},${rgba.b},${rgba.a})`};'>
	<canvas bind:this={ff_canvas} class='z-0 absolute self-center h-screen' style='transform: scale({SCALE}); opacity: {OPACITY};' />
	<canvas bind:this={canvas} id="canvas" class="z-10 absolute self-center w-screen h-screen" />
	<div class='z-40 w-screen h-screen absolute flex left-0 top-0'>
		<div class='relative w-full h-full'>
			<div class='flex absolute bg-black border-2 border-white w-64 h-fit p-2 !text-zinc-200 scale-90' >
				<div class='flex flex-col relative w-full gap-2'>

					<div class='w-full flex flex-col gap-1'>
						<span class='text-xs'>
							LINE COUNT
						</span>
						<div class='flex gap-2 justify-between w-full'>
							<input type="range" min="0" max="250" class="range range-xs" bind:value={line_count_bind} />
							<span class='w-20'>
								{LINE_COUNT}
							</span>
						</div>
					</div>

					<div class='w-full flex flex-col gap-1'>
						<span class='text-xs'>
							TRAIL COUNT
						</span>
						<div class='flex gap-2 justify-between w-full'>
							<input type="range" min="0" max="250" class="range range-xs" bind:value={trail_count_bind} />
							<span class='w-20'>
								{TRAIL_COUNT}
							</span>
						</div>
					</div>

					<div class='w-full flex flex-col gap-1'>
						<span class='text-xs'>
							INTERVAL LENGTH
						</span>
						<div class='flex gap-2 justify-between w-full'>
							<input type="range" min="0" max="100" class="range range-xs" bind:value={interval_length_bind} />
							<span class='w-20'>
								{INTERVAL_LENGTH}
							</span>
						</div>
					</div>

					<div class='w-full flex flex-col gap-1'>
						<span class='text-xs'>
							SCALE
						</span>
						<div class='flex gap-2 justify-between w-full'>
							<input type="range" min="0.0" max="1.0" step="0.0001" class="range range-xs" bind:value={scale_bind} />
							<span class='w-20'>
								{SCALE}
							</span>
						</div>
					</div>

					<div class='w-full flex flex-col gap-1'>
						<span class='text-xs'>
							OPACITY
						</span>
						<div class='flex gap-2 justify-between w-full'>
							<input type="range" min="0.0" max="1.0" step="0.0001" class="range range-xs" bind:value={opacity_bind} />
							<span class='w-20'>
								{OPACITY}
							</span>
						</div>
					</div>
					
					<div class='flex flex-col gap-1'>
						<span class='text-xs'>
							BACKGROUND COLOR
						</span>
						<div class=''>
							<ColorPicker bind:rgb={rgba} />
						</div>
					</div>

					<div class='w-full flex flex-col gap-1'>
						<span class='text-xs'>
							IMAGE
						</span>
						<div class='flex gap-2 justify-between w-full'>
							<input type="file" class="file-input file-input-sm file-input-bordered w-full max-w-xs bg-black" bind:files={files} />
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
</div>

<style lang="postcss">
	.file-input::file-selector-button {
		color: black;
		@apply rounded-none bg-slate-300;
	}
</style>