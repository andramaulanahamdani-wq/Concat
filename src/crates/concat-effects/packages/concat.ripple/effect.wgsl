struct Params { amount: f32 }
fn transition(uv: vec2<f32>, progress: f32) -> vec4<f32> {
    let k = sin(progress * 3.14159);
    let c = (uv - vec2<f32>(0.5)) * vec2<f32>(frame.size.x / frame.size.y, 1.0);
    let d = length(c);
    let wave = sin(d * 40.0 - progress * 30.0) * 0.012 * k * params.amount * 0.02;
    let dir = select(c / d, vec2<f32>(0.0), d < 0.0001);
    let off = dir * wave / vec2<f32>(frame.size.x / frame.size.y, 1.0);
    return mix(from_at(uv + off), to_at(uv + off), smoothstep(0.0, 1.0, progress));
}
