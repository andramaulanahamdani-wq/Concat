struct Params { softness: f32 }
fn transition(uv: vec2<f32>, progress: f32) -> vec4<f32> {
    let p = smoothstep(0.0, 1.0, progress);
    let a = (uv - vec2<f32>(0.5)) * vec2<f32>(frame.size.x / frame.size.y, 1.0);
    let aspect = frame.size.x / frame.size.y;
    let d = (abs(a.x) + abs(a.y)) / (0.5 * aspect + 0.5);
    let soft = max(params.softness * 0.01, 0.01);
    let m = smoothstep(p * 1.1 - soft, p * 1.1 + soft, d);
    return mix(to_at(uv), from_at(uv), m);
}
