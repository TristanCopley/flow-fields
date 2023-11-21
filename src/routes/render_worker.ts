import chroma from 'chroma-js';

let LINE_COUNT = 50;
let TRAIL_COUNT = 10;
let INTERVAL_LENGTH = 10;
let SPEED = 1;
let interval = 0;

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

let position_array = [];
let color_array = [];

function createLine() {
	const trails = [];
	const x = Math.random() * 4 + -2;
	const y = Math.random() * 2 + -1;
	const color = [0, 0, 0, 1];

	for (let k = 0; k < Math.floor(Math.random() * TRAIL_COUNT + 1); k++) {
		const trail_1 = {
			x: x,
			y: y,
			color: color
		};
		trails.push(trail_1);

		const trail_2 = {
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

self.onmessage = (e: {
	data: {
		type: string;
		data: {
			[name: string]: any;
		};
	};
}) => {
	const { type, data } = e.data;

	if (type === 'update') {
		flow_field = data?.flow_field || flow_field;
		LINE_COUNT = data?.line_count || LINE_COUNT;
		TRAIL_COUNT = data?.trail_count || TRAIL_COUNT;
		SPEED = data?.speed || SPEED;

		lines = [];
	} else {
		const { delta_time } = data;

		position_array = [];
		color_array = [];

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
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
			const line = lines[i];

			// update position
			line.x += line.xv * line.speed * delta_time;
			line.y += line.yv * line.speed * delta_time;

			const flow_direction_data = getNearestFlowFieldDirection(flow_field, line.x, line.y);

			const r = flow_direction_data[0];
			const g = flow_direction_data[1];
			const b = flow_direction_data[2];

			const color = ((r + g + b) / (3 * 255)) * Math.PI * 2;

			line.xv += Math.sin(color) * 0.0001 * delta_time;
			line.yv += Math.cos(color) * 0.0001 * delta_time;

			line.xv *= 0.99 ** delta_time;
			line.yv *= 0.99 ** delta_time;

			line.color = chroma(r, g, b).gl(); // chroma((line.xv * 600) ** 2, (line.yv * 600)** 2, 0.5, 'hsl').gl();

			if (line.x > 2 || line.x < -2) {
				line.life = 0;
			}

			if (line.y > 1 || line.y < -1) {
				line.life = 0;
			}

			const a = 1 - interval / INTERVAL_LENGTH;

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
				const trail = line.trail[k];

				if (k + 1 === line.trail.length) {
					const x = a * trail.x + (1 - a) * line.trail[k - 1].x;
					const y = a * trail.y + (1 - a) * line.trail[k - 1].y;

					position_array.push(x, y);
					color_array.push(...trail.color);
					continue;
				}

				position_array.push(trail.x, trail.y);
				color_array.push(...trail.color);
			}
		}

		const f32_position_array = new Float32Array(position_array).buffer;
		const f32_color_array = new Float32Array(color_array).buffer;

		postMessage(
			{
				type: 'iterate',
				data: {
					f32_position_array_buffer: f32_position_array,
					f32_color_array_buffer: f32_color_array
				}
			},
			[f32_position_array, f32_color_array]
		);
	}

	/*
    let { type, delta_time } = e.data;

    if (type === 'flow_field') {

        let { data } = e.data;

        flow_field = data;


    } else {

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
    
        postMessage({
            type,
            data: {
                position_array,
                color_array
            }
        });

    }
    */
};
