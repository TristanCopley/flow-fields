<script lang="ts">
	import { onMount } from 'svelte';
	import chroma from 'chroma-js';
	import * as twgl from 'twgl.js/dist/5.x/twgl-full.js';
	import ColorPicker from 'svelte-awesome-color-picker';
	import { ArrayBufferTarget, Muxer } from 'webm-muxer';

	import LucideGripVertical from '~icons/lucide/grip-vertical';
	import LucideCircleDot from '~icons/lucide/circle-dot';
	import LucideMinus from '~icons/lucide/minus';

	import img from '$lib/images/flag.png';

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
	};

	let mounted = false;

	let files: FileList;
	let settings: HTMLDivElement;
	let grabbing = false;
	let moving = false;

	let RECORD_MESSAGE = 'No file';

	let is_recording = false;
	let FRAMES = 0;
	let video_url: string;

	const m4 = twgl.m4;
	twgl.setDefaults({ attribPrefix: 'a_' });

	let canvas: HTMLCanvasElement;
	let ff_canvas: HTMLCanvasElement;
	let canvas_container: HTMLDivElement;
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
	let LINE_COUNT = 50;
	let TRAIL_COUNT = 10;
	let INTERVAL_LENGTH = 10;
	let SCALE = 0.5;
	let OPACITY = 0.1;
	let BACKGROUND_COLOR = 'black';
	let CANVAS_DETAIL = 30;
	let SPEED = 1;
	let RECORD_FRAMERATE = 30;

	let line_count_bind = LINE_COUNT;
	let trail_count_bind = TRAIL_COUNT;
	let scale_bind = SCALE;
	let opacity_bind = OPACITY;
	let background_color_bind = BACKGROUND_COLOR;
	let canvas_detail_bind = CANVAS_DETAIL;
	let speed_bind = SPEED;

	$: {
		lines = [];
		LINE_COUNT = Math.round(line_count_bind ** 2.2);
	}
	$: {
		lines = [];
		TRAIL_COUNT = trail_count_bind;
	}
	$: {
		SCALE = scale_bind;
	}
	$: {
		OPACITY = opacity_bind;
	}
	$: {
		BACKGROUND_COLOR = background_color_bind;
	}
	$: {
		if (mounted)
			(async () => {
				flow_field = await createFlowField();
			})();
		lines = [];
		CANVAS_DETAIL = Math.round(canvas_detail_bind ** 1.5);
	}
	$: {
		if (files?.item(0)) {
			(async () => {
				try {
					let file = files?.item(0) as File;
					let blob = URL.createObjectURL(files.item(0));
					let reader = new FileReader();
					reader.readAsDataURL(file);

					reader.onloadend = async () => {
						IMAGE = reader.result as string;
						flow_field = await createFlowField();
						lines = [];
					};
				} catch (e) {
					alert('Bad file');
					console.log(e);
				}
			})();
		}
	}

	$: {
		lines = [];
		SPEED = parseFloat((speed_bind * speed_bind).toFixed(3));
	}

	let flow_field: {
		array: number[][][];
		width: number;
		height: number;
	} = {
		array: [],
		width: 0,
		height: 0
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
			speed: (Math.random() + 0.3) * SPEED,
			life: 100 + Math.random() * 200,
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
			let img = new Image();
			img.onload = () => resolve(img);
			img.onerror = reject;
			img.src = src;
		});
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

		let ff_ctx = ff_canvas.getContext('2d', {
			willReadFrequently: true
		}) as CanvasRenderingContext2D;

		// ff_ctx.fillStyle = 'gray';
		// ff_ctx.fillRect(0, 0, CANVAS_DETAIL * 2, CANVAS_DETAIL);

		// ff_ctx.fillStyle = 'yellow';
		// ff_ctx.fillRect(0, 0, cw * 0.5, ch * 0.5);

		// ff_ctx.fillStyle = 'blue';
		// ff_ctx.fillRect(cw * 0.5, 0, cw * 0.5, ch * 0.5);

		// ff_ctx.fillStyle = 'green';
		// ff_ctx.fillRect(cw * 0.5, ch * 0.5, cw * 0.5, ch * 0.5);

		// ff_ctx.fillStyle = 'white';
		// ff_ctx.fillRect(cw * 0.25, ch * 0.25, cw * 0.5, ch * 0.5);

		let image = await addImageProcess(IMAGE);
		ff_ctx.drawImage(image, 0, 0, cw, ch);

		let { data, height, width } = ff_ctx.getImageData(0, 0, cw, ch);

		for (let x = 0; x < width; x++) {
			flow_field_array[x] = [];
			for (let y = 0; y < height; y++) {
				let i = (x + y * width) * 4;
				let r = data[i];
				let g = data[i + 1];
				let b = data[i + 2];
				let a = data[i + 3];

				flow_field_array[x][y] = [r, g, b, a]; //(r+g+b)/(3*255) * Math.PI * 2;
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

	function getNearestFlowFieldDirection(
		flow_field: { array: number[][][]; height: number; width: number },
		x: number,
		y: number
	) {
		return flow_field.array[
			clamp(Math.floor(((x + 2) / 4) * flow_field.width), 0, flow_field.width - 1)
		][clamp(Math.floor(((y + 1) / 2) * flow_field.height), 0, flow_field.height - 1)];
	}

	/** RECORDING & MUXING STUFF */

	let muxer = null;
	let videoEncoder = null;

	const startRecording = async () => {
		FRAMES = 0;

		// Check for VideoEncoder availability
		if (typeof VideoEncoder === 'undefined') {
			alert("Looks like your user agent doesn't support VideoEncoder / WebCodecs API yet.");
			return;
		}

		// Create a WebM muxer with a video track and maybe an audio track
		muxer = new Muxer({
			target: new ArrayBufferTarget(),
			video: {
				codec: 'V_VP9',
				width: canvas.width,
				height: canvas.height,
				frameRate: RECORD_FRAMERATE
			},
			firstTimestampBehavior: 'offset' // Because we're directly piping a MediaStreamTrack's data into it
		});

		videoEncoder = new VideoEncoder({
			output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
			error: (e) => console.error(e)
		});

		videoEncoder.configure({
			codec: 'vp09.00.10.08',
			width: canvas.width,
			height: canvas.height,
			bitrate: 1e6
		});

		is_recording = true;

		encodeVideoFrame();
		//intervalId = setInterval(encodeVideoFrame, 1000/30);
	};

	const encodeVideoFrame = () => {
		let elapsedTime = (FRAMES * 1000) / RECORD_FRAMERATE;
		let frame = new VideoFrame(canvas, {
			timestamp: elapsedTime * 1000
		});

		videoEncoder.encode(frame, { keyFrame: true });
		frame.close();
	};

	const endRecording = async () => {
		//clearInterval(intervalId);
		is_recording = false;
		video_url = null;

		RECORD_MESSAGE = 'Encoding...';

		await videoEncoder.flush();
		muxer.finalize();

		RECORD_MESSAGE = 'Downloading...';

		let { buffer } = muxer.target;
		downloadBlob(new Blob([buffer]));
	};

	const downloadBlob = (blob: Blob) => {
		let url = window.URL.createObjectURL(blob);
		// window.URL.revokeObjectURL(url);

		video_url = url;
	};

	onMount(async () => {
		dragElement(settings, true);
		dragElement(canvas_container, false);

		gl = canvas.getContext('webgl', {
			premultipliedAlpha: false,
			willReadFrequently: true
		}) as WebGLRenderingContext;
		if (!gl) return console.error('No context');

		flow_field = await createFlowField();

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
			requestAnimationFrame(animate);

			delta_time = time - last_time;
			last_time = time;

			delta_time = 1000 / 480;

			position_array = [];
			color_array = [];

			interval += delta_time * 10;

			if (interval >= INTERVAL_LENGTH) interval = 0;

			if (is_recording) {
				FRAMES++;
			}

			for (let i = 0; i < lines.length; i++) {
				let line = lines[i];
				line.life -= delta_time;

				if (interval === 0) {
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
			}

			while (lines.length < LINE_COUNT) {
				createLine();
			}

			for (let i = 0; i < lines.length; i++) {
				let line = lines[i];

				// update position
				line.x += line.xv * line.speed * delta_time;
				line.y += line.yv * line.speed * delta_time;

				let flow_direction_data = getNearestFlowFieldDirection(flow_field, line.x, line.y);

				let r = flow_direction_data[0];
				let g = flow_direction_data[1];
				let b = flow_direction_data[2];

				let color = ((r + g + b) / (3 * 255)) * Math.PI * 2;

				line.xv += Math.sin(color) * 0.0001 * delta_time;
				line.yv += Math.cos(color) * 0.0001 * delta_time;

				line.xv *= 0.99 ** delta_time;
				line.yv *= 0.99 ** delta_time;

				line.color = chroma(r, g, b).gl(); // chroma((line.xv * 600) ** 2, (line.yv * 600)** 2, 0.5, 'hsl').gl();

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

						position_array.push(x, y);
						color_array.push(...trail.color);
						continue;
					}

					position_array.push(trail.x, trail.y);
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
			const aspect = canvas.width / canvas.height;
			m4.ortho(-aspect, aspect, 1, -1, -1, 1, uniforms.u_matrix);

			gl.useProgram(programInfo.program);
			twgl.setBuffersAndAttributes(gl, programInfo, bufferInfo);
			twgl.setUniforms(programInfo, uniforms);

			twgl.drawBufferInfo(gl, bufferInfo, gl.LINES);
			if (is_recording) {
				encodeVideoFrame();
			}
		};

		animate();
	});

	function dragElement(elmnt: HTMLElement, clamped: boolean = false) {
		var pos1 = 0,
			pos2 = 0,
			pos3 = 0,
			pos4 = 0;
		if (document?.getElementById(elmnt.id + 'header')) {
			// if present, the header is where you move the DIV from:
			document.getElementById(elmnt.id + 'header').onmousedown = dragMouseDown;
		} else {
			// otherwise, move the DIV from anywhere inside the DIV:
			elmnt.onmousedown = dragMouseDown;
		}

		function dragMouseDown(e: MouseEvent) {
			e = e || window.event;
			e.preventDefault();
			// get the mouse cursor position at startup:
			pos3 = e.clientX;
			pos4 = e.clientY;
			document.onmouseup = closeDragElement;
			// call a function whenever the cursor moves:
			document.onmousemove = clamped ? elementClampedDrag : elementDrag;
		}

		function elementClampedDrag(e: MouseEvent) {
			e = e || window.event;
			e.preventDefault();
			// calculate the new cursor position:
			pos1 = pos3 - e.clientX;
			pos2 = pos4 - e.clientY;
			pos3 = e.clientX;
			pos4 = e.clientY;
			// set the element's new position:
			elmnt.style.top = clamp(elmnt.offsetTop - pos2, 0, window.innerHeight - 40) + 'px'; //(elmnt.offsetTop - pos2) + 'px'
			elmnt.style.left =
				clamp(elmnt.offsetLeft - pos1, 0, window.innerWidth - elmnt.clientWidth) + 'px'; // (elmnt.offsetLeft - pos1) + 'px';
		}

		function elementDrag(e: MouseEvent) {
			e = e || window.event;
			e.preventDefault();
			// calculate the new cursor position:
			pos1 = pos3 - e.clientX;
			pos2 = pos4 - e.clientY;
			pos3 = e.clientX;
			pos4 = e.clientY;
			// set the element's new position:
			elmnt.style.top = elmnt.offsetTop - pos2 + 'px';
			elmnt.style.left = elmnt.offsetLeft - pos1 + 'px';
		}

		function closeDragElement() {
			// stop moving when mouse button is released:
			document.onmouseup = null;
			document.onmousemove = null;
		}
	}
</script>

<svelte:window
	on:resize={async () => {
		canvas.width = 2 * Math.floor(window.innerHeight);
		canvas.height = Math.floor(window.innerHeight);
		flow_field = await createFlowField();
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

<div
	class="w-screen h-screen flex flex-col justify-center overflow-clip relative"
	style="background-color: {`rgba(${rgba.r},${rgba.g},${rgba.b},${rgba.a})`};"
>
	<div
		id="canvas_container"
		bind:this={canvas_container}
		class="w-full h-full flex flex-col absolute"
	>
		<button
			id="canvas_containerheader"
			class="self-center z-40 w-full h-full fixed left-0 top-0 {moving
				? 'cursor-move'
				: 'cursor-pointer'}"
			on:mouseup={() => {
				moving = false;
			}}
			on:mousedown={() => {
				moving = true;
			}}
		/>
		<div
			class="w-screen h-screen relative flex flex-col justify-center"
			style="transform: scale({SCALE});"
		>
			<canvas
				bind:this={ff_canvas}
				class="z-0 absolute self-center h-screen"
				style="opacity: {OPACITY};"
			/>
			<canvas bind:this={canvas} id="canvas" class="z-10 absolute self-center h-screen" />
		</div>
	</div>
	<div class="z-40 w-screen h-screen absolute flex left-0 top-0 pointer-events-none">
		<div class="relative w-full h-full">
			<div
				bind:this={settings}
				id="settings"
				class="flex flex-col absolute bg-black border-2 border-zinc-300 w-72 h-fit !text-slate-300 z-50 pointer-events-auto outline outline-offset-0 outline-1 outline-black"
			>
				<button
					id="settingsheader"
					class="h-fit bg-slate-300 w-full py-1 flex justify-start {grabbing
						? 'cursor-grabbing'
						: 'cursor-grab'}"
					on:mouseup={() => {
						grabbing = false;
					}}
					on:mousedown={() => {
						grabbing = true;
					}}
				>
					<LucideGripVertical class="w-6 h-6 text-black" />
				</button>

				<div class="flex flex-col relative w-full gap-2 p-2">
					<div class="w-full flex flex-col gap-1">
						<span class="text-xs"> LINE COUNT </span>
						<div class="flex gap-2 justify-between w-full">
							<input
								type="range"
								min="0"
								max="400"
								class="self-center range range-xs"
								bind:value={line_count_bind}
							/>
							<span class="w-20">
								{LINE_COUNT}
							</span>
						</div>
					</div>

					<div class="w-full flex flex-col gap-1">
						<span class="text-xs"> TRAIL COUNT </span>
						<div class="flex gap-2 justify-between w-full">
							<input
								type="range"
								min="1"
								max="300"
								class="self-center range range-xs"
								bind:value={trail_count_bind}
							/>
							<span class="w-20">
								{TRAIL_COUNT}
							</span>
						</div>
					</div>

					<div class="w-full flex flex-col gap-1">
						<span class="text-xs"> SPEED </span>
						<div class="flex gap-2 justify-between w-full">
							<input
								type="range"
								min="0.0"
								max="10.0"
								step="0.0001"
								class="self-center range range-xs"
								bind:value={speed_bind}
							/>
							<span class="w-20">
								{SPEED}
							</span>
						</div>
					</div>

					<div class="w-full flex flex-col gap-1">
						<span class="text-xs"> SCALE </span>
						<div class="flex gap-2 justify-between w-full">
							<input
								type="range"
								min="0.0"
								max="2.0"
								step="0.0001"
								class="self-center range range-xs"
								bind:value={scale_bind}
							/>
							<span class="w-20">
								{SCALE}
							</span>
						</div>
					</div>

					<div class="w-full flex flex-col gap-1">
						<span class="text-xs"> FLOW FIELD RESOLUTION </span>
						<div class="flex gap-2 justify-between w-full">
							<input
								type="range"
								min="0"
								max="80"
								class="self-center range range-xs"
								bind:value={canvas_detail_bind}
							/>
							<span class="w-20">
								{CANVAS_DETAIL}
							</span>
						</div>
					</div>

					<div class="w-full flex flex-col gap-1">
						<span class="text-xs"> OPACITY </span>
						<div class="flex gap-2 justify-between w-full">
							<input
								type="range"
								min="0.0"
								max="1.0"
								step="0.0001"
								class="self-center range range-xs"
								bind:value={opacity_bind}
							/>
							<span class="w-20">
								{OPACITY}
							</span>
						</div>
					</div>

					<div class="flex flex-col gap-1">
						<span class="text-xs"> BACKGROUND COLOR </span>
						<div class="text-black bg-slate-300 p-1 rounded-md">
							<ColorPicker bind:rgb={rgba} />
						</div>
					</div>

					<div class="w-full flex flex-col gap-1">
						<span class="text-xs"> IMAGE </span>
						<div class="flex gap-2 justify-between w-full">
							<input
								type="file"
								class="file-input file-input-sm file-input-bordered w-full max-w-xs bg-black"
								bind:files
							/>
						</div>
					</div>

					<div class="flex flex-col gap-1 justify-between text-slate-300 px-1">
						<div>
							<span class="text-xs"> RENDER </span>
						</div>
						<div class="flex gap-1 justify-between">
							<div class="flex gap-1">
								<span class="self-center">
									{#if is_recording}
										<LucideCircleDot class="w-4 h-4 text-red-500" />
									{:else}
										<LucideMinus class="w-4 h-4" />
									{/if}
								</span>
								<div class="self-center flex">
									{#if is_recording}
										<span class="text-xs self-center">
											Frames: {FRAMES}
										</span>
									{:else}
										<span class="text-xs self-center">
											{#if video_url}
												<a class="text-slate-300" download="flow-field.webm" href={video_url}>
													Download
												</a>
											{:else}
												<span>{RECORD_MESSAGE}</span>
											{/if}
										</span>
									{/if}
								</div>
							</div>
							<button
								class="text-sm self-center"
								on:click={() => {
									if (is_recording) {
										endRecording();
									} else {
										startRecording();
									}
								}}
							>
								{#if is_recording}
									<span class="text-red-500"> Stop recording... </span>
								{:else}
									<span class="text-slate-300"> Start recording </span>
								{/if}
							</button>
						</div>
					</div>

					<div class="flex flex-col gap-1 justify-between text-slate-300 px-1 pb-1">
						<div class='flex'>
							<span class="text-xs">RECORDING FRAMERATE</span>
						</div>
						<div class='flex gap-2'>
							<button on:click={()=>{RECORD_FRAMERATE = 30}} class='{RECORD_FRAMERATE === 30 ? 'bg-slate-300 text-black' : 'bg-black outline-slate-300 outline-1 outline text-slate-300'} text-xs rounded-md px-2 p-1'>
								30 FPS
							</button>
							<button on:click={()=>{RECORD_FRAMERATE = 60}} class='{RECORD_FRAMERATE === 60 ? 'bg-slate-300 text-black' : 'bg-black outline-slate-300 outline-1 outline text-slate-300'} rounded-md px-2 p-1 text-xs'>
								60 FPS
							</button>
							<button on:click={()=>{RECORD_FRAMERATE = 120}} class='{RECORD_FRAMERATE === 120 ? 'bg-slate-300 text-black' : 'bg-black outline-slate-300 outline-1 outline text-slate-300'} rounded-md px-2 p-1 text-xs'>
								120 FPS
							</button>
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
