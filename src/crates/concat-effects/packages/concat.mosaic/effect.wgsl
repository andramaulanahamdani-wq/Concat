struct Params { size: f32 }
fn transition(uv: vec2<f32>, progress: f32) -> vec4<f32> {
    let k = sin(progress * 3.14159);
    let tiles = mix(frame.size.y, 6.0 + (1.0 - params.size * 0.01) * 20.0, k);
    let cell = vec2<f32>(tiles * frame.size.x / frame.size.y, tiles);
    let q = (floor(uv * cell) + vec2<f32>(0.5)) / cell;
    return mix(from_at(q), to_at(q), smoothstep(0.35, 0.65, progress));
}
