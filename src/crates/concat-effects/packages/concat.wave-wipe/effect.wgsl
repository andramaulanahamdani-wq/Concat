struct Params { softness: f32 }
fn transition(uv: vec2<f32>, progress: f32) -> vec4<f32> {
    let p = smoothstep(0.0, 1.0, progress) * 1.2 - 0.1;
    let edge = p + sin(uv.y * 18.0 + progress * 6.0) * 0.04;
    let soft = max(params.softness * 0.003, 0.002);
    let m = smoothstep(edge - soft, edge + soft, uv.x);
    return mix(to_at(uv), from_at(uv), m);
}
