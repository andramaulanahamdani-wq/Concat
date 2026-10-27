
// Value noise from the prelude's hash: smooth, the same on every GPU.
fn vnoise(p: vec2<f32>) -> f32 {
    let i = floor(p);
    let f = fract(p);
    let u = f * f * (vec2<f32>(3.0) - 2.0 * f);
    let a = hash(i, 0.0);
    let b = hash(i + vec2<f32>(1.0, 0.0), 0.0);
    let c = hash(i + vec2<f32>(0.0, 1.0), 0.0);
    let d = hash(i + vec2<f32>(1.0, 1.0), 0.0);
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// Four octaves of it, 0..1.
fn fbm(p: vec2<f32>) -> f32 {
    var sum = 0.0;
    var amp = 0.5;
    var q = p;
    for (var i: i32 = 0; i < 4; i++) {
        sum += amp * vnoise(q);
        q = q * 2.03 + vec2<f32>(17.0, 9.0);
        amp *= 0.5;
    }
    return sum / 0.9375;
}
fn transition(uv: vec2<f32>, progress: f32) -> vec4<f32> {
    let n = fbm(uv * vec2<f32>(frame.size.x / frame.size.y, 1.0) * 3.0);
    let t = progress * 1.2 - 0.1;
    let gone = smoothstep(t - 0.02, t + 0.02, n);
    let ember = (1.0 - smoothstep(0.0, 0.06, abs(n - t))) * step(0.02, progress) * step(progress, 0.98);
    var out = mix(to_at(uv), from_at(uv), gone);
    out = vec4<f32>(out.rgb + vec3<f32>(3.0, 0.9, 0.15) * ember, out.a);
    return out;
}
