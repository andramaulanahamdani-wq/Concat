struct Params { zoom: f32, direction: f32, duration: f32 }

// The picture enlarged, then moved within the room that leaves, on the
// clip's own clock: the move starts with the clip wherever it sits on the
// timeline, eases in and out, and holds once `duration` has passed. Every
// read stays inside the picture, so no edge is ever pulled into view.
fn effect(uv: vec2<f32>) -> vec4<f32> {
    let z = params.zoom / 100.0;
    let p = smoothstep(0.0, 1.0, clamp(frame.clip_time / max(params.duration, 0.1), 0.0, 1.0));
    var scale = 1.0 + z;
    var shift = vec2<f32>(0.0);
    let room = 0.5 - 0.5 / scale;
    if (params.direction < 0.5) {
        scale = 1.0 + z * p;
    } else if (params.direction < 1.5) {
        scale = 1.0 + z * (1.0 - p);
    } else if (params.direction < 2.5) {
        shift = vec2<f32>(mix(room, -room, p), 0.0);
    } else if (params.direction < 3.5) {
        shift = vec2<f32>(mix(-room, room, p), 0.0);
    } else if (params.direction < 4.5) {
        shift = vec2<f32>(0.0, mix(room, -room, p));
    } else {
        shift = vec2<f32>(0.0, mix(-room, room, p));
    }
    return sample(vec2<f32>(0.5) + (uv - vec2<f32>(0.5)) / scale + shift);
}
