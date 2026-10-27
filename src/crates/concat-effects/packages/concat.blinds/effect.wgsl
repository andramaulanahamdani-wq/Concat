struct Params { slats: f32 }
fn transition(uv: vec2<f32>, progress: f32) -> vec4<f32> {
    let p = smoothstep(0.0, 1.0, progress);
    let band = fract(uv.y * params.slats);
    let m = step(p, band);
    return mix(to_at(uv), from_at(uv), m);
}
