struct Params { amount: f32 }
fn transition(uv: vec2<f32>, progress: f32) -> vec4<f32> {
    let k = sin(progress * 3.14159);
    let n = hash(floor(uv * frame.size * 0.5), fract(progress * 13.7));
    let row = hash(vec2<f32>(floor(uv.y * 60.0), floor(progress * 30.0)), 2.0);
    let snow = vec4<f32>(vec3<f32>(n * (0.6 + row * 0.6)), 1.0);
    let base = select(from_at(uv), to_at(uv), progress >= 0.5);
    return mix(base, snow, clamp(k * params.amount * 0.012, 0.0, 1.0));
}
