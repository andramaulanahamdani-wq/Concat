struct Params { gain: f32 }

// Brightness only, lifted by `gain` as an intensifier tube lifts it, then
// painted in the tube's green, with its noise and its round eyepiece -
// sized to the frame's short side, so it is round on any shape of frame.
fn effect(uv: vec2<f32>) -> vec4<f32> {
    let c = sample(uv);
    let gain = params.gain / 100.0;
    let level = pow(max(luma(c.rgb), 0.0), 1.0 / (1.0 + gain * 1.5));
    var out = vec3<f32>(level) * vec3<f32>(0.35, 1.0, 0.45);
    out = out + grain_at(uv, 0.06 + gain * 0.12);
    let d = length((uv - vec2<f32>(0.5)) * frame.size) / min(frame.size.x, frame.size.y);
    out = out * (1.0 - smoothstep(0.42, 0.62, d));
    return vec4<f32>(out, c.a);
}
