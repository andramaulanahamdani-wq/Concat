fn transition(uv: vec2<f32>, progress: f32) -> vec4<f32> {
    let red = vec4<f32>(0.25, 0.0, 0.0, 1.0);
    if (progress < 0.5) {
        return mix(from_at(uv), red, smoothstep(0.0, 0.5, progress));
    }
    return mix(red, to_at(uv), smoothstep(0.5, 1.0, progress));
}
