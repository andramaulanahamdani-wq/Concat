fn transition(uv: vec2<f32>, progress: f32) -> vec4<f32> {
    let p = smoothstep(0.0, 1.0, progress);
    if (uv.x < p) {
        return to_at(vec2<f32>(uv.x / max(p, 0.0001), uv.y));
    }
    return from_at(vec2<f32>((uv.x - p) / max(1.0 - p, 0.0001), uv.y));
}
