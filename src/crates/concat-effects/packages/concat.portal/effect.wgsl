fn transition(uv: vec2<f32>, progress: f32) -> vec4<f32> {
    let a = frame.size.x / frame.size.y;
    let c = (uv - vec2<f32>(0.5)) * vec2<f32>(a, 1.0);
    let d = length(c);
    let r = smoothstep(0.0, 1.0, progress) * (0.5 * sqrt(a * a + 1.0) + 0.1);
    let turn = (1.0 - smoothstep(0.0, r + 0.001, d)) * (1.0 - progress) * 3.0;
    let s = sin(turn);
    let co = cos(turn);
    let w = vec2<f32>(c.x * co - c.y * s, c.x * s + c.y * co) / vec2<f32>(a, 1.0) + vec2<f32>(0.5);
    let inside = 1.0 - smoothstep(r - 0.02, r + 0.02, d);
    let ring = (1.0 - smoothstep(0.0, 0.03, abs(d - r))) * sin(progress * 3.14159);
    var out = mix(from_at(uv), to_at(w), inside);
    return vec4<f32>(out.rgb + vec3<f32>(0.6, 0.35, 1.4) * ring, out.a);
}
