fn transition(uv: vec2<f32>, progress: f32) -> vec4<f32> {
    let p = smoothstep(0.0, 1.0, progress);
    let s = 1.0 - p * 0.6;
    let q = vec2<f32>(0.5) + (uv - vec2<f32>(0.5)) / s;
    let inside = all(q >= vec2<f32>(0.0)) && all(q <= vec2<f32>(1.0));
    let out = select(to_at(uv), from_at(q), inside);
    return mix(out, to_at(uv), smoothstep(0.5, 1.0, progress));
}
