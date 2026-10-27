struct Params { softness: f32 }
fn transition(uv: vec2<f32>, progress: f32) -> vec4<f32> {
    let p = smoothstep(0.0, 1.0, progress);
    let d = abs(uv.x - 0.5) * 2.0;
    let soft = max(params.softness * 0.005, 0.002);
    let m = smoothstep(p - soft, p + soft, d);
    return mix(to_at(uv), from_at(uv), m);
}
